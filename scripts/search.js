/* Site search: entries + directory and electoral-roll records in one index.
   Used by _layouts/search.html. Reads the directory and electoral-roll files
   through scripts/data.js and the entry list Jekyll writes into
   window.ENTRY_FILES. Entries are searchable straight away; records join the
   index as each year's file arrives. */
(function () {
  const $ = (id) => document.getElementById(id);
  const input = $('searchInput'), form = $('searchForm'), status = $('searchStatus');
  const resultsEl = $('searchResults'), yearChips = $('yearChips'), streetSelect = $('streetSelect');
  const PER_SECTION = 8;

  // Historical spellings and directory abbreviations, folded to one form so
  // either spelling finds both. Add pairs here as the team finds them.
  const VARIANTS = {
    berkeley: 'berkley', leister: 'leicester', htl: 'hotel', hotl: 'hotel',
    wm: 'william', jno: 'john', thos: 'thomas', chas: 'charles', geo: 'george',
    jas: 'james', saml: 'samuel', st: 'street', sts: 'street', grcr: 'grocer',
    bootmkr: 'bootmaker', mrs: 'mrs', mr: 'mr'
  };
  const fold = (term) => {
    const t = term.toLowerCase().replace(/[.'’]/g, '');
    return t ? (VARIANTS[t] || t) : null;
  };

  const SOURCES = { 'Directory': 'directories', 'Electoral roll': 'rolls' };
  // Older shared links used ?src=places / ?src=people.
  const OLD_SRC = { places: 'directories', people: 'rolls' };
  const state = { q: '', src: 'all', year: '', street: '' };
  let index, groups = {}, entries = {}, records = [], recordGroup = [], loading = true;

  const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const slugify = (s) => String(s).trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_\-]/g, '').replace(/\-\-+/g, '-');

  // ---- URL state -------------------------------------------------------
  function readUrl() {
    const p = new URLSearchParams(location.search);
    state.q = p.get('q') || ''; state.src = p.get('src') || 'all'; state.src = OLD_SRC[state.src] || state.src;
    state.year = p.get('year') || ''; state.street = p.get('street') || '';
  }
  function writeUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.src !== 'all') p.set('src', state.src);
    if (state.year) p.set('year', state.year);
    if (state.street) p.set('street', state.street);
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }

  // ---- Load ------------------------------------------------------------
  async function loadEntries() {
    const files = window.ENTRY_FILES || [];
    const parsed = await Promise.all(files.map(async (name) => {
      try {
        const xml = new DOMParser().parseFromString(await (await fetch(`civic/${name}.xml`)).text(), 'application/xml');
        let title, text, occupations = [];
        if (xml.documentElement.localName === 'TEI') {
          // TEI entries (schema/carlton.odd): the title, the article's text,
          // and the subject's occupations, a business's activities or a
          // place's uses
          title = xml.getElementsByTagName('title')[0]?.textContent.trim();
          text = (xml.getElementsByTagName('body')[0]?.textContent || '').replace(/\s+/g, ' ').trim();
          const subject = [...xml.getElementsByTagName('*')].find((e) => e.getAttribute('xml:id') === 'subject');
          if (subject) {
            occupations = [...subject.children]
              .filter((e) => e.localName === 'occupation' || (e.localName === 'state' && ['activity', 'use'].includes(e.getAttribute('type'))))
              .map((e) => ([...e.children].find((c) => c.localName === 'label') || e).textContent.replace(/\s+/g, ' ').trim())
              .filter(Boolean);
          }
        } else {
          // EAC-CPF entries: the first name part, and the HTML article in <abstract>
          title = xml.getElementsByTagName('part')[0]?.textContent.trim();
          const html = xml.getElementsByTagName('abstract')[0]?.textContent || '';
          text = new DOMParser().parseFromString(html, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
        }
        title = title || name.replace(/-/g, ' ');
        return { name, title, text, occupations: [...new Set(occupations)] };
      } catch (e) { return null; }
    }));
    parsed.filter(Boolean).forEach((e) => { entries[e.name] = e; });
    index.addAll(Object.values(entries).map((e) => ({ id: 'e:' + e.name, kind: 'entry', title: e.title, text: e.text, occupation: e.occupations.join(' ') })));
  }

  function buildIndex() {
    index = new MiniSearch({
      fields: ['title', 'text', 'name', 'listing', 'street', 'occupation'],
      storeFields: ['kind'],
      processTerm: fold,
      searchOptions: {
        boost: { title: 4, listing: 2, occupation: 2 },
        prefix: true,
        fuzzy: (term) => (term.length > 4 ? 0.2 : false),
        combineWith: 'AND',
        processTerm: fold
      }
    });
  }

  // Records that share a text entityID were linked by the team as one person or
  // place; they become one result with a row of years.
  function addRecords(list) {
    const docs = [];
    list.forEach((r) => {
      const i = records.push(r) - 1;
      const kind = SOURCES[r.source] || 'directories';
      const key = typeof r.entityID === 'string' ? 'g:' + r.entityID : 'r:' + i;
      (groups[key] = groups[key] || { key, kind, records: [] }).records.push(r);
      recordGroup[i] = groups[key];
      docs.push({ id: 'd:' + i, kind, name: typeof r.entityID === 'string' ? r.entityID : '', listing: r.listing, street: r.street, occupation: r.Occupation || '' });
    });
    index.addAll(docs);
    Object.values(groups).forEach((g) => g.records.sort((a, b) => a.year - b.year));
  }

  // Rebuilt as each file arrives, so the years and streets fill in.
  function fillFilters() {
    const years = [...new Set(records.map((r) => r.year))].sort();
    yearChips.querySelectorAll('.chip').forEach((c) => c.remove());
    yearChips.insertAdjacentHTML('beforeend', ['', ...years].map((y) =>
      `<label class="chip"><input type="radio" name="year" value="${y}"${String(state.year) === String(y) ? ' checked' : ''}><span>${y || 'Any'}</span></label>`).join(''));
    streetSelect.length = 1; // keep "All streets"
    [...new Set(records.map((r) => r.street))].filter(Boolean).sort().forEach((s) => {
      streetSelect.add(new Option(s, s, false, s === state.street));
    });
  }

  // ---- Search ----------------------------------------------------------
  function run() {
    const q = state.q.trim();
    const sections = { entries: [], directories: [], rolls: [] };
    if (q) {
      const seen = {};
      index.search(q).forEach((hit) => {
        const n = hit.id.split(':');
        if (n[0] === 'e') { sections.entries.push({ entry: entries[n.slice(1).join(':')], terms: hit.terms, score: hit.score }); return; }
        const r = records[+n[1]];
        if (state.year && String(r.year) !== state.year) return;
        if (state.street && r.street !== state.street) return;
        const g = recordGroup[+n[1]];
        if (seen[g.key]) { seen[g.key].hits.add(r); return; }
        seen[g.key] = { group: g, hits: new Set([r]), terms: hit.terms, score: hit.score };
        sections[g.kind].push(seen[g.key]);
      });
    }
    render(q, sections);
  }

  // Matches the terms MiniSearch hit on as whole words, plus the spellings
  // that fold to them, so "Berkeley" is marked when the index term is "berkley".
  function termPattern(terms) {
    const alts = new Set();
    terms.forEach((t) => {
      if (t.length < 2) return;
      alts.add(t);
      Object.keys(VARIANTS).forEach((k) => { if (VARIANTS[k] === t) alts.add(k); });
    });
    if (!alts.size) return null;
    const words = [...alts].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  }
  function marked(text, re) {
    let out = '', last = 0;
    if (re) for (const m of text.matchAll(re)) {
      out += escapeHtml(text.slice(last, m.index)) + '<mark>' + escapeHtml(m[0]) + '</mark>';
      last = m.index + m[0].length;
    }
    return out + escapeHtml(text.slice(last));
  }
  function highlight(text, terms) { return marked(String(text ?? ''), termPattern(terms)); }

  // The passage around the first match, about 80 characters either side and
  // cut at word breaks. If the body has no match (the hit was on the title),
  // the opening of the entry is shown instead.
  const CONTEXT = 80, BLURB = 220;
  function snippet(text, terms) {
    const re = termPattern(terms);
    const m = re && [...text.matchAll(re)][0];
    if (!m) return marked(text.slice(0, BLURB), re) + (text.length > BLURB ? ' …' : '');
    const from = m.index, to = m.index + m[0].length;
    let start = Math.max(0, from - CONTEXT), end = Math.min(text.length, to + CONTEXT);
    if (start > 0) { const s = text.indexOf(' ', start); if (s >= 0 && s < from) start = s + 1; }
    if (end < text.length) { const e = text.lastIndexOf(' ', end); if (e > to) end = e; }
    return (start > 0 ? '… ' : '') + marked(text.slice(start, end), re) + (end < text.length ? ' …' : '');
  }

  // A trade or use, linked to a search for everything else with it.
  // Directory listings abbreviate them ("ice cream fctry"), so the card shows
  // the occupation in full whenever the listing doesn't already say it.
  function occupationLink(term, terms) {
    return `<a href="?q=${encodeURIComponent(term)}" data-q="${escapeHtml(term)}">${highlight(term, terms)}</a>`;
  }
  const plain = (s) => ` ${String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const occupationShown = (r) => r.Occupation && r.Occupation !== 'none given' && !plain(r.listing).includes(plain(r.Occupation));

  function entryCard({ entry, terms }) {
    const linked = groups['g:' + entry.title];
    const years = linked ? [...new Set(linked.records.map((r) => r.year))] : [];
    return `<li class="result result-entry">
      <a class="result-title" href="civic?id=${encodeURIComponent(entry.title)}">${highlight(entry.title, terms)}</a>
      ${entry.occupations.length ? `<p class="result-occupation">${entry.occupations.map((o) => occupationLink(o, terms)).join(' · ')}</p>` : ''}
      <p class="result-snippet">${snippet(entry.text, terms)}</p>
      ${years.length ? `<p class="result-meta">Also in the directories: ${years.join(' · ')}</p>` : ''}
    </li>`;
  }

  function recordCard({ group, hits, terms }) {
    const recs = group.records;
    const shown = [...hits].sort((a, b) => b.year - a.year)[0];
    const name = group.key.startsWith('g:') ? group.key.slice(2) : null;
    const hasEntry = name && entries[slugify(name)];
    const years = recs.map((r) => `<li${hits.has(r) ? ' class="hit"' : ''}><span class="yr">${r.year}</span> ${highlight(r.listing, terms)} <span class="pg">${r.pages ? 'p. ' + escapeHtml(r.pages) : ''}</span></li>`).join('');
    // The title goes where the action does: the entry page, which also lists
    // every record for this name, whether or not an entry has been written.
    const href = `civic?id=${encodeURIComponent(hasEntry ? name : shown.entityID)}`;
    const link = hasEntry
      ? `<a class="result-action" href="${href}">Read the entry →</a>`
      : `<a class="result-action quiet" href="${href}">Start an entry</a>`;
    return `<li class="result result-record">
      <div class="result-head">
        <a class="result-title" href="${href}">${highlight(shown.listing, terms)}</a>
        <span class="result-where">${escapeHtml(shown.street)}${shown.cardinality ? ', ' + escapeHtml(shown.cardinality.toLowerCase()) + ' side' : ''}</span>
      </div>
      ${occupationShown(shown) ? `<p class="result-occupation">${occupationLink(shown.Occupation, terms)}</p>` : ''}
      <p class="result-years">${[...new Set(recs.map((r) => r.year))].map((y) => `<span class="${[...hits].some((h) => h.year === y) ? 'on' : ''}">${y}</span>`).join('')}</p>
      ${recs.length > 1 ? `<details class="result-trace"><summary>Across ${recs.length} listings</summary><ol>${years}</ol></details>` : ''}
      ${link}
    </li>`;
  }

  const LABELS = { entries: 'Entries', directories: 'Directory listings', rolls: 'Electoral rolls' };
  const MORE = { entries: 'entries', directories: 'directory listings', rolls: 'electoral roll records' };
  function render(q, sections) {
    Object.keys(sections).forEach((k) => {
      const n = sections[k].length;
      document.querySelector(`[data-count="${k}"]`).textContent = q ? n.toLocaleString() : '';
    });
    document.querySelectorAll('.search-tabs [data-src]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.src === state.src));
    const active = [state.year, state.street].filter(Boolean).length;
    $('filterBadge').textContent = active ? `(${active})` : '';

    if (!q) {
      status.textContent = '';
      resultsEl.innerHTML = '';
      return;
    }
    const keys = state.src === 'all' ? ['entries', 'directories', 'rolls'] : [state.src];
    const total = keys.reduce((n, k) => n + sections[k].length, 0);
    if (!total && loading) {
      // The data-status line below says what's still loading.
      status.textContent = '';
      resultsEl.innerHTML = '';
      return;
    }
    if (!total) {
      // Read out by screen readers; the message below says the same on screen
      status.innerHTML = `<span class="visually-hidden">No results for “${escapeHtml(q)}”.</span>`;
      resultsEl.innerHTML = `<div class="search-empty"><p>Nothing found for “${escapeHtml(q)}”${state.year || state.street ? ' with these filters' : ''}.</p>
        <p>Know something about it? <a href="civic?id=${encodeURIComponent(q)}">Start an entry for “${escapeHtml(q)}”</a>.</p></div>`;
      return;
    }
    status.textContent = `${total.toLocaleString()} results for “${q}”${loading ? ' so far' : ''}`;
    resultsEl.innerHTML = keys.filter((k) => sections[k].length).map((k) => {
      const list = sections[k];
      const limit = state.src === 'all' ? PER_SECTION : list.length;
      const cards = list.slice(0, limit).map(k === 'entries' ? entryCard : recordCard).join('');
      const more = list.length > limit ? `<button type="button" class="search-more-btn" data-src="${k}">Show all ${list.length.toLocaleString()} ${MORE[k]}</button>` : '';
      return `<section class="search-section"><h2>${LABELS[k]} <span>${list.length.toLocaleString()}</span></h2><ol class="results">${cards}</ol>${more}</section>`;
    }).join('');
  }

  // ---- Wire up ---------------------------------------------------------
  function update() { writeUrl(); run(); }
  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = input.value; update(); }, 150); });
  form.addEventListener('submit', (e) => { e.preventDefault(); state.q = input.value; update(); });
  document.addEventListener('click', (e) => {
    const o = e.target.closest('a[data-q]');
    if (o && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      state.q = input.value = o.dataset.q; update();
      window.scrollTo({ top: $('searchPage').offsetTop });
      input.focus({ preventScroll: true });
      return;
    }
    const b = e.target.closest('[data-src]');
    if (!b) return;
    state.src = b.dataset.src; update(); window.scrollTo({ top: $('searchPage').offsetTop });
    // "Show all" is replaced by the full list, so move focus to its heading
    if (b.classList.contains('search-more-btn')) {
      const h = resultsEl.querySelector('.search-section h2');
      if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    }
  });
  yearChips.addEventListener('change', (e) => { state.year = e.target.value; update(); });
  streetSelect.addEventListener('change', () => { state.street = streetSelect.value; update(); });

  (async function init() {
    readUrl();
    input.value = state.q;
    if (state.year || state.street) $('searchMore').open = true;
    if (typeof CGData === 'undefined' || typeof MiniSearch === 'undefined') {
      status.innerHTML = 'Search could not load. <a href="">Try again</a>.';
      return;
    }
    status.textContent = '';
    buildIndex();
    input.focus();
    const data = CGData.loadWithStatus($('searchData'), {}, {
      onFile: (list) => { addRecords(list); fillFilters(); run(); }
    });
    await loadEntries();
    run();
    await data;
    loading = false;
    run();
  })();
})();
