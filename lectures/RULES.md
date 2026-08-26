# Lecture styling rules, shared by every course

These rules govern the look of the lecture decks in every course under
`Teaching/`. They are written once, here. `AE-MS/CLAUDE.md` and
`Data-Science-with-R-Quarto/CLAUDE.md` keep only what is specific to their own
course and point at this file for the rest.

## 0. How to change any of this

**If you are reading this inside a course repository**, at
`lectures/RULES.md`: this copy is generated, and so are the styling files it
describes. They are maintained together in a separate `Teaching` repository
that holds several courses, and copied into each one. A fork of a single course
has no upstream to sync with, so edit the files here directly and ignore the
sync commands below.

Every file in `_lecture-shared/` is the only copy that is edited. The copies
inside a course are generated:

```sh
./sync-lecture-shared.sh            # copy _lecture-shared/ into every course
./sync-lecture-shared.sh --check    # report drift, change nothing, exit 1 if any
```

Editing `AE-MS/lectures/notebook.scss` directly is wasted work; the next sync
overwrites it. Edit `_lecture-shared/notebook.scss` and sync.

| File | What it does |
|---|---|
| `CELL-OPTIONS.html` | **The manual for writing cells.** Every `#|` option, what it controls, and which one to reach for. Open it in a browser — one self-contained file, so a double-click works. This file, `RULES.md`, is the reasoning behind the defaults; that one is how to use them |
| `custom.scss` | Headings, tabs, callouts, code colours, the automatic two-column layout for WebR plot cells |
| `notebook.scss` | The notebook look, code and output sizes and widths, the side-by-side grid, the figure height cap |
| `webr-layout.html` | Measures each WebR cell and decides whether it goes side by side |
| `measure-webr-output.R` | Runs every WebR cell in R at render time and records how wide and how tall its output prints |
| `katex-amd-fix.html` | Makes KaTeX work on a deck that also loads WebR |
| `transcript-support.html` | The collapsible Transcript panels |
| `_metadata.yml` | The shared figure canvas for every deck in `lectures/` |
| `_lecture-theme.R` | `lecture_theme()`, the one ggplot theme, and the default it sets |
| `check-lecture-theme.R` | Fails if a WebR copy of the theme has drifted |
| `webr-setup.R` | The block to paste into a WebR `context: setup` cell |
| `webr-setup-ggplot-chapter.R` | The variant for a chapter that teaches ggplot's own appearance |
| `qwebr-compute-engine.js` | The patched WebR extension file, see section 7 |
| `qwebr-monaco-editor-element.js` | The patched editor setup: a two-character line-number column instead of Monaco's five, a 12px gap to the code, and the guard that stops a hidden cell being given a height |

## 1. Deck header

Every lecture deck uses this shape. Only the footer is course-specific.

````yaml
format:
  revealjs:
    html-math-method:
      method: katex
      url: "https://cdn.jsdelivr.net/npm/katex@0.18.4/dist/"
    include-in-header:
      - ../transcript-support.html
      - ../webr-layout.html
      - ../katex-amd-fix.html
    theme: [default, ../custom.scss, ../notebook.scss]
    fontsize: 1.2em
    callout-icon: false
    scrollable: true
    fig-dpi: 400
webr:
  packages: ['dplyr', 'ggplot2']
  cell-options:
    editor-font-scale: 0.7
    dpi: 216
    fig-width: 10
    fig-height: 6
    out-width: 100%
execute:
  echo: true
filters:
  - webr
````

The last two includes and the whole `webr:` block belong only to decks that
contain a `{webr-r}` cell. A deck that gains its first WebR cell gains both
includes in the same edit: `webr-layout.html` because nothing adapts without
it, and `katex-amd-fix.html` because of section 6.

A deck that runs R chunks sources the shared theme in its setup chunk:

```r
source(here::here("lectures/_lecture-theme.R"))
```

**Only a deck that already has an `{r}` chunk.** A deck with none uses Quarto's
markdown engine, and adding a chunk switches it to knitr, which reads the
document by a different path. On that path a `%` inside an ordinary fenced
block reaches a Lua replacement string and the read fails with

```
readqmd.lua:111: invalid use of '%' in replacement string
```

which is what happened to `06-1-code_project_RStudio.qmd`, whose RStudio
snippet slide prints `%>%`. Such a deck draws no knitr figures, so it has
nothing to theme and needs nothing added. A WebR deck gets the pasted setup
block of section 4 instead, not this line.

