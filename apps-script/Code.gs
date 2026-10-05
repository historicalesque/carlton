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
 * Setup is in apps-script/README.md. The GitHub token lives in Script
 * properties (GITHUB_TOKEN), never in this file.
 */

const SETTINGS = {
  repo: 'historicalesque/carlton',
  base: 'main',
  folder: 'civic',
  sheetName: 'TEI submissions',
  maxBytes: 500 * 1024,
  maxPerHour: 20,
  timeZone: 'Australia/Melbourne'
};
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
    saveRow_([new Date(), pr.isNew ? 'New entry' : 'New version', title,
      root.getAttribute('type') ? root.getAttribute('type').getValue() : '', authors.join(', '),
      `${SETTINGS.folder}/${slug}.xml`, pr.url, xml.length > CELL_LIMIT ? xml.slice(0, CELL_LIMIT) + ' …' : xml]);
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
  github_('put', `/contents/${encodePath_(path)}`, put);

  const body = [
    `Submitted through the contribution form by ${authors.join(', ')}.`,
    '',
    isNew
      ? `This adds a new entry, \`${path}\`.`
      : `This is a new version of \`${path}\`. **Merging replaces the current entry**, so check the "Files changed" tab and keep anything the new version leaves out.`,
    '',
    'Accept: merge this pull request. Reject: close it.'
  ].join('\n');
  const pr = github_('post', '/pulls', { title: `${isNew ? 'New entry' : 'New version of'}: ${title}`, head: branch, base: SETTINGS.base, body });
  return { url: pr.html_url, isNew };
}

function github_(method, path, payload, allow404) {
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
  if (code >= 300) throw new Error(`GitHub ${method.toUpperCase()} ${path} failed (${code}): ${res.getContentText().slice(0, 500)}`);
  return JSON.parse(res.getContentText() || '{}');
}

/* ---------- Sheet ---------- */

function saveRow_(row) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(SETTINGS.sheetName) || book.insertSheet(SETTINGS.sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Received', 'Kind', 'Title', 'Type', 'Authors', 'File', 'Pull request', 'TEI']);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow(row);
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
