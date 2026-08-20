# =============================================================================
# Resolve course-dates.json into actual calendar dates.
#
# Dates in the JSON are stored as (week, day) offsets from the start of the
# term, so rolling the course to a new year is a one-line edit to
# `term.first_class_day` (plus the registrar-set holidays).
#
#   dates <- read_course_dates()
#   dates$events        # data.frame: id, type, title, assignment, date, time, note
#   dates$lecture_days  # Date vector, holidays already removed
#   dates$lab_days
#   dates$no_class
#
#   course_date("assignment-1-due")            # a single Date
#   format_course_date("assignment-1-due")     # "Friday, September 25, 2026"
# =============================================================================

.course_dates_cache <- new.env(parent = emptyenv())

DAY_ABBR <- c(Mon = 1, Tue = 2, Wed = 3, Thu = 4, Fri = 5, Sat = 6, Sun = 7)

#' Monday of the week containing `d` (weeks start Monday).
week_start <- function(d) {
  d <- as.Date(d)
  # %u is 1 (Mon) .. 7 (Sun)
  d - (as.integer(format(d, "%u")) - 1L)
}

#' Resolve one (anchor, week, day) triple to a Date.
resolve_offset <- function(week, day, anchor_date) {
  if (!day %in% names(DAY_ABBR)) {
    stop("unknown day '", day, "'; use one of ", paste(names(DAY_ABBR), collapse = ", "),
         call. = FALSE)
  }
  week_start(anchor_date) + (week - 1L) * 7L + (DAY_ABBR[[day]] - 1L)
}

#' Load and resolve the course calendar.
#'
#' @param path path to course-dates.json
#' @param refresh re-read even if cached
read_course_dates <- function(path = NULL, refresh = FALSE) {
  if (is.null(path)) {
    path <- if (requireNamespace("here", quietly = TRUE)) {
      here::here("course-dates.json")
    } else {
      "course-dates.json"
    }
  }
  key <- normalizePath(path, mustWork = TRUE)
  if (!refresh && !is.null(.course_dates_cache[[key]])) return(.course_dates_cache[[key]])

  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    stop("the jsonlite package is required to read course-dates.json", call. = FALSE)
  }
  spec <- jsonlite::fromJSON(key, simplifyVector = FALSE)

  term <- spec$term
  first_day <- as.Date(term$first_class_day)
  last_day <- as.Date(term$last_class_day)
  finals_start <- as.Date(term$finals_week_starts)

  anchors <- c(term = first_day, finals = finals_start)

  no_class <- as.Date(vapply(term$no_class, function(x) x$date, character(1)))
  no_class_labels <- vapply(term$no_class, function(x) x$label, character(1))

  # --- events -------------------------------------------------------------
  ev <- do.call(rbind, lapply(spec$events, function(e) {
    anchor <- if (is.null(e$anchor)) "term" else e$anchor
    if (!anchor %in% names(anchors)) {
      stop("event '", e$id, "' uses unknown anchor '", anchor, "'", call. = FALSE)
    }
    data.frame(
      id = e$id,
      type = e$type,
      title = e$title,
      assignment = if (is.null(e$assignment)) NA_character_ else e$assignment,
      date = resolve_offset(e$week, e$day, anchors[[anchor]]),
      time = if (is.null(e$time)) "" else e$time,
      note = if (is.null(e$note)) NA_character_ else e$note,
      stringsAsFactors = FALSE
    )
  }))
  ev <- ev[order(ev$date), ]
  rownames(ev) <- NULL

  # --- recurring meetings -------------------------------------------------
  all_days <- seq(first_day, last_day, by = "day")
  dow <- format(all_days, "%a")

  meets <- function(kind) {
    days <- unlist(term$meeting_days[[kind]]$days)
    all_days[dow %in% days & !all_days %in% no_class]
  }
  # An exam *is* that day's lecture, so it replaces the routine chip.
  exam_days <- ev$date[ev$type == "exam"]

  # --- submission link ----------------------------------------------------
  # One permanent file request for the whole course; see the readme in the JSON.
  sub <- spec$submission
  if (is.null(sub)) sub <- list()
  mat <- spec$materials
  if (is.null(mat)) mat <- list()

  res <- list(
    label = term$label,
    first_class_day = first_day,
    last_class_day = last_day,
    finals_week_starts = finals_start,
    registrar_calendar = term$registrar_calendar,
    events = ev,
    submission = sub,
    materials = mat,
    lecture_days = setdiff(meets("lecture"), exam_days),
    lab_days = meets("lab"),
    exam_days = exam_days,
    no_class = data.frame(date = no_class, label = no_class_labels,
                          stringsAsFactors = FALSE),
    lecture_time = term$meeting_days$lecture$time,
    lab_time = term$meeting_days$lab$time
  )
  res$lecture_days <- as.Date(res$lecture_days, origin = "1970-01-01")

  sanity_check(res)
  .course_dates_cache[[key]] <- res
  res
}

