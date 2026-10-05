# Common Ground: Community Histories of the Campus Precinct, 1850s–1950s

**Live site:** https://historicalesque.github.io/carlton/

> ### Looking to explore or contribute? You probably want the website, not this page.
>
> This page is the technical documentation for the people who build and maintain the site.
>
> - **Read about the project:** [About Common Ground](https://historicalesque.github.io/carlton/)
> - **Search everything:** [Search](https://historicalesque.github.io/carlton/search) finds entries, directory listings and electoral-roll records in one box.
> - **Browse the histories:** [Featured pages A–Z](https://historicalesque.github.io/carlton/aToZ) · [Map](https://historicalesque.github.io/carlton/map) · [People](https://historicalesque.github.io/carlton/people) · [Places](https://historicalesque.github.io/carlton/places)
> - **Share a story or add to an entry:** open any entry on the site and use the *Contribute* form at the bottom, or [start a new entry](https://historicalesque.github.io/carlton/new).
> - **Editorial team:** start at the [Admin page](https://historicalesque.github.io/carlton/admin/), which links to each editorial tool. To review submissions, go to the [Submission review page](https://historicalesque.github.io/carlton/admin/review.html) and follow the steps it gives you.
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
- **Public contributions** go through a Google Apps Script web app. (The contribution form has been replaced by a TEI version that isn't connected yet; a new Apps Script will be written for it. See roadmap §4.) It saves a copy of each submission to a Google Sheet in the team's shared Google Drive folder, then opens a pull request on this repository. The sheet is a user-friendly backup while the submission process is being settled. The editorial team then merges the pull request (accept) or closes it (reject).

The project is deliberately a **perpetual work in progress**. Gaps in the data and entries that don't exist yet are invitations for the community to contribute, not defects.

Nothing is published until a pull request is merged into `main`. GitHub Pages rebuilds the site automatically after each merge, usually within a minute or two.

## How the site works

```
                 ┌──────────────────────────── GitHub Pages (Jekyll) ───────────────────────────┐
 Visitor ──────▶ │  index / search / aToZ / people / places / map / map3d / civic?id=…            │
                 │        │                                   │                                  │
                 │        ▼                                   ▼                                  │
                 │   data/index.json + data/<source>/   civic/<slug>.xml  (fetched + parsed     │
                 │   <year>.json via scripts/data.js     in the browser by _layouts/entry.html) │
                 └──────────────────────────────────────────────────────────────────────────────┘

 Contributor ──▶ form (_layouts/form.html, Quill editor; builds the entry as TEI)
                   │  not connected yet (was: POST JSON to the old Apps Script)
                   ▼
                 Google Apps Script web app ──▶ 1. copy to Google Sheet (team shared Drive, backup)
                                            ──▶ 2. new branch + civic/<slug>.xml + pull request
                                                         │
 Editor ────▶ admin/ ▶ review.html ── lists open PRs touching civic/, previews them ──┐
                                                         │                            │
                                                         ▼                            ▼
                                            Merge on GitHub (accept)   Close on GitHub (reject)
```

### Entry pages

`civic.md` uses `_layouts/entry.html`. A URL such as `civic?id=Corkman Hotel`:

1. turns the `id` into a filename slug (`Corkman-Hotel`);
2. fetches `civic/Corkman-Hotel.xml`;
3. parses the XML and renders it: TEI entries with `TEIEntry.render()` from `scripts/tei.js`, older EAC-CPF entries (namespace `urn:isbn:1-931666-33-4`) with the code in the layout;
4. adds the contribution form underneath. If no file exists yet, the form takes the entry's place so the community can create it. The form (`_layouts/form.html`, in an iframe) reports its height to the entry page, which sizes the iframe to fit.

With `preview=true`, `id` can be a full URL, such as a raw file on a pull-request branch. This is how `admin/review.html` previews submissions before they are merged. Preview mode also hides the banner, menu, footer and contribution form, so the review frame shows just the article.

### Search, facets and maps

- **Search page** (`search.md` → `_layouts/search.html` + `scripts/search.js`): one box that searches the entries in `civic/` and every directory and electoral-roll record together, using [MiniSearch](https://github.com/lucaong/minisearch) (vendored in `scripts/vendor/`, MIT). Jekyll lists the entry files into the page at build time and the browser fetches them as ordinary site files (no GitHub API calls). Entries are searchable at once; records join the index as each year's file arrives. Results are grouped into Entries, Places (directories) and People (electoral rolls); records that share a text `entityID` collapse into one result with a row of years. Matching is by prefix with small typos allowed, and a `VARIANTS` list at the top of `scripts/search.js` folds historical spellings and abbreviations together (Berkley/Berkeley, htl → hotel, Wm → William, …); add pairs there. The search is kept in the address (`search?q=grocer&year=1910&street=…&src=people`), so it can be shared. If nothing matches, it offers to start a new entry with that name.
- **People / Places** (`_layouts/facet-list.html`): load only the files for one `source`. `people` shows electoral rolls and `places` shows directories. Results are grouped by source/year → street → side of street, and each year is drawn as soon as its file arrives (oldest first). Within each year the streets are sorted, so each street appears once per year, and the contents list shows the year after each street (e.g. "Bouverie Street (1905) listings").
- **Map** (`_layouts/map.html`): Leaflet 1.9.4. It plots records that have `lat`/`lng`, with University of Melbourne land parcels (`data/uom-land-parcels.geojson`) as an overlay. Both maps set up their years and controls from `data/index.json` and draw each year as soon as its file arrives. Records without coordinates are placed between mapped ones from the same year and street, so they are drawn with their year; cross-year links are added once every year has arrived.
- **3D Map** (`_layouts/map3d.html`): three.js r128 with OrbitControls. Experimental. It shows the records only: the historic map layers and land parcels stay on the 2D map.
- Both maps share `scripts/map-common.js` (data loading, year colours, cross-year links from string `entityID`s, marker shapes) and the details popup in `_includes/map-details-modal.html`, which links to the record's entry ("Read the entry" when `civic/<entityID>.xml` exists, "Start an entry" otherwise). The 2D map also takes `map?entity=<entityID>`: it ticks the years that entity appears in, rings its markers and zooms to them. Entries link there with "See on the map" when the map draws at least one of their records.
- **Featured pages A–Z** (`aToZ.md` + `scripts/az-status.js`): Jekyll lists the files in `civic/` into the page at build time, and the script marks links with no entry yet (pencil icon, "Not yet written") and entries created in the last 14 days ("New"). A legend above the letter index explains both.

## Repository layout

| Path | What it is |
|---|---|
| `_config.yml` | Jekyll config. Sets the theme and per-page defaults (layout, `EACCPFpath`, `facet`, whether the contribution form shows). |
| `_layouts/default.html` | Site shell: header, navigation, sidebar and footer. Does **not** load any data; layouts that need it load it through `scripts/data.js`. |
| `_layouts/search.html`, `scripts/search.js` | Search page (see [Search, facets and maps](#search-facets-and-maps)). |
| `_layouts/entry.html` | Fetches and renders one entry (TEI, or EAC-CPF for any older file), and adds the contribution form. |
| `_layouts/form.html` | Contribution form (Quill 1.3.6). Builds the entry as TEI, with optional extra sections and a *Show all fields* switch. Not connected yet: it previews the entry and downloads the XML. |
| `_layouts/new.html` | "Start a new entry" box that redirects to `civic?id=…`. |
| `_layouts/facet-list.html` | People / Places listings. |
| `_layouts/map.html`, `_layouts/map3d.html` | 2D Leaflet map and 3D three.js map. |
| `scripts/map-common.js`, `_includes/map-details-modal.html` | Functions and the details popup shared by both maps. |
| `*.md` (root) | One small file per page. Mostly front matter that picks a layout. `aToZ.md` is the hand-maintained index of featured pages. |
| `civic/*.xml` | Published encyclopedia entries (TEI). See `docs/SCHEMA.md`. |
| `_data/directory/<year>.json`, `_data/electoral-roll/<year>.json` | The directory and electoral-roll records, one file per source and year, one record per line. **Edit these.** See [Data](#data-directories-and-electoral-rolls). |
| `data/` | What the browser downloads, generated from `_data/` by Jekyll: one small page per data file, `data/index.json` (the list of files), and `uom-land-parcels.geojson` (University of Melbourne land parcels). |
| `scripts/data.js` | Shared data loader used by every page that shows records. |
| `scripts/tei.js` | Builds an entry as TEI from the contribution form, checks it, and renders TEI entries (entry pages and the form's preview). |
| `schema/carlton.odd`, `schema/carlton.rng` | The TEI entry format: the customisation (with its documentation) and the schema generated from it. |
| `tools/convert-map-data.js` | One-off script that split the old `map-data.js` into the files in `_data/`. |
| `tools/convert-eac-to-tei.html` | One-off page that converted the EAC-CPF entries in `civic/` to TEI with `scripts/tei.js`. Not linked from the site. |
| `admin/index.html` | Admin landing page for the editorial team, linking to each tool (served at `admin/`). The site footer links here. |
| `admin/review.html` | Plain-language review page for the editorial team. |
| `admin/carlton-data-editor.html` | Browser-based editor for the directory and electoral-roll files. |
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
- `admin/review.html` reads from the live GitHub repo. `admin/carlton-data-editor.html` loads the data from the site it's served from, so locally it shows your local files.
- Submitting the contribution form locally **creates a real pull request** through the live Apps Script. Close any test pull requests afterwards.

## Content: encyclopedia entries (TEI XML)

Every entry in `civic/` is a TEI file, written to the project customisation in `schema/carlton.odd`. **The full reference is [`docs/SCHEMA.md`](docs/SCHEMA.md)**; the conventions for adding or editing entries are in [`CONTRIBUTING.md`](CONTRIBUTING.md). For a full example, see `civic/Corkman-Hotel.xml`.

- **Filename = slug of the entry ID**: spaces become `-`, anything other than letters, digits, `_` and `-` is removed, and the file goes in `civic/`, e.g. `Mary Mather (Pelham Hotel)` → `civic/Mary-Mather-Pelham-Hotel.xml`. The slug logic is `slugifyId()` in `_layouts/entry.html`. A file that doesn't match the slug won't be found. `<idno type="entry">` holds the same slug.
- `<revisionDesc>` has one `<change>` per contribution or edit.
- To add an entry to the A–Z, add a link in `aToZ.md` by hand.

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
_data/directory/1900.json … 1930.json
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
| Directory (Sands & McDougall) | 1900, 1905, 1910, 1915, 1920, 1925, 1930 | ~7,700 |
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
| `source` | `"Directory"` or `"Electoral roll"`. This decides whether a record appears under People or Places. |
| `year`, `pages`, `listing`, `street`, `type`, `cardinality` | As transcribed. `cardinality` is the side of the street (North/South/East/West). |
| `lat`, `lng` | Optional. About 1,450 records have coordinates so far, and only these appear on the map. Adding more is ongoing community work. |
| `Surname`, `Given Names`, `Registration Number`, `Address`, `Street Number`, `Gender`, `Occupation`, `Notes` | Electoral-roll fields (Title Case, some with spaces). Some later directory records also have `Occupation` / `Notes`. |

### Editing the data

Use `admin/carlton-data-editor.html`. It loads the live data, lets you search and edit records, and then *Download changed files* gives one download per changed year (e.g. `1905.json`). Someone then has to upload each file to its folder on GitHub by hand (the editor links to the upload page and explains how). Check the downloaded filename is exactly the year (browsers sometimes save `1905 (1).json`), and reload the editor before you start so you don't overwrite someone else's changes. Small fixes can also be made directly on GitHub by editing the line for that record.

## Editorial workflows

### Reviewing a public submission (editorial team)

1. Open **`admin/review.html`** (or the [Admin page](https://historicalesque.github.io/carlton/admin/), then *Review submissions*). It lists open pull requests that add or change files in `civic/`.
2. Pick a submission to see a live preview of the entry as it would appear on the site.
3. Sign in to GitHub, then follow the link to the pull request:
   - **Accept:** *Merge pull request* → *Confirm merge*.
   - **Reject:** *Close pull request*. Ideally leave a short comment saying why.
   - **Needs changes:** edit the XML file on the pull request branch on GitHub, then merge.
4. The site updates a minute or two after merging.

The review page walks reviewers through these steps in plain language. If you change the workflow, update both that page and this section.

### Updating directory/map data

See [Editing the data](#editing-the-data) above. This is separate from entry submissions and needs more care, because a broken data file breaks search, the maps and the People/Places pages.

## Adding a new page or facet

- **Simple page:** add `my-page.md` at the root with front matter (`title`, optionally `layout`). It gets `layout: default` automatically.
- **New facet list** (like People/Places): add `my-facet.md`, add a `scope` block in `_config.yml` with `layout: facet-list` and `facet: "my-facet"`, and add a matching branch to the `filter` in `_layouts/facet-list.html`.
- **New entry collection** (another folder like `civic/`): add a page using `layout: entry` and set `EACCPFpath` to the folder name in `_config.yml`.
- **Navigation:** edit the `<nav>` list in `_layouts/default.html`. Footer links are in the same file.

## External services and dependencies

| Service / library | Used by | Notes |
|---|---|---|
| GitHub Pages | Hosting | Builds from `main`. |
| Google Apps Script web app | Not used at the moment | The old script saved a copy of each submission to a Google Sheet in the team's shared Drive folder (backup), then turned it into a branch and pull request. Its source is kept outside this repo. A new script will be written for the TEI form (roadmap §4). |
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
- [x] **Split the data into JSON files**: one file per source and year in `_data/`, one record per line, with `data/index.json` generated by Jekyll (field names unchanged). Converted by `tools/convert-map-data.js`.
- [x] **Shared data loader** (`scripts/data.js`): each page fetches only the files it needs, in parallel, at most once per page (the browser's cache covers moving between pages). People/Places and search use each year as soon as it arrives; the contribution form fetches only the files holding that entry's records.
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

- [ ] **Editor for Markdown pages**, see the design proposal: [`docs/proposals/markdown-page-editor.md`](docs/proposals/markdown-page-editor.md). Suggested first step: a simple text-and-preview editor for `index.md` and `aToZ.md` that saves through the existing Apps Script, with page edits listed and previewed in `admin/review.html` next to entry submissions. Editors sign in with Google, checked by the Apps Script against an editors list.
- [x] **Admin landing page** (`admin/index.html`) linking to each admin tool: review, page editor and data editor, plus the editor help (#45). The page editor is a placeholder until it exists. The team's Google Sheet is deliberately not linked, because the page is public.
- [ ] **Visual editor for Markdown pages**: an admin page that lists the site's editable pages, opens one in a word-processor-style editor (headings, bold/italic, links, bullet lists; no Markdown syntax needed), shows a live preview in the site's own styles, and saves by opening a pull request that goes through the usual review. Front matter (`title`, `layout`) is shown as simple form fields or hidden, so it can't be broken by accident.
  - Candidate editors: [Toast UI Editor](https://ui.toast.com/tui-editor) or [Milkdown](https://milkdown.dev/) (both edit Markdown visually and save clean Markdown), or the off-the-shelf CMS options below.
- [ ] **A–Z editor**: a dedicated tool for `aToZ.md`. Add, remove, rename and re-letter featured pages from a list; it keeps entries alphabetical, builds the `civic?id=…` links, handles "see also" cross-references (e.g. *Carlton Inn, see: Corkman Hotel*), and flags which links already have a published entry and which are still wanted. Longer term, the A–Z could be generated from data (`civic/` plus a "wanted entries" list) rather than edited as text.

**Entries and submissions**

- [x] Clearer review page: three numbered steps and two buttons, links back to Admin and the site, and the preview shows just the article (#50).
- [ ] **Accept/Reject buttons on the review page** (through the existing submission service or GitHub sign-in), with a "reason for rejection" box that is posted as a comment for the record.
- [ ] Edit a submission's text in the review page before accepting it.

**Directory/map data**

- [ ] **Data editor saves by pull request**: replace "download, then upload to GitHub by hand" with a *Submit changes* button that opens a pull request, as the contribution form already does. This removes the riskiest manual step and becomes much easier once the data is split into per-year JSON (§1).
- [ ] **Data-change preview on the review page**: show a readable table of changed records (before → after) instead of a raw diff.
- [x] Data editor uses the same fonts, colours and buttons as the review page, with one main *Download* button (#50).

**Off-the-shelf options to compare against building our own**

- [ ] Evaluate a git-based CMS such as [Decap CMS](https://decapcms.org/) or [Sveltia CMS](https://github.com/sveltia/sveltia-cms). These provide Markdown page editing, an editorial approval workflow and media uploads out of the box, and run on GitHub Pages without a server (they may need a small sign-in service). They may cover the Markdown editor and part of the review flow more cheaply than custom tools, but are less suited to the XML entries and the directory data.
- [ ] Later: revisit whether the Google Apps Script is still the best way to receive submissions, depending on which options above are chosen.

### 4. Moving entries to TEI

Goal: entries become valid, documented XML that covers everything the site writes about: people, businesses, families, places and topics. Archives and partners can still have EAC-CPF or Records in Contexts (RiC) data, generated from the TEI files.

Decided on 2026-10-04: entries move from EAC-CPF to [TEI P5](https://tei-c.org/guidelines/p5/) with a project customisation (`schema/carlton.odd`). EAC-CPF only allows people, families and corporate bodies, so places and topics can't be recorded properly in it. The site doesn't need to keep working while this happens, so the contribution form is replaced directly rather than run alongside a second form.

- [x] **Project customisation** `schema/carlton.odd`, and the schema generated from it, `schema/carlton.rng` (TEI P5 4.12.0). It sets the entry types (person, org, family, place, topic) and the text styles the form uses.
- [x] **Contribution form writes TEI** (`_layouts/form.html`): the simple form, optional sections and a *Show all fields* switch, building TEI in the browser with a preview and *Download XML*. Not connected yet; keep refining the UI before connecting it.
- [x] **Entry pages render TEI** (`_layouts/entry.html`, with the renderer in `scripts/tei.js`), and still show EAC-CPF files until they're converted.
- [ ] **Entry style guide**: generate readable documentation from `carlton.odd` (TEI Stylesheets `odd2html`), with one worked example per entry type. Tighten the customisation as conventions settle, e.g. fixed lists for `div`, `state` and `relation` types, and drop modules nobody uses.
- [ ] **Map the collaborators' types**: list the types used in the partners' existing EAC-CPF records (places, concepts and others) and map each to a TEI entry type, then agree the mapping with them.
- [x] **Convert the existing entries**: all 22 `civic/*.xml` converted by `tools/convert-eac-to-tei.html` (title, authors, submission date and note, article; type set per entry in the page's `KINDS` list). All validate against `schema/carlton.rng`, and every article's text matches the original. Still to do: check the types by hand, and test by resubmitting entries through the form once it's connected.
- [x] **Pre-fill new entries from the records**: when a record has no entry yet, the form fills in its addresses (merged across years, with coordinates) and one source per record, linked to that year's directory page (`civic/Sands-McDougall-Directory-<year>.xml`) or to Electoral Rolls. Electoral roll records also set the type, name and occupation. Directory listings aren't parsed for names or types.
- [ ] **New Apps Script**, written from scratch: check the XML is well-formed, set the entry id, filename and date itself, save a copy to the Sheet and open the pull request.
- [ ] **Search, People/Places and the maps read the TEI subject records** (names, addresses, coordinates), so entries appear on the map and alongside their directory listings. Search already finds TEI entries by title and article text.
- [ ] Later: generate EAC-CPF 2.0 (people, businesses, families) or RiC data from the TEI files for archives and partners who want it.
- [ ] Validate entries against `schema/carlton.rng` before merging (in an XML editor such as Oxygen, or with `jing`).

### 5. Quality and safety nets

- [ ] **GitHub Action that runs on every pull request**: check that XML is well-formed and valid against `schema/carlton.rng`, check that data JSON is valid against the schema, and check that the entry filename matches the `recordId`. Editors would then see a green tick or red cross on each submission.
- [x] Commit a `Gemfile` so local builds match GitHub Pages.
- [x] Contributor guide (`CONTRIBUTING.md`) setting out entry conventions as they're agreed. Update it as conventions change.

### 6. Maps and community geocoding

Placing records on the map is **ongoing community work**: about 16% of records have coordinates today, and that number should keep growing as volunteers contribute. The aim here is to make that work easy and inviting, not to finish it.

- [ ] **"Help put this on the map"**: on records without coordinates, a prompt that lets a volunteer drop a pin on the map and submit it for review. Waiting on the new contribution form (form2) being connected: pins would travel the same route as other contributions (form, Apps Script, Sheet, pull request).
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
