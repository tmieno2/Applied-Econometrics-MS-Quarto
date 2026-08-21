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
code using its actual rendered font and reserves the remaining width for output.
The output column may receive up to 70% of the available width. Its `Output`
banner and output body must fill the same grid track and therefore have exactly
the same width.

**The code column never changes width after a run.** The split is set once,
from the code, before anything executes. Running a cell may only keep the
layout or fall back to the vertical stack; it must never re-divide the two
columns, because a code block that shrinks the moment Run is pressed is
distracting and makes the code harder to follow while the output is read.

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


**A figure must never make a slide scroll.** `notebook.scss` caps every knitr figure and webR canvas,
at 380px tall (`object-fit: contain`, aspect ratio kept), which
is what a 700px slide has left after a title, a tab bar and a callout. Do not
work around it per slide with `fig-height` or `out-width`; if a capped figure
is too small to read, the slide has too much on it and should be split.

**WebR figures: R draws the canvas at 72 dpi whatever `dpi` says.** The webr
extension sizes the canvas at `fig-width * dpi` pixels but has no way to tell
R the resolution, so at `dpi: 216` (chosen to match the knitr figures' pixel
density) every point, mm and font size comes out one third of its intended
size. Each webR setup cell therefore defines `webr_scale <- 216 / 72` and
multiplies ggplot2's `.pt` and `.stroke` constants and the theme `base_size`
by it (and pins the theme `line`/`rect` widths back to `18 / 22`, since those are
in mm and would otherwise scale twice); any explicit `element_text(size = ...)` in a webR cell must be
multiplied by `webr_scale` too. `geom_*` and `annotate()` sizes need no
change, they go through `.pt`. Base graphics (`hist()`, `plot()`) are scaled
by the device `pointsize` instead, which our vendored
`_extensions/coatless/webr/qwebr-compute-engine.js` sets to `12 * dpi / 72`;
the same file sets the canvas background to transparent (upstream hard-codes
white). Re-apply both edits if the extension is ever updated. Changing `dpi`
means changing `webr_scale` in every deck.

**WebR errors always show.** The decks set `message: false, warning: false`
for webR cells, and upstream the extension puts errors on the same stderr
stream and drops them with the rest, so a line like `grt` printed nothing.
Our vendored `qwebr-compute-engine.js` keeps any stderr line starting with
`Error` regardless of those options. A student must never see a failing line
look as though it ran. Re-apply if the extension is updated.

**WebR `out-width` and `fig-width` move together.** The canvas is drawn at
`fig-width * 216` pixels and then displayed at `out-width` of the column, so
the on-screen type size is `base_size * webr_scale * (out_width * 1050px /
(fig_width * 216))`. The defaults (7in at 55%) give the same size as the knitr
figures. Change `out-width` on a cell and you must change `fig-width` in
proportion, `fig-width = 7 * out_width / 0.55` (70% -> 9, 80% -> 10.2), and
`fig-height` to keep the 7:4.5 aspect. Widening the display alone stretches
the same pixels and makes the type too large, as happened in deck 01-3.
