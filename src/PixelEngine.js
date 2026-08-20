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
                if (this.config.lastPickedRegion && this.mapMaker.map[lastKey]?.["groups"] && Object.keys(this.mapMaker.map[lastKey]["groups"]).length > 0 && this.config.selectedRegionType!== "delete") {
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
            // Pixel selection will go here, if I ever add it in
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

                ctx.fillStyle = this.mouse.get("right") ? "#ffffff" : this.config.selectedColor;
                ctx.fillRect(minX, minY, maxX - minX + 1, maxY - minY + 1);
                // if editing 'delete', right click should delete
                if (this.config.selectedTileType === "delete" && this.mouse.get("right")) {
                    ctx.clearRect(minX, minY, maxX - minX + 1, maxY - minY + 1);
                }
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
            "6": { action: () => { this.config.brushSize = 6; }, type: "tap" },
            "7": { action: () => { this.config.brushSize = 7; }, type: "tap" },
            "8": { action: () => { this.config.brushSize = 8; }, type: "tap" },
            "9": { action: () => { this.config.brushSize = 9; }, type: "tap" },
            "0": { action: () => { this.config.brushSize = 10;}, type: "tap" },
            // fill
           "f": {
                action: () => {
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
                    this.config.ctrl = true;
                    this.pickColor();
                    this.mapMaker.colorSliderEvent(this.config.selectedColor, false, true);
                },
                "release-action": () => {
                    this.config.ctrl = false;
                },
                type: "hold"
            },
            // delete
            "x": {
                action: () => {
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
                    this.updateRegions();
                },
                type: "tap"
            },
            // select or ctrl=save
            "s":{
                action: () => {
                    if(this.config.ctrl){
                        // save the current map
                        this.mapMaker.save();
                        return;
                    }
                },
                type: "tap"
            },
            "Backspace": {
                action: () => {
                    const tileType = this.config.selectedTileType;
                    if (!tileType || !this.mapMaker.images[tileType] || tileType === "delete" || tileType === "addTile") {
                        return;
                    }

                    delete this.mapMaker.images[tileType];

                    for (const key in this.mapMaker.map) {
                        const region = this.mapMaker.map[key];
                        let changed = false;

                        for (let row = 0; row < 8; row++) {
                            for (let col = 0; col < 8; col++) {
                                const tile = region.tiles[row][col];

                                if (tile !== "" && tile[0] === tileType) {
                                    if (!changed) {
                                        this.queueRegion(key, region.tiles);
                                        changed = true;
                                    }

                                    region.tiles[row][col] = "";
                                }
                            }
                        }
                    }

                    this.config.selectedTileType = "delete";
                    this.updateRegions();
                    this.updateToolbar();
                },
                type: "tap"
            },
            // Annotate
            "n": {
                action: () => {
                    const notes = document.getElementById("notes");
                    notes.classList.toggle("hide");
                },
                type: "tap"
            }
            
        };
    }
    updateToolbar() {
        const tileContainer = document.getElementById("tileContainer");

        for (const tileType in this.mapMaker.images) {
            let img = document.getElementById(tileType);

            if (!img) {
                const source = this.mapMaker.images[tileType];
                img = document.createElement("img");

                if (source.toDataURL) {
                    img.src = source.toDataURL();
                } else {
                    img.src = source.src;
                }

                img.id = tileType;
                img.classList.add("tile");
                img.draggable = true;

                img.addEventListener("dragstart", (e) => {
                    e.dataTransfer.setData("text/plain", tileType);
                });

                img.addEventListener("click", () => {
                    this.config.selectedTileType = tileType;
                });

                tileContainer.appendChild(img);
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
        // preview for pasting clipboard
        this.mouse.hook("right-hold", "tile-clipboard-preview", (pos)=>{
            if (this.config.showPreview) {
                this.config.showPreview = false;
                this.mouse.pause("right");
            }
        },2)
        // delete all selected tiles
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

        this.updateToolbar();
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