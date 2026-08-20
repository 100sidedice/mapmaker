export default class SearchEngine {
	constructor(notes) {
		this.notes = notes;
		this.worker = new Worker(
			new URL("./SearchWorker.js", import.meta.url),
			{ type: "module" }
		);
		this.requestId = 0;
		this.pending = new Map();

		this.worker.addEventListener("message", event => {
			this.handleResults(event.data);
		});
	}

	/**
	 * Searches the notes database.
	 * @param {string} query - Search query.
	 * @returns {Promise<Array>} Matching notes.
	 */
	search(query) {
		return new Promise(resolve => {
			const id = ++this.requestId;

			this.pending.set(id, resolve);

			this.worker.postMessage({
				type: "search",
				id,
				query,
				notes: this.notes
			});
		});
	}

	/**
	 * Handles search results returned by the worker.
	 * @param {Object} data - Worker response.
	 */
	handleResults(data) {
		const resolve = this.pending.get(data.id);

		if (!resolve) return;

		this.pending.delete(data.id);
		resolve(data.results);
	}
}