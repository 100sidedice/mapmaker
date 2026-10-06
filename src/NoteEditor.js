const VOID_ELEMENTS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr"
]);

const INDENT = "    ";

const TAGS = [
    { name: "h1" }, { name: "h2" },
    { name: "p" },
    { name: "b" }, { name: "i" }, { name: "u" }, { name: "s" },
    { name: "br", void: true }, { name: "hr", void: true },
    { name: "ul" }, { name: "ol" }, { name: "li", after: /<(?:ul|ol)(?:\s[^>]*)?>\s*$/i },
    { name: "blockquote" }, { name: "pre" }, { name: "code" },
    { name: "fieldset" }, { name: "legend", after: /<fieldset(?:\s[^>]*)?>\s*$/i },
    { name: "details" }, { name: "summary", after: /<details(?:\s[^>]*)?>\s*$/i },
    { name: "random", template: "<random>default, a,b,c</random>", cursor: 8 },
    { name: "value", template: "<value>name:value</value>", cursor: 11 },
    { name: "keyword", template: "<keyword>name:tooltip</keyword>", cursor: 13 },
    { name: "textarea", template: '<textarea id="comment">Add a comment</textarea>', cursor: 23 },
    { name: "bhr", template: "<bhr></bhr>", cursor: 5 },
    { name: "space", template: "<space></space>", cursor: 7 }
];

/**
 * Adds lightweight HTML and code-editor conveniences to a textarea.
 * @param {HTMLTextAreaElement} textarea
 */
export function attachNoteEditor(textarea) {
    const folding = createFoldingEditor(textarea);

    textarea.addEventListener("keydown", event => {
        if (event.key === "Tab") {
            event.preventDefault();
            if (event.shiftKey) {
                unindentSelection(textarea);
            } else {
                insertText(textarea, INDENT);
            }
            return;
        }

        if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
            if (event.ctrlKey) {
                duplicateLine(textarea, event.key === "ArrowDown");
            } else {
                moveLine(textarea, event.key === "ArrowDown");
            }
            return;
        }

        if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            insertNewlineWithIndent(textarea);
        }
    });

    textarea.addEventListener("input", event => {
        folding.clear();
        if (event.data !== ">") return;
        closeHtmlTag(textarea);
    });
    textarea.addEventListener("copy", event => {
        const value = folding.getSelectedValue();
        if (value === null) return;

        event.preventDefault();
        event.clipboardData.setData("text/plain", value);
    });

    folding.refresh();
}

/**
 * Refreshes the fold gutter after code is loaded into the textarea.
 * @param {HTMLTextAreaElement} textarea
 */
export function refreshNoteEditor(textarea) {
    textarea.noteEditorFolding?.refresh();
}

/**
 * Returns the complete editor content, excluding any visual folding.
 * @param {HTMLTextAreaElement} textarea
 * @returns {string}
 */
export function getNoteEditorValue(textarea) {
    return textarea.noteEditorFolding?.getValue() ?? textarea.value;
}