Watch the render's own exit code, and read it directly. `quarto render
> log 2>&1; echo $?` inside a wrapper that appends another command reports the
wrapper's status, and a render that stopped at file 36 of 51 then looks like a
success.

## 2. Code blocks have one fixed width and one fixed size

A code block's width is a property of the slide, not of its content or its
state. It must not change because a cell was run, because output arrived,
because the cell went side by side, or because the code in it is short. Every
code block on a slide is the same width as every other one, `$nb-code-w`,
currently 100%, which is the width of the prose above it. It was 90% until
2026-08-22: inside a Quarto column the reductions compound, and a cell in a 55%
column held 49% of the slide with a tenth of the slide left blank beside it. The
token lives in `notebook.scss`, paired with the literal in `custom.scss` that
sizes `.qwebr-interactive-area`; the two must move together.

Going side by side changes how a cell is **divided**, never how wide it is.
Two violations have been fixed and must not come back: `notebook.scss` once
gave `.side-out .qwebr-interactive-area` `width: 100%`, so a cell grew wider
the moment it was promoted, and `webr-layout.html` once re-split the tracks
when output arrived, so the editor jumped on the student's first Run.

Size is one number too. `$nb-code-size` is 0.84rem, applied to knitr code
blocks, WebR editors, and both kinds of output. It is paired with
`editor-font-scale: 0.7` in the deck header, because 0.7 of the deck's 19.2px
body text is exactly 13.44px. Change one and change the other, or a WebR cell
and a knitr block on the same slide stop matching.

**The line-number margin has three parts, and each lives in a different file.**
Left to right: an 8px left border on `.qwebr-editor` painted in the gutter
colour (`notebook.scss`), the digits
themselves, sized by Monaco from the code font and asked for with
`lineNumbersMinChars: 1`, and a 9px gap before the code
(`lineDecorationsWidth`, both in the vendored
`qwebr-monaco-editor-element.js`). Monaco's defaults gave a ~75px band that read
as part of the code; this is ~25px on a ten-line cell. The band is on the
container on purpose: Monaco's number column is right-aligned, so width added
there appears between the number and the code, never before it. It must stay a
BORDER and never become padding. Monaco lays itself out from the container's
`clientWidth`, which counts padding but not borders, so as padding it gave the
editor 7px more room than it had and the code ground painted 7px past its own
box, past the "Run Code" bar and past the output beneath it. Measured on
2026-08-22: 3 of 78 editors in one deck, all of them cells revealed by opening a
tab, which is the path that lays out from `clientWidth` rather than from the
resize observer's content box. It was invisible while blocks stopped at 90% of
the slide and had a margin to bleed into. The margin is
also painted a shade deeper than the code with a hairline against it, and its
figures are grey rather than syntax blue, so a lone "1" on an empty cell reads
as furniture. `EDITOR_CHROME` in `webr-layout.html` (45) must follow this
geometry: it is the margin plus the vertical scrollbar, and the code column is
sized with it.

**The right edge has to be empty, for the same reason.** A code block and the
"Run Code" bar above it are one object and must end at the same x. They are the
same grid column, so the boxes always do; what breaks the look is anything
painted inside the editor near that edge. Monaco reserves ~14px there for the
overview ruler and draws a hairline down its left side, and since nothing in
these decks marks that ruler, the band is empty and its hairline reads as the
end of the code block, about 14px short of the bar. `overviewRulerLanes: 0` and
`overviewRulerBorder: false` in `qwebr-monaco-editor-element.js` remove both.

## 3. WebR code and output, side by side

`webr-layout.html` measures each cell and decides. The rules it implements:

- **The code column is set once and never moves**, and neither does the layout.
  Both are decided from the measured width of the code while the page loads, and
  running a cell changes neither. This is the rule the others serve: a slide must
  not reshape itself under a reader, least of all at the moment they click Run
  and look at the result.
- **The output decides too, and it is measured at render time.**
  `measure-webr-output.R` runs every `{webr-r}` cell in R before the site is
  built and writes, beside each deck, how many characters wide and how many
  lines tall that cell prints. `webr-layout.html` loads that file at load, so
  the output takes part in a decision made before anyone has clicked anything.
  The comfort test it feeds is the old one, unchanged: the output must fit in
  the width the code did not take (each with slack), and the code block must be
  at least 40 percent of the cell's stacked height, or the cell stays vertical.
  A cell that prints nothing keeps the full width, since there is no right-hand
  content to show.
- **A cell that draws a figure is always stacked.** A plot has no natural width,
  so it can never fail the fit test; it simply shrinks into whatever strip the
  code left over, and a histogram beside five lines of code was published a
  couple of hundred pixels wide. Stacked, the figure gets the 55 percent of the
  slide it is drawn for, and the height cap still keeps the cell on one screen.
- **A cell with no measurement judges on its code alone.** That covers a cell
  added since the last measuring run, and one R could not evaluate here. It is a
  fallback, not the normal path: if a deck shows cells side by side that plainly
  should not be, re-run the measurement before touching the layout code.
- **The code asks for what it needs, the output takes the rest.** Code share is
  clamped to a maximum of 70 percent. The old 58 refused a side-by-side layout
  to a cell needing 66 percent even when its output was `[1] 20`.
- **The floor is a pixel count, and it belongs to the toolbar, not the code.**
  `MIN_CODE_PX`, currently 320. The extension's "Run Code" bar plus its reset
  and copy buttons need ~294 CSS px, and in a narrower column the label wraps
  onto two lines. A share-based floor cannot express this: 18 percent of a slide
  is 170px, which is what wrapped the toolbar on a `5 == 5` cell. To re-measure,
  clone `.qwebr-editor-toolbar` with `width: max-content` and divide its rect by
  the deck's reveal scale.
- **A side-by-side code block must never wrap a line.** Checked twice, predicted
  before the split and again by reading back how many lines Monaco actually drew.
  If the code will not fit the widest column allowed, the cell stays stacked.
  This is the ONLY route out of side by side, and it can only fire during load.
- Never split a cell that already sits inside a reveal `.columns` block. It
  already has half a slide.
- **The author overrides the arithmetic in both directions.** `::: {.side-out}`
  forces the split: it marks an authorial choice, stops measurement noise from
  tearing the wrapper down, and overrides the figure floor above. It still
  cannot make code fit that does not fit. `::: {.stacked}` forces the vertical
  stack, and is checked before anything is measured, so nothing can promote the
  cell afterwards. Both wrap the cell the same way:

  ````markdown
  ::: {.stacked}
  ```{webr-r}
  hist(x)
  ```
  :::
  ````
- **The author can set the split itself**, on the same wrapper, with the two
  variables both grids read:

  ````markdown
  ::: {.side-out style="--webr-code-track: 0.45fr; --webr-output-track: 0.55fr;"}
  ```{webr-r}
  hist(x)
  ```
  :::
  ````

  Written in the markup, they are read before the first measurement and every
  later write is skipped, so the columns are exactly what was asked for: no
  70 percent cap, no widening to stop a line wrapping, no figure floor, and no
  comfort test — that test sizes a code column from the font, and judging a
  hand-set split against a column the cell will never have is how a split that
  fits ends up stacked anyway. A cell that prints nothing still stacks. They
  work for a knitr cell in the same wrapper too. This is the escape hatch for a
  slide the arithmetic gets wrong; it is not the normal way to lay out a cell.
- **All three overrides have a cell-option form**, which is what a decision
  about a single WebR cell should use. A div around one cell is noise:

  | Cell option | Same as | Means |
  |---|---|---|
  | `#\| layout: stacked` | `::: {.stacked}` | keep the vertical stack |
  | `#\| layout: side` | `::: {.side-out}` | force the split |
  | `#\| code-track: 0.6` | `::: {.side-out style="--webr-code-track: 0.6fr; --webr-output-track: 0.4fr;"}` | force the split, code takes 0.6 of it |

  ````markdown
  ```{webr-r}
  #| code-track: 0.6
  hist(x)
  ```
  ````

  `code-track` is one number, the code's share; the output takes the rest, so it
  implies `layout: side`. Each option does exactly what its wrapper does, which
  differs between the two: `layout: side` is a request, and code that will not
  fit one line still stacks, while `code-track` fixes the split and is taken as
  given — code too long for the column the author chose wraps in it rather than
  sending the cell back to the stack. Keep the wrappers for a knitr cell, which has no `#|` options
  this script reads, and for a region of several cells at once.

  The options are read from the cell's `#|` block, which qwebr passes through
  untouched and `measure-webr-output.R` strips, so adding one does not change
  the key a cell is measured under.

  **`code-track` beats every automatic gate**, which is the point of typing a
  number: an override that quietly does nothing is worse than no override. It is
  read before any of them and stands aside from all four —

  - more than `MAX_CODE_LINES` lines, or a line over 88 characters;
  - a cell inside a reveal `.column`, which normally refuses to be halved again;
  - a cell measured as printing nothing and drawing nothing, and the
    `printsNothing()` guess that stands in when a cell has no measurement;
  - the width, height and plot-floor tests in `sideBySideFits()`.

  So a `code-track` cell whose output column stays empty still opens at the
  split that was asked for. `layout: side` gets none of this: it is a request,
  and a cell the script skips outright ignores it.

  **`layout: stacked` beats the stylesheet too.** It is read first of all, but
  reading it first was not enough on its own: `custom.scss` puts any cell that
  has drawn a figure side by side, keyed off
  `:has(.qwebr-output-graph-area canvas)`, and that rule knows nothing about
  what `webr-layout.html` decided. A stacked plot cell therefore obeyed the
  option right up until the plot appeared, then reflowed into two columns. Both
  stacked forms now stamp `data-webr-layout="stacked"` on the
  `.qwebr-interactive-area` itself — the element that selector matches — and
  the selector carries `:not([data-webr-layout="stacked"])` so it stands aside.
  Anything else that lays a cell out from CSS alone has to carry that
  `:not()` as well, or the option goes quiet again the moment a plot lands.

  **EVERY path that stacks a cell must stamp the area, not just the two
  explicit ones.** This was half-done until 2026-08-26 and it cost 82 of the 219
  measured plot cells across the two courses their output. `stack()` — the
  automatic refusal, which is what a plot cell gets whenever its longest line is
  52 characters or more — wrote the attribute only on the wrapper. custom.scss's
  `:not()` reads the area, so the rule fired anyway the moment the plot was
  drawn, and the cell flipped from `display: block` to `display: grid`. Measured
  on `L05_vector_raster_interaction.html`: the tracks resolved to `1021px 9px`
  and the figure landed in the 9px one at 0x0, off the right edge of the slide.
  From the room that looks exactly like a cell that ran and drew nothing, and
  `#| layout: stacked` "fixed" it only because that option went through
  `markStacked()`, which did stamp the area. `stack()` and the `.column` branch
  both route through `markStacked()` now, and the measured-as-silent branch sets
  both attributes inline (it must not strip an author's `.side-out` wrapper, so
  it cannot use `markStacked()`).

  **Walking away from a cell is a decision too, so it is stamped as well.** The
  gate that refuses an automatic split to code over `MAX_CODE_LINES` lines or
  wider than 88 characters used to just `return`, which left custom.scss's
  figure rule to lay the cell out on its own the moment a plot appeared — into
  two columns, which is the exact layout that gate exists to refuse, since code
  that wide wraps in half a slide. 36 cells across the two courses. It stamps
  the AREA now and nothing else: an author's `::: {.side-out}` wrapper is left
  in place (custom.scss already stands aside inside one, and notebook.scss lays
  that cell out from the class), `#| code-track:` skips the gate entirely as it
  always did, and `classes: qwebr-side-by-side` is exempt because it is the
  author asking for custom.scss's layout by name.

  **A `1fr` track will not shrink below its item's min-content width.** The
  other half of that bug, and the reason the figure track was 9px rather than
  half the slide: custom.scss asked for `grid-template-columns: 1fr 1fr`, and
  the item in the first track is Monaco, whose min-content is the full slide.
  Both tracks are `minmax(0, 1fr)` now and the editor carries `min-width: 0`,
  which is what `notebook.scss` had been doing all along for its own grid. Any
  new column that holds an editor or a `pre` needs both.

