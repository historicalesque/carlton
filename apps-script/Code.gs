/**
 * Common Ground: receives entries from the contribution form
 * (_layouts/form.html) and turns each one into a pull request.
 *
 * The form builds the entry as TEI in the browser and POSTs
 *   { formVersion: 3, xml, targetId, website }
 * as text/plain JSON (text/plain avoids a CORS preflight, which Apps Script
 * can't answer). This script:
 *   1. rejects anything malformed, oversized, or with the honeypot filled in;
 *   2. sets the file name, the entry id and the date itself;
 *   3. saves a row to the "TEI submissions" tab of the Sheet it's attached to;
 *   4. opens a pull request on GitHub with the file in civic/.
 *
 * Editors then decide in the Sheet: each row has a Decision dropdown
 * (Accept / Reject). A minute after someone picks one, the script merges or
 * closes that pull request (see "Decisions" below), so editors never need
 * GitHub.
 *
 * Setup is in apps-script/README.md. The GitHub token lives in Script
 * properties (GITHUB_TOKEN), never in this file.
 */

const SETTINGS = {
  repo: 'historicalesque/carlton',
  site: 'https://historicalesque.github.io/carlton',
  base: 'main',
  folder: 'civic',
  sheetName: 'TEI submissions',
  maxBytes: 500 * 1024,
  maxPerHour: 20,
  timeZone: 'Australia/Melbourne',
  // How long a decision waits before it runs, so a mis-tap can be undone
  graceMs: 60 * 1000
};
// The submissions tab's columns, in order. The Sheet is read by header name,
// so setUp() can add missing columns to a Sheet made by an older version.
const COLUMNS = ['Received', 'Kind', 'Title', 'Type', 'Authors', 'Review', 'Decision', 'Reason (editors only)',
  'Status', 'File', 'Pull request', 'Version', 'TEI'];
const PENDING = { Accept: 'Publishing in about a minute. Clear Decision to cancel.', Reject: 'Rejecting in about a minute. Clear Decision to cancel.' };
const TEI_NS = 'http://www.tei-c.org/ns/1.0';
// A Sheet cell holds 50,000 characters; the pull request keeps the full copy
const CELL_LIMIT = 49000;

function doGet() {
  return ContentService.createTextOutput('Common Ground submissions: send entries with POST.');
}

function doPost(e) {
  try {
    return reply_(receive_(e));
  } catch (err) {
    console.error(err);
    return reply_({ status: 'error', message: err.userMessage || 'Something went wrong on our side. Please try again later, or download your entry and email it to us.' });
  }
}

