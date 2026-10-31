# Data schema

This page describes the two kinds of data the site is built from:

1. **Entries**: one TEI file per entry in `civic/` ([below](#entries-tei)).
2. **Records**: the directory and electoral-roll records, one JSON file per source and year in `_data/` ([below](#records-json)).

It documents what the files contain today. Where something is still to be agreed, it says so and links to the roadmap.

---

## Entries (TEI)

Every file in `civic/` is a [TEI P5](https://tei-c.org/guidelines/p5/) document written to the project's customisation, [`schema/carlton.odd`](../schema/carlton.odd). The schema generated from it is [`schema/carlton.rng`](../schema/carlton.rng); the README explains how to regenerate it after editing the ODD. The contribution form writes this format (`TEIEntry.build()` in `scripts/tei.js`) and entry pages read it (`TEIEntry.render()` in the same file).

### Filename and id

- The filename is the **slug** of the entry's name: spaces become `-`, and anything other than letters, digits, `_` and `-` is removed. `Mary Mather (Pelham Hotel)` → `civic/Mary-Mather-Pelham-Hotel.xml`. The slug logic is `slugifyId()` in `_layouts/entry.html`; a file whose name doesn't match the slug isn't found.
- `teiHeader/fileDesc/publicationStmt/idno[@type="entry"]` holds the same slug, without `.xml`.
- The site addresses entries by name: `civic?id=Corkman Hotel` opens `civic/Corkman-Hotel.xml`.

### Outline

```xml
<?xml-model href="https://historicalesque.github.io/carlton/schema/carlton.rng" type="application/xml"
            schematypens="http://relaxng.org/ns/structure/1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0" type="org" xml:lang="en">
  <teiHeader>      <!-- title, authors and credits, directory and roll citations, history of edits -->
  <standOff>       <!-- structured facts about the subject; optional -->
  <text>
    <body>         <!-- div type="summary", then div type="detail" -->
    <back>         <!-- div type="bibliography": the references -->
  </text>
</TEI>
```

### Entry types: `TEI/@type`

Required. One of:

| Value | Use for | Subject record in `standOff` |
|---|---|---|
| `person` | A person. | `listPerson/person` |
| `org` | A business or organisation: a hotel, brewery, school, society. | `listOrg/org` |
| `family` | A family. No longer offered by the form; a family is entered as a person. Kept so older files still display. | `listPerson/personGrp[@role="family"]` |
| `place` | A street, building, block or area. | `listPlace/place` |
| `topic` | A topic, such as cesspits or street numbering, and source pages such as a directory year. | none |
| `unknown` | The contributor didn't say. Editors change it before accepting. | none |

### `teiHeader`

| Element | Content |
|---|---|
| `fileDesc/titleStmt/title` | The entry's name, as shown on the page. |
| `fileDesc/titleStmt/author` | One per named author, shown first in the byline under the entry's title and in the page's `<meta name="author">`. Filled by the form's name fields when the contributor chooses *Credit me by name*. Anonymous contributions have none, and get the community credit below. |
| `fileDesc/titleStmt/respStmt[@key="community"]` | `<resp>Suggestions from</resp><name>the broader Carlton community</name>`: the entry includes suggestions sent through the form. Adds "the broader Carlton community" to the byline. |
| `fileDesc/titleStmt/respStmt[@key="computer-assisted-draft"]` | `<resp>Computer-assisted first draft</resp><name>Carlton Common Ground</name>`: the entry began as a computer-assisted draft from the directory and electoral-roll records. Adds "Built on a computer-assisted first draft." to the byline. |
| `fileDesc/titleStmt/respStmt[@key="computer-assisted-additions"]` | `<resp>Computer-assisted additions</resp><name>Carlton Common Ground</name>`: the entry was started by people, and substantial sections were later added from the directory and electoral-roll records with computer assistance. Adds "With computer-assisted additions." to the byline. |
| `fileDesc/publicationStmt/publisher` | Always `Carlton Common Ground`. |
| `fileDesc/publicationStmt/idno[@type="entry"]` | The slug (see above). |
| `fileDesc/publicationStmt/availability/licence` | `<licence target="https://creativecommons.org/licenses/by-nc/4.0/">CC BY-NC 4.0</licence>`: the licence the contributor agreed to. Older entries have none and are under the same licence (see the About page). |
| `fileDesc/publicationStmt/availability[@status="restricted"]` | The entry is kept as its author wrote it, with `<p>Kept as the author wrote it: not open for suggested changes.</p>`. Entry pages show a short note instead of the contribution form. Contributors credited by name can ask for this; editors turn it off by unticking *Keep this entry as I wrote it* (admin page, *Change a kept entry*). Without `status`, anyone can suggest changes. |
| `fileDesc/sourceDesc/listBibl/bibl` | The directory and electoral-roll citations, filled in by the form from the linked records. A directory listing links to that year's page (`civic?id=Sands-McDougall-Directory-1905`) and an electoral-roll record to `civic?id=Electoral-Rolls`. Entry pages list them under *In the directories and electoral rolls*. With none, `sourceDesc` holds a single `p`. Older entries keep all their sources here; any that don't link to a directory or roll page are shown as references. |
| `revisionDesc/@status` | `draft` for submissions, `published` once accepted. |
| `revisionDesc/change` | One per contribution or edit, with `@when` (ISO date) and `@type` (`created`, `converted`, …). The text says who and what. |

### `standOff`

All optional; the form only writes the parts the contributor filled in.

**The subject** carries `xml:id="subject"` so relations can point at it (`#subject`).

| Inside the subject | Meaning |
|---|---|
| `persName` / `orgName` / `placeName` / `name` (family) with `@type="main"` | The main name. A person's may be split into `forename` and `surname`. |
| The same element with `@type="alternative"` | Other names, optionally dated with `@from`/`@to`. |
| `birth`, `death` (people) | Dates in `@when`. |
| `@from`, `@to` on the subject (org, place) or `state[@type="presence"]` (family) | When it existed or was in Carlton. |
| `occupation` (people, families) | Occupation, optionally dated. |
| `state[@type="activity"]` (org), `state[@type="use"]` (place) | What it did, or what it was used as, in a `label`. |
| `state[@type="legal"]` | Legal status, such as a licence. |
| `residence` (people, families), `place[@type="address"]` (org), `location[@type="address"]` (place) | Addresses, each with a `placeName` (or `address/addrLine` for places), optional dates, and coordinates as `geo` (`latitude longitude`). |

**Chronology**: `listEvent[@type="chronology"]/event`, each with a date and a `label`, optionally a `place/placeName`. Shown on the entry page as the Chronology.

**Links to other entries**: `listRelation/relation`, with `@active="#subject"`, `@passive` the other entry's URL (`…/civic?id=…`), `@type` the other entry's type, `@name` the relationship as one word (`Supplier`, `Family-member`, `part-of`), and the other entry's name in `desc`.

### `text/body`: summary and detail

- `div[@type="summary"]`: "In a sentence or two, who or what was this?", as paragraphs. Shown as the entry's opening lines.
- `div[@type="detail"]`: "Tell us everything!", the article.

Sections are marked by their type, not their heading, so headings can be reworded. Older entries have paragraphs and untyped `div`s straight in `body`; they display as before, and move to the new structure when someone next edits them through the form. Site pages may give a `div` an `xml:id` (About's `<div xml:id="contribute">`), which becomes a section other pages can link to as `about#contribute`.

### `text/back`: references

`div[@type="bibliography"]/listBibl/bibl`, one per reference from "Where did you find this?" and the form's Sources rows, with a `ref/@target` where there's a link. Shown under *References*.

### Article markup

In the detail, paragraphs (`p`); each heading starts a new `div` with a `head`. Inline styles are `hi[@rend="italic|bold|underline"]`, links are `ref[@target]`, lists are `list[@rend="bulleted|numbered"]/item`, block quotes are `quote/p` (lines quoted one after another share one `quote`), tables are `table/row/cell`, and images from collections are `figure` with a `graphic[@url]` (the image), a `head` holding a `ref[@target]` back to the item (the caption), and a `figDesc` (the alt text). The form adds each image's item to the references too.

### Dates

ISO values in `@when`, `@from` and `@to`; a year (`1856`) or year and month (`1856-03`) is enough. `@cert="low"` marks a date the contributor gave as approximate, and entry pages show it as "c. 1856".

### Examples

- `civic/Corkman-Hotel.xml`: an `org` with a long article, headings and a table.
- `civic/Sands-McDougall-Directory-1905.xml`: a `topic` source page with a source and a `part-of` relation.
- Open any entry's form, switch on *Add more detail* and use *Preview* (*Show the TEI XML*) to see every optional part filled in.

### Checking an entry

```bash
xmllint --noout civic/Corkman-Hotel.xml                                 # well-formed
jing schema/carlton.rng civic/Corkman-Hotel.xml                         # valid
```

Oxygen and other XML editors pick up the schema from the `<?xml-model?>` line at the top of each file.

### Still to settle

Tracked in roadmap §4: fixed lists for `div`, `state` and `relation` types, a readable style guide generated from the ODD with one example per type, and the mapping from the partners' EAC-CPF types to these entry types.

---

## Records (JSON)

The Sands & McDougall directory and electoral-roll records. One file per source and year, each a JSON list with one record per line:

```
_data/directory/1857.json … 1940.json        (36 files, 26,785 records)
_data/electoral-roll/1905.json, 1919.json, 1928.json    (3 files, 3,235 records)
```

Directory records cover only the project area: south of Grattan Street, west of Swanston Street, east of Elizabeth Street and north of Victoria Street.

Jekyll publishes compact copies in `data/` and a list of the files in `data/index.json`; see the README's *Data* section for how the browser loads them.

### Fields in use today

| Field | Type | In | Notes |
|---|---|---|---|
| `entityID` | number or string | all | See [below](#entityid). |
| `source` | string | all | `"Directory"` or `"Electoral roll"`. Decides whether a record appears under Directories or Electoral rolls in search. |
| `year` | number | all | Year of the directory edition or roll. |
| `type` | string | all | `Place`, `Intersection` or `right-of-way` in the directories. Electoral-roll records are all `"Voter"`. |
| `kind` | string | directory | What the listing is about, using the entry types: `person`, `org`, `place` or `unknown`. See the README's *Data* section. Electoral-roll records have none: they are all people. |
| `listing` | string | all | The listing as transcribed. For electoral rolls, a summary line built from the other fields. Intersections (`type` `Intersection`) follow one convention instead of the directory wording: `Intersection A street and B street`, the two streets in alphabetical order, generic words in lower case and spelled out (`street`, `place`, `terrace`, `cottages`, `Little`), and the sides of Lincoln Square as `Lincoln square north` / `Lincoln square south` (`Lincoln place north` / `south` before 1910). So the same corner has the same name whichever street it is listed under. |
| `street` | string | all | Street name. Spellings are kept as transcribed, because variants can matter historically. |
| `cardinality` | string | nearly all | Side of the street: `North`, `South`, `East` or `West`. Missing or empty on about 1,100 directory records. |
| `pages` | string (a few numbers) | directory | Page reference(s) in the directory, such as `"172"` or `"241-242"`. |
| `lat`, `lng` | number or `null` | some | Coordinates. About 6,550 directory records have them. A record without them is drawn between its mapped neighbours on the same street and side; a street side with none in a year is left off the map. |
| `coordConfidence` | string | records with a point | How sure we are of the point: `high`, `medium` or `low`, or `street` when only the street is known (the 1857 and 1858 listings that can't be traced in later years; see [below](#how-the-1857-and-1858-records-are-placed)). Missing on points added before October 2026, which are not yet rated. |
| `coordSource` | string | records with a point | Where the point comes from, e.g. `"MMBW detail plan 1177 (c. 1895)"` or `"Mitchell, from Google Maps (24 Oct 2026)"`. |
| `coordNote` | string | some records with a point | How the point was worked out, e.g. `"house No. 93 on the plan"` or `"same name on this street in every directory from 1880 to 1890, where it is No. 55"`. |
| `Occupation` | string | electoral rolls, some directory | |
| `Notes` | string | some | A remark about the record, e.g. `"Printed without a space after the comma"`. Shown as "Note: …" with the record. |
| `Roll` | string | electoral rolls (1905, 1919) | The roll's heading as printed, e.g. `"Electoral Roll, Division of Melbourne, Cardigan Polling Place"` or `"Electoral Roll, Division of North Melbourne, Carlton South Polling Station"`. Held in `Notes` before October 2026. |
| `Surname`, `Given Names`, `Gender` | string | electoral rolls | |
| `Subdivision` | string | electoral rolls | The roll's subdivision, `"Cardigan"`, or `"Carlton South"` for the 1905 voters west of Cardigan (Barry, Berkeley, Leicester, Grattan, Elizabeth and Sydney Road, the University and the Training College). |
| `Registration Number` | number | electoral rolls | Kept in the data and searchable in the admin data editor, but not shown at the start of a listing or matched by the public search. |
| `Address` | string | electoral rolls | As printed, e.g. `"29 Barkly Place"`. |
| `Street Number` | string or number | electoral rolls | |

Directory example:

```json
{"entityID":2,"source":"Directory","year":1900,"pages":"172","listing":"Intersection Barry street and Leicester street","street":"Barry Street","type":"Intersection","cardinality":"East","lat":-37.8037,"lng":144.9604}
```

Electoral-roll example:

```json
{"entityID":1001209,"source":"Electoral roll","type":"Voter","year":1919,"listing":"Clara Larkin, 29 Barkly Place, home duties, F","Registration Number":1260,"Surname":"Larkin","Given Names":"Clara","Address":"29 Barkly Place","Street Number":"29","street":"Barkly Place","cardinality":"North","Occupation":"home duties","Gender":"F","Subdivision":"Cardigan","Roll":"…","lat":-37.8029738,"lng":144.9613147}
```

### Map points: `_data/points.csv`

The evidence behind the points, kept apart from the records. One row per thing read off a source map, with the source, the position, a confidence and a note:

| Column | Notes |
|---|---|
| `place` | What the point is: a house (`Bouverie Street 93`), a corner (`Alma Street & Leicester Street`), a landmark (`Baptist Hall`), or a corner used to fit the sheet (`control corner LQ`). |
| `kind` | `house number`, `street corner`, `landmark` or `fit control`. |
| `source`, `sheet` | The map and sheet number. |
| `x`, `y` | Pixel position on the full-size scan of the sheet (two values, `a/b`, when read on two sheets). |
| `lat`, `lng` | The position on today's map, from an affine fit of the sheet to street corners already in the data (for the Mahlstedt sheets, to the 1895 house points). |
| `confidence`, `note` | As for the record fields above. |

How the confidence is set for records placed from the 1895 MMBW plans:

- `high`: a numbered house in 1895 read clearly on the plan; the same occupant at the same number in any year from 1890 to 1945; a landmark named in 1890–1900; a corner drawn on the plan.
- `medium`: a numbered house from 1890 to 1945 with a different occupant (the numbering is assumed unchanged from 1895: between each pair of editions from 1890 to 1945, 76–95% of the names listed on a street keep the same number); a Swanston Street house from 1930, placed at its old Madeline Street number (516 lower on the west side, from occupants listed under both); a number not printed on the plan, placed between its printed neighbours or on the lot that holds it; a landmark in other years; the first house of a named terrace or cottage row; a plan reading marked uncertain.
- `low`: a number on a large site with no house numbers printed (e.g. the flour mill on Leicester Street), placed along its frontage by the number; a name carried back before 1890, when the street numbers changed, because the same name is listed on the same street in every directory back to that year; a terrace placed in another year.

The Mahlstedt fire survey plans (sheets 18A, 19A, 21A and 22A, 1923–28; see the [Mahlstedt plans entry](https://historicalesque.github.io/carlton/civic?id=Mahlstedt%20Fire%20Survey%20Plans)) add a second layer for the 1920s. Each house number read on them is a row in `points.csv` (source `Mahlstedt fire survey plan 22A (1923-28)` and so on), with its distance from the 1895 point for the same number in the note. Each sheet is fitted to the 1895 points for the numbers printed on both (median difference 1.5–3 m), not to corners. Where the two disagree by more than 15 m the street was renumbered in between: Leicester Street east side south of Queensberry Street (Nos. 16–32) and Bouverie Street west side near Alma Place (Nos. 21–25). Swanston Street is printed with its new numbers, 516 above the old Madeline Street ones on the west side, as the 1930 directory shows. The confidence rules for records from 1919 to 1945:

- `high`: a number read clearly on a Mahlstedt sheet, in the 1925 or 1930 directory or the 1928 roll (the years the sheets were drawn).
- `medium`: the same in 1919, 1920 and 1935–1945 (numbering assumed unchanged from 1923–28; in 1919 and 1920 only where the 1895 plan agrees); a reading marked uncertain; a 1919 or 1928 roll entry at a number only on the 1895 plans (numbering assumed unchanged from 1895; not in the renumbered stretches).

Records already placed from the 1895 plans keep their point when the Mahlstedt sheet agrees, and in 1925, 1928 and 1930 go up to `high`; from 1925 they move to the Mahlstedt point when it is more than 15 m away. The script and readings are kept with the project files (`mahlstedt-1923-28/`).

### How the 1857 and 1858 records are placed

These two directories list each street alphabetically by surname, mostly without house numbers, so the map can't place a record between its neighbours as it does in later years. Every record has a point of its own instead, worked out in this order:

- **Read off the 1895 MMBW plans** (`medium`): hotels and the flour mills, as for the later years.
- **Linked to a landmark** (`medium`): a hotel the team has linked (same text `entityID`) to a later record that is placed from the plans; assumed on the same site.
- **Linked by the team** (`low`): the same text `entityID` in a later year, without a plan point; placed where the map draws the earliest later record.
- **Same name on the same street** (`low`): the same surname and given names (or matching initials) on the same street in 1859–1880, allowing a one-letter spelling difference in longer surnames; placed where the map draws the earliest of those listings, nudged onto its side of the street.
- **Street only** (`street`): everyone else. The points are spread evenly along the street between its corners in the project area, in the directory's order, so the year shows on the map; they do not show where the listing was. Both maps draw them faded.

`coordSource` names the later directory used and `coordNote` gives the later listing, its number, side and cross streets. The maps put these two years' records in street order before drawing the street line (`sortAlongStreet` in `scripts/map-common.js`). The script that made the points is kept with the project files (`directory-1857-1858-coords/`).

### `entityID`

- A **number** is the record's own id. Directory records count up from 1 and electoral-roll records from 999999, so the two sources never share a number.
- A **string** means someone on the team has linked several records as the same person or place, under a name they chose, e.g. `"Corkman Hotel"`. If an entry exists with the same name (`civic/Corkman-Hotel.xml`), the maps, search and the entry link to each other. About 1,300 directory records are linked this way.

### Proposed changes (to agree)

Roadmap §1 asks the team to agree a cleaner schema. A suggestion to start from, not yet applied to any file:

| Today | Proposed |
|---|---|
| `Surname`, `Given Names`, `Registration Number`, `Street Number`, `Address`, `Occupation`, `Gender`, `Subdivision`, `Roll`, `Notes` | `surname`, `givenNames`, `registrationNumber`, `streetNumber`, `address`, `occupation`, `gender`, `subdivision`, `roll`, `notes` |
| `entityID` (number or string) | `id`: always the record's own number; `linkId`: the shared name for linked records, only when set |
| `pages` (string or number) | `pages`: always a string |
| `cardinality` | `side` |

Required in every record: `id`, `source`, `year`, `listing`, `street`. Everything else optional.

Renaming touches every page that reads the records (`scripts/data.js`, `scripts/map-common.js`, `scripts/search.js`, the facet lists, the form's pre-fill and the data editor) and every data file, so it should land as one change once the names are agreed, with the data editor updated in the same change.
