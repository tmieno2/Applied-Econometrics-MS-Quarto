# Working in this repository

Course site for Applied Econometrics (AECN 896-004), built with Quarto and
published to `docs/`.

Read this before touching assignments or any date. See also `AGENTS.md` for the
WebR side-by-side layout rules used by the lecture decks.

---

## 0. Named jobs — run the script, do not improvise

When the user asks for one of these, run the command. Do not write your own
version of it, and do not do the work by hand.

| The user says | Run |
|---|---|
| "sort assignments", "sort the submissions", "file the submissions" | `Rscript assignments/sort-submissions.R` then `--apply` — see §3 and `.claude/commands/sort-assignments.md` |
| "build the assignments", "rebuild", "make this year's assignments" | `Rscript assignments/build-assignments.R` — see §3 |
| "roll the course to <year>", "set up next year" | edit the `term` block of `course-dates.json`, then rebuild — see §2 |

These scripts exist because each one has a failure mode worth guarding against —
overwriting a student's only copy, shipping an answer key to students, letting a
date drift out of step. Hand-rolled equivalents lose those guards.

---

## 1. Never commit student data

`roster/`, `assignments/submission/` and
`assignments/final-project/student-submission/` are gitignored and must stay
that way. The site in `docs/` is public. Do not add student names, grades or
submissions to anything that is rendered or committed.

---

## 2. Dates: `course-dates.json` is the only source

**No calendar date may be hardcoded anywhere else.** Not in `schedule.qmd`, not
in `syllabus.qmd`, not in an assignment.

Dates are stored as `(week, day)` offsets rather than calendar dates:

```json
{ "id": "assignment-1-due", "type": "deadline", "assignment": "assignment-1",
  "week": 5, "day": "Fri", "time": "1 PM" }
```

- `week: 1` is the week containing `term.first_class_day`; weeks start Monday.
- `day` is `Mon`..`Fri`.
- `anchor` defaults to `term`. Use `"anchor": "finals"` for anything pinned to
  finals week, which the registrar moves independently of week counting.
- `note` is student-facing and renders in the key-dates table. Put
  instructor-only remarks in `_internal`, which is never rendered.

**Rolling the course to a new year** means editing the `term` block only —
`label`, `first_class_day`, `last_class_day`, `finals_week_starts`, and the
registrar's `no_class` holidays. Every deadline, midterm and release date moves
with it. Then rebuild the assignments (§3).

### Reading dates from R

```r
source(here::here("course-dates.R"))
cal <- read_course_dates()
course_date("assignment-1-due")                       # a Date
format_course_date("final-paper", "%b %e (%a), %Y")   # for prose
```

`read_course_dates()` warns if an event lands on a no-class day or if two
deadlines collide. Do not silence those warnings; fix the JSON.

`schedule.qmd` and `syllabus.qmd` already consume this. If you add a date to a
page, add it to the JSON and reference it — never type it out.

---

## 3. Assignments: one source, built per year

### Layout

```
assignments/
  instructor/assignment-N.qmd     SOURCE OF TRUTH. One file per assignment.
                                  Contains answers AND {{date placeholders}}.
  data/                           Shared data pool for every assignment.
  keys/<year>/                    BUILT answer key, dates resolved.
  students/<year>/assignment-N/   BUILT student copy + its data files.
  legacy/                         Assignments 3-4 from 2019-2022, not in this
                                  pipeline and out of sync with each other.
  build-assignments.R             The build.
  strip-answers.R                 Stripping + placeholder resolution.
```

**Everything under `keys/` and `students/` is generated. Never edit it by
hand — the next build overwrites it.** To change an assignment, edit
`instructor/assignment-N.qmd` and rebuild.

### Building

```sh
Rscript assignments/build-assignments.R          # the year in course-dates.json
Rscript assignments/build-assignments.R 2027     # a specific year
```

```r
source(here::here("assignments/build-assignments.R"))
build_assignments(only = "assignment-1", render = FALSE)
```