function receive_(e) {
  const raw = (e && e.postData && e.postData.contents) || '';
  if (!raw) throw userError_('Nothing was sent.');
  if (Utilities.newBlob(raw).getBytes().length > SETTINGS.maxBytes) throw userError_('This entry is too large to send. Try removing pasted images or very long tables.');

  let data;
  try { data = JSON.parse(raw); } catch (err) { throw userError_('The form sent something we could not read.'); }
  // Honeypot: a hidden field people never see, which bots tend to fill in.
  // Pretend it worked so they don't try again.
  if (data.website) return { status: 'success' };
  if (typeof data.xml !== 'string' || !data.xml.trim()) throw userError_('The entry was empty.');

  let doc;
  try { doc = XmlService.parse(data.xml); } catch (err) { throw userError_('The entry was not valid XML.'); }
  const root = doc.getRootElement();
  if (root.getName() !== 'TEI' || root.getNamespace().getURI() !== TEI_NS) throw userError_('The entry was not in the expected format.');

  const tei = XmlService.getNamespace(TEI_NS);
  const header = root.getChild('teiHeader', tei);
  const titleEl = header && header.getChild('fileDesc', tei) && header.getChild('fileDesc', tei).getChild('titleStmt', tei);
  const title = titleEl && titleEl.getChild('title', tei) ? titleEl.getChild('title', tei).getText().trim() : '';
  if (!title) throw userError_('Add a title.');
  const authors = titleEl.getChildren('author', tei).map((a) => a.getText().trim()).filter(String);
  if (!authors.length) throw userError_('Add your name.');

  // The file name follows the site's rule for ?id= (see slugifyId in
  // scripts/map-common.js), so the entry page and the map can find it.
  // The form sends the record's text id when there is one, else the title.
  const slug = slugify_(typeof data.targetId === 'string' && data.targetId.trim() ? data.targetId : title);
  if (!slug) throw userError_('The title needs at least one letter or number.');

  checkRate_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const today = Utilities.formatDate(new Date(), SETTINGS.timeZone, 'yyyy-MM-dd');
    // Small text edits rather than re-serialising, so the article's spacing
    // and the xml-model line stay exactly as the form wrote them.
    const xml = data.xml
      .replace(/(<idno type="entry">)[^<]*(<\/idno>)/, `$1${escapeXml_(slug)}$2`)
      .replace(/(<change\b[^>]*\bwhen=")[^"]*(")/g, `$1${today}$2`);

    const pr = openPullRequest_(slug, title, authors, xml);
    saveRow_({
      'Received': new Date(),
      'Kind': pr.isNew ? 'New entry' : 'New version',
      'Title': title,
      'Type': root.getAttribute('type') ? root.getAttribute('type').getValue() : '',
      'Authors': authors.join(', '),
      'Review': reviewLink_(pr.number),
      'Status': 'Waiting',
      'File': `${SETTINGS.folder}/${slug}.xml`,
      'Pull request': pr.url,
      'Version': pr.version,
      'TEI': xml.length > CELL_LIMIT ? xml.slice(0, CELL_LIMIT) + ' …' : xml
    });
    return { status: 'success', pr: pr.url };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- GitHub ---------- */

function openPullRequest_(slug, title, authors, xml) {
  const path = `${SETTINGS.folder}/${slug}.xml`;
  const baseSha = github_('get', `/git/ref/heads/${SETTINGS.base}`).object.sha;
  const existing = github_('get', `/contents/${encodePath_(path)}?ref=${SETTINGS.base}`, null, true);
  const isNew = !existing;
  const stamp = Utilities.formatDate(new Date(), SETTINGS.timeZone, 'yyyyMMdd-HHmmss');
  const branch = `submission/${slug}-${stamp}`;

  github_('post', '/git/refs', { ref: `refs/heads/${branch}`, sha: baseSha });
  const put = {
    message: `${isNew ? 'New entry' : 'New version of'}: ${title}`,
    content: Utilities.base64Encode(xml, Utilities.Charset.UTF_8),
    branch
  };
  if (existing) put.sha = existing.sha;
  const commit = github_('put', `/contents/${encodePath_(path)}`, put).commit;

  const body = [
    `Submitted through the contribution form by ${authors.join(', ')}.`,
    '',
    isNew
      ? `This adds a new entry, \`${path}\`.`
      : `This is a new version of \`${path}\`. **Merging replaces the current entry**, so check the "Files changed" tab and keep anything the new version leaves out.`,
    '',
    'The editors accept or reject this in the submissions Sheet (the Decision column), which merges or closes it.'
  ].join('\n');
  const pr = github_('post', '/pulls', { title: `${isNew ? 'New entry' : 'New version of'}: ${title}`, head: branch, base: SETTINGS.base, body });
  return { url: pr.html_url, number: pr.number, version: commit.sha, isNew };
}

function github_(method, path, payload, allow404, allowConflict) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN is not set in Script properties.');
  const res = UrlFetchApp.fetch(`https://api.github.com/repos/${SETTINGS.repo}${path}`, {
    method,
    contentType: 'application/json',
    payload: payload ? JSON.stringify(payload) : undefined,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (allow404 && code === 404) return null;
  // Merging answers 405 when the pull request can't be merged, 409 when its head moved
  if (allowConflict && (code === 405 || code === 409)) return { conflict: true };
  if (code >= 300) throw new Error(`GitHub ${method.toUpperCase()} ${path} failed (${code}): ${res.getContentText().slice(0, 500)}`);
  return JSON.parse(res.getContentText() || '{}');
}

/* ---------- Sheet ---------- */

function submissionsSheet_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  return book.getSheetByName(SETTINGS.sheetName) || book.insertSheet(SETTINGS.sheetName);
}

// Makes sure every column in COLUMNS exists, adding any that are missing in
// their place, and returns { header name: column number }.
function columns_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  let header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  COLUMNS.forEach((name, i) => {
    if (header.indexOf(name) !== -1) return;
    // After the nearest earlier column that exists, or first
    let after = 0;
    for (let j = i - 1; j >= 0; j--) {
      const at = header.indexOf(COLUMNS[j]);
      if (at !== -1) { after = at + 1; break; }
    }
    if (after === 0) sheet.insertColumnBefore(1); else sheet.insertColumnAfter(after);
    sheet.getRange(1, after + 1).setValue(name).setFontWeight('bold');
    header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  });
  const map = {};
  header.forEach((name, i) => { if (name) map[name] = i + 1; });
  return map;
}

function saveRow_(values) {
  const sheet = submissionsSheet_();
  const cols = columns_(sheet);
  const row = new Array(sheet.getLastColumn()).fill('');
  Object.keys(values).forEach((name) => { if (cols[name]) row[cols[name] - 1] = values[name]; });
  sheet.appendRow(row);
  sheet.getRange(sheet.getLastRow(), cols['Decision']).setDataValidation(decisionRule_());
}

function reviewLink_(number) {
  return `=HYPERLINK("${SETTINGS.site}/admin/review.html?pr=${number}", "Open")`;
}

function decisionRule_() {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(['Accept', 'Reject'], true)
    .setAllowInvalid(false)
    .setHelpText('Accept publishes this entry on the site. Reject turns it down. Either runs a minute later; clear the cell before then to cancel.')
    .build();
}

/* ---------- Decisions ---------- */

// Run once from the script editor (select setUp, then Run). It adds the new
// columns and the Decision dropdowns, fills in Review links and Status for
// rows sent before this version, and switches on the edit trigger. Safe to
// run again.
function setUp() {
  const sheet = submissionsSheet_();
  const cols = columns_(sheet);
  const last = sheet.getLastRow();
  if (last > 1) {
    sheet.getRange(2, cols['Decision'], last - 1, 1).setDataValidation(decisionRule_());
    const data = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
    data.forEach((r, i) => {
      const number = prNumber_(r[cols['Pull request'] - 1]);
      if (!number) return;
      if (!r[cols['Review'] - 1]) sheet.getRange(i + 2, cols['Review']).setFormula(reviewLink_(number));
      if (r[cols['Status'] - 1]) return;
      const pr = github_('get', `/pulls/${number}`, null, true);
      const status = !pr ? 'Not found on GitHub'
        : pr.merged_at ? 'Published (on GitHub)'
        : pr.state === 'closed' ? 'Rejected (closed on GitHub)'
        : 'Waiting';
      sheet.getRange(i + 2, cols['Status']).setValue(status);
    });
  }
  // Colour the decisions so they stand out
  const decisions = sheet.getRange(2, cols['Decision'], sheet.getMaxRows() - 1, 1);
  const rules = sheet.getConditionalFormatRules().filter((rule) =>
    !rule.getRanges().some((r) => r.getColumn() === cols['Decision']));
  rules.push(
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Accept').setBackground('#D4EDBC').setFontColor('#11734B').setRanges([decisions]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Reject').setBackground('#FFCFC9').setFontColor('#B10202').setRanges([decisions]).build());
  sheet.setConditionalFormatRules(rules);

  // The edit trigger runs as whoever ran setUp, so editors never see a
  // permissions screen. A plain onEdit() can't reach GitHub, hence this.
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'onDecision')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onDecision').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onEdit().create();
  console.log('Set up: Decision column ready and the edit trigger is on.');
}

// Runs on every edit of the Sheet. Only changes to the Decision column do
// anything: they mark the row as waiting a minute, and schedule a run.
function onDecision(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SETTINGS.sheetName) return;
  const cols = columns_(sheet);
  if (e.range.getColumn() > cols['Decision'] || e.range.getLastColumn() < cols['Decision']) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    let scheduled = false;
    for (let row = Math.max(e.range.getRow(), 2); row <= e.range.getLastRow(); row++) {
      const decision = sheet.getRange(row, cols['Decision']).getValue();
      const statusCell = sheet.getRange(row, cols['Status']);
      const status = String(statusCell.getValue());
      const number = prNumber_(sheet.getRange(row, cols['Pull request']).getValue());
      if (!number) continue;
      // Already decided: put the decision back to match what happened
      if (/^(Published|Rejected)/.test(status)) {
        sheet.getRange(row, cols['Decision']).setValue(/^Published/.test(status) ? 'Accept' : 'Reject');
        continue;
      }
      if (PENDING[decision]) {
        statusCell.setValue(PENDING[decision]);
        props.setProperty(`due-${number}`, String(Date.now() + SETTINGS.graceMs));
        scheduled = true;
      } else {
        props.deleteProperty(`due-${number}`);
        if (Object.values(PENDING).includes(status)) statusCell.setValue('Waiting');
      }
    }
    if (scheduled) schedule_(SETTINGS.graceMs + 5000);
  } finally {
    lock.releaseLock();
  }
}

