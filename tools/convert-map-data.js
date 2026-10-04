#!/usr/bin/env node
/* One-off conversion from the old single-file data to one JSON file per
   source and year (README: Data).

     node tools/convert-map-data.js path/to/map-data.js

   Reads `const directoryData = [...]` from map-data.js and writes
     _data/directory/<year>.json, _data/electoral-roll/<year>.json
       one record per line, records and fields in their original order
     data/directory/<year>.json, data/electoral-roll/<year>.json
       the small pages Jekyll turns into the copies the browser downloads

   Electoral-roll records get new numeric entityIDs counting up from 999999
   (1928 roll first, keeping their order), so they no longer share numbers
   with the directories (decided 2026-10-04). Text entityIDs are unchanged.

   Existing files for the same source and year are overwritten. Run it again
   on the latest map-data.js if the data changed after the conversion. */
const fs = require('fs');
const path = require('path');

const input = process.argv[2];
if (!input) {
  console.error('Usage: node tools/convert-map-data.js path/to/map-data.js');
  process.exit(1);
}
const root = path.join(__dirname, '..');
const text = fs.readFileSync(input, 'utf8').trim()
  .replace(/^const\s+directoryData\s*=\s*/, '').replace(/;\s*$/, '');
const records = JSON.parse(text);

// The rolls were numbered 7034–8558, overlapping the 1930 directory
// (8271–8948). Shift them so the lowest becomes 999999.
const ELECTORAL_ID_START = 999999;
const rollIds = records.filter((r) => r.source === 'Electoral roll' && typeof r.entityID === 'number').map((r) => r.entityID);
const shift = ELECTORAL_ID_START - Math.min(...rollIds);
records.forEach((r) => {
  if (r.source === 'Electoral roll' && typeof r.entityID === 'number') r.entityID += shift;
});

const FOLDERS = { 'Directory': 'directory', 'Electoral roll': 'electoral-roll' };
const files = {};
records.forEach((r) => {
  const folder = FOLDERS[r.source];
  if (!folder) throw new Error(`Unknown source "${r.source}" on record ${r.entityID}`);
  const key = `${folder}/${r.year}`;
  (files[key] = files[key] || []).push(r);
});

// Same format the data editor writes: a JSON list with one record per line.
const serialize = (list) => '[\n' + list.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n';

Object.keys(files).sort().forEach((key) => {
  const [folder, year] = key.split('/');
  fs.mkdirSync(path.join(root, '_data', folder), { recursive: true });
  fs.mkdirSync(path.join(root, 'data', folder), { recursive: true });
  fs.writeFileSync(path.join(root, '_data', folder, `${year}.json`), serialize(files[key]));
  fs.writeFileSync(path.join(root, 'data', folder, `${year}.json`),
    `---\nlayout: null\n---\n{{ site.data["${folder}"]["${year}"] | jsonify }}\n`);
  console.log(`${key}: ${files[key].length} records`);
});
console.log(`${records.length} records in ${Object.keys(files).length} files`);
