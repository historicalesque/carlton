// ═══════════════════════════════════════════════════════════
//  MAP COMMON
//  Shared by the 2D map (_layouts/map.html) and the 3D map
//  (_layouts/map3d.html). Everything here works on the
//  directory and electoral-roll records (scripts/data.js) and knows nothing
//  about Leaflet or three.js.
// ═══════════════════════════════════════════════════════════
window.MapCommon = (function () {

    // ── Layers, colours and labels ──
    // A layer is one data file: a source and a year, e.g. "1905 Directory"
    // and "1905 Electoral roll", so each has its own checkbox and colour.
    // These take records or the list of data files (CGData.files()), which
    // also have a year and a source, so a map can be set up before any
    // records arrive.
    function layerOf(e) {
        return `${e.year} ${e.source}`;
    }

    // Oldest first; within a year, in source order (Directory, Electoral roll)
    function getLayers(data) {
        const byLayer = {};
        data.forEach(e => { byLayer[layerOf(e)] = e; });
        return Object.keys(byLayer).sort((a, b) =>
            byLayer[a].year - byLayer[b].year || byLayer[a].source.localeCompare(byLayer[b].source));
    }

    // "1905 Electoral roll" → 1905
    function layerYear(layer) {
        return parseInt(layer, 10);
    }

    // "1905 Electoral roll" → "1905 (Electoral roll)"
    function layerLabel(layer) {
        const year = String(layerYear(layer));
        return `${year} (${layer.slice(year.length + 1)})`;
    }

    // Interpolate a colour for each layer across a fixed palette:
    // oldest → warm rust, stepping through amber/teal/violet → newest steel blue.
    // Works for any number of layers automatically.
    const YEAR_PALETTE = [
        [181,  69, 27],  // warm rust
        [184, 134, 11],  // amber
        [46, 125, 94],   // teal green
        [123, 94, 167],  // violet
        [42, 100, 160],  // steel blue
    ];

    function getLayerColors(layers) {
        function lerp(a, b, t) { return a + (b - a) * t; }
        function toHex(r, g, b) {
            return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
        }
        const colors = {};
        layers.forEach((layer, i) => {
            const t   = layers.length === 1 ? 0 : i / (layers.length - 1);
            const raw = t * (YEAR_PALETTE.length - 1);
            const lo  = Math.floor(raw), hi = Math.min(lo + 1, YEAR_PALETTE.length - 1);
            const f   = raw - lo;
            colors[layer] = toHex(
                lerp(YEAR_PALETTE[lo][0], YEAR_PALETTE[hi][0], f),
                lerp(YEAR_PALETTE[lo][1], YEAR_PALETTE[hi][1], f),
                lerp(YEAR_PALETTE[lo][2], YEAR_PALETTE[hi][2], f)
            );
        });
        return colors;
    }

    // { minLat, maxLat, minLng, maxLng } of every mapped record, from the
    // index's per-file bounds. null if nothing is mapped.
    function getBoundsFromFiles(files) {
        const b = files.map(f => f.bounds).filter(Boolean);
        if (!b.length) return null;
        return {
            minLat: Math.min(...b.map(x => x[0])), maxLat: Math.max(...b.map(x => x[1])),
            minLng: Math.min(...b.map(x => x[2])), maxLng: Math.max(...b.map(x => x[3])),
        };
    }

    // ── Loading year by year ──
    // Loads every data file with the progress message in statusEl, and:
    //   onStart(files)        once the list of files is known, before any
    //                         records arrive, to set up the map;
    //   onYear(year, records) as soon as all of a year's files have arrived
    //                         (a directory and an electoral roll can share
    //                         a year), records in index order;
    //   onAll(records)        once everything has arrived, for whatever
    //                         needs every year (cross-year links).
    // Callbacks run in that order, one at a time.
    function loadByYear(statusEl, { onStart, onYear, onAll }) {
        // Set up as soon as the list of files is known. If the list fails to
        // load, loadWithStatus shows the error and its Try again fetches it again.
        let filesPromise = null;
        const files = () => filesPromise || (filesPromise = CGData.files().then(
            list => { onStart(list); return list; },
            err => { filesPromise = null; throw err; }));
        files().catch(() => {});

        let queue = Promise.resolve();
        const run = fn => (queue = queue.then(files).then(fn).catch(err => console.error(err)));

        const byYear = {}; // year → [[position in the index, records]]
        return CGData.loadWithStatus(statusEl, {}, {
            onFile: (records, file) => run(list => {
                const got = byYear[file.year] = byYear[file.year] || [];
                got.push([list.findIndex(f => f.path === file.path), records]);
                if (got.length === list.filter(f => f.year === file.year).length) {
                    onYear(file.year, got.sort((a, b) => a[0] - b[0]).flatMap(g => g[1]));
                }
            })
        }).then(records => run(() => onAll(records)));
    }

    // ── Chains: one per layer + street + side ──
    function chainKey(layer, street, side) {
        return `${layer}-${street}-${side}`;
    }

    // Returns { chains: [{ layer, year, street, side }], rawChains: { key → [entry copies] } }
    function buildChains(data) {
        const chains = [];
        const rawChains = {};
        data.forEach(e => {
            const layer = layerOf(e);
            const key = chainKey(layer, e.street, e.cardinality);
            if (!rawChains[key]) {
                rawChains[key] = [];
                chains.push({ layer, year: e.year, street: e.street, side: e.cardinality });
            }
            rawChains[key].push({ ...e });
        });
        chains.forEach(({ layer, street, side, year }) => {
            if (ALPHABETICAL_YEARS.includes(year)) sortAlongStreet(rawChains[chainKey(layer, street, side)]);
        });
        return { chains, rawChains };
    }

    // The 1857 and 1858 directories list each street alphabetically by
    // surname, not in street order, and every record has its own point
    // (docs/SCHEMA.md), so their chains are put in order along the street
    // before the street line is drawn through them.
    const ALPHABETICAL_YEARS = [1857, 1858];

    function sortAlongStreet(entries) {
        const placed = entries.filter(e => e.lat != null && e.lng != null);
        if (placed.length < entries.length || placed.length < 2) return;
        const span = k => Math.max(...placed.map(e => e[k])) - Math.min(...placed.map(e => e[k]));
        // A degree of longitude is about 0.79 of a degree of latitude here
        const k = span('lng') * 0.79 > span('lat') ? 'lng' : 'lat';
        entries.sort((a, b) => a[k] - b[k]);
    }

    // Next door: the listings either side of record idx in its chain (same
    // year, street and side, in the order the map draws them). Only for the
    // directories, which list each street house by house; the rolls are in
    // name order. open(i) shows record i of the chain; null at either end.
    function chainNeighbours(chain, idx, open) {
        if (!chain || chain[idx].source !== 'Directory') return null;
        const at = i => (i >= 0 && i < chain.length ? { entry: chain[i], open: () => open(i) } : null);
        return { prev: at(idx - 1), next: at(idx + 1) };
    }

    // Cross-year links are records whose entityID is a string (a deliberate
    // link made by a person). Returns { entityID → [{ layer, year, street, side, idx }] }
    // with each group sorted oldest first.
    function buildCrossYearIndex(chains, rawChains) {
        const byId = {};
        chains.forEach(({ layer, year, street, side }) => {
            rawChains[chainKey(layer, street, side)].forEach((e, idx) => {
                if (typeof e.entityID !== 'string') return;
                if (!byId[e.entityID]) byId[e.entityID] = [];
                byId[e.entityID].push({ layer, year, street, side, idx });
            });
        });
        Object.values(byId).forEach(g => g.sort((a, b) => a.year - b.year || a.layer.localeCompare(b.layer)));
        return byId;
    }

    // ── Arc geometry ──
    function bezier(A, ctrl, B, t) {
        const u = 1 - t;
        return { lat: u*u*A.lat + 2*u*t*ctrl.lat + t*t*B.lat,
                 lng: u*u*A.lng + 2*u*t*ctrl.lng + t*t*B.lng };
    }

    // +1 for sides that bow north/east away from the street centreline, -1 for south/west.
    function sideSign(side) {
        return (side === 'North' || side === 'East') ? 1 : -1;
    }

    /**
     * Apply arcOffset to the correct geographic axis:
     *   - North/South sides: offset perpendicular to an east-west street → nudge latitude
     *   - East/West sides:   offset perpendicular to a north-south street → nudge longitude
     * Returns { lat, lng } with the bow applied.
     */
    function applyOffset(midLat, midLng, arcOffset, side) {
        if (side === 'East' || side === 'West') {
            return { lat: midLat, lng: midLng + arcOffset };
        }
        return { lat: midLat + arcOffset, lng: midLng };
    }

    /**
     * Compute positions for one year+side chain. Entries without lat/lng are
     * placed along a bowed arc between the anchored entries either side.
     * arcOffset: positive = north/east, negative = south/west. Magnitude sets bow amount.
     *
     * For tail/head segments (one open end), we project a ghost anchor
     * in the STREET direction while preserving the correct lateral offset
     * so the arc always bows the right way.
     *
     * Each estimated entry gets _computed = true and _arcT, its position
     * (0..1) along the arc it sits on, which the 3D map uses for height.
     */
    function computeChain(entries, arcOffset, side) {
        const r = entries.map(e => ({ ...e }));
        const n = r.length;
        const place = (i, p, t) => {
            r[i].lat = p.lat; r[i].lng = p.lng; r[i]._computed = true; r[i]._arcT = t;
        };

        // Identify anchor indices
        const anchors = r.map((e,i) => e.lat != null ? i : -1).filter(i => i >= 0);

        // ── Anchored segments between consecutive anchors ──
        for (let ai = 0; ai < anchors.length - 1; ai++) {
            const si = anchors[ai], ei = anchors[ai+1];
            const A  = { lat:r[si].lat, lng:r[si].lng };
            const B  = { lat:r[ei].lat, lng:r[ei].lng };
            const ctrl = applyOffset((A.lat+B.lat)/2, (A.lng+B.lng)/2, arcOffset, side);
            const steps = ei - si;
            for (let k = 1; k < steps; k++) {
                place(si+k, bezier(A, ctrl, B, k/steps), k/steps);
            }
        }

        // ── Tail: entries after last anchor ──
        if (anchors.length > 0) {
            const lastAi = anchors[anchors.length - 1];
            const tailCount = n - lastAi - 1;
            if (tailCount > 0) {
                const A = { lat:r[lastAi].lat, lng:r[lastAi].lng };
                // Street direction: from second-to-last anchor to last, or infer from side.
                // N/S sides run east-west → default forward direction is east (+lng).
                // E/W sides run north-south → default to south (decreasing lat; Carlton
                // is in the southern hemisphere), which suits a lane listed from the
                // street it leaves, e.g. Little Grattan Street south of Grattan Street.
                let dLng = 0, dLat = 0;
                if (anchors.length >= 2) {
                    const prev = anchors[anchors.length - 2];
                    const rawLat = A.lat - r[prev].lat;
                    const rawLng = A.lng - r[prev].lng;
                    const len = Math.sqrt(rawLat*rawLat + rawLng*rawLng) || 1;
                    dLat = (rawLat/len) * 0.00014;
                    dLng = (rawLng/len) * 0.00014;
                } else {
                    // fallback defaults based on street orientation
                    if (side === 'East' || side === 'West') { dLat = -0.00014; } // north-south street → project southward
                    else                                    { dLng =  0.00014; } // east-west street  → project eastward
                }
                const ghost = { lat: A.lat + dLat*(tailCount+1), lng: A.lng + dLng*(tailCount+1) };
                const ctrl  = applyOffset((A.lat+ghost.lat)/2, (A.lng+ghost.lng)/2, arcOffset, side);
                for (let k = 1; k <= tailCount; k++) {
                    const t = k/(tailCount+1);
                    place(lastAi+k, bezier(A, ctrl, ghost, t), t);
                }
            }
        }

        // ── Head: entries before first anchor ──
        if (anchors.length > 0) {
            const firstAi = anchors[0];
            if (firstAi > 0) {
                const A = { lat:r[firstAi].lat, lng:r[firstAi].lng };
                let dLng = 0, dLat = 0;
                if (anchors.length >= 2) {
                    const next = anchors[1];
                    const rawLat = r[next].lat - A.lat;
                    const rawLng = r[next].lng - A.lng;
                    const len = Math.sqrt(rawLat*rawLat + rawLng*rawLng) || 1;
                    dLat = -(rawLat/len) * 0.00014;
                    dLng = -(rawLng/len) * 0.00014;
                } else {
                    // North-south street → project southward too: the anchor is usually where
                    // the listing meets a cross street to its north (e.g. Barry Street's
                    // listings up to Grattan Street), so the street runs on south of it
                    if (side === 'East' || side === 'West') { dLat = -0.00014; }
                    else                                    { dLng = -0.00014; } // project westward (back)
                }
                const ghost = { lat: A.lat + dLat*(firstAi+1), lng: A.lng + dLng*(firstAi+1) };
                const ctrl  = applyOffset((ghost.lat+A.lat)/2, (ghost.lng+A.lng)/2, arcOffset, side);
                for (let k = 0; k < firstAi; k++) {
                    const t = (k + 1) / (firstAi + 1); // first listing furthest from the anchor
                    place(k, bezier(ghost, ctrl, A, t), t);
                }
            }
        }

        return r;
    }

    // ── Markers ──
    // 'intersection', 'right-of-way' or 'place'. The data spells types with
    // mixed case (e.g. 'Right-of-way' and 'right-of-way'), so compare lower case.
    function markerShape(entry) {
        const t = String(entry.type || '').toLowerCase();
        if (t === 'intersection') return 'intersection';
        if (t === 'right-of-way') return 'right-of-way';
        return 'place';
    }

    // ── Entries ──
    // Same rule entry.html uses to turn ?id= into a file name
    function slugifyId(text) {
        return String(text)
            .replace(/\s+/g, '-')
            .replace(/[^a-zA-Z0-9_\-]/g, '')
            .replace(/\-\-+/g, '-');
    }

    // The entityID of the published entry (civic/<slug>.xml) for a record,
    // or null. Only text entityIDs can name an entry. The list of entries is
    // window.ENTRY_FILES, written by Jekyll in _includes/map-details-modal.html.
    function entryFor(entry) {
        if (typeof entry.entityID !== 'string') return null;
        return (window.ENTRY_FILES || []).includes(slugifyId(entry.entityID)) ? entry.entityID : null;
    }

    function escapeHtml(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // How sure we are of a record's point (coordConfidence, docs/SCHEMA.md),
    // as a three-dot meter and a few words. A record drawn between its
    // mapped neighbours (_computed) has no point of its own, and a 'street'
    // point only says which street it was on.
    const CONFIDENCE = {
        high:   { dots: 3, text: 'High confidence' },
        medium: { dots: 2, text: 'Medium confidence' },
        low:    { dots: 1, text: 'Low confidence' },
        street: { dots: 0, text: 'Street only: the spot on the street is not known' },
    };

    // Drawn faded on the maps: an estimate between neighbours, or a street-only point
    function isUncertain(entry) {
        return !!entry._computed || entry.coordConfidence === 'street';
    }

    function locationHtml(entry) {
        if (entry._computed) {
            return `<p class="loc-confidence loc-estimated">${meter(0)} Estimated: drawn between the mapped listings either side of it on the same street</p>`;
        }
        if (entry.lat == null || entry.lng == null) return '';
        const c = CONFIDENCE[entry.coordConfidence];
        let html = c
            ? `<p class="loc-confidence loc-${entry.coordConfidence}">${meter(c.dots)} ${c.text}</p>`
            : `<p class="loc-confidence loc-unrated">${meter(0)} Not yet rated</p>`;
        const details = [];
        if (entry.coordSource) details.push(`<strong>Source:</strong> ${escapeHtml(entry.coordSource)}`);
        if (entry.coordNote) details.push(`<strong>How:</strong> ${escapeHtml(entry.coordNote)}`);
        if (details.length) html += `<p class="loc-details">${details.join('<br>')}</p>`;
        return html;
    }

    function meter(filled) {
        const dots = [0, 1, 2].map(i => `<span class="loc-dot${i < filled ? ' on' : ''}"></span>`).join('');
        return `<span class="loc-meter" aria-hidden="true">${dots}</span>`;
    }

    // ── Details modal (markup in _includes/map-details-modal.html) ──
    let modalEls = null;
    let modalOpenedAt = 0;
    let modalReturnFocus = null; // what had focus before the modal opened

    function initDetailsModal() {
        const modal = document.getElementById('details-modal');
        modalEls = {
            modal,
            heading: document.getElementById('modal-heading'),
            meta:    document.getElementById('modal-meta'),
            body:    document.getElementById('modal-body'),
            link:    document.getElementById('modal-link'),
            neighbours: document.getElementById('modal-neighbours'),
            coords:  document.getElementById('modal-coords'),
            location:  document.getElementById('modal-location'),
            community: document.getElementById('modal-community'),
        };
        const closeBtn = document.getElementById('close-modal-btn');
        const close = () => {
            if (modal.style.display !== 'flex') return;
            modal.style.display = 'none';
            // Back to the marker the modal was opened from
            if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
            modalReturnFocus = null;
        };
        closeBtn.onclick = close;
        // On touch screens the tap that opened the modal is followed by a
        // click on the backdrop, so ignore backdrop clicks straight after opening.
        modal.addEventListener('click', e => {
            if (e.target === modal && Date.now() - modalOpenedAt > 400) close();
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') close();
            // Keep Tab inside the modal while it is open
            if (e.key === 'Tab' && modal.style.display === 'flex') {
                const items = [...modal.querySelectorAll('a[href], button')];
                const first = items[0], last = items[items.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                else if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
            }
        });
    }

    // pos: { lat, lng } where the entry is drawn (falls back to the entry's own lat/lng)
    // neighbours: { prev, next } from chainNeighbours, for the next-door buttons
    function openDetailsModal(entry, pos, neighbours) {
        if (!modalEls) initDetailsModal();
        const m = modalEls;
        m.heading.innerText = entry.listing;

        // 1. Metadata bar, skipping missing fields
        const metaParts = [];
        if (entry.year) metaParts.push(entry.year);
        if (entry.source) metaParts.push(entry.source);
        if (entry.street) metaParts.push(entry.street);
        if (entry.cardinality) metaParts.push(`${entry.cardinality} side`);
        if (entry.pages) metaParts.push(`p. ${entry.pages}`);
        m.meta.innerText = metaParts.join('  ·  ');

        // 2. Body content based on source-specific fields
        let bodyHtml = entry.htmlContent || '';
        const source = String(entry.source || '').toLowerCase();
        if (source === 'electoral roll') {
            const details = [];
            if (entry['Surname'] || entry['Given Names']) {
                details.push(`<strong>Name:</strong> ${entry['Given Names'] || ''} ${entry['Surname'] || ''}`);
            }
            if (entry['Occupation']) details.push(`<strong>Occupation:</strong> ${entry['Occupation']}`);
            if (entry['Gender']) details.push(`<strong>Gender:</strong> ${entry['Gender']}`);
            if (entry['Address']) details.push(`<strong>Address:</strong> ${entry['Address']}`);
            if (entry['Registration Number']) details.push(`<strong>Reg #:</strong> ${entry['Registration Number']}`);
            if (details.length > 0) {
                bodyHtml += `<div class="electoral-details">${details.join('<br>')}</div>`;
            }
            if (entry.Notes) bodyHtml += `<p><strong>Note:</strong> ${escapeHtml(entry.Notes)}</p>`;
        } else if (source === 'directory') {
            if (entry.type) bodyHtml += `<p><strong>Type:</strong> ${entry.type}</p>`;
            if (entry.Notes) bodyHtml += `<p><strong>Note:</strong> ${escapeHtml(entry.Notes)}</p>`;
        }
        m.body.innerHTML = bodyHtml;

        // 2a. Next door: buttons that show the listing either side instead
        m.neighbours.innerHTML = '';
        if (neighbours) {
            ['prev', 'next'].forEach(dir => {
                const n = neighbours[dir];
                const label = dir === 'prev' ? 'Previous' : 'Next';
                const el = document.createElement(n ? 'button' : 'span');
                el.className = `modal-neighbour modal-neighbour-${dir}`;
                if (n) {
                    el.type = 'button';
                    el.dataset.dir = dir;
                    el.innerHTML = `<span class="modal-neighbour-label">${dir === 'prev' ? '← ' : ''}${label}${dir === 'next' ? ' →' : ''}</span> ${escapeHtml(n.entry.listing)}`;
                    el.onclick = () => {
                        n.open();
                        // Keep focus on the next-door buttons: the same one, or
                        // the other at the end of the side
                        const again = m.neighbours.querySelector(`[data-dir="${dir}"]`) || m.neighbours.querySelector('button');
                        if (again) again.focus();
                    };
                } else {
                    el.innerHTML = `<span class="modal-neighbour-label">${dir === 'prev' ? 'First' : 'Last'} on this side</span>`;
                }
                m.neighbours.append(el);
            });
        }

        // 3. Link to the entry page: "Read the entry" when one is published
        // for this record's entityID, otherwise "Start an entry" (the same
        // page shows the contribution form), as on the search page.
        const name = entryFor(entry);
        const linkText = name ? `Read the entry: ${escapeHtml(name)} →` : 'Start an entry';
        m.link.innerHTML = `<p><a class="modal-entry-link${name ? '' : ' quiet'}" href="civic?id=${encodeURIComponent(name || entry.entityID)}">${linkText}</a></p>`;

        // 4. Location: how sure we are of the point, where it comes from,
        // and the coordinates
        m.location.innerHTML = locationHtml(entry);
        const lat = pos ? pos.lat : entry.lat;
        const lng = pos ? pos.lng : entry.lng;
        if (lat != null && lng != null) {
            m.coords.innerText = `${Number(lat).toFixed(7)}, ${Number(lng).toFixed(7)}${entry._computed ? ' (estimated)' : ''}`;
        } else {
            m.coords.innerText = 'Unknown';
        }
        m.community.innerHTML = `Common Ground is a community project, and we're always improving the map. Know where this was? <a href="civic?id=${encodeURIComponent(name || entry.entityID)}">Suggest a correction</a>.`;

        if (m.modal.style.display !== 'flex') modalReturnFocus = document.activeElement;
        m.modal.style.display = 'flex';
        modalOpenedAt = Date.now();
        document.getElementById('close-modal-btn').focus();
    }

    return {
        layerOf, getLayers, layerYear, layerLabel, getLayerColors,
        getBoundsFromFiles, loadByYear,
        chainKey, buildChains, buildCrossYearIndex, chainNeighbours,
        bezier, sideSign, applyOffset, computeChain,
        markerShape, isUncertain,
        entryFor, escapeHtml,
        initDetailsModal, openDetailsModal,
    };
})();
