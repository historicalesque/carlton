/* Shared loader for the directory and electoral-roll data (README: Data).

   The data lives in one JSON file per source and year. data/index.json lists
   the files; each page loads only the ones it needs, and each file is fetched
   at most once per page.

     CGData.load({ source: 'Electoral roll' }, { onFile, ordered })
       → Promise of every matching record, in index order (oldest year first).
         onFile(records, file, { loaded, total }) runs as each file arrives;
         with ordered: true it runs in index order instead of arrival order.
     CGData.forEntity(id)   → Promise of the records with that entityID,
                              fetching only the files that can hold it.
     CGData.parcels()       → Promise of the University of Melbourne land
                              parcels GeoJSON.
     CGData.loadWithStatus(el, filter, { onFile, ordered })
       → load() that also shows "Loading the 1905 directory… (4 of 9)" in
         el, and an error with a Try again button if a file fails. */
window.CGData = (function () {
  // Paths are relative to the site root, worked out from this script's own
  // address, so pages at any depth (e.g. admin/) can use the loader.
  const ROOT = document.currentScript.src.replace(/scripts\/data\.js(\?.*)?$/, '');
  const ORDER = { 'Directory': 0, 'Electoral roll': 1 };

  let indexPromise;
  const filePromises = {};

  function index() {
    if (!indexPromise) {
      indexPromise = fetch(ROOT + 'data/index.json', { cache: 'no-cache' })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((idx) => {
          idx.files.sort((a, b) => a.year - b.year || ORDER[a.source] - ORDER[b.source]);
          return idx;
        })
        .catch((err) => {
          indexPromise = null; // let "Try again" fetch it again
          throw Object.assign(new Error(`Couldn't load the list of data files (${err.message}).`), { cause: err });
        });
    }
    return indexPromise;
  }

  function label(file) {
    return file.source === 'Directory' ? `the ${file.year} directory` : `the ${file.year} electoral roll`;
  }

  function fetchFile(file, v) {
    if (!filePromises[file.path]) {
      filePromises[file.path] = fetch(`${ROOT}${file.path}?v=${v}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .catch((err) => {
          delete filePromises[file.path];
          throw Object.assign(new Error(`Couldn't load ${label(file)} (${err.message}).`), { file, cause: err });
        });
    }
    return filePromises[file.path];
  }

  function matches(file, filter) {
    if (filter.source && file.source !== filter.source) return false;
    if (filter.years && !filter.years.includes(file.year)) return false;
    return true;
  }

  async function files(filter = {}) {
    return (await index()).files.filter((f) => matches(f, filter));
  }

  async function load(filter = {}, { onFile, ordered = false } = {}) {
    const idx = await index();
    const list = idx.files.filter((f) => matches(f, filter));
    const results = new Array(list.length);
    let loaded = 0, next = 0;
    // In ordered mode, hand files over in index order: a file that arrives
    // early waits until the ones before it have been handed over.
    const flush = () => {
      while (next < list.length && results[next]) {
        onFile(results[next], list[next], { loaded: next + 1, total: list.length });
        next++;
      }
    };
    await Promise.all(list.map((file, i) => fetchFile(file, idx.v).then((records) => {
      results[i] = records;
      loaded++;
      if (!onFile) return;
      if (ordered) flush();
      else onFile(records, file, { loaded, total: list.length });
    })));
    return results.flat();
  }

  async function forEntity(id) {
    const idx = await index();
    const asNumber = /^-?\d+$/.test(String(id).trim()) ? Number(id) : null;
    const list = idx.files.filter((f) => asNumber !== null
      ? f.ids[0] !== null && asNumber >= f.ids[0] && asNumber <= f.ids[1]
      : f.linked.includes(String(id)));
    const loaded = await Promise.all(list.map((f) => fetchFile(f, idx.v)));
    // == on purpose: "123" in a URL matches the number 123
    return loaded.flat().filter((r) => r.entityID == id);
  }

  let parcelsPromise;
  function parcels() {
    if (!parcelsPromise) {
      parcelsPromise = fetch(ROOT + 'data/uom-land-parcels.geojson')
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .catch((err) => {
          parcelsPromise = null;
          throw new Error(`Couldn't load the University of Melbourne land parcels (${err.message}).`);
        });
    }
    return parcelsPromise;
  }

  // ---- Messages ------------------------------------------------------
  // Progress names the first file still on its way, so the message moves
  // through the years in order even though files arrive in parallel.
  function showProgress(el, list, done) {
    const waiting = list.find((f) => !done.has(f.path));
    el.hidden = false;
    el.classList.remove('data-status-error');
    el.textContent = waiting
      ? `Loading ${label(waiting)}… (${done.size + 1} of ${list.length})`
      : '';
    if (!waiting) el.hidden = true;
  }

  function showError(el, err, retry) {
    el.hidden = false;
    el.classList.add('data-status-error');
    el.textContent = `${err.message} Check your connection and `;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-status-retry';
    btn.textContent = 'Try again';
    btn.addEventListener('click', retry);
    el.append(btn);
  }

  // load() plus the progress and error messages in `el`. Resolves with the
  // records once everything has loaded; on failure shows the error with a
  // Try again button that starts over (files already loaded are reused).
  function loadWithStatus(el, filter = {}, opts = {}) {
    const handed = new Set(); // files already given to onFile, across retries
    return new Promise((resolve) => {
      const attempt = async () => {
        let failed = false; // a file that arrives after another failed mustn't hide the error
        el.hidden = false;
        el.classList.remove('data-status-error');
        el.textContent = 'Loading the data…';
        try {
          const list = await files(filter);
          const done = new Set();
          showProgress(el, list, done);
          const records = await load(filter, Object.assign({}, opts, {
            onFile: (recs, file, progress) => {
              done.add(file.path);
              if (!failed) showProgress(el, list, done);
              if (opts.onFile && !handed.has(file.path)) {
                handed.add(file.path);
                opts.onFile(recs, file, progress);
              }
            }
          }));
          el.hidden = true;
          resolve(records);
        } catch (err) {
          failed = true;
          showError(el, err, attempt);
        }
      };
      attempt();
    });
  }

  return { index, files, load, loadWithStatus, forEntity, parcels, label, showError };
})();