// Runs a minute after a decision (a one-off timer set by onDecision). Carries
// out every decision whose minute is up, then sets a new timer for any that
// are still waiting.
function processDecisions() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ScriptApp.getProjectTriggers()
      .filter((t) => t.getHandlerFunction() === 'processDecisions')
      .forEach((t) => ScriptApp.deleteTrigger(t));
    const sheet = submissionsSheet_();
    const cols = columns_(sheet);
    const props = PropertiesService.getScriptProperties();
    const last = sheet.getLastRow();
    if (last < 2) return;
    const data = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
    let nextDue = Infinity;
    data.forEach((r, i) => {
      const row = i + 2;
      const decision = r[cols['Decision'] - 1];
      if (!PENDING[decision] || r[cols['Status'] - 1] !== PENDING[decision]) return;
      const number = prNumber_(r[cols['Pull request'] - 1]);
      const due = Number(props.getProperty(`due-${number}`) || 0);
      if (due > Date.now()) { nextDue = Math.min(nextDue, due); return; }
      let status;
      try {
        status = decide_(number, decision, r[cols['Version'] - 1], r[cols['Title'] - 1], row);
      } catch (err) {
        console.error(err);
        status = `Couldn't ${decision === 'Accept' ? 'publish' : 'reject'}: ${err.userMessage || 'something went wrong. Pick again to retry, or ask Mitchell.'}`;
        sheet.getRange(row, cols['Decision']).clearContent();
      }
      props.deleteProperty(`due-${number}`);
      const cell = sheet.getRange(row, cols['Status']);
      if (status.formula) cell.setFormula(status.formula); else cell.setValue(status);
    });
    if (nextDue !== Infinity) schedule_(nextDue - Date.now() + 5000);
  } finally {
    lock.releaseLock();
  }
}

