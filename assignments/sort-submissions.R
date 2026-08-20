# =============================================================================
# File everything students uploaded to the permanent Dropbox request into
# assignments/submission/<year>/<assignment>/.
#
#   Rscript assignments/sort-submissions.R              # show what would move
#   Rscript assignments/sort-submissions.R --apply      # actually move it
#   Rscript assignments/sort-submissions.R --apply --year 2026
#
# The course uses ONE permanent file request (see `submission` in
# course-dates.json), so every assignment and the final project land together in
# one inbox. This sorts them out by reading the assignment number off the
# filename, which is why the assignments tell students to name their file
# `lastname_assignment_1.qmd`.
#
# SAFE BY DEFAULT: it lists and changes nothing unless you pass --apply. Even
# then it never overwrites an existing file and never deletes anything it
# cannot classify -- unmatched files stay in the inbox and are reported.
#
# Student work is not in version control and is not recoverable if lost, so
# this moves files rather than renaming or rewriting them.
# =============================================================================

source(here::here("course-dates.R"))

#' Work out which assignment a submitted file belongs to.
#'
#' Dropbox appends the submitter's name, so a file arrives looking like
#' "Fuchs_assignment_1 Sarah Fuchs.qmd" or "final-TARASHTWAL Omid.qmd".
classify <- function(filename) {
  f <- tolower(filename)
  n <- regmatches(f, regexec("assignment[ _-]*([0-9]+)", f))[[1]]
  if (length(n) == 2L) return(paste0("assignment-", as.integer(n[2])))
  if (grepl("final", f)) return("final-project")
  NA_character_
}

sort_submissions <- function(year = NULL, apply = FALSE, inbox = NULL) {
  cal <- read_course_dates(refresh = TRUE)
  if (is.null(year)) year <- format(cal$first_class_day, "%Y")
  year <- as.character(year)
  if (is.null(inbox)) inbox <- submission_inbox()

  if (!dir.exists(inbox)) {
    message("inbox does not exist yet: ", inbox,
            "\n(it is created the first time a student uploads)")
    return(invisible(NULL))
  }

  files <- list.files(inbox, full.names = TRUE, recursive = FALSE)
  files <- files[!dir.exists(files)]
  files <- files[!grepl("^[.]", basename(files))]
  if (length(files) == 0L) {
    message("inbox is empty: ", inbox)
    return(invisible(NULL))
  }

  root <- here::here("assignments/submission", year)
  target <- vapply(basename(files), classify, character(1), USE.NAMES = FALSE)

  moved <- skipped <- unmatched <- 0L
  for (k in seq_along(files)) {
    from <- files[k]
    name <- basename(from)

    if (is.na(target[k])) {
      message(sprintf("  ?  %-52s no assignment number in the name", name))
      unmatched <- unmatched + 1L
      next
    }

    dest_dir <- file.path(root, target[k])
    to <- file.path(dest_dir, name)

    if (file.exists(to)) {
      message(sprintf("  =  %-52s already in %s/%s", name, year, target[k]))
      skipped <- skipped + 1L
      next
    }

    if (!apply) {
      message(sprintf("  ->  %-52s %s/%s", name, year, target[k]))
      moved <- moved + 1L
      next
    }

    dir.create(dest_dir, showWarnings = FALSE, recursive = TRUE)
    # copy-then-verify-then-remove: a failed file.rename across devices would
    # otherwise lose the only copy of a student's work
    if (!file.copy(from, to, copy.date = TRUE)) {
      warning(sprintf("could not copy %s; left in the inbox", name), call. = FALSE)
      next
    }
    if (!identical(unname(tools::md5sum(from)), unname(tools::md5sum(to)))) {
      file.remove(to)
      warning(sprintf("copy of %s did not verify; left in the inbox", name),
              call. = FALSE)
      next
    }
    file.remove(from)
    message(sprintf("  ->  %-52s %s/%s", name, year, target[k]))
    moved <- moved + 1L
  }

  message(sprintf("\n%s: %d to file, %d already there, %d unclassified",
                  if (apply) "moved" else "dry run", moved, skipped, unmatched))
  if (!apply && moved > 0L) message("re-run with --apply to move them")
  if (unmatched > 0L) {
    message("unclassified files stay in the inbox; rename them or file by hand")
  }
  invisible(list(moved = moved, skipped = skipped, unmatched = unmatched))
}

if (sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)
  year <- if ("--year" %in% args) args[which(args == "--year") + 1L] else NULL
  sort_submissions(year = year, apply = "--apply" %in% args)
}
