# =============================================================================
# Generate the student-facing version of an assignment from the instructor
# source (the answer key).
#
# THE CONTRACT
# ------------
# Answers are marked with a Quarto fenced div:
#
#     ::: {.answer}
#     Because the omitted variable is correlated with educ, ...
#     :::
#
# The whole div -- including any code chunks inside it -- is removed from the
# student version. Nested divs are handled correctly.
#
# Code chunks are controlled by chunk options:
#
#     #| keep: true       keep the chunk verbatim (setup, given code, ...)
#     #| scaffold: true   keep the header, replace the body with a TODO comment
#     (nothing)           R chunks are DROPPED; everything else is kept
#
# The default for R chunks is "drop", because in an answer key most of them are
# answers. Data-import chunks are deliberately left untagged -- writing the
# import is part of the exercise.
#
# WHAT IS NEVER TOUCHED
# ---------------------
# The YAML header, and any HTML/markdown outside an .answer div. In particular
# `<span style='color:blue'>` is now purely cosmetic and is ignored here, so it
# is safe to use it for due dates, score placeholders and emphasis.
#
# STALENESS
# ---------
# Each generated file carries an md5 stamp of the instructor source it came
# from. `check_student_versions()` reports any student file whose stamp no
# longer matches its source.
# =============================================================================

# --- low-level line classifiers ---------------------------------------------

is_chunk_open  <- function(x) grepl("^\\s*`{3,}\\s*\\{", x)
is_r_chunk     <- function(x) grepl("^\\s*`{3,}\\s*\\{\\s*r\\b", x)
chunk_fence    <- function(x) sub("^\\s*(`{3,}).*$", "\\1", x)
is_chunk_close <- function(x, fence) grepl(paste0("^\\s*", fence, "\\s*$"), x)

is_div_open  <- function(x) grepl("^\\s*:{3,}\\s*(\\{.*\\}|[A-Za-z.#][^[:space:]]*)\\s*$", x)
is_div_close <- function(x) grepl("^\\s*:{3,}\\s*$", x)
is_answer_div <- function(x) grepl("(\\{[^}]*\\.answer\\b|:{3,}\\s+answer\\s*$)", x)

is_directive <- function(x) grepl("^\\s*#\\|\\s*(keep|scaffold|solution)\\s*:", x)

#' Options that control how a chunk is emitted.
#'
#' Reads `#|` directives from the chunk body and the legacy `not_remove` marker
#' from the chunk header.
chunk_policy <- function(chunk) {
  header <- chunk[1]
  body <- if (length(chunk) > 2) chunk[-c(1, length(chunk))] else character()

  flag <- function(name) {
    hit <- grep(paste0("^\\s*#\\|\\s*", name, "\\s*:\\s*(true|yes)\\s*$"), body,
                ignore.case = TRUE)
    length(hit) > 0
  }

  if (!is_r_chunk(header)) return("keep")          # {=tex}, {python}, ...
  if (flag("scaffold")) return("scaffold")
  if (flag("keep")) return("keep")
  if (grepl("not_remove", header)) return("keep")  # legacy marker
  "drop"
}

#' Emit a chunk for the student version, dropping our own directive lines.
emit_chunk <- function(chunk, policy, todo = "# YOUR CODE HERE") {
  header <- chunk[1]
  closer <- chunk[length(chunk)]
  body <- if (length(chunk) > 2) chunk[-c(1, length(chunk))] else character()

  header <- sub("(,\\s*)?not_remove", "", header)
  body <- body[!is_directive(body)]

  if (identical(policy, "scaffold")) {
    opts <- body[grepl("^\\s*#\\|", body)]
    return(c(header, opts, todo, closer))
  }
  c(header, body, closer)
}

# --- the stripper -----------------------------------------------------------

