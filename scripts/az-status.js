/* Featured pages (aToZ.md): marks each entry link as "New" or
   "Not yet written", and adds the letter index and its legend.

   The page itself is the entry civic/Featured-pages.xml, drawn by
   _layouts/entry.html, so this waits for its "entry-rendered" event.

   - Not yet written: no civic/<slug>.xml file exists. The list of files
     comes from Jekyll at build time (the #az-entries JSON block in
     aToZ.md), so this needs no network requests.
   - New: the entry's "created" maintenanceEvent date is within the last
     NEW_FOR_DAYS days (TEI: the "created" <change>). Read from each
     existing entry's XML. */

(function () {
    const NEW_FOR_DAYS = 14;

    // Edit pencil for "not yet written" (the legend uses it too)
    const PENCIL = '<svg class="az-pencil" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';

    function run() {
        const dataEl = document.getElementById('az-entries');
        const article = document.querySelector('#encyclopedia-entry .pv-entry');
        if (!dataEl || !article) return;
        addIndex(article);

        let existing;
        try {
            existing = new Set(JSON.parse(dataEl.textContent));
        } catch (e) {
            return;
        }

        // Same rule entry.html uses to turn ?id= into a file name
        function slugifyId(text) {
            return text
                .toString()
                .replace(/\s+/g, '-')
                .replace(/[^a-zA-Z0-9_\-]/g, '')
                .replace(/\-\-+/g, '-');
        }

        // icon is shown; label is shown too when showLabel, else read out only
        function addBadge(link, kind, icon, label, title, showLabel) {
            const badge = document.createElement('span');
            badge.className = 'az-badge az-badge-' + kind;
            badge.title = title;
            badge.innerHTML = '<span aria-hidden="true">' + icon + '</span>' +
                '<span class="' + (showLabel ? '' : 'visually-hidden') + '">' + label + '</span>';
            link.insertAdjacentElement('afterend', badge);
            link.classList.add('az-link-' + kind);
        }

        // The entry's creation date: the "created" event, else the earliest event
        function createdDate(xml) {
            let earliest = null;
            for (const ch of xml.getElementsByTagName('change')) {
                const date = new Date(ch.getAttribute('when') || '');
                if (isNaN(date)) continue;
                if (ch.getAttribute('type') === 'created') return date;
                if (!earliest || date < earliest) earliest = date;
            }
            for (const ev of xml.getElementsByTagName('maintenanceEvent')) {
                const type = ev.getElementsByTagName('eventType')[0]?.textContent.trim();
                const dt = ev.getElementsByTagName('eventDateTime')[0];
                const value = dt?.getAttribute('standardDateTime') || dt?.textContent.trim();
                if (!value) continue;
                const date = new Date(value);
                if (isNaN(date)) continue;
                if (type === 'created') return date;
                if (!earliest || date < earliest) earliest = date;
            }
            return earliest;
        }

        const cutoff = Date.now() - NEW_FOR_DAYS * 24 * 60 * 60 * 1000;
        const toCheck = new Map(); // slug -> links to that entry

        for (const link of document.querySelectorAll('.main-content a[href^="civic?id="]')) {
            const id = new URLSearchParams(link.getAttribute('href').split('?')[1]).get('id');
            if (!id) continue;
            const slug = slugifyId(id);

            if (!existing.has(slug)) {
                addBadge(link, 'missing', PENCIL, ' (not yet written)',
                    'Not yet written. Select it to write this page.', false);
                continue;
            }
            if (!toCheck.has(slug)) toCheck.set(slug, []);
            toCheck.get(slug).push(link);
        }

        toCheck.forEach(function (links, slug) {
            fetch('civic/' + slug + '.xml')
                .then(function (res) { return res.ok ? res.text() : Promise.reject(); })
                .then(function (text) {
                    const xml = new DOMParser().parseFromString(text, 'application/xml');
                    const created = createdDate(xml);
                    if (!created || created.getTime() < cutoff) return;
                    const added = created.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
                    links.forEach(function (link) {
                        addBadge(link, 'new', '✦', ' New', 'Added ' + added, true);
                    });
                })
                .catch(function () { /* leave the link unmarked */ });
        });
    }

    // Letter buttons above the sections (one per heading), the legend for
    // the badges, and a "Back to top" link at the end of each section.
    function addIndex(article) {
        const heads = [...article.querySelectorAll('.pv-body h2')];
        if (!heads.length) return;
        const title = article.querySelector('h1');
        if (title && !title.id) title.id = 'featured-pages-a-to-z';
        const index = document.createElement('ul');
        index.className = 'az-index';
        heads.forEach(function (h, i) {
            const letter = h.textContent.trim();
            h.id = h.id || letter.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'section-' + i;
            const a = document.createElement('a');
            a.href = '#' + h.id;
            a.textContent = letter;
            index.appendChild(document.createElement('li')).appendChild(a);
            const top = document.createElement('p');
            top.className = 'az-top';
            top.innerHTML = '<a href="#' + (title ? title.id : 'main') + '">&uarr; Back to top</a>';
            const next = heads[i + 1];
            if (next) next.before(top);
            else article.querySelector('.pv-body').append(top);
        });
        const legend = document.createElement('p');
        legend.className = 'az-legend';
        legend.innerHTML = '<span class="az-badge az-badge-new">✦ New</span> added in the last two weeks &nbsp; ' +
            '<span class="az-badge az-badge-missing">' + PENCIL + '</span> not yet written, select it to write the page';
        heads[0].before(legend, index);
    }

    if (document.querySelector('#encyclopedia-entry .pv-entry')) run();
    else document.addEventListener('entry-rendered', run, { once: true });
})();
