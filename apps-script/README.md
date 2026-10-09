# Contribution form → Google Sheet → pull request

`Code.gs` is the Google Apps Script that receives entries from the contribution form (`_layouts/form.html`). For each entry it:
- checks the TEI;
- sets the file name, entry id and date;
- adds a row to the **TEI submissions** tab of the Sheet it's attached to;
- opens a pull request on `historicalesque/carlton`.

Anyone can read submissions on the review page (`admin/review.html`), and suggest changes to one there. A suggestion becomes a new version of the same pull request and its own row on the **TEI submissions** tab, just below the submission. Editors accept or reject in the Sheet (see *Deciding* below).

- **New entry**: the pull request adds `civic/<id>.xml`.
- **Entry that already exists**: the pull request replaces `civic/<id>.xml` with the new version. Its description warns that merging replaces the current entry, so the editor checks *Files changed* first.
- **Records**: the form sends the numbers of the directory and electoral-roll records the entry is about, and they go in the row's **Records** column. A brand new entry whose title gives the file name of an entry that already exists is refused, so it can't replace that entry by accident.

The copy in the repo is the master copy. After changing it, paste it into the script editor again and deploy a new version (step 5).

## Deciding (editors)

Each submission is a row on the **TEI submissions** tab. Editors only touch two columns:

- **Decision**: pick *Accept* or *Reject*.
  - The **Status** column changes to "Publishing (or Rejecting) in about a minute. Clear Decision to cancel."
  - About a minute later, the script merges the pull request (Accept) or closes it (Reject), deletes its branch, and writes "Published" (a link to the entry) or "Rejected" with the time.
  - Clearing the cell before then cancels.
- **Reason (editors only)**: optional. It stays in the Sheet and is never posted anywhere.

**Records** lists the records the entry is about, e.g. `1331, 2369`. On Accept, the script changes each one's `entityID` in `_data/` to the entry's id, in the same pull request just before merging it, so the entry and its links are published together. The id is the entry's title (or, if the title has since changed so it no longer gives the entry's file name, the file name), unless the site already has records linked under a name that gives that file name (e.g. `Corkman Hotel`), which is used instead. Records that already have a text id, or that can't be found, are left alone and listed in the Status ("2 records linked, not linked: 1234"). The editors can change the numbers before accepting. A suggested change starts with its submission's Records.

**Review** links to the submission on the review page.

**Suggested changes** are rows on the same tab, just below the submission they change, with **Kind** "Suggested changes". The **Suggested changes** column says who suggested them and what they changed, and **Review** links to that exact version. The submission's own row says how many there are ("Waiting. 1 suggested change (rows below)"). Each row has its own Decision.
- **Accept** on a suggested-changes row publishes that version instead of the original. Its Records start as the submission's; edit them on that row if needed.
- **Reject** on a suggested-changes row turns down only that suggestion; the submission stays open.
- Once one version is published (or the submission is rejected), the other rows for it say so ("Published with suggested changes (below)", "Not used: another version was published", or "Rejected with the submission").

The script only acts on pull requests the form opened: open ones, from a `submission/…` branch in this repository, changing one `civic/*.xml` file (and, once its records are being linked, the data files in `_data/`). Anything else gets a "Couldn't publish" status and has to be handled on GitHub.

If the submission was changed after its row was written, Accept publishes the version recorded on the row (the **Version** column).

If something goes wrong, the Status column says what happened, and the Decision cell is cleared so it can be picked again.

Anyone the Sheet is shared with as an editor can decide. Those people can also open the script and its properties, including the token, so share it only with the editorial team.

## Data changes (data editor)

The data editor (`admin/carlton-data-editor.html`) sends to the same web app, with `action: "data"`, the sender's name, an optional note, and only the records that changed: each as its line in the file before and after (`receiveData_`). The script:
- checks each record belongs in the file it's sent for (`source` and `year`), and that coordinates are numbers;
- reads each file from `main` and swaps in the changed lines, leaving every other line exactly as it was. If a record isn't there any more because someone else changed it since the editor was loaded, nothing is sent and the sender is asked to reload;
- commits that to a `data/…` branch and opens a pull request;
- adds a row to the **Data changes** tab: when, who, their note, what changed (e.g. "1905 directory: 3 changed, 1 added"), **Details** (one line per record, e.g. "lat -37.8041 → -37.8042"), Decision, Reason, Status and the pull request. The last column, *Changes (for the script)*, holds what was sent; don't edit it.

Editors decide in the Decision column, as for entries. **Accept** applies the changes again to the data as it is at that moment (so data changes accepted in between are kept), replaces the branch's commit with that, and merges the pull request. If one of the records has changed since it was sent, the Status says so and nothing is published: reject it and ask the sender to make the changes again. **Reject** closes the pull request.

A record for a year with no file yet is refused (a new year needs a developer, see the main README).

## Setting it up (once)

Nothing secret goes in this repo. The Sheet's address and the GitHub token stay in Google.

1. **The Sheet.** Open the team's existing submissions spreadsheet. The script adds a **TEI submissions** tab the first time something arrives, and every submission after that is a new row on that tab.
2. **The script.** In the spreadsheet: *Extensions → Apps Script*. Replace everything in `Code.gs` with this folder's `Code.gs`, then save.
3. **The GitHub token.** On GitHub, go to *Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)*:
   - Note: `Common Ground form`
   - Expiration: **No expiration**
   - Scope: tick **public_repo** only

   Copy the token. In the script editor go to *Project Settings* (the cog) → *Script properties* → *Add script property*, with the name `GITHUB_TOKEN` and the token as the value. Save.
4. **Check it.** Back in the editor, pick `testSetup` from the function menu and press *Run*. Google asks for permission the first time. The log should say `OK: can reach historicalesque/carlton; push access: true`.
5. **Deploy.** *Deploy → New deployment →* type **Web app**. Set *Execute as*: **Me** and *Who has access*: **Anyone**, then press *Deploy*. Copy the **Web app URL** (it ends in `/exec`).
6. **Connect the form.** Put that URL in `_config.yml` as `contribution_endpoint`. The form then shows a *Send to the editors* button instead of the "Not connected yet" note.
7. **Switch on decisions.** In the script editor, pick `setUp` from the function menu and press *Run*. Google asks for permission once more, to let the script run triggers.

   `setUp` adds the Suggested changes, Review, Decision, Reason, Status and Version columns to the TEI submissions tab, and fills in Review and Status for rows already there. It also switches on the trigger that watches the Decision column.

   The trigger runs as you, so editors never see a permissions screen. Running `setUp` again is safe.
8. **Share the Sheet** (as *Editor*) with each person who should accept or reject submissions.

After editing `Code.gs` later: *Deploy → Manage deployments →* the pencil icon *→ Version: New version → Deploy*. The URL stays the same. If the new version adds columns, tabs or triggers, run `setUp` again. (The version that links records adds the Records column by itself, the next time a submission arrives; running `setUp` adds it straight away.) (The version that put suggested changes on the TEI submissions tab adds a *Suggested changes* column and no longer uses the Reviews tab. Run `setUp` once after updating to it: it also moves any rows left on the Reviews tab across, below their submissions. Then delete the Reviews tab.)

## Notes

- The token belongs to whoever made it, and pull requests show that person as the author. A classic token with no expiration keeps working until it's deleted on GitHub. It can write to every public repository that account can write to, so keep it only in Script properties.
- Submissions are capped at 20 an hour, and a hidden "website" field catches simple bots. Sends from the data editor count towards the same 20.
- A Sheet cell holds about 50,000 characters, so very long entries are cut short in the Sheet. The pull request always has the full copy.