function createFoldingEditor(textarea) {
    const existing = textarea.noteEditorFolding;
    if (existing) return existing;

    const shell = document.createElement("div");
    shell.className = "note-editor-shell";
    const gutter = document.createElement("div");
    gutter.className = "note-editor-gutter";
    textarea.parentNode.insertBefore(shell, textarea);
    shell.append(gutter, textarea);

    const state = {
        original: null,
        displayValue: null,
        folds: [],
        refresh() {
            state.original = null;
            state.displayValue = null;
            state.folds = [];
            textarea.disabled = false;
            clearFoldedLineStyle();
            renderFoldGutter();
        },
        clear() {
            if (state.original !== null) {
                expandForEdit();
                renderFoldGutter();
                return;
            }
            renderFoldGutter();
        },
        isFolded() {
            return state.original !== null;
        },
        getValue() {
            return state.original ?? textarea.value;
        },
        getSelectedValue() {
            if (state.original === null || textarea.selectionStart === textarea.selectionEnd) {
                return null;
            }

            return getSourceSelection(
                textarea.selectionStart,
                textarea.selectionEnd,
                state.original,
                state.folds
            );
        }
    };
    textarea.noteEditorFolding = state;

    textarea.addEventListener("scroll", () => {
        gutter.scrollTop = textarea.scrollTop;
    });

    function renderFoldGutter() {
        const lines = state.original ? state.original.split("\n") : textarea.value.split("\n");
        const ranges = findFoldRanges(state.original || textarea.value);
        const hiddenLines = new Set();
        for (const fold of state.folds) {
            for (let line = fold.startLine + 1; line <= fold.endLine; line++) {
                hiddenLines.add(line);
            }
        }
        updateFoldedLineStyle();
        gutter.replaceChildren();
        for (let index = 0; index < lines.length; index++) {
            if (hiddenLines.has(index)) continue;
            const row = document.createElement("div");
            row.className = "note-editor-gutter-row";
            const range = ranges.find(candidate =>
                candidate.startLine === index &&
                !state.folds.some(fold =>
                    fold.startLine < index && index <= fold.endLine
                )
            );
            if (range) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "note-fold-button";
                const folded = state.folds.some(fold => fold.start === range.start);
                button.textContent = folded ? "▸" : "▾";
                button.setAttribute(
                    "aria-label",
                    `${folded ? "Expand" : "Collapse"} ${range.tag} section`
                );
                button.addEventListener("click", () => {
                    if (folded) {
                        expand(range);
                    } else {
                        collapse(range);
                    }
                });
                row.appendChild(button);
            }
            gutter.appendChild(row);
        }
    }

    function collapse(range) {
        if (state.original === null) state.original = textarea.value;
        if (state.folds.some(fold => fold.start === range.start)) return;
        state.folds.push(range);
        state.folds.sort((left, right) => left.start - right.start);
        textarea.value = getFoldedValue();
        state.displayValue = textarea.value;
        renderFoldGutter();
    }

    function expand(range) {
        state.folds = state.folds.filter(fold => fold.start !== range.start);
        if (!state.folds.length) {
            textarea.value = state.original;
            state.original = null;
            state.displayValue = null;
            textarea.disabled = false;
        } else {
            textarea.value = getFoldedValue();
            state.displayValue = textarea.value;
        }
        renderFoldGutter();
    }

    function getFoldedValue() {
        const lines = state.original.split("\n");
        const hiddenLines = new Set();
        for (const fold of state.folds) {
            for (let line = fold.startLine + 1; line <= fold.endLine; line++) {
                hiddenLines.add(line);
            }
        }
        return lines
            .map((line, lineNumber) => {
                if (hiddenLines.has(lineNumber)) return null;
                const fold = state.folds.find(candidate => candidate.startLine === lineNumber);
                if (!fold) return line;
                return line.replace(/^(\s*)<([A-Za-z][\w:-]*)/, "$1<...$2");
            })
            .filter(line => line !== null)
            .join("\n");
    }

    function updateFoldedLineStyle() {
        if (!state.original || !state.folds.length) {
            clearFoldedLineStyle();
            return;
        }

        const positions = state.folds.map(fold => {
            let visibleLine = 0;
            for (let line = 0; line < fold.startLine; line++) {
                if (!state.folds.some(candidate =>
                    candidate.startLine < line && line <= candidate.endLine
                )) {
                    visibleLine++;
                }
            }
            return `0 ${0.6 + visibleLine * 1.4}rem`;
        });
        textarea.classList.add("note-input-folded");
        textarea.style.backgroundImage = positions
            .map(() => "linear-gradient(to bottom, rgba(80, 60, 35, 0.1), rgba(80, 60, 35, 0.1))")
            .join(", ");
        textarea.style.backgroundPosition = positions.join(", ");
        textarea.style.backgroundSize = positions.map(() => "100% 1.4rem").join(", ");
    }

    function clearFoldedLineStyle() {
        textarea.classList.remove("note-input-folded");
        textarea.style.backgroundImage = "";
        textarea.style.backgroundPosition = "";
        textarea.style.backgroundSize = "";
    }

    function expandForEdit() {
        const previous = state.displayValue;
        const current = textarea.value;
        const original = state.original;
        let prefix = 0;
        while (prefix < previous.length && prefix < current.length &&
            previous[prefix] === current[prefix]) {
            prefix++;
        }

        let oldSuffix = previous.length;
        let newSuffix = current.length;
        while (oldSuffix > prefix && newSuffix > prefix &&
            previous[oldSuffix - 1] === current[newSuffix - 1]) {
            oldSuffix--;
            newSuffix--;
        }

        const mapPosition = position => {
            let visiblePosition = 0;
            let originalPosition = 0;
            const lines = original.split("\n");
            for (let line = 0; line < lines.length; line++) {
                const hidden = state.folds.some(fold =>
                    fold.startLine < line && line <= fold.endLine
                );
                if (hidden) {
                    originalPosition += lines[line].length + 1;
                    continue;
                }
                const fold = state.folds.find(candidate => candidate.startLine === line);
                const visibleLine = fold
                    ? lines[line].replace(/^(\s*)<([A-Za-z][\w:-]*)/, "$1<...$2")
                    : lines[line];
                if (position <= visiblePosition + visibleLine.length) {
                    const lineOffset = position - visiblePosition;
                    const placeholderOffset = fold && lineOffset > lines[line].indexOf("<") + 1
                        ? 3
                        : 0;
                    return originalPosition + Math.min(
                        lines[line].length,
                        Math.max(0, lineOffset - placeholderOffset)
                    );
                }
                visiblePosition += visibleLine.length + 1;
                originalPosition += lines[line].length + 1;
            }
            return original.length;
        };
        const editStart = mapPosition(prefix);
        const editEnd = mapPosition(oldSuffix);
        const value = original.slice(0, editStart) +
            current.slice(prefix, newSuffix) +
            original.slice(editEnd);

        const foldedTags = state.folds.map(fold => fold.tag);
        state.original = value;
        state.folds = findFoldRanges(value).filter(range => {
            const tagIndex = foldedTags.indexOf(range.tag);
            if (tagIndex === -1) return false;
            foldedTags.splice(tagIndex, 1);
            return true;
        });
        textarea.value = getFoldedValue();
        state.displayValue = textarea.value;
    }

    function getSourceSelection(start, end, original, folds) {
        const sourceStart = getSourcePosition(start, false, original, folds);
        const sourceEnd = getSourcePosition(end, true, original, folds);
        return original.slice(sourceStart, sourceEnd);
    }

    function getSourcePosition(position, endBias, original, folds) {
        let visiblePosition = 0;
        let sourcePosition = 0;
        const lines = original.split("\n");

        for (let line = 0; line < lines.length; line++) {
            const hidden = folds.some(fold =>
                fold.startLine < line && line <= fold.endLine
            );
            if (hidden) {
                sourcePosition += lines[line].length + 1;
                continue;
            }

            const fold = folds.find(candidate => candidate.startLine === line);
            const visibleLine = fold
                ? lines[line].replace(/^(\s*)<([A-Za-z][\w:-]*)/, "$1<...$2")
                : lines[line];
            const lineEnd = visiblePosition + visibleLine.length;

            if (position <= lineEnd) {
                if (fold && position > visiblePosition) {
                    if (endBias) {
                        const closingEnd = original.indexOf("\n", fold.end);
                        return closingEnd === -1 ? original.length : closingEnd;
                    }
                    return sourcePosition;
                }
                return sourcePosition + Math.max(0, position - visiblePosition);
            }

            visiblePosition = lineEnd + 1;
            sourcePosition += lines[line].length + 1;
        }

        return original.length;
    }

    return state;
}