**Window width must never decide the layout.** reveal scales the whole 1050px
slide to fit the window, so a narrow window makes the slide smaller, not
narrower in its own coordinates. `notebook.scss` used to stack every cell under
`@media (max-width: 800px)`, which handed anyone with a half-screen window a
full-width editor and a stray "Output" chip floating beside it. It is `@media
print` now. And any rule that re-declares `grid-template-areas` for the cell
must keep naming `outbar`: that is the ::before "Output" banner, and a grid item
whose named area is missing is auto-placed into an invented column.

**Folding the output away.** Every interactive cell gets a "hide output" button
that hides its own output, because long output pushes everything below it down
the slide. It is a Font Awesome eye — `fa-solid fa-eye-slash`, flipping to
`fa-eye` — icon-only, like the reset and copy buttons beside it. Font Awesome
needs no loading of its own: those two are already `fa-solid fa-arrows-rotate`
and `fa-regular fa-copy`. The icon names the ACTION, not the current state, so a
folded cell shows a plain eye meaning "click to show". An icon carries no
accessible name, so `title` and `aria-label` carry the words the button does not
print — both, since the title is the hover tooltip and the aria-label is what a
screen reader announces. The button wears the extension's own
`.qwebr-button` class, so its size, radius, background and hover highlight all
come from `qwebr-styling.css` and it cannot drift from the reset and copy
buttons beside it. `webr-layout.html` creates it in the editor toolbar's right-hand
button group and `layOut()` then moves it into the `outbar` grid area on a cell
that goes side by side, so it sits at the right end of the Output banner — the
two places a cell already has a header strip, and therefore the two places a
control can go without costing a row of height. In the banner it shares one grid
area with the ::before that paints the bar; two grid items in one area overlap by
design there, the pseudo-element painting the label and the button painting over
the empty right end.