Adding an assignment means adding an entry to `ASSIGNMENTS` in
`build-assignments.R` (source filename + the data files students need) and
adding its `-release` / `-due` events to `course-dates.json`.

### Authoring rules for `instructor/assignment-N.qmd`

**Answers** go in a fenced div. The whole div, including any code chunk inside
it, is removed from the student copy:

```markdown
::: {.answer}
Because $income$ is correlated with $prpblck$, omitting it biases ...
:::
```

A fenced div only parses when it starts its own block: **leave a blank line
before `:::` and after the closing `:::`**. Without it pandoc emits the literal
text `::: {.answer}` into the HTML. Check rendered output, not just the source.

Do not use `<span style='color:blue'>` to mark an answer. Blue spans are now
purely cosmetic (score placeholder, due date) and the stripper ignores them.

**Code chunks.** R chunks are dropped from the student copy by default, because
in an answer key most of them are answers. Two opt-ins:

```r
#| keep: true       # kept verbatim (setup, given code)
#| scaffold: true   # header kept, body replaced by "# YOUR CODE HERE"
```

Data-import chunks are deliberately left untagged so they are dropped — writing
the import is part of the exercise. Do not "helpfully" scaffold them.

**Dates** are placeholders, never literals:

```markdown
Due date is {{assignment-1-due|%B %e}}
{{final-paper}}                      <- default format, e.g. "Friday, December 18, 2026"
```

The id must exist in `course-dates.json`. The build substitutes the real date
into both the key and the student copy; the source keeps the placeholder so one
file serves every year.

**The submission link** is a placeholder too, never a pasted URL:

```markdown
[Submit your assignment here]({{submission}})
```

There is **one permanent submission form for the whole course** — the Apps
Script web app in `assignments/webform/` — whose URL is the `submission` block
of `course-dates.json`. It does not change year to year. `assignments.qmd`
reads the same value via `submission_url()`. Before this was centralised, both
assignment sources pointed at one file request while the assignments page gave
two different ones — students got contradictory instructions. Keep it in one
place.

No deadline is set on the form, deliberately. It stays open and the binding
deadline is the one printed in the assignment. Do not add one.

### How students get the files

One permanent Dropbox shared-folder link, in the `materials` block of
`course-dates.json`, referenced as `materials_url()` (or `{{materials}}`).

**Share `assignments/students/<year>/` — the year folder, not `students/`.**
Sharing `students/` would let a student browse into another year and download
the wrong assignment. The year folder contains only that year.

It lives inside Dropbox, so `Rscript assignments/build-assignments.R` publishes
to students with no upload step — the build writes the qmd, copies each
assignment's datasets next to it, and drops in the final project template.

Because the link is year-scoped, **rolling the term means re-sharing.** After
changing `term`, share the new year folder and update both `materials.url` and
`materials.year`. Two guards make that impossible to forget silently:
`check_materials_link()` fails the build when `materials.year` disagrees with
the term (and warns when the link is simply unset), and `materials_url()` throws
the same way at render time.

