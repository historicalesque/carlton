/* Collection images in the contribution form's editor (Quill 1.3.6).

   Paste a link to an item in a library, archive or museum collection and,
   once the typing stops, the link becomes the item's image with a caption
   linking back to it. Links that give no image stay links. Works with:
     - National Library of Australia / Trove (nla.obj-…)
     - State Library Victoria viewer (?entity=IE…&file=FL…): IIIF image,
       or the item's thumbnail when there's no file
     - University of Melbourne Digitised Collections bitstream downloads
     - any IIIF image (…/iiif/2/…/full/…/default.jpg or …/info.json)
     - any plain image link (.jpg, .png, .gif, .webp)

   The image is a <figure class="ql-glam-image"> with its details in data-*
   attributes; scripts/tei.js turns it into a TEI <figure> and back.

     GlamEmbed.attach(quill) → { scan, skipExisting }
     GlamEmbed.sourceFor(url) → { text, href }: the Sources line for an
       image's link, e.g. "State Library Victoria, IE1164978" */
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

  // Each adapter gives the image addresses to try, best first, and the item's id for its citation
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

  function resolve(url) {
    for (const adapter of ADAPTERS) {
      const r = adapter.match(url, WIDTH);
      if (r && r.candidates.length) return { ...r, institution: adapter.name || host(url) };
    }
    return null;
  }

  // The Sources line for an image: "State Library Victoria, IE1164978", or the site's name
  function sourceFor(url) {
    const r = resolve(url);
    return { text: r ? (r.id ? `${r.institution}, ${r.id}` : r.institution) : host(url), href: url };
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
      quill.insertEmbed(hit.index, 'glam-image', {
        src, href: url, caption: `Source: ${r.institution}`, alt: `Image from ${r.institution}`
      }, 'user');
      // A link on a line of its own leaves an empty line behind; remove it
      const after = quill.getText(hit.index + 1, 1);
      const before = hit.index === 0 ? '\n' : quill.getText(hit.index - 1, 1);
      if (after === '\n' && before === '\n' && hit.index + 1 < quill.getLength() - 1) quill.deleteText(hit.index + 1, 1, 'user');
      quill.setSelection(hit.index + 1, 0, 'silent');
    }

    function scan() {
      findUrls(quill).forEach(({ url }) => {
        if (busy.has(url) || skip.has(url)) return;
        const r = resolve(url);
        if (!r) return;
        busy.add(url);
        firstLoadable(r.candidates).then((src) => {
          busy.delete(url);
          if (src) replace(url, src, r);
          else skip.add(url);
        });
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
