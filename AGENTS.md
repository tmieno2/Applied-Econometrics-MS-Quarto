# Repository agent guidance

> **Read `CLAUDE.md` first.** It carries the rules that matter most here:
> never commit student data, all dates come from `course-dates.json`, and the
> named jobs (`sort assignments`, `build the assignments`) must be run through
> their scripts rather than done by hand. This file covers the WebR
> lecture-slide layout and the shared figure theme.

## WebR code/output layout in lecture slides

Lecture decks use an adaptive side-by-side layout for suitable WebR cells. The
shared implementation lives in:

- `lectures/webr-layout.html` — measures code and output and selects the layout.
- `lectures/notebook.scss` — defines the side-by-side grid and visual styling.

Every lecture deck containing a `{webr-r}` block must include
`../webr-layout.html` under RevealJS `include-in-header`. If the deck also uses
`transcript-support.html`, use a YAML list containing both files.

Do not assign a fixed 50/50 code/output split. The adaptive script measures the
code using its actual rendered font, reserves the remaining width for output,
and remeasures console output after execution. The output column may receive up
to 70% of the available width. Its `Output` banner and output body must fill the
same grid track and therefore have exactly the same width.

Keep the original vertical WebR stack when a cell is unsuitable for a compact
side-by-side presentation. The current automatic eligibility limits are:

- exclude setup and empty cells;
- exclude code with more than 12 substantive lines;
- exclude code whose longest source line exceeds 88 characters;
- after execution, revert to vertical if code and output cannot fit together;
- revert if console output still overflows horizontally, exceeds 16 lines, or
  is too tall for a readable right-hand panel;
- plots may remain side by side because their canvas scales to its grid track.

For a deliberately chosen cell, `::: {.side-out}` remains the manual opt-in.
Use `::: {.side-out .tight}` only for genuinely short code. Do not wrap long
plots, model summaries, or wide tables merely to force side-by-side display.

When changing these rules, test representative scalar, data-frame, regression,
and plot outputs in a browser—not only the static Quarto render. Preserve these
invariants:

1. code width determines the split;
2. output gets the unused space;
3. the output banner and body have identical widths;
4. poorly formatted output falls back to the original vertical stack;
5. all affected lecture decks render without fenced-div or JavaScript errors.

## Figures in lecture decks

One theme, one canvas, for every deck:

- `lectures/_lecture-theme.R` defines `lecture_theme(base_size = 16)` and
  `theme_lecture`. A knitr deck sources it in its setup chunk, after
  `library(ggplot2)`.
- `lectures/_metadata.yml` sets the shared canvas — 10x6in at `out-width: 75%`
  — and clears the device background with `dev.args: bg: transparent`.

Two things here are easy to get wrong, and both have shipped to the site before.

**base_size is meaningless without fig-width.** What reaches the screen is
`base_size * (out_width * 1050px / fig_width) / 72`, read against 19.2px body
text. ggplot gives the axis titles and the legend their space before the panel
gets any, so type too large for its canvas crushes the panel and then clips:
30pt on a 7in canvas is how `Annual Income` was published as `Annual Incom`.
Override `fig-width` for a figure and you must pass a matching `base_size` to
`lecture_theme()`. Annotation `size =` values are in mm and have to move with
it — they do not scale themselves.

**Transparency needs both halves.** The theme sets `plot.background`,
`panel.background`, `legend.background` and `legend.key` to transparent; the
device background is cleared in `_metadata.yml`. Either alone leaves the figure
on a white card. A complete theme applied afterwards (`theme_dag()`,
`theme_pubr()`) paints its own background back over the transparency.

WebR cells cannot source the shared file — they run in the browser against a
virtual filesystem that does not hold the repo — so each WebR deck carries a
copy of `lecture_theme()` in its `context: setup` cell, used at
`lecture_theme(18)` for the smaller WebR canvas. After editing the shared file,
run:

```sh
Rscript lectures/check-lecture-theme.R
```

It fails if any copy has drifted, and prints the block to paste. A drifted copy
is silent otherwise: the deck still renders, the static site still looks right,
and only the interactive figures a student runs come out wrong.

Verify figures by looking at the rendered PNGs under
`docs/lectures/*/*_files/figure-revealjs/`, not by reading the source. Every bug
this section warns about was invisible in the qmd.

