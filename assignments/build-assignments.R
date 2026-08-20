# =============================================================================
# Build year-specific assignments from the instructor sources.
#
#   Rscript assignments/build-assignments.R          # build the current year
#   Rscript assignments/build-assignments.R 2027     # build a specific year
#
# From R:
#   source(here::here("assignments/build-assignments.R"))
#   build_assignments()            # build + render everything
#   build_assignments(render = FALSE)
#   build_assignments(only = "assignment-1")
#
# Layout produced (see CLAUDE.md for the full process):
#
#   assignments/instructor/assignment-1.qmd   source of truth, {{placeholders}}
#   assignments/data/                         shared data pool
#   assignments/keys/<year>/                  answer key,  dates resolved
#   assignments/students/<year>/assignment-1/ student copy, dates resolved,
#                                             data files alongside
#
# NEVER edit anything under keys/ or students/ by hand -- it is overwritten.
# =============================================================================

if (!requireNamespace("here", quietly = TRUE)) {
  stop("the `here` package is required", call. = FALSE)
}
source(here::here("course-dates.R"))
source(here::here("assignments/strip-answers.R"))

# --- manifest ----------------------------------------------------------------
# One entry per assignment. `data` lists the files a student needs next to the
# qmd; they are copied from assignments/data/. Keep this in step with the
# instructor source -- build_assignments() checks that every file listed here
# exists, and warns about any data file the source reads but does not list.

ASSIGNMENTS <- list(
  "assignment-1" = list(
    source = "assignment-1.qmd",
    data = c("401K.csv", "CEOSAL2.dta")
  ),
  "assignment-2" = list(
    source = "assignment-2.qmd",
    data = c("wage2.rds", "discrim.dta")
  ),
  "assignment-3" = list(
    source = "assignment-3.qmd",
    data = c("KIELMC.dta", "WAGE2.dta", "BEAUTY.dta", "gpa2.dta",
             "corn_prod_wide.rds", "corn_price_long.rds")
  )
)

# -----------------------------------------------------------------------------

assignment_paths <- function(id, year) {
  spec <- ASSIGNMENTS[[id]]
  list(
    instructor = here::here("assignments/instructor", spec$source),
    key = here::here("assignments/keys", year, paste0(id, "-key.qmd")),
    student_dir = here::here("assignments/students", year, id),
    student = here::here("assignments/students", year, id, paste0(id, ".qmd")),
    data = spec$data
  )
}

#' Copy the data files a student needs next to their qmd.
place_data <- function(files, dest_dir) {
  pool <- here::here("assignments/data")
  for (f in files) {
    src <- file.path(pool, f)
    if (!file.exists(src)) {
      stop(sprintf("data file '%s' is listed in the manifest but missing from %s",
                   f, pool), call. = FALSE)
    }
    file.copy(src, file.path(dest_dir, f), overwrite = TRUE, copy.date = TRUE)
  }
  invisible(files)
}

#' Warn about data the source reads but the manifest does not ship.
check_manifest <- function(instructor_path, listed) {
  src <- readLines(instructor_path, warn = FALSE)
  read <- unique(unlist(regmatches(
    src, gregexpr('[A-Za-z0-9_.-]+\\.(csv|dta|rds|RDS|DTA)(?![A-Za-z0-9])', src, perl = TRUE)
  )))
  # strip markdown emphasis: the source writes __401K.csv__, not the filename
  read <- sub('^_+', '', read)
  missing <- setdiff(read, listed)
  if (length(missing)) {
    warning(sprintf("%s reads %s but the manifest does not ship it",
                    basename(instructor_path), paste(missing, collapse = ", ")),
            call. = FALSE)
  }
  unused <- setdiff(listed, read)
  if (length(unused)) {
    message(sprintf("    note: %s ships %s, which the source never reads",
                    basename(instructor_path), paste(unused, collapse = ", ")))
  }
  invisible(TRUE)
}