function schedule_(ms) {
  const already = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'processDecisions');
  if (!already) ScriptApp.newTrigger('processDecisions').timeBased().after(Math.max(ms, 60000)).create();
}

// Merges (Accept) or closes (Reject) one submission's pull request, after
// checking it is a form submission: open, from a submission/ branch in this
// repository, changing only entry files in civic/.
function decide_(number, decision, version, title, row) {
  const pr = github_('get', `/pulls/${number}`, null, true);
  if (!pr) throw userError_('the pull request was not found.');
  if (pr.merged_at) return 'Published (already, on GitHub)';
  if (pr.state === 'closed') return 'Rejected (already closed on GitHub)';
  const files = github_('get', `/pulls/${number}/files?per_page=100`);
  const fromForm = pr.head.repo && pr.head.repo.full_name === SETTINGS.repo
    && /^submission\//.test(pr.head.ref) && pr.base.ref === SETTINGS.base
    && files.length > 0 && files.every((f) => f.filename.indexOf(`${SETTINGS.folder}/`) === 0 && /\.xml$/.test(f.filename));
  if (!fromForm) throw userError_('this is not a form submission, so it has to be handled on GitHub.');
  const when = Utilities.formatDate(new Date(), SETTINGS.timeZone, 'dd/MM HH:mm');

  if (decision === 'Reject') {
    github_('patch', `/pulls/${number}`, { state: 'closed' });
    deleteBranch_(pr.head.ref);
    return `Rejected ${when}`;
  }

  // Publish exactly the version on this row, even if the branch has moved on since
  let head = pr.head.sha;
  if (version && version !== head) {
    files.forEach((f) => {
      const path = encodePath_(f.filename);
      const wanted = github_('get', `/contents/${path}?ref=${version}`);
      const current = github_('get', `/contents/${path}?ref=${encodeURIComponent(pr.head.ref)}`);
      if (wanted.sha === current.sha) return;
      head = github_('put', `/contents/${path}`, {
        message: `Put back the version accepted in the Sheet (row ${row})`,
        content: wanted.content.replace(/\n/g, ''),
        sha: current.sha,
        branch: pr.head.ref
      }).commit.sha;
    });
  }
  const merge = github_('put', `/pulls/${number}/merge`, {
    merge_method: 'squash',
    sha: head,
    commit_title: `Accept: ${title} (#${number})`,
    commit_message: `Accepted in the submissions Sheet (row ${row}).`
  }, false, true);
  if (merge.conflict) throw userError_('the entry changed on the site after this was sent, so it can\'t be published as it is. Ask Mitchell.');
  deleteBranch_(pr.head.ref);
  const entry = files[0].filename.replace(`${SETTINGS.folder}/`, '').replace(/\.xml$/, '');
  return { formula: `=HYPERLINK("${SETTINGS.site}/civic?id=${encodeURIComponent(entry)}", "Published ${when}")` };
}

