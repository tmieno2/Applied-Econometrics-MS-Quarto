# Repository agent guidance

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
