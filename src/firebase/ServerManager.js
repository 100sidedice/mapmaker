function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function serializeImages(images) {
    const serialized = {};

    for (const [key, image] of Object.entries(images)) {
        if (!image) continue;

        if (
            !(image instanceof HTMLImageElement) &&
            !(image instanceof HTMLCanvasElement)
        ) {
            throw new Error(`Image "${key}" is not drawable.`);
        }

        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) {
            throw new Error(`Image "${key}" has invalid dimensions.`);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        serialized[key] = {
            width,
            height,
            data: Array.from(context.getImageData(0, 0, width, height).data)
        };
    }

    return serialized;
}

function diffImages(previous = {}, current = {}, changes = []) {
    const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);

    for (const key of keys) {
        if (!(key in current)) {
            changes.push({ operation: "delete", path: ["images", key] });
            continue;
        }
        if (!(key in previous)) {
            changes.push({ operation: "set", path: ["images", key], value: current[key] });
            continue;
        }

        const oldImage = previous[key];
        const newImage = current[key];
        if (
            oldImage.width !== newImage.width ||
            oldImage.height !== newImage.height
        ) {
            changes.push({ operation: "set", path: ["images", key], value: newImage });
            continue;
        }

        const pixels = [];
        for (let index = 0; index < newImage.data.length; index += 4) {
            if (
                oldImage.data[index] !== newImage.data[index] ||
                oldImage.data[index + 1] !== newImage.data[index + 1] ||
                oldImage.data[index + 2] !== newImage.data[index + 2] ||
                oldImage.data[index + 3] !== newImage.data[index + 3]
            ) {
                pixels.push({
                    index,
                    rgba: newImage.data.slice(index, index + 4)
                });
            }
        }
        if (pixels.length) {
            changes.push({
                operation: "pixels",
                path: ["images", key],
                value: { width: newImage.width, height: newImage.height, pixels }
            });
        }
    }

    return changes;
}

function diffValues(previous, current, path = [], changes = []) {
    if (Object.is(previous, current)) return changes;

    const previousObject = previous && typeof previous === "object";
    const currentObject = current && typeof current === "object";

    if (!previousObject || !currentObject || Array.isArray(previous) !== Array.isArray(current)) {
        changes.push({ operation: "set", path, value: clone(current) });
        return changes;
    }

    if (Array.isArray(previous)) {
        const keys = new Set([
            ...Object.keys(previous),
            ...Object.keys(current)
        ]);
        for (const key of [...keys].sort((a, b) => Number(b) - Number(a))) {
            if (!(key in current)) {
                changes.push({ operation: "delete", path: [...path, key] });
            } else {
                diffValues(previous[key], current[key], [...path, key], changes);
            }
        }
        return changes;
    }

    const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
    for (const key of keys) {
        if (!(key in current)) {
            changes.push({ operation: "delete", path: [...path, key] });
        } else {
            diffValues(previous[key], current[key], [...path, key], changes);
        }
    }

    return changes;
}

function diffState(previous, current) {
    const changes = [];
    const sections = new Set([
        ...Object.keys(previous),
        ...Object.keys(current)
    ]);

    for (const section of sections) {
        if (section === "images") continue;
        diffValues(
            previous[section] ?? {},
            current[section],
            [section],
            changes
        );
    }

    return diffImages(previous.images, current.images, changes);
}

