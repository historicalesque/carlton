/*
 * Before/after comparison of two TEI entries, for the submission review page
 * (admin/review.html). It compares what a reader sees, not the XML: the
 * title, the facts (dates, names, addresses, occupations, sources …) and the
 * article paragraph by paragraph, with word-level highlights for small edits.
 *
 *   TEICompare.table(currentXml, submittedXml, labels?)
 *     → { html, changes, lost }   lost = things the submission leaves out
 *   labels: { old, new, lost, title } to compare two versions of a submission
 */
window.TEICompare = (function () {
  const NS = 'http://www.tei-c.org/ns/1.0';
  const KIND = { person: 'Person', org: 'Business or organisation', family: 'Family', place: 'Place', topic: 'Topic' };

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const all = (el, name) => (el ? [...el.getElementsByTagNameNS(NS, name)] : []);
  const short = (s, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const years = (el) => {
    if (!el || !el.getAttribute) return '';
    const w = el.getAttribute('when');
    const f = el.getAttribute('from') || el.getAttribute('notBefore');
    const t = el.getAttribute('to') || el.getAttribute('notAfter');
    // from="1890" to="1890" says the same as when="1890"
    return w || (f && f === t) ? ` (${w || f})` : f || t ? ` (${f || '?'}–${t || '?'})` : '';
  };

  /* What a reader sees, as a list of fields, each a list of strings */
  function facts(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('This file is not valid XML, so it cannot be compared.');
    const root = doc.documentElement;
    const subject = [...doc.getElementsByTagNameNS(NS, '*')].find((e) => e.getAttribute('xml:id') === 'subject');
    const titleStmt = all(root, 'titleStmt')[0];
    const out = [];
    const add = (field, items, text) => out.push({ field, items: items.map(norm).filter(Boolean), text: !!text });

    add('Title', [all(titleStmt, 'title')[0] && all(titleStmt, 'title')[0].textContent]);
    add('Type', [KIND[root.getAttribute('type')] || 'Not set']);
    add('Dates', subject ? [
      subject.getAttribute('from') || subject.getAttribute('to') ? years(subject).slice(2, -1) : '',
      ...all(subject, 'birth').map((b) => `Born ${b.textContent}`),
      ...all(subject, 'death').map((d) => `Died ${d.textContent}`)] : []);
    add('Other names', subject ? [...subject.querySelectorAll('[type="alternative"]')].map((n) => n.textContent + years(n)) : []);
    add('Addresses', subject ? [
      ...all(subject, 'placeName').filter((p) => p.parentNode !== subject && p.getAttribute('type') !== 'main'),
      ...all(subject, 'addrLine')].map((p) => p.textContent + years(p.closest('place, residence, location') || p.parentNode)) : []);
    add('Occupation or activity', subject ? [
      ...all(subject, 'occupation').map((o) => o.textContent + years(o)),
      ...all(subject, 'state').filter((s) => !['legal', 'presence'].includes(s.getAttribute('type'))).map((s) => s.textContent + years(s))] : []);
    add('Legal status', all(subject, 'state').filter((s) => s.getAttribute('type') === 'legal').map((s) => s.textContent + years(s)));
    add('Chronology', all(root, 'event').map((e) => e.textContent + years(e)));
    add('Related entries', all(root, 'relation').map((r) => `${r.textContent} (${(r.getAttribute('name') || 'related').replace(/-/g, ' ')})`));
    add('Sources', all(all(root, 'sourceDesc')[0], 'bibl').map((b) => b.textContent));
    add('Authors', all(titleStmt, 'author').map((a) => a.textContent));

    const blocks = [];
    const body = all(root, 'body')[0];
    if (body) for (const el of body.getElementsByTagNameNS(NS, '*')) {
      if (el.localName === 'head') blocks.push(`Heading: ${el.textContent}`);
      else if (el.localName === 'p' || el.localName === 'item') blocks.push(el.textContent);
      else if (el.localName === 'row') blocks.push(`Table row: ${[...el.children].map((c) => norm(c.textContent)).join(' | ')}`);
    }
    add('Article', blocks, true);
    return out;
  }

  /* Longest common subsequence: marks each item same / del / add */
  function diff(a, b) {
    const m = a.length, n = b.length;
    const t = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) {
      t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
    const out = [];
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (a[i] === b[j]) { out.push({ op: 'same', a: a[i] }); i++; j++; }
      else if (t[i + 1][j] >= t[i][j + 1]) out.push({ op: 'del', a: a[i++] });
      else out.push({ op: 'add', b: b[j++] });
    }
    while (i < m) out.push({ op: 'del', a: a[i++] });
    while (j < n) out.push({ op: 'add', b: b[j++] });
    return out;
  }

  function words(a, b) {
    // Very long paragraphs would make the word table huge; mark them whole instead
    if (a.length > 6000 || b.length > 6000) return { old: `<span class="del">${esc(a)}</span>`, new: `<span class="add">${esc(b)}</span>` };
    const ops = diff(a.split(/(\s+)/), b.split(/(\s+)/));
    return {
      old: ops.map((o) => (o.op === 'same' ? esc(o.a) : o.op === 'del' ? `<span class="del">${esc(o.a)}</span>` : '')).join(''),
      new: ops.map((o) => (o.op === 'same' ? esc(o.a) : o.op === 'add' ? `<span class="add">${esc(o.b)}</span>` : '')).join('')
    };
  }

  // Article blocks carry a prefix so a heading never matches a paragraph with the same words
  const isPara = (s) => !/^(Table row|Heading): /.test(s);
  const strip = (s) => s.replace(/^(Table row|Heading): /, '');

  const LABELS = { old: 'Now on the site', new: 'In this submission', lost: 'Disappears from the site if accepted', title: 'What changes' };
  const cell = (label, html) => `<span class="cell-label">${label}</span>${html}`;

  function table(currentXml, submittedXml, labels) {
    const L = { ...LABELS, ...(labels || {}) };
    const LOST = `<span class="lost">${esc(L.lost)}</span>`;
    const row = (field, oldHtml, newHtml, cls = '') =>
      `<tr><td class="field">${field}</td><td class="old ${cls}">${cell(esc(L.old), oldHtml)}</td><td class="new ${cls}">${cell(esc(L.new), newHtml)}</td></tr>`;
    const A = facts(currentXml);
    const B = facts(submittedXml);
    const rows = [];
    let same = 0, lost = 0;

    A.forEach((fa, k) => {
      const fb = B[k];
      const ops = diff(fa.items, fb.items);
      if (fa.text) {
        let n = 0;
        for (let i = 0; i < ops.length; i++) {
          const o = ops[i];
          const label = (s) => (s.startsWith('Table row: ') ? 'Article, table row' : s.startsWith('Heading: ') ? 'Article, heading' : `Article, paragraph ${n}`);
          if (o.op === 'same') { if (isPara(o.a)) n++; same++; continue; }
          if (o.op === 'del' && ops[i + 1] && ops[i + 1].op === 'add') {
            const next = ops[++i];
            if (isPara(o.a)) n++;
            const w = words(strip(o.a), strip(next.b));
            rows.push(row(label(o.a), w.old, w.new, 'text'));
          } else if (o.op === 'del') {
            lost++;
            rows.push(row(label(o.a).replace(/\d+$/, String(n + 1)), `<span class="del">${esc(short(strip(o.a)))}</span>`, `<span class="none">Left out</span>${LOST}`, 'text'));
          } else {
            if (isPara(o.b)) n++;
            rows.push(row(label(o.b), '<span class="none">Not there</span>', `<span class="add">${esc(short(strip(o.b)))}</span>`, 'text'));
          }
        }
        return;
      }
      if (ops.every((o) => o.op === 'same')) { if (fa.items.length) same++; return; }
      const dels = ops.filter((o) => o.op === 'del').length;
      lost += dels;
      const left = ops.filter((o) => o.op !== 'add').map((o) => (o.op === 'del' ? `<li><span class="del">${esc(o.a)}</span></li>` : `<li class="same">${esc(o.a)}</li>`)).join('');
      const right = ops.filter((o) => o.op !== 'del').map((o) => (o.op === 'add' ? `<li><span class="add">${esc(o.b)}</span></li>` : `<li class="same">${esc(o.a)}</li>`)).join('');
      rows.push(row(fa.field,
        (left ? `<ul>${left}</ul>` : '<span class="none">None</span>') + (dels ? LOST : ''),
        right ? `<ul>${right}</ul>` : '<span class="none">None</span>'));
    });

    const html = rows.length ? `
      <div class="changes">
        <div class="changes-header"><span>${esc(L.title)}</span><span class="tag">${rows.length} change${rows.length === 1 ? '' : 's'}</span></div>
        <table>
          <thead><tr><th></th><th>${esc(L.old)}</th><th>${esc(L.new)}</th></tr></thead>
          <tbody>${rows.join('')}</tbody>
          ${same ? `<tfoot><tr><td colspan="3">${same} other part${same === 1 ? ' is' : 's are'} the same in both.</td></tr></tfoot>` : ''}
        </table>
      </div>` : `<div class="notice"><p>${esc(L.same || 'This version is the same as the entry on the site.')}</p></div>`;
    return { html, changes: rows.length, lost };
  }

  return { facts, table };
})();
