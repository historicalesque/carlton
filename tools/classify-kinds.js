#!/usr/bin/env node
/* Gives each directory record a `kind`: what the listing is about (README: Data).

     node tools/classify-kinds.js

   The kinds are the entry types (schema/carlton.odd) that a listing can be:
     person   a person: "36 Boraman, John, bootmaker"
     org      a business or organisation, including one that names its
              keeper ("Pelham hotel—Mather, Mary"): a listing stays a
              business until someone on the team decides it is a person
     place    a street feature or empty land: intersections, rights-of-way,
              "Vacant"
     unknown  the rules can't tell ("22 Savage and Clifford, brewers",
              "15 Italians")
   Electoral-roll records are all people and are not given one.

   The rules read the listing's shape. Business words (hotel, & Co, church,
   school…) or a partnership ("Moore & Wheeler, grcrs") make it a business;
   otherwise "Surname, Given name", "Surname, Mrs" or "Surname, ——" makes it
   a person. Listings that are neither, such as a hotel name without the
   word ("75 Harp of Erin, Kelly, James"), are left unknown.

   A record that already has a kind keeps it: that is someone's decision, or
   an earlier run. Change one in the data editor. Rewrites
   _data/directory/*.json in place, one record per line, with `kind` after
   `type`. Safe to run again after adding a year. */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '_data', 'directory');

// Leading street numbers: "36 ", "90 & 92 ", "122-28 ", "45a ", "17½ ".
const NUMBER = /^\d+[a-z½]?(?:\s*(?:,|&|and|-|–)\s*\d+[a-z½]?)*,?\s+/i;
const PLACE = /^\(?(vacant|empty|unoccupied|being built|building|in course of erection|allotments?|reserve(?! h)|ornamental reserve|right[- ]of[- ]way|fence)\b|cemetery|\bsquare\b|\bpark\b|bowling (green|gn)|\bbuilding$|being built/i;
const ORG = new RegExp('(&\\s*co\\b|\\band co\\b|\\bco\\.?\\s*(ltd|pty)|\\bltd\\b|\\bpty\\b|\\bpy\\.? ld\\b|\\bbros\\b|\\blimited\\b|' +
  '\\bhotel|\\bhtl\\b|\\binn\\b|\\bchurch|\\bchapel|\\bschool|\\bschl\\b|\\bbank\\b|\\bbk\\b|society|institut|hospital|' +
  '\\bworks\\b|factory|\\bfctry|company|\\bcorporation|association|\\bclub\\b|\\bhall\\b|\\bpost office|\\bdepot\\b|mission|' +
  'council|brewery|\\bmills?\\b|warehouse|\\bgarage|\\bstables?\\b|college|university|\\bboard\\b|\\bstation\\b|\\bpolice\\b|' +
  'telephone exchange|receiving box|\\bbuildings\\b|\\bco\\b|\\boffice\\b|laundry|\\blndry\\b|tea r(oo)?ms|serv(ice)? stn|\\barms\\b|\\bstbls\\b|\\bld\\b|foundry|\\bfndry\\b|kindergarten|fire stn|' +
  // A partnership: "Moore & Wheeler, grcrs", "Briggs and Patterson, grocers"
  "^[A-Z][A-Za-z'’\\-]+\\s+(&|and)\\s+[A-Z][A-Za-z'’\\-]+,)", 'i');
const TITLE = "(?:Mrs?\\.?|Misses|Miss|Dr\\.?|Rev\\.?|Capt\\.?|Major|Madame|Mdme\\.?|Sister|Sir)";
const PERSON = new RegExp(`^(?:${TITLE}\\s+)?(?:St\\.?\\s+)?[A-Z][A-Za-z'’\\-]+(?:\\s+[A-Z][A-Za-z'’\\-]+)?,\\s*(?:${TITLE}|[A-Z]|—|-)|^Ah [A-Z][a-z]+$`);

function kindOf(r) {
  if (/^(intersection|right-of-way)$/i.test(r.type || '')) return 'place';
  const listing = String(r.listing || '').trim().replace(NUMBER, '');
  if (!listing || PLACE.test(listing)) return 'place';
  // A surname can look like a business word ("Mills, Robert", "Hall, John"),
  // so a single word before the first comma doesn't count.
  const person = PERSON.test(listing);
  const surname = /^[^\s,]+,/.test(listing);
  if (ORG.test(person && surname ? listing.slice(listing.indexOf(',')) : listing)) return 'org';
  return person ? 'person' : 'unknown';
}

// `kind` goes after `type`, so records keep their usual field order.
function withKind(r, kind) {
  const out = {};
  Object.keys(r).forEach((k) => {
    out[k] = r[k];
    if (k === 'type') out.kind = kind;
  });
  if (!('kind' in out)) out.kind = kind;
  return out;
}

const files = fs.readdirSync(DIR).filter((n) => n.endsWith('.json')).sort().map((name) => {
  const file = path.join(DIR, name);
  const before = fs.readFileSync(file, 'utf8');
  return { file, before, records: JSON.parse(before) };
});

// Records the team linked under one text entityID are one person or one
// business. When the rules call any of a group's new records a business
// (one year printed "hotel", another "Hotel"), the rest of them are too.
const guessed = new Map();
const orgGroups = new Set();
files.forEach(({ records }) => records.forEach((r) => {
  if (r.kind) return;
  const kind = kindOf(r);
  guessed.set(r, kind);
  if (kind === 'org' && typeof r.entityID === 'string') orgGroups.add(r.entityID);
}));

const counts = {};
for (const { file, before, records } of files) {
  const out = '[\n' + records.map((r) => {
    if (r.kind) return r;
    let kind = guessed.get(r);
    if (orgGroups.has(r.entityID) && kind !== 'place') kind = 'org';
    counts[kind] = (counts[kind] || 0) + 1;
    return withKind(r, kind);
  }).map((r) => JSON.stringify(r)).join(',\n') + '\n]';
  fs.writeFileSync(file, before.endsWith('\n') ? out + '\n' : out);
}
console.log(Object.keys(counts).length ? counts : 'Every record already has a kind.');
