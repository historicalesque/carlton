/**
 * Common Ground: receives entries from the contribution form
 * (_layouts/form.html) and turns each one into a pull request.
 *
 * The form builds the entry as TEI in the browser and POSTs
 *   { formVersion: 3, xml, targetId, records, newEntry, website }
 * as text/plain JSON (text/plain avoids a CORS preflight, which Apps Script
 * can't answer). This script:
 *   1. rejects anything malformed, oversized, or with the honeypot filled in;
 *   2. sets the file name, the entry id and the date itself;
 *   3. saves a row to the "TEI submissions" tab of the Sheet it's attached to;
 *   4. opens a pull request on GitHub with the file in civic/.
 * `records` are the numbered directory and electoral-roll records the entry
 * is about. They wait in the row's Records column; when the entry is
 * accepted, they're given the entry's id (see "Linking records" below).
 *
 * Anyone can also suggest changes to a submission from the review page
 * ({ action: "review", pr, xml, reviewer, note }). The script commits that
 * version to the same pull request and updates the submission's row, so
 * accepting it publishes the latest version.
 *
 * Editors then decide in the Sheet: each row has a Decision dropdown
 * (Accept / Reject). As soon as someone picks one, the script merges or
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
  dataName: 'Data changes',
  maxBytes: 500 * 1024,
  maxPerHour: 20,
  timeZone: 'Australia/Melbourne'
};
// The submissions tab's columns, in order. The Sheet is read by header name,
// so setUp() can add missing columns to a Sheet made by an older version.
// "Suggested changes" lists the changes made to a submission since it was
// sent, one line each: who, when and what.
const COLUMNS = ['Received', 'Kind', 'Title', 'Type', 'Authors', 'Suggested changes', 'Records', 'Review', 'Decision',
  'Reason (editors only)', 'Status', 'File', 'Pull request', 'Version', 'TEI'];
// Shown in Status while a decision is being carried out
const PENDING = { Accept: 'Publishing…', Reject: 'Rejecting…' };
const TEI_NS = 'http://www.tei-c.org/ns/1.0';
// A Sheet cell holds 50,000 characters; the pull request keeps the full copy
const CELL_LIMIT = 49000;

// Which version of this script is running. Opening the web app's address
// (contribution_endpoint in _config.yml) shows it, so it's easy to check
// that the form talks to the latest deployment.
const SCRIPT_VERSION = '2026-10-10: suggested changes update the submission\'s row';

function doGet() {
  return ContentService.createTextOutput(`Common Ground submissions: send entries with POST.\nVersion ${SCRIPT_VERSION}`);
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
  if (data.action === 'data') return receiveData_(data);
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
  if (data.action === 'review') return receiveReview_(data, title);

  // The file name follows the site's rule for ?id= (see slugifyId in
  // scripts/map-common.js), so the entry page and the map can find it.
  // The form sends the record's text id when there is one, else the title.
  const slug = slugify_(typeof data.targetId === 'string' && data.targetId.trim() ? data.targetId : title);
  if (!slug) throw userError_('The title needs at least one letter or number.');

  // Numbered records only: text ids were linked by the team already
  const records = (Array.isArray(data.records) ? data.records : [])
    .map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);

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

    const pr = openPullRequest_(slug, title, authors, xml, { mustBeNew: data.newEntry === true, records });
    saveRow_('submissions', {
      'Received': new Date(),
      'Kind': pr.isNew ? 'New entry' : 'New version',
      'Title': title,
      'Type': root.getAttribute('type') ? root.getAttribute('type').getValue() : '',
      'Authors': authors.join(', '),
      'Records': records.join(', '),
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

function openPullRequest_(slug, title, authors, xml, { mustBeNew, records }) {
  const path = `${SETTINGS.folder}/${slug}.xml`;
  const baseSha = github_('get', `/git/ref/heads/${SETTINGS.base}`).object.sha;
  const existing = github_('get', `/contents/${encodePath_(path)}?ref=${SETTINGS.base}`, null, true);
  const isNew = !existing;
  // A new entry named after its title mustn't replace another entry
  if (mustBeNew && existing) throw userError_(`There is already an entry called "${slug.replace(/-/g, ' ')}". Choose a different title, or open that entry and add to it there.`);
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
    ...(records.length ? [`When it's accepted, these records are linked to the entry (their \`entityID\` becomes the entry's id): ${records.join(', ')}.`, ''] : []),
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

/* ---------- Suggested changes ---------- */