export default class ServerManager {
    constructor(mapMaker, firebase) {
        this.mapMaker = mapMaker;
        this.firebase = firebase;
        this.imageState = serializeImages(this.mapMaker.images);
        this.pendingChanges = [];
        this.syncInProgress = false;
        this.remoteEdit = false;
        this.editDepth = 0;
        this.dirtyImages = new Set();
        this.proxyCache = new WeakMap();
        this.remoteCursors = new Map();
        this.cursorTimer = null;
        this.pendingCursor = null;
        this.trackRoot("regions", "map");
        this.trackRoot("notes", "notes");
        this.trackRoot("markers", "markers");
        this.trackRoot("annotations", "annotations");
        this.trackImages();
        this.unsubscribe = firebase.onSync((diff) => {
            this.applyDiff(diff).catch(error => {
                console.error("Failed to apply synced changes:", error);
                this.firebase.reportStatus(`Sync error: ${error.message}`);
            });
        });
        this.unsubscribeSyncRequest = firebase.onSyncRequest(() => {
            this.sendFullSync().catch(error => {
                console.error("Initial room sync failed:", error);
            });
        });
        this.unsubscribeCursor = firebase.onCursor((cursor) => {
            if (!cursor?.username) return;
            if (cursor.visible === false) this.remoteCursors.delete(cursor.username);
            else this.remoteCursors.set(cursor.username, cursor);
        });
        this.mapMaker.mouse?.hook("mousemove", "collaboration-cursor", pos => {
            this.sendCursor(pos);
        }, -1000);
        this.mapMaker.mouse?.hook("mouseleave", "collaboration-cursor-hide", () => {
            this.firebase.sendCursor({ visible: false });
        }, -1000);
    }

    trackRoot(root, property) {
        this.mapMaker[property] = this.createTrackedProxy(
            this.mapMaker[property],
            [root]
        );
    }

    trackImages() {
        this.mapMaker.images = new Proxy(this.mapMaker.images, {
            set: (target, key, value) => {
                target[key] = value;
                if (!this.remoteEdit) this.dirtyImages.add(String(key));
                return true;
            },
            deleteProperty: (target, key) => {
                delete target[key];
                if (!this.remoteEdit) this.dirtyImages.add(String(key));
                return true;
            }
        });
    }

