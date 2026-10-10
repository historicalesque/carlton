# Common Ground: Community Histories of the Campus Precinct, 1850s–1950s

**Live site:** https://historicalesque.github.io/carlton/

> ### Looking to explore or contribute? You probably want the website, not this page.
>
> This page is the technical documentation for the people who build and maintain the site.
>
> - **Read about the project:** [About Common Ground](https://historicalesque.github.io/carlton/)
> - **Search everything:** [Search](https://historicalesque.github.io/carlton/search) finds entries, directory listings and electoral-roll records in one box.
> - **Browse the histories:** [Featured pages A–Z](https://historicalesque.github.io/carlton/aToZ) · [Map](https://historicalesque.github.io/carlton/map) · [Directories](https://historicalesque.github.io/carlton/directories) · [Electoral rolls](https://historicalesque.github.io/carlton/electoral-rolls)
> - **Share a story or add to an entry:** open any entry on the site and use the *Contribute* form at the bottom, or [start a new entry](https://historicalesque.github.io/carlton/new).
> - **Editorial team:** start at the [Admin page](https://historicalesque.github.io/carlton/admin/), which links to each editorial tool. To review submissions, read them on the [Submission review page](https://historicalesque.github.io/carlton/admin/review.html), then accept or reject each one in the Decision column of the team's submissions spreadsheet.
> - **Project partners:** [Melbourne History Workshop](https://melbournehistoryworkshop.com) · [Carlton Community History Group](https://cchg.asn.au)

---

## Contents

- [Overview](#overview)
- [How the site works](#how-the-site-works)
- [Repository layout](#repository-layout)
- [Running the site locally](#running-the-site-locally)
- [Content: encyclopedia entries (TEI XML)](#content-encyclopedia-entries-tei-xml)
- [Data: directories and electoral rolls](#data-directories-and-electoral-rolls)
- [Editorial workflows](#editorial-workflows)
- [Adding a new page or facet](#adding-a-new-page-or-facet)
- [External services and dependencies](#external-services-and-dependencies)
- [Known issues and gotchas](#known-issues-and-gotchas)
- [Roadmap](#roadmap)
- [Licence](#licence)
- [Credits and acknowledgements](#credits-and-acknowledgements)

---

## Overview

Common Ground is a static website hosted on **GitHub Pages** and built with **Jekyll**, using the `jekyll-theme-cayman` theme with a custom layout. It has no server or database of its own:

- **Encyclopedia entries** are XML files in `civic/`. The browser fetches them and renders them on the fly. Existing entries are [EAC-CPF](https://eac.staatsbibliothek-berlin.de/); entries are moving to [TEI](https://tei-c.org/guidelines/p5/) (roadmap §4), and entry pages show both.
- **Historical directory data** (Sands & McDougall directories and electoral rolls) is one JSON file per source and year in `_data/`. Jekyll publishes compact copies in `data/` plus an index, and each page loads only the files it needs through `scripts/data.js`.
- **Public contributions** go through a Google Apps Script web app. The form builds each entry as TEI and sends it to the script in `apps-script/Code.gs`, which saves a copy to a Google Sheet in the team's shared Google Drive folder, then opens a pull request on this repository. The form only sends once `contribution_endpoint` is set in `_config.yml` (setup: `apps-script/README.md`). The sheet is a user-friendly backup while the submission process is being settled. The editorial team then picks *Accept* or *Reject* in the Sheet's Decision column, and the script merges or closes the pull request straight away.

The project is deliberately a **perpetual work in progress**. Gaps in the data and entries that don't exist yet are invitations for the community to contribute, not defects.

Nothing is published until a pull request is merged into `main`. GitHub Pages rebuilds the site automatically after each merge, usually within a minute or two.

## How the site works

```
                 ┌──────────────────────────── GitHub Pages (Jekyll) ───────────────────────────┐
 Visitor ──────▶ │  index / search / aToZ / directories / electoral-rolls / map(3d) / civic?id=…  │
                 │        │                                   │                                  │
                 │        ▼                                   ▼                                  │
                 │   data/index.json + data/<source>/   civic/<slug>.xml  (fetched + parsed     │
                 │   <year>.json via scripts/data.js     in the browser by _layouts/entry.html) │
                 └──────────────────────────────────────────────────────────────────────────────┘

 Contributor ──▶ form (_layouts/form.html, Quill editor; builds the entry as TEI)
                   │  POST { xml } once contribution_endpoint is set in _config.yml
                   ▼
                 apps-script/Code.gs web app ─▶ 1. copy to Google Sheet (team shared Drive, backup)
                                            ──▶ 2. new branch + civic/<slug>.xml + pull request
                                                         │
 Anyone ────▶ admin/ ▶ review.html ── lists open PRs touching civic/, previews them,
                                       before/after table for new versions of entries
 Editor ─────▶ Google Sheet: Decision column (Accept / Reject)
                                                         │  straight away (apps-script/Code.gs)
                                                         ▼
                                       merge the PR (accept)  /  close the PR (reject)
```

### Entry pages

`civic.md` uses `_layouts/entry.html`. A URL such as `civic?id=Corkman Hotel`:

1. turns the `id` into a filename slug (`Corkman-Hotel`);
2. fetches `civic/Corkman-Hotel.xml`;
3. parses the XML and renders it: TEI entries with `TEIEntry.render()` from `scripts/tei.js`, older EAC-CPF entries (namespace `urn:isbn:1-931666-33-4`) with the code in the layout;
4. adds the contribution form underneath. If no file exists yet, the form takes the entry's place so the community can create it. The form (`_layouts/form.html`, in an iframe) reports its height to the entry page, which sizes the iframe to fit.

**Site pages are entries too.** The front page, Featured pages and About are `civic/Home.xml`, `civic/Featured-pages.xml` and `civic/About.xml`, listed as `site_pages` in `_config.yml`. Their `.md` pages (`index.md`, `aToZ.md`, `about.md`) use the entry layout and name the file with `entry_id`, so the addresses stay the same. They keep the look of an ordinary page (full-size title, no entry type, no map link), are left out of search, and instead of the contribution form have a small *Suggest an edit to this page* link at the foot, meant for the wider team rather than the public. Suggested edits go through the same form, pull request and Sheet decision as entries. To add another site page, add its file name to `site_pages` and give its `.md` page `layout: entry` and `entry_id`.

With `preview=true`, `id` can be a full URL, such as a raw file on a pull-request branch. This is how `admin/review.html` previews submissions before they are merged. Preview mode also hides the banner, menu, footer and contribution form, so the review frame shows just the article.

### Search, facets and maps

- **Search page** (`search.md` → `_layouts/search.html` + `scripts/search.js`): one box that searches the entries in `civic/` and every directory and electoral-roll record together, using [MiniSearch](https://github.com/lucaong/minisearch) (vendored in `scripts/vendor/`, MIT). Jekyll lists the entry files into the page at build time and the browser fetches them as ordinary site files (no GitHub API calls). Entries are searchable at once; records join the index as each year's file arrives. Results are grouped into Entries, Directory listings and Electoral rolls, filtered by dataset rather than by "people" or "places", since directory listings name residents as well as businesses; records that share a text `entityID` collapse into one result with a row of years. Matching is by prefix with small typos allowed, and a `VARIANTS` list at the top of `scripts/search.js` folds historical spellings and abbreviations together (Berkley/Berkeley, htl → hotel, Wm → William, …); add pairs there. Occupations are searched too: a record's `Occupation` (so "grocer" finds listings abbreviated "grcr"), and an entry's occupations, activities or uses. A record card shows the occupation in full when its listing abbreviates it, and an occupation links to a search for everything else with that trade. The search is kept in the address (`search?q=grocer&year=1910&street=…&src=rolls`; `src` is `entries`, `directories` or `rolls`), so it can be shared. If nothing matches, it offers to start a new entry with that name.
- **Directories / Electoral rolls** (`directories.md`, `electoral-rolls.md` → `_layouts/facet-list.html`): load only the files for one `source`. Results are grouped by source/year → street → side of street, and each year is drawn as soon as its file arrives (oldest first). Within each year the streets are sorted, so each street appears once per year, and the contents list shows the year after each street (e.g. "Bouverie Street (1905) listings").
- **Map** (`_layouts/map.html`): Leaflet 1.9.4. It plots records that have `lat`/`lng`, with University of Melbourne land parcels (`data/uom-land-parcels.geojson`) as an overlay. Both maps set up their years and controls from `data/index.json` and draw each year as soon as its file arrives. Records without coordinates are placed between mapped ones from the same year and street, so they are drawn with their year; cross-year links are added once every year has arrived.
- **3D Map** (`_layouts/map3d.html`): three.js r128 with OrbitControls. Experimental. It shows the records only: the historic map layers and land parcels stay on the 2D map.
- Both maps share `scripts/map-common.js` (data loading, year colours, cross-year links from string `entityID`s, marker shapes) and the details popup in `_includes/map-details-modal.html`, which links to the record's entry ("Read the entry" when `civic/<entityID>.xml` exists, "Start an entry" otherwise). The 2D map also takes `map?entity=<entityID>`: it ticks the years that entity appears in, rings its markers and zooms to them. Entries link there with "See on the map" when the map draws at least one of their records.
- **Featured pages A–Z** (`civic/Featured-pages.xml`, shown by `aToZ.md` + `scripts/az-status.js`): the list itself is a site-page entry, one heading per letter. Jekyll lists the files in `civic/` into the page at build time, and once the entry is drawn the script adds the letter index, legend and *Back to top* links, and marks links with no entry yet (pencil icon, "Not yet written") and entries created in the last 14 days ("New"). A legend above the letter index explains both.

## Repository layout

| Path | What it is |
|---|---|
| `_config.yml` | Jekyll config. Sets the theme and per-page defaults (layout, `EACCPFpath`, `facet`, whether the contribution form shows). |
| `_layouts/default.html` | Site shell: header, navigation, sidebar and footer. Does **not** load any data; layouts that need it load it through `scripts/data.js`. |
| `_layouts/search.html`, `scripts/search.js` | Search page (see [Search, facets and maps](#search-facets-and-maps)). |
| `_layouts/entry.html` | Fetches and renders one entry (TEI, or EAC-CPF for any older file), and adds the contribution form. |
| `_layouts/form.html` | Contribution form (Quill 1.3.6). Builds the entry as TEI, with optional extra sections and a *Show all fields* switch. Not connected yet: it previews the entry and downloads the XML. |
| `_layouts/new.html` | "Start a new entry" box that redirects to `civic?id=…`. |
| `_layouts/facet-list.html` | Directories / Electoral rolls listings. |
| `_layouts/map.html`, `_layouts/map3d.html` | 2D Leaflet map and 3D three.js map. |
| `scripts/map-common.js`, `_includes/map-details-modal.html` | Functions and the details popup shared by both maps. |
| `*.md` (root) | One small file per page. Mostly front matter that picks a layout. `index.md`, `aToZ.md` and `about.md` show site-page entries from `civic/` (see [Entry pages](#entry-pages)). |
| `civic/*.xml` | Published encyclopedia entries (TEI). See `docs/SCHEMA.md`. |
| `_data/directory/<year>.json`, `_data/electoral-roll/<year>.json` | The directory and electoral-roll records, one file per source and year, one record per line. **Edit these.** See [Data](#data-directories-and-electoral-rolls). |
| `data/` | What the browser downloads, generated from `_data/` by Jekyll: one small page per data file, `data/index.json` (the list of files), and `uom-land-parcels.geojson` (University of Melbourne land parcels). |
| `scripts/data.js` | Shared data loader used by every page that shows records. |
| `scripts/tei.js` | Builds an entry as TEI from the contribution form, checks it, renders TEI entries (entry pages and the form's preview), and reads an entry back into the form's fields (`parse`, for *Suggest changes*). |
| `scripts/tei-compare.js` | Before/after table of two TEI entries (field by field, then the article paragraph by paragraph), used by the review page for new versions of existing entries. |
| `schema/carlton.odd`, `schema/carlton.rng` | The TEI entry format: the customisation (with its documentation) and the schema generated from it. |
| `tools/convert-map-data.js` | One-off script that split the old `map-data.js` into the files in `_data/`. |
| `apps-script/Code.gs`, `apps-script/README.md` | The Google Apps Script that receives contribution form entries, saves a row to the Sheet and opens a pull request, and how to set it up. The repo copy is the master; it's pasted into the Sheet's script editor. |
| `tools/convert-eac-to-tei.html` | One-off page that converted the EAC-CPF entries in `civic/` to TEI with `scripts/tei.js`. Not linked from the site. |
| `admin/index.html` | Admin landing page for the editorial team, linking to each tool (served at `admin/`). The site footer links here. |
| `admin/review.html` | Plain-language review page: previews submissions and, for new versions of entries, what would change. Open to everyone; editors decide in the Sheet. |
| `admin/carlton-data-editor.html` | Browser-based editor for the directory and electoral-roll files. *Send changes* sends them through the Apps Script for the editors to accept or reject. |
| `scripts/az-status.js` | Marks Featured pages links as "New" or "Not yet written". |
| `scripts/banner-parallax.js` | Header banner effect. |
| `scripts/vendor/` | Third-party scripts saved into the repo (MiniSearch). |
| `styles/site.css` | Site styles. |
| `images/` | Static images. |
| `docs/SCHEMA.md` | Reference for the entry format (TEI) and the record fields (JSON). |
| `docs/proposals/` | Design proposals for work that hasn't started. |
| `CONTRIBUTING.md` | How to propose a change, entry and data conventions. |
| `Gemfile` | Ruby gems for building the site locally. |

## Running the site locally

You need Ruby (3.x) and Bundler. The `Gemfile` installs the `github-pages` gem, which pins Jekyll and its plugins to the versions GitHub Pages uses, so a local build matches the live site. Then:

```bash
bundle install
bundle exec jekyll serve
# open http://127.0.0.1:4000/
```

Notes:

- Internal links leave out `.html` (e.g. `civic?id=…`). GitHub Pages handles this, and `jekyll serve` normally does too. If a link 404s locally, try adding `.html`.
- `admin/review.html` reads from the live GitHub repo. `admin/carlton-data-editor.html` loads the data from the site it's served from, so locally it shows your local files. Its *Send changes* still goes to the live Apps Script and opens a real pull request (reject it in the Sheet afterwards), and refuses any record that differs from the live copy.
- Once `contribution_endpoint` is set, sending the contribution form locally **creates a real pull request** through the live Apps Script. Close any test pull requests afterwards.

## Content: encyclopedia entries (TEI XML)

Every entry in `civic/` is a TEI file, written to the project customisation in `schema/carlton.odd`. **The full reference is [`docs/SCHEMA.md`](docs/SCHEMA.md)**; the conventions for adding or editing entries are in [`CONTRIBUTING.md`](CONTRIBUTING.md). For a full example, see `civic/Corkman-Hotel.xml`.

- **Filename = slug of the entry ID**: spaces become `-`, anything other than letters, digits, `_` and `-` is removed, and the file goes in `civic/`, e.g. `Mary Mather (Pelham Hotel)` → `civic/Mary-Mather-Pelham-Hotel.xml`. The slug logic is `slugifyId()` in `_layouts/entry.html`. A file that doesn't match the slug won't be found. `<idno type="entry">` holds the same slug.
- `<revisionDesc>` has one `<change>` per contribution or edit.
- To add an entry to the A–Z, add a link under its letter in `civic/Featured-pages.xml` (or suggest an edit to the Featured pages page).

Open questions to settle: fixed lists for `div`, `state` and `relation` types, and what to do with entries that have two names (e.g. *Carlton Inn* / *Corkman Hotel*). See roadmap §4.

### The schema

The format is described in `schema/carlton.odd`, and `schema/carlton.rng` is the schema generated from it. The contribution form already writes this format. In short, `<TEI type="person|org|family|place|topic">` holds a `teiHeader` (title, authors, sources, one `change` per edit), a `standOff` with the subject's structured facts (`xml:id="subject"`), the chronology and links to other entries, and the article in `text/body`.

To regenerate the schema after editing `carlton.odd`, you need Java, Saxon HE, the [TEI Stylesheets](https://github.com/TEIC/Stylesheets) and a `p5subset.xml` for TEI P5 4.12.0:

```
java -jar saxon.jar -s:schema/carlton.odd -xsl:Stylesheets/odds/odd2odd.xsl -o:carlton.compiled.odd defaultSource=p5subset.xml
java -jar saxon.jar -s:carlton.compiled.odd -xsl:Stylesheets/odds/odd2relax.xsl -o:schema/carlton.rng
```

## Data: directories and electoral rolls

The records come from public-domain sources: the **Sands & McDougall Directories of Victoria** and **Victorian electoral rolls**. There is one JSON file per source and year:

```
_data/directory/1857.json … 1940.json
_data/electoral-roll/1919.json, 1928.json
```

Each file is a JSON list with **one record per line**, so a change to a record shows up on GitHub as a one-line change. These are the files to edit.

**How the browser gets them.** Jekyll can read files in `_data/` but doesn't publish them, so on every build it generates:

- `data/directory/1905.json` etc.: compact copies for the browser. Each is a three-line page (`{{ site.data["directory"]["1905"] | jsonify }}`).
- `data/index.json`: the list of files, with each file's source, year, record count, range of numeric `entityID`s, every text `entityID` it uses, and the edges of its mapped records (`bounds`: south, north, west, east; the 3D map sizes its planes from these). The edges leave out records more than about 2 km from the file's middle, so a mistyped coordinate doesn't shrink the 3D map into a corner. This lets a page find the files it needs, e.g. the contribution form fetches only the files that hold records for that entry.

Pages load the data through `scripts/data.js` (`CGData.load(...)`, `CGData.forEntity(id)`), which fetches each file at most once, shows "Loading the 1905 directory… (4 of 9)" while it works, and offers *Try again* if a file fails.

**Adding a new year:** add `_data/<source>/<year>.json`, then copy one of the small pages in `data/<source>/` to `data/<source>/<year>.json` and change the year in it. The index picks it up automatically.

| Source | Years | Records |
|---|---|---|
| Directory (Sands & McDougall) | 1857, 1858, 1859, 1862, 1863, 1865, 1867, 1868, 1870, 1876, 1880, 1890, 1895, 1900, 1905, 1910, 1915, 1920, 1925, 1930, 1935, 1940 | ~55,100 |
| Electoral roll | 1919, 1928 | ~1,500 |

Typical record:

```json
{
  "entityID": 2,
  "source": "Directory",
  "year": 1900,
  "pages": "172",
  "listing": "Intersection Barry street and Leicester street",
  "street": "Barry Street",
  "type": "Intersection",
  "cardinality": "East",
  "lat": -37.8037,
  "lng": 144.9604
}
```

| Field | Notes |
|---|---|
| `entityID` | Usually a number: directories count up from 1, electoral rolls from 999999, so the two never share a number (the rolls were renumbered from 7034–8558 when the data was split, because they overlapped the 1930 directory). A **string** (e.g. `"Bridget O'Neill"`) means someone on the team has decided that several records are the same person or place, and linked them under a new ID they created for that purpose. Many records share a string ID on purpose; the search page shows each linked group as one result with a row of years, and links it to the entry of the same name if there is one (e.g. the Carlton Inn listings are linked under `"Corkman Hotel"`). |
| `source` | `"Directory"` or `"Electoral roll"`. This decides whether a record appears under Directories or Electoral rolls. |
| `year`, `pages`, `listing`, `street`, `type`, `cardinality` | As transcribed. `cardinality` is the side of the street (North/South/East/West). |
| `lat`, `lng` | Optional. About 1,450 records have coordinates so far, and only these appear on the map. Adding more is ongoing community work. |
| `Surname`, `Given Names`, `Registration Number`, `Address`, `Street Number`, `Gender`, `Occupation`, `Notes` | Electoral-roll fields (Title Case, some with spaces). `Registration Number` stays in the data (and the admin data editor can search it), but electoral-roll `listing`s no longer start with it, so the public search never matches it. Directory records also have `Occupation` where the listing gives a trade, spelled out in full ("grcr" → "grocer"), and some have `Notes`. Search uses `Occupation`, and the contribution form fills in an entry's occupations from it. |

### Editing the data

Use `admin/carlton-data-editor.html`. It loads the live data and lets you search, edit and add records. **Send changes** asks for your name and an optional note, then sends only the records that changed to the Apps Script (`receiveData_` in `apps-script/Code.gs`). The script checks them against the files on `main`, opens a `data/…` pull request and adds a row to the Sheet's *Data changes* tab, listing each changed record (e.g. "lat -37.8041 → -37.8042"). An editor picks *Accept* or *Reject* in that row's Decision column, as for entries. Accept applies the changes to the data as it is then (so changes accepted in between are kept) and merges the pull request. If someone else changed one of the same records since the editor was loaded, nothing is sent and the editor asks you to reload; the same check at Accept stops a change that no longer fits. A record for a year that has no file yet is refused, because a new year needs a developer (see *Adding a new year* above).

*Download changed files* still gives one file per changed year for uploading to GitHub by hand. Small fixes can also be made directly on GitHub by editing the line for that record.

## Editorial workflows

### Reviewing a public submission (editorial team)

1. Open **`admin/review.html`** (or the [Admin page](https://historicalesque.github.io/carlton/admin/), then *Review submissions*). It lists open pull requests that add or change files in `civic/`. Anyone can read it; no sign-in is needed.
2. Pick a submission to see a preview of the entry as it would appear on the site. If someone has suggested changes, the page lists every version and shows what each one changes. Anyone can press **Suggest changes** to fix a submission in the contribution form; that makes a new version, which becomes the one the editors decide on (earlier versions stay listed). If it is a new version of an entry that's already on the site, a **What changes** table shows the current entry next to the new version. Anything the new version leaves out is marked, because accepting replaces the whole entry.
3. Decide in the team's submissions spreadsheet (the Sheet the Apps Script is attached to). Each submission is a row with a link back to the review page. In the **Decision** column, pick:
   - **Accept** to publish it. The script merges the pull request straight away and the Status column says "Published".
   - **Reject** to turn it down. The script closes the pull request. The *Reason* column is optional and stays in the Sheet.
   - Suggested changes don't add rows: they update the submission's row (listed in its *Suggested changes* column), and Accept publishes the latest version.
   - The **Records** column lists the directory and electoral-roll records the entry is about. Accepting links them to the entry (their `entityID` becomes the entry's id) in the same pull request. Edit the numbers before accepting if they're wrong; the Status column says how many were linked.
4. A decision happens as soon as it's picked and can't be undone from the Sheet, so check first.
5. The site updates a minute or two after a submission is published.

Only people the Sheet is shared with (as editors) can decide. The review page explains this in plain language. If you change the workflow, update both that page and this section. Setup and details: `apps-script/README.md`.

### Updating directory/map data

See [Editing the data](#editing-the-data) above. This is separate from entry submissions and needs more care, because a broken data file breaks search, the maps and the Directories / Electoral rolls pages.

## Adding a new page or facet

- **Simple page:** add `my-page.md` at the root with front matter (`title`, optionally `layout`). It gets `layout: default` automatically.
- **New facet list** (like Directories / Electoral rolls): add `my-facet.md`, add a `scope` block in `_config.yml` with `layout: facet-list` and `facet: "my-facet"`, and add a matching branch to the `filter` in `_layouts/facet-list.html`.
- **New entry collection** (another folder like `civic/`): add a page using `layout: entry` and set `EACCPFpath` to the folder name in `_config.yml`.
- **Navigation:** edit the `<nav>` list in `_layouts/default.html`. Footer links are in the same file.

## External services and dependencies

| Service / library | Used by | Notes |
|---|---|---|
| GitHub Pages | Hosting | Builds from `main`. |
| Google Apps Script web app | Receives contribution form entries | `apps-script/Code.gs`: checks the TEI, sets the file name, id and date, adds a row to the Sheet's *TEI submissions* tab and opens a pull request. The GitHub token is a Script property, never in the repo. Setup: `apps-script/README.md`. |
| GitHub REST API (no sign-in) | `admin/review.html` | Limited to 60 requests/hour per visitor IP address. See [Known issues](#known-issues-and-gotchas). |
| Quill 1.3.6 | Contribution form | cdn.quilljs.com |
| Leaflet 1.9.4 | 2D map | cdnjs |
| three.js r128 + OrbitControls | 3D map | cdnjs / jsDelivr |
| Google Fonts | Site typography | Libre Caslon Text, Courier Prime |
| UoM Land Parcels (Parkville) | Map overlay | [University of Melbourne open spatial data](https://spatialdata-uom.opendata.arcgis.com/datasets/UOM::uom-land-parcels-parkville/about) |

## Known issues and gotchas

- **Field names are inconsistent** (`year` vs `Given Names` vs `Occupation`), and `entityID` mixes numbers and strings (strings are deliberate links made by a person; see the [field reference](#data-directories-and-electoral-rolls)).
- **The A–Z is maintained by hand** as Markdown. See roadmap §3.
- **Review page rate limit (unlikely, but confusing if it happens):** `admin/review.html` calls the GitHub API without signing in, which GitHub caps at 60 requests per hour per IP address. Listing submissions uses one request plus one per open pull request. A small editorial team won't normally reach this, but a large backlog of submissions, or several people on one shared network (e.g. a university or library), could. **Symptoms:** the review page shows an error, an empty list, or submissions that won't load, even though they're visible on GitHub. **Fix:** wait up to an hour, or review directly on GitHub in the meantime.
- **No automated checks.** Malformed XML or a broken data file can be merged without anyone noticing. See roadmap §5.

---

## Roadmap

This is a living plan, so reorder it as priorities and funding change. Items are grouped by theme and roughly ordered within each group, cheapest and most valuable first. **Bold** items are suggested next steps.

### 1. Data structure and loading

Goal: pages only download the data they need, show visitors what's happening while it loads, and the data becomes easier to edit, review and reuse.

- [ ] **Agree on a data schema**: consistent `camelCase` field names (`givenNames`, `surname`, `occupation`, …), a clear rule for `entityID` (numeric record ID plus a separate `personId`/`placeId` for linking across years), and which fields are required. Write it up in `docs/SCHEMA.md`. The current fields and a starting proposal are written up there; the names still need agreeing before any file changes.
- [ ] **Link records across years, especially the newly added years**: today only 1900–1925 (and one 1930 record) are linked, about 1,900 records sharing a text `entityID`. None of the new directory years (1857, 1858, 1859, 1862, 1863, 1865, 1867, 1868, 1870, 1876, 1880, 1890, 1895, 1935, 1940) or the electoral rolls are linked yet, so search and the maps show their people and places as one-off listings. Suggested approach: propose likely matches automatically (same name, or same business at the same address, in neighbouring years, allowing for the historical spellings search already knows), then have the team confirm them in the data editor before any `entityID` changes. Street renumbering and renaming (especially before 1900) will need a lookup table. Ties in with the `personId`/`placeId` rule above.
- [x] **Split the data into JSON files**: one file per source and year in `_data/`, one record per line, with `data/index.json` generated by Jekyll (field names unchanged). Converted by `tools/convert-map-data.js`.
- [x] **Shared data loader** (`scripts/data.js`): each page fetches only the files it needs, in parallel, at most once per page (the browser's cache covers moving between pages). The Directories / Electoral rolls pages and search use each year as soon as it arrives; the contribution form fetches only the files holding that entry's records.
- [x] **Loading feedback for visitors**: "Loading the 1905 directory… (4 of 9)", and a message with a *Try again* button if a file fails to load.
- [x] Stop loading the data on every page: only the layouts that use it load it now (#44).
- [x] Convert `UoM_Landuse_2026.js` to `data/uom-land-parcels.geojson`, loaded only by the 2D map.
- [x] Remove `map-data.js` and `UoM_Landuse_2026.js`.
- [x] Renumber the electoral rolls' numeric `entityID`s from 999999, so they no longer clash with the 1930 directory.
- [x] Draw the maps year by year as the files arrive. Cross-year links are added once every year has arrived.

### 2. Better search

- [x] **Build a search index of entries and directory data together**, so one search box finds both "Corkman Hotel" (the entry) and every directory listing for it. Options: [Pagefind](https://pagefind.app/) (static, runs at build time, would need a GitHub Action) or [MiniSearch](https://github.com/lucaong/minisearch) / [Lunr](https://lunrjs.com/) indexes built in the browser or ahead of time. Done in #44 with MiniSearch, built in the browser on the new search page. Revisit Pagefind if entries reach the hundreds.
- [x] **Fuzzy matching for historical spellings** (Berkley/Berkeley, Leister/Leicester, Mrs/Mrs.), with a small list of known variants (#44; the list is `VARIANTS` in `scripts/search.js`).
- [x] Search results grouped by type (Entries / People / Places), with snippets and highlighted matches (#44).
- [x] "Trace this person/place across years": linked records show as one result with a row of years, and open to list each year's listing and page (#44).
- [x] Shareable search URLs (`?q=…&year=…&street=…`) (#44).
- [x] Load the search index only when the search page is opened (#44).

### 3. Editorial tools (towards a proper GUI for a non-technical team)

Goal: editors never need to touch GitHub directly. Done in small, fundable steps, with each step useful on its own.

**Markdown pages** (`aToZ.md`, `index.md` and other plain pages)

- [x] **Front page, Featured pages and About as entries**: their text is now TEI in `civic/` (`site_pages` in `_config.yml`), so the team can suggest edits with the contribution form, through a small *Suggest an edit to this page* link. This covers most of what the Markdown and A–Z editors below were for; the maps stay as they are.

- [ ] **Editor for Markdown pages**, see the design proposal: [`docs/proposals/markdown-page-editor.md`](docs/proposals/markdown-page-editor.md). Suggested first step: a simple text-and-preview editor for `index.md` and `aToZ.md` that saves through the existing Apps Script, with page edits listed and previewed in `admin/review.html` next to entry submissions. Editors sign in with Google, checked by the Apps Script against an editors list.
- [x] **Admin landing page** (`admin/index.html`) linking to each admin tool: review, page editor and data editor, plus the editor help (#45). The page editor is a placeholder until it exists. The team's Google Sheet is deliberately not linked, because the page is public.
- [ ] **Visual editor for Markdown pages**: an admin page that lists the site's editable pages, opens one in a word-processor-style editor (headings, bold/italic, links, bullet lists; no Markdown syntax needed), shows a live preview in the site's own styles, and saves by opening a pull request that goes through the usual review. Front matter (`title`, `layout`) is shown as simple form fields or hidden, so it can't be broken by accident.
  - Candidate editors: [Toast UI Editor](https://ui.toast.com/tui-editor) or [Milkdown](https://milkdown.dev/) (both edit Markdown visually and save clean Markdown), or the off-the-shelf CMS options below.
- [ ] **A–Z editor**: a dedicated tool for `aToZ.md`. Add, remove, rename and re-letter featured pages from a list; it keeps entries alphabetical, builds the `civic?id=…` links, handles "see also" cross-references (e.g. *Carlton Inn, see: Corkman Hotel*), and flags which links already have a published entry and which are still wanted. Longer term, the A–Z could be generated from data (`civic/` plus a "wanted entries" list) rather than edited as text.

**Entries and submissions**

- [x] Clearer review page: three numbered steps and two buttons, links back to Admin and the site, and the preview shows just the article (#50).
- [x] **Accept/Reject without GitHub**: editors pick Accept or Reject in a Decision column in the submissions Sheet, with an optional reason kept in the Sheet. The Apps Script merges or closes the pull request straight away (it first waited a minute, so a mis-tap could be cancelled; dropped because it added to the wait for the site to rebuild). The review page is open to everyone (#14).
- [x] **Before/after table** on the review page for new versions of existing entries (`scripts/tei-compare.js`) (#14).
- [x] **Suggest changes** on the review page: anyone can open a submission in the contribution form (filled in by `TEIEntry.parse()`), fix it and send it back as a new version of the same pull request. Each suggestion updates its submission's row on the Sheet's *TEI submissions* tab, so there is one decision per submission and Accept publishes the latest version (#15). The review page shows every version and what each changes.
- [x] **Link a new entry's records to it when it's accepted**: a new entry can be about several records, e.g. one hotel's listings in several Sands & McDougall directories. The form lists the records the entry was started from (each can be unticked), and *Is this entry about other records too?* finds and adds more. The numbered ones go in the Sheet's *Records* column. When an editor accepts the entry, `apps-script/Code.gs` changes those records' `entityID`s in `_data/` to the entry's id in the same pull request, so search, the maps and the entry page link them to the entry. The id is the entry's title (e.g. `"Spiers shop"` for `civic/Spiers-shop.xml`), or the id the entry's records already share. Records that already have a text `entityID` are left alone. A new entry can't take a title whose file name is already used by an entry or by linked records.

**Directory/map data**

- [x] **Data editor sends changes through the Apps Script**: replace "download, then upload to GitHub by hand" with a *Send changes* button, as the contribution form already does. The sender gives their name and a short note, and the editor sends only the records that changed. `apps-script/Code.gs` applies them to the current files, refusing any record someone else has changed since, then opens a pull request and adds a row to a *Data changes* tab in the same Sheet, where an editor accepts or rejects it in the Decision column.
- [x] Data editor uses the same fonts, colours and buttons as the review page, with one main *Download* button (#50).

**Off-the-shelf options to compare against building our own**

- [ ] Evaluate a git-based CMS such as [Decap CMS](https://decapcms.org/) or [Sveltia CMS](https://github.com/sveltia/sveltia-cms). These provide Markdown page editing, an editorial approval workflow and media uploads out of the box, and run on GitHub Pages without a server (they may need a small sign-in service). They may cover the Markdown editor and part of the review flow more cheaply than custom tools, but are less suited to the XML entries and the directory data.
- [ ] Later: revisit whether the Google Apps Script is still the best way to receive submissions, depending on which options above are chosen.

### 4. Moving entries to TEI

Goal: entries become valid, documented XML that covers everything the site writes about: people, businesses, families, places and topics. Archives and partners can still have EAC-CPF or Records in Contexts (RiC) data, generated from the TEI files.

Decided on 2026-10-04: entries move from EAC-CPF to [TEI P5](https://tei-c.org/guidelines/p5/) with a project customisation (`schema/carlton.odd`). EAC-CPF only allows people, families and corporate bodies, so places and topics can't be recorded properly in it. The site doesn't need to keep working while this happens, so the contribution form is replaced directly rather than run alongside a second form.

- [x] **Project customisation** `schema/carlton.odd`, and the schema generated from it, `schema/carlton.rng` (TEI P5 4.12.0). It sets the entry types (person, org, family, place, topic) and the text styles the form uses.
- [x] **Contribution form writes TEI** (`_layouts/form.html`): the simple form, optional sections and a *Show all fields* switch, building TEI in the browser with a preview that shows the XML. Not connected yet; keep refining the UI before connecting it.
- [x] **Entry pages render TEI** (`_layouts/entry.html`, with the renderer in `scripts/tei.js`), and still show EAC-CPF files until they're converted.
- [ ] **Entry style guide**: generate readable documentation from `carlton.odd` (TEI Stylesheets `odd2html`), with one worked example per entry type. Tighten the customisation as conventions settle, e.g. fixed lists for `div`, `state` and `relation` types, and drop modules nobody uses.
- [ ] **Map the collaborators' types**: list the types used in the partners' existing EAC-CPF records (places, concepts and others) and map each to a TEI entry type, then agree the mapping with them.
- [x] **Convert the existing entries**: all 22 `civic/*.xml` converted by `tools/convert-eac-to-tei.html` (title, authors, submission date and note, article; type set per entry in the page's `KINDS` list). All validate against `schema/carlton.rng`, and every article's text matches the original. Still to do: check the types by hand, and test by resubmitting entries through the form once it's connected.
- [x] **Pre-fill new entries from the records**: when a record has no entry yet, the form fills in its addresses (merged across years, with coordinates) and one source per record, linked to that year's directory page (`civic/Sands-McDougall-Directory-<year>.xml`) or to Electoral Rolls. Electoral roll records also set the type, name and occupation. Directory listings aren't parsed for names or types.
- [x] **New Apps Script**, written from scratch (`apps-script/Code.gs`): checks the XML is well-formed, sets the entry id, filename and date itself, saves a row to the Sheet and opens the pull request. A new version of an existing entry replaces its file in the pull request.
- [x] **Connect the form**: the script is deployed (`apps-script/README.md`) and `contribution_endpoint` is set in `_config.yml`. Next: send a test entry and check the Sheet row and pull request.
- [ ] **Search, the Directories / Electoral rolls pages and the maps read the TEI subject records** (names, addresses, coordinates), so entries appear on the map and alongside their directory listings. Search already finds TEI entries by title and article text.
- [ ] Later: generate EAC-CPF 2.0 (people, businesses, families) or RiC data from the TEI files for archives and partners who want it.
- [ ] Validate entries against `schema/carlton.rng` before merging (in an XML editor such as Oxygen, or with `jing`).

### 5. Quality and safety nets

- [ ] **GitHub Action that runs on every pull request**: check that XML is well-formed and valid against `schema/carlton.rng`, check that data JSON is valid against the schema, and check that the entry filename matches the `recordId`. Editors would then see a green tick or red cross on each submission.
- [x] Commit a `Gemfile` so local builds match GitHub Pages.
- [x] Contributor guide (`CONTRIBUTING.md`) setting out entry conventions as they're agreed. Update it as conventions change.
- [ ] **Security review**: check the parts that accept input from the public or act on the repository. That covers the Apps Script (`apps-script/Code.gs`): who can call it, what it accepts, rate limits, and how its GitHub token is stored and scoped; how entry pages and the review page render submitted XML and Markdown (`scripts/tei.js`, `scripts/tei-compare.js`), so a submission can't run scripts in an editor's browser; who can see and edit the team's Google Sheet; and the admin pages, which are public. Write up findings and fixes in `docs/`.

### 6. Maps and community geocoding

Placing records on the map is **ongoing community work**: about 16% of records have coordinates today, and that number should keep growing as volunteers contribute. The aim here is to make that work easy and inviting, not to finish it.

- [ ] Show geocoding progress (e.g. "1,454 of 9,236 records mapped") on the map page as a community goal.
- [x] Link map markers to entries and entries to map locations: the details popup says "Read the entry" when the record's `entityID` has an entry, and entries with drawn records get a "See on the map" link to `map?entity=<entityID>`, which rings those markers. (§4, Places, would later let an entry name its places directly.)
- [ ] Historical base map overlays (e.g. MMBW plans), if suitable public-domain scans are available.
- [x] **Bring the experimental 3D map in line with the 2D map**: same data and features, and refactor so both maps share functions (e.g. data loading, filtering, popups) instead of duplicating code. Done in #46 with `scripts/map-common.js`.

### 7. Look and feel

- [x] **Fix bulleted and numbered lists on content pages**, e.g. the area list on the home page. Done in #37: list styles for unclassed `ul`/`ol` inside `.main-content` in `styles/site.css`.
- [x] **Style Markdown headings and other content**: `h2`–`h4`, rules, tables, blockquotes and inline code on Markdown pages now use the site's serif and tokens (direct children of `.main-content` only, so entry and facet-list layouts keep their own styles).
- [x] **Fix the A–Z page**: the cramped letter-bar table is now an evenly spaced row of letter buttons (a Markdown list with `{: .az-index}`), and the Back to Top links point at `#featured-pages-a-to-z` (#41).
- [x] On the A–Z page, mark which links have a published entry and which are still wanted. Done in #47: "Not yet written" and "New" marks, with a legend.
- [x] **Restyle the contribution form to match the site**: use the site's tokens and fonts, and size the iframe to its content instead of `min-height: 800px` (#48). (The double rule under entry titles was removed in #43.)
- [x] **Give "Suggest new article" a proper page**: `new.md` now has a heading and a short explanation, and the field and button use the site's styles.
- [x] **People / Places contents**: show the year after each street name, e.g. "Bouverie Street (1905) listings". Sort by street within each year. One long page is fine (#51). (The extra `.facet-list` side padding was removed in #43.)
- [x] **Mobile pass** (checked again on 2026-10-05: no page scrolls sideways at phone width):
  - [x] 2D map: collapse the layers panel on phones and use the moss accent colour.
  - [x] 3D map: add a ← Home link and use `100dvh`.
  - [x] Nav: fit all five items on one row on phones.
  - [x] Search on phones: results are cards and filters fold away on the new search page (#44).
- [x] **Accessibility pass**: keyboard navigation for search and maps, colour contrast, focus styles and alt text. (A site-wide focus outline and a darker `--ink-faint` for small labels were added in #43; the rest in #54.)
- [ ] **Usability and UX review**: watch a few visitors and volunteer editors try common tasks (find a person or place, follow them across years, read an entry, find it on the map, suggest a new entry or a correction, and for editors, review and accept a submission). Note where they get stuck, then fix the biggest problems first. Include phones and people who are new to the site.

### 8. Site and content

Not on this roadmap: the About page's content (the project team writes it outside GitHub; the page currently holds a "coming soon" note and the banner image credit), a "how to cite this page" box (the site's address may change), and hosting images ourselves (entries will embed images from State Library Victoria and other institutions through IIIF viewers).

- [x] Replace the "under construction" notice with a permanent, welcoming "this is a work in progress, and you can help" message that links to ways to contribute. A "Work in progress" strip now sits under the nav on every page.
- [x] Settle the licences and credits below, and show the licences on the About page.
- [ ] Add an Acknowledgement of Country to the site footer, in wording the project team provides.
- [ ] Add a contact address to the README and site.
- [x] Use one name, "Featured pages", for the A–Z page everywhere, including the footer.
- [x] Footer links to People, Places and the Admin page (which replaces the direct data-editor link) (#49).

---

## Licence

- **Source code** (layouts, scripts, styles): [MIT Licence](LICENSE).
- **Written content** (`civic/` entries and site text): [Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/), unless a page says otherwise.
- **Transcribed and geocoded data** (`_data/` and `data/`): also CC BY-NC 4.0. The historical sources themselves (Sands & McDougall directories, electoral rolls) are in the public domain.
- **University of Melbourne land parcel data** is used under the terms of the [UoM open data portal](https://spatialdata-uom.opendata.arcgis.com/datasets/UOM::uom-land-parcels-parkville/about).

The About page on the site gives the same summary.

## Credits and acknowledgements

- **Acknowledgement of Country:** *TBD: the project team will write it, and it will go in the site footer.*
- **Produced and published by:** [Melbourne History Workshop](https://melbournehistoryworkshop.com/), [School of Historical & Philosophical Studies](https://arts.unimelb.edu.au/school-of-historical-and-philosophical-studies), The University of Melbourne
- **In collaboration with:** [Carlton Community History Group](https://cchg.asn.au)
- **Funding:** University of Melbourne Civic and Community Impact Fund
- **Banner image:** [State Library Victoria](https://handle.slv.vic.gov.au/10381/92019)
- **Contact:** *TBD*

Credits name organisations only, not individuals.
