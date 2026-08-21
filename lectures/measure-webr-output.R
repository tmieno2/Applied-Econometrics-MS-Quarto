#!/usr/bin/env Rscript
# Measure what every {webr-r} cell PRINTS, at render time, so the side-by-side
# layout can be decided from the real output before a student runs anything.
#
#   Rscript lectures/measure-webr-output.R .            (from a course root)
#   Rscript _lecture-shared/measure-webr-output.R AE-MS  (from the shared copy)
#
# Quarto runs it automatically before every render, via `project: pre-render:`
# in the course's _quarto.yml. Nothing needs running by
# hand: a deck is re-measured only when its .qmd is newer than the .json beside
# it, so an unchanged render pays nothing.
#
# For each deck it writes <deck>.webr-output.js next to the .qmd, keyed by the
# cell's own source text:
#
#   window.webrOutputSizes = {"2 + 3.3\n\n6 - 2.7": {"cols": 12, "rows": 7, ...}}
#
# It is a .js assignment rather than a .json file so that webr-layout.html can
# load it with a <script src>. A fetch() of a sibling file is blocked on a
# file:// page, which is how these decks are previewed locally: every cell then
# looked unmeasured and went side by side, and the deck previewed differently
# from the way it renders on the published site. A script tag loads either way.
#
# `cols` is the width of the widest printed line in characters, `rows` the number
# of printed lines. webr-layout.html reads this at load. A cell that is missing
# from the file — because it errored here, or because the deck was edited since
# — simply falls back to the code-only rule, so a stale file degrades, it does
# not break.
#
# WebR leaves `options(width = 80)` alone, so the child process below does too:
# the character counts measured here are the ones the student's browser prints.

# Quarto calls this as a pre-render script with NO arguments, from the course
# directory, so that is the default. A course directory can also be named
# explicitly when running it by hand from Teaching/.
args <- commandArgs(trailingOnly = TRUE)
named <- args[!startsWith(args, "--")]
course <- normalizePath(if (length(named)) named[1] else ".", mustWork = TRUE)

qmds <- list.files(file.path(course, "lectures"), pattern = "[.]qmd$",
                   recursive = TRUE, full.names = TRUE)

# ---- cell extraction --------------------------------------------------------
# A cell is ```{webr-r} ... ```. Its `#|` option lines are part of the source but
# not part of what R evaluates, and `context: setup` marks the block that every
# other cell on the deck depends on.
extract_cells <- function(lines) {
  opens <- grep("^\\s*```\\{webr-r\\}\\s*$", lines)
  cells <- list()
  for (open in opens) {
    close <- open + which(grepl("^\\s*```\\s*$", lines[(open + 1):length(lines)]))[1]
    if (is.na(close)) next
    body <- if (close > open + 1) lines[(open + 1):(close - 1)] else character(0)
    opts <- grepl("^\\s*#\\|", body)
    cells[[length(cells) + 1]] <- list(
      code = paste(body[!opts], collapse = "\n"),
      setup = any(grepl("^\\s*#\\|\\s*context:\\s*setup", body[opts]))
    )
  }
  cells
}

# `webr::install()` cannot run here — there is no webr package outside the
# browser. Drop the whole call, parentheses balanced, and let the child rely on
# the locally installed copy of the package instead.
strip_webr_install <- function(code) {
  repeat {
    at <- regexpr("webr::install\\s*\\(", code)
    if (at < 0) return(code)
    i <- at + attr(at, "match.length") - 1  # the opening paren
    depth <- 1
    j <- i
    chars <- strsplit(code, "")[[1]]
    while (depth > 0 && j < length(chars)) {
      j <- j + 1
      if (chars[j] == "(") depth <- depth + 1
      if (chars[j] == ")") depth <- depth - 1
    }
    code <- paste0(substr(code, 1, at - 1), substr(code, j + 1, nchar(code)))
  }
}

# ---- the child process ------------------------------------------------------
# One fresh R process per deck, because every cell on a deck shares one R session
# in the browser and cells on DIFFERENT decks share nothing.
# The deck's YAML lists the packages WebR attaches for it:
#
#   webr:
#     packages: ['dplyr', 'ggplot2']
#
# The browser attaches those before any cell runs, and most decks rely on that
# instead of a `context: setup` cell — miss it and every dplyr cell on the deck
# errors here and goes unmeasured.
extract_packages <- function(lines) {
  at <- grep("^\\s*packages:", lines)
  if (!length(at)) return(character(0))
  raw <- paste(lines[at], collapse = " ")
  hits <- regmatches(raw, gregexpr("['\"][^'\"]+['\"]", raw))[[1]]
  unique(gsub("['\"]", "", hits))
}

