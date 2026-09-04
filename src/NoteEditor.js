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
    { name: "details" }, { name: "summary", after: /<details(?:\s[^>]*)?>\s*$/i }
];

/**
 * Adds lightweight HTML and code-editor conveniences to a textarea.
 * @param {HTMLTextAreaElement} textarea
 */
export function attachNoteEditor(textarea) {
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

    textarea.addEventListener("input", () => {
        closeHtmlTag(textarea);
    });
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