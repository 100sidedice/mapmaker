export default class Saver {
	constructor() {
		this.db = null;
		this.saveHook = () => {};
		this.ready = this.open();
	}

	/**
	 * Opens the MapMaker IndexedDB database.
	 * @returns {Promise<IDBDatabase>}
	 */
	open() {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open("MapMaker", 1);

			request.onupgradeneeded = () => {
				const db = request.result;

				if (!db.objectStoreNames.contains("saves")) {
					db.createObjectStore("saves");
				}
			};

			request.onsuccess = () => {
				this.db = request.result;
				resolve(this.db);
			};

			request.onerror = () => {
				reject(request.error);
			};
		});
	}

	/**
	 * Saves the current MapMaker state.
	 * @param {Object<string, HTMLImageElement>} images
	 * @returns {Promise<void>}
	 */
	async save(images = {}) {
		await this.ready;

		this.saveHook();

		const data = {
			...this.saveFile,
			images: await this.serializeImages(images)
		};

		await this.put("current", data);
		console.log("saved to IndexedDB");
	}

	/**
	 * Loads the current MapMaker save.
	 * @returns {Promise<Object|null>}
	 */
	async load() {
		await this.ready;
		return this.get("current");
	}

	/**
	 * Stores a value in the saves object store.
	 * @param {string} key
	 * @param {*} value
	 * @returns {Promise<void>}
	 */
	put(key, value) {
		return new Promise((resolve, reject) => {
			const transaction = this.db.transaction("saves", "readwrite");
			const store = transaction.objectStore("saves");

			store.put(value, key);

			transaction.oncomplete = resolve;
			transaction.onerror = () => reject(transaction.error);
		});
	}

	/**
	 * Retrieves a value from the saves object store.
	 * @param {string} key
	 * @returns {Promise<*>}
	 */
	get(key) {
		return new Promise((resolve, reject) => {
			const transaction = this.db.transaction("saves", "readonly");
			const store = transaction.objectStore("saves");
			const request = store.get(key);

			request.onsuccess = () => resolve(request.result ?? null);
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Converts loaded images into Blobs for IndexedDB storage.
	 * @param {Object<string, HTMLImageElement>} images
	 * @returns {Promise<Object<string, Blob>>}
	 */
	async serializeImages(images) {
		const result = {};

		for (const [key, image] of Object.entries(images)) {
			const canvas = document.createElement("canvas");
			canvas.width = image.naturalWidth || image.width;
			canvas.height = image.naturalHeight || image.height;

			if (!canvas.width || !canvas.height) continue;

			const ctx = canvas.getContext("2d");
			ctx.drawImage(image, 0, 0);

			result[key] = await new Promise(resolve => {
				canvas.toBlob(resolve, "image/png");
			});
		}

		return result;
	}

	/**
	 * Converts custom tile images into data URLs for JSON export.
	 * @param {Object<string, HTMLImageElement|HTMLCanvasElement>} images
	 * @returns {Object<string, string>}
	 */
	serializeCustomImages(images) {
		const result = {};

		for (const [key, image] of Object.entries(images)) {
			if (!key.startsWith("tile_")) continue;

			const canvas = document.createElement("canvas");
			canvas.width = image.naturalWidth || image.width;
			canvas.height = image.naturalHeight || image.height;

			if (!canvas.width || !canvas.height) continue;

			const ctx = canvas.getContext("2d");
			ctx.drawImage(image, 0, 0);
			result[key] = canvas.toDataURL("image/png");
		}

		return result;
	}

	/**
	 * Clears the current save.
	 * @returns {Promise<void>}
	 */
	async clear() {
		await this.ready;
		await this.delete("current");
		console.log("save cleared");
	}

	/**
	 * Deletes a value from the saves object store.
	 * @param {string} key
	 * @returns {Promise<void>}
	 */
	delete(key) {
		return new Promise((resolve, reject) => {
			const transaction = this.db.transaction("saves", "readwrite");
			const store = transaction.objectStore("saves");

			store.delete(key);

			transaction.oncomplete = resolve;
			transaction.onerror = () => reject(transaction.error);
		});
	}

	/**
	 * Starts periodic autosaving.
	 * @param {Object<string, HTMLImageElement>} images
	 */
	startAutosave(images) {
		setInterval(() => {
			this.save(images);
		}, 10000);
	}
}