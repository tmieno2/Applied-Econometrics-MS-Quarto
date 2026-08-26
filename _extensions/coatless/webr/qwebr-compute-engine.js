// Function to verify a given JavaScript Object is empty
globalThis.qwebrIsObjectEmpty = function (arr) {
    return Object.keys(arr).length === 0;
}

// Global version of the Escape HTML function that converts HTML 
// characters to their HTML entities.
globalThis.qwebrEscapeHTMLCharacters = function(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

// Passthrough results
globalThis.qwebrIdentity = function(x) {
    return x;
};

// Append a comment
globalThis.qwebrPrefixComment = function(x, comment) {
    return `${comment}${x}`;
};

// Function to store the code in the history
globalThis.qwebrLogCodeToHistory = function(codeToRun, options) {
    qwebrRCommandHistory.push(
        `# Ran code in ${options.label} at ${new Date().toLocaleString()} ----\n${codeToRun}`
    );
}

// Function to attach a download button onto the canvas
// allowing the user to download the image.
function qwebrImageCanvasDownloadButton(canvas, canvasContainer) {

    // Create the download button
    const downloadButton = document.createElement('button');
    downloadButton.className = 'qwebr-canvas-image-download-btn';
    downloadButton.textContent = 'Download Image';
    canvasContainer.appendChild(downloadButton);

    // Trigger a download of the image when the button is clicked
    downloadButton.addEventListener('click', function() {
        const image = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = image;
        link.download = 'qwebr-canvas-image.png';
        link.click();
    });
  }
  

// Function to parse the pager results
globalThis.qwebrParseTypePager = async function (msg) { 

    // Split out the event data
    const { path, title, deleteFile } = msg.data; 

    // Process the pager data by reading the information from disk
    const paged_data = await mainWebR.FS.readFile(path).then((data) => {
        // Obtain the file content
        let content = new TextDecoder().decode(data);

        // Remove excessive backspace characters until none remain
        while(content.match(/.[\b]/)){
        content = content.replace(/.[\b]/g, '');
        }

        // Returned cleaned data
        return content;
    });

    // Unlink file if needed
    if (deleteFile) { 
        await mainWebR.FS.unlink(path); 
    } 

    // Return extracted data with spaces
    return paged_data;
} 

// Function to run the code using webR and parse the output
// How many characters of printed output fit across this cell's output box.
//
// Everything here is in CSS pixels, never getBoundingClientRect(): reveal
// scales the whole slide with a transform, so a rect is the scaled number
// while getComputedStyle and canvas.measureText are unscaled, and mixing the
// two gives a width out by the scale factor.
//
// The 80-character sample rather than one character because measureText
// rounds, and one rounded character multiplied by 124 is a visible error.
globalThis.qwebrOutputWidthChars = function (outputDiv) {
    const DEFAULT_WIDTH = 80;
    if (!outputDiv) return DEFAULT_WIDTH;
    // The extension creates the output `pre` at load and keeps it hidden until
    // the cell prints something, so its font is readable before the first run.
    const probe = outputDiv.querySelector("pre") || outputDiv;
    const usable = probe.clientWidth;  // content box: excludes the accent border
    if (!usable) return DEFAULT_WIDTH;
    const cs = getComputedStyle(probe);
    const canvas = qwebrOutputWidthChars.canvas ||
        (qwebrOutputWidthChars.canvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = [cs.fontStyle, cs.fontWeight, cs.fontSize, cs.fontFamily]
        .filter(Boolean).join(" ");
    const perChar = context.measureText("0".repeat(80)).width / 80;
    if (!perChar) return DEFAULT_WIDTH;
    // qwebr-styling.css puts `margin: 1px 2px 1px 10px` on the div inside the
    // pre, so 12px of the content box is never printable.
    const chars = Math.floor((usable - 12) / perChar);
    // Never NARROWER than R's own default. This only ever hands a cell more
    // room than it had, so no slide that has already been read over prints
    // differently unless its box was wider than 80 characters all along. A
    // cell in a half-width `.column` measures about 60 and keeps 80, which is
    // what it prints today: the tail scrolls, and trading that for a block
    // two-thirds taller is not obviously the better deal on a slide.
    // The ceiling is there because `options(width = )` is a hard limit in R,
    // not a suggestion, and nothing on these decks wants a 300-character line.
    return Math.max(DEFAULT_WIDTH, Math.min(200, chars));
};

globalThis.qwebrComputeEngine = async function(
    codeToRun,
    elements,
    options) {

    // Call into the R compute engine that persists within the document scope.
    // To be prepared for all scenarios, the following happens: 
    // 1. We setup a canvas device to write to by making a namespace call into the {webr} package
    // 2. We use values inside of the options array to set the figure size.
    // 3. We capture the output stream information (STDOUT and STERR)
    // 4. We disable the current device's image creation.
    // 5. Piece-wise parse the results into the different output areas

    // Create a pager variable for help/file contents
    let pager = [];

    // Handle how output is processed
    let showMarkup = options.results === "markup" && options.output !== "asis";
    let processOutput;

    if (showMarkup) {
        processOutput = qwebrEscapeHTMLCharacters;
    } else {
        processOutput = qwebrIdentity;
    }

    // ---- 
    // Convert from Inches to Pixels by using DPI (dots per inch)
    // for bitmap devices (dpi * inches = pixels)
    let fig_width = options["fig-width"] * options["dpi"]
    let fig_height = options["fig-height"] * options["dpi"]

    // Initialize webR
    await mainWebR.init();

    // Configure capture output
    let captureOutputOptions = {
        withAutoprint: true,
        captureStreams: true,
        captureConditions: false,
        // env: webR.objs.emptyEnv, // maintain a global environment for webR v0.2.0
    };
    
    // Determine if the browser supports OffScreen
    if (qwebrOffScreenCanvasSupport()) {
        // Mirror default options of webr::canvas()
        // with changes to figure height and width.
        captureOutputOptions.captureGraphics = {
            width: fig_width,
            height: fig_height,
            bg: "transparent", // was "white"; the slide paper colour must show through (see AGENTS.md)
            // R draws this canvas at 72 dpi whatever `dpi` is, so base graphics
            // text (hist(), plot()) must be scaled here to stay legible.
            pointsize: 12 * options["dpi"] / 72,
            capture: true
        };
    }  else {
        // Disable generating graphics
        captureOutputOptions.captureGraphics = false;
    }

    // Store the code to run in history
    qwebrLogCodeToHistory(codeToRun, options);

    // R wraps everything it prints at `getOption("width")` characters and webR
    // leaves that at 80, whatever the box it is printing into. A full-width
    // cell fits about 124 characters at the deck's code size, so a printed
    // data frame stopped a third short of the right edge and R moved its last
    // column into a second block underneath — which is how a six-column
    // `st_join` result came out as five columns and then a lone `geometry`.
    // Measure the box this cell actually got and let R use all of it.
    //
    // Safe to take at run time: webr-layout.html decides side-by-side versus
    // stacked while the page loads and never revisits it (see assessOutput),
    // so the width measured here is the width the output is printed into.
    const widthFix = `options(width = ${qwebrOutputWidthChars(elements.outputCodeDiv)}); `;

    // webR's canvas draws text at the `pointsize` set above but still reports
    // its character metrics as if the font were 12pt. R sizes plot margins in
    // "lines" from those metrics, so on a 216 dpi canvas the margins come out
    // three times too small and base graphics draw the y-axis label off the
    // left edge. `mex` is the factor R uses when turning margin lines into
    // physical units, so setting it to the same dpi/72 restores them. It is
    // prepended on the code's first line, not a line of its own, so a parse
    // error still reports the line number the student sees in the editor.
    const marginFix = captureOutputOptions.captureGraphics
        ? `par(mex = ${options["dpi"] / 72}); `
        : "";

    // Setup a webR canvas by making a namespace call into the {webr} package
    // Evaluate the R code
    // Remove the active canvas silently
    const result = await mainWebRCodeShelter.captureR(
        `${widthFix}${marginFix}${codeToRun}`,
        captureOutputOptions
    );

    // -----

    // Start attempting to parse the result data
    processResultOutput:try {
        
        // Avoid running through output processing
        if (options.results === "hide" || options.output === "false") { 
            break processResultOutput; 
        }

        // Merge output streams of STDOUT and STDErr (messages and errors are combined.)
        // Require both `warning` and `message` to be true to display `STDErr`. 
        const out = result.output
        .filter(
            evt => evt.type === "stdout" || 
            ( evt.type === "stderr" && (options.warning === "true" && options.message === "true")) ||
            // Errors share the stderr stream with messages and warnings, which the
            // decks silence. An error must show regardless or a failing line
            // looks like it ran fine (see AGENTS.md).
            ( evt.type === "stderr" && /^Error/.test(evt.data))
        )
        .map((evt, index) => {
            const className = `qwebr-output-code-${evt.type}`;
            const outputResult = qwebrPrefixComment(processOutput(evt.data), options.comment);
            return `<code id="${className}-editor-${elements.id}-result-${index + 1}" class="${className}">${outputResult}</code>`;
        })
        .join("\n");


        // Clean the state
        // We're now able to process pager events.
        // As a result, we cannot maintain a true 1-to-1 output order 
        // without individually feeding each line
        const msgs = await mainWebR.flush();

        // Use `map` to process the filtered "pager" events asynchronously
        const pager = await Promise.all(
            msgs.filter(msg => msg.type === 'pager').map(
                async (msg) => {
                    return await qwebrParseTypePager(msg);
                }
            )
        );

        // Nullify the output area of content
        elements.outputCodeDiv.innerHTML = "";
        elements.outputGraphDiv.innerHTML = "";

        // Design an output object for messages
        const pre = document.createElement("pre");
        // PATCHED: an `output: asis` cell hands back real HTML (a gt, kableExtra
        // or tinytable table). It keeps the output box, but not the whitespace
        // and font of a `pre`. See notebook.scss, and RULES.md section 7.
        if (!showMarkup) { pre.classList.add("qwebr-output-asis"); }
        if (/\S/.test(out)) {
            // Display results as HTML elements to retain output styling
            const div = document.createElement("div");
            div.innerHTML = out;

            // Calculate a scaled font-size value
            const scaledFontSize = qwebrScaledFontSize(
                elements.outputCodeDiv, options);

            // Override output code cell size
            pre.style.fontSize = `${scaledFontSize}px`;
            pre.appendChild(div);
        } else {
            // If nothing is present, hide the element.
            pre.style.visibility = "hidden";
        }

        elements.outputCodeDiv.appendChild(pre);

        // PATCHED: HTML written by `output: asis` may carry its own <script>,
        // which is how tinytable, modelsummary's default HTML output, fills its
        // cells. innerHTML never runs a script, so the table arrived empty.
        // Re-creating each script node runs it, and it must happen after the
        // output is in the document or a detached node still does nothing.
        if (!showMarkup) {
            pre.querySelectorAll("script").forEach((original) => {
                const script = document.createElement("script");
                for (const attribute of original.attributes) {
                    script.setAttribute(attribute.name, attribute.value);
                }
                script.textContent = original.textContent;
                original.replaceWith(script);
            });
        }

        // Determine if we have graphs to display
        if (result.images.length > 0) {

            // Create figure element
            const figureElement = document.createElement("figure");
            figureElement.className = "qwebr-canvas-image";

            // Place each rendered graphic onto a canvas element
            result.images.forEach((img) => {

                // Construct canvas for object
                const canvas = document.createElement("canvas");

                // Add an image download button
                qwebrImageCanvasDownloadButton(canvas, figureElement);

                // Set canvas size to image
                canvas.width = img.width;
                canvas.height = img.height;

                // Apply output truncations
                canvas.style.width = options["out-width"] ? options["out-width"] : `${fig_width}px`;
                if (options["out-height"]) {
                    canvas.style.height = options["out-height"];
                }

                // Apply styling
                canvas.style.display = "block";
                canvas.style.margin = "auto";

                // Draw image onto Canvas
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, img.width, img.height);
          
                // Append canvas to figure output area
                figureElement.appendChild(canvas);

            });
            
            if (options['fig-cap']) {
                // Create figcaption element
                const figcaptionElement = document.createElement('figcaption');
                figcaptionElement.innerText = options['fig-cap'];
                // Append figcaption to figure
                figureElement.appendChild(figcaptionElement);    
            }
        
            elements.outputGraphDiv.appendChild(figureElement);

        }

        // Display the pager data
        if (pager) {
        // Use the `pre` element to preserve whitespace.
        pager.forEach((paged_data, index) => {
            let pre_pager = document.createElement("pre");
            pre_pager.innerText = paged_data;
            pre_pager.classList.add("qwebr-output-code-pager");
            pre_pager.setAttribute("id", `qwebr-output-code-pager-editor-${elements.id}-result-${index + 1}`);
            elements.outputCodeDiv.appendChild(pre_pager);
        });
        }
    } finally {
        // Clean up the remaining code
        mainWebRCodeShelter.purge();
    }
}

// Function to execute the code (accepts code as an argument)
globalThis.qwebrExecuteCode = async function (
    codeToRun,
    id,
    options = {}) {

    // If options are not passed, we fall back on the bare minimum to handle the computation
    if (qwebrIsObjectEmpty(options)) {
        options = { 
            "context": "interactive", 
            "fig-width": 7, "fig-height": 5, 
            "out-width": "700px", "out-height": "", 
            "dpi": 72,
            "results": "markup", 
            "warning": "true", "message": "true",
        };
    }

    // Next, we access the compute areas values
    const elements = {
        runButton: document.getElementById(`qwebr-button-run-${id}`),
        outputCodeDiv: document.getElementById(`qwebr-output-code-area-${id}`),
        outputGraphDiv: document.getElementById(`qwebr-output-graph-area-${id}`),
        id: id,
    }

    // Disallowing execution of other code cells
    document.querySelectorAll(".qwebr-button-run").forEach((btn) => {
        btn.disabled = true;
    });

    if (options.context == EvalTypes.Interactive) {
        // Emphasize the active code cell
        elements.runButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin qwebr-icon-status-spinner"></i> <span>Run Code</span>';
    }

    // Evaluate the code and parse the output into the document
    await qwebrComputeEngine(codeToRun, elements, options);

    // Switch to allowing execution of code
    document.querySelectorAll(".qwebr-button-run").forEach((btn) => {
        btn.disabled = false;
    });

    if (options.context == EvalTypes.Interactive) {
        // Revert to the initial code cell state
        elements.runButton.innerHTML = '<i class="fa-solid fa-play qwebr-icon-run-code"></i> <span>Run Code</span>';
    }
}