Clicking it only sets `data-webr-output-hidden="true"` on the
`.qwebr-interactive-area`; `notebook.scss` does the hiding with `display: none`
on `.qwebr-output-code-area` and `.qwebr-output-graph-area`. The banner stays, so
a folded cell still says "Output" and still carries the control that brings it
back. Measured in Chrome on `01-Introduction.html`: a stacked cell with ten lines
of output goes from 331px to 119px. A side-by-side cell usually saves nothing —
its height is set by whichever column is taller, and that is normally the code —
so this is mostly a stacked-cell feature that the banner happens to be the right
home for.

The keydown listener on the button is not optional: reveal reads keys off the
document and stands aside only for inputs and contenteditable, not for a
`<button>`, so without it Space on a focused toggle would both press the button
and advance the slide.

Two measurement traps, both of which have cost time:

1. **Never trust a predicted width, read back what Monaco rendered.** A column
   the arithmetic says fits can still wrap, and a wrapped line measures
   narrower still, so nothing downstream can recover. Always measure the source
   text, never the rendered `.view-line` elements.
2. **Do not measure output with `pre.scrollWidth`.** That `pre` is `width:
   100%`, so its scrollWidth reports the track it sits in, not the text inside
   it. Reading it back is a feedback loop that starves the code column.

**Re-run the measurement whenever a WebR cell's code changes**, from the
`Teaching/` folder, before rendering:

```sh
Rscript _lecture-shared/measure-webr-output.R Data-Science-with-R-Quarto
Rscript _lecture-shared/measure-webr-output.R AE-MS
```

It writes `<deck>.webr-output.js` next to each deck, keyed by the cell's own
source text, so an edited cell simply stops matching and falls back rather than
being laid out on stale numbers. Each course's `_quarto.yml` lists those files
under `project: resources:`; without that entry Quarto does not copy them into
the site and every cell silently falls back to the code-only rule. The script
needs the deck's packages installed locally, and it reads the deck's own
`webr: packages:` list to attach them, because most decks have no
`context: setup` cell. Coverage as of the last run: 673 of 779 cells in Data
Science, 175 of 201 in AE-MS.

**A probe served under a different filename will lie to you.** The script derives
the measurement URL from `location.pathname`, so a copy of a deck saved as
`_probe.html` loads `_probe.webr-output.js`, gets a 404, and every cell falls back
to the code-only rule. Test on the real filename, or you will "prove" a bug that
is not there — this cost half an hour.

**The measurements are a `window.webrOutputSizes = {...}` assignment loaded with
a `<script src>`, not a `.json` loaded with `fetch`.** A fetch of a sibling file
is blocked on a `file://` page, which is how a deck is opened while it is being
written. Every cell then looked unmeasured, took the "judge on the code alone"
branch, and went side by side — so the local preview disagreed with the
published site about every layout on the deck, and the disagreement looked like
a layout bug. A script tag is exempt and loads under both. Verified with
headless Chrome (`--headless=new --dump-dom`, then grep `data-webr-layout`): the
same deck and cell that read `side` under `file://` with the old fetch reads
`stacked` under both `file://` and `http://` now.

**R prints at the width of the box, not at 80.** R wraps everything it prints at
`getOption("width")`, and webR leaves that at R's default of 80 whatever it is
printing into. A full-width cell fits about 124 characters at the deck's code
size, so a printed data frame stopped a third short of the right edge and R
moved the columns that did not fit into a second block underneath — which is
how a six-column `st_join` result was published as five columns and then a lone
`geometry`. `qwebr-compute-engine.js` now measures the cell's own output box
(`qwebrOutputWidthChars()`) and prepends `options(width = N)` to the code it
runs, so each cell prints at the width it has. Measured in Chrome on
`L04_2_vector_spatial_join.html`: the box is 1198.7px, identical to the editor
above it, and 80 characters of the output font occupy 759.9px of it — 63%.

