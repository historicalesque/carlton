#!/usr/bin/env node
/* Links records that are exact matches across years (README: Data).

     node tools/link-exact-matches.js

   Two records match when they are the same kind of record on the same side
   of the same street and their listing text is identical, ignoring case,
   spacing and trailing punctuation (electoral-roll voters match on surname,
   given names and address instead). A group of matching records from two or
   more years is given one text entityID:
     - the team's own text entityID, if one of the records already has one;
     - otherwise a new one made from the name ("James Hepburn"), with the
       street, then the street number (or side of the street) added if that
       name is already taken by another group or by an entry in civic/.
   Groups are skipped when the same listing appears twice in one year (we
   can't tell which is which), and bare "right-of-way" listings are never
   linked.

   Then every text entityID (new or the team's) shares its coordinates: when
   the records with coordinates all agree (to within about 5 m), the records
   without coordinates get them. A group whose records disagree is left as
   it is. Nothing else is placed: a record only gets coordinates another
   record of the same entity already has.

   Rewrites _data/directory/*.json and _data/electoral-roll/*.json in
   place, one record per line, records and fields in their original order.
   Safe to run again after adding a year: links already made are kept. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FOLDERS = ['directory', 'electoral-roll'];

const files = [];
for (const folder of FOLDERS) {
  const dir = path.join(ROOT, '_data', folder);
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const file = path.join(dir, name);
    files.push({ file, records: JSON.parse(fs.readFileSync(file, 'utf8')) });
  }
}
const all = files.flatMap((f) => f.records);

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const normStreet = (s) => norm(s).replace(/\s+(street|st|road|place|lane|parade|terrace)\.?$/, '');
const normListing = (s) => norm(s).replace(/\s*([.,])\s*/g, '$1 ').replace(/[\s.,;:-]+$/, '').trim();
const isText = (id) => typeof id === 'string' && id.trim() !== '';

// Leading street numbers: "36 ", "90 & 92 ", "34, 38, 40 ", "122-28 ", "45a ".
const NUMBER = /^(\d+[a-z]?(?:\s*(?:,|&|and|-|–)\s*\d+[a-z]?)*),?\s+(?=\D)/i;
const withoutNumber = (s) => s.replace(NUMBER, '');