#' Turn an instructor source into the student-facing source.
#'
#' @param lines character vector, the instructor .qmd read with readLines()
#' @return character vector
strip_answers <- function(lines) {
  n <- length(lines)
  if (n == 0L) stop("the instructor file is empty", call. = FALSE)

  out <- character()
  protected <- logical()          # TRUE for lines that must not be reflowed
  emit <- function(x, prot = FALSE) {
    out <<- c(out, x)
    protected <<- c(protected, rep(prot, length(x)))
  }

  i <- 1L

  # --- YAML header: copied through verbatim --------------------------------
  if (grepl("^---\\s*$", lines[1])) {
    close_at <- which(grepl("^(---|\\.\\.\\.)\\s*$", lines))
    close_at <- close_at[close_at > 1L]
    if (length(close_at) == 0L) stop("unterminated YAML header", call. = FALSE)
    close_at <- close_at[1]
    emit(lines[1:close_at], prot = TRUE)
    i <- close_at + 1L
  }

  div_stack <- character()
  inside_answer <- function() any(div_stack == "answer")

  while (i <= n) {
    line <- lines[i]

    # --- code chunk: consume as an indivisible block ----------------------
    if (is_chunk_open(line)) {
      fence <- chunk_fence(line)
      j <- i + 1L
      while (j <= n && !is_chunk_close(lines[j], fence)) j <- j + 1L
      if (j > n) {
        stop(sprintf("unterminated code chunk opened at line %d: %s", i, line),
             call. = FALSE)
      }
      chunk <- lines[i:j]
      if (!inside_answer()) {
        policy <- chunk_policy(chunk)
        if (!identical(policy, "drop")) {
          emit(emit_chunk(chunk, policy), prot = TRUE)
        }
      }
      i <- j + 1L
      next
    }

    # --- fenced div ------------------------------------------------------
    if (is_div_open(line)) {
      kind <- if (is_answer_div(line)) "answer" else "other"
      dropping <- inside_answer()
      div_stack <- c(div_stack, kind)
      if (!dropping && kind != "answer") emit(line)
      i <- i + 1L
      next
    }
    if (is_div_close(line)) {
      if (length(div_stack) == 0L) {
        stop(sprintf("closing ':::' at line %d has no matching opener", i),
             call. = FALSE)
      }
      kind <- div_stack[length(div_stack)]
      div_stack <- div_stack[-length(div_stack)]
      if (!inside_answer() && kind != "answer") emit(line)
      i <- i + 1L
      next
    }

    if (!inside_answer()) emit(line)
    i <- i + 1L
  }

  if (length(div_stack) > 0L) {
    stop(sprintf("unterminated fenced div(s): %s",
                 paste(div_stack, collapse = ", ")), call. = FALSE)
  }

  collapse_blank_runs(out, protected)
}

#' Removing answers leaves long runs of blank lines. Collapse runs of two or
#' more blank lines down to one, but never inside a code chunk.
collapse_blank_runs <- function(lines, protected) {
  blank <- !nzchar(trimws(lines)) & !protected
  drop <- blank & c(FALSE, head(blank, -1))
  lines[!drop]
}

# --- provenance -------------------------------------------------------------

stamp_prefix <- "<!-- DO NOT EDIT."

source_fingerprint <- function(path) {
  unname(tools::md5sum(path))
}

provenance_stamp <- function(instructor_path) {
  sprintf("%s Generated from %s (md5:%s) by assignments/strip-answers.R -- edit the instructor source instead. -->",
          stamp_prefix, basename(instructor_path),
          source_fingerprint(instructor_path))
}

#' Insert the stamp immediately after the YAML header.
add_stamp <- function(lines, instructor_path) {
  stamp <- provenance_stamp(instructor_path)
  if (!grepl("^---\\s*$", lines[1])) return(c(stamp, "", lines))
  close_at <- which(grepl("^(---|\\.\\.\\.)\\s*$", lines))
  close_at <- close_at[close_at > 1L][1]
  append(lines, c("", stamp), after = close_at)
}

# --- the one entry point you call -------------------------------------------

#' Resolve `{{...}}` placeholders against course-dates.json.
#'
#' The instructor source carries placeholders, never literal dates or links, so
#' one source file serves every year. The build substitutes the values for the
#' year being built.
#'
#'   {{assignment-1-due}}          -> "Friday, September 25, 2026"
#'   {{assignment-1-due|%B %e}}    -> "September 25"   (strftime format)
#'   {{submission}}                -> the permanent Dropbox file request URL
#'   {{materials}}                 -> the permanent download-folder URL
#'
#' @param lines character vector
#' @param cal   a list from read_course_dates()
resolve_placeholders <- function(lines, cal) {
  hits <- which(grepl(PLACEHOLDER_RE, lines, perl = TRUE))
  if (length(hits) == 0L) return(lines)

  for (i in hits) {
    # a line may carry more than one placeholder, so resolve left to right
    while (grepl(PLACEHOLDER_RE, lines[i], perl = TRUE)) {
      parts <- regmatches(lines[i], regexec(PLACEHOLDER_RE, lines[i], perl = TRUE))[[1]]
      id <- parts[2]
      fmt <- if (length(parts) >= 3L && nzchar(parts[3])) parts[3] else "%A, %B %e, %Y"

      literal <- if (identical(id, "materials")) {
        url <- cal$materials$url
        if (is.null(url) || !nzchar(url)) {
          stop("no `materials.url` in course-dates.json", call. = FALSE)
        }
        url
      } else if (identical(id, "submission")) {
        url <- cal$submission$url
        if (is.null(url) || !nzchar(url)) {
          stop("no `submission.url` in course-dates.json -- paste the permanent ",
               "Dropbox file request URL there", call. = FALSE)
        }
        url
      } else {
        if (!id %in% cal$events$id) {
          stop(sprintf("unknown date placeholder {{%s}}: no such event id in course-dates.json",
                       id), call. = FALSE)
        }
        gsub("  +", " ", format(cal$events$date[cal$events$id == id], fmt))
      }
      lines[i] <- sub(PLACEHOLDER_RE, literal, lines[i], perl = TRUE)
    }
  }
  lines
}