function deleteBranch_(ref) {
  try {
    github_('delete', `/git/refs/heads/${encodePath_(ref)}`);
  } catch (err) {
    console.warn(`Couldn't delete branch ${ref}: ${err.message}`);
  }
}

function prNumber_(url) {
  const m = String(url || '').match(/\/pull\/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/* ---------- Helpers ---------- */

// A rough flood guard: at most SETTINGS.maxPerHour submissions an hour
function checkRate_() {
  const cache = CacheService.getScriptCache();
  const key = 'count-' + Utilities.formatDate(new Date(), SETTINGS.timeZone, 'yyyyMMddHH');
  const count = Number(cache.get(key) || 0);
  if (count >= SETTINGS.maxPerHour) throw userError_('We are getting a lot of submissions right now. Please try again in an hour.');
  cache.put(key, String(count + 1), 3600);
}

function slugify_(text) {
  return String(text).trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .replace(/--+/g, '-');
}

function encodePath_(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function escapeXml_(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function userError_(message) {
  return Object.assign(new Error(message), { userMessage: message });
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run this once from the editor (select it, then Run) to check the token
// and the repository before deploying.
function testSetup() {
  const repo = UrlFetchApp.fetch(`https://api.github.com/repos/${SETTINGS.repo}`, {
    headers: { Authorization: `Bearer ${PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN')}` },
    muteHttpExceptions: true
  });
  const info = JSON.parse(repo.getContentText());
  console.log(repo.getResponseCode() === 200
    ? `OK: can reach ${info.full_name}; push access: ${info.permissions && info.permissions.push}`
    : `Problem (${repo.getResponseCode()}): ${repo.getContentText().slice(0, 300)}`);
}