measure_deck <- function(qmd) {
  lines <- readLines(qmd, warn = FALSE)
  cells <- extract_cells(lines)
  if (!length(cells)) return(invisible(NULL))
  pkgs <- extract_packages(lines)

  payload <- tempfile(fileext = ".rds")
  result <- tempfile(fileext = ".json")
  saveRDS(list(cells = lapply(cells, function(c) {
    c$code <- strip_webr_install(c$code); c
  }), pkgs = pkgs), payload)

  script <- sprintf('
options(width = 80)
payload <- readRDS("%s")
cells <- payload$cells
for (p in payload$pkgs) {
  try(suppressMessages(suppressWarnings(library(p, character.only = TRUE))), silent = TRUE)
}
env <- new.env(parent = globalenv())
out <- list()
for (cell in cells) {
  if (!nzchar(trimws(cell$code))) next
  res <- try(evaluate::evaluate(cell$code, envir = env, stop_on_error = 0L,
                                new_device = TRUE), silent = TRUE)
  if (inherits(res, "try-error")) next
  if (isTRUE(cell$setup)) next
  errs <- Filter(function(x) inherits(x, "error"), res)
  # A cell that FAILS TO PARSE fails in the browser too, identically, and several
  # slides teach exactly that: `if <- 3`, `1a <- 2`. Its error text is real
  # output and must be measured. Any other error is almost certainly this
  # machine missing a package or a dataset the browser has, so the cell is left
  # unmeasured and falls back to the code-only rule.
  parse_error <- length(errs) &&
    grepl("^<text>:", conditionMessage(errs[[1]]))
  if (length(errs) && !parse_error) next
  if (parse_error) {
    text <- unlist(strsplit(paste0("Error: ", conditionMessage(errs[[1]])),
                            "\n", fixed = TRUE))
  } else {
    text <- unlist(lapply(res, function(x) if (is.character(x)) x else NULL))
    text <- unlist(strsplit(paste(text, collapse = ""), "\n", fixed = TRUE))
  }
  text <- text[nzchar(text) | seq_along(text) < length(text)]
  plotted <- any(vapply(res, function(x) inherits(x, "recordedplot"), logical(1)))
  out[[trimws(cell$code)]] <- list(
    cols = if (length(text)) max(nchar(text)) else 0L,
    rows = length(text),
    plot = plotted
  )
}
if (!length(out)) writeLines("{}", "%s") else
  writeLines(jsonlite::toJSON(out, auto_unbox = TRUE), "%s")
', payload, result, result)

  child <- tempfile(fileext = ".R")
  writeLines(script, child)
  status <- system2("Rscript", c("--vanilla", shQuote(child)),
                    stdout = FALSE, stderr = FALSE)
  if (status != 0 || !file.exists(result)) {
    message("  ! could not measure ", basename(qmd))
    return(invisible(NULL))
  }
  target <- sub("[.]qmd$", ".webr-output.js", qmd)
  writeLines(paste0("window.webrOutputSizes = ",
                    paste(readLines(result, warn = FALSE), collapse = ""), ";"),
             target)
  n <- length(jsonlite::fromJSON(result, simplifyVector = FALSE))
  message("  ", basename(target), ": ", n, " cells measured")
}

# Quarto runs this before every render (see each course's `_quarto.yml`), so it
# has to be cheap when nothing changed: a deck is re-measured only when its .qmd
# is newer than the .json beside it. `--force` re-measures everything, which is
# what to use after changing the measuring script itself.
force <- "--force" %in% args

for (qmd in qmds) {
  if (!any(grepl("```\\{webr-r\\}", readLines(qmd, warn = FALSE)))) next
  json <- sub("[.]qmd$", ".webr-output.js", qmd)
  if (!force && file.exists(json) &&
      file.mtime(json) >= file.mtime(qmd)) next
  message(basename(qmd))
  measure_deck(qmd)
}
