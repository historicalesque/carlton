/* Collection images in the contribution form's editor (Quill 1.3.6).

   Paste a link to an item in a library, archive or museum collection and,
   once the typing stops, the link becomes the item's image with a caption
   linking back to it. Links that give no image stay links. Works with:
     - National Library of Australia / Trove (nla.obj-…)
     - State Library Victoria viewer (?entity=IE…&file=FL…): IIIF image,
       or the item's thumbnail when there's no file
     - University of Melbourne Digitised Collections bitstream downloads
     - Public Record Office Victoria item pages (prov.vic.gov.au/archive/…,
       with ?image=N for a later page), looked up in PROV's public API
     - any IIIF image (…/iiif/2/…/full/…/default.jpg or …/info.json)
     - any plain image link (.jpg, .png, .gif, .webp)

   The image is a <figure class="ql-glam-image"> with its details in data-*
   attributes; scripts/tei.js turns it into a TEI <figure> and back.

     GlamEmbed.attach(quill) → { scan, skipExisting }
     GlamEmbed.sourceFor(url) → { text, href }: the Sources line for an
       image's link, e.g. "State Library Victoria, IE1164978", or PROV's
       citation and title */
window.GlamEmbed = (function () {
  const BlockEmbed = Quill.import('blots/block/embed');
  const Delta = Quill.import('delta');
  const isWeb = (url) => /^https?:\/\//i.test(url || '');

  class GlamImage extends BlockEmbed {
    static create(value) {
      const node = super.create();
      node.setAttribute('contenteditable', 'false');
      node.dataset.src = value.src;
      node.dataset.href = value.href || value.src;
      node.dataset.caption = value.caption || '';
      node.dataset.alt = value.alt || '';
      const img = document.createElement('img');
      img.setAttribute('src', value.src);
      img.setAttribute('alt', value.alt || '');
      const cap = document.createElement('figcaption');
      const a = document.createElement('a');
      a.setAttribute('href', node.dataset.href);
      // A click mustn't take the form away from what's being written
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
      a.textContent = value.caption || node.dataset.href;
      cap.append(a);
      node.append(img, cap);
      return node;
    }
    static value(node) {
      return { src: node.dataset.src, href: node.dataset.href, caption: node.dataset.caption, alt: node.dataset.alt };
    }
  }
  GlamImage.blotName = 'glam-image';
  GlamImage.tagName = 'figure';
  GlamImage.className = 'ql-glam-image';
  Quill.register(GlamImage);

  const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; } };

  /* Each adapter gives the image addresses to try, best first, and the
     item's id for its citation, or a caption and citation of its own. An
     adapter that has to look the item up returns a promise; a result with no
     addresses means the link is the adapter's but has no image. */
  const ADAPTERS = [
    {
      name: 'National Library of Australia',
      match(url, width) {
        const m = /^https?:\/\/(?:[\w-]+\.)*nla\.gov\.au\/.*?(nla\.obj-\d+)/i.exec(url);
        return m && { id: m[1], candidates: [`https://nla.gov.au/${m[1]}/image?wid=${width}`] };
      }
    },
    {
      name: 'State Library Victoria',
      match(url, width) {
        if (!/^https?:\/\/viewer\.slv\.vic\.gov\.au\//i.test(url)) return null;
        let u;
        try { u = new URL(url); } catch (e) { return null; }
        const ie = (u.searchParams.get('entity') || '').match(/^IE\d+$/);
        if (!ie) return null;
        const fl = (u.searchParams.get('file') || '').match(/^FL\d+$/);
        const candidates = [];
        if (fl) {
          const base = `https://rosetta.slv.vic.gov.au:2083/iiif/2/${ie[0]}:${fl[0]}`;
          candidates.push(`${base}.jpg/full/${width},/0/default.jpg`, `${base}.tif/full/${width},/0/default.jpg`);
        }
        candidates.push(`https://rosetta.slv.vic.gov.au/delivery/DeliveryManagerServlet?dps_pid=${ie[0]}&dps_func=thumbnail`);
        return { id: ie[0], candidates };
      }
    },
    {
      // Untested: DSpace 7 bitstream downloads. A link that isn't an image stays a link.
      name: 'University of Melbourne Digitised Collections',
      match(url) {
        const m = /^https?:\/\/digitised-collections\.unimelb\.edu\.au\/bitstreams\/[0-9a-f-]+\/download/i.exec(url);
        return m && { candidates: [m[0]] };
      }
    },
    {
      // Item records only: series, agency and function pages (VPRS, VA, VF)
      // have no image. Digitised items have an 'iiif-thumbnail', asked for
      // here at a bigger size; a later page (?image=N) needs the manifest.
      // The API is CC BY-NC, as are the entries.
      name: 'Public Record Office Victoria',
      lookup: true,
      match(url, width) {
        const m = /^https?:\/\/(?:www\.)?prov\.vic\.gov\.au\/archive\/([A-Z0-9-]+)/i.exec(url);
        if (!m || /^(VPRS|VA|VF)/i.test(m[1])) return null;
        return (async () => {
          const id = m[1].toUpperCase();
          let page = 1;
          try { page = parseInt(new URL(url).searchParams.get('image'), 10) || 1; } catch (e) { /* page 1 */ }
          const data = await getJSON(`https://api.prov.vic.gov.au/search/query?wt=json&q=(_id%3A${id})`, true);
          const rec = data && data.response && data.response.docs && data.response.docs[0];
          if (!rec || !rec['iiif-thumbnail']) return { candidates: [] };
          const cite = `PROV, ${rec.citation || id}${rec.title ? ` — ${rec.title}` : ''}`;
          const candidates = [];
          if (page > 1 && rec['iiif-manifest']) {
            const svc = canvasImageService(await getJSON(rec['iiif-manifest'], false), page - 1);
            if (svc) candidates.push(`${svc.replace(/\/$/, '')}/full/${width},/0/default.jpg`);
          }
          const thumb = rec['iiif-thumbnail'];
          candidates.push(thumb.replace(/\/full\/[^/]+\/0\/default\.jpg$/i, `/full/${width},/0/default.jpg`), thumb.replace('!200,200', 'full'), thumb);
          return { candidates: [...new Set(candidates)], caption: cite, cite };
        })();
      }
    },
    {
      name: '', // named after the site it's on
      match(url, width) {
        const m = /^(https?:\/\/[^?#]*?\/iiif\/(?:2|3)\/[^?#]+?)(?:\/info\.json|\/(?:full|square|[\d.,pct:]+)\/[^/]+\/[\d.!]+\/[a-z]+\.(?:jpg|jpeg|png|tif|tiff|webp|gif))(?:[?#].*)?$/i.exec(url);
        return m && { candidates: [`${m[1]}/full/${width},/0/default.jpg`] };
      }
    },
    {
      name: '',
      match(url) {
        return /^https?:\/\/[^\s]+\.(jpe?g|png|gif|webp)(?:[?#].*)?$/i.test(url) ? { candidates: [url] } : null;
      }
    }
  ];
  const WIDTH = 800;

  // JSON from another site: a plain fetch where the site allows it (CORS),
  // otherwise, for PROV's search API, its JSONP wrapper (json.wrf)
  function getJSON(url, allowJsonp) {
    return fetch(url, { mode: 'cors' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => (allowJsonp ? jsonp(url) : null));
  }
  function jsonp(url) {
    return new Promise((done) => {
      const cb = `__glam${Date.now()}${Math.floor(Math.random() * 1e6)}`;
      const s = document.createElement('script');
      const finish = (v) => { clearTimeout(timer); delete window[cb]; s.remove(); done(v); };
      const timer = setTimeout(() => finish(null), 8000);
      window[cb] = finish;
      s.onerror = () => finish(null);
      s.src = `${url}${url.includes('?') ? '&' : '?'}json.wrf=${cb}`;
      document.head.append(s);
    });
  }
  // The image service for canvas i of a IIIF Presentation v2 or v3 manifest
  function canvasImageService(mf, i) {
    try {
      const c = (mf.items || (mf.sequences && mf.sequences[0].canvases) || [])[i];
      if (!c) return null;
      let svc;
      if (c.items) {
        let body = c.items[0].items[0].body;
        if (Array.isArray(body)) body = body[0];
        svc = Array.isArray(body.service) ? body.service[0] : body.service;
      } else {
        svc = c.images[0].resource.service;
        if (Array.isArray(svc)) svc = svc[0];
      }
      return svc ? svc.id || svc['@id'] : null;
    } catch (e) { return null; }
  }

  const found = new Map(); // what each embedded link resolved to, for its Sources line
  async function resolve(url) {
    for (const adapter of ADAPTERS) {
      const r = await adapter.match(url, WIDTH);
      if (r) return { ...r, institution: adapter.name || host(url) };
    }
    return null;
  }

  // The Sources line for an image: "State Library Victoria, IE1164978", PROV's
  // citation and title, or the site's name. Adapters that look items up are
  // only used for links already resolved in the editor.
  function sourceFor(url) {
    let r = found.get(url);
    for (const adapter of r ? [] : ADAPTERS) {
      const hit = !adapter.lookup && adapter.match(url, WIDTH);
      if (hit) { r = { ...hit, institution: adapter.name || host(url) }; break; }
    }
    const text = !r ? host(url) : r.cite || (r.id ? `${r.institution}, ${r.id}` : r.institution);
    return { text, href: url };
  }

  // Loads an image address; a server that answers with an error page or a 1px placeholder doesn't count
  function probe(url, timeoutMs) {
    return new Promise((done) => {
      const img = new Image();
      let finished = false;
      const finish = (v) => { if (!finished) { finished = true; clearTimeout(timer); done(v); } };
      const timer = setTimeout(() => finish(null), timeoutMs);
      img.onload = () => finish(img.naturalWidth > 1 ? url : null);
      img.onerror = () => finish(null);
      img.src = url;
    });
  }
  async function firstLoadable(candidates) {
    for (const c of candidates) if (await probe(c, 8000)) return c;
    return null;
  }

  const URL_RE = /https?:\/\/[^\s<>"']+/g;
  function findUrls(quill) {
    const found = [];
    let index = 0;
    quill.getContents().ops.forEach((op) => {
      if (typeof op.insert !== 'string') { index += 1; return; }
      for (const m of op.insert.matchAll(URL_RE)) {
        const url = m[0].replace(/[.,;:!?)\]]+$/, '');
        found.push({ url, index: index + m.index, length: url.length });
      }
      index += op.insert.length;
    });
    return found;
  }

  function attach(quill, options) {
    const opts = { debounceMs: 600, ...(options || {}) };
    const busy = new Set();
    const skip = new Set(); // links that gave no image, and links already in a loaded entry

    function replace(url, src, r) {
      const hit = findUrls(quill).find((f) => f.url === url);
      if (!hit) return;
      quill.deleteText(hit.index, hit.length, 'user');
      found.set(url, r);
      quill.insertEmbed(hit.index, 'glam-image', {
        src, href: url, caption: r.caption || `Source: ${r.institution}`, alt: `Image from ${r.institution}`
      }, 'user');
      // A link on a line of its own leaves an empty line behind; remove it
      const after = quill.getText(hit.index + 1, 1);
      // (an image just before it also ends a line)
      const prev = hit.index === 0 ? '\n' : quill.getContents(hit.index - 1, 1).ops[0].insert;
      const before = typeof prev === 'string' ? prev : '\n';
      if (after === '\n' && before === '\n' && hit.index + 1 < quill.getLength() - 1) quill.deleteText(hit.index + 1, 1, 'user');
      quill.setSelection(hit.index + 1, 0, 'silent');
    }

    function scan() {
      findUrls(quill).forEach(({ url }) => {
        if (busy.has(url) || skip.has(url)) return;
        busy.add(url);
        resolve(url).then(async (r) => {
          const src = r && await firstLoadable(r.candidates);
          busy.delete(url);
          if (src) replace(url, src, r);
          else if (r) skip.add(url);
        }).catch(() => { busy.delete(url); skip.add(url); });
      });
    }

    let timer = null;
    quill.on('text-change', (delta, old, source) => {
      if (source !== 'user') return;
      clearTimeout(timer);
      timer = setTimeout(scan, opts.debounceMs);
    });

    // Images pasted from a web page (a <figure>, or a bare <img>) keep their
    // link and caption. Pasted data: images are left out, as before.
    const fromPaste = (node) => {
      const img = node.tagName === 'IMG' ? node : node.querySelector('img');
      const src = node.dataset.src || (img && img.getAttribute('src'));
      if (!isWeb(src)) return null;
      const a = node.dataset.href ? null : (node.closest('a[href]') || node.querySelector('a[href]'));
      const href = node.dataset.href || (a && isWeb(a.getAttribute('href')) ? a.getAttribute('href') : src);
      const caption = node.dataset.caption || (node.querySelector('figcaption') || {}).textContent || `Source: ${host(href)}`;
      return { src, href, caption: caption.trim(), alt: node.dataset.alt || (img && img.getAttribute('alt')) || '' };
    };
    quill.clipboard.addMatcher('figure', (node) => {
      const value = fromPaste(node);
      if (value) return new Delta().insert({ 'glam-image': value });
      // A figure with no web image (e.g. a pasted chart) keeps its caption as text
      const text = node.textContent.trim();
      return text ? new Delta().insert(`${text}\n`) : new Delta();
    });
    quill.clipboard.addMatcher('img', (node, delta) => {
      if (node.closest('figure')) return delta;
      const value = fromPaste(node);
      return value ? new Delta().insert({ 'glam-image': value }) : delta;
    });

    return {
      scan,
      // Links already in an entry when it's loaded stay as they were written
      skipExisting() { findUrls(quill).forEach(({ url }) => skip.add(url)); }
    };
  }

  return { attach, sourceFor, resolve, GlamImage };
})();
