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
  <teiHeader>      <!-- title, authors, sources, history of edits -->
  <standOff>       <!-- structured facts about the subject; optional -->
  <text><body>     <!-- the article -->
</TEI>
```

### Entry types: `TEI/@type`

Required. One of:

| Value | Use for | Subject record in `standOff` |
|---|---|---|
| `person` | A person. | `listPerson/person` |
| `org` | A business or organisation: a hotel, brewery, school, society. | `listOrg/org` |
| `family` | A family. | `listPerson/personGrp[@role="family"]` |
| `place` | A street, building, block or area. | `listPlace/place` |
| `topic` | A topic, such as cesspits or street numbering, and source pages such as a directory year. | none |
| `unknown` | The contributor didn't say. Editors change it before accepting. | none |

### `teiHeader`

| Element | Content |
|---|---|
| `fileDesc/titleStmt/title` | The entry's name, as shown on the page. |
| `fileDesc/titleStmt/author` | One per author. Entry pages show no byline at the moment; the names go into the page's `<meta name="author">`. |
| `fileDesc/publicationStmt/publisher` | Always `Common Ground`. |
| `fileDesc/publicationStmt/idno[@type="entry"]` | The slug (see above). |
| `fileDesc/sourceDesc/listBibl/bibl` | One per source the authors used, usually with a `ref/@target` link. A directory listing links to that year's page (`civic?id=Sands-McDougall-Directory-1905`) and an electoral-roll record to `civic?id=Electoral-Rolls`. With no sources, `sourceDesc` holds a single `p` saying so. |
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

### `text/body`: the article

Paragraphs (`p`); each heading starts a new `div` with a `head`. Inline styles are `hi[@rend="italic|bold|underline"]`, links are `ref[@target]`, lists are `list[@rend="bulleted|numbered"]/item`, and tables are `table/row/cell`.

### Dates

ISO values in `@when`, `@from` and `@to`; a year (`1856`) or year and month (`1856-03`) is enough. `@cert="low"` marks a date the contributor gave as approximate, and entry pages show it as "c. 1856".

### Examples

- `civic/Corkman-Hotel.xml`: an `org` with a long article, headings and a table.
- `civic/Sands-McDougall-Directory-1905.xml`: a `topic` source page with a source and a `part-of` relation.
- Run any entry through the form's *Show all fields* switch and *Download XML* to see every optional part filled in.

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
_data/directory/1880.json … 1930.json        (8 files, 9,338 records)
_data/electoral-roll/1919.json, 1928.json    (2 files, 1,525 records)
```

Jekyll publishes compact copies in `data/` and a list of the files in `data/index.json`; see the README's *Data* section for how the browser loads them.

### Fields in use today

| Field | Type | In | Notes |
|---|---|---|---|
| `entityID` | number or string | all | See [below](#entityid). |
| `source` | string | all | `"Directory"` or `"Electoral roll"`. Decides whether a record appears under Places or People. |
| `year` | number | all | Year of the directory edition or roll. |
| `type` | string | all | What the listing is, as transcribed (`Hotel`, `Intersection`, `Place`, …). Electoral-roll records are all `"Voter"`. |
| `listing` | string | all | The listing as transcribed. For electoral rolls, a summary line built from the other fields. |
| `street` | string | all | Street name. Spellings are kept as transcribed, because variants can matter historically. |
| `cardinality` | string | nearly all | Side of the street: `North`, `South`, `East` or `West`. Missing or empty on about 30 directory records. |
| `pages` | string (a few numbers) | directory | Page reference(s) in the directory, such as `"172"` or `"241-242"`. |
| `lat`, `lng` | number or `null` | some | Coordinates. About 1,450 records have them; only these appear on the map. |
| `Occupation`, `Notes` | string | electoral rolls, some directory | |
| `Surname`, `Given Names`, `Gender` | string | electoral rolls | |
| `Registration Number` | number | electoral rolls | |
| `Address` | string | electoral rolls | As printed, e.g. `"29 Barkly Place"`. |
| `Street Number` | string or number | electoral rolls | |

Directory example:

```json
{"entityID":2,"source":"Directory","year":1900,"pages":"172","listing":"Intersection Barry street and Leicester street","street":"Barry Street","type":"Intersection","cardinality":"East","lat":-37.8037,"lng":144.9604}
```

Electoral-roll example:

```json
{"entityID":1001209,"source":"Electoral roll","type":"Voter","year":1919,"listing":"Registration Number:1260, Clara Larkin, 29 Barkly Place, home duties, F","Registration Number":1260,"Surname":"Larkin","Given Names":"Clara","Address":"29 Barkly Place","Street Number":"29","street":"Barkly Place","cardinality":"North","Occupation":"home duties","Gender":"F","Notes":"…","lat":-37.8029738,"lng":144.9613147}
```

### `entityID`

- A **number** is the record's own id. Directory records count up from 1 and electoral-roll records from 999999, so the two sources never share a number.
- A **string** means someone on the team has linked several records as the same person or place, under a name they chose, e.g. `"Corkman Hotel"`. If an entry exists with the same name (`civic/Corkman-Hotel.xml`), the maps, search and the entry link to each other. About 1,900 directory records are linked this way.

### Proposed changes (to agree)

Roadmap §1 asks the team to agree a cleaner schema. A suggestion to start from, not yet applied to any file:

| Today | Proposed |
|---|---|
| `Surname`, `Given Names`, `Registration Number`, `Street Number`, `Address`, `Occupation`, `Gender`, `Notes` | `surname`, `givenNames`, `registrationNumber`, `streetNumber`, `address`, `occupation`, `gender`, `notes` |
| `entityID` (number or string) | `id`: always the record's own number; `linkId`: the shared name for linked records, only when set |
| `pages` (string or number) | `pages`: always a string |
| `cardinality` | `side` |

Required in every record: `id`, `source`, `year`, `listing`, `street`. Everything else optional.

Renaming touches every page that reads the records (`scripts/data.js`, `scripts/map-common.js`, `scripts/search.js`, the facet lists, the form's pre-fill and the data editor) and every data file, so it should land as one change once the names are agreed, with the data editor updated in the same change.
