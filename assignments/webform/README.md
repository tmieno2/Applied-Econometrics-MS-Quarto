# The submission form

An Apps Script web app that replaces the Dropbox file request now that the
course lives in Google Drive. A student opens one URL, gives their name and
email, picks the assignment from a dropdown and uploads their files. Each file
is written into

```
assignments/submission/<year>/<assignment>/
```

which is exactly the tree `assignments/sort-submissions.R` produces, so grading
is unchanged. The repository is inside Drive, so a file uploaded through the
form syncs down and appears in that folder locally with no further step —
the same property the Dropbox request had.

| File | What it is |
|---|---|
| `Code.gs` | Server side: validation, Drive writes, log, receipt email |
| `Form.html` | The page students see |
| `Materials.gs` | Publishing the year's materials folder — see below |
| `appsscript.json` | Manifest — scopes, timezone, deployment access |
| `test-helpers.js` | `node assignments/webform/test-helpers.js` |

---

## What it guarantees

These are the behaviours worth not breaking. Each one exists because of a way
this can go wrong.

**Nothing is ever overwritten.** A file whose canonical name is already taken
becomes `_v2`, `_v3`, … The grader takes the highest version and the log says
when each arrived. Student work is not in version control and cannot be
recovered if lost, so the form has no path that destroys a file.

**Files are renamed to the convention, server side.** Whatever a student calls
their upload, it is stored as `Mieno_assignment_1.qmd` — the name the
assignments ask for and `sort-submissions.R` reads. Under Dropbox this
depended on students getting it right.

**No deadline is enforced, deliberately.** The binding deadline is the one
printed in the assignment. The form stays open and every upload is timestamped
in the log, so lateness stays a grading decision rather than a locked door.
Do not add a cutoff here.

**An unconfigured form refuses to open.** `doGet` checks that the destination
folder is set and reachable before rendering anything, so a deployment that was
never `setup()`-ed turns students away at the door instead of letting them fill
in a form and upload files that have nowhere to go.

**A failed log write or receipt email never fails an upload.** Both are wrapped
so a student watching the page is never told their work did not arrive when it
did.

**Uploads are serialised through a script lock**, so two students submitting at
the same moment cannot race on folder creation or on the uniqueness check that
keeps one submission from landing on another's name.

**A submission must contain both the `.qmd` and the rendered `.html`.** The
Submit button stays disabled until both are attached. This is enforced in the
browser rather than on the server on purpose: the server handles one file per
request, so by the time it could notice a missing `.html` the `.qmd` would
already be stored and the student would be left with a half-submission.

---

## Deploying it

### 1. Create the project