// A new version of an open submission, sent from the review page. It goes on
// the same pull request as a new commit; its row records which
// The submission's row then points at it (Version, TEI) and lists it under
// "Suggested changes", so one row and one decision cover every version, and
// Accept publishes the latest. Earlier versions stay on the review page.
function receiveReview_(data, title) {
  const number = Number(data.pr);
  const reviewer = String(data.reviewer || '').trim().slice(0, 100);
  const note = String(data.note || '').trim().slice(0, 500);
  if (!number) throw userError_('The form did not say which submission this changes.');
  if (!reviewer) throw userError_('Add your name.');

  checkRate_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const { pr, entry } = submission_(number);
    if (pr.state !== 'open') throw userError_('This submission has already been decided, so it can no longer be changed.');
    const path = entry.filename;
    const slug = path.replace(`${SETTINGS.folder}/`, '').replace(/\.xml$/, '');
    // Keep the entry's id; date only the newest change (the form keeps the earlier ones)
    let xml = data.xml.replace(/(<idno type="entry">)[^<]*(<\/idno>)/, `$1${escapeXml_(slug)}$2`);
    const last = xml.lastIndexOf('<change');
    if (last !== -1) {
      const today = Utilities.formatDate(new Date(), SETTINGS.timeZone, 'yyyy-MM-dd');
      xml = xml.slice(0, last) + xml.slice(last).replace(/(<change\b[^>]*\bwhen=")[^"]*(")/, `$1${today}$2`);
    }

    const current = github_('get', `/contents/${encodePath_(path)}?ref=${encodeURIComponent(pr.head.ref)}`);
    const commit = github_('put', `/contents/${encodePath_(path)}`, {
      message: `Suggested changes by ${reviewer}${note ? `: ${note}` : ''}`,
      content: Utilities.base64Encode(xml, Utilities.Charset.UTF_8),
      sha: current.sha,
      branch: pr.head.ref
    }).commit;

    const subs = tab_('submissions');
    const cols = columns_(subs, COLUMNS);
    rowsFor_(subs, cols, number).forEach((row) => addChange_(subs, cols, row, {
      who: reviewer, note, when: new Date(), version: commit.sha, xml
    }));
    return { status: 'success', version: commit.sha };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Sheet ---------- */

const TABS = {
  submissions: { name: () => SETTINGS.sheetName, columns: COLUMNS },
  // Changes from the data editor (see "Data changes" below)
  data: { name: () => SETTINGS.dataName, get columns() { return DATA_COLUMNS; } }
};

function tab_(key) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const name = TABS[key].name();
  return book.getSheetByName(name) || book.insertSheet(name);
}
function submissionsSheet_() {
  return tab_('submissions');
}
function tabKeyOf_(sheet) {
  return Object.keys(TABS).find((k) => TABS[k].name() === sheet.getName()) || '';
}

// Makes sure every column in the list exists, adding any that are missing in
// their place, and returns { header name: column number }.
function columns_(sheet, list) {
  list = list || COLUMNS;
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, list.length).setValues([list]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  let header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  list.forEach((name, i) => {
    if (header.indexOf(name) !== -1) return;
    // After the nearest earlier column that exists, or first
    let after = 0;
    for (let j = i - 1; j >= 0; j--) {
      const at = header.indexOf(list[j]);
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

function saveRow_(key, values) {
  const sheet = tab_(key);
  const cols = columns_(sheet, TABS[key].columns);
  const row = new Array(sheet.getLastColumn()).fill('');
  Object.keys(values).forEach((name) => { if (cols[name]) row[cols[name] - 1] = values[name]; });
  sheet.appendRow(row);
  sheet.getRange(sheet.getLastRow(), cols['Decision']).setDataValidation(decisionRule_());
}

// Row numbers on a tab that belong to one pull request
function rowsFor_(sheet, cols, number) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, cols['Pull request'], last - 1, 1).getValues()
    .map((r, i) => (prNumber_(r[0]) === number ? i + 2 : 0)).filter(Boolean);
}

function reviewLink_(number, version) {
  return `=HYPERLINK("${SETTINGS.site}/admin/review.html?pr=${number}${version ? `&v=${version}` : ''}", "Open")`;
}

// Records one suggested change on a submission's row: a line under
// "Suggested changes", and Version and TEI become the new version's
function addChange_(sheet, cols, row, { who, note, when, version, xml }) {
  const list = sheet.getRange(row, cols['Suggested changes']);
  const line = `${who} (${Utilities.formatDate(when, SETTINGS.timeZone, 'dd/MM')})${note ? `: ${note}` : ''}`;
  const lines = String(list.getValue() || '').split('\n').filter(String).concat(line);
  list.setValue(lines.join('\n'));
  sheet.getRange(row, cols['Version']).setValue(version);
  if (xml) sheet.getRange(row, cols['TEI']).setValue(xml.length > CELL_LIMIT ? xml.slice(0, CELL_LIMIT) + ' …' : xml);
  const status = sheet.getRange(row, cols['Status']);
  if (/^Waiting/.test(String(status.getValue()))) status.setValue(`Waiting. Changed since it was sent (${lines.length} suggested change${lines.length === 1 ? '' : 's'})`);
}

function decisionRule_() {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(['Accept', 'Reject'], true)
    .setAllowInvalid(false)
    .setHelpText('Accept publishes this version on the site. Reject turns it down. Either happens straight away and can\'t be undone here.')
    .build();
}

/* ---------- Data changes ---------- */

// Changes from the data editor (admin/carlton-data-editor.html):
//   { action: "data", name, note, changes: [{ file, before, after }] }
// file is e.g. "directory/1905"; before and after are one record each, as
// the JSON line it is in the file (before null: a new record; after null:
// the record is removed). The script checks them against the files on main,
// refusing the lot if any "before" record isn't there any more (someone
// else changed it since), opens a pull request from a data/ branch, and
// adds a row to the "Data changes" tab. Editors decide there, in the
// Decision column, as for entries. On Accept the changes are applied again
// to the files as they are then, so changes accepted in between are kept.
const DATA_COLUMNS = ['Received', 'Sent by', 'Note', 'What changed', 'Details', 'Decision', 'Reason (editors only)',
  'Status', 'Pull request', 'Version', 'Changes (for the script)'];
const DATA_FOLDERS = { directory: 'Directory', 'electoral-roll': 'Electoral roll' };
const DATA_PATH_ = /^_data\/(directory|electoral-roll)\/\d{4}\.json$/;

function receiveData_(data) {
  const name = String(data.name || '').trim().slice(0, 100);
  if (!name) throw userError_('Add your name.');
  const note = String(data.note || '').trim().slice(0, 300);
  const changes = Array.isArray(data.changes) ? data.changes : [];
  if (changes.length > 2000) throw userError_('That is too many changes to send at once. Send them in a few smaller batches.');
  const byFile = groupDataChanges_(changes);
  const stored = JSON.stringify(byFile);
  if (stored.length > CELL_LIMIT) throw userError_('That is too many changes to send at once. Send them in a few smaller batches (about 100 records each).');

  checkRate_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const stamp = Utilities.formatDate(new Date(), SETTINGS.timeZone, 'yyyyMMdd-HHmmss');
    const branch = `data/${stamp}`;
    const commit = commitData_(branch, byFile, false, true);
    const summary = commit.files.map((f) => f.summary).join('; ');
    const pr = github_('post', '/pulls', {
      title: `Data changes: ${note || summary}`.slice(0, 200), head: branch, base: SETTINGS.base,
      body: [
        `Sent from the data editor by ${name}.`, '',
        ...commit.files.map((f) => `- ${f.summary}`), '',
        'The editors accept or reject this on the Data changes tab of the submissions Sheet (the Decision column). Accepting applies these changes to the data as it is then and merges this.'
      ].join('\n')
    });
    saveRow_('data', {
      'Received': new Date(),
      'Sent by': name,
      'Note': note,
      'What changed': summary,
      'Details': dataDetails_(byFile),
      'Status': 'Waiting',
      'Pull request': pr.html_url,
      'Version': commit.head,
      'Changes (for the script)': stored
    });
    return { status: 'success', pr: pr.html_url, summary };
  } finally {
    lock.releaseLock();
  }
}

// Checks each change and groups them by file: { "directory/1905": [{ before, after }] }
function groupDataChanges_(changes) {
  const byFile = {};
  changes.forEach((c) => {
    const m = /^(directory|electoral-roll)\/(\d{4})$/.exec(String(c && c.file));
    if (!m) throw userError_('The editor sent a file we do not know.');
    const before = c.before == null ? null : dataLine_(c.before);
    const after = c.after == null ? null : dataRecord_(c.after, m[1], Number(m[2]));
    if (before === null && after === null) return;
    (byFile[c.file] = byFile[c.file] || []).push({ before, after });
  });
  if (!Object.keys(byFile).length) throw userError_('Nothing has changed.');
  return byFile;
}

// One record as sent, in the form it's compared in (JSON.stringify of the
// parsed line, so spacing and number formatting don't matter)
function dataLine_(line) {
  let rec;
  try { rec = JSON.parse(String(line)); } catch (err) { throw userError_('The editor sent a record we could not read.'); }
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) throw userError_('The editor sent a record we could not read.');
  return JSON.stringify(rec);
}

// A new or changed record: it must belong in the file it's sent for
function dataRecord_(line, folder, year) {
  const rec = JSON.parse(dataLine_(line));
  const label = `"${rec.listing || rec.entityID}"`;
  if (typeof rec.entityID === 'number' ? !(rec.entityID > 0) : !(typeof rec.entityID === 'string' && rec.entityID.trim())) throw userError_(`${label} needs an ID.`);
  if (rec.source !== DATA_FOLDERS[folder] || rec.year !== year) throw userError_(`${label} was sent for the wrong file.`);
  if (('lat' in rec) !== ('lng' in rec) || ('lat' in rec && !(typeof rec.lat === 'number' && typeof rec.lng === 'number'
    && Math.abs(rec.lat) <= 90 && Math.abs(rec.lng) <= 180))) throw userError_(`${label} has a latitude or longitude that isn't right.`);
  return JSON.stringify(rec);
}

function dataLabel_(key) {
  const [folder, year] = key.split('/');
  return folder === 'directory' ? `${year} directory` : `${year} electoral roll`;
}

// What each change does, for the editors: one line per record
function dataDetails_(byFile) {
  const lines = [];
  Object.keys(byFile).sort().forEach((key) => byFile[key].forEach(({ before, after }) => {
    const was = before && JSON.parse(before), now = after && JSON.parse(after);
    const rec = now || was;
    const what = `${dataLabel_(key)}, ${rec.listing || rec.entityID}`;
    if (!was) lines.push(`Added: ${what}`);
    else if (!now) lines.push(`Removed: ${what}`);
    else {
      const fields = [...new Set([...Object.keys(was), ...Object.keys(now)])]
        .filter((k) => JSON.stringify(was[k]) !== JSON.stringify(now[k]))
        .map((k) => `${k} ${was[k] === undefined ? '(none)' : was[k]} → ${now[k] === undefined ? '(none)' : now[k]}`);
      lines.push(`${what}: ${fields.join('; ') || 'reordered'}`);
    }
  }));
  const text = lines.join('\n');
  return text.length > CELL_LIMIT ? text.slice(0, CELL_LIMIT) + ' …' : text;
}

// Applies one file's changes to that file as it is at commit `ref`. Unchanged
// lines keep their exact text, so the commit shows only the records that
// changed. atAccept only changes the wording of the errors.
function applyDataChanges_(key, list, ref, atAccept) {
  const path = `_data/${key}.json`;
  const label = `the ${dataLabel_(key)}`;
  const file = github_('get', `/contents/${encodePath_(path)}?ref=${ref}`, null, true);
  if (!file) throw userError_(`There is no file for ${label} yet. A new year needs a developer to add it first (see the README).`);
  const text = Utilities.newBlob(Utilities.base64Decode(file.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
  // One record per line, as the editor and tools/convert-map-data.js write them
  const lines = text.split('\n').map((l) => l.trim().replace(/,$/, '')).filter((l) => l.indexOf('{') === 0)
    .map((l) => ({ text: l, key: JSON.stringify(JSON.parse(l)) }));

  const missing = [];
  let edited = 0, added = 0, removed = 0;
  list.forEach(({ before, after }) => {
    if (before === null) { lines.push({ text: after, key: after, done: true }); added++; return; }
    const at = lines.findIndex((l) => !l.done && l.key === before);
    if (at === -1) { missing.push(JSON.parse(before)); return; }
    if (after === null) { lines.splice(at, 1); removed++; return; }
    lines[at] = { text: after, key: after, done: true };
    edited++;
  });
  if (missing.length) {
    const which = missing.slice(0, 3).map((r) => `"${r.listing || r.entityID}"`).join(', ') + (missing.length > 3 ? ` and ${missing.length - 3} more` : '');
    throw userError_(atAccept
      ? `${missing.length === 1 ? 'a record' : 'some records'} in ${label} changed after this was sent (${which}), so it can't be applied. Reject it and ask the sender to make the changes again.`
      : `Someone has changed ${missing.length === 1 ? 'a record' : 'some records'} in ${label} since you loaded the editor (${which}), so nothing was sent. Use "Download changed files" to keep a copy of your work, reload the editor and make those changes again.`);
  }
  if (!lines.length) throw userError_(`This would leave ${label} empty. Ask a developer to remove the file instead.`);
  const counts = [[edited, 'changed'], [added, 'added'], [removed, 'removed']].filter(([n]) => n).map(([n, w]) => `${n} ${w}`);
  return {
    path,
    text: '[\n' + lines.map((l) => l.text).join(',\n') + '\n]\n',
    summary: `${dataLabel_(key)}: ${counts.join(', ')}`
  };
}

// Applies the changes to main as it is now and makes one commit on top of it,
// on a new branch (create) or replacing the branch's commit, so the pull
// request always merges cleanly onto main.
function commitData_(branch, byFile, atAccept, create) {
  const base = github_('get', `/git/ref/heads/${SETTINGS.base}`).object.sha;
  const files = Object.keys(byFile).sort().map((key) => applyDataChanges_(key, byFile[key], base, atAccept));
  const tree = github_('post', '/git/trees', {
    base_tree: github_('get', `/git/commits/${base}`).tree.sha,
    tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.text }))
  });
  const commit = github_('post', '/git/commits', { message: `Data changes: ${files.map((f) => f.summary).join('; ')}`, tree: tree.sha, parents: [base] });
  if (create) github_('post', '/git/refs', { ref: `refs/heads/${branch}`, sha: commit.sha });
  else github_('patch', `/git/refs/heads/${encodePath_(branch)}`, { sha: commit.sha, force: true });
  return { head: commit.sha, files };
}

// Accept or Reject on the Data changes tab (called by decideRow_)
function decideData_(key, number, decision, version, title, row) {
  const pr = github_('get', `/pulls/${number}`, null, true);
  if (!pr) throw userError_('the pull request was not found.');
  const files = github_('get', `/pulls/${number}/files?per_page=100`);
  const fromEditor = pr.head.repo && pr.head.repo.full_name === SETTINGS.repo && /^data\//.test(pr.head.ref)
    && pr.base.ref === SETTINGS.base && files.length > 0 && files.every((f) => DATA_PATH_.test(f.filename));
  if (!fromEditor) throw userError_('this is not from the data editor, so it has to be handled on GitHub.');
  if (pr.merged_at) return 'Published (already, on GitHub)';
  if (pr.state === 'closed') return 'Rejected (already closed on GitHub)';
  const when = Utilities.formatDate(new Date(), SETTINGS.timeZone, 'dd/MM HH:mm');

  if (decision === 'Reject') {
    github_('patch', `/pulls/${number}`, { state: 'closed' });
    deleteBranch_(pr.head.ref);
    return `Rejected ${when}`;
  }

  // Apply the changes to the data as it is now, so changes accepted since
  // this was sent are kept, then merge
  const sheet = tab_('data');
  const cols = columns_(sheet, DATA_COLUMNS);
  let byFile;
  try { byFile = JSON.parse(sheet.getRange(row, cols['Changes (for the script)']).getValue()); } catch (err) { byFile = null; }
  if (!byFile) throw userError_('the "Changes (for the script)" cell on this row is missing or was edited.');
  const commit = commitData_(pr.head.ref, byFile, true, false);
  // GitHub can take a moment to work out that the pull request can be merged
  for (let tries = 0; tries < 5; tries++) {
    if (tries) Utilities.sleep(2000);
    const merge = github_('put', `/pulls/${number}/merge`, { merge_method: 'squash', sha: commit.head, commit_title: `${pr.title} (#${number})` }, false, true);
    if (!merge.conflict) {
      deleteBranch_(pr.head.ref);
      return `Published ${when}`;
    }
  }
  throw userError_('GitHub could not merge it just now. Pick Accept again to retry.');
}

/* ---------- Decisions ---------- */

// Run once from the script editor (select setUp, then Run). It adds the new
// columns, the Data changes tab and the Decision dropdowns, fills in Review
// links and Status for rows sent before this version, and
// switches on the edit trigger. Safe to run again.
function setUp() {
  Object.keys(TABS).forEach((key) => {
    const sheet = tab_(key);
    const cols = columns_(sheet, TABS[key].columns);
    const last = sheet.getLastRow();
    if (key === 'submissions' && last > 1) {
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
    // Dropdowns down the whole column, coloured so decisions stand out
    const decisions = sheet.getRange(2, cols['Decision'], Math.max(sheet.getMaxRows() - 1, 1), 1);
    decisions.setDataValidation(decisionRule_());
    const rules = sheet.getConditionalFormatRules().filter((rule) =>
      !rule.getRanges().some((r) => r.getColumn() === cols['Decision']));
    rules.push(
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Accept').setBackground('#D4EDBC').setFontColor('#11734B').setRanges([decisions]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Reject').setBackground('#FFCFC9').setFontColor('#B10202').setRanges([decisions]).build());
    sheet.setConditionalFormatRules(rules);
  });

  // The edit trigger runs as whoever ran setUp, so editors never see a
  // permissions screen. A plain onEdit() can't reach GitHub, hence this.
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'onDecision')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onDecision').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onEdit().create();
  console.log(`Set up (version ${SCRIPT_VERSION}): Decision columns ready on every tab and the edit trigger is on.`);
}

const FINAL = /^(Published|Rejected|Not used)/;

// Runs on every edit of the Sheet. Only changes to a Decision column do
// anything: the script carries the decision out straight away (merging or
// closing the pull request) and writes the outcome in Status.
function onDecision(e) {
  const sheet = e.range.getSheet();
  const key = tabKeyOf_(sheet);
  if (!key) return;
  const cols = columns_(sheet, TABS[key].columns);
  if (e.range.getColumn() > cols['Decision'] || e.range.getLastColumn() < cols['Decision']) return;
  const first = Math.max(e.range.getRow(), 2), last = e.range.getLastRow();

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) {
    // Another decision is still running: say so, so the editor can pick again
    for (let row = first; row <= last; row++) {
      if (!PENDING[sheet.getRange(row, cols['Decision']).getValue()]) continue;
      if (FINAL.test(sheet.getRange(row, cols['Status']).getDisplayValue())) continue;
      sheet.getRange(row, cols['Status']).setValue('Busy with another decision. Pick again.');
      sheet.getRange(row, cols['Decision']).clearContent();
    }
    return;
  }
  try {
    for (let row = first; row <= last; row++) decideRow_(sheet, key, cols, row);
  } finally {
    lock.releaseLock();
  }
}

// Carries out the Decision on one row (the caller holds the script lock)
function decideRow_(sheet, key, cols, row) {
  const decision = sheet.getRange(row, cols['Decision']).getValue();
  const cell = sheet.getRange(row, cols['Status']);
  const status = String(cell.getDisplayValue());
  const number = prNumber_(sheet.getRange(row, cols['Pull request']).getValue());
  if (!number) return;
  // Already decided: put the decision back to match what happened
  if (FINAL.test(status)) {
    // (only this row's own outcome; "Published with suggested changes" etc. leave it blank)
    const own = /^Published( \d|\s*\()/.test(status) ? 'Accept' : /^Rejected( \d|\s*\()/.test(status) ? 'Reject' : '';
    sheet.getRange(row, cols['Decision']).setValue(own);
    return;
  }
  if (!PENDING[decision]) return;
  cell.setValue(PENDING[decision]);
  SpreadsheetApp.flush();
  const version = sheet.getRange(row, cols['Version']).getValue();
  const title = sheet.getRange(row, cols['Title']).getValue();
  let outcome;
  try {
    outcome = (key === 'data' ? decideData_ : decide_)(key, number, decision, version, title, row);
  } catch (err) {
    console.error(err);
    outcome = `Couldn't ${decision === 'Accept' ? 'publish' : 'reject'}: ${err.userMessage || 'something went wrong. Pick again to retry, or ask Mitchell.'}`;
    sheet.getRange(row, cols['Decision']).clearContent();
  }
  if (outcome.formula) cell.setFormula(outcome.formula); else cell.setValue(outcome);
}

// Earlier versions waited a minute before acting and left a timer to call
// this. It now carries out any decision still showing as in progress, and
// removes that timer.
function processDecisions() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ScriptApp.getProjectTriggers()
      .filter((t) => t.getHandlerFunction() === 'processDecisions')
      .forEach((t) => ScriptApp.deleteTrigger(t));
    Object.keys(TABS).forEach((key) => {
      const sheet = tab_(key);
      const cols = columns_(sheet, TABS[key].columns);
      for (let row = 2; row <= sheet.getLastRow(); row++) {
        const status = sheet.getRange(row, cols['Status']).getDisplayValue();
        if (/^(Publishing|Rejecting)\b/.test(status)) decideRow_(sheet, key, cols, row);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

// A pull request the form opened: open or not, from a submission/ branch in
// this repository, changing one entry file in civic/ (and, once its
// records are being linked, the data files those records are in).
function submission_(number) {
  const pr = github_('get', `/pulls/${number}`, null, true);
  if (!pr) throw userError_('the submission was not found.');
  const files = github_('get', `/pulls/${number}/files?per_page=100`);
  const fromForm = pr.head.repo && pr.head.repo.full_name === SETTINGS.repo
    && /^submission\//.test(pr.head.ref) && pr.base.ref === SETTINGS.base
    && files.filter(isEntryFile_).length === 1 && files.every((f) => isEntryFile_(f) || DATA_FILE.test(f.filename));
  if (!fromForm) throw userError_('this is not a form submission, so it has to be handled on GitHub.');
  return { pr, files, entry: files.find(isEntryFile_) };
}

// The entry's own file; a submission also changes data files once its
// records have been linked (only while it's being accepted)
const DATA_FILE = /^_data\/(directory|electoral-roll)\/\d{4}\.json$/;
function isEntryFile_(f) {
  return f.filename.indexOf(`${SETTINGS.folder}/`) === 0 && /\.xml$/.test(f.filename);
}

// Merges (Accept) or closes (Reject) one submission's pull request
function decide_(key, number, decision, version, title, row) {
  const { pr, entry } = submission_(number);
  if (pr.merged_at) return 'Published (already, on GitHub)';
  if (pr.state === 'closed') return 'Rejected (already closed on GitHub)';
  const when = Utilities.formatDate(new Date(), SETTINGS.timeZone, 'dd/MM HH:mm');

  if (decision === 'Reject') {
    github_('patch', `/pulls/${number}`, { state: 'closed' });
    deleteBranch_(pr.head.ref);
    return `Rejected ${when}`;
  }

  // Publish exactly the version on this row, even if the branch was changed
  // some other way since (on GitHub)
  let head = pr.head.sha;
  if (version && version !== head) {
    const path = encodePath_(entry.filename);
    const wanted = github_('get', `/contents/${path}?ref=${version}`);
    const current = github_('get', `/contents/${path}?ref=${encodeURIComponent(pr.head.ref)}`);
    if (wanted.sha !== current.sha) {
      head = github_('put', `/contents/${path}`, {
        message: `Put back the version accepted in the Sheet (${TABS[key].name()}, row ${row})`,
        content: wanted.content.replace(/\n/g, ''),
        sha: current.sha,
        branch: pr.head.ref
      }).commit.sha;
    }
  }

  // Give the entry's records its id, in the same pull request
  const slug = entry.filename.replace(`${SETTINGS.folder}/`, '').replace(/\.xml$/, '');
  const linked = linkRecords_(pr.head.ref, slug, title, recordsFor_(row));
  if (linked.head) head = linked.head;
  // Right after a commit (putting a version back, linking records) GitHub
  // takes a few seconds to work out that the pull request can be merged,
  // and refuses until then, so try a few times
  let merge;
  for (let tries = 0; tries < 6; tries++) {
    if (tries) Utilities.sleep(3000);
    merge = github_('put', `/pulls/${number}/merge`, {
      merge_method: 'squash',
      sha: head,
      commit_title: `Accept: ${title} (#${number})`,
      commit_message: `Accepted in the submissions Sheet (${TABS[key].name()}, row ${row}).`
    }, false, true);
    if (!merge.conflict) break;
  }
  if (merge.conflict) {
    const now = github_('get', `/pulls/${number}`);
    throw userError_(now.mergeable === false
      ? 'the entry changed on the site after this was sent, so it can\'t be published as it is. Ask Mitchell.'
      : 'GitHub wasn\'t ready to publish it yet. Pick Accept again in a minute.');
  }
  deleteBranch_(pr.head.ref);
  return { formula: `=HYPERLINK("${SETTINGS.site}/civic?id=${encodeURIComponent(slug)}", "Published ${when}${linked.note}")` };
}

/* ---------- Linking records ---------- */

// The record numbers in the accepted row's Records column (editors can
// change them there before accepting).
function recordsFor_(row) {
  const sheet = tab_('submissions');
  const cols = columns_(sheet, COLUMNS);
  const text = String(sheet.getRange(row, cols['Records']).getValue() || '');
  return [...new Set((text.match(/\d+/g) || []).map(Number))];
}

// Changes each numbered record's entityID to the entry's id and commits the
// changed data files to the submission's branch, so accepting publishes the
// entry and the links together. The id is the one the site already uses for
// the entry's records if there is one (e.g. "Corkman Hotel"), else the
// entry's title, else its file name; whichever it is, it gives the entry's
// file name under the site's rule, so maps and search find the entry.
// Each file is taken from main as it is now, so nobody's changes are undone.
// Returns { head, note }: the new branch head (if anything changed) and a
// note for the Status column.
function linkRecords_(branch, slug, title, numbers) {
  if (!numbers.length) return { head: '', note: '' };
  const index = JSON.parse(UrlFetchApp.fetch(`${SETTINGS.site}/data/index.json`).getContentText());
  const existing = index.files.flatMap((f) => f.linked || []).find((id) => slugify_(id) === slug);
  const id = existing || (slugify_(title) === slug ? String(title).trim() : slug);

  const byFile = {};
  const missing = [];
  numbers.forEach((n) => {
    const file = index.files.find((f) => f.ids && f.ids[0] !== null && n >= f.ids[0] && n <= f.ids[1]);
    if (file) (byFile[`_${file.path}`] = byFile[`_${file.path}`] || new Set()).add(String(n));
    else missing.push(n);
  });

  let head = '';
  const done = new Set();
  Object.keys(byFile).forEach((path) => {
    const wanted = byFile[path];
    const main = github_('get', `/contents/${encodePath_(path)}?ref=${SETTINGS.base}`);
    const text = Utilities.newBlob(Utilities.base64Decode(main.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
    // One record per line, each starting {"entityID":…, so only those lines change
    const out = text.split('\n').map((line) => {
      const m = line.match(/^\{"entityID":(\d+),/);
      if (!m || !wanted.has(m[1])) return line;
      done.add(Number(m[1]));
      return `{"entityID":${JSON.stringify(id)},` + line.slice(m[0].length);
    }).join('\n');
    if (out === text) return;
    const onBranch = github_('get', `/contents/${encodePath_(path)}?ref=${encodeURIComponent(branch)}`);
    head = github_('put', `/contents/${encodePath_(path)}`, {
      message: `Link records to ${id}`,
      content: Utilities.base64Encode(out, Utilities.Charset.UTF_8),
      sha: onBranch.sha,
      branch
    }).commit.sha;
  });

  // Already linked (a text id) or not found: left as they are, and listed
  const skipped = numbers.filter((n) => !done.has(n));
  const note = `; ${done.size} record${done.size === 1 ? '' : 's'} linked`
    + (skipped.length ? `, not linked: ${skipped.join(', ')}` : '');
  return { head, note };
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