Two things make this safe to take at run time rather than at load. The layout is
decided while the page loads and never revisited, so the box measured when the
student clicks Run is the box the output lands in. And the measurement is in CSS
pixels throughout — `clientWidth` and `measureText`, never
`getBoundingClientRect()`, which reports the scaled number because reveal
transforms the whole slide and would give a width out by the scale factor.

80 is a floor, not just a default: the measured width is only ever used when it
is wider than R's own. A cell in a half-width `.column` measures about 60, and
wrapping it there would trade a scrolled tail for a block two-thirds taller,
which is the wrong trade on a slide. Measured on `L04_2_vector_spatial_join`:
124 characters for a full-width stacked cell, 85 for the output column of a
side-by-side one, 80 for everything narrower.

`measure-webr-output.R` still measures at 80 and the split is still chosen from
those numbers; see the comment there for why the mismatch is the harmless
direction.

When changing any of this, test scalar, data-frame, regression and plot outputs
in a real browser. The layout is chosen by JavaScript after a cell runs, so a
clean `quarto render` proves nothing. Serve over HTTP, because `file://` shows
a blank deck, and WebR needs minutes to become interactive on first load.

Invariants to preserve: code width determines the split; output gets the unused
space; the Output banner and the output body have identical widths; badly
shaped output falls back to the vertical stack; every deck still renders
without fenced-div or JavaScript errors.

## 4. Figures

One canvas and one theme for every deck.

- `_metadata.yml` sets the shared canvas: 10 by 6 inches shown at 75% width,
  216 dpi, on a transparent device.
- `_lecture-theme.R` defines `lecture_theme(base_size = 16)` and makes it the
  default for every plot that does not name a theme.
- `notebook.scss` caps every figure at 420px tall (540px on a `{.figure-slide}`).

**base_size means nothing without fig-width.** What reaches the screen is

```
base_size * (out_width * 1050px / fig_width) / 72
```

read against 19.2px body text. ggplot gives the axis titles and the legend
their space before the panel gets any, so type too large for its canvas crushes
the panel and then clips: 30pt on a 7 inch canvas is how `Annual Income` was
published as `Annual Incom`. Override `fig-width` for a figure and you must
pass a matching `base_size` to `lecture_theme()`. Annotation `size =` values
are in millimetres and have to move with it, they do not scale themselves.

**Transparency needs both halves.** The theme sets `plot.background`,
`panel.background`, `legend.background` and `legend.key` to transparent, and
`_metadata.yml` clears the device background. Either alone leaves the figure on
a white card. A complete theme applied afterwards, such as `theme_dag()` or
`theme_pubr()`, paints its own background back over the transparency.

**A figure must never make a slide scroll.** The reveal slide is 700px; a
title, a tab bar and a callout leave roughly 420px, which is the cap. It was
380 until 2026-08-21, raised because figures on ordinary slides — a heading, two
lines of text, a plot — were being scaled down for room that was not needed. Do not
work around it per slide with `fig-height` or `out-width`. If a capped figure
is too small to read, the slide has too much on it and should be split.

**Overriding the cap on one cell.** When splitting the slide is not the answer,
`#| fig-max-height: 600` raises the cap for that cell alone, and
`#| fig-max-height: none` removes it. The cap is written as the custom property
`--webr-fig-max-height`, defaulting to 420px; `webr-layout.html` reads the
option and sets the property on that cell's `.qwebr-interactive-area`, so cell
beats slide beats default and nothing else on the deck moves. Use it when the
cap is measuring the wrong thing rather than to buy back room a slide does not
have — the reason it exists is still that a figure must not make a slide
scroll, and nothing checks that for you once you have overridden it.

**A portrait figure is the case the cap gets wrong.** The cap limits height,
and `out-width` limits width, so a landscape figure is sized by one and a
portrait one by the other. Worse, `coord_sf()` fixes the panel's aspect ratio,
so a portrait map inside a landscape canvas is centred with blank canvas either
side of it — the figure is being drawn small inside an image that is mostly
empty, which no cap or width setting can recover. Match the canvas to the
figure with `#| fig-width` and `#| fig-height` on the cell first; reach for
`fig-max-height` only after the canvas is the right shape.

**Why WebR figures ask for 100% of their track.** The cap is what actually
sizes them, so there is nothing for a percentage to add. At `out-width: 100%`
the figure asks for the whole track and the cap hands back the largest that
fits: on a full slide the 10 by 6 canvas lands at 700 by 420, and inside a
half-width column, where 420px is never reached, it fills the column. The 55%
this used to carry was a guess at the cap's own answer; on a full slide it was
close, and in a column it was roughly half what there was room for.