PLACEHOLDER_RE <- "\\{\\{([a-z0-9-]+)(?:\\|([^}]*))?\\}\\}"

#' Fail loudly if any placeholder survived into a built file.
assert_no_placeholders <- function(lines, what) {
  left <- grep(PLACEHOLDER_RE, lines, value = TRUE)
  if (length(left)) {
    stop(sprintf("unresolved placeholder(s) in %s:\n  %s", what,
                 paste(left, collapse = "\n  ")), call. = FALSE)
  }
  invisible(TRUE)
}

#' Build the answer key for one year: dates resolved, answers kept.
#'
#' @param instructor_path path to the instructor .qmd (carries placeholders)
#' @param key_path        path to write the resolved key to
#' @param cal             a list from read_course_dates()
gen_key_version <- function(instructor_path, key_path, cal) {
  lines <- read_instructor(instructor_path)
  key <- add_stamp(resolve_placeholders(lines, cal), instructor_path)
  assert_no_placeholders(key, basename(key_path))

  dir.create(dirname(key_path), showWarnings = FALSE, recursive = TRUE)
  writeLines(key, key_path)
  invisible(key_path)
}

#' Build the student version for one year: answers stripped, dates resolved.
#'
#' Dates are resolved *after* stripping so a placeholder that only ever appears
#' inside an answer never has to resolve at all.
#'
#' @param instructor_path path to the instructor .qmd (carries placeholders)
#' @param student_path    path to write the student .qmd to
#' @param cal             a list from read_course_dates()
gen_student_version <- function(instructor_path, student_path, cal) {
  lines <- read_instructor(instructor_path)
  student <- add_stamp(resolve_placeholders(strip_answers(lines), cal),
                       instructor_path)

  if (any(grepl("::: *\\{[^}]*\\.answer", student))) {
    stop("answer div survived stripping -- this is a bug", call. = FALSE)
  }
  assert_no_placeholders(student, basename(student_path))

  dir.create(dirname(student_path), showWarnings = FALSE, recursive = TRUE)
  writeLines(student, student_path)
  message(sprintf("  %-24s %d lines -> %d lines",
                  basename(student_path), length(lines), length(student)))
  invisible(student_path)
}

read_instructor <- function(path) {
  if (!file.exists(path)) {
    stop("no such instructor file: ", path, call. = FALSE)
  }
  readLines(path, warn = FALSE)
}

# --- staleness check --------------------------------------------------------

#' Report student files whose stamp no longer matches the instructor source.
#'
#' @param pairs named list: names are instructor paths, values are student paths
check_student_versions <- function(pairs) {
  status <- vapply(seq_along(pairs), function(k) {
    src <- names(pairs)[k]
    dst <- pairs[[k]]
    if (!file.exists(dst)) return("MISSING")
    stamped <- grep(stamp_prefix, readLines(dst, warn = FALSE), value = TRUE, fixed = TRUE)
    if (length(stamped) == 0L) return("UNSTAMPED")
    want <- sub(".*md5:([0-9a-f]+).*", "\\1", stamped[1])
    if (identical(want, source_fingerprint(src))) "ok" else "STALE"
  }, character(1))

  res <- data.frame(instructor = names(pairs), student = unlist(pairs),
                    status = status, row.names = NULL, stringsAsFactors = FALSE)
  bad <- res$status != "ok"
  if (any(bad)) {
    warning("student version(s) out of date: ",
            paste(basename(res$student[bad]), collapse = ", "), call. = FALSE)
  }
  res
}
