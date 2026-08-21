# ---------------------------------------------------------------------------
# The one ggplot theme for the lecture decks.
#
# A knitr deck picks it up in its setup chunk, after library(ggplot2):
#
#     source(here::here("lectures/_lecture-theme.R"))
#
# WebR cells cannot source this file — they run in the browser against a virtual
# filesystem that does not contain the repo — so those decks carry a copy of
# lecture_theme() in their `context: setup` cell. Run
#
#     Rscript lectures/check-lecture-theme.R
#
# to confirm the copies still match this file. Edit here first, then re-run the
# check; it prints the exact block to paste into any deck that has drifted.
#
# ── Sizing ─────────────────────────────────────────────────────────────────
#
# base_size means nothing on its own. What reaches the screen is
#
#     base_size * (out_width * 1050px / fig_width) / 72
#
# Deck body text is 19.2px (notebook.scss), so the default pairing — base_size
# 16 on the shared 10x6in canvas at out-width 75% (lectures/_metadata.yml) —
# puts axis titles at ~17.5px, just under the prose.
#
# Change fig-width for a figure and base_size has to move with it: a NARROWER
# canvas needs a SMALLER base_size, not the same one. This is not a matter of
# taste. ggplot gives the axis titles and the legend their space before the
# panel gets any, so type that is too large for the canvas crushes the panel and
# then clips — 30pt left on a 7in canvas is how "Annual Income" reached the
# published site as "Annual Incom".
#
# ── Backgrounds ────────────────────────────────────────────────────────────
#
# Transparent, so a figure sits on the slide's paper colour ($nb-paper in
# notebook.scss) instead of on a white card. The theme is only half of it: the
# graphics device paints its own background, cleared by
#
#     knitr: opts_chunk: dev.args: bg: transparent
#
# in lectures/_metadata.yml. Either half alone leaves the figure white.
# ---------------------------------------------------------------------------

lecture_theme <- function(base_size = 16) {
  ggplot2::theme_bw(base_size = base_size) +
    ggplot2::theme(
      axis.text = ggplot2::element_text(size = base_size * 0.9),
      axis.title = ggplot2::element_text(size = base_size),
      legend.text = ggplot2::element_text(size = base_size * 0.9),
      legend.title = ggplot2::element_text(size = base_size * 0.9),
      plot.background = ggplot2::element_rect(fill = "transparent", colour = NA),
      panel.background = ggplot2::element_rect(fill = "transparent", colour = NA),
      legend.background = ggplot2::element_rect(fill = "transparent", colour = NA),
      legend.key = ggplot2::element_rect(fill = "transparent", colour = NA),
      # theme_bw's grey92 grid was chosen against a white panel and all but
      # disappears on the warm paper once the panel stops being opaque.
      panel.grid = ggplot2::element_line(colour = "grey87")
    )
}

# The default, for figures on the shared canvas. A figure on its own canvas
# calls lecture_theme(<base>) instead — see the sizing note above.
theme_lecture <- lecture_theme()

# Sourcing this file also makes the theme the default for every plot in the
# deck, so a plot that names no theme is already on it and no deck has to
# repeat theme_set() in its setup chunk. A plot that names a theme explicitly
# still wins, which is what the ggplot chapter of Data Science with R relies on
# when it shows theme_economist(), theme_stata() and friends, and what a
# diagram drawn with theme_void() relies on.
ggplot2::theme_set(theme_lecture)