Never share `assignments/` or the repo root: that exposes `keys/` (the answer
keys) and `submission/` (other students' work). Because the shared folder is
readable by anyone with the link, every build also ends with
`assert_students_dir_shareable()`, which refuses to finish if anything under
`students/` is named like a key, solution, submission, roster or gradebook, or
if any qmd there still contains an `.answer` div. Do not weaken either check.

### Where submissions land, and filing them

Students submit through **one web form for the whole course** — an Apps Script
web app whose source is `assignments/webform/`. It asks for a name, an email
and which assignment this is, then writes each uploaded file straight into

```
assignments/submission/<year>/<assignment>/
```

named to the convention (`Mieno_assignment_1.qmd`) regardless of what the
student called the file. `submission.url` in `course-dates.json` is its `/exec`
URL; `submission.folder` is that destination, and `submission.drive_folder_id`
is the same folder's Drive id, which the web app is configured with.

The repository lives in Google Drive, so submitted work syncs down to sit
beside the course materials for grading, while `**/submission/` in `.gitignore`
guarantees it can never be committed. That combination is the whole point;
verify `git check-ignore` still covers the path before changing it.

`assignments/webform/README.md` covers deploying it, rolling it to a new year,
and the guarantees not to break — chiefly that nothing is ever overwritten (a
resubmission lands as `_v2`) and that **no deadline is enforced in the form**,
deliberately: the binding deadline is the one printed in the assignment, and
every upload is timestamped in the log so lateness stays a grading decision.
Do not add a cutoff.

Its pure helpers have a test that runs without deploying anything:

```sh
node assignments/webform/test-helpers.js
```

Because the form asks which assignment it is, nothing has to be inferred from
the filename. `assignments/sort-submissions.R` remains for work that arrives by
another route — emailed in, or dropped into `assignments/submission/` by hand:

```sh
Rscript assignments/sort-submissions.R              # dry run, changes nothing
Rscript assignments/sort-submissions.R --apply      # file them
```

It reads the assignment number off the filename and moves each loose file at
the root of `assignments/submission/` into `<year>/<assignment>/`.

It is deliberately conservative, because student work is not in version control
and cannot be recovered if lost: dry run by default, copy-verify-then-delete
rather than a bare rename, never overwrites an existing file, and leaves
anything it cannot classify sitting where it is with a report rather than
guessing. Do not "improve" it into something that overwrites or force-moves.

**Data** is read by bare filename, exactly as a student would write it:

```r
data_c1 <- read_csv("401K.csv")
```

Never use `here::here("assignments/data/...")` in an instructor source. The
build copies each assignment's manifest data next to *both* built files — the
key and the student copy — so a bare filename resolves in either place. That is
what makes a chunk marked `keep` behave identically for you and for students.
`verify_student_copy()` fails the build if a repo-relative path reaches a
student file.

**A chunk marked `keep` must be self-contained.** It is handed to students in
isolation, and the chunks around it — including the one that loads packages —
are stripped. Assignment 3's `problem_3_given` chunk therefore loads
`tidyverse`, `data.table`, `fixest` and `modelsummary` itself. Relying on a
dropped chunk produces a file that renders perfectly for you and fails on the
student's machine, which is the worst possible failure mode here.

**Numbers in answers** must come from inline R, not typed in. The old key
claimed an intercept of 83.05 when the estimate was 83.075. Never compare
floating-point results with `==`; use `all.equal()`.

### What the build guarantees

Each built student file is checked before it is declared fit to distribute:
no unresolved placeholder, no surviving answer div, no repo-relative data path,
and every manifest data file present. The build also warns if the source reads
a data file the manifest does not ship. If a check fails the build stops —
fix the source, do not patch the output.

Each built file carries an md5 stamp of the instructor source it came from, so
`check_student_versions()` can tell you when a built copy is stale.

---

## 4. Verify by rendering, not by reading

Both the answer key and the student copy are rendered on every build. That is
deliberate: rendering is the only real check that what students receive still
runs, and several bugs here were invisible in the source and only appeared in
the HTML (literal `:::` blocks, a `$$$` artifact, an inline-R call that had
picked up a stray backslash).

After changing an assignment, confirm in the rendered student HTML that no
answer text leaked, and in the rendered key that the numbers are what you
expect.

---

## 5. `.gitignore` has blanket rules with deliberate exceptions

`*.R`, `*.Rmd`, `*.csv`, `*.dta`, `*.rds` are all ignored. Negations re-include
the build tooling — `!assignments/*.R`, `!course-dates.R`. If you add tooling
that the site needs in order to render, add a negation for it, or the repo will
not build from a fresh clone.

Data files under `assignments/data/` are intentionally untracked. They have no
version-control safety net, so move them rather than deleting them.
