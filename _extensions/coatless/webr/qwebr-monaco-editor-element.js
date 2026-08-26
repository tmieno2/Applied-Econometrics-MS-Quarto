// Global array to store Monaco Editor instances
globalThis.qwebrEditorInstances = [];

function isValidCodeLineNumbers(stringCodeLineNumbers) {
  // Regular expression to match valid input strings
  const regex = /^(\d+(-\d+)?)(,\d+(-\d+)?)*$/;
  return regex.test(stringCodeLineNumbers);
}

// Function that builds and registers a Monaco Editor instance    
globalThis.qwebrCreateMonacoEditorInstance = function (cellData) {

  const initialCode = cellData.code;
  const qwebrCounter = cellData.id;
  const qwebrOptions = cellData.options;

  // Retrieve the previously created document elements
  let runButton = document.getElementById(`qwebr-button-run-${qwebrCounter}`);
  let resetButton = document.getElementById(`qwebr-button-reset-${qwebrCounter}`);
  let copyButton = document.getElementById(`qwebr-button-copy-${qwebrCounter}`);
  let editorDiv = document.getElementById(`qwebr-editor-${qwebrCounter}`);

  // Load the Monaco Editor and create an instance
  let editor;
  require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(editorDiv, {
      value: initialCode,
      language: 'r',
      theme: 'vs-light',
      automaticLayout: true,           // Works wonderfully with RevealJS
      scrollBeyondLastLine: false,
      minimap: {
        enabled: false
      },
      fontSize: qwebrScaledFontSize(editorDiv, qwebrOptions),         
      renderLineHighlight: "none",      // Disable current line highlighting
      hideCursorInOverviewRuler: true,  // Remove cursor indictor in right hand side scroll bar
      // PATCHED, see RULES.md. Monaco reserves a strip at the right of the
      // editor for the overview ruler — the map of marks beside a scrollbar —
      // and draws a hairline border down its left side. Nothing in these decks
      // puts a mark in it, so it is an empty ~14px band, and its border reads
      // as the right edge of the code block: the block then looks narrower than
      // the "Run Code" bar above it, which is the whole point of the bar being
      // the editor's own width. No lanes, no border, and the code ground runs
      // to the container edge.
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      // PATCHED, see RULES.md. Monaco's defaults reserve five characters of
      // number column (`lineNumbersMinChars: 5`) and a 10px decorations strip
      // beside it, which on a cell of at most a couple of dozen lines is a wide
      // empty band between the number and the code. Two characters covers every
      // cell in these decks (99 lines), and the decorations strip carries
      // nothing here — no breakpoints, no folding.
      lineNumbersMinChars: 1,
      // The gap between the number and the first character. 4 put them in
      // contact ("1#--- addition"); Monaco's default 10 sits beside a
      // five-character number column, which is what made the band look empty.
      // The gap between the number and the first character. The whole margin is
      // this plus the digits: 6 read as too tight, 12 as too loose, so 9 —
      // a 25px margin on a ten-plus-line cell, 17px on a short one, against the
      // ~75px Monaco's defaults gave.
      lineDecorationsWidth: 9,
      folding: false,
      glyphMargin: false,
      readOnly: qwebrOptions['read-only'] ?? false,
      quickSuggestions: qwebrOptions['editor-quick-suggestions'] ?? false,
      wordWrap: (qwebrOptions['editor-word-wrap'] == 'true' ? "on" : "off")
    });

    // Store the official counter ID to be used in keyboard shortcuts
    editor.__qwebrCounter = qwebrCounter;

    // Store the official div container ID
    editor.__qwebrEditorId = `qwebr-editor-${qwebrCounter}`;

    // Store the initial code value and options
    editor.__qwebrinitialCode = initialCode;
    editor.__qwebrOptions = qwebrOptions;

    // Set at the model level the preferred end of line (EOL) character to LF.
    // This prevent `\r\n` from being given to the webR engine if the user is on Windows.
    // See details in: https://github.com/coatless/quarto-webr/issues/94
    // Associated error text: 
    // Error: <text>:1:7 unexpected input

    // Retrieve the underlying model
    const model = editor.getModel();
    // Set EOL for the model
    model.setEOL(monaco.editor.EndOfLineSequence.LF);
    
    // Dynamically modify the height of the editor window if new lines are added.
    let ignoreEvent = false;
    const updateHeight = () => {
      // PATCHED, see RULES.md. A cell on a slide or a tab that has not been opened
      // sits in a `display: none` subtree, so its box measures 0 wide and Monaco
      // falls back to its 5x5 minimum. Word wrap is on for every cell (webr.lua's
      // own default), so at that width one character is one row: the 37-character
      // `runif(5) # default is min=0 and max=1` measures 37 rows, and without this
      // guard a one-line cell is given a 754px height. Write nothing until the box
      // has a width. Opening the slide or tab changes the wrapped line count, which
      // fires onDidContentSizeChange and brings us back here with a real measurement
      // (verified on empty cells too, where the content height still moves 32 -> 20
      // because the horizontal scrollbar stops being reserved).
      if (!editorDiv.offsetWidth) return;

      // Increment editor height by 2 to prevent vertical scroll bar from appearing
      const contentHeight = editor.getContentHeight() + 2;

      // Retrieve editor-max-height option
      const maxEditorHeight = qwebrOptions['editor-max-height'];

      // If editor-max-height is missing, allow infinite growth. Otherwise, threshold.
      const editorHeight = !maxEditorHeight ?  contentHeight : Math.min(contentHeight, maxEditorHeight);

      // We're avoiding a width change
      //editorDiv.style.width = `${width}px`;
      editorDiv.style.height = `${editorHeight}px`;
      try {
        ignoreEvent = true;

        // The key to resizing is this call
        editor.layout();
      } finally {
        ignoreEvent = false;
      }
    };

    // Function to generate decorations to highlight lines
    // in the editor based on input string.
    function decoratorHighlightLines(codeLineNumbers) {
      // Store the lines to be lighlight
      let linesToHighlight = [];
      
      // Parse the codeLineNumbers string to get the line numbers to highlight
      // First, split the string by commas
      codeLineNumbers.split(',').forEach(part => {
        // Check if we have a range of lines
        if (part.includes('-')) {
            // Handle range of lines (e.g., "6-8")
            const [start, end] = part.split('-').map(Number);
            for (let i = start; i <= end; i++) {
                linesToHighlight.push(i);
            }
        } else {
            // Handle single line (e.g., "7")
            linesToHighlight.push(Number(part));
        }
      });
  
      // Create monaco decorations for the lines to highlight
      const decorations = linesToHighlight.map(lineNumber => ({
          range: new monaco.Range(lineNumber, 1, lineNumber, 1),
          options: {
              isWholeLine: true,
              className: 'qwebr-editor-highlight-line'
          }
      }));
  
      // Return decorations to be applied to the editor
      return decorations;
    }

    // Ensure that the editor-code-line-numbers option is set and valid
    // then apply styling
    if (qwebrOptions['editor-code-line-numbers']) {
      // Remove all whitespace from the string
      const codeLineNumbers = qwebrOptions['editor-code-line-numbers'].replace(/\s/g,'');
      // Check if the string is valid for line numbers, e.g., "1,3-5,7"
      if (isValidCodeLineNumbers(codeLineNumbers)) {
        // Apply the decorations to the editor
        editor.createDecorationsCollection(decoratorHighlightLines(codeLineNumbers));
      } else {
        // Warn the user that the input is invalid
        console.warn(`Invalid "editor-code-line-numbers" value in code cell ${qwebrOptions['label']}: ${codeLineNumbers}`);
      }
    }

    // Helper function to check if selected text is empty
    function isEmptyCodeText(selectedCodeText) {
      return (selectedCodeText === null || selectedCodeText === undefined || selectedCodeText === "");
    }

    // Registry of keyboard shortcuts that should be re-added to each editor window
    // when focus changes.
    const addWebRKeyboardShortCutCommands = () => {
      // Add a keydown event listener for Shift+Enter to run all code in cell
      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {

        // Retrieve all text inside the editor
        qwebrExecuteCode(editor.getValue(), editor.__qwebrCounter, editor.__qwebrOptions);
      });

      // Add a keydown event listener for CMD/Ctrl+Enter to run selected code
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {

        // Get the selected text from the editor
        const selectedText = editor.getModel().getValueInRange(editor.getSelection());
        // Check if no code is selected
        if (isEmptyCodeText(selectedText)) {
          // Obtain the current cursor position
          let currentPosition = editor.getPosition();
          // Retrieve the current line content
          let currentLine = editor.getModel().getLineContent(currentPosition.lineNumber);

          // Propose a new position to move the cursor to
          let newPosition = new monaco.Position(currentPosition.lineNumber + 1, 1);

          // Check if the new position is beyond the last line of the editor
          if (newPosition.lineNumber > editor.getModel().getLineCount()) {
            // Add a new line at the end of the editor
            editor.executeEdits("addNewLine", [{
            range: new monaco.Range(newPosition.lineNumber, 1, newPosition.lineNumber, 1),
            text: "\n", 
            forceMoveMarkers: true,
            }]);
          }
          
          // Run the entire line of code.
          qwebrExecuteCode(currentLine, editor.__qwebrCounter, editor.__qwebrOptions);

          // Move cursor to new position
          editor.setPosition(newPosition);
        } else {
          // Code to run when Ctrl+Enter is pressed with selected code
          qwebrExecuteCode(selectedText, editor.__qwebrCounter, editor.__qwebrOptions);
        }
      });
    }

    // Register an on focus event handler for when a code cell is selected to update
    // what keyboard shortcut commands should work.
    // This is a workaround to fix a regression that happened with multiple
    // editor windows since Monaco 0.32.0 
    // https://github.com/microsoft/monaco-editor/issues/2947
    editor.onDidFocusEditorText(addWebRKeyboardShortCutCommands);

    // Register an on change event for when new code is added to the editor window
    editor.onDidContentSizeChange(updateHeight);

    // Manually re-update height to account for the content we inserted into the call
    updateHeight();

    // Store the editor instance in the global dictionary
    qwebrEditorInstances[editor.__qwebrCounter] = editor;

  });

  // Add a click event listener to the run button
  runButton.onclick = function () {
    qwebrExecuteCode(editor.getValue(), editor.__qwebrCounter, editor.__qwebrOptions);
  };

  // Add a click event listener to the reset button
  copyButton.onclick = function () {
    // Retrieve current code data
    const data = editor.getValue();
    
    // Write code data onto the clipboard.
    navigator.clipboard.writeText(data || "");
  };
  
  // Add a click event listener to the copy button
  resetButton.onclick = function () {
    editor.setValue(editor.__qwebrinitialCode);
  };
  
}