function findFoldRanges(text) {
    const ranges = [];
    const stack = [];
    const tagPattern = /<\/?([A-Za-z][\w:-]*)(?:\s[^<>]*)?>/g;
    let match;
    while ((match = tagPattern.exec(text))) {
        const fullTag = match[0];
        const tag = match[1].toLowerCase();
        if (VOID_ELEMENTS.has(tag) || fullTag.endsWith("/>")) continue;
        const line = text.slice(0, match.index).split("\n").length - 1;
        if (fullTag.startsWith("</")) {
            const opening = stack.pop();
            if (!opening || opening.tag !== tag || opening.line === line) continue;
            ranges.push({
                start: opening.index,
                end: match.index,
                startLine: opening.line,
                endLine: line,
                tag
            });
        } else {
            stack.push({ tag, index: match.index, line });
        }
    }
    return ranges.filter(range => range.endLine > range.startLine);
}

/**
 * Creates the HTML tag insertion buttons for a note textarea.
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLElement} container
 */
export function attachNoteTagButtons(textarea, container) {
    if (!container) return;

    for (const tag of TAGS) {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("note-tag");
        button.textContent = `<${tag.name}>`;
        button.dataset.tag = tag.name;
        button.addEventListener("click", () => {
            insertTag(textarea, tag);
            textarea.focus();
        });
        container.appendChild(button);
    }

    const updateVisibility = () => {
        const beforeCursor = textarea.value.slice(0, textarea.selectionStart);
        const currentLineStart = beforeCursor.lastIndexOf("\n") + 1;
        const previousText = beforeCursor.slice(0, currentLineStart);
        const currentLine = beforeCursor.slice(currentLineStart);

        container.querySelectorAll("button[data-tag]").forEach(button => {
            const tag = TAGS.find(item => item.name === button.dataset.tag);
            const context = `${previousText}\n${currentLine}`;
            button.hidden = Boolean(tag.after && !tag.after.test(context));
        });
    };

    textarea.addEventListener("input", updateVisibility);
    textarea.addEventListener("click", updateVisibility);
    textarea.addEventListener("keyup", updateVisibility);
    updateVisibility();
}

