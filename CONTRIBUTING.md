# Contributing to Common Ground

Thank you for helping. There are two kinds of contribution, and most people want the first.

## Sharing a story or adding to an entry

You don't need GitHub for this. Use the website:

- Open any entry on [the site](https://historicalesque.github.io/carlton/) and use the *Contribute* form at the bottom, or [start a new entry](https://historicalesque.github.io/carlton/new).
- The editorial team reviews every submission before it appears on the site.

The rest of this page is for people changing the site itself: its pages, code, entries or data files.

## Changing the site

1. **Make a branch and open a pull request.** Nothing reaches the live site until a pull request is merged into `main`. Keep each pull request to one change, and say in plain words what a visitor would see before and after.
2. **Check it locally first.** There are no automatic checks on pull requests, so a broken page or data file can be merged without anyone noticing. Run the site (below) and look at the pages you changed, on a phone-sized window as well as a desktop one.
3. **Ask for a review.** A member of the project team merges it.

### Running the site locally

You need Ruby 3 and Bundler. The `Gemfile` matches the versions GitHub Pages uses.

```bash
bundle install
bundle exec jekyll serve
# open http://127.0.0.1:4000/
```

Locally, links such as `civic?id=Corkman Hotel` may open the wrong page. Add `.html` (`civic.html?id=Corkman Hotel`) to see the entry. The live site doesn't need it.

### Where things are

The README's [Repository layout](README.md#repository-layout) lists every folder and file. In short: page layouts in `_layouts/`, scripts in `scripts/`, styles in `styles/site.css`, entries in `civic/`, records in `_data/`, and editorial tools in `admin/`.

## Entries (`civic/*.xml`)

Entries are TEI files. The format is described in [docs/SCHEMA.md](docs/SCHEMA.md) and defined by `schema/carlton.odd`.

- Name the file after the entry: spaces become `-` and punctuation is dropped (`Mary Mather (Pelham Hotel)` → `civic/Mary-Mather-Pelham-Hotel.xml`), and put the same slug in `<idno type="entry">`.
- Set the entry type in `<TEI type="…">`: `person`, `org`, `family`, `place` or `topic`.
- Add a `<change>` to `revisionDesc` saying what you changed and when.
- Check the file is well-formed (`xmllint --noout civic/My-Entry.xml`) and, if you can, valid against `schema/carlton.rng` (Oxygen, or `jing schema/carlton.rng civic/My-Entry.xml`).
- To list a new entry under Featured pages, add a link to `aToZ.md` by hand.

The easiest way to write a new entry is the site's form: fill it in, press *Preview*, copy the XML from *Show the TEI XML*, and start from that.

## Records (`_data/`)

The directory and electoral-roll records are one JSON file per source and year, one record per line; the fields are listed in [docs/SCHEMA.md](docs/SCHEMA.md#records-json). The editorial team edits them through the data editor (`admin/carlton-data-editor.html`); small fixes can be made directly on GitHub by editing one line.

- Keep one record per line, so each change shows up as a one-line difference.
- Keep spellings as transcribed: variant street and personal names can matter historically.
- When an entry is accepted, the records it's about get its id as their `entityID` (see the README, *Reviewing a public submission*). That commit is made by the Apps Script, so it's normal to see `_data/` change in an *Accept* commit.
- Check the file is still valid JSON before committing (`python3 -m json.tool _data/directory/1905.json > /dev/null`). A broken data file breaks search, the maps and the People and Places pages.

## Writing for the site

- Plain, friendly English for visitors; Australian spelling.
- Don't link to the team's private documents or shared folders from the site or this repository.

## Licences

By contributing you agree that your code is released under the [MIT Licence](LICENSE), and your written content and data under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/), as set out in the README's [Licence](README.md#licence) section.
