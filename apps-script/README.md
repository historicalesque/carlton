# Contribution form → Google Sheet → pull request

`Code.gs` is the Google Apps Script that receives entries from the contribution form (`_layouts/form.html`). For each entry it:
- checks the TEI;
- sets the file name, entry id and date;
- adds a row to the **TEI submissions** tab of the Sheet it's attached to;
- opens a pull request on `historicalesque/carlton`.

Editors accept or reject it on the review page (`admin/review.html`).

- **New entry**: the pull request adds `civic/<id>.xml`.
- **Entry that already exists**: the pull request replaces `civic/<id>.xml` with the new version. Its description warns that merging replaces the current entry, so the editor checks *Files changed* first.

The copy in the repo is the master copy. After changing it, paste it into the script editor again and deploy a new version (step 5).

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

After editing `Code.gs` later: *Deploy → Manage deployments →* the pencil icon *→ Version: New version → Deploy*. The URL stays the same.

## Notes

- The token belongs to whoever made it, and pull requests show that person as the author. A classic token with no expiration keeps working until it's deleted on GitHub. It can write to every public repository that account can write to, so keep it only in Script properties.
- Submissions are capped at 20 an hour, and a hidden "website" field catches simple bots.
- A Sheet cell holds about 50,000 characters, so very long entries are cut short in the Sheet. The pull request always has the full copy.