function insertTag(textarea, tag) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (tag.template) {
        textarea.setRangeText(tag.template, start, end, "end");
        const cursor = tag.cursor ?? tag.template.length;
        textarea.setSelectionRange(start + cursor, start + cursor);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        return;
    }

    const opening = `<${tag.name}>`;
    const insertion = tag.void ? opening : `${opening}</${tag.name}>`;
    const cursor = tag.void ? opening.length : opening.length;

    textarea.setRangeText(insertion, start, end, "end");
    textarea.setSelectionRange(start + cursor, start + cursor);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertText(textarea, text) {
    const start = textarea.selectionStart;
    textarea.setRangeText(text, start, textarea.selectionEnd, "end");
    textarea.setSelectionRange(start + text.length, start + text.length);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function closeHtmlTag(textarea) {
    const cursor = textarea.selectionStart;
    if (cursor !== textarea.selectionEnd || textarea.value[cursor - 1] !== ">") return;

    const openingTag = textarea.value.slice(0, cursor).match(/<([A-Za-z][\w:-]*)(?:\s[^<>]*)?>$/);
    if (!openingTag || VOID_ELEMENTS.has(openingTag[1].toLowerCase())) return;

    const tagName = openingTag[1];
    const followingText = textarea.value.slice(cursor);
    if (new RegExp(`^\\s*</${tagName}\\s*>`, "i").test(followingText)) return;

    textarea.setRangeText(`</${tagName}>`, cursor, cursor, "end");
    textarea.setSelectionRange(cursor, cursor);
}

function insertNewlineWithIndent(textarea) {
    const cursor = textarea.selectionStart;
    const lineStart = textarea.value.lastIndexOf("\n", cursor - 1) + 1;
    const indentation = textarea.value.slice(lineStart, cursor).match(/^[ \t]*/)[0];
    const insertion = `\n${indentation}`;
    textarea.setRangeText(insertion, cursor, textarea.selectionEnd, "end");
    textarea.setSelectionRange(cursor + insertion.length, cursor + insertion.length);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function getLineBounds(text, position) {
    const start = text.lastIndexOf("\n", position - 1) + 1;
    const newline = text.indexOf("\n", position);
    return { start, end: newline === -1 ? text.length : newline };
}

function replaceValue(textarea, value, selectionStart, selectionEnd = selectionStart) {
    textarea.value = value;
    textarea.setSelectionRange(selectionStart, selectionEnd);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function moveLine(textarea, down) {
    const text = textarea.value;
    const line = getLineBounds(text, textarea.selectionStart);
    const cursorOffset = textarea.selectionStart - line.start;
    const lineText = text.slice(line.start, line.end);

    if (down && line.end < text.length) {
        const next = getLineBounds(text, line.end + 1);
        const nextText = text.slice(next.start, next.end);
        const value = text.slice(0, line.start) + nextText + "\n" + lineText + text.slice(next.end);
        replaceValue(textarea, value, line.start + nextText.length + 1 + cursorOffset);
    } else if (!down && line.start > 0) {
        const previous = getLineBounds(text, line.start - 1);
        const previousText = text.slice(previous.start, previous.end);
        const value = text.slice(0, previous.start) + lineText + "\n" + previousText + text.slice(line.end);
        replaceValue(textarea, value, previous.start + cursorOffset);
    }
}

function duplicateLine(textarea, below) {
    const text = textarea.value;
    const line = getLineBounds(text, textarea.selectionStart);
    const lineText = text.slice(line.start, line.end);
    const value = below
        ? text.slice(0, line.end) + "\n" + lineText + text.slice(line.end)
        : text.slice(0, line.start) + lineText + "\n" + text.slice(line.start);
    const cursor = below
        ? textarea.selectionStart + lineText.length + 1
        : textarea.selectionStart;
    replaceValue(textarea, value, cursor);
}

function unindentSelection(textarea) {
    const text = textarea.value;
    const start = text.lastIndexOf("\n", textarea.selectionStart - 1) + 1;
    const endLineBreak = text.indexOf("\n", textarea.selectionEnd);
    const end = endLineBreak === -1 ? text.length : endLineBreak;
    const selected = text.slice(start, end).split("\n");
    let removedBeforeStart = 0;
    let removedBeforeEnd = 0;

    const lines = selected.map((line, index) => {
        const removal = line.match(/^ {1,4}/)?.[0].length || 0;
        if (index === 0) removedBeforeStart = removal;
        removedBeforeEnd += removal;
        return line.slice(removal);
    });
    const value = text.slice(0, start) + lines.join("\n") + text.slice(start + selected.join("\n").length);
    replaceValue(
        textarea,
        value,
        Math.max(start, textarea.selectionStart - removedBeforeStart),
        Math.max(start, textarea.selectionEnd - removedBeforeEnd)
    );
}