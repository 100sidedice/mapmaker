import { addTooltip, removeTooltip, clearTooltip } from "./Tooltip.js";
import SearchEngine from "./SearchEngine.js";
import DiceRoller from "./DiceRoller.js";
import { attachNoteEditor, attachNoteTagButtons } from "./NoteEditor.js";

const NOTE_TEMPLATES = [
    {
        name: "temp-Character",
        html: `<h2>Character</h2>
<details open>
    <summary>Core</summary>
    <ul>
        <li>HP:20<textarea id="hp"></textarea></li>
        <li>AC:10<textarea id="ac"></textarea></li>
    </ul>
</details>
<details>
    <summary>Stats</summary>
    <ul>
        <li><keyword>Str:5</keyword>:20</li>
        <li><keyword>Dex:5</keyword>:20</li>
        <li><keyword>Con:5</keyword>:20</li>
        <li><keyword>Int:5</keyword>:20</li>
        <li><keyword>Wis:5</keyword>:20</li>
        <li><keyword>Chr:5</keyword>:20</li>
    </ul>
</details>
<details>
    <summary>Items</summary>
    <ul>
        <li><value>Rope:50ft</value></li>
    </ul>
</details>
<details>
    <summary>Simple actions</summary>
    <li><textarea id="attack-1"></textarea></li>
    <details>
        <summary>Simple swing</summary>
        <p>Does [1d6(+Dex)] slashing damage</p>
    </details>
</details>
<details>
    <summary>Plain infomation</summary>
    <p>hello</p>
</details>`
    }
];

export default class Notes {
    constructor(mapMaker){
        this.mapMaker = mapMaker;
        this.searchEngine = new SearchEngine(this.mapMaker);
        this.diceRoller = new DiceRoller();
        this.mapMaker.notes.templates ??= [];
        this.noteHistory = new Map();
        this.historyApplying = false;
    }