#' Build (and optionally render) the assignments for one year.
#'
#' @param year   character/numeric year; defaults to the year of the term in
#'               course-dates.json
#' @param only   optional vector of assignment ids to build
#' @param render render the key and the student copy to HTML
build_assignments <- function(year = NULL, only = NULL, render = TRUE) {
  cal <- read_course_dates(refresh = TRUE)
  if (is.null(year)) year <- format(cal$first_class_day, "%Y")
  year <- as.character(year)

  ids <- if (is.null(only)) names(ASSIGNMENTS) else only
  unknown <- setdiff(ids, names(ASSIGNMENTS))
  if (length(unknown)) {
    stop("not in the manifest: ", paste(unknown, collapse = ", "), call. = FALSE)
  }

  message(sprintf("Building %s for %s (term starts %s)",
                  paste(ids, collapse = ", "), year,
                  format(cal$first_class_day, "%b %e, %Y")))

  built <- lapply(ids, function(id) {
    p <- assignment_paths(id, year)
    check_manifest(p$instructor, p$data)

    gen_key_version(p$instructor, p$key, cal)
    dir.create(p$student_dir, showWarnings = FALSE, recursive = TRUE)
    gen_student_version(p$instructor, p$student, cal)
    # Data sits next to BOTH built files. The instructor source therefore reads
    # a bare filename -- exactly what a student writes -- and a chunk marked
    # `keep` works identically in the key and in the student copy.
    place_data(p$data, p$student_dir)
    place_data(p$data, dirname(p$key))

    if (render) {
      for (f in c(p$key, p$student)) {
        rmarkdown::render(f, quiet = TRUE)
      }
    }
    p
  })
  names(built) <- ids

  # The student copy is what actually goes out, so verify it one last time.
  for (id in ids) {
    verify_student_copy(built[[id]])
  }

  place_final_project_template(year)
  check_materials_link(cal, year)
  assert_students_dir_shareable()

  message(sprintf("Done. Student files: assignments/students/%s/", year))
  invisible(built)
}

#' The download link students use is scoped to a single year, so that nobody can
#' browse into another year's folder. Rolling the term without re-sharing leaves
#' the class downloading last year's assignments -- catch it at build time
#' rather than at render time.
#'
#' An unset link is a warning (the course may not be published yet); a link
#' pointing at the wrong year is an error.
check_materials_link <- function(cal, year) {
  url <- cal$materials$url
  if (is.null(url) || !nzchar(url)) {
    warning("materials.url is not set -- share assignments/students/", year,
            "/ in Dropbox and paste the link into course-dates.json before ",
            "rendering the site", call. = FALSE)
    return(invisible(FALSE))
  }
  if (!identical(as.character(cal$materials$year), year)) {
    stop("materials.url points at year ", cal$materials$year, " but you are ",
         "building ", year, ". Share assignments/students/", year,
         "/ in Dropbox, then update materials.url and materials.year.",
         call. = FALSE)
  }
  invisible(TRUE)
}

#' The final project template is not built from an instructor source, but the
#' assignments page sends students to the same shared folder for it, so it has
#' to live there alongside the assignments.
place_final_project_template <- function(year) {
  src <- here::here("assignments/final-project/template/final-project-template.qmd")
  if (!file.exists(src)) {
    warning("final project template not found at ", src, call. = FALSE)
    return(invisible(FALSE))
  }
  dest_dir <- here::here("assignments/students", year, "final-project")
  dir.create(dest_dir, showWarnings = FALSE, recursive = TRUE)
  file.copy(src, file.path(dest_dir, basename(src)), overwrite = TRUE,
            copy.date = TRUE)
  invisible(TRUE)
}

#' assignments/students/ is shared publicly with the class, so anything that
#' leaks into it is published. Refuse to finish a build if something that looks
#' like an answer key or a submission has ended up there.
assert_students_dir_shareable <- function() {
  root <- here::here("assignments/students")
  files <- list.files(root, recursive = TRUE, full.names = TRUE, all.files = TRUE)
  files <- files[!dir.exists(files)]

  named <- grep("key|solution|answer|submission|roster|grade", basename(files),
                ignore.case = TRUE, value = TRUE)
  qmds <- files[grepl("[.]qmd$", files)]
  with_answers <- qmds[vapply(qmds, function(f) {
    any(grepl("^:{3,}\\s*\\{[^}]*[.]answer", readLines(f, warn = FALSE)))
  }, logical(1))]

  problems <- c(
    if (length(named)) paste("suspiciously named:", paste(named, collapse = ", ")),
    if (length(with_answers)) paste("contains answer divs:",
                                    paste(basename(with_answers), collapse = ", "))
  )
  if (length(problems)) {
    stop("assignments/students/ is shared with the class and is not safe to ",
         "publish:\n  ", paste(problems, collapse = "\n  "), call. = FALSE)
  }
  invisible(TRUE)
}

#' Last line of defence before a file reaches students.
verify_student_copy <- function(p) {
  lines <- readLines(p$student, warn = FALSE)
  problems <- c()
  if (any(grepl("\\{\\{", lines))) problems <- c(problems, "unresolved placeholder")
  if (any(grepl("^:{3,}\\s*\\{[^}]*\\.answer", lines))) {
    problems <- c(problems, "answer div")
  }
  if (any(grepl("assignments/data", lines))) {
    problems <- c(problems, "repo-relative data path (students have no repo)")
  }
  missing <- p$data[!file.exists(file.path(p$student_dir, p$data))]
  if (length(missing)) problems <- c(problems, paste("missing data:", paste(missing, collapse = ", ")))
  if (length(problems)) {
    stop(sprintf("%s is not fit to distribute: %s", basename(p$student),
                 paste(problems, collapse = "; ")), call. = FALSE)
  }
  invisible(TRUE)
}

if (sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)
  build_assignments(year = if (length(args)) args[1] else NULL)
}
