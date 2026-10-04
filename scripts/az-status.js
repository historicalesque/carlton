/* Featured pages (aToZ.md): marks each entry link as "New" or
   "Not yet written".

   - Not yet written: no civic/<slug>.xml file exists. The list of files
     comes from Jekyll at build time (the #az-entries JSON block in
     aToZ.md), so this needs no network requests.
   - New: the entry's "created" maintenanceEvent date is within the last
     NEW_FOR_DAYS days. Read from each existing entry's XML. */

(function () {
    const NEW_FOR_DAYS = 14;

    // Edit pencil for "not yet written" (same markup as the legend in aToZ.md)
    const PENCIL = '<svg class="az-pencil" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';

    const dataEl = document.getElementById('az-entries');
    if (!dataEl) return;

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
})();