    load(){
        this.loadNoteButtons();
        // start with the note browser open
        showElms(document.querySelector("#notes > main"), "section.area", "noteBrowser");
        showElms(document.querySelector("#notes > main #mainNoteControls"), "button", "");
        this.generateCatagories();

        // if notes header is pressed, toggle main note area
        const notesHeader = document.getElementById("notesHeader");
        notesHeader.addEventListener("click", () => {
            console.log("Notes header clicked");
            const mainNoteArea = document.getElementById("notesMain");
            if (!document.getElementById("tileContainer").checkVisibility()) {
                const instructions = document.getElementById("instructions");
                if (mainNoteArea.classList.contains("hidden")) {
                    instructions.classList.add("hide");
                    document.getElementById("close-instructions").textContent = "Open Information";
                }
            }
            mainNoteArea.classList.toggle("hidden");
            // shrink notes area to just header size
            const notes = document.getElementById("notes");
            if (mainNoteArea.classList.contains("hidden")) {
                notes.style.height = "3rem";
            } else {
                notes.style.height = "auto";
            }
        });

        if (window.matchMedia("(max-width: 600px)").matches) {
            document.getElementById("notesMain").classList.add("hidden");
        }
    }
    saveCurrentNote() {
        const input = document.getElementById("noteInput");

        if (Number.isInteger(this.editingTemplateIndex)) {
            const template = this.mapMaker.notes.templates?.[this.editingTemplateIndex];
            if (template) {
                template.html = input.value;
            }
            return;
        }

        if (!this.mapMaker.currentNoteKey) return;

        const text = input.value.trim();
        const variableRegex = /<var\s+key=["']([^"']+)["']>([\s\S]*?)<\/var>/gi;
        let match;

        while ((match = variableRegex.exec(text)) !== null) {
            const key = match[1].trim();

            if (!key) {
                continue;
            }

            this.mapMaker.notes[`var_${key}`] = match[2];
        }

        if (text === "") {
            delete this.mapMaker.notes[this.mapMaker.currentNoteKey];
            return;
        }
        if (!this.mapMaker.notes[this.mapMaker.currentNoteKey]) {
            this.mapMaker.notes[this.mapMaker.currentNoteKey] = {
                "color": "#ff000033",
                "text": text
            };
        } else {
            this.mapMaker.notes[this.mapMaker.currentNoteKey].text = text;
        }
    }
    getNoteHistoryKey() {
        if (Number.isInteger(this.editingTemplateIndex)) {
            return `template:${this.editingTemplateIndex}`;
        }

        return this.mapMaker.currentNoteKey ? `note:${this.mapMaker.currentNoteKey}` : null;
    }
    resetNoteHistory(value) {
        const key = this.getNoteHistoryKey();
        if (!key) return;

        this.noteHistory.set(key, {
            undo: [value],
            redo: []
        });
    }
    recordNoteHistory(value) {
        if (this.historyApplying) return;

        const key = this.getNoteHistoryKey();
        if (!key) return;

        let history = this.noteHistory.get(key);
        if (!history) {
            this.resetNoteHistory(value);
            return;
        }

        if (history.undo.at(-1) === value) return;

        history.undo.push(value);
        if (history.undo.length > 33) history.undo.shift();
        history.redo = [];
    }
    changeNoteHistory(direction) {
        const key = this.getNoteHistoryKey();
        const history = key ? this.noteHistory.get(key) : null;
        if (!history) return;

        if (direction === "undo") {
            if (history.undo.length < 2) return;

            history.redo.push(history.undo.pop());
        } else {
            if (!history.redo.length) return;

            history.undo.push(history.redo.pop());
        }

        const input = document.getElementById("noteInput");
        this.historyApplying = true;
        input.value = history.undo.at(-1);
        this.saveCurrentNote();
        this.historyApplying = false;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
    }
    loadNoteButtons(){
        // Region and tile notes

        // noteInput: text area for note input/display
        const noteInput = document.getElementById("noteInput");
        attachNoteEditor(noteInput);
        const hr = document.createElement("hr");
        noteInput.parentNode.appendChild(hr);
        attachNoteTagButtons(noteInput, document.getElementById("note-tag-controls"));
        noteInput.addEventListener("input", () => {
            this.recordNoteHistory(noteInput.value);
            this.saveCurrentNote();
        });
        noteInput.addEventListener("keydown", event => {
            const modifier = event.ctrlKey || event.metaKey;
            if (!modifier || event.altKey || event.key.toLowerCase() !== "z") return;

            event.preventDefault();
            this.changeNoteHistory(event.shiftKey ? "redo" : "undo");
        });

        document.getElementById("close-note-keyboard").addEventListener("click", () => {
            document.activeElement?.blur();
        });

        // removeNoteButton: button to remove the current note
        const removeNoteButton = document.getElementById("note-remove");
        removeNoteButton.addEventListener("click", () => {
            if (!this.mapMaker.currentNoteKey) return;
            delete this.mapMaker.notes[this.mapMaker.currentNoteKey];
            noteInput.value = "";
            this.renderNote(null);
            // go back to the note browser
            showElms(document.querySelector("#notes > main"), "section.area", "noteBrowser");
            showElms(document.querySelector("#notes > main #mainNoteControls"), "button", "");
            this.generateCatagories();
            clearTooltip();
        });

        // browseNotes
        const browseNotes = document.getElementById("note-browse");
        browseNotes.addEventListener("click", () => {
            this.editingTemplateIndex = null;
            showElms(document.querySelector("#notes > main"), "section.area", "noteBrowser");
            if (this.mapMaker.currentNoteKey) {
                showElms(document.querySelector("#notes > main #mainNoteControls"), "button", "");
            } else {
                showElms(document.querySelector("#notes > main #mainNoteControls"), "button", "");
            }
            this.generateCatagories();
            clearTooltip();
        });
        // show note (aka back - find current from scope)
        const showNote = document.getElementById("note-show");
        showNote.addEventListener("click", () => {
            // go to display area note
            const scope = this.mapMaker.zoomLevel;
            if (scope = "1"){ // tile notes
                //goto the note for the last picked tile
                showElms(document.querySelector("#notes > main"), "section.area", "displayAreaNote");
                showElms(document.querySelector("#notes > main #mainNoteControls"), "button", "note-browse", "note-edit", "note-remove");
                this.renderNote(this.mapMaker.tileEngine.getNoteAtPicked());
            }
        });

        // editNotes
        const editNotes = document.getElementById("note-edit");
        editNotes.addEventListener("click", () => {
            // update menu
            showElms(document.querySelector("#notes > main"), "section.area", "noteEdit");
                showElms(document.querySelector("#notes > main #mainNoteControls"), "button", "note-edit-back", "note-remove", "close-note-keyboard");

            // if a note exists, highlight the color button for that note if able to
            if (this.mapMaker.currentNoteKey && this.mapMaker.notes[this.mapMaker.currentNoteKey]) {
                const note = this.mapMaker.notes[this.mapMaker.currentNoteKey];
                const colorButtons = document.querySelectorAll("#noteEdit .color");
                colorButtons.forEach(button => {
                    if (button.dataset.color === note.color) {
                        button.classList.add("selected");
                        button.style.opacity = "1";
                    } else {
                        button.classList.remove("selected");
                        button.style.opacity = "0.5";
                    }
                });
            }
            clearTooltip();
        })
        const editBack = document.getElementById("note-edit-back");
        editBack.addEventListener("click", () => {
            if (Number.isInteger(this.editingTemplateIndex)) {
                this.editingTemplateIndex = null;
                document.getElementById("noteInput").value = "";
                showElms(document.querySelector("#notes > main"), "section.area", "noteBrowser");
                showElms(document.querySelector("#notes > main #mainNoteControls"), "button", "");
                this.generateCatagories("Templates");
                clearTooltip();
                return;
            }

            // go to display area note
            showElms(document.querySelector("#notes > main"), "section.area", "displayAreaNote");
            showElms(document.querySelector("#notes > main #mainNoteControls"), "button", "note-browse", "note-edit", "note-remove");
            this.renderNote(this.mapMaker.notes[this.mapMaker.currentNoteKey]);
            clearTooltip();
        });

        // add event to all the .color buttons in the noteEdit section
        const colorButtons = document.querySelectorAll("#noteEdit .color");
        colorButtons.forEach(button => {
            button.addEventListener("click", () => {
                if (!this.mapMaker.currentNoteKey) return;
                if (!this.mapMaker.notes[this.mapMaker.currentNoteKey]) {
                    this.mapMaker.notes[this.mapMaker.currentNoteKey] = {
                        "color": button.dataset.color,
                        "text": ""
                    };
                } else {
                    this.mapMaker.notes[this.mapMaker.currentNoteKey].color = button.dataset.color;
                    // update the selected class on the buttons
                    colorButtons.forEach(btn => btn.classList.remove("selected"));
                    button.classList.add("selected");
                    // also up the alpha of the selected color to 1, set the others to 0.2
                    colorButtons.forEach(btn => {
                        if (btn === button) {
                            btn.style.opacity = "1";
                        } else {
                            btn.style.opacity = "0.5";
                        }
                    });
                }
                this.renderNote(this.mapMaker.notes[this.mapMaker.currentNoteKey]);
            });
        });  

        // searchNotes
        const searchNotes = document.getElementById("note-search");
        const noteBrowserInput = document.getElementById("noteBrowserInput");
        searchNotes.addEventListener("click", () => {
            noteBrowserInput.classList.remove("hide");
            searchNotes.classList.add("hide");
            noteBrowserInput.focus();
            clearTooltip();
        });
        // if we unfocus the noteBrowserInput, hide it and show the search button again
        noteBrowserInput.addEventListener("blur", () => {
            noteBrowserInput.classList.add("hide");
            searchNotes.classList.remove("hide");
            clearTooltip();
        });
        noteBrowserInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                noteBrowserInput.blur();
            }
        });
        noteBrowserInput.addEventListener("input", async () => {
            const query = noteBrowserInput.value.trim();
            if (query === "") {
                this.generateCatagories();
                return;
            }
            const results = await this.searchEngine.search(query);
            // clear the existing catagories
            const noteBrowser = document.getElementById("note-browser-main");
            const catagories = noteBrowser.querySelectorAll("details");
            catagories.forEach(catagory => {
                catagory.remove();
            })
            // remove the hr's
            const hrs = noteBrowser.querySelectorAll("hr");
            hrs.forEach(hr => {
                hr.remove();
            });
            // add one for decoration
            const decorHr = document.createElement("hr");
            decorHr.style.margin = "0.5rem 0";
            decorHr.style.width = "50%";
            decorHr.style.marginLeft = "auto";
            decorHr.style.marginRight = "auto";
            noteBrowser.appendChild(decorHr);
            // create a new catagory for the search results
            const searchDetails = document.createElement("details");
            searchDetails.setAttribute("open", "");
            searchDetails.id = "Search Results";
            const searchSummary = document.createElement("summary");
            searchSummary.textContent = `Search Results (${results.length})`;
            searchDetails.appendChild(searchSummary);
            // add hr
            const hr = document.createElement("hr");
            hr.style.margin = "0.5rem 0";
            searchDetails.appendChild(hr);

            const searchFieldset = document.createElement("fieldset");
            searchFieldset.id = "note-browser-search-results";
            searchFieldset.classList.add("plain");
            searchDetails.appendChild(searchFieldset);
            // for each result, create a button in the searchFieldset
            for (const result of results) {
                const resultButton = document.createElement("button");
                resultButton.classList.add("nav-note");
                resultButton.textContent = result.key;
                // set the button's background color to the note's color
                if (result.color) {
                    resultButton.style.backgroundColor = result.color;
                } else {
                    resultButton.style.backgroundColor = "#cba778"; // default color
                }
                resultButton.addEventListener("click", () => {
                    this.goto(result.key);
                });
                searchFieldset.appendChild(resultButton);
            }
            noteBrowser.appendChild(searchDetails);
        });

        // 'go' button 
        // center camera on the note's region/tile, if applicable
        const goButton = document.getElementById("note-goto");
        goButton.addEventListener("click", () => {
            const tileRegex = /^(\d+)_(\d+)_(\d+)_(\d+)$/;
            const regionRegex = /^(\d+)_(\d+)$/;
            const marker = this.mapMaker.markers.find(item => item.note === this.mapMaker.currentNoteKey);
            if (tileRegex.test(this.mapMaker.currentNoteKey)) {
                this.mapMaker.TileEngine.centerCamera(this.mapMaker.currentNoteKey);
            }
            if (regionRegex.test(this.mapMaker.currentNoteKey)) {
                this.mapMaker.RegionEngine.centerCamera(this.mapMaker.currentNoteKey);
            }
            if (marker) {
                const viewportWidth = this.mapMaker.canvas.width / this.mapMaker.dpi;
                const viewportHeight = this.mapMaker.canvas.height / this.mapMaker.dpi;
                this.mapMaker.camera.x = marker.x - viewportWidth / (2 * this.mapMaker.camera.zoom);
                this.mapMaker.camera.y = marker.y - viewportHeight / (2 * this.mapMaker.camera.zoom);
            }
            clearTooltip();
        })
        this.generateCatagories();
    }
    goto(key, textareaId = null, textareaOwnerKey = key){
        this.mapMaker.currentNoteKey = key;
        showElms(document.querySelector("#notes > main"), "section.area", "displayAreaNote");
        showElms(document.querySelector("#notes > main #mainNoteControls"), "button", "note-browse", "note-edit", "note-remove");
        this.textareaOwnerKey = textareaOwnerKey;
        this.renderNote(this.mapMaker.notes[key]);
        this.textareaOwnerKey = null;
        if (textareaId) {
            document.getElementById(textareaId)?.focus();
        }
        // if this is a region or tile note, show the Go button
        const regex = /^(\d+)_(\d+)_(\d+)_(\d+)$/;
        const tileRegex = /^(\d+)_(\d+)$/;
        const marker = this.mapMaker.markers.find(item => item.note === key);
        if (regex.test(key) || tileRegex.test(key) || marker) {
            showElms(document.querySelector("#notes > main #mainNoteControls"), "button", "note-browse", "note-edit","note-goto");
        }

    }

    gotoMarker(marker) {
        const markerNote = this.mapMaker.notes[marker.note];
        const targetKey = markerNote?.goto;
        if (!targetKey) {
            this.goto(marker.note);
            return;
        }

        const targetMarkers = this.mapMaker.markers.filter(candidate =>
            this.mapMaker.notes[candidate.note]?.goto === targetKey
        );
        const targetIndex = targetMarkers.indexOf(marker);
        this.goto(targetKey, `${targetKey}-${targetIndex + 1}`, marker.note);
    }

    editTemplate(index) {
        const template = this.mapMaker.notes.templates?.[index];
        if (!template) return;

        this.editingTemplateIndex = index;
        document.getElementById("noteInput").value = template.html;
        this.resetNoteHistory(template.html);
        showElms(document.querySelector("#notes > main"), "section.area", "noteEdit");
        showElms(
            document.querySelector("#notes > main #mainNoteControls"),
            "button",
            "note-edit-back",
            "close-note-keyboard"
        );
        document.getElementById("noteInput").focus();
        clearTooltip();
    }
    /**
     * Expands paste tags using saved note variables.
     * @param {string} text - Note text containing paste tags.
     * @returns {string} Note text with variables expanded.
     */
    expandNoteVariables(text) {
        const pasteRegex = /<paste(?:\s+key=["']([^"']+)["'])?\s*>([\s\S]*?)<\/paste>/gi;
        const shortPasteRegex = /<paste\s+([^<>]+?)\s*\/?>/gi;

        let result = text;

        for (let pass = 0; pass < 10; pass++) {
            let changed = false;

            result = result.replace(pasteRegex, (match, attributeKey, content) => {
                const key = (attributeKey || content).trim();
                const variable = this.mapMaker.notes[`var_${key}`];

                if (variable === undefined) {
                    return match;
                }

                changed = true;
                return variable;
            });

            result = result.replace(shortPasteRegex, (match, key) => {
                const variable = this.mapMaker.notes[`var_${key.trim()}`];

                if (variable === undefined) {
                    return match;
                }

                changed = true;
                return variable;
            });

            if (!changed) {
                break;
            }
        }

        return result;
    }

    renderNote(note) {
        const existingStyles = document.querySelectorAll("style.note-style");
        existingStyles.forEach(style => style.remove());

        const displayArea = document.getElementById("noteDisplay");
        displayArea.innerHTML = "";

        const noteInput = document.getElementById("noteInput");
        noteInput.value = "";

        this.resetNoteHistory("");

        if (!note) return;

        noteInput.value = note.text;
        this.resetNoteHistory(note.text);

        const noteText = document.createElement("p");
        noteText.innerHTML = this.expandNoteVariables(note.text);
        displayArea.appendChild(noteText);

        const localValues = this.parseValueTags(noteText);
        const localKeywords = this.parseLocalKeywordTags(noteText);
        this.parseRandomTags(noteText, {
            ...localValues,
            ...localKeywords.values
        });
        this.parseNoteLayoutTags(noteText);
        this.parseNoteTextareas(noteText, note);
        this.parseDiceExpressions(noteText, {
            ...localValues,
            ...localKeywords.values
        });

        for (const { name, tooltip } of localKeywords.declarations) {
            this.linkNoteText(noteText, name, span => {
                addTooltip(span, tooltip);
            });
        }

        // I will go back later and make it O((Keywords+Globals)*1) instead of O((Keywords*Globals(global note text))*Note text) but for now this is fine.
        for (const keyword of this.mapMaker.notes["keywords"]) {
            this.linkNoteText(noteText, keyword.text, span => {
                span.dataset.keyword = keyword.id;
                span.style.color = keyword.color;
            });
        }

        for (const key in this.mapMaker.notes) {
            if (!key.startsWith("global_") && !key.startsWith("character_")) continue;

            const globalNote = this.mapMaker.notes[key];
            if (!globalNote) continue;

            const title = key.replace(/^(global_|character_)/, "");
            if (title === key) continue;
            if (!title) continue;

            this.linkNoteText(noteText, title, span => {
                span.dataset.globalNote = key;
                span.style.cursor = "pointer";
            });
        }

        noteText.querySelectorAll("[data-global-note]").forEach(span => {
            const key = span.dataset.globalNote;

            span.addEventListener("click", () => {
                this.goto(key);
            });
        });

        noteText.querySelectorAll("[data-keyword]").forEach(span => {
            const keyword = this.mapMaker.notes["keywords"].find(
                keyword => String(keyword.id) === span.dataset.keyword
            );

            if (!keyword) return;

            if (keyword.tooltip) {
                addTooltip(span, keyword.tooltip);
            }

            if (!keyword.goto) return;

            span.style.cursor = "pointer";
            span.addEventListener("click", () => {
                removeTooltip(span);
                this.goto(keyword.goto);
            });
        });

        const styleTag = noteText.querySelector("style");
        if (styleTag) {
            const style = document.createElement("style");
            style.innerHTML = styleTag.innerHTML;
            style.classList.add("note-style");
            document.head.appendChild(style);
        }
    }

    /**
     * Restores editable textarea values and saves changes to the current note.
     * Textarea ids or names provide stable keys for multiple fields in one note.
     *
     * @param {HTMLElement} container
     * @param {Object} note
     */
    parseNoteTextareas(container, note) {
        const textareas = container.querySelectorAll("textarea");
        if (!textareas.length) return;

        const noteKey = this.mapMaker.currentNoteKey || "note";
        const storageNote = this.mapMaker.notes[this.textareaOwnerKey || noteKey] || note;
        storageNote.textareas ??= {};
        textareas.forEach((textarea, index) => {
            textarea.classList.add("note-display-textarea");
            const listItem = textarea.closest("li");
            if (listItem) {
                textarea.classList.add("note-display-textarea-inline");
                listItem.classList.add("note-display-list-item");
                if (listItem.closest("ul, ol")) {
                    listItem.classList.add("note-display-list-item-marked");
                }
            }
            textarea.rows = 1;
            const legacyKey = textarea.id || textarea.name || `textarea-${index + 1}`;
            const key = `${noteKey}-${index + 1}`;
            textarea.id = key;
            const savedValue = storageNote.textareas[key] ?? storageNote.textareas[legacyKey];

            if (savedValue !== undefined) {
                textarea.value = savedValue;
            }

            const resizeTextarea = () => {
                textarea.style.height = "auto";
                textarea.style.height = `${textarea.scrollHeight}px`;
            };

            textarea.dataset.noteTextareaKey = key;
            resizeTextarea();
            textarea.addEventListener("input", resizeTextarea);
            textarea.addEventListener("input", () => {
                storageNote.textareas[key] = textarea.value;
            });

            if (textarea.classList.contains("note-display-textarea-inline")) {
                textarea.addEventListener("keydown", event => {
                    if (event.key !== "Enter") return;

                    const value = this.evaluateInlineMath(textarea.value);
                    if (value === textarea.value) return;

                    event.preventDefault();
                    textarea.value = value;
                    textarea.dispatchEvent(new Event("input", { bubbles: true }));
                });
            }
        });
    }

    /**
     * Converts note layout tags into styled display elements.
     *
     * @param {HTMLElement} container
     */
    parseNoteLayoutTags(container) {
        container.querySelectorAll("bhr").forEach(boldRule => {
            const rule = document.createElement("hr");
            rule.classList.add("note-bold-hr");
            boldRule.replaceWith(rule);
        });

        container.querySelectorAll("space").forEach(spaceTag => {
            const space = document.createElement("span");
            space.classList.add("note-space");
            space.setAttribute("aria-hidden", "true");
            spaceTag.replaceWith(space);
        });
    }

    /**
     * Resolves arithmetic modifiers such as "10 (+5)" in inline note fields.
     *
     * @param {string} text
     * @returns {string}
     */
    evaluateInlineMath(text) {
        const modifierPattern = /(\-?\d+(?:\.\d+)?)\s*\(\s*([+\-*/])\s*(\d+(?:\.\d+)?)\s*\)/g;
        let result = text;

        for (let pass = 0; pass < 100; pass++) {
            let changed = false;

            result = result.replace(modifierPattern, (match, base, operator, value) => {
                try {
                    const replacement = String(
                        this.diceRoller.evaluateArithmetic(`${base}${operator}${value}`)
                    );
                    changed = replacement !== match;
                    return replacement;
                } catch {
                    return match;
                }
            });

            if (!changed) break;
        }

        return result;
    }

    /**
     * Converts local value tags into text with a note-local tooltip.
     *
     * @param {HTMLElement} container
     */
    parseValueTags(container) {
        const values = {};

        container.querySelectorAll("value").forEach(valueTag => {
            const separator = valueTag.textContent.indexOf(":");
            if (separator === -1) return;

            const name = valueTag.textContent.slice(0, separator).trim();
            const value = valueTag.textContent.slice(separator + 1).trim();
            if (!name || !value) return;
            if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
                values[name] = Number(value);
            }

            const valueSpan = document.createElement("span");
            valueSpan.textContent = name;
            addTooltip(valueSpan, value);
            valueTag.replaceWith(valueSpan);
        });

        return values;
    }

    /**
     * Converts local keyword declarations and returns their numeric values.
     *
     * @param {HTMLElement} container
     */
    parseLocalKeywordTags(container) {
        const localKeywords = [];
        const values = {};

        container.querySelectorAll("keyword").forEach(keywordTag => {
            const separator = keywordTag.textContent.indexOf(":");
            if (separator === -1) return;

            const name = keywordTag.textContent.slice(0, separator).trim();
            const tooltip = keywordTag.textContent.slice(separator + 1).trim();
            if (!name || !tooltip) return;
            if (/^[+-]?\d+(?:\.\d+)?$/.test(tooltip)) {
                values[name] = Number(tooltip);
            }

            localKeywords.push({ name, tooltip });

            const keywordSpan = document.createElement("span");
            keywordSpan.textContent = name;
            addTooltip(keywordSpan, tooltip);
            keywordTag.replaceWith(keywordSpan);
        });

        return {
            values,
            declarations: localKeywords
        };
    }

    /**
     * Converts random tags into clickable values.
     * The first value is the initial display; the remaining values are choices.
     *
     * @param {HTMLElement} container
     */
    parseRandomTags(container, values = {}) {
        container.querySelectorAll("random").forEach(randomTag => {
            const tagValues = randomTag.textContent
                .split(",")
                .map(value => value.trim())
                .filter(Boolean);

            if (tagValues.length < 2) return;

            const defaultValue = tagValues[0];
            const rawOptions = tagValues.slice(1);
            const weightedOptions = rawOptions.map(option => {
                const match = option.match(/^([+]?(?:\d+(?:\.\d*)?|\.\d+))\s*:\s*(.+)$/);

                if (!match) return null;

                return {
                    weight: Number(match[1]),
                    value: match[2].trim()
                };
            });
            const useWeights = weightedOptions.every(option => option !== null) &&
                weightedOptions.some(option => option.weight > 0) &&
                weightedOptions.every(option => option.weight >= 0 && option.value);
            const options = useWeights
                ? weightedOptions
                : rawOptions.map(value => ({ value }));
            const optionLabel = option => useWeights
                ? `${option.weight}:${option.value}`
                : option.value;
            const selectOption = () => {
                if (!useWeights) {
                    return options[Math.floor(Math.random() * options.length)].value;
                }

                const totalWeight = options.reduce(
                    (total, option) => total + option.weight,
                    0
                );
                let roll = Math.random() * totalWeight;

                for (const option of options) {
                    roll -= option.weight;
                    if (roll < 0) return option.value;
                }

                return options.at(-1).value;
            };
            const randomSpan = document.createElement("span");
            randomSpan.dataset.randomTag = "";
            randomSpan.textContent = defaultValue;
            randomSpan.style.cursor = "pointer";
            addTooltip(randomSpan, `Options: ${options.map(optionLabel).join(", ")}`);
            randomSpan.addEventListener("click", event => {
                event.stopPropagation();
                randomSpan.textContent = selectOption();
                if (event.shiftKey) this.parseDiceExpressions(randomSpan, values);
                });

            randomTag.replaceWith(randomSpan);
        });
    }

    /**
     * Finds dice expressions in a note and makes them clickable.
     *
     * @param {HTMLElement} noteText
     */
    parseDiceExpressions(noteText, values = {}) {
        const walker = document.createTreeWalker(
            noteText,
            NodeFilter.SHOW_TEXT
        );

        const textNodes = [];

        while (walker.nextNode()) {
            const node = walker.currentNode;

            if (node.parentElement?.closest("textarea, [data-dice-expression]")) continue;
            textNodes.push(node);
        }

        for (const textNode of textNodes) {
            this.parseDiceTextNode(textNode, values);
        }
    }

	/**
	 * Converts dice expressions in a text node into clickable spans.
	 *
	 * @param {Text} textNode
	 */
    parseDiceTextNode(textNode, values = {}) {
		const dicePattern = /\[([^\]]+)\]/g;
		const text = textNode.nodeValue;
            const isRandomDice = Boolean(
                textNode.parentElement?.closest("[data-random-tag]")
            );

		if (!dicePattern.test(text)) {
			dicePattern.lastIndex = 0;
			return;
		}

		dicePattern.lastIndex = 0;

		const fragment = document.createDocumentFragment();
		let lastIndex = 0;
		let match;

		while ((match = dicePattern.exec(text)) !== null) {
			const expression = match[1].trim();

            if (!this.diceRollerExpressionIsValid(expression)) continue;

			fragment.appendChild(
				document.createTextNode(text.slice(lastIndex, match.index))
			);

			const diceSpan = document.createElement("span");
			diceSpan.dataset.diceExpression = expression;
			diceSpan.textContent = `[${this.formatDiceExpression(expression)}]`;
			diceSpan.style.cursor = "pointer";

            addTooltip(
                diceSpan,
                isRandomDice ? "Shift-click to roll" : "Click to roll"
            );

			diceSpan.addEventListener("click", event => {
                if (isRandomDice && !event.shiftKey) return;
                event.stopPropagation();
                this.rollNoteDice(diceSpan, expression, values);
			});

			fragment.appendChild(diceSpan);
			lastIndex = match.index + match[0].length;
		}

		if (lastIndex === 0) return;

		fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
		textNode.replaceWith(fragment);
	}

	/**
	 * Formats dice syntax for display without changing the source expression.
	 *
	 * @param {string} expression
	 * @returns {string}
	 */
	formatDiceExpression(expression) {
		return expression
			.replace(/\(\s*([+\-*/])\s*(\d+(?:\.\d+)?)\s*\)/g, "$1$2")
			.replace(
				/\(\s*(advantage|disadvantage|adv|dis|adv-all|dis-all)\s*\)/gi,
				"$1"
			)
			.replace(
				/\(\s*(advantage|disadvantage|adv|dis|adv-all|dis-all)\s+([+\-*/])\s*(\d+(?:\.\d+)?)\s*\)/gi,
				"$1 $2$3"
			);
	}

    /**
     * Checks whether text contains a dice expression.
     *
     * @param {string} expression
     * @returns {boolean}
     */
    diceRollerExpressionIsValid(expression) {
        return /\b\d*d\d+\b/i.test(expression);
    }

    /**
     * Rolls a dice expression from a note.
     *
     * @param {HTMLElement} span
     * @param {string} expression
     */
    rollNoteDice(span, expression, values = {}) {
        try {
            const result = this.diceRoller.roll(expression, values);
            const displayExpression = this.formatDiceExpression(expression);

            removeTooltip(span);
            addTooltip(span, result.breakdown);

            span.innerHTML = "";

            const expressionSpan = document.createElement("span");
            expressionSpan.textContent = `[${displayExpression}]`;

            const resultSpan = document.createElement("span");
            resultSpan.dataset.diceResult = "";
            resultSpan.textContent = ` → ${result.total}`;
            resultSpan.style.cursor = "pointer";

            resultSpan.addEventListener("click", event => {
                event.stopPropagation();
                this.hideDiceResult(span, expression);
            });

            span.appendChild(expressionSpan);
            span.appendChild(resultSpan);
        } catch (error) {
            console.error("Failed to roll dice expression:", expression, error);

            removeTooltip(span);
            addTooltip(span, error.message);

            span.innerHTML = "";

            const expressionSpan = document.createElement("span");
            expressionSpan.textContent = `[${this.formatDiceExpression(expression)}]`;

            const resultSpan = document.createElement("span");
            resultSpan.dataset.diceResult = "";
            resultSpan.textContent = " → Error";

            span.appendChild(expressionSpan);
            span.appendChild(resultSpan);
        }
    }

    /**
     * Hides a dice roll result and restores the normal expression display.
     *
     * @param {HTMLElement} span
     * @param {string} expression
     */
    hideDiceResult(span, expression) {
        removeTooltip(span);
        addTooltip(span, "Click to roll");

        span.innerHTML = "";
        span.textContent = `[${this.formatDiceExpression(expression)}]`;
    }
    
    /**
     * Finds text inside a note and replaces it with spans.
     *
     * @param {HTMLElement} container - The element containing the note text.
     * @param {string} searchText - The text to find.
     * @param {Function} setupSpan - Configures each generated span.
     */
    linkNoteText(container, searchText, setupSpan) {
        if (!searchText) return;

        const isWordCharacter = character => {
            if (!character) return false;
            return /[\p{L}\p{N}_]/u.test(character);
        };

        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT
        );

        const textNodes = [];

        while (walker.nextNode()) {
            if (walker.currentNode.parentElement.closest("textarea, span")) continue;
            textNodes.push(walker.currentNode);
        }

        for (const textNode of textNodes) {
            const text = textNode.nodeValue;
            const matches = [];
            let searchStart = 0;

            while (searchStart < text.length) {
                const index = text.indexOf(searchText, searchStart);

                if (index === -1) break;

                const before = text[index - 1];
                const after = text[index + searchText.length];

                const validStart = !isWordCharacter(before);
                const validEnd = !isWordCharacter(after);

                if (validStart && validEnd) {
                    matches.push({
                        start: index,
                        end: index + searchText.length
                    });
                }

                searchStart = index + searchText.length;
            }

            if (!matches.length) continue;

            const fragment = document.createDocumentFragment();
            let position = 0;

            for (const match of matches) {
                if (match.start > position) {
                    fragment.appendChild(
                        document.createTextNode(text.slice(position, match.start))
                    );
                }

                const span = document.createElement("span");
                span.textContent = text.slice(match.start, match.end);
                setupSpan(span);

                fragment.appendChild(span);
                position = match.end;
            }

            if (position < text.length) {
                fragment.appendChild(
                    document.createTextNode(text.slice(position))
                );
            }

            textNode.replaceWith(fragment);
        }
    }

    generateCatagories(...openCatagories){
        // if not in note browser, return
        const noteBrowser = document.getElementById("note-browser-main");
        const section = document.getElementById("noteBrowser");
        if (section.classList.contains("hide")) return;
        // clear the existing catagories
        const catagories = noteBrowser.querySelectorAll("details");
        catagories.forEach(catagory => {
            catagory.remove();
        });
        // remove the hr's
        const hrs = noteBrowser.querySelectorAll("hr");
        hrs.forEach(hr => {
            hr.remove();
        });
        function addHr(parent){
            const hr = document.createElement("hr");
            hr.style.margin = "0";
            hr.style.width = "50%";
            // center
            hr.style.marginLeft = "auto";
            hr.style.marginRight = "auto";
            parent.appendChild(hr);
        }
        // global
        function createCharacterNotesSection() {
            const globalDetails = document.createElement("details");
            if (openCatagories.includes("Character")) {
                globalDetails.setAttribute("open", "");
            }
            globalDetails.id = "Character";
            const globalSummary = document.createElement("summary");
            globalSummary.textContent = "Character notes";
            globalDetails.appendChild(globalSummary);
            const globalhr = document.createElement("hr");
            globalhr.style.margin = "0.5rem 0";
            globalDetails.appendChild(globalhr);
            const globalFieldset = document.createElement("fieldset");
            globalFieldset.id = "note-browser-global-notes";
            globalFieldset.classList.add("plain");
            globalDetails.appendChild(globalFieldset);
            // for each note with a key that starts with "character_", create a button in the globalFieldset
            let count = 0;
            for (const key in this.mapMaker.notes) {
                if (key.startsWith("character_")) {
                    count++;
                    const note = this.mapMaker.notes[key];
                    const button = document.createElement("button");
                    button.classList.add("nav-note");
                    button.textContent = key.replace("character_", "");
                    // set the button's background color to the note's color
                    if (note.color) {
                        button.style.backgroundColor = note.color;
                    } else {
                        button.style.backgroundColor = "#cba778"; // default color
                    }
                    button.addEventListener("click", () => {
                        this.goto(key);
                    });
                    globalFieldset.appendChild(button);
                }
            }
            // add a text input for the note title, hidden by default
            const noteTitleInput = document.createElement("textarea");
            noteTitleInput.id = "note-browser-title-input";
            noteTitleInput.placeholder = "Enter note title...";
            noteTitleInput.classList.add("note-title", "hide");
            noteTitleInput.addEventListener("blur", () => {
                // if the input is empty, hide it and show the add button again
                if (noteTitleInput.value.trim() === "") {
                    noteTitleInput.classList.add("hide");
                    const addCharacterButton = document.getElementById("note-browser-character-add");
                    addCharacterButton.classList.remove("hide");
                    return;
                }
                // create a new global note with the title as the key
                const key = "character_" + noteTitleInput.value.trim();
                this.mapMaker.notes[key] = {
                    "color": "#ff000033", // default color
                    "text": ""
                };
                this.goto(key);
                // hide the input and show the add button again
                noteTitleInput.classList.add("hide");
                const addCharacterButton = document.getElementById("note-browser-character-add");
                addCharacterButton.classList.remove("hide");
                // clear the input
                noteTitleInput.value = "";
                // regenerate the categories to show the new note
                this.generateCatagories();
            });
            // add an event listener for the enter key to blur the input
            noteTitleInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    noteTitleInput.blur();
                }
            });
            globalDetails.appendChild(noteTitleInput);
            if (count > 0) {
                const bottomHr = document.createElement("hr");
                bottomHr.style.margin = "0.5rem 0";
                globalDetails.appendChild(bottomHr);
            }
            // add a button to add a new global note
            const addGlobalButton = document.createElement("button");
            addGlobalButton.id = "note-browser-global-add";
            addGlobalButton.classList.add("nav-add");
            addTooltip(addGlobalButton, "Add a global note");
            addGlobalButton.textContent = "Add note";
            addGlobalButton.addEventListener("click", () => {
                // hide this button and show the note title input
                addGlobalButton.classList.add("hide");
                noteTitleInput.classList.remove("hide");
                noteTitleInput.focus();
            });
            globalDetails.appendChild(addGlobalButton);

            // append the globalDetails to the noteBrowser
            noteBrowser.appendChild(globalDetails);
        }
        function createGlobalNotesSection() {
            const globalDetails = document.createElement("details");
            if (openCatagories.includes("Global")) {
                globalDetails.setAttribute("open", "");
            }
            globalDetails.id = "Global";
            const globalSummary = document.createElement("summary");
            globalSummary.textContent = "Global notes";
            globalDetails.appendChild(globalSummary);
            const globalhr = document.createElement("hr");
            globalhr.style.margin = "0.5rem 0";
            globalDetails.appendChild(globalhr);
            const globalFieldset = document.createElement("fieldset");
            globalFieldset.id = "note-browser-global-notes";
            globalFieldset.classList.add("plain");
            globalDetails.appendChild(globalFieldset);
            // for each note with a key that starts with "global_", create a button in the globalFieldset
            let count = 0;
            for (const key in this.mapMaker.notes) {
                if (key.startsWith("global_")) {
                    count++;
                    const note = this.mapMaker.notes[key];
                    const button = document.createElement("button");
                    button.classList.add("nav-note");
                    button.textContent = key.replace("global_", "");
                    // set the button's background color to the note's color
                    if (note.color) {
                        button.style.backgroundColor = note.color;
                    } else {
                        button.style.backgroundColor = "#cba778"; // default color
                    }
                    button.addEventListener("click", () => {
                        this.goto(key);
                    });
                    globalFieldset.appendChild(button);
                }
            }
            // add a text input for the note title, hidden by default
            const noteTitleInput = document.createElement("textarea");
            noteTitleInput.id = "note-browser-title-input";
            noteTitleInput.placeholder = "Enter note title...";
            noteTitleInput.classList.add("note-title", "hide");
            noteTitleInput.addEventListener("blur", () => {
                // if the input is empty, hide it and show the add button again
                if (noteTitleInput.value.trim() === "") {
                    noteTitleInput.classList.add("hide");
                    const addGlobalButton = document.getElementById("note-browser-global-add");
                    addGlobalButton.classList.remove("hide");
                    return;
                }
                // create a new global note with the title as the key
                const key = "global_" + noteTitleInput.value.trim();
                this.mapMaker.notes[key] = {
                    "color": "#ff000033", // default color
                    "text": ""
                };
                this.goto(key);
                // hide the input and show the add button again
                noteTitleInput.classList.add("hide");
                const addGlobalButton = document.getElementById("note-browser-global-add");
                addGlobalButton.classList.remove("hide");
                // clear the input
                noteTitleInput.value = "";
                // regenerate the catagories to show the new note
                this.generateCatagories();
            });
            // add an event listener for the enter key to blur the input
            noteTitleInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    noteTitleInput.blur();
                }
            });
            globalDetails.appendChild(noteTitleInput);
            if (count > 0) {
                const bottomHr = document.createElement("hr");
                bottomHr.style.margin = "0.5rem 0";
                globalDetails.appendChild(bottomHr);
            }
            // add a button to add a new global note
            const addGlobalButton = document.createElement("button");
            addGlobalButton.id = "note-browser-global-add";
            addGlobalButton.classList.add("nav-add");
            addTooltip(addGlobalButton, "Add a global note");
            addGlobalButton.textContent = "Add note";
            addGlobalButton.addEventListener("click", () => {
                // hide this button and show the note title input
                addGlobalButton.classList.add("hide");
                noteTitleInput.classList.remove("hide");
                noteTitleInput.focus();
            });
            globalDetails.appendChild(addGlobalButton);

            // append the globalDetails to the noteBrowser
            noteBrowser.appendChild(globalDetails);
        }

        // keywords
        function createKeywordsSection() {
            const keywordsDetails = document.createElement("details");
            keywordsDetails.open = openCatagories.includes("Keywords");
            keywordsDetails.id = "Keywords";
            const keywordsSummary = document.createElement("summary");
            keywordsSummary.textContent = "Keywords";
            // add a tooltip to the summary
            addTooltip(keywordsSummary, "Color words in notes and add hover-tooltips");
            keywordsDetails.appendChild(keywordsSummary);
            const keywordsFieldset = document.createElement("fieldset");
            keywordsFieldset.id = "note-browser-keywords";
            keywordsFieldset.classList.add("one-column");
            keywordsFieldset.classList.add("plain");
            keywordsDetails.appendChild(keywordsFieldset);
            const hr = document.createElement("hr");
            hr.style.margin = "0.5rem 0";
            keywordsDetails.appendChild(hr);
            
            // display all keywords in this.mapMaker.notes["keywords"]
            for (const keyword of this.mapMaker.notes["keywords"]) {

                // base button that will toggle a feildset 
                const keywordButton = document.createElement("button");
                keywordButton.textContent = keyword.text;
                keywordButton.style.setProperty("color", "#332416", "important");
                keywordButton.style.marginTop = "0.5rem";
                // add a tooltip to the button
                addTooltip(keywordButton, keyword.tooltip);
                    
                // make the button's background color the keyword's color
                keywordButton.style.backgroundColor = keyword.color;
                // if the background color is too dark, make the text white, otherwise make it black
                const rgb = getRGB(keyword.color);
                if (rgb) {
                    const [r, g, b] = rgb;
                    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                    if (luminance < 0.5) {
                        keywordButton.style.setProperty("color", "#ffffff", "important");
                    } else {
                        keywordButton.style.setProperty("color", "#332416", "important");
                    }
                }

                // copy keyword on click, open/close
                keywordButton.style.width = "100%";
                keywordsDetails.appendChild(keywordButton);

                const keywordFieldset = document.createElement("fieldset");
                keywordFieldset.id = `browse-keyword-${keyword.id}-fieldset`;
                keywordFieldset.classList.add("keyword-grid");
                keywordFieldset.classList.add("hide");
                keywordFieldset.classList.add("plain");

                // first pure copy button
                const copyButton = document.createElement("button");
                copyButton.textContent = "Copy";
                copyButton.style.setProperty("grid-area", "copy");
                copyButton.addEventListener("click", () => {
                    navigator.clipboard.writeText(keyword.text);
                    // change the button text to "Copied!" for 1 second, then change it back
                    if (copyButton.textContent !== "Copied!") {
                        copyButton.textContent = "Copied!";
                        setTimeout(() => {
                            copyButton.textContent = "Copy";
                        }, 500);
                    }
                });
                keywordFieldset.appendChild(copyButton);

                const text = document.createElement("button");
                text.style.setProperty("grid-area", "name");
                text.textContent = keyword.text;
                text.style.setProperty("color", "#332416", "important");
                text.style.setProperty("background-color", "#f3e6cf", "important");
                text.style.color = keyword.color;
                const nameTextArea = document.createElement("textarea");
                text.addEventListener("click", () => {
                    text.classList.add("hide");
                    nameTextArea.classList.remove("hide");
                    nameTextArea.style.display = "block";
                    nameTextArea.focus();
                });
                nameTextArea.style.setProperty("grid-area", "name");
                nameTextArea.value = keyword.text;
                nameTextArea.classList.add("note-title");
                nameTextArea.classList.add("nameArea");
                nameTextArea.classList.add("hide");
                nameTextArea.addEventListener("input", () => {
                    keyword.text = nameTextArea.value;
                    text.textContent = nameTextArea.value;
                });
                nameTextArea.addEventListener("blur", () => {
                    nameTextArea.classList.add("hide");
                    text.classList.remove("hide");
                });
                nameTextArea.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        nameTextArea.blur();
                    }
                });
                keywordFieldset.appendChild(text);
                keywordFieldset.appendChild(nameTextArea);
                const [color, loadHandle] = createColorSlider(keywordFieldset, (newColor) => {
                    keyword.color = newColor;
                    text.style.color = newColor;
                    keywordButton.style.backgroundColor = newColor;
                }, false, keyword.color, undefined, undefined, false, true);
                color.style.setProperty("grid-area", "color");
                keywordFieldset.appendChild(color);
                const tooltip = document.createElement("textarea");
                tooltip.style.setProperty("grid-area", "tooltip");
                tooltip.value = keyword.tooltip;
                tooltip.classList.add("note-title")
                tooltip.addEventListener("input", () => {
                    keyword.tooltip = tooltip.value;
                });
                tooltip.addEventListener("blur", () => {
                    // update the tooltip on the keywordButton
                    const keywordButton = document.querySelector(`#note-browser-keywords button[tooltip="${keyword.tooltip}"]`);
                    if (keywordButton) {
                        addTooltip(keywordButton, keyword.tooltip);
                    }
                });
                tooltip.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        tooltip.blur();
                    }
                });
                keywordFieldset.appendChild(tooltip);
                // append the keywordFieldset to the keywordsDetails
                keywordsDetails.appendChild(keywordFieldset);

                // add a delete button to the keywordFieldset
                const deleteButton = document.createElement("button");
                deleteButton.textContent = "Delete";
                deleteButton.style.setProperty("grid-area", "delete");
                deleteButton.addEventListener("click", () => {
                    // remove the keyword from this.mapMaker.notes["keywords"]
                    const index = this.mapMaker.notes["keywords"].indexOf(keyword);
                    if (index > -1) {
                        this.mapMaker.notes["keywords"].splice(index, 1);
                    }
                    // regenerate the catagories to show the updated list
                    this.generateCatagories(...getOpenCatagories());
                });
                keywordFieldset.appendChild(deleteButton);

                keywordButton.addEventListener("click", () => {
                    const keywordFieldset = document.getElementById(`browse-keyword-${keyword.id}-fieldset`);
                    if (keywordFieldset.classList.contains("hide")) {
                        keywordFieldset.classList.remove("hide");
                        keywordButton.classList.add("keyword-button-open");
                        keywordButton.textContent = "Close";
                        removeTooltip(keywordButton);
                        keywordButton.style.setProperty("color", "#332416", "important");
                        // update color handle
                        loadHandle(keyword.color, false, false); 
                        
                    } else {
                        keywordFieldset.classList.add("hide");
                        keywordButton.classList.remove("keyword-button-open");
                        keywordButton.textContent = keyword.text;
                        addTooltip(keywordButton, keyword.tooltip);
                        const rgb = getRGB(keyword.color);
                        if (rgb) {
                            const [r, g, b] = rgb;
                            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                            if (luminance < 0.5) {
                                keywordButton.style.setProperty("color", "#ffffff", "important");
                            } else {
                                keywordButton.style.setProperty("color", "#332416", "important");
                            }
                        }
                    }
                });
                // add a button to go to that note in the note browser, if the keyword has a goto property
                const gotoButton = document.createElement("button");
                gotoButton.textContent = "Go to?";
                gotoButton.style.setProperty("grid-area", "goto-name");
                gotoButton.style.gridArea = "goto-name";
                gotoButton.addEventListener("click", () => {
                    if (keyword.goto) {
                        this.goto(keyword.goto);
                    }
                });
                keywordFieldset.appendChild(gotoButton);
                // add a 'goto' textArea to the keywordFieldset
                const gotoTextArea = document.createElement("textarea");
                gotoTextArea.style.setProperty("grid-area", "goto");
                gotoTextArea.placeholder = "Go here on click...";
                gotoTextArea.style.gridArea = "goto";
                gotoTextArea.value = keyword.goto || "";
                gotoTextArea.classList.add("note-title");
                gotoTextArea.addEventListener("input", () => {
                    // update keyword.goto
                    keyword.goto = gotoTextArea.value;
                });
                gotoTextArea.addEventListener("blur", () => {
                    // if the gotoTextArea is empty, remove the goto property from the keyword
                    if (gotoTextArea.value.trim() === "") {
                        delete keyword.goto;
                    }
                });
                gotoTextArea.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        gotoTextArea.blur();
                    }
                });
                keywordFieldset.appendChild(gotoTextArea);
            }
            // add a hr
            if (this.mapMaker.notes["keywords"].length > 0) {
                const bottomHr = document.createElement("hr");
                bottomHr.style.margin = "0.5rem 0";
                keywordsDetails.appendChild(bottomHr);
            }

            // add a button to add a new keyword
            const addKeywordButton = document.createElement("button");
            addKeywordButton.id = "note-browser-keywords-add";
            addKeywordButton.classList.add("nav-add");
            addTooltip(addKeywordButton, "Add a keyword");
            addKeywordButton.textContent = "Add keyword";
            addKeywordButton.addEventListener("click", () => {
                // create a new keyword with default values
                const newKeyword = {
                    id: Date.now(),
                    text: "New Keyword",
                    color: "#000000",
                    tooltip: "Tooltip"
                };
                this.mapMaker.notes["keywords"].push(newKeyword);
                // regenerate the catagories to show the new keyword
                this.generateCatagories(...getOpenCatagories());
            });
            keywordsDetails.appendChild(addKeywordButton);
            // append the keywordsDetails to the noteBrowser
            noteBrowser.appendChild(keywordsDetails);
        }

        function createTemplatesSection() {
            this.mapMaker.notes.templates ??= [];
            const templatesDetails = document.createElement("details");
            if (openCatagories.includes("Templates")) {
                templatesDetails.setAttribute("open", "");
            }
            templatesDetails.id = "Templates";

            const templatesSummary = document.createElement("summary");
            templatesSummary.textContent = "Templates";
            templatesDetails.appendChild(templatesSummary);

            const hr = document.createElement("hr");
            hr.style.margin = "0.5rem 0";
            templatesDetails.appendChild(hr);

            const templatesFieldset = document.createElement("fieldset");
            templatesFieldset.id = "note-browser-templates";
            templatesFieldset.classList.add("one-column", "plain");

            const copyTemplate = async (template, copyButton) => {
                try {
                    await navigator.clipboard.writeText(template.html);
                } catch {
                    const copyInput = document.createElement("textarea");
                    copyInput.value = template.html;
                    copyInput.style.position = "fixed";
                    copyInput.style.opacity = "0";
                    document.body.appendChild(copyInput);
                    copyInput.select();
                    document.execCommand("copy");
                    copyInput.remove();
                }

                copyButton.textContent = "Copied!";
                setTimeout(() => {
                    copyButton.textContent = `Copy ${template.name}`;
                }, 1200);
            };

            const appendTemplate = (template, removable, templateIndex) => {
                const actionRow = document.createElement("div");
                actionRow.classList.add("template-action-row");

                const copyButton = document.createElement("button");
                copyButton.classList.add("nav-note");
                copyButton.textContent = `Copy ${template.name}`;
                copyButton.addEventListener("click", () => copyTemplate(template, copyButton));
                actionRow.appendChild(copyButton);

                if (removable) {
                    const editButton = document.createElement("button");
                    editButton.classList.add("template-edit");
                    editButton.textContent = "Edit";
                    editButton.addEventListener("click", () => {
                        this.editTemplate(templateIndex);
                    });
                    actionRow.appendChild(editButton);

                    const removeButton = document.createElement("button");
                    removeButton.classList.add("template-remove");
                    removeButton.textContent = "Remove";
                    removeButton.addEventListener("click", () => {
                        this.mapMaker.notes.templates.splice(templateIndex, 1);
                        this.generateCatagories("Templates");
                    });
                    actionRow.appendChild(removeButton);
                }

                templatesFieldset.appendChild(actionRow);
            };

            NOTE_TEMPLATES.forEach(template => {
                appendTemplate(template, false);
            });
            this.mapMaker.notes.templates.forEach((template, index) => {
                appendTemplate(template, true, index);
            });

            templatesDetails.appendChild(templatesFieldset);

            const templateName = document.createElement("textarea");
            templateName.classList.add("note-title", "hide");
            templateName.placeholder = "Template name...";
            templateName.rows = 1;

            const templateHtml = document.createElement("textarea");
            templateHtml.classList.add("note-title", "hide");
            templateHtml.placeholder = "Template HTML...";
            templateHtml.rows = 5;

            const saveTemplateButton = document.createElement("button");
            saveTemplateButton.classList.add("nav-add", "hide");
            saveTemplateButton.textContent = "Save template";
            saveTemplateButton.addEventListener("click", () => {
                const name = templateName.value.trim();
                const html = templateHtml.value;
                if (!name || !html.trim()) return;

                this.mapMaker.notes.templates.push({ name, html });
                this.generateCatagories("Templates");
            });

            const cancelTemplateButton = document.createElement("button");
            cancelTemplateButton.classList.add("nav-add", "hide");
            cancelTemplateButton.textContent = "Cancel";
            cancelTemplateButton.addEventListener("click", () => {
                templateName.value = "";
                templateHtml.value = "";
                templateName.classList.add("hide");
                templateHtml.classList.add("hide");
                saveTemplateButton.classList.add("hide");
                cancelTemplateButton.classList.add("hide");
                addTemplateButton.classList.remove("hide");
            });

            const addTemplateButton = document.createElement("button");
            addTemplateButton.classList.add("nav-add");
            addTemplateButton.textContent = "Add template";
            addTemplateButton.addEventListener("click", () => {
                addTemplateButton.classList.add("hide");
                templateName.classList.remove("hide");
                templateHtml.classList.remove("hide");
                saveTemplateButton.classList.remove("hide");
                cancelTemplateButton.classList.remove("hide");
                templateName.focus();
            });

            templatesDetails.appendChild(templateName);
            templatesDetails.appendChild(templateHtml);
            templatesDetails.appendChild(saveTemplateButton);
            templatesDetails.appendChild(cancelTemplateButton);
            templatesDetails.appendChild(addTemplateButton);
            noteBrowser.appendChild(templatesDetails);
        }

        function getTileNotesSection() {
            const details = document.createElement("details");
            if (openCatagories.includes("Tile Notes")) {
                details.setAttribute("open", "");
            }
            details.id = "Tile Notes";
            const summary = document.createElement("summary");
            summary.textContent = "Tile Notes";
            details.appendChild(summary);
            // add hr
            const hr = document.createElement("hr");
            hr.style.margin = "0.5rem 0";
            details.appendChild(hr);
            const fieldset = document.createElement("fieldset");
            fieldset.id = "note-browser-tile-notes";
            fieldset.classList.add("plain");
            details.appendChild(fieldset);
            // for each note in the format of "rx_ry_lx_ly", create a button in the fieldset
            for (const key in this.mapMaker.notes) {
                if (/^\d+_\d+_\d+_\d+$/.test(key)) {
                    const note = this.mapMaker.notes[key];
                    const button = document.createElement("button");
                    button.classList.add("nav-note");
                    button.textContent = key;
                    // set the button's background color to the note's color
                    if (note.color) {
                        button.style.backgroundColor = note.color;
                    } else {
                        button.style.backgroundColor = "#cba778"; // default color
                    }
                    // change text color based on the background color's luminance
                    const rgb = getRGB(note.color);
                    if (rgb) {
                        const [r, g, b] = rgb;
                        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                        if (luminance < 0.5) {
                            button.style.setProperty("color", "#ffffff", "important");
                        } else {
                            button.style.setProperty("color", "#332416", "important");
                        }
                    }
                    button.addEventListener("click", () => {
                        this.goto(key);
                    });
                    fieldset.appendChild(button);
                }
            }
            noteBrowser.appendChild(details);
        }

        function getRegionNotesSection() {
            const details = document.createElement("details");
            if (openCatagories.includes("Region Notes")) {
                details.setAttribute("open", "");
            }
            details.id = "Region Notes";
            const summary = document.createElement("summary");
            summary.textContent = "Region Notes";
            details.appendChild(summary);
            // add hr
            const hr = document.createElement("hr");
            hr.style.margin = "0.5rem 0";
            details.appendChild(hr);
            const fieldset = document.createElement("fieldset");
            fieldset.id = "note-browser-region-notes";
            fieldset.classList.add("plain");
            details.appendChild(fieldset);
            // for each note in the format of "rx_ry", create a button in the fieldset
            for (const key in this.mapMaker.notes) {
                if (/^\d+_\d+$/.test(key)) {
                    const note = this.mapMaker.notes[key];
                    const button = document.createElement("button");
                    button.classList.add("nav-note");
                    button.textContent = key;
                    // set the button's background color to the note's color
                    if (note.color) {
                        button.style.backgroundColor = note.color;
                    } else {
                        button.style.backgroundColor = "#cba778"; // default color
                    }
                    // change text color based on the background color's luminance
                    const rgb = getRGB(note.color);
                    if (rgb) {
                        const [r, g, b] = rgb;
                        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                        if (luminance < 0.5) {
                            button.style.setProperty("color", "#ffffff", "important");
                        } else {
                            button.style.setProperty("color", "#332416", "important");
                        }
                    }
                    button.addEventListener("click", () => {
                        this.goto(key);
                    });
                    fieldset.appendChild(button);
                }
            }
            noteBrowser.appendChild(details);
        }

        function getMarkerNotesSection() {
            const markersDetails = document.createElement("details");
            markersDetails.open = openCatagories.includes("Markers");
            markersDetails.id = "Markers";
            const markersSummary = document.createElement("summary");
            markersSummary.textContent = "Markers";
            addTooltip(markersSummary, "Named map markers with notes and teleport locations");
            markersDetails.appendChild(markersSummary);

            const markersFieldset = document.createElement("fieldset");
            markersFieldset.id = "note-browser-markers";
            markersFieldset.classList.add("one-column", "plain");
            markersDetails.appendChild(markersFieldset);

            for (const marker of this.mapMaker.markers) {
                const key = marker.note;
                const note = this.mapMaker.notes[key] ||= {
                    text: "Marker",
                    color: marker.color || "#ffff00cc"
                };
                const createMarkerPreview = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = 48;
                    canvas.height = 48;
                    canvas.style.width = "48px";
                    canvas.style.height = "48px";
                    canvas.style.justifySelf = "center";
                    canvas.style.alignSelf = "center";
                    canvas.style.backgroundColor = "#cba778";
                    const previewContext = canvas.getContext("2d");
                    previewContext.fillStyle = note.color || marker.color || "#ffff00cc";
                    previewContext.beginPath();
                    previewContext.moveTo(24, 4);
                    previewContext.lineTo(44, 24);
                    previewContext.lineTo(24, 44);
                    previewContext.lineTo(4, 24);
                    previewContext.closePath();
                    previewContext.fill();
                    previewContext.fillStyle = "rgba(0, 0, 0, 0.45)";
                    previewContext.beginPath();
                    previewContext.moveTo(24, 14);
                    previewContext.lineTo(34, 24);
                    previewContext.lineTo(24, 34);
                    previewContext.lineTo(14, 24);
                    previewContext.closePath();
                    previewContext.fill();
                    return canvas;
                };
                const markerButton = document.createElement("button");
                markerButton.appendChild(createMarkerPreview());
                markerButton.style.width = "100%";
                markerButton.style.marginTop = "0.5rem";
                markerButton.style.backgroundColor = "#cba778";
                addTooltip(markerButton, note.text || "Marker");
                markersDetails.appendChild(markerButton);

                const markerFieldset = document.createElement("fieldset");
                markerFieldset.id = `browse-marker-${key}-fieldset`;
                markerFieldset.classList.add("keyword-grid", "hide", "plain");

                const teleportButton = document.createElement("button");
                teleportButton.textContent = "Teleport";
                teleportButton.style.gridArea = "copy";
                teleportButton.addEventListener("click", () => {
                    this.mapMaker.currentNoteKey = key;
                    const viewportWidth = this.mapMaker.canvas.width / this.mapMaker.dpi;
                    const viewportHeight = this.mapMaker.canvas.height / this.mapMaker.dpi;
                    this.mapMaker.camera.x = marker.x - viewportWidth / (2 * this.mapMaker.camera.zoom);
                    this.mapMaker.camera.y = marker.y - viewportHeight / (2 * this.mapMaker.camera.zoom);
                    clearTooltip();
                });
                markerFieldset.appendChild(teleportButton);

                let preview = createMarkerPreview();
                preview.style.gridArea = "name";
                markerFieldset.appendChild(preview);
                const nameTextArea = document.createElement("textarea");
                nameTextArea.value = note.text || "Marker";
                nameTextArea.placeholder = "Marker name...";
                nameTextArea.classList.add("note-title");
                nameTextArea.style.gridArea = "tooltip";
                nameTextArea.addEventListener("input", () => {
                    note.text = nameTextArea.value;
                    removeTooltip(markerButton);
                    addTooltip(markerButton, nameTextArea.value || "Marker");
                });
                markerFieldset.appendChild(nameTextArea);

                const [color, loadHandle] = createColorSlider(markerFieldset, (newColor) => {
                    note.color = newColor;
                    marker.color = newColor;
                    const updatedPreview = createMarkerPreview();
                    updatedPreview.style.gridArea = "name";
                    preview.replaceWith(updatedPreview);
                    preview = updatedPreview;
                    this.mapMaker.draw();
                }, false, note.color || marker.color, undefined, undefined, false, true);
                color.style.gridArea = "color";
                markerFieldset.appendChild(color);

                const gotoButton = document.createElement("button");
                gotoButton.textContent = "Go to?";
                gotoButton.style.gridArea = "goto-name";
                gotoButton.addEventListener("click", () => {
                    if (note.goto) this.gotoMarker(marker);
                });
                markerFieldset.appendChild(gotoButton);

                const gotoTextArea = document.createElement("textarea");
                gotoTextArea.value = note.goto || "";
                gotoTextArea.placeholder = "Go here on click...";
                gotoTextArea.classList.add("note-title");
                gotoTextArea.style.gridArea = "goto";
                gotoTextArea.addEventListener("input", () => {
                    note.goto = gotoTextArea.value;
                });
                gotoTextArea.addEventListener("blur", () => {
                    if (!gotoTextArea.value.trim()) delete note.goto;
                });
                markerFieldset.appendChild(gotoTextArea);

                const deleteButton = document.createElement("button");
                deleteButton.textContent = "Delete";
                deleteButton.style.gridArea = "delete";
                deleteButton.addEventListener("click", () => {
                    const index = this.mapMaker.markers.indexOf(marker);
                    if (index > -1) this.mapMaker.markers.splice(index, 1);
                    delete this.mapMaker.notes[key];
                    this.generateCatagories(...getOpenCatagories());
                });
                markerFieldset.appendChild(deleteButton);
                markersDetails.appendChild(markerFieldset);

                markerButton.addEventListener("click", () => {
                    if (markerFieldset.classList.contains("hide")) {
                        markerFieldset.classList.remove("hide");
                        markerButton.replaceChildren(document.createTextNode("Close"));
                        removeTooltip(markerButton);
                        loadHandle(note.color || marker.color, false, false);
                    } else {
                        markerFieldset.classList.add("hide");
                        markerButton.replaceChildren(createMarkerPreview());
                        addTooltip(markerButton, note.text || "Marker");
                    }
                });
            }
            noteBrowser.appendChild(markersDetails);
        }

        function getGroupNotesSection() {
            const details = document.createElement("details");
            if (openCatagories.includes("Group Notes")) {
                details.setAttribute("open", "");
            }
            details.id = "Group Notes";
            const summary = document.createElement("summary");
            summary.textContent = "Group Notes";
            details.appendChild(summary);
            // add hr
            const hr = document.createElement("hr");
            hr.style.margin = "0.5rem 0";
            details.appendChild(hr);
            const fieldset = document.createElement("fieldset");
            fieldset.id = "note-browser-group-notes";
            fieldset.classList.add("plain");
            details.appendChild(fieldset);
            // for each note in the format of "group_*", create a button in the fieldset
            for (const key in this.mapMaker.notes) {
                if (/^group_/.test(key)) {
                    const note = this.mapMaker.notes[key];
                    const button = document.createElement("button");
                    button.classList.add("nav-note");
                    button.textContent = key.replace("group_", "");
                    // set the button's background color to the note's color
                    if (note.color) {
                        button.style.backgroundColor = note.color;
                    } else {
                        button.style.backgroundColor = "#cba778"; // default color
                    }
                    // change text color based on the background color's luminance
                    const rgb = getRGB(note.color);
                    if (rgb) {
                        const [r, g, b] = rgb;
                        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                        if (luminance < 0.5) {
                            button.style.setProperty("color", "#ffffff", "important");
                        } else {
                            button.style.setProperty("color", "#332416", "important");
                        }
                    }
                    button.addEventListener("click", () => {
                        this.goto(key);
                    });
                    fieldset.appendChild(button);
                }
            }
            noteBrowser.appendChild(details);
        }
        function getAnnotatedNotesSection() {
            const details = document.createElement("details");
            if (openCatagories.includes("annotations")) {
                details.setAttribute("open", "");
            }
            details.id = "Drawings";
            const summary = document.createElement("summary");
            summary.textContent = "Scribble notes";
            details.appendChild(summary);
            // add hr
            const hr = document.createElement("hr");
            hr.style.margin = "0.5rem 0";
            details.appendChild(hr);
            const fieldset = document.createElement("fieldset");
            fieldset.id = "note-browser-annotated-notes";
            fieldset.classList.add("plain");
            details.appendChild(fieldset);
            // for each note in the format of "annotation_*", create a button in the fieldset
            for (const annotation of this.mapMaker.annotations) {
                const key = annotation.key;
                const button = document.createElement("button");
                button.style.height = "5rem";
                button.classList.add("nav-note");

                const canvas = document.createElement("canvas");
                canvas.width = 50;
                canvas.height = 50;

                const ctx = canvas.getContext("2d");
                // fill with black
                ctx.fillStyle = "#000000";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = annotation.color || "#cba778";
                ctx.lineWidth = 2;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";

                const width = Math.max(annotation.right - annotation.left, 1);
                const height = Math.max(annotation.bottom - annotation.top, 1);
                const scale = Math.min(46 / width, 46 / height);

                const offsetX = (50 - width * scale) / 2;
                const offsetY = (50 - height * scale) / 2;

                ctx.beginPath();

                for (let i = 0; i < annotation.points.length; i++) {
                    const point = annotation.points[i];
                    const x = (point.x - annotation.left) * scale + offsetX;
                    const y = (point.y - annotation.top) * scale + offsetY;

                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }

                ctx.stroke();
                button.style.backgroundColor = "#000000";
                button.style.backgroundImage = `url(${canvas.toDataURL()})`;
                button.style.backgroundSize = "contain";
                button.style.backgroundPosition = "center";
                button.style.backgroundRepeat = "no-repeat";

                const rgb = getRGB(annotation.color);

                if (rgb) {
                    const [r, g, b] = rgb;
                    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                    button.style.setProperty(
                        "color",
                        luminance < 0.5 ? "#ffffff" : "#332416",
                        "important"
                    );
                }

                button.addEventListener("click", () => {
                    this.goto(key);
                });

                fieldset.appendChild(button);
            }
            noteBrowser.appendChild(details);
        }

        createGlobalNotesSection.call(this);
        addHr(noteBrowser);
        createCharacterNotesSection.call(this);
        addHr(noteBrowser);
        createKeywordsSection.call(this);
        addHr(noteBrowser);
        createTemplatesSection.call(this);
        // show tile notes if we have any, otherwise show region notes
        if (Object.keys(this.mapMaker.notes).some(key => /^\d+_\d+_\d+_\d+$/.test(key))) {
            return; // early returning this catagory for lag; will make toggleable when I add a settings menu 
            addHr(noteBrowser);
            getTileNotesSection.call(this);
        } 
        if (Object.keys(this.mapMaker.notes).some(key => /^\d+_\d+$/.test(key))) {
            addHr(noteBrowser);
            getRegionNotesSection.call(this);
        }
        if (Object.keys(this.mapMaker.notes).some(key => /^group_/.test(key))) {
            addHr(noteBrowser);
            getGroupNotesSection.call(this);
        }
        if (Object.keys(this.mapMaker.notes).some(key => /^marker_/.test(key))) {
            addHr(noteBrowser);
            getMarkerNotesSection.call(this);
        }
        if (Object.keys(this.mapMaker.notes).some(key => /^scribble_/.test(key))) {
            addHr(noteBrowser);
            getAnnotatedNotesSection.call(this);
        }
    }
}

