# Contribution form → Google Sheet → pull request

`Code.gs` is the Google Apps Script that receives entries from the contribution form (`_layouts/form.html`). For each entry it:
- checks the TEI;
- sets the file name, entry id and date;
- adds a row to the **TEI submissions** tab of the Sheet it's attached to;
- opens a pull request on `historicalesque/carlton`.

Anyone can read submissions on the review page (`admin/review.html`), and suggest changes to one there. A suggestion becomes a new version of the same pull request and a row on the **Reviews** tab. Editors accept or reject in the Sheet (see *Deciding* below).

- **New entry**: the pull request adds `civic/<id>.xml`.
- **Entry that already exists**: the pull request replaces `civic/<id>.xml` with the new version. Its description warns that merging replaces the current entry, so the editor checks *Files changed* first.

The copy in the repo is the master copy. After changing it, paste it into the script editor again and deploy a new version (step 5).

## Deciding (editors)

Each submission is a row on the **TEI submissions** tab. Editors only touch two columns:

- **Decision**: pick *Accept* or *Reject*.
  - The **Status** column changes to "Publishing (or Rejecting) in about a minute. Clear Decision to cancel."
  - About a minute later, the script merges the pull request (Accept) or closes it (Reject), deletes its branch, and writes "Published" (a link to the entry) or "Rejected" with the time.
  - Clearing the cell before then cancels.
- **Reason (editors only)**: optional. It stays in the Sheet and is never posted anywhere.

**Review** links to the submission on the review page.

**Suggested changes** are rows on the **Reviews** tab: who suggested them, what they changed, and a link to that exact version. Each row has its own Decision column.
- **Accept** on a Reviews row publishes that version instead of the original.
- **Reject** on a Reviews row turns down only that suggestion; the submission stays open.
- Once one version is published (or the submission is rejected), the other rows for it say so ("Not used: another version was published", or "Rejected with the submission").

The script only acts on pull requests the form opened: open ones, from a `submission/…` branch in this repository, changing nothing but `civic/*.xml`. Anything else gets a "Couldn't publish" status and has to be handled on GitHub.

If the submission was changed after its row was written, Accept publishes the version recorded on the row (the **Version** column).

If something goes wrong, the Status column says what happened, and the Decision cell is cleared so it can be picked again.

Anyone the Sheet is shared with as an editor can decide. Those people can also open the script and its properties, including the token, so share it only with the editorial team.

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

   `setUp` adds the Review, Decision, Reason, Status and Version columns to the TEI submissions tab, and fills in Review and Status for rows already there. It also switches on the trigger that watches the Decision column.

   The trigger runs as you, so editors never see a permissions screen. Running `setUp` again is safe.
8. **Share the Sheet** (as *Editor*) with each person who should accept or reject submissions.

After editing `Code.gs` later: *Deploy → Manage deployments →* the pencil icon *→ Version: New version → Deploy*. The URL stays the same. If the new version adds columns, tabs or triggers, run `setUp` again. (The version that added *Suggest changes* adds the Reviews tab, so run `setUp` once after updating to it.)

## Notes

- The token belongs to whoever made it, and pull requests show that person as the author. A classic token with no expiration keeps working until it's deleted on GitHub. It can write to every public repository that account can write to, so keep it only in Script properties.
- Submissions are capped at 20 an hour, and a hidden "website" field catches simple bots.
- A Sheet cell holds about 50,000 characters, so very long entries are cut short in the Sheet. The pull request always has the full copy.
