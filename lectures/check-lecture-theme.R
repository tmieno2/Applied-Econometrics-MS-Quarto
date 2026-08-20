#!/usr/bin/env Rscript
# ---------------------------------------------------------------------------
# Does every WebR copy of lecture_theme() still match lectures/_lecture-theme.R?
#
#     Rscript lectures/check-lecture-theme.R
#
# WebR cells run in the browser against a virtual filesystem that does not hold
# this repo, so they cannot source the shared theme and must carry a copy of it.
# A copy is the one thing here that can rot silently: the deck keeps rendering,
# the static site keeps looking right, and only the interactive figures a
# student sees drift away from the rest of the course. Hence this check.
#
# Exits non-zero and prints the block to paste if any copy has drifted.
# ---------------------------------------------------------------------------

lectures_dir <- dirname(normalizePath(sub(
  "^--file=", "",
  grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)[1]
)))

extract_block <- function(text) {
  # lecture_theme <- function(...) { ... } up to the closing brace in column 1
  start <- grep("^lecture_theme <- function", text)
  if (length(start) == 0) return(NULL)
  ends <- grep("^\\}", text)
  ends <- ends[ends > start[1]]
  if (length(ends) == 0) return(NULL)
  text[start[1]:ends[1]]
}

canonical_path <- file.path(lectures_dir, "_lecture-theme.R")
canonical <- extract_block(readLines(canonical_path, warn = FALSE))
if (is.null(canonical)) {
  stop("no lecture_theme() definition found in ", canonical_path)
}

decks <- list.files(lectures_dir, pattern = "\\.qmd$", recursive = TRUE, full.names = TRUE)
drifted <- character(0)
checked <- 0L

for (deck in decks) {
  lines <- readLines(deck, warn = FALSE)
  if (!any(grepl("^lecture_theme <- function", lines))) next
  copy <- extract_block(lines)
  checked <- checked + 1L
  if (!identical(copy, canonical)) {
    drifted <- c(drifted, deck)
  }
}

rel <- function(p) sub(paste0("^", dirname(lectures_dir), "/"), "", p)

if (length(drifted) > 0) {
  message("lecture_theme() has drifted from ", rel(canonical_path), " in:")
  for (d in drifted) message("  - ", rel(d))
  message("\nReplace the block in each with:\n")
  message(paste(canonical, collapse = "\n"))
  quit(status = 1)
}

message(sprintf(
  "lecture_theme(): %d WebR copies match %s.", checked, rel(canonical_path)
))