**A slide that carries nothing but a figure** has about 540px of room instead
of 380px, because there is no tab bar and the title is one line. Put
`{.figure-slide}` on the slide heading and widen the canvas in the same edit:

```markdown
## Distribution of yield {.figure-slide}
```

knitr: `fig-width: 12`, `fig-height: 7.2`, `out-width: 95%`. WebR needs no
change: it already asks for 100%, and the taller cap on such a slide is what
gives it the extra room. The knitr numbers keep the ratio of display width to
canvas width that the defaults have, which is what holds the type size steady. Changing the display width alone stretches the same pixels
and makes the type too large.

**WebR figures need the scale block.** WebR cannot source `_lecture-theme.R`,
because it runs in the browser against a virtual filesystem that does not hold
the repo, and R draws its canvas at 72 dpi whatever `dpi` says. So every WebR
deck that draws a figure pastes `webr-setup.R` into its `context: setup` cell.
It carries a copy of the theme and multiplies ggplot2's `.pt` and `.stroke` and
the theme's `base_size` by `216 / 72`, pinning the line and rectangle widths
back, since those are in millimetres and would otherwise scale twice. Any
explicit `element_text(size = ...)` in a WebR cell must be multiplied by
`webr_scale` too. `geom_*` and `annotate()` sizes need no change, they go
through `.pt`. Base graphics such as `hist()` and `plot()` are scaled by the
device `pointsize` instead, which the patched extension sets, see section 7.

After editing `_lecture-theme.R`, run the checker in each course:

```sh
Rscript lectures/check-lecture-theme.R
```

A drifted copy is silent otherwise. The deck still renders, the static site
still looks right, and only the interactive figures a student runs come out
wrong.

**A chapter that teaches ggplot's own appearance is the one exception.**
Chapter 4 of Data Science with R shows what a student's own code produces, so
its WebR cells use `webr-setup-ggplot-chapter.R` instead: ggplot's default
theme, with only the size corrected for the 216 dpi canvas. Everywhere else, a
plot that wants a different look names its theme explicitly and wins anyway.

**Verify figures by looking at the rendered PNGs** under
`docs/lectures/*/*_files/figure-revealjs/`, not by reading the source. Every
bug this section warns about was invisible in the qmd.

## 5. Slide space

The reveal logical slide is 700px tall and several slides already sit near or
over it. Anything added to normal flow costs that space on every slide, whether
it is used or not. Measure before adding furniture.

Raw HTML above the first `##` becomes its own untitled slide. A `<style>`
block, a `<script>`, or even a long HTML comment between the YAML header and
the first heading is emitted as slide content. Put deck-level CSS and JS in a
file referenced by `include-in-header:`. The same applies to a WebR
`context: setup` cell, whose loading widget becomes an untitled slide: keep it
below the first heading. A knitr chunk with `include: false` is safe anywhere.

## 6. Math

KaTeX, pinned to 0.18.4, in `_quarto.yml` and in every deck. Two failures cost
real time and neither produced a render error:

1. **The pinned url must end with a trailing slash.** Quarto concatenates the
   filename onto it verbatim, so `.../dist` emits `.../distkatex.min.js`, which
   404s, `window.katex` is never defined, and every equation silently stays
   unrendered.
2. **The WebR extension's Monaco loader breaks KaTeX's normal build.** Monaco
   defines an AMD loader, and KaTeX's wrapper tests for AMD before the browser
   global, so on a WebR deck KaTeX registers as an anonymous module and never
   sets `window.katex`. `katex-amd-fix.html` imports the ESM build instead and
   publishes the global before `DOMContentLoaded`. Every deck that includes
   `webr-layout.html` must also include it.

Do not use an unpinned CDN version. `katex@latest` works until the day the
CDN's newest build changes the wrapper, and the failure is silent.

**`\mbox` is not KaTeX; use `\text`.** With `throwOnError: false` an undefined
command is not an error, it is printed literally in red with the spaces
collapsed, so `\mbox{corn yield}` renders as `\mboxcornyield`.

To verify a math change, count rendered `class="math"` spans in `docs/`, then
check in a browser that the number of `.katex` nodes equals it, that
`.katex-error` is zero, and that no `.katex-html` contains a literal backslash
command. A correctly rendered formula never contains a backslash.

## 7. The WebR extension is vendored and patched

`_extensions/coatless/webr/qwebr-compute-engine.js` carries four edits that
must be re-applied if the extension is ever updated:

1. the canvas background is transparent, not white, so a figure sits on the
   slide's paper colour;