Either paste the three files into a new project at
<https://script.google.com> (turn on *Project Settings → Show "appsscript.json"*
first), or push them with [clasp](https://github.com/google/clasp):

```sh
cd assignments/webform
clasp login
clasp create --type webapp --title "AE-MS assignment submission"
clasp push
```

`clasp create` writes a `.clasp.json` holding the script id. That file is local
to your machine and is not needed by anyone else.

### 2. Point it at the folder — do not skip this

In the editor, select `setup` from the function dropdown and **Run** it once.
The values in it are already correct for this course, so it needs no editing:

```js
SUBMISSION_FOLDER_ID: DEFAULT_FOLDER_ID,   // assignments/submission in Drive
COURSE_YEAR: '2026',
SEND_RECEIPT: 'true'
```

It prompts for authorisation the first time — this is your own script asking
for access to your own Drive — and then prints what `checkSetup()` found.

Until this runs, `SUBMISSION_FOLDER_ID` is unset and the form serves a closed
door rather than a form, so nobody can waste a submission on it. Script
Properties are read on every request, so running `setup()` takes effect
immediately: reload the page, no redeploy.

The folder id lives in `DEFAULT_FOLDER_ID` at the top of `Code.gs` and again as
`submission.drive_folder_id` in `course-dates.json`. If the two ever disagree,
the JSON is the source of truth.

### 3. Deploy

*Deploy → New deployment → Web app*, with:

- **Execute as:** Me
- **Who has access:** Anyone

"Anyone" means anonymous, which is required: students should not have to have a
Google account or sign in to hand in work. The web app URL is the only thing
standing between the form and the internet, exactly as the Dropbox file request
URL was, so give it to students and do not publish it beyond the course site.

Copy the `/exec` URL.

### 4. Wire it into the course

Put the URL in `course-dates.json` and delete the `_internal` note beside it:

```json
"submission": {
  "url": "https://script.google.com/macros/s/AKfy…/exec",
  "folder": "assignments/submission",
  "drive_folder_id": "1F31lKFXaAUhmHR02WR3k3c-RgAlbq2LP"
}
```

Nothing else needs changing: the assignment sources already write
`{{submission}}`, and `assignments.qmd` already calls `submission_url()`.
Rebuild so the built copies pick it up:

```sh
Rscript assignments/build-assignments.R
```

Then submit a test file as yourself and check it lands in
`assignments/submission/<year>/<assignment>/`.

### Changing the code later

*Deploy → Manage deployments → edit → Version: New version.* This keeps the
same `/exec` URL. Choosing *New deployment* instead mints a **new** URL and
silently orphans the one printed in every assignment students already have.

---

## Publishing the materials folder

`Materials.gs` is the other direction: `Code.gs` takes work in, this puts work
out. The build writes `assignments/students/<year>/` and Drive syncs it, but a
synced folder is still private. Run **`shareMaterials()`** from the editor and
it makes that year readable by anyone with the link, then prints the link and
the year to paste into the `materials` block of `course-dates.json`.

It refuses rather than shares if the folder contains anything students must not
have. Before flipping sharing it walks the whole tree and rejects any file or
folder named like a key, solution, answer, submission, roster or grade, plus
any `.qmd` still carrying a `::: {.answer}` block — the case a name check alone
misses, because such a file looks perfectly innocent from its filename. A link
handed out cannot be recalled once an answer key has been downloaded, so the
check runs first and the share only happens if it comes back clean.

It shares the **year folder and never its parent**. Sharing
`assignments/students/` would let a student wander into another year and
download the wrong assignment.

Two companions:

- `materialsStatus()` — which years exist and which are shared, changing nothing
- `unshareMaterialsFor('2026')` — withdraw the link. Not the moment the term
  ends: a student finishing late work still needs the files.

The gate is covered by `test-helpers.js`, which runs the real scan over the
real folders on disk — it confirms this year's materials pass and that
`assignments/keys/` is refused.

---

## Rolling the course to a new year

1. Edit the `term` block of `course-dates.json` and rebuild the assignments.
2. Set `COURSE_YEAR` to the new year in *Project Settings → Script Properties*
   (or edit `setup()` and rerun it), then `checkSetup()`.
3. Run `shareMaterials()` and paste its two lines into the `materials` block of
   `course-dates.json`.

Submissions then file under the new year, and the new year's materials are
downloadable. Step 3 is the one that used to be a manual trip through the Share
dialog and got forgotten.

If you forget step 2, the fallback in `courseYear_()` derives the year from the
date on the assumption that the course runs in the fall — so work is misfiled
only if you also change terms. Set the property.

---

## The log

`submission-log`, a Sheet in the root of `assignments/submission/`, gets a row
per file: timestamp, year, assignment, name, email, stored filename, the name
the student uploaded it under, size, and a link.

This is what answers "did it go through", "when", and "which version am I
grading". It is inside `assignments/submission/`, which `.gitignore` excludes,
so it can never be committed — it contains student names and emails.

## Receipts

The student gets a confirmation email listing what was stored. Turn it off by
setting `SEND_RECEIPT` to `false`.

Consumer Gmail allows 100 recipients a day, which a deadline-night rush could
approach. If the quota is hit the upload still succeeds and the page tells the
student to screenshot it instead.

---

## Limits and what happens at them

| | |
|---|---|
| Per file | 25 MB, checked in the browser and again on the server |
| Per submission | 8 files |
| Accepted | `.qmd .rmd .html .htm .pdf .r .ipynb .zip` |
| Required | at least one `.qmd` **and** one `.html` |

Files upload one at a time, in sequence, because a single request carrying all
of them would hit the payload limit. A failure part-way keeps everything
already stored and offers to submit the rest; retrying does not re-upload what
already landed.

Submissions count against **your** Drive storage, not the student's.

---

## When something goes wrong

Run **`selfTest()`** from the editor. It walks the whole server-side path with a
tiny file — properties, folder, year, destination, naming, validation, the Drive
write, the log — and prints either `OK` for every step or `FAILED HERE` with the
real message and stack at the first one that breaks. It trashes its test file
before returning.

That splits the two cases that look identical from the student's side:

- **The form shows "not accepting submissions yet"** — `setup()` has not been
  run, or the folder id it holds cannot be opened. The grey line at the bottom
  of that page says which. Run `setup()`, reload.
- **`selfTest()` fails** — the problem is configuration or permissions. The step
  it stops at says which. A wrong `SUBMISSION_FOLDER_ID` stops it at *root
  folder*; a missing scope stops it at *create file* or *log sheet*.
- **`selfTest()` passes but submitting fails** — the problem is the upload
  request, not the server. Almost always a file too large to travel in one
  `google.script.run` call; the page names the file and its size for that
  reason. Check *Executions* in the Apps Script editor for the matching entry.

After changing anything, remember it is *Deploy → Manage deployments → edit →
Version: New version*. Editing the code alone does not change what the deployed
`/exec` URL serves, so a fix can look like it did nothing.

## Editing the assignment list

`ASSIGNMENTS` at the top of `Code.gs`. Each `id` becomes a folder name, so it
must match the ids used in `course-dates.json` and by `sort-submissions.R`
(`assignment-1`, …, `final-project`). Push, then deploy a **new version** of
the existing deployment.