    snapshot(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    createTrackedProxy(value, path) {
        if (!value || typeof value !== "object") return value;
        const cached = this.proxyCache.get(value);
        if (cached) return cached;

        const proxy = new Proxy(value, {
            get: (target, key) => {
                const child = target[key];
                return child && typeof child === "object"
                    ? this.createTrackedProxy(child, [...path, String(key)])
                    : child;
            },
            set: (target, key, nextValue) => {
                target[key] = nextValue;
                if (key !== "length") {
                    this.recordChange({
                        operation: "set",
                        path: [...path, String(key)],
                        value: this.snapshot(nextValue)
                    });
                }
                return true;
            },
            deleteProperty: (target, key) => {
                if (!(key in target)) return true;
                delete target[key];
                this.recordChange({
                    operation: "delete",
                    path: [...path, String(key)]
                });
                return true;
            }
        });
        this.proxyCache.set(value, proxy);
        return proxy;
    }

    recordChange(change) {
        if (this.remoteEdit) return;
        this.pendingChanges.push(change);
        if (!this.editDepth) this.syncPending();
    }

    markImageDirty(tileType) {
        if (!tileType) return;
        this.dirtyImages.add(tileType);
        if (!this.editDepth) this.flushEdit();
    }

    captureState() {
        return {
            regions: this.snapshot(this.mapMaker.map),
            notes: this.snapshot(this.mapMaker.notes),
            images: clone(this.imageState),
            markers: this.snapshot(this.mapMaker.markers),
            annotations: this.snapshot(this.mapMaker.annotations)
        };
    }

    getState() {
        return this.captureState();
    }

    async sync() {
        if (
            this.syncInProgress ||
            !this.pendingChanges.length ||
            !this.firebase.activeRoomKey ||
            !this.firebase.hasConnection()
        ) {
            return false;
        }
        this.syncInProgress = true;
        const changes = this.pendingChanges.splice(0);

        try {
            const sent = await this.firebase.sendSync({
                version: 1,
                changes
            });
            if (!sent) this.pendingChanges.unshift(...changes);
            return sent;
        } catch (error) {
            this.pendingChanges.unshift(...changes);
            throw error;
        } finally {
            this.syncInProgress = false;
            if (
                this.pendingChanges.length &&
                this.firebase.activeRoomKey &&
                this.firebase.hasConnection()
            ) {
                await this.sync();
            }
        }
    }

    beginEdit() {
        if (this.remoteEdit) return;
        this.editDepth++;
    }

    endEdit() {
        if (this.remoteEdit || !this.editDepth) return;
        this.editDepth--;
        if (!this.editDepth) this.flushEdit();
    }

    flushEdit() {
        for (const tileType of this.dirtyImages) {
            const next = this.mapMaker.images[tileType];
            const previous = this.imageState[tileType];
            if (!next) {
                if (previous) this.pendingChanges.push({
                    operation: "delete",
                    path: ["images", tileType]
                });
                delete this.imageState[tileType];
                continue;
            }
            const serialized = serializeImages({ [tileType]: next })[tileType];
            if (!previous) {
                this.pendingChanges.push({
                    operation: "set",
                    path: ["images", tileType],
                    value: serialized
                });
            } else {
                diffImages(
                    { [tileType]: previous },
                    { [tileType]: serialized },
                    this.pendingChanges
                );
            }
            this.imageState[tileType] = serialized;
        }
        this.dirtyImages.clear();
        this.syncPending();
    }

    syncPending() {
        if (!this.firebase.activeRoomKey || !this.firebase.hasConnection()) return;
        this.sync().catch(error => {
            console.error("Explicit edit sync failed:", error);
            this.firebase.reportStatus(`Sync error: ${error.message}`);
        });
    }

    sendCursor(pos) {
        if (!this.firebase.activeRoomKey) return;
        const world = this.mapMaker.screenToWorld(pos.x, pos.y);
        this.pendingCursor = {
            username: this.firebase.username,
            x: world.x,
            y: world.y,
            visible: true
        };
        if (this.cursorTimer) return;
        this.cursorTimer = setTimeout(() => {
            this.cursorTimer = null;
            const cursor = this.pendingCursor;
            this.pendingCursor = null;
            if (cursor) this.firebase.sendCursor(cursor);
        }, 33);
    }

    renderCursors(context) {
        const scale = this.mapMaker.camera.zoom * this.mapMaker.dpi;
        const size = 18 / scale;
        const fontSize = 12 / scale;
        context.save();
        context.font = `${fontSize}px sans-serif`;
        context.textBaseline = "bottom";
        for (const cursor of this.remoteCursors.values()) {
            const color = this.cursorColor(cursor.username);
            context.strokeStyle = color;
            context.fillStyle = color;
            context.lineWidth = 2 / scale;
            context.strokeRect(cursor.x - size / 2, cursor.y - size / 2, size, size);
            const label = cursor.username;
            const textWidth = context.measureText(label).width;
            context.fillRect(cursor.x - size / 2, cursor.y - size / 2 - fontSize - 4 / scale, textWidth + 6 / scale, fontSize + 4 / scale);
            context.fillStyle = "#ffffff";
            context.fillText(label, cursor.x - size / 2 + 3 / scale, cursor.y - size / 2 - 3 / scale);
        }
        context.restore();
    }

    cursorColor(username) {
        let hash = 0;
        for (const character of username) {
            hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
        }
        return `hsl(${Math.abs(hash) % 360} 90% 55%)`;
    }

    async sendFullSync() {
        if (
            !this.firebase.isHost ||
            !this.firebase.activeRoomKey ||
            !this.firebase.hasConnection() ||
            this.syncInProgress
        ) return false;
        const changes = diffState({}, this.captureState());
        if (changes.length === 0) return false;

        const sent = this.firebase.broadcastMessage({
            type: "sync",
            id: crypto.randomUUID(),
            diff: { version: 1, changes }
        });
        return sent > 0;
    }

    async applyDiff(diff) {
        if (!diff || diff.version !== 1 || !Array.isArray(diff.changes)) {
            throw new Error("Received an invalid save diff.");
        }

        this.remoteEdit = true;
        try {
            for (const change of diff.changes) {
                if (!Array.isArray(change.path) || !["set", "delete", "pixels"].includes(change.operation)) {
                    throw new Error("Received an invalid save diff operation.");
                }
                await this.applyChange(change);
            }
        } finally {
            this.remoteEdit = false;
        }

        this.mapMaker.rebuildRegionTypes();
        for (const engine of [
            this.mapMaker.PixelEngine,
            this.mapMaker.TileEngine,
            this.mapMaker.RegionEngine,
            this.mapMaker.SpaceEngine
        ]) {
            engine?.queue?.clear();
            engine?.updateRegions?.();
        }
    }

    async applyChange(change) {
        if (change.path.length === 0) {
            throw new Error("Save diff operations require a property path.");
        }

        const [root, ...path] = change.path;
        const property = root === "regions" ? "map" : root;
        if (!(property in this.mapMaker)) {
            throw new Error(`Save diff references unknown property "${root}".`);
        }

        if (path.length === 0) {
            if (change.operation === "delete") {
                throw new Error("Save diff cannot delete a save property.");
            }
            if (root === "images") {
                throw new Error("Image diffs must target an image key.");
            }
            this.mapMaker[property] = this.createTrackedProxy(
                clone(change.value),
                [root]
            );
            return;
        }

        let target = this.mapMaker[property];
        for (const key of path.slice(0, -1)) {
            if (!target || typeof target !== "object") {
                throw new Error("Save diff contains an invalid property path.");
            }
            target = target[key];
        }

        if (!target || typeof target !== "object") {
            throw new Error("Save diff contains an invalid property path.");
        }

        const key = path[path.length - 1];
        if (change.operation === "delete") {
            if (Array.isArray(target)) target.splice(Number(key), 1);
            else delete target[key];
            if (root === "images") delete this.imageState[key];
        } else if (root === "images" && change.operation === "set") {
            target[key] = this.createImageCanvas(change.value);
            this.imageState[key] = clone(change.value);
        } else if (root === "images" && change.operation === "pixels") {
            target[key] = this.applyImagePixels(target[key], change.value);
            this.imageState[key] = serializeImages({
                [key]: this.mapMaker.images[key]
            })[key];
        } else {
            target[key] = clone(change.value);
        }
    }

    createImageCanvas(image) {
        if (
            !image ||
            !Number.isInteger(image.width) ||
            !Number.isInteger(image.height) ||
            !Array.isArray(image.data)
        ) {
            throw new Error("Received an invalid image snapshot.");
        }
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        const imageData = context.createImageData(image.width, image.height);
        imageData.data.set(image.data);
        context.putImageData(imageData, 0, 0);
        return canvas;
    }

    applyImagePixels(image, change) {
        if (
            !image ||
            !change ||
            !Array.isArray(change.pixels) ||
            change.width !== (image.naturalWidth || image.width) ||
            change.height !== (image.naturalHeight || image.height)
        ) {
            throw new Error("Received an invalid pixel diff.");
        }
        const canvas = image instanceof HTMLCanvasElement
            ? image
            : this.createImageCanvas({
                width: image.naturalWidth || image.width,
                height: image.naturalHeight || image.height,
                data: Array.from((() => {
                    const source = document.createElement("canvas");
                    source.width = image.naturalWidth || image.width;
                    source.height = image.naturalHeight || image.height;
                    const context = source.getContext("2d");
                    context.drawImage(image, 0, 0);
                    return context.getImageData(0, 0, source.width, source.height).data;
                })())
            });
        const context = canvas.getContext("2d");
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        for (const pixel of change.pixels) {
            if (
                !Number.isInteger(pixel.index) ||
                pixel.index < 0 ||
                pixel.index % 4 !== 0 ||
                pixel.index + 3 >= imageData.data.length ||
                !Array.isArray(pixel.rgba) ||
                pixel.rgba.length !== 4
            ) {
                throw new Error("Received an invalid pixel index.");
            }
            imageData.data.set(pixel.rgba, pixel.index);
        }
        context.putImageData(imageData, 0, 0);
        return canvas;
    }
}