2. `pointsize` is `12 * dpi / 72`, which is what scales base graphics text on
   the 216 dpi canvas;
3. any stderr line starting with `Error` is kept even though the decks set
   `message: false, warning: false`. Upstream drops errors with the rest, so a
   failing line printed nothing and looked to a student as though it had run.
4. output from a cell marked `#| output: asis` is marked `qwebr-output-asis` on
   its output box, and any `<script>` it contains is re-created so that it runs.

The fourth one is what makes an HTML table usable in a WebR cell. Upstream
already stops escaping the output when a cell says `output: asis`, so the HTML
reaches the page, but two things then went wrong with it:

- **The table arrived empty.** `tinytable`, which is what `modelsummary()`
  returns by default, writes its values into the cells from a `<script>` that
  ships with the table. The output is inserted with `innerHTML`, and that never
  runs a script. Re-creating each script node runs it. It has to happen after
  the output is in the document, because a script node in a detached element
  still does nothing.
- **The table was pushed to the bottom of a tall empty box.** The output box is
  a `pre`, so every newline in the HTML source was rendered as blank space.
  `notebook.scss` gives `pre.qwebr-output-asis` `white-space: normal`, reveal's
  body font instead of the code font, and a content-sized rather than
  full-width table.

Three things to know before using it on a deck.

- `output: asis` stops the escaping for everything the cell prints, not just the
  table, so put it only on cells whose whole job is a table.
- `modelsummary` must be told to produce HTML: `output = "html"` is the one to
  teach, since that is its own default table engine and needs no other package.
  `output = "gt"` and `output = "kableExtra"` work too, and kableExtra also
  wants `escape = FALSE`, because the model column names are padded with
  `&nbsp;` and kableExtra escapes the ampersand into visible text.
- `options(tinytable_print_output = "html")` looks like a way to skip that
  argument, but it makes printing return a whole standalone HTML document
  rather than a fragment. Pass `output = "html"` per call instead.

`_extensions/coatless/webr/qwebr-monaco-editor-element.js` carries two more,
each marked `PATCHED` at the line it changes:

1. `lineNumbersMinChars: 1` instead of Monaco's 5, and `lineDecorationsWidth: 9`
   instead of 10, which together replace a ~75px empty band with a margin the
   width of the digits (see section 2);
2. `updateHeight()` returns early when the cell's box is 0 wide.

The second one is worth stating in full, because the symptom does not look like
a height bug. `updateHeight()` is the only thing that gives a cell's container a
height: it asks Monaco how tall the content is and writes that as a pixel value.
It runs once as soon as the editor is built, which for most cells is while they
are still inside a `display: none` subtree, a slide nobody has reached or a tab
nobody has opened. There Monaco measures 5x5, and since word wrap is on for
every cell (`webr.lua`'s own default), one character is one row. A one-line cell
was being given a 754px height, and cells on the exercise pages up to 3002px.
What you see is a tall empty box with a faint mark in its top-left corner, which
is the whole 5x5 editor painting the line number and one character.

It corrected itself: opening the slide or the tab gives the box a width,
Monaco's `automaticLayout` re-wraps, and `updateHeight()` runs again with a real
measurement, all inside 50ms. So this was only ever visible as a flicker, or on
a deck whose main thread was busy loading WebR packages. The guard removes the
wrong state instead of shortening it: a hidden cell is now given no height at
all, and the first height it ever receives is the correct one.

The guard depends on Monaco firing `onDidContentSizeChange` when the width
arrives. It always does, because the wrapped and unwrapped heights differ, and
that holds even for an empty cell: measured 32 while hidden and 20 when shown,
since the horizontal scrollbar stops being reserved.

## 8. Transcripts

Collapsible panels holding what the lecturer says, hidden behind a pill in the
slide corner. The audience is students reviewing after class. These are not
presenter notes; reveal's own `.notes` blocks are the presenter-only mechanism.

```markdown
<details class="transcript">
<summary>Transcript</summary>

...

</details>
```

The label is "Transcript" in every course. On a tab whose figure fills the
slide there is no free rectangle to overlay, so add `inline` and the panel
joins the flow when opened, pushing the figure down instead of covering it:
`<details class="transcript inline">`. Use it only where it is needed, and
measure rather than guess: an open panel must not overlap a
`.cell-output-display`. The collapsed pill costs 0px in both variants, which is
the property the whole design exists to preserve.

Do not restyle the panel from `notebook.scss`. Its CSS is inline inside
`transcript-support.html`, which Quarto injects after the theme stylesheet, so
at equal specificity the inline block wins and rules written in the theme lose.