/**
 * Shows the specified elements in the container.
 * @param {*} container 
 * @param {*} selector 
 * @param  {...any} ids 
 */
function showElms(container,cssSelector,...ids){
    const elements = container.querySelectorAll(cssSelector);
    // hide all elements
    elements.forEach(element => {
        element.classList.add('hide');
    });
    // show the specified elements
    ids.forEach(id => {
        if (id === "") return; // skip empty ids
        const element = container.querySelector(`#${id}`);
        if (element) {
            element.classList.remove('hide');
        }
    });
}
function getOpenCatagories(){
    const openCatagories = [];
    const details = document.querySelectorAll("#noteBrowser details");
    details.forEach(detail => {
        if (detail.hasAttribute("open")) {
            openCatagories.push(detail.id);
        }
    });
    return openCatagories;
}
/**
 * Creates a color selection slider.
 * @param {HTMLElement} container - Container to append the slider to.
 * @param {(color: string) => void} onChange - Callback fired when the selected color changes.
 * @param {boolean} alpha - Whether to include an alpha gradient.
 * @param {string} initialColor - Initial color used to position the handle.
 * @param {string} width - Optional CSS width.
 * @param {string} height - Optional CSS height.
 * @param {boolean} grayScale - Whether to use a linear white-to-black grayscale gradient.
 * @returns {[HTMLElement, (color?: string) => void]} Slider wrapper and handle loader.
 */
