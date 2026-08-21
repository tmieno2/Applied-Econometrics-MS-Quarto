# Applied Econometrics (MS), AECN 896-004

Graduate applied econometrics at the University of Nebraska-Lincoln, written in
Quarto. The lecture notes run R in the browser through WebR, so students can
edit and re-run any code cell without installing anything.

**The site: <https://tmieno2.github.io/Applied-Econometrics-MS-Quarto/>**

You are welcome to teach from this, adapt it, or lift a single lecture. See
[LICENSE](LICENSE): the notes are CC BY 4.0 and the code is MIT, so all that is
asked is credit.

## What is here

| Path | What it is |
|---|---|
| `lectures/` | The course, one folder per topic. `.qmd` sources; the rendered decks are in `docs/`. |
| `lectures/RULES.md` | How the lecture styling works: the side-by-side WebR layout, figure sizing, math, transcripts. Read this before changing the look of anything. |
| `assignments/` | One source per assignment under `instructor/`, the student copies built from it under `students/<year>/`. See below. |
| `exams/`, `research-flow/` | Older exam material and a research-workflow walkthrough. Both are excluded from the render, and `research-flow/` needs two data files (one of them 16MB) that are not committed, so it will not run from a clone. |
| `docs/` | The rendered site, committed. GitHub Pages publishes from this folder. |
| `_extensions/coatless/webr/` | The WebR extension, vendored and patched (see below). |

## Building it

Quarto 1.7 or newer and R 4.5 or newer. The decks load their packages with
plain `library()` calls and install nothing, so install them once:

```r
install.packages(c(
  "tidyverse", "data.table", "fixest", "modelsummary", "gt", "flextable",
  "broom", "lmtest", "car", "AER", "wooldridge", "MASS", "ggpubr", "ggdag",
  "DiagrammeR", "DiagrammeRsvg", "rsvg", "here", "knitr", "bslib", "shiny"
))
```

Then, from the repository root:

```sh
quarto render
```

That writes the whole site into `docs/`. A single deck renders on its own with
`quarto render lectures/10-panel/10-panel.qmd`, but delete any `*.html` left at
the repository root afterwards, or the next full render stops partway trying to
move a file that has already been moved.

`rsvg` needs the librsvg system library on Linux (`libsvg2-dev`); everything
else installs from CRAN as-is.

## Laying out a WebR cell

Each `{webr-r}` cell decides for itself whether its code and its printed output
sit side by side or stacked, from the width of the code and a measurement of the
output taken at render time. Nothing is written in the `.qmd` for the usual
case. To overrule it, add one option to the cell:

| Cell option | What it does |
|---|---|
| `#\| layout: stacked` | keep output below the code, whatever the measurements say |
| `#\| layout: side` | force the side-by-side split |
| `#\| code-track: 0.6` | force the split and give the code 0.6 of the width, output the rest |

Forcing the split is a request, not a guarantee: code that would have to wrap
stays stacked. `lectures/RULES.md` explains what is measured, and gives the
`::: {.side-out}` / `::: {.stacked}` wrappers, which do the same for a knitr
cell or for several cells at once.

## If you are adapting this for your own course

Three things to change first:

1. **`_quarto.yml`**: the site title, and the navbar.
2. **`course-dates.json`**: every date on the schedule and syllabus is
   resolved from this file rather than typed into a page. `materials.publish_dir`
   in it is an absolute path on my machine; either point it at a folder of your
   own or ignore it, as it is only used by the assignment publishing step.
3. **`.gitignore`**: read section 1 before your first commit. This repository
   is public, and that section is what keeps student work out of it. Student
   submissions, rosters, grades and answer keys are excluded by design and are
   not in the repository or its history.

Two things worth knowing before you edit:

- The WebR extension under `_extensions/coatless/webr/` is **patched**, not
  stock: transparent figure canvas, base-graphics text scaled to the DPI, and
  errors never silenced. `quarto update` would overwrite those patches.
  `lectures/RULES.md` explains what each patch is for.
- The styling files under `lectures/` (`custom.scss`, `notebook.scss`,
  `webr-layout.html`, `_metadata.yml`, `_lecture-theme.R` and the rest) are
  shared with another course of mine and copied in from a multi-course
  repository. In a fork there is no upstream, so edit them here freely.

## How the assignments are made

You write each assignment once, as the answer key, in
`assignments/instructor/assignment-N.qmd`. The student copy is generated from
it, so a question and its solution can never drift apart. Three things happen
at build time.

**Answers are marked in the source and stripped out.** Anything inside a
Quarto fenced div `::: {.answer} ... :::` is removed from the student copy,
including code chunks inside it, nested divs and all. Code chunks are then
controlled by chunk options:

| In the instructor source | In the student copy |
|---|---|
| `#\| keep: true` | kept verbatim (setup chunks, code you hand them) |
| `#\| scaffold: true` | header kept, body replaced with a TODO comment |
| no option | R chunks are dropped, everything else is kept |

Dropping untagged R chunks is the default because in an answer key most of them
are the answer. Data-import chunks are deliberately left untagged, since
writing the import is part of the exercise. The rules are spelled out at the
top of `assignments/strip-answers.R`.

**Dates and links are placeholders, never typed.** The source writes
`{{assignment-1-due|%B %e}}` and `{{submission}}`; both are resolved from
`course-dates.json` when the year is built, so rolling the course to a new year
is a date-file edit rather than a search and replace.

**Data files travel with the assignment.** The manifest at the top of
`assignments/build-assignments.R` lists what each assignment ships. Those files
are copied from `assignments/data/` to sit next to both built copies, so the
instructor source can read a bare `"401K.csv"`, exactly what a student writes,
and a `keep` chunk behaves the same in the key and in the student version.

Then:

```sh
Rscript assignments/build-assignments.R          # the current year
Rscript assignments/build-assignments.R 2027     # a specific year
```

which writes the answer key to `assignments/keys/<year>/` and the student copy
to `assignments/students/<year>/assignment-N/`, data alongside each, and
renders both to HTML. Nothing under `keys/` or `students/` should be edited by
hand: it is overwritten on the next build, and each generated file carries an
md5 stamp of the source it came from so `check_student_versions()` can report
which ones have gone stale.

`assignments/keys/` is excluded from the repository on purpose. Answer keys are
not published.

The ten datasets the three assignments use are committed under
`assignments/data/`, so the build runs from a fresh clone. Most are Wooldridge's
teaching datasets, which also ship in the `wooldridge` R package; a couple are
mine. If you add a dataset of your own, add it in two places: the manifest in
`build-assignments.R`, and the negation list in `.gitignore`. Data files are
denied globally there so that a stray roster or gradebook is ignored wherever it
lands, which means a new dataset is invisible to git until you name it. Forget
the second step and the build keeps working for you while breaking for anyone
who clones.

## Collecting what students submit

Separate from the above, and needed by none of it. `assignments/webform/` is a
Google Apps Script web app that gives students one upload URL and writes each
file into a Google Drive folder the repository reaches through a symlink at
`assignments/submission`; `assignments/sort-submissions.R` files what arrives
into per-assignment folders for grading. Both assume my Drive. Delete them, or
leave them sitting unused, and collect submissions however you already do.


Questions, or something that does not build: open an issue.
