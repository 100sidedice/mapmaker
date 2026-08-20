// web worker for searching notes, so that the UI doesn't freeze while searching
self.onmessage = event => {
	const { type, query, notes } = event.data;

	if (type !== "search") return;

	const results = searchNotes(notes, query);
	self.postMessage({
        type: "results",
        id: event.data.id,
        results
    });
};

/**
 * Searches all notes for the supplied query.
 * @param {Object} notes - Notes database.
 * @param {string} query - Search query.
 * @returns {Array} Matching notes.
 */
function searchNotes(notes, query) {
	const results = [];
	const search = query.toLowerCase();

	for (const [key, note] of Object.entries(notes)) {
		if (!note?.text) continue;

		const text = note.text.toLowerCase();

		if (!text.includes(search)) continue;

		results.push({
			key,
			text: note.text,
			color: note.color
		});
	}

	return results;
}