#' Catch the mistakes that only show up once students are looking at it.
sanity_check <- function(d) {
  ev <- d$events
  outside <- ev$date < d$first_class_day |
    (ev$date > d$last_class_day & ev$date < d$finals_week_starts)
  if (any(outside)) {
    warning("event(s) fall outside the teaching term: ",
            paste(ev$id[outside], collapse = ", "), call. = FALSE)
  }
  clash <- ev$date %in% d$no_class$date
  if (any(clash)) {
    warning("event(s) land on a no-class day: ",
            paste(sprintf("%s (%s)", ev$id[clash], format(ev$date[clash], "%a %b %e")),
                  collapse = ", "), call. = FALSE)
  }
  dup <- ev$date[duplicated(ev$date) & ev$type == "deadline"]
  if (length(dup)) {
    warning("two deadlines land on the same day: ",
            paste(format(unique(dup), "%a %b %e"), collapse = ", "), call. = FALSE)
  }
  invisible(TRUE)
}

#' A single date by event id.
course_date <- function(id, path = NULL) {
  d <- read_course_dates(path)
  hit <- d$events$date[d$events$id == id]
  if (length(hit) != 1L) stop("no unique event with id '", id, "'", call. = FALSE)
  hit
}

#' A single date by event id, formatted for prose.
format_course_date <- function(id, fmt = "%A, %B %e, %Y", path = NULL) {
  gsub("  +", " ", format(course_date(id, path), fmt))
}

#' The course's permanent submission link.
#'
#' The /exec URL of the Apps Script web app in assignments/webform/. One form
#' for every assignment and every year; see the readme in course-dates.json.
submission_url <- function(path = NULL) {
  d <- read_course_dates(path)
  url <- d$submission$url
  if (is.null(url) || !nzchar(url)) {
    stop("no `submission.url` in course-dates.json -- deploy ",
         "assignments/webform/ and paste its /exec URL there", call. = FALSE)
  }
  url
}

#' The local root of this machine's Dropbox.
#'
#' Read from Dropbox's own info.json rather than assuming ~/Dropbox, which is
#' wrong on any machine where the folder was relocated.
dropbox_root <- function() {
  info <- path.expand("~/.dropbox/info.json")
  if (file.exists(info) && requireNamespace("jsonlite", quietly = TRUE)) {
    cfg <- jsonlite::fromJSON(info, simplifyVector = FALSE)
    for (account in c("personal", "business")) {
      p <- cfg[[account]]$path
      if (!is.null(p) && dir.exists(p)) return(p)
    }
  }
  fallback <- path.expand("~/Dropbox")
  if (!dir.exists(fallback)) {
    stop("cannot locate the Dropbox folder on this machine", call. = FALSE)
  }
  fallback
}

#' The permanent Dropbox link students use to download assignment materials.
materials_url <- function(path = NULL) {
  d <- read_course_dates(path)
  url <- d$materials$url
  term_year <- format(d$first_class_day, "%Y")
  if (is.null(url) || !nzchar(url)) {
    stop("no `materials.url` in course-dates.json -- share ",
         "assignments/students/", term_year, "/ in Dropbox and paste the link ",
         "there", call. = FALSE)
  }
  # The link is scoped to one year on purpose, so students cannot browse into
  # another year's folder. If the term moved and the link did not, it is still
  # handing out last year's assignments.
  if (!identical(as.character(d$materials$year), term_year)) {
    stop("materials.url points at year ", d$materials$year, " but the term is ",
         term_year, ". Share assignments/students/", term_year,
         "/ in Dropbox, then update materials.url and materials.year.",
         call. = FALSE)
  }
  url
}

#' Where submitted work lands, as a local path.
#'
#' The web form writes into assignments/submission/<year>/<assignment>/ inside
#' this repository, and the repository lives in Google Drive -- so the Drive
#' folder and the local folder are the same place and `submission.folder` is a
#' plain repo-relative path. (Before the course moved off Dropbox this had to
#' be resolved against the Dropbox root instead.)
submission_inbox <- function(path = NULL) {
  d <- read_course_dates(path)
  folder <- d$submission$folder
  if (is.null(folder) || !nzchar(folder)) {
    stop("no `submission.folder` in course-dates.json", call. = FALSE)
  }
  if (grepl("^(/|[A-Za-z]:)", folder)) return(folder)   # absolute, use as given
  here::here(folder)
}

`%||%` <- function(a, b) if (is.null(a)) b else a
