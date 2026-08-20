---
description: File student submissions from the Dropbox inbox into submission/<year>/<assignment>/
---

Sort the student submissions that have arrived in the Dropbox file request inbox.

Run exactly this, from the repository root:

```sh
Rscript assignments/sort-submissions.R            # dry run: shows, changes nothing
Rscript assignments/sort-submissions.R --apply    # actually files them
```

Run the dry run first and show the user its output, then run `--apply`, then
report what moved.

Do not write your own file-moving code, and do not `mv` submissions by hand.
The script is deliberately careful because student work is not in version
control and cannot be recovered if lost: it copies, checksums the copy, and only
then removes the original; it never overwrites an existing file; and it leaves
anything it cannot classify sitting in the inbox rather than guessing.

Reading the results:

- **filed** — moved to `assignments/submission/<year>/<assignment>/`
- **already there** — a file of that name exists at the destination. The script
  refuses to overwrite. Do not force it. Look at both copies and tell the user;
  it usually means a student resubmitted under the same name.
- **unclassified** — no assignment number in the filename, so the script could
  not tell where it belongs. Report these to the user by name and ask where they
  go. Do not guess, and do not rename a student's file without being told to.

Classification reads the assignment number off the filename, which is why the
assignments instruct students to use `lastname_assignment_1.qmd`. Files whose
names contain `final` go to `final-project`.

The year defaults to the term in `course-dates.json`. To file into a different
year, pass `--year 2027`.

If the inbox is reported empty or missing, nothing has synced down from Dropbox
yet. Say so rather than investigating — it is normally just sync latency.
