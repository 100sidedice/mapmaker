export default class PixelEngine {
    constructor(mapMaker) {
        this.mapMaker = mapMaker;
        this.queue = new Map();
    }

    load(mapMaker){
        this.keyMap = mapMaker.keyMap;
        this.config = mapMaker.config;
        this.ctx = mapMaker.ctx;
        this.mouse = mapMaker.mouse;
        this.clipboard = mapMaker.clipboard;
        this.lastPicked = mapMaker.lastPicked;
        this.config.alt = mapMaker.alt;
        this.update()
        const addTile = document.getElementById("addTile");
        if (addTile) {
            addTile.addEventListener("click", () => {
                console.log("Clicked!")
                this.addTile();
            });
        }   
    }

    render(){
        this.ctx.imageSmoothingEnabled = false;
        // Tile-scope rendering
        // draw full map in bounds
        const bounds = this.mapMaker.getBounds();
        const startRegionX = Math.min(0, Math.floor(bounds.left / (32 * 8)));
        const endRegionX = Math.floor(bounds.right / (32 * 8));
        const startRegionY = Math.min(0, Math.floor(bounds.top / (32 * 8)));
        const endRegionY = Math.floor(bounds.bottom / (32 * 8));
        this.ctx.fillStyle = 'rgb(86, 86, 86)';
        this.ctx.fillRect(startRegionX * 32 * 8, startRegionY * 32 * 8, (endRegionX - startRegionX + 1) * 32 * 8, (endRegionY - startRegionY + 1) * 32 * 8);
        for (let regionX = startRegionX; regionX <= endRegionX; regionX++) {
            for (let regionY = startRegionY; regionY <= endRegionY; regionY++) {
                const key = `${regionX}_${regionY}`;
                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 8; col++) {
                        if (!this.mapMaker.map[key]) {
                            continue;
                        }
                        let tileType = this.mapMaker.map[key]["tiles"][row][col];

                        if (tileType === "") {
                            continue;
                        }
                        tileType = tileType[0]; // get the tile type, ignoring selected state
                        const img = this.mapMaker.images[tileType];
                        if (img) {
                            this.ctx.drawImage(img, (regionX * 8 + col) * 32, (regionY * 8 + row) * 32, 32, 32);
                        }else{
                            console.warn(`Image for tile type "${tileType}" not found.`);
                        }
                        // blue outline for selected tiles
                        if (this.mapMaker.map[key]["tiles"][row][col][1] === "selected") {
                            this.ctx.strokeStyle = 'rgb(0, 255, 255)';
                            this.ctx.lineWidth = 2;
                            this.ctx.strokeRect((regionX * 8 + col) * 32, (regionY * 8 + row) * 32, 32, 32);
                            // add little square in the top left corner to indicate selected tile
                            this.ctx.fillStyle = 'rgb(0, 255, 255)';
                            this.ctx.fillRect((regionX * 8 + col) * 32, (regionY * 8 + row) * 32, 5, 5);
                        }
                        // draw note marker
                        const noteKey = `${regionX}_${regionY}_${col}_${row}`;
                        // if the note contians a hex color, use that
                        const noteColor = this.mapMaker.notes[noteKey]?.color || "#ffff0033";
                        if (this.mapMaker.notes[noteKey]) {
                            this.ctx.fillStyle = noteColor;
                            this.ctx.fillRect((regionX * 8 + col) * 32, (regionY * 8 + row) * 32, 32, 32);
                        }
                    }
                }
            }
        }
        if (this.config.focus){
            // darken everything except the focused tiles
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(startRegionX * 32 * 8, startRegionY * 32 * 8, (endRegionX - startRegionX + 1) * 32 * 8, (endRegionY - startRegionY + 1) * 32 * 8);
            this.focusRenderer()

        }
        for (const pixel of this.mapMaker.pixelSelection) {
            const [x, y] = pixel.split("_").map(Number);
            if (x < startRegionX * 256 || x > (endRegionX + 1) * 256 ||
                y < startRegionY * 256 || y > (endRegionY + 1) * 256) {
                continue;
            }
            this.ctx.strokeStyle = "rgba(0, 255, 255, 0.55)";
            this.ctx.lineWidth = 0.05;
            this.ctx.strokeRect(x, y, 1, 1);
            this.ctx.fillStyle = "rgba(0, 255, 255, 0.55)";
            this.ctx.fillRect(x, y, 0.2, 0.2);
        }
        // draw region grid lines
        for (let regionX = startRegionX; regionX <= endRegionX; regionX++) {
            for (let regionY = startRegionY; regionY <= endRegionY; regionY++) {
                const key = `${regionX}_${regionY}`;
                // if negative region, draw black
                if (regionX < 0 || regionY < 0) {
                    this.ctx.fillStyle = 'rgb(36, 36, 36)';
                    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0)';
                    this.ctx.fillRect(regionX * 8 * 32-1, regionY * 8 * 32-1, 8 * 32+2, 8 * 32+2);
                    continue;
                }else{
                    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                    // fill region with semi-transparent color if it doesn't exist
                    if (!this.mapMaker.map[`${regionX}_${regionY}`]) {
                        this.ctx.fillStyle = 'rgb(220, 220, 220)';
                        this.ctx.fillRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                    }
                }
                // if the selected tile is in a group, and this is not that group, darken
                const lastKey = `${this.config.lastPickedRegion?.regionX}_${this.config.lastPickedRegion?.regionY}`;
                if (this.config.lastPickedRegion && this.mapMaker.map[lastKey]?.["groups"] && Object.keys(this.mapMaker.map[lastKey]["groups"]).length > 0.) {
                    if (!this.mapMaker.map[key]?.["groups"] || !Object.keys(this.mapMaker.map[key]["groups"]).some(group => this.mapMaker.map[lastKey]["groups"][group])) {
                        if (this.mapMaker.map[key]?.["groups"] && Object.keys(this.mapMaker.map[key]["groups"]).length >= 1) {
                            // draw random tiles group colors evenly
                            // array of 64 colors, distributed across the groups
                            const groupColors = Object.keys(this.mapMaker.map[key]["groups"]);
                            // if only 1 group, just use that color
                            if (groupColors.length === 1) {
                                this.ctx.fillStyle = groupColors[0] + '40';
                                this.ctx.fillRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                            } else {
                                for (let row = 0; row < 8; row++) {
                                    for (let col = 0; col < 8; col++) {
                                        // we'll use mod(colors) on x/y
                                        const color = groupColors[Math.floor(((row + col)*0.5) % groupColors.length)];
                                        this.ctx.fillStyle = color + '40';
                                        this.ctx.fillRect((regionX * 8 + col) * 32, (regionY * 8 + row) * 32, 32, 32);
                                    }
                                }
                            }
                            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                            this.ctx.fillRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                        } else {
                            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                            this.ctx.fillRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                        }
                    }
                }
            }
        }


        const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);
        const value = performance.now() / 300; // change speed of blinking
        const alpha = (Math.sin(value) + 1) / 10 + 0.3; // oscillates between 0.3 and 0.5
        if (this.mouse.extraData.shiftPos) {
            const startTileX = Math.floor(this.mouse.extraData.shiftPos.x);
            const startTileY = Math.floor(this.mouse.extraData.shiftPos.y);
            const endTileX = Math.floor(worldPos.x);
            const endTileY = Math.floor(worldPos.y);
            const minTileX = Math.min(startTileX, endTileX);
            const maxTileX = Math.max(startTileX, endTileX);
            const minTileY = Math.min(startTileY, endTileY);
            const maxTileY = Math.max(startTileY, endTileY);
            this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha/3})`;
            this.ctx.fillRect(minTileX, minTileY, (maxTileX - minTileX + 1), (maxTileY - minTileY + 1));
            return;
        }
        const tileX = Math.floor(worldPos.x) - Math.floor(this.config.brushSize / 2-0.1);
        const tileY = Math.floor(worldPos.y) - Math.floor(this.config.brushSize / 2-0.1);
        this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha/3})`;
        this.ctx.fillRect(tileX, tileY, this.config.brushSize, this.config.brushSize);
    }
    focusRenderer() {
        this.ctx.imageSmoothingEnabled = false;

        for (const key of this.config.tilesInFocus) {
            const [regionX, regionY, col, row] = key.split('_').map(Number);
            const regionKey = `${regionX}_${regionY}`;
            const region = this.mapMaker.map[regionKey];

            if (!region) continue;

            const tile = region.tiles[row][col];
            if (tile === "") continue;

            const x = (regionX * 8 + col) * 32;
            const y = (regionY * 8 + row) * 32;
            const tileType = tile[0];
            const img = this.mapMaker.images[tileType];

            if (img) {
                this.ctx.drawImage(img, x, y, 32, 32);
            }
        }

		// Show the 4x4 autotile mask when exactly 16 tiles are focused.
		if (this.config.tilesInFocus.size !== 16) return;

		const focusedTiles = [...this.config.tilesInFocus].map(key => {
			const [regionX, regionY, col, row] = key.split("_").map(Number);
			return {
				regionX,
				regionY,
				col,
				row,
				x: regionX * 8 + col,
				y: regionY * 8 + row
			};
		});

		const minX = Math.min(...focusedTiles.map(tile => tile.x));
		const minY = Math.min(...focusedTiles.map(tile => tile.y));

		// Ensure the focused tiles form a contiguous 4x4 region.
		if (
			Math.max(...focusedTiles.map(tile => tile.x)) !== minX + 3 ||
			Math.max(...focusedTiles.map(tile => tile.y)) !== minY + 3 ||
			new Set(focusedTiles.map(tile => `${tile.x}_${tile.y}`)).size !== 16
		) {
			return;
		}

		const maskByPosition = [
			["0001", "0010", "0000", "1001"],
			["0100", "1000", "1111", "0110"],
			["0011", "1010", "1110", "1101"],
			["0101", "1100", "1011", "0111"]
		];

		this.ctx.save();
		this.ctx.font = "bold 14px monospace";
		this.ctx.textAlign = "center";
		this.ctx.textBaseline = "middle";

		for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const tileX = minX + col;
                const tileY = minY + row;
                const x = tileX * 32;
                const y = tileY * 32;
                const mask = maskByPosition[row][col];

                if (mask === "0000") continue;

                this.ctx.fillStyle = "rgba(0, 0, 0, 0.2)";

                if (mask[0] === "1") {
                    this.ctx.fillRect(x, y, 16, 16);
                }
                if (mask[1] === "1") {
                    this.ctx.fillRect(x + 16, y, 16, 16);
                }
                if (mask[2] === "1") {
                    this.ctx.fillRect(x, y + 16, 16, 16);
                }
                if (mask[3] === "1") {
                    this.ctx.fillRect(x + 16, y + 16, 16, 16);
                }
            }
        }

		this.ctx.restore();

    }
    isTileInFocus(tileX, tileY) {
        if (!this.config.focus) return true;

        const regionX = Math.floor(tileX / 8);
        const regionY = Math.floor(tileY / 8);
        const col = tileX % 8;
        const row = tileY % 8;

        return this.config.tilesInFocus.has(`${regionX}_${regionY}_${col}_${row}`);
    }

    brush(pos, method = "click", startPixelX = null, startPixelY = null, endPixelX = null, endPixelY = null) {
        const worldPos = this.mapMaker.screenToWorld(pos.x, pos.y);

        if (startPixelX === null || startPixelY === null || endPixelX === null || endPixelY === null) {
            startPixelX = Math.floor(worldPos.x);
            startPixelY = Math.floor(worldPos.y);
            endPixelX = startPixelX;
            endPixelY = startPixelY;

            if (this.mouse.extraData.shiftPos) {
                startPixelX = Math.floor(this.mouse.extraData.shiftPos.x);
                startPixelY = Math.floor(this.mouse.extraData.shiftPos.y);
                endPixelX = Math.floor(worldPos.x);
                endPixelY = Math.floor(worldPos.y);

                if (startPixelX > endPixelX) {
                    [startPixelX, endPixelX] = [endPixelX, startPixelX];
                }

                if (startPixelY > endPixelY) {
                    [startPixelY, endPixelY] = [endPixelY, startPixelY];
                }
            } else {
                const offset = Math.floor(this.config.brushSize / 2 - 0.1);
                startPixelX -= offset;
                startPixelY -= offset;
                endPixelX = startPixelX + this.config.brushSize - 1;
                endPixelY = startPixelY + this.config.brushSize - 1;
            }
        }

        startPixelX = Math.max(0, startPixelX);
        startPixelY = Math.max(0, startPixelY);

        if (startPixelX > endPixelX || startPixelY > endPixelY) {
            return;
        }

        if (this.config.alt) {
            for (let pixelY = startPixelY; pixelY <= endPixelY; pixelY++) {
                for (let pixelX = startPixelX; pixelX <= endPixelX; pixelX++) {
                    const tileX = Math.floor(pixelX / 32);
                    const tileY = Math.floor(pixelY / 32);
                    if (!this.isTileInFocus(tileX, tileY)) continue;
                    const regionX = Math.floor(tileX / 8);
                    const regionY = Math.floor(tileY / 8);
                    const tile = this.mapMaker.map[`${regionX}_${regionY}`]?.tiles[tileY % 8][tileX % 8];
                    if (!tile || tile === "") continue;
                    const pixel = `${pixelX}_${pixelY}`;
                    const selected = this.mapMaker.pixelSelection;
                    const index = selected.indexOf(pixel);
                    if (this.mouse.get("right") || this.config.erase) {
                        if (index !== -1) selected.splice(index, 1);
                    } else if (index === -1) {
                        selected.push(pixel);
                    }
                }
            }
            return;
        }

        const startTileX = Math.floor(startPixelX / 32);
        const endTileX = Math.floor(endPixelX / 32);
        const startTileY = Math.floor(startPixelY / 32);
        const endTileY = Math.floor(endPixelY / 32);

        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                const regionX = Math.floor(tileX / 8);
                const regionY = Math.floor(tileY / 8);
                if (!this.isTileInFocus(tileX, tileY)) continue;

                if (regionX < 0 || regionY < 0) {
                    continue;
                }

                const key = `${regionX}_${regionY}`;
                const localX = tileX % 8;
                const localY = tileY % 8;

                if (!this.mapMaker.map[key]) {
                    this.mapMaker.map[key] = {
                        tiles: Array.from({ length: 8 }, () => Array(8).fill(""))
                    };
                }

                this.queueRegion(key, this.mapMaker.map[key].tiles);

                let tile = this.mapMaker.map[key].tiles[localY][localX];
                const selectedType = this.config.selectedTileType;

                if (tile === "") {
                    tile = [selectedType, ""];
                    this.mapMaker.map[key].tiles[localY][localX] = tile;
                }
                const currentType = tile[0];
                const image = this.getEditableImage(currentType);
                if (!image) {
                    continue;
                }

                const ctx = image.getContext("2d");
                const minX = Math.max(startPixelX, tileX * 32) - tileX * 32;
                const maxX = Math.min(endPixelX, tileX * 32 + 31) - tileX * 32;
                const minY = Math.max(startPixelY, tileY * 32) - tileY * 32;
                const maxY = Math.min(endPixelY, tileY * 32 + 31) - tileY * 32;

                ctx.fillStyle = (this.config.erase || this.mouse.get("right")) ? "#ffffff" : this.config.selectedColor;
                ctx.fillRect(minX, minY, maxX - minX + 1, maxY - minY + 1);
            }
        }

        this.updateRegions();
    }
    /**
     * Gets an editable canvas for a tile image.
     * @param {string} tileType - Tile type to edit.
     * @returns {HTMLCanvasElement|null} Editable tile image.
     */
    getEditableImage(tileType) {
        const image = this.mapMaker.images[tileType];

        if (!image) {
            return null;
        }

        if (image instanceof HTMLCanvasElement) {
            return image;
        }

        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;

        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 0, 0, 32, 32);

        this.mapMaker.images[tileType] = canvas;

        return canvas;
    }
    /**
     * Picks the pixel color under the mouse from the tile image.
     */
    pickColor() {
        const mouseTile = this.getMousePixel();
        const tileX = Math.floor(mouseTile.x / 32);
        const tileY = Math.floor(mouseTile.y / 32);
        const regionX = Math.floor(tileX / 8);
        const regionY = Math.floor(tileY / 8);
        const key = `${regionX}_${regionY}`;

        const region = this.mapMaker.map[key];
        if (!region) {
            return;
        }

        const tile = region.tiles[tileY % 8][tileX % 8];
        if (tile === "") {
            return;
        }

        const image = this.mapMaker.images[tile[0]];
        if (!image) {
            return;
        }

        const pixelX = mouseTile.x % 32;
        const pixelY = mouseTile.y % 32;
        const canvas = this.getEditableImage(tile[0]);
        const ctx = canvas.getContext("2d");
        const pixel = ctx.getImageData(pixelX, pixelY, 1, 1).data;

        this.config.selectedColor = `rgba(${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${pixel[3] / 255})`;
    }

    /**
     * Creates a new blank tile type and selects it.
     */
    addTile() {
        const tileType = `tile_${crypto.randomUUID()}`;
        const canvas = document.createElement("canvas");

        canvas.width = 32;
        canvas.height = 32;

        // fill white
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 32, 32);

        this.mapMaker.images[tileType] = canvas;
        this.config.selectedTileType = tileType;
    }

    getMouseTile() {
        const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);

        const tileX = Math.floor(worldPos.x / 32);
        const tileY = Math.floor(worldPos.y / 32);

        const regionX = Math.floor(tileX / 8);
        const regionY = Math.floor(tileY / 8);

        const localX = ((tileX % 8) + 8) % 8;
        const localY = ((tileY % 8) + 8) % 8;

        return {
            tileX,
            tileY,
            regionX,
            regionY,
            localX,
            localY,
            key: `${regionX}_${regionY}_${localX}_${localY}`
        };
    }
    getMousePixel() {
        const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);
        return {
            x: Math.floor(worldPos.x),
            y: Math.floor(worldPos.y)
        };
    }
    selectFloodFillArea() {
        const pixel = this.getMousePixel();

        const tileX = Math.floor(pixel.x / 32);
        const tileY = Math.floor(pixel.y / 32);
        const regionX = Math.floor(tileX / 8);
        const regionY = Math.floor(tileY / 8);

        if (regionX < 0 || regionY < 0) return;

        const region = this.mapMaker.map[`${regionX}_${regionY}`];
        const tile = region?.tiles[tileY % 8][tileX % 8];

        if (!tile || tile === "") return;

        const image = this.getEditableImage(tile[0]);
        if (!image) return;

        const ctx = image.getContext("2d");
        const imageData = ctx.getImageData(0, 0, 32, 32);
        const data = imageData.data;

        const startX = ((pixel.x % 32) + 32) % 32;
        const startY = ((pixel.y % 32) + 32) % 32;
        const startIndex = (startY * 32 + startX) * 4;

        const target = [
            data[startIndex],
            data[startIndex + 1],
            data[startIndex + 2],
            data[startIndex + 3]
        ];

        const matches = (x, y) => {
            if (x < 0 || x >= 32 || y < 0 || y >= 32) return false;

            const i = (y * 32 + x) * 4;

            return (
                data[i] === target[0] &&
                data[i + 1] === target[1] &&
                data[i + 2] === target[2] &&
                data[i + 3] === target[3]
            );
        };

        const visited = new Uint8Array(32 * 32);
        const stack = [[startX, startY]];
        const selection = [];

        while (stack.length) {
            const [x, y] = stack.pop();
            const index = y * 32 + x;

            if (visited[index]) continue;
            visited[index] = 1;

            if (!matches(x, y)) continue;

            selection.push(
                `${tileX * 32 + x}_${tileY * 32 + y}`
            );

            if (x > 0) stack.push([x - 1, y]);
            if (x < 31) stack.push([x + 1, y]);
            if (y > 0) stack.push([x, y - 1]);
            if (y < 31) stack.push([x, y + 1]);
        }

        this.mapMaker.pixelSelection = selection;
    }
    loadKeymap(){
        this.mapMaker.keyMap = {
            // rect tool
            "Shift": { 
                action: () => { 
                    this.config.shift = true; 
                    if (!this.mouse.extraData.shiftPos){
                        const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);
                        this.mouse.extraData.shiftPos = worldPos;
                    }
                }, type: "hold", 
                "release-action": () => { 
                    this.brush(this.mouse.getPos(), "select");
                    this.config.shift = false;
                    this.mouse.extraData.shiftPos = null; 
                } 
            },
            // toggle select instead of draw
            "Alt": { action: () => { 
                this.config.alt = true; 
                const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);
                const tileX = Math.floor(worldPos.x / 32);
                const tileY = Math.floor(worldPos.y / 32);
                const regionX = Math.floor(tileX / 8);
                const regionY = Math.floor(tileY / 8);
                this.config.lastPicked = { regionX, regionY, tileX: tileX % 8, tileY: tileY % 8 };
            }, type: "hold", "release-action": () => { 
                if (this.mouse.extraData.shiftPos) {
                    this.brush(this.mouse.getPos(), "select");
                }
                this.config.alt = false; 
            } },
            // pan camera
            "ArrowUp": { action: () => { this.mapMaker.camera.vy -= this.mapMaker.camera.speed; }, type: "hold" },
            "ArrowLeft": { action: () => { this.mapMaker.camera.vx -= this.mapMaker.camera.speed; }, type: "hold" },
            "ArrowDown": { action: () => { this.mapMaker.camera.vy += this.mapMaker.camera.speed; }, type: "hold" },
            "ArrowRight": { action: () => { this.mapMaker.camera.vx += this.mapMaker.camera.speed; }, type: "hold" },
            // brush size
            "1": { action: () => { this.config.brushSize = 1; }, type: "tap" },
            "2": { action: () => { this.config.brushSize = 2; }, type: "tap" },
            "3": { action: () => { this.config.brushSize = 3; }, type: "tap" },
            "4": { action: () => { this.config.brushSize = 4; }, type: "tap" },
            "5": { action: () => { this.config.brushSize = 5; }, type: "tap" },
            "6": { action: () => { this.setPixelColorMode("value"); }, type: "tap" },
            "7": { action: () => { this.setPixelColorMode("saturation"); }, type: "tap" },
            "8": { action: () => { this.setPixelColorMode("hue"); }, type: "tap" },
            "9": { action: () => { this.config.brushSize = 9; }, type: "tap" },
            "0": { action: () => { this.config.brushSize = 10;}, type: "tap" },
            "-": { action: () => { this.changePixelStep(-1); }, type: "tap" },
            "_": { action: () => { this.changePixelStep(-1); }, type: "tap" },
            "+": { action: () => { this.changePixelStep(1); }, type: "tap" },
            "=": { action: () => { this.changePixelStep(1); }, type: "tap" },
            "h": { action: () => { this.adjustSelectedPixels(this.config.pixelColorMode, this.config.pixelStep); }, type: "tap" },
            "k": { action: () => { this.adjustSelectedPixels(this.config.pixelColorMode, -this.config.pixelStep); }, type: "tap" },
            "n": { action: () => { this.adjustSelectedPixels("noise", this.config.pixelStep); }, type: "tap" },
            // fill
           "f": {
                action: () => {
                    if (this.config.alt) {
                        this.selectFloodFillArea();
                        return;
                    }
                    if (this.mapMaker.pixelSelection.length) {
                        this.fillSelectedPixels();
                        return;
                    }
                    this.mapMaker.captureUndoSnapshot();
                    const pixel = this.getMousePixel();
                    const tileX = Math.floor(pixel.x / 32);
                    const tileY = Math.floor(pixel.y / 32);
                    const regionX = Math.floor(tileX / 8);
                    const regionY = Math.floor(tileY / 8);
                    const key = `${regionX}_${regionY}`;
                    const region = this.mapMaker.map[key];

                    if (!region) return;

                    const tile = region.tiles[tileY % 8][tileX % 8];
                    if (tile === "") return;

                    const image = this.getEditableImage(tile[0]);
                    if (!image) return;

                    const pixelX = pixel.x % 32;
                    const pixelY = pixel.y % 32;
                    const ctx = image.getContext("2d");
                    const imageData = ctx.getImageData(0, 0, 32, 32);
                    const data = imageData.data;
                    const startIndex = (pixelY * 32 + pixelX) * 4;

                    const target = [
                        data[startIndex],
                        data[startIndex + 1],
                        data[startIndex + 2],
                        data[startIndex + 3]
                    ];

                    const colorCtx = document.createElement("canvas").getContext("2d");
                    colorCtx.fillStyle = this.config.selectedColor;
                    colorCtx.fillRect(0, 0, 1, 1);
                    const replacement = colorCtx.getImageData(0, 0, 1, 1).data;

                    if (
                        target[0] === replacement[0] &&
                        target[1] === replacement[1] &&
                        target[2] === replacement[2] &&
                        target[3] === replacement[3]
                    ) {
                        return;
                    }

                    const stack = [[pixelX, pixelY]];

                    while (stack.length) {
                        const [x, y] = stack.pop();
                        const index = (y * 32 + x) * 4;

                        if (
                            data[index] !== target[0] ||
                            data[index + 1] !== target[1] ||
                            data[index + 2] !== target[2] ||
                            data[index + 3] !== target[3]
                        ) {
                            continue;
                        }

                        data[index] = replacement[0];
                        data[index + 1] = replacement[1];
                        data[index + 2] = replacement[2];
                        data[index + 3] = replacement[3];

                        if (x > 0) stack.push([x - 1, y]);
                        if (x < 31) stack.push([x + 1, y]);
                        if (y > 0) stack.push([x, y - 1]);
                        if (y < 31) stack.push([x, y + 1]);
                    }

                    ctx.putImageData(imageData, 0, 0);
                    this.queueRegion(key, region.tiles);
                    this.updateRegions();
                },
                type: "tap"
            },
            // eyedropper
            "Control": {
                action: () => {
                    if (this.config.ctrl) return;
                    this.config.ctrl = true;
                    this.mouse.trackpadScrollDistance = 0;
                    if (!this.mouse.trackpadMode) {
                        this.pickColor();
                        this.mapMaker.updatePixelColorPicker(this.config.selectedColor);
                    }
                },
                "release-action": () => {
                    this.config.ctrl = false;
                    if (this.mouse.trackpadMode && this.mouse.trackpadScrollDistance < 30) {
                        this.pickColor();
                        this.mapMaker.updatePixelColorPicker(this.config.selectedColor);
                    }
                },
                type: "hold"
            },
            // delete
            "x": {
                action: () => {
                    this.mapMaker.captureUndoSnapshot();
                    for (const key in this.mapMaker.map) {
                        let changed = false;
                        const oldTiles = this.mapMaker.map[key]["tiles"];

                        for (let row = 0; row < 8; row++) {
                            for (let col = 0; col < 8; col++) {
                                const tile = oldTiles[row][col];

                                if (tile !== "" && tile[1] === "selected") {
                                    if (!changed) {
                                        this.queueRegion(key, oldTiles);
                                        changed = true;
                                    }

                                    oldTiles[row][col] = "";
                                }
                            }
                        }
                    }

                    for (const key in this.mapMaker.map) {
                        if (this.mapMaker.map[key]["tiles"].every(row => row.every(tile => tile === ""))) {
                            delete this.mapMaker.map[key];
                        }
                    }
                    const selectedByTile = new Map();
                    for (const pixel of this.mapMaker.pixelSelection) {
                        const [pixelX, pixelY] = pixel.split("_").map(Number);
                        const tileX = Math.floor(pixelX / 32);
                        const tileY = Math.floor(pixelY / 32);
                        const region = this.mapMaker.map[`${Math.floor(tileX / 8)}_${Math.floor(tileY / 8)}`];
                        const tile = region?.tiles[((tileY % 8) + 8) % 8][((tileX % 8) + 8) % 8];
                        if (!tile || tile === "") continue;
                        const imagePixels = selectedByTile.get(tile[0]) || [];
                        imagePixels.push(`${((pixelX % 32) + 32) % 32}_${((pixelY % 32) + 32) % 32}`);
                        selectedByTile.set(tile[0], imagePixels);
                    }
                    for (const [tileType, pixels] of selectedByTile) {
                        const image = this.getEditableImage(tileType);
                        if (!image) continue;
                        const ctx = image.getContext("2d");
                        ctx.fillStyle = "#ffffff";
                        for (const pixel of pixels) {
                            const [x, y] = pixel.split("_").map(Number);
                            ctx.fillRect(x, y, 1, 1);
                        }
                    }
                    this.mapMaker.pixelSelection.length = 0;
                    this.updateRegions();
                },
                type: "tap"
            },
            // select or ctrl=save
            "s": {
                action: () => {
                    if (this.config.ctrl) {
                        this.mapMaker.save();
                        return;
                    }

                    this.selectSameColor();
                },
                type: "tap"
            },

            "o": {
                action: () => {
                    this.selectOutline();
                },
                type: "tap"
            },
            "l": {
                action: () => {
                    this.connectSelectedPixels();
                },
                type: "tap"
            },
            "/": {
                action: () => {
                    const sourceType = this.config.selectedTileType;
                    const source = this.getEditableImage(sourceType);
                    if (!source) return;

                    const tileType = `tile_${crypto.randomUUID()}`;
                    const canvas = document.createElement("canvas");
                    canvas.width = 32;
                    canvas.height = 32;

                    const ctx = canvas.getContext("2d");
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(source, 0, 0);

                    this.mapMaker.images[tileType] = canvas;
                    this.config.selectedTileType = tileType;

                    this.updateToolbar();
                },
                type: "tap"
            },
            "Backspace": {
                action: () => {
                    if (this.backspaceTimer) return;

                    this.backspaceTimer = setTimeout(() => {
                        this.backspaceTimer = null;

                        const tileType = this.config.selectedTileType;
                        if (!tileType || !this.mapMaker.images[tileType]) return;

                        // Remove the tile type from the image collection.
                        delete this.mapMaker.images[tileType];

                        // Remove all map references to this tile type.
                        for (const key in this.mapMaker.map) {
                            const region = this.mapMaker.map[key];

                            for (let row = 0; row < 8; row++) {
                                for (let col = 0; col < 8; col++) {
                                    const tile = region.tiles[row][col];

                                    if (tile !== "" && tile[0] === tileType) {
                                        region.tiles[row][col] = "";
                                    }
                                }
                            }
                        }

                        // Clear selection and refresh the interface.
                        this.config.selectedTileType = null;
                        this.updateToolbar();
                        this.updateRegions();
                    }, 1000);
                },
                "release-action": () => {
                    if (this.backspaceTimer) {
                        clearTimeout(this.backspaceTimer);
                        this.backspaceTimer = null;
                    }
                },
                type: "hold"
            },
        };
    }

    connectSelectedPixels() {
        const selection = this.mapMaker.pixelSelection;
        if (selection.length < 2) return;

        this.mapMaker.captureUndoSnapshot();

        const pixelsByImage = new Map();

        const addPixel = (x, y) => {
            if (x < 0 || y < 0) return;

            const tileX = Math.floor(x / 32);
            const tileY = Math.floor(y / 32);
            const regionX = Math.floor(tileX / 8);
            const regionY = Math.floor(tileY / 8);

            const region = this.mapMaker.map[`${regionX}_${regionY}`];
            const tile = region?.tiles[tileY % 8][tileX % 8];

            if (!tile || tile === "") return;

            const coords = pixelsByImage.get(tile[0]) || new Set();
            coords.add(`${x % 32}_${y % 32}`);
            pixelsByImage.set(tile[0], coords);
        };

        const drawLine = (x0, y0, x1, y1) => {
            let dx = Math.abs(x1 - x0);
            let dy = Math.abs(y1 - y0);
            const sx = x0 < x1 ? 1 : -1;
            const sy = y0 < y1 ? 1 : -1;
            let error = dx - dy;

            while (true) {
                addPixel(x0, y0);

                if (x0 === x1 && y0 === y1) break;

                const twiceError = 2 * error;

                if (twiceError > -dy) {
                    error -= dy;
                    x0 += sx;
                }

                if (twiceError < dx) {
                    error += dx;
                    y0 += sy;
                }
            }
        };

        const points = selection.map(pixel =>
            pixel.split("_").map(Number)
        );

        // Connect consecutive points only; do not close the path.
        for (let i = 0; i < points.length - 1; i++) {
            drawLine(
                points[i][0],
                points[i][1],
                points[i + 1][0],
                points[i + 1][1]
            );
        }

        for (const [tileType, coords] of pixelsByImage) {
            const image = this.getEditableImage(tileType);
            if (!image) continue;

            const ctx = image.getContext("2d");
            const imageData = ctx.getImageData(0, 0, 32, 32);

            for (const coordinate of coords) {
                const [x, y] = coordinate.split("_").map(Number);
                const index = (y * 32 + x) * 4;

                const color = this.rgbToHsv(
                    imageData.data[index],
                    imageData.data[index + 1],
                    imageData.data[index + 2]
                );

                // Use the selected brush color for the connecting line.
                const colorCanvas = document.createElement("canvas");
                colorCanvas.width = 1;
                colorCanvas.height = 1;
                const colorCtx = colorCanvas.getContext("2d");
                colorCtx.fillStyle = this.config.selectedColor;
                colorCtx.fillRect(0, 0, 1, 1);

                const rgba = colorCtx.getImageData(0, 0, 1, 1).data;

                imageData.data[index] = rgba[0];
                imageData.data[index + 1] = rgba[1];
                imageData.data[index + 2] = rgba[2];
                imageData.data[index + 3] = rgba[3];
            }

            ctx.putImageData(imageData, 0, 0);
        }

        this.updateToolbar();
        this.mapMaker.showPixelStepStatus();
    }

    selectSameColor() {
        const pixel = this.getMousePixel();
        const tileX = Math.floor(pixel.x / 32);
        const tileY = Math.floor(pixel.y / 32);
        const regionX = Math.floor(tileX / 8);
        const regionY = Math.floor(tileY / 8);

        if (regionX < 0 || regionY < 0) return;

        const region = this.mapMaker.map[`${regionX}_${regionY}`];
        const tile = region?.tiles[tileY % 8][tileX % 8];

        if (!tile || tile === "") return;

        const image = this.getEditableImage(tile[0]);
        if (!image) return;

        const ctx = image.getContext("2d");
        const data = ctx.getImageData(0, 0, 32, 32).data;

        const localX = ((pixel.x % 32) + 32) % 32;
        const localY = ((pixel.y % 32) + 32) % 32;
        const start = (localY * 32 + localX) * 4;

        const target = [
            data[start],
            data[start + 1],
            data[start + 2],
            data[start + 3]
        ];

        const selection = [];

        // Select matching pixels within this tile instance.
        for (let y = 0; y < 32; y++) {
            for (let x = 0; x < 32; x++) {
                const i = (y * 32 + x) * 4;

                if (
                    data[i] === target[0] &&
                    data[i + 1] === target[1] &&
                    data[i + 2] === target[2] &&
                    data[i + 3] === target[3]
                ) {
                    selection.push(`${tileX * 32 + x}_${tileY * 32 + y}`);
                }
            }
        }

        this.mapMaker.pixelSelection = selection;
    }

    selectOutline() {
        const selection = this.mapMaker.pixelSelection;
        if (!selection.length) return;

        const selected = new Set(selection);
        const outline = [];

        // Four-connected neighbors: up, down, left, right.
        const neighbors = [
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0]
        ];

        for (const coordinate of selected) {
            const [x, y] = coordinate.split("_").map(Number);

            const isBorder = neighbors.some(([dx, dy]) =>
                !selected.has(`${x + dx}_${y + dy}`)
            );

            if (isBorder) {
                outline.push(coordinate);
            }
        }

        this.mapMaker.pixelSelection = outline;
    }

    fillSelectedPixels() {
        const selection = this.mapMaker.pixelSelection;
        if (!selection.length) return false;

        this.mapMaker.captureUndoSnapshot();

        // Group edits by tile image to avoid repeatedly accessing canvases.
        const pixelsByImage = new Map();

        for (const coordinate of selection) {
            const [x, y] = coordinate.split("_").map(Number);

            const tileX = Math.floor(x / 32);
            const tileY = Math.floor(y / 32);
            const regionX = Math.floor(tileX / 8);
            const regionY = Math.floor(tileY / 8);

            if (regionX < 0 || regionY < 0) continue;

            const region = this.mapMaker.map[`${regionX}_${regionY}`];
            const tile = region?.tiles[tileY % 8][tileX % 8];

            if (!tile || tile === "") continue;

            const localX = ((x % 32) + 32) % 32;
            const localY = ((y % 32) + 32) % 32;

            const coords = pixelsByImage.get(tile[0]) || new Set();
            coords.add(`${localX}_${localY}`);
            pixelsByImage.set(tile[0], coords);
        }

        for (const [tileType, coords] of pixelsByImage) {
            const image = this.getEditableImage(tileType);
            if (!image) continue;

            const ctx = image.getContext("2d");
            ctx.fillStyle = this.config.selectedColor;

            for (const coordinate of coords) {
                const [x, y] = coordinate.split("_").map(Number);
                ctx.fillRect(x, y, 1, 1);
            }
        }

        this.updateToolbar();
        this.mapMaker.showPixelStepStatus();

        return true;
    }

    adjustSelectedPixels(mode, amount) {
        if (!this.mapMaker.pixelSelection.length) {
        const colorCanvas = document.createElement("canvas");
        colorCanvas.width = 1;
        colorCanvas.height = 1;

        const colorContext = colorCanvas.getContext("2d");

        // Validate and normalize the configured brush color.
        colorContext.fillStyle = "#000000";
        colorContext.fillStyle = this.config.selectedColor;

        const normalizedColor = colorContext.fillStyle;
        console.log("Brush color:", this.config.selectedColor);
        console.log("Normalized color:", normalizedColor);

        colorContext.clearRect(0, 0, 1, 1);
        colorContext.fillStyle = normalizedColor;
        colorContext.fillRect(0, 0, 1, 1);

        const pixel = colorContext.getImageData(0, 0, 1, 1).data;

        const color = this.rgbToHsv(pixel[0], pixel[1], pixel[2]);
        this.adjustColor(color, mode, amount);

        const rgb = this.hsvToRgb(color[0], color[1], color[2]);
        const alpha = pixel[3] === 0 ? 1 : pixel[3] / 255;

        this.config.selectedColor =
            `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;

        this.mapMaker.updatePixelColorPicker(this.config.selectedColor);
        this.mapMaker.showPixelStepStatus();
        return;
    }
        this.mapMaker.captureUndoSnapshot();

        const pixelsByImage = new Map();
        for (const selectedPixel of this.mapMaker.pixelSelection) {
            const [worldX, worldY] = selectedPixel.split("_").map(Number);
            const tileX = Math.floor(worldX / 32);
            const tileY = Math.floor(worldY / 32);
            const region = this.mapMaker.map[`${Math.floor(tileX / 8)}_${Math.floor(tileY / 8)}`];
            const tile = region?.tiles[((tileY % 8) + 8) % 8][((tileX % 8) + 8) % 8];
            if (!tile || tile === "") continue;
            const coords = pixelsByImage.get(tile[0]) || new Set();
            coords.add(`${((worldX % 32) + 32) % 32}_${((worldY % 32) + 32) % 32}`);
            pixelsByImage.set(tile[0], coords);
        }

        for (const [tileType, coords] of pixelsByImage) {
            const image = this.getEditableImage(tileType);
            if (!image) continue;
            const ctx = image.getContext("2d");
            const imageData = ctx.getImageData(0, 0, 32, 32);
            for (const coordinate of coords) {
                const [x, y] = coordinate.split("_").map(Number);
                const index = (y * 32 + x) * 4;
                const color = this.rgbToHsv(
                    imageData.data[index],
                    imageData.data[index + 1],
                    imageData.data[index + 2]
                );
                this.adjustColor(color, mode, amount);
                const rgb = this.hsvToRgb(color[0], color[1], color[2]);
                imageData.data[index] = rgb[0];
                imageData.data[index + 1] = rgb[1];
                imageData.data[index + 2] = rgb[2];
            }
            ctx.putImageData(imageData, 0, 0);
        }
        const firstPixel = this.mapMaker.pixelSelection[0]?.split("_").map(Number);
        if (firstPixel) {
            const tileX = Math.floor(firstPixel[0] / 32);
            const tileY = Math.floor(firstPixel[1] / 32);
            const region = this.mapMaker.map[`${Math.floor(tileX / 8)}_${Math.floor(tileY / 8)}`];
            const tile = region?.tiles[((tileY % 8) + 8) % 8][((tileX % 8) + 8) % 8];
            const image = tile && tile !== "" ? this.getEditableImage(tile[0]) : null;
            if (image) {
                const pixel = image.getContext("2d").getImageData(
                    ((firstPixel[0] % 32) + 32) % 32,
                    ((firstPixel[1] % 32) + 32) % 32,
                    1,
                    1
                ).data;
                this.config.selectedColor = `rgba(${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${pixel[3] / 255})`;
                this.mapMaker.updatePixelColorPicker(this.config.selectedColor);
            }
        }
        this.mapMaker.showPixelStepStatus();
    }

    adjustColor(color, mode, amount) {
        if (mode === "value") color[2] = Math.max(0, Math.min(100, color[2] + amount));
        if (mode === "saturation") color[1] = Math.max(0, Math.min(100, color[1] + amount));
        if (mode === "hue") color[0] = (color[0] + amount + 360) % 360;
        if (mode === "noise") color[2] = Math.max(0, Math.min(100, color[2] + (Math.random() < 0.5 ? -amount : amount)));
    }

    changePixelStep(direction) {
        const steps = [1, 2, 3, 5, 7, 10];
        let index = steps.indexOf(this.config.pixelStep);
        if (index === -1) index = steps.indexOf(5);
        index = (index + direction + steps.length) % steps.length;
        this.config.pixelStep = steps[index];
        this.mapMaker.showPixelStepStatus();
    }

    setPixelColorMode(mode) {
        this.config.pixelColorMode = mode;
        this.mapMaker.showPixelStepStatus();
    }

    rgbToHsv(red, green, blue) {
        red /= 255;
        green /= 255;
        blue /= 255;
        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        const delta = max - min;
        const value = max;
        if (delta === 0) return [0, 0, value * 100];
        const saturation = max === 0 ? 0 : delta / max;
        let hue = 0;
        if (max === red) hue = ((green - blue) / delta) % 6;
        else if (max === green) hue = (blue - red) / delta + 2;
        else hue = (red - green) / delta + 4;
        return [(hue * 60 + 360) % 360, saturation * 100, value * 100];
    }

    hsvToRgb(hue, saturation, value) {
        saturation /= 100;
        value /= 100;
        const chroma = value * saturation;
        const segment = hue / 60;
        const intermediate = chroma * (1 - Math.abs(segment % 2 - 1));
        const match = value - chroma;
        let red = 0; let green = 0; let blue = 0;
        if (segment < 1) [red, green] = [chroma, intermediate];
        else if (segment < 2) [red, green] = [intermediate, chroma];
        else if (segment < 3) [green, blue] = [chroma, intermediate];
        else if (segment < 4) [green, blue] = [intermediate, chroma];
        else if (segment < 5) [red, blue] = [intermediate, chroma];
        else [red, blue] = [chroma, intermediate];
        return [red, green, blue].map(channel => Math.round((channel + match) * 255));
    }
    updateToolbar() {
        const tileContainer = document.getElementById("tileContainer");
        if (!tileContainer) return;

        for (const tileType in this.mapMaker.images) {
            const source = this.mapMaker.images[tileType];
            let img = document.getElementById(tileType);

            if (!img) {
                img = document.createElement("img");
                img.id = tileType;
                img.classList.add("tile");
                img.draggable = true;

                img.addEventListener("dragstart", (e) => {
                    e.dataTransfer.setData("text/plain", tileType);
                });

                img.addEventListener("click", () => {
                    this.config.selectedTileType = tileType;
                    this.updateToolbar();
                });

                tileContainer.appendChild(img);
            }

            // Refresh the thumbnail from the current canvas/image.
            if (source instanceof HTMLCanvasElement) {
                img.src = source.toDataURL();
            } else if (source) {
                img.src = source.src;
            }

            if (this.config.selectedTileType === tileType) {
                img.classList.add("selected");
            } else {
                img.classList.remove("selected");
            }
        }

        for (const img of tileContainer.querySelectorAll(".tile")) {
            if (!this.mapMaker.images[img.id]) {
                img.remove();
            }
        }
    }
    
    loadMouse(mouse){
        this.mouse = mouse;
        this.mouse.hook("left-down", "pixel-undo-snapshot", () => {
            this.mapMaker.captureUndoSnapshot();
        }, -300);
        this.mouse.hook("right-down", "pixel-undo-snapshot", () => {
            this.mapMaker.captureUndoSnapshot();
        }, -300);
        // preview for pasting clipboard
        this.mouse.hook("right-hold", "tile-clipboard-preview", (pos)=>{
            if (this.config.showPreview) {
                this.config.showPreview = false;
                this.mouse.pause("right");
            }
        },2)
        // delete all selected tiles
        this.mouse.hook("right-down","pixel-clear-selection",(pos)=>{
            if (this.config.alt || !this.mapMaker.pixelSelection.length) return;
            this.deselectAll();
            this.mouse.pause("right");
        }, 2);
        this.mouse.hook("right-down","tile-delete-selected",(pos)=>{
            if (this.config.selectionExists && !this.config.alt) {
                for (const key in this.mapMaker.map) {
                    for (let row = 0; row < 8; row++) {
                        for (let col = 0; col < 8; col++) {
                            if (this.mapMaker.map[key]["tiles"][row][col] !== "" && this.mapMaker.map[key]["tiles"][row][col][1] === "selected") {
                                this.mapMaker.map[key]["tiles"][row][col][1] = "";
                            }
                        }
                    }
                }
                this.mouse.pause("right");
            }
        },3)
        // brush logic
        this.mouse.hook("right-hold", "tile-brush-remove", this.brush.bind(this), 5);
        this.mouse.hook("left-hold", "tile-brush", this.brush.bind(this), 5);
    }

    deselectAll() {
        this.mapMaker.pixelSelection.length = 0;
    }

    update() {
        let selectionExists = false;

        for (const key in this.mapMaker.map) {
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    const tile = this.mapMaker.map[key].tiles[row][col];

                    if (tile !== "" && tile[1] === "selected") {
                        selectionExists = true;
                        break;
                    }
                }

                if (selectionExists) break;
            }

            if (selectionExists) break;
        }

        this.config.selectionExists = selectionExists;
        this.config.pixelSelectionExists = this.mapMaker.pixelSelection.length > 0;

        this.updateToolbar();
    }

    isSelection(){
        return this.config.selectionExists;
    }

    queueRegion(key, tiles){
        if (this.queue.has(key)) return;

        this.queue.set(key, tiles.map(row => row.map(tile => Array.isArray(tile) ? [...tile] : tile)));
    }
    
    updateRegions(){
        const addRegionType = (hash, tiles) => {
            const regionType = this.mapMaker.regionTypes.get(hash);
            if (regionType) {
                regionType.count += 1;
                return;
            }

            this.mapMaker.regionTypes.set(hash, {
                count: 1,
                tiles: tiles.map(row => row.map(tile => Array.isArray(tile) ? [...tile] : tile))
            });
        };

        const removeRegionType = (hash) => {
            const regionType = this.mapMaker.regionTypes.get(hash);
            if (!regionType) return;
            if (hash === this.config.selectedRegionType) return; // don't remove the selected region type

            if (regionType.count <= 1) this.mapMaker.regionTypes.delete(hash);
            else regionType.count -= 1;
        };

        for (const [key, oldTiles] of this.queue) {
            const oldHash = hashTiles(oldTiles);
            const region = this.mapMaker.map[key];

            if (region) {
                const newHash = hashTiles(region.tiles);

                if (oldHash !== newHash) {
                    removeRegionType(oldHash);
                    addRegionType(newHash, region.tiles);
                }
            } else {
                removeRegionType(oldHash);
            }
        }

        this.queue.clear();

        const detailsBox = document.getElementById('detailsBox');
        detailsBox.innerText = `${this.mapMaker.regionTypes.size}`;
    }

    /**
     * Centers the camera on a tile.
     * @param {number} rx - Region X coordinate.
     * @param {number} ry - Region Y coordinate.
     * @param {number} localX - Local tile X coordinate.
     * @param {number} localY - Local tile Y coordinate.
     */
    centerCamera(key) {
        console.log(key)
        const [rx, ry, localX, localY] = key.split('_').map(Number);
        const worldX = (rx * 8 + localX + 0.5) * 32 * this.mapMaker.camera.zoom * this.mapMaker.dpi;
        const worldY = (ry * 8 + localY + 0.5) * 32 * this.mapMaker.camera.zoom * this.mapMaker.dpi;
        const viewportWidth = this.mapMaker.canvas.width / this.mapMaker.dpi
        const viewportHeight = this.mapMaker.canvas.height / this.mapMaker.dpi
        this.mapMaker.camera.x = (worldX - viewportWidth / 2) / this.mapMaker.camera.zoom;
        this.mapMaker.camera.y = (worldY - viewportHeight / 2) / this.mapMaker.camera.zoom;
    }
}
/**
 * Hashes the tiles in a region.
 * @param {*} tiles 
 * @returns 
 */
function hashTiles(tiles){
    let hash = 2166136261;

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const tile = tiles[y][x];

            if (tile === "") {
                hash ^= 0;
            } else {
                hash ^= stringHash(tile[0]);
            }

            hash = Math.imul(hash, 16777619);
        }
    }

    return hash >>> 0;
}

function stringHash(value){
    let hash = 2166136261;

    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}