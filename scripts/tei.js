/* TEI builder and renderer for entries, used by the contribution form
   (_layouts/form.html) and by entry pages (_layouts/entry.html).

     TEIEntry.build(entry)  → TEI XML string for one entry (shape below).
     TEIEntry.check(entry)  → list of warnings for the contributor, e.g. a date
                              with no year in it. Nothing here blocks sending.
     TEIEntry.render(xml)   → HTML preview of an entry, read back from the XML
                              so it shows exactly what was built.

   The entry format is documented in schema/carlton.odd, and files can be
   checked against schema/carlton.rng. In short:
     <TEI type="person|org|family|place|topic|unknown">
       <teiHeader>  title, authors, sources (listBibl), one <change> per edit
       <standOff>   the subject (person / personGrp / org / place, xml:id
                    "subject"), the chronology (listEvent) and links to other
                    entries (listRelation)
       <text>       the article: paragraphs, then one <div> per heading

   entry = {
     recordId, title,
     kind: 'person' | 'org' | 'family' | 'place' | 'topic' | '',
     surname, forenames,                     // people only, optional
     authors: ['Name', ...], date: 'YYYY-MM-DD',
     dates: { from, to, approximate },
     otherNames:     [{ name, from, to }],
     places:         [{ address, role, from, to, lat, lng }],
     occupations:    [{ term, from, to }],   // what a business did, a place's use
     legalStatuses:  [{ term, from, to }],
     chronology:     [{ date, event, place }],
     relations:      [{ name, targetType, relationType, href, from, to }],
     sources:        [{ text, href }],
     articleHtml, note,
     changes:        [{ when, type, text }],  // later edits, optional
     status          // revisionDesc/@status, "draft" unless given
   }
*/
window.TEIEntry = (function () {
  const NS = 'http://www.tei-c.org/ns/1.0';
  const XML_NS = 'http://www.w3.org/XML/1998/namespace';
  const PUBLISHER = 'Common Ground';
  // Rough centre of Carlton, for the "is this coordinate nearby?" check
  const CARLTON = { lat: -37.800, lng: 144.967 };

  const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  const trim = (v) => (has(v) ? String(v).trim() : '');
  const filled = (rows, ...keys) => (rows || []).filter((r) => keys.some((k) => has(r[k])));

  /* ---------- Dates ----------
     People type dates loosely ("c. 1856", "March 1856", "1856-03-04").
     The ISO value goes in @when/@from/@to only when we can read one. */
  const APPROX = /\b(c\.?|ca\.?|circa|about|around|approx\.?)\s*(?=\d)|~|\?/i;

  function parseDate(text) {
    const t = trim(text);
    if (!t) return null;
    let iso = '';
    if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(t)) iso = t;
    else {
      const year = t.match(/\b(1[5-9]\d\d|20\d\d)\b/);
      if (year) iso = year[1];
    }
    return { text: t, iso, approximate: APPROX.test(t) };
  }

  /* @from/@to (or @when) and @cert for a pair of loosely typed dates */
  function range(from, to, forceApprox) {
    const f = parseDate(from);
    const t = parseDate(to);
    const attrs = {};
    if (f && t && f.iso && f.iso === t.iso) attrs.when = f.iso;
    else {
      if (f && f.iso) attrs.from = f.iso;
      if (t && t.iso) attrs.to = t.iso;
    }
    if (forceApprox || (f && f.approximate) || (t && t.approximate)) attrs.cert = 'low';
    return attrs;
  }
  function when(text) {
    const d = parseDate(text);
    return d ? { when: d.iso, cert: d.approximate ? 'low' : '' } : {};
  }

  /* ---------- A tiny DOM writer, so escaping is always right ---------- */
  function writer() {
    const doc = document.implementation.createDocument(NS, 'TEI', null);
    function el(name, attrs, ...children) {
      const node = doc.createElementNS(NS, name);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (!has(v)) continue;
        if (k.startsWith('xml:')) node.setAttributeNS(XML_NS, k, String(v));
        else node.setAttribute(k, String(v));
      }
      for (const c of children.flat(Infinity)) {
        if (c === null || c === undefined || c === false || c === '') continue;
        node.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
      }
      return node;
    }
    return { doc, el };
  }

  /* ---------- Article: Quill HTML → TEI ----------
     Paragraphs before the first heading go straight in <body>; each heading
     starts a <div> with that heading as its <head>. Bold / italic / underline
     become <hi rend>, links become <ref target>, lists become <list rend>,
     and pasted tables stay tables. */
  const REND = { STRONG: 'bold', B: 'bold', EM: 'italic', I: 'italic', U: 'underline' };

  function article(html, el) {
    const src = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html').body;
    const intro = [];
    const divs = [];
    let current = intro;

    function inline(node) {
      const out = [];
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          const text = child.textContent.replace(/ /g, ' ');
          if (text) out.push(text);
        } else if (child.nodeType === 1) {
          const tag = child.tagName;
          if (tag === 'BR') out.push(' ');
          else if (tag === 'A' && has(child.getAttribute('href'))) out.push(el('ref', { target: child.getAttribute('href') }, inline(child)));
          else if (REND[tag]) out.push(el('hi', { rend: REND[tag] }, inline(child)));
          else out.push(...inline(child));
        }
      }
      return out;
    }
    const blank = (parts) => parts.every((p) => typeof p === 'string' ? !p.trim() : !p.textContent.trim());
    // Trim the outer whitespace of a run of inline parts, e.g. a cell's "1860&nbsp;"
    function tidy(parts) {
      const out = parts.slice();
      if (typeof out[0] === 'string') out[0] = out[0].replace(/^\s+/, '');
      const last = out.length - 1;
      if (typeof out[last] === 'string') out[last] = out[last].replace(/\s+$/, '');
      return out;
    }

    function block(node) {
      if (node.nodeType === 3) {
        if (node.textContent.trim()) current.push(el('p', null, node.textContent.trim()));
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      if (/^H[1-6]$/.test(tag)) {
        const head = tidy(inline(node));
        current = [];
        divs.push({ head: blank(head) ? null : head, blocks: current });
      } else if (tag === 'UL' || tag === 'OL') {
        const items = [...node.children].filter((li) => li.tagName === 'LI').map(inline).filter((p) => !blank(p));
        if (items.length) current.push(el('list', { rend: tag === 'OL' ? 'numbered' : 'bulleted' }, items.map((p) => el('item', null, tidy(p)))));
      } else if (tag === 'TABLE') {
        const rows = [...node.querySelectorAll('tr')]
          .map((tr) => [...tr.children].map((td) => tidy(inline(td))))
          .filter((cells) => cells.some((c) => !blank(c)));
        if (rows.length) current.push(el('table', null, rows.map((cells) => el('row', null, cells.map((c) => el('cell', null, c))))));
      } else if (node.querySelector && node.querySelector('table')) {
        // Quill wraps pasted tables in <div class="ql-table-embed">
        [...node.childNodes].forEach(block);
      } else {
        const parts = inline(node);
        if (!blank(parts)) current.push(el('p', null, tidy(parts)));
      }
    }

    [...src.childNodes].forEach(block);
    return [
      intro,
      divs.filter((d) => d.head || d.blocks.length).map((d) => el('div', null, d.head ? el('head', null, d.head) : null, d.blocks))
    ].flat();
  }

  /* ---------- Build the entry ---------- */
  function build(entry) {
    const { doc, el } = writer();
    const root = doc.documentElement;
    const kind = ['person', 'org', 'family', 'place', 'topic'].includes(entry.kind) ? entry.kind : 'unknown';
    root.setAttribute('type', kind);
    root.setAttributeNS(XML_NS, 'xml:lang', 'en');
    const today = entry.date || new Date().toISOString().slice(0, 10);
    const authors = (entry.authors || []).map(trim).filter(Boolean);
    const title = trim(entry.title) || 'Untitled';

    // teiHeader
    const sources = filled(entry.sources, 'text', 'href');
    root.appendChild(el('teiHeader', null,
      el('fileDesc', null,
        el('titleStmt', null,
          el('title', null, title),
          authors.map((a) => el('author', null, a))),
        el('publicationStmt', null,
          el('publisher', null, PUBLISHER),
          el('idno', { type: 'entry' }, trim(entry.recordId) || 'unassigned')),
        el('sourceDesc', null, sources.length
          ? el('listBibl', null, sources.map((s) => el('bibl', null,
              has(s.href) ? el('ref', { target: trim(s.href) }, trim(s.text) || trim(s.href)) : trim(s.text))))
          : el('p', null, 'Contributed through the website. No sources listed.'))),
      el('revisionDesc', { status: entry.status || 'draft' },
        el('change', { when: today, type: 'created' },
          `${trim(entry.note) || 'Contributed through the contribution form'}${authors.length ? ` by ${authors.join(', ')}` : ''}.`),
        // Later edits, e.g. a conversion: [{ when, type, text }]
        (entry.changes || []).map((c) => el('change', { when: c.when, type: c.type }, c.text)))
    ));

    // standOff: the subject
    const others = filled(entry.otherNames, 'name');
    const occupations = filled(entry.occupations, 'term');
    const legal = filled(entry.legalStatuses, 'term');
    const places = filled(entry.places, 'address', 'lat', 'lng');
    const dates = entry.dates || {};
    const lifespan = range(dates.from, dates.to, dates.approximate);
    const nameEl = { person: 'persName', org: 'orgName', family: 'name', place: 'placeName' }[kind];

    const mainName = kind === 'person' && (has(entry.surname) || has(entry.forenames))
      ? el('persName', { type: 'main' },
          has(entry.forenames) ? el('forename', null, trim(entry.forenames)) : null,
          has(entry.surname) ? el('surname', null, trim(entry.surname)) : null)
      : nameEl ? el(nameEl, { type: 'main' }, title) : null;
    const altNames = nameEl ? others.map((n) => el(nameEl, { type: 'alternative', ...range(n.from, n.to) }, trim(n.name))) : [];
    const state = (type, r) => el('state', { type, ...range(r.from, r.to) }, el('label', null, trim(r.term)));
    const geo = (p) => (has(p.lat) && has(p.lng) ? el('geo', null, `${trim(p.lat)} ${trim(p.lng)}`) : null);
    const address = (p) => el('place', { type: trim(p.role) ? p.role.trim().toLowerCase().replace(/\s+/g, '-') : 'address', ...range(p.from, p.to) },
      el('placeName', null, trim(p.address) || 'Unnamed'), geo(p) ? el('location', null, geo(p)) : null);

    let subject = null;
    if (kind === 'person') {
      const birth = parseDate(dates.from);
      const death = parseDate(dates.to);
      const approx = dates.approximate ? { cert: 'low' } : {};
      subject = el('listPerson', null, el('person', { 'xml:id': 'subject' },
        mainName, altNames,
        birth ? el('birth', { when: birth.iso, cert: birth.approximate ? 'low' : '', ...approx }, birth.text) : null,
        death ? el('death', { when: death.iso, cert: death.approximate ? 'low' : '', ...approx }, death.text) : null,
        occupations.map((r) => el('occupation', range(r.from, r.to), trim(r.term))),
        legal.map((r) => state('legal', r)),
        places.map((p) => el('residence', { type: trim(p.role) ? p.role.trim().toLowerCase().replace(/\s+/g, '-') : '', ...range(p.from, p.to) },
          el('placeName', null, trim(p.address) || 'Unnamed'), geo(p)))));
    } else if (kind === 'family') {
      subject = el('listPerson', null, el('personGrp', { 'xml:id': 'subject', role: 'family' },
        mainName, altNames,
        Object.keys(lifespan).length ? el('state', { type: 'presence', ...lifespan }, el('label', null, 'In Carlton')) : null,
        occupations.map((r) => el('occupation', range(r.from, r.to), trim(r.term))),
        legal.map((r) => state('legal', r)),
        places.map((p) => el('residence', range(p.from, p.to), el('placeName', null, trim(p.address) || 'Unnamed'), geo(p)))));
    } else if (kind === 'org') {
      subject = el('listOrg', null, el('org', { 'xml:id': 'subject', ...lifespan },
        mainName, altNames,
        occupations.map((r) => state('activity', r)),
        legal.map((r) => state('legal', r)),
        places.map(address)));
    } else if (kind === 'place') {
      subject = el('listPlace', null, el('place', { 'xml:id': 'subject', ...lifespan },
        mainName, altNames,
        places.map((p) => el('location', { type: 'address', ...range(p.from, p.to) },
          has(p.address) ? el('address', null, el('addrLine', null, trim(p.address))) : null, geo(p))),
        occupations.map((r) => state('use', r)),
        legal.map((r) => state('legal', r))));
    }

    const chron = filled(entry.chronology, 'event');
    const relations = filled(entry.relations, 'name');
    const standOff = [
      subject,
      chron.length ? el('listEvent', { type: 'chronology' }, chron.map((c) => el('event', when(c.date),
        el('label', null, trim(c.event)),
        has(c.place) ? el('place', null, el('placeName', null, trim(c.place))) : null))) : null,
      relations.length ? el('listRelation', null, relations.map((r) => el('relation', {
        type: r.targetType || '',
        name: trim(r.relationType) || 'related',
        active: '#subject',
        // Entries are addressed by name on the site (civic?id=…), so a
        // related entry without a link still gets one.
        passive: trim(r.href) || new URL(`civic?id=${encodeURIComponent(trim(r.name))}`, document.baseURI).href,
        ...range(r.from, r.to)
      }, el('desc', null, trim(r.name))))) : null
    ].filter(Boolean);
    if (standOff.length) root.appendChild(el('standOff', null, standOff));

    // text
    const body = article(entry.articleHtml, el);
    root.appendChild(el('text', null, el('body', null, body.length ? body : el('p', null, ''))));

    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<?xml-model href="https://historicalesque.github.io/carlton/schema/carlton.rng" type="application/xml" schematypens="http://relaxng.org/ns/structure/1.0"?>\n'
      + pretty(root, 0) + '\n';
  }

  /* Indent elements that hold only elements; keep mixed content on one line. */
  const MIXED = new Set(['p', 'item', 'head', 'cell', 'ref', 'hi', 'label', 'desc', 'change', 'bibl',
    'title', 'author', 'persName', 'orgName', 'placeName', 'name', 'occupation', 'birth', 'death', 'addrLine']);
  function pretty(node, depth) {
    const pad = '  '.repeat(depth);
    const kids = [...node.childNodes];
    const s = new XMLSerializer();
    let open = s.serializeToString(node.cloneNode(false)).replace(/\s*\/>$|><\/[^>]+>$/, '');
    if (depth > 0) open = open.replace(` xmlns="${NS}"`, '');
    const name = node.localName;
    if (!kids.length) return `${pad}${open}/>`;
    if (MIXED.has(name) || kids.some((k) => k.nodeType === 3)) {
      const inner = kids.map((k) => s.serializeToString(k)).join('').replace(new RegExp(` xmlns="${NS}"`, 'g'), '');
      return `${pad}${open}>${inner}</${name}>`;
    }
    return `${pad}${open}>\n${kids.map((k) => pretty(k, depth + 1)).join('\n')}\n${pad}</${name}>`;
  }

  /* ---------- Checks shown to the contributor ---------- */
  function check(entry) {
    const out = [];
    const need = (v, msg) => { if (!has(v)) out.push({ level: 'error', text: msg }); };
    need(entry.authors && entry.authors[0], 'Add your name.');
    need(entry.title, 'Add a title.');
    if (!trim(new DOMParser().parseFromString(entry.articleHtml || '', 'text/html').body.textContent)) {
      out.push({ level: 'error', text: 'Write some article text.' });
    }

    const dateCheck = (label, from, to) => {
      const f = parseDate(from); const t = parseDate(to);
      [f, t].forEach((d) => {
        if (d && !d.iso) out.push({ level: 'warn', text: `${label}: we couldn't find a year in "${d.text}".` });
        const y = d && Number(d.iso.slice(0, 4));
        if (y && (y < 1800 || y > new Date().getFullYear())) out.push({ level: 'warn', text: `${label}: ${y} looks unusual for Carlton. Is it right?` });
      });
      if (f && t && f.iso && t.iso && f.iso.slice(0, 4) > t.iso.slice(0, 4)) {
        out.push({ level: 'warn', text: `${label}: the end date is before the start date.` });
      }
    };
    if (entry.dates) dateCheck('Dates', entry.dates.from, entry.dates.to);
    filled(entry.otherNames, 'name').forEach((n) => dateCheck(`Other name "${trim(n.name)}"`, n.from, n.to));
    filled(entry.occupations, 'term').forEach((n) => dateCheck(`"${trim(n.term)}"`, n.from, n.to));
    filled(entry.legalStatuses, 'term').forEach((n) => dateCheck(`"${trim(n.term)}"`, n.from, n.to));
    filled(entry.chronology, 'date', 'event').forEach((c) => {
      if (!has(c.event)) out.push({ level: 'warn', text: `Chronology: the row dated "${trim(c.date)}" has no event, so it's left out.` });
      else dateCheck('Chronology', c.date, '');
    });

    const places = filled(entry.places, 'address', 'lat', 'lng');
    if (places.length && (entry.kind === 'topic' || !entry.kind)) {
      out.push({ level: 'warn', text: 'Addresses are only kept for a person, business, family or place. Choose what the entry is about, or they\'ll be left out.' });
    }
    places.forEach((p) => {
      const label = `Address "${trim(p.address) || 'without a name'}"`;
      dateCheck(label, p.from, p.to);
      if (has(p.lat) !== has(p.lng)) out.push({ level: 'warn', text: `${label}: give both latitude and longitude, or neither.` });
      if (has(p.lat) && has(p.lng)) {
        const lat = Number(p.lat); const lng = Number(p.lng);
        if (!isFinite(lat) || !isFinite(lng)) out.push({ level: 'warn', text: `${label}: coordinates should be numbers, like -37.8004 144.9671.` });
        else if (Math.hypot((lat - CARLTON.lat) * 111, (lng - CARLTON.lng) * 88) > 5) {
          out.push({ level: 'warn', text: `${label}: these coordinates are more than 5 km from Carlton.` });
        }
      }
    });
    if ((entry.kind === 'topic' || !entry.kind)
        && (filled(entry.otherNames, 'name').length || filled(entry.occupations, 'term').length || filled(entry.legalStatuses, 'term').length
            || (entry.dates && (has(entry.dates.from) || has(entry.dates.to))))) {
      out.push({ level: 'warn', text: 'Dates, other names and occupations are only kept for a person, business, family or place. Choose what the entry is about, or they\'ll be left out.' });
    }

    const urlOk = (u) => /^https?:\/\/\S+$/i.test(trim(u));
    filled(entry.sources, 'href').forEach((s) => {
      if (!urlOk(s.href)) out.push({ level: 'warn', text: `Source link "${trim(s.href)}" should start with http:// or https://.` });
    });
    filled(entry.relations, 'name', 'href').forEach((r) => {
      if (!has(r.name)) out.push({ level: 'warn', text: 'Related entry: a row has a link but no name, so it\'s left out.' });
      if (has(r.href) && !urlOk(r.href)) out.push({ level: 'warn', text: `Related entry "${trim(r.name)}": the link should start with http:// or https://.` });
    });
    return out;
  }

  /* ---------- Render an entry back to HTML ---------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Links to other sites open in a new tab; links within the site (e.g.
  // civic?id=…, people) open in place. Script and data URLs are dropped.
  const link = (href, html) => {
    if (!href || /^\s*(javascript|data|vbscript):/i.test(href)) return html;
    return /^https?:/i.test(href)
      ? `<a href="${esc(href)}" target="_blank" rel="noopener">${html}</a>`
      : `<a href="${esc(href)}">${html}</a>`;
  };

  function render(xmlText) {
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (xml.querySelector('parsererror')) return '<p>The XML could not be read.</p>';
    const all = (ctx, name) => (ctx ? [...ctx.getElementsByTagNameNS(NS, name)] : []);
    const kids = (ctx, ...names) => (ctx ? [...ctx.children].filter((c) => names.includes(c.localName)) : []);
    const one = (ctx, name) => all(ctx, name)[0];
    const text = (ctx) => (ctx ? ctx.textContent.trim() : '');

    function mixed(node) {
      if (!node) return '';
      return [...node.childNodes].map((c) => {
        if (c.nodeType === 3) return esc(c.textContent);
        if (c.localName === 'hi') {
          const tag = { italic: 'em', bold: 'strong', underline: 'u' }[c.getAttribute('rend')] || 'span';
          return `<${tag}>${mixed(c)}</${tag}>`;
        }
        if (c.localName === 'ref') return link(c.getAttribute('target'), mixed(c));
        return mixed(c);
      }).join('');
    }
    function blocks(container) {
      return [...container.children].map((c) => {
        switch (c.localName) {
          case 'p': return c.textContent.trim() ? `<p>${mixed(c)}</p>` : '';
          case 'head': return `<h2>${mixed(c)}</h2>`;
          case 'list': {
            const tag = c.getAttribute('rend') === 'numbered' ? 'ol' : 'ul';
            return `<${tag}>${kids(c, 'item').map((i) => `<li>${mixed(i)}</li>`).join('')}</${tag}>`;
          }
          case 'table':
            return `<div class="pv-table"><table><tbody>${kids(c, 'row').map((r) =>
              `<tr>${kids(r, 'cell').map((cell) => `<td>${mixed(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
          case 'div': return blocks(c);
          default: return '';
        }
      }).join('');
    }
    // "1856 – 1881", "from 1856", "1859"
    function dates(e) {
      if (!e) return '';
      const w = e.getAttribute('when'); const f = e.getAttribute('from'); const t = e.getAttribute('to');
      const c = e.getAttribute('cert') === 'low' ? 'c. ' : '';
      if (w) return c + w;
      if (f && t) return `${c}${f} – ${c}${t}`;
      return f ? `from ${c}${f}` : t ? `until ${c}${t}` : '';
    }
    const withDates = (html, e) => { const d = dates(e); return d ? `${html} <span class="pv-dates">(${esc(d)})</span>` : html; };

    const root = xml.documentElement;
    const kind = root.getAttribute('type');
    const typeLabel = { person: 'Person', org: 'Business or organisation', family: 'Family', place: 'Place', topic: 'Topic', unknown: 'Type not given' }[kind] || '';
    const subject = all(xml, '*').find((e) => e.getAttributeNS(XML_NS, 'id') === 'subject');
    const nameNames = ['persName', 'orgName', 'placeName', 'name'];
    const names = kids(subject, ...nameNames);
    const main = names.find((n) => n.getAttribute('type') === 'main');
    const nameOf = (n) => {
      const fore = kids(n, 'forename').map(text); const sur = kids(n, 'surname').map(text);
      return fore.length || sur.length ? [...fore, ...sur].join(' ') : text(n);
    };
    const title = main ? nameOf(main) : text(one(one(xml, 'titleStmt'), 'title'));

    let life = '';
    const facts = [];
    if (subject) {
      if (kind === 'person') {
        const b = kids(subject, 'birth')[0]; const d = kids(subject, 'death')[0];
        life = [b ? `Born ${text(b)}` : '', d ? `Died ${text(d)}` : ''].filter(Boolean).join(' · ');
      } else {
        const presence = kind === 'family' ? kids(subject, 'state').find((s) => s.getAttribute('type') === 'presence') : subject;
        life = dates(presence);
      }
      names.filter((n) => n !== main).forEach((n) => facts.push(['Also known as', withDates(esc(nameOf(n)), n)]));
      kids(subject, 'occupation').forEach((o) => facts.push(['Occupation', withDates(esc(text(o)), o)]));
      kids(subject, 'state').forEach((s) => {
        const label = { activity: 'What it did', use: 'Used as', legal: 'Legal status' }[s.getAttribute('type')];
        if (label) facts.push([label, withDates(esc(text(kids(s, 'label')[0])), s)]);
      });
      kids(subject, 'residence', 'place', 'location').forEach((p) => {
        const name = text(kids(p, 'placeName')[0] || one(p, 'addrLine'));
        const g = text(one(p, 'geo'));
        const role = p.getAttribute('type');
        const label = role && !['address'].includes(role) ? role.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Address';
        facts.push([label, withDates(esc(name || g), p) + (g && name ? ` <span class="pv-dates">· ${esc(g)}</span>` : '')]);
      });
    }

    const body = one(xml, 'body');
    const chron = all(xml, 'listEvent').filter((l) => l.getAttribute('type') === 'chronology').flatMap((l) => kids(l, 'event'));
    const chronHtml = chron.length ? `<h2>Chronology</h2><table class="pv-chron"><tbody>${chron.map((e) =>
      `<tr><th scope="row">${esc(dates(e))}</th><td>${mixed(kids(e, 'label')[0])}${one(e, 'placeName') ? ` <span class="pv-dates">(${esc(text(one(e, 'placeName')))})</span>` : ''}</td></tr>`).join('')}</tbody></table>` : '';

    const relations = all(xml, 'relation').map((r) => {
      const name = text(kids(r, 'desc')[0]);
      const rt = r.getAttribute('name');
      const d = dates(r);
      return `<li>${link(r.getAttribute('passive'), esc(name))}${rt && rt !== 'related' ? ` <span class="pv-dates">${esc(rt)}</span>` : ''}${d ? ` <span class="pv-dates">(${esc(d)})</span>` : ''}</li>`;
    }).join('');
    const sources = all(one(xml, 'sourceDesc'), 'bibl').map((b) => `<li>${mixed(b)}</li>`).join('');
    const authors = all(one(xml, 'titleStmt'), 'author').map(text);

    return `
      <article class="pv-entry">
        <p class="pv-type">${esc(typeLabel)}</p>
        <h1>${esc(title)}</h1>
        ${life ? `<p class="pv-life">${esc(life)}</p>` : ''}
        ${facts.length ? `<dl class="pv-facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}
        <div class="pv-body">${body && body.textContent.trim() ? blocks(body) : '<p><em>No article text yet.</em></p>'}</div>
        ${chronHtml}
        ${relations ? `<h2>Related</h2><ul>${relations}</ul>` : ''}
        ${sources ? `<h2>References</h2><ul>${sources}</ul>` : ''}
        ${authors.length ? `<p class="pv-by">By ${esc(authors.join(', '))}</p>` : ''}
      </article>`;
  }

  return { NS, build, check, render, parseDate };
})();