/**
 * Creates a color selection slider.
 * @param {HTMLElement} container - Container to append the slider to.
 * @param {(color: string) => void} onChange - Callback fired when the selected color changes.
 * @param {boolean} alpha - Whether to include an alpha gradient.
 * @param {string} initialColor - Initial color used to position the handle.
 * @param {string} width - Optional CSS width.
 * @param {string} height - Optional CSS height.
 * @param {boolean} grayScale - Whether to use a linear white-to-black grayscale gradient.
 * @param {boolean} hexInput - Whether to show the editable hex input.
 * @returns {[HTMLElement, (color?: string, alpha?: boolean, grayScale?: boolean) => void]} Slider wrapper and handle loader.
 */
export function createColorSlider(container, onChange, alpha = false, initialColor = "#ff0000", width, height, grayScale = false, hexInput = false) {
	const wrapper = document.createElement("div");
	wrapper.classList.add("color-slider-wrapper");

	const canvas = document.createElement("canvas");
	canvas.width = 20;
	canvas.height = 20;

	if (width) {
		canvas.style.width = width;
	}

	if (height) {
		canvas.style.height = height;
	}

	canvas.style.cursor = "pointer";
	canvas.style.display = "block";
	canvas.id = `color-slider-canvas+${Math.random().toString(36).substring(2, 15)}`;
	canvas.style.boxSizing = "border-box";
	canvas.classList.add("color-slider");

	const handle = document.createElement("div");
	handle.classList.add("color-slider-handle");

    const colorInput = document.createElement("input");
    colorInput.type = "text";
    colorInput.classList.add("color-slider-input");
    colorInput.inputMode = "text";
    colorInput.maxLength = 9;
    colorInput.spellcheck = false;
    colorInput.setAttribute("aria-label", "Hex color");
    colorInput.hidden = !hexInput;

	const ctx = canvas.getContext("2d");
    const hexColorPattern = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;

    function colorToHex(color) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = 1;
        tempCanvas.height = 1;
        const tempCtx = tempCanvas.getContext("2d");
        tempCtx.fillStyle = color;
        tempCtx.fillRect(0, 0, 1, 1);
        const pixel = tempCtx.getImageData(0, 0, 1, 1).data;
        const hex = [...pixel].map(value => value.toString(16).padStart(2, "0"));
        return pixel[3] === 255 ? `#${hex.slice(0, 3).join("")}` : `#${hex.join("")}`;
    }

    function setColorInput(color) {
        colorInput.value = colorToHex(color);
        colorInput.classList.remove("invalid");
    }

	function drawGradient(currentAlpha = alpha, currentGrayScale = grayScale) {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.globalCompositeOperation = "source-over";

		if (currentGrayScale) {
			const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
			gradient.addColorStop(0, "rgb(255, 255, 255)");
			gradient.addColorStop(1, "rgb(0, 0, 0)");

			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			if (currentAlpha) {
				const alphaGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
				alphaGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
				alphaGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

				ctx.fillStyle = alphaGradient;
				ctx.globalCompositeOperation = "destination-in";
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.globalCompositeOperation = "source-over";
			}

			return;
		}

		const centerValue = 0.5;

		if (!currentAlpha) {
			const brightnessGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
			brightnessGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
			brightnessGradient.addColorStop(centerValue / 2, "rgba(255, 255, 255, 0.3)");
			brightnessGradient.addColorStop(centerValue, "rgba(128, 128, 128, 0)");
			brightnessGradient.addColorStop(1, "rgba(0, 0, 0, 1)");
			brightnessGradient.addColorStop(1 - (1 - centerValue) / 2, "rgba(0, 0, 0, 0.6)");

			ctx.fillStyle = brightnessGradient;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.globalCompositeOperation = "color";
		}

		const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);

		for (let i = 0; i <= 360; i++) {
			gradient.addColorStop(i / 360, `hsl(${i}, 100%, 50%)`);
		}

		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		if (currentAlpha) {
			const alphaGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
			alphaGradient.addColorStop(0, "rgba(0, 0, 0, 1)");
			alphaGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

			ctx.fillStyle = alphaGradient;
			ctx.globalCompositeOperation = "destination-in";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}

		ctx.globalCompositeOperation = "source-over";
	}

	function getPosition(event) {
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;

		const displayX = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
		const displayY = Math.max(0, Math.min(event.clientY - rect.top, rect.height));

		return {
			x: Math.min(canvas.width - 1, Math.floor(displayX * scaleX)),
			y: Math.min(canvas.height - 1, Math.floor(displayY * scaleY)),
			displayX,
			displayY
		};
	}

	function updateColor(event, currentAlpha = alpha, currentGrayScale = grayScale) {
		const position = getPosition(event);

		if (!currentGrayScale) {
			const hue = position.x / (canvas.width - 1) * 360;
			const snapDistance = 8;
			const snapHues = [0, 60, 120, 180, 240, 300];

			let snappedHue = hue;

			for (const snapHue of snapHues) {
				const distance = Math.abs(hue - snapHue);

				if (distance <= snapDistance) {
					snappedHue = snapHue;
					break;
				}
			}

			if (snappedHue !== hue) {
				position.x = Math.round(snappedHue / 360 * (canvas.width - 1));
				position.displayX = position.x / canvas.width * canvas.getBoundingClientRect().width;
			}
		}

		const imageData = ctx.getImageData(position.x, position.y, 1, 1).data;
		const color = `rgba(${imageData[0]}, ${imageData[1]}, ${imageData[2]}, ${imageData[3] / 255})`;

		handle.style.left = `${position.displayX}px`;
		handle.style.top = `${position.displayY}px`;
		handle.style.background = color;
        setColorInput(color);

		onChange(color);
	}

	drawGradient();

	let isDragging = false;

	canvas.addEventListener("pointerdown", (event) => {
		isDragging = true;
		canvas.setPointerCapture(event.pointerId);
		updateColor(event);
	});

	canvas.addEventListener("pointermove", (event) => {
		if (isDragging) {
			updateColor(event);
		}
	});

	canvas.addEventListener("pointerup", (event) => {
		isDragging = false;
		canvas.releasePointerCapture(event.pointerId);
	});

	canvas.addEventListener("pointercancel", () => {
		isDragging = false;
	});

    colorInput.addEventListener("input", () => {
        const color = colorInput.value.trim();
        const normalizedColor = color.startsWith("#") ? color : `#${color}`;
        const isValid = hexColorPattern.test(normalizedColor);
        colorInput.classList.toggle("invalid", !isValid);
        if (isValid) {
            onChange(normalizedColor);
            loadHandle(normalizedColor, alpha, grayScale, false);
        }
    });

    colorInput.addEventListener("blur", () => {
        const color = colorInput.value.trim();
        const normalizedColor = color.startsWith("#") ? color : `#${color}`;
        colorInput.value = normalizedColor;
        colorInput.classList.toggle("invalid", !hexColorPattern.test(normalizedColor));
    });

    colorInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            colorInput.blur();
        }
    });

    wrapper.append(canvas, handle, colorInput);
	container.appendChild(wrapper);
    setColorInput(initialColor);

	/**
	 * Gets the Y-axis curve for positioning the handle.
	 * @param {boolean} currentAlpha - Whether alpha mode is enabled.
	 * @param {boolean} currentGrayScale - Whether grayscale mode is enabled.
	 * @returns {{x: number[][], y: number[][]}} Gradient curves.
	 */
	function getGradientCurves(currentAlpha, currentGrayScale) {
		if (currentGrayScale) {
			return {
				x: [[0, 1], [1, 0]],
				y: currentAlpha ? [[0, 1], [1, 0]] : [[0, 1]]
			};
		}

		const centerValue = 0.5;

		return {
			x: [[0, 0], [1, 360]],
			y: currentAlpha
				? [[0, 1], [1, 0]]
				: [
					[0, 1],
					[centerValue / 2, 0.65],
					[centerValue, 0.5],
					[1 - (1 - centerValue) / 2, 0.2],
					[1, 0]
				]
		};
	}

	/**
	 * Positions the handle using a color and slider mode.
	 * @param {string} color - Color to position the handle for.
	 * @param {boolean} currentAlpha - Whether alpha mode is enabled.
	 * @param {boolean} currentGrayScale - Whether grayscale mode is enabled.
	 */
    function loadHandle(color = initialColor, currentAlpha = alpha, currentGrayScale = grayScale, updateInput = true) {
        if (updateInput) {
            setColorInput(color);
        }
		requestAnimationFrame(() => {
			drawGradient(currentAlpha, currentGrayScale);

			const rect = canvas.getBoundingClientRect();
			const curves = getGradientCurves(currentAlpha, currentGrayScale);

			const tempCanvas = document.createElement("canvas");
			tempCanvas.width = 1;
			tempCanvas.height = 1;

			const tempCtx = tempCanvas.getContext("2d");
			tempCtx.fillStyle = color;
			tempCtx.fillRect(0, 0, 1, 1);

			const pixel = tempCtx.getImageData(0, 0, 1, 1).data;
			const hsla = rgbaToHsla(pixel[0], pixel[1], pixel[2], pixel[3] / 255);

			let x;

			if (currentGrayScale) {
				const brightness = (pixel[0] + pixel[1] + pixel[2]) / (255 * 3);
				x = (1 - brightness) * rect.width;
			} else {
				x = hsla[0] / 360 * rect.width;
			}

			const lightness = currentAlpha ? hsla[3] : hsla[2];

			let normalizedY = 0;

			if (curves.y.length > 1) {
				for (let i = 0; i < curves.y.length - 1; i++) {
					const [y1, value1] = curves.y[i];
					const [y2, value2] = curves.y[i + 1];

					const minValue = Math.min(value1, value2);
					const maxValue = Math.max(value1, value2);

					if (lightness < minValue || lightness > maxValue) {
						continue;
					}

					const t = (lightness - value1) / (value2 - value1);
					normalizedY = y1 + t * (y2 - y1);
					break;
				}
			}

			handle.style.left = `${x}px`;
			handle.style.top = `${normalizedY * rect.height}px`;
			handle.style.background = color;
		});
	}

	return [wrapper, loadHandle];
}
function rgbaToHsla(r, g, b, a) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }

        h /= 6;
    }

    return [h * 360, s, l, a];
}
function getRGB(string){
    // convert hex, rgb, rgba, hsl, hsla to rgb
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.fillStyle = string;
    const computedColor = ctx.fillStyle;

    if (computedColor.startsWith("rgb")) {
        const rgbValues = computedColor.match(/\d+/g).map(Number);
        return rgbValues.slice(0, 3); // Return only the RGB values, ignore alpha if present
    }
    if (computedColor.startsWith("hsl")) {
        const hslValues = computedColor.match(/\d+/g).map(Number);
        const [h, s, l] = hslValues;
        const rgb = hslToRgb(h, s, l);
        return rgb;
    }
    if (computedColor.startsWith("hsla")) {
        const hslaValues = computedColor.match(/\d+/g).map(Number);
        const [h, s, l, a] = hslaValues;
        const rgb = hslToRgb(h, s, l);
        return rgb;
    }
    if (computedColor.startsWith("#")) {
        const hex = computedColor.slice(1);
        let r, g, b;
        
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        }
        else if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        }
        else if (hex.length === 8) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
            // const a = parseInt(hex.slice(6, 8), 16) / 255; // Alpha value (0-1)
        }
        else {
            return null; // Invalid hex format
        }
        return [r, g, b];
    }
    return null; // Return null if the color format is not recognized
}