function key(r) {
  if (r.source !== 'Directory') {
    if (!r.Surname || !r.Address) return null;
    return ['voter', norm(r.Surname), norm(r['Given Names']), norm(r.Address)].join('|');
  }
  if (/^right-of-way$/i.test(r.type || '')) return null;
  const listing = normListing(r.listing);
  if (!listing || /^\(?(vacant|empty)\b/.test(withoutNumber(listing))) return null;
  return [norm(r.type), normStreet(r.street), norm(r.cardinality), listing].join('|');
}

// "36 O'Neill, Mrs Bridget" → "Mrs Bridget O'Neill". Businesses keep their
// name ("Madeline hotel, Lilley, Wm." → "Madeline hotel"), and
// intersections their listing.
function bareListing(r) {
  return withoutNumber(String(r.listing).replace(/\s+/g, ' ').trim());
}
function displayName(r) {
  if (r.source !== 'Directory') return `${r['Given Names'] || ''} ${r.Surname}`.trim();
  if (r.type !== 'Place') return bareListing(r);
  const parts = bareListing(r).split(',').map((p) => p.trim());
  // A surname is one word; after it come given names, not a trade ("drapers").
  if (parts.length < 2 || /\s/.test(parts[0]) || /^[a-z]/.test(parts[1])) return parts[0];
  const given = parts[1].replace(/(^|\s)-(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  return given ? `${given} ${parts[0]}` : parts[0];
}

const groups = new Map();
for (const r of all) {
  const k = key(r);
  if (!k) continue;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const toLink = [];
let skippedSameYear = 0, skippedTwoIds = 0;
for (const recs of groups.values()) {
  const years = new Set(recs.map((r) => r.year));
  if (years.size < 2) continue;
  if (years.size !== recs.length) { skippedSameYear++; continue; }
  const ids = [...new Set(recs.map((r) => r.entityID).filter(isText))];
  if (ids.length > 1) { skippedTwoIds++; continue; }
  toLink.push({ recs, id: ids[0] || null });
}

// Names already in use: the team's text IDs and the entries in civic/.
const taken = new Set(all.map((r) => r.entityID).filter(isText));
for (const n of fs.readdirSync(path.join(ROOT, 'civic'))) {
  if (n.endsWith('.xml')) taken.add(n.slice(0, -4).replace(/-/g, ' '));
}
const fresh = toLink.filter((g) => !g.id);
const first = (g) => g.recs.reduce((a, b) => (b.year < a.year ? b : a));
const street = (r) => String(r.street || '').trim();
const side = (r) => (r.cardinality ? `, ${String(r.cardinality).trim()} side` : '');
const number = (r) => (r.source === 'Directory'
  ? (String(r.listing).trim().match(NUMBER) || [])[1]
  : r['Street Number']);
const address = (r) => (number(r) ? `${number(r)} ${street(r)}` : `${street(r)}${side(r)}`);
const candidates = [
  (r) => displayName(r),
  (r) => `${displayName(r)} (${street(r)})`,
  (r) => `${displayName(r)} (${address(r)})`,
  (r) => `${displayName(r)} (${address(r)}${number(r) ? side(r) : ''})`,
  (r) => `${bareListing(r)} (${address(r)}${number(r) ? side(r) : ''})`,
];
let pending = fresh;
for (const make of candidates) {
  const counts = new Map();
  for (const g of pending) counts.set(make(first(g)), (counts.get(make(first(g))) || 0) + 1);
  const left = [];
  for (const g of pending) {
    const name = make(first(g));
    if (counts.get(name) === 1 && !taken.has(name)) { g.id = name; taken.add(name); }
    else left.push(g);
  }
  pending = left;
}
for (const g of pending) {
  const base = candidates[candidates.length - 1](first(g));
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  g.id = `${base} ${n}`;
  taken.add(g.id);
}

let linked = 0;
for (const g of toLink) {
  for (const r of g.recs) {
    if (r.entityID !== g.id) { r.entityID = g.id; linked++; }
  }
}

// Share coordinates within each text entityID.
const hasCoords = (r) => typeof r.lat === 'number' && typeof r.lng === 'number';
const byId = new Map();
for (const r of all) {
  if (!isText(r.entityID)) continue;
  if (!byId.has(r.entityID)) byId.set(r.entityID, []);
  byId.get(r.entityID).push(r);
}
// Coordinates within about 5 m of each other count as the same place (the
// same corner is often set again each year with a slightly different
// click); the records without coordinates get the most recent year's.
const NEAR = 0.00005;
let placed = 0, disagree = 0;
for (const recs of byId.values()) {
  const known = recs.filter(hasCoords).sort((a, b) => b.year - a.year);
  if (known.length === 0) continue;
  const near = (r) => Math.abs(r.lat - known[0].lat) <= NEAR && Math.abs(r.lng - known[0].lng) <= NEAR;
  if (!known.every(near)) { disagree++; continue; }
  const { lat, lng } = known[0];
  for (const r of recs) {
    if (hasCoords(r)) continue;
    r.lat = lat;
    r.lng = lng;
    placed++;
  }
}

for (const { file, records } of files) {
  const out = '[\n' + records.map((r) => JSON.stringify(r)).join(',\n') + '\n]';
  const before = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, before.endsWith('\n') ? out + '\n' : out);
}

console.log(`Linked ${toLink.length} groups (${linked} records changed ID, ${fresh.length} new IDs).`);
console.log(`Skipped ${skippedSameYear} groups listed twice in one year, ${skippedTwoIds} spanning two team IDs.`);
console.log(`Gave coordinates to ${placed} records; ${disagree} IDs left alone because their coordinates differ.`);
