import { zipFiles, resizeCanvas } from './helpers.js';


class App {
    constructor() {
        /**
         * @type {HTMLCanvasElement}
         */
        this.canvas = document.getElementById('mapCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.lastTime = 0;
        this.maxFPS = 60; 
    }
    loop() {
        const now = performance.now();
        this.lastTime = now;
        while (now - this.lastTime > 1000 / this.maxFPS) {
            // stall, so fps is capped at 60
        }
        this.update();
        this.draw();
        requestAnimationFrame(this.loop.bind(this));
    }
    update(){

    }
    draw(){

    }
}
class MapMaker extends App{
    constructor() {
        super();
        this.dpi = resizeCanvas();
        window.addEventListener('resize', () => {
            this.dpi = resizeCanvas();
        });
        this.images = {};
        
        // camera
        this.camera = {
            "x": 0,
            "y": 0,
            "vx": 0,
            "vy": 0,
            "speed": 2
        }

        // map  "x_y" = 8x8 region of the map, row:[col:[tile type, selected || ""]] 
        this.map = {
        }
        this.notes = { // "rx_ry_x_y" = note text

        }
        this.lastPicked = null;

        // selection logic
        this.selectedTileType = "floor";
        this.brushSize = 1; // brush size in tiles
        this.saver = new Saver();
        this.saver.saveHook = () => {
            this.saver.saveFile = {
                map: this.map,
                camera: this.camera,
                notes: this.notes,
                selectedTileType: this.selectedTileType,
                brushSize: this.brushSize
            }
        }
        this.saver.load((save) => {
            if (save.map) this.map = save.map;
            if (save.camera) this.camera = save.camera;
            if (save.selectedTileType) this.selectedTileType = save.selectedTileType;
            if (save.brushSize) this.brushSize = save.brushSize;
            if (save.notes) this.notes = save.notes;
        });
        this.saver.startAutosave();
    }
    async load() {
        const files = {
            "delete": "assets/delete.png",
            "floor": "assets/floor.png",
            "wall": "assets/wall.png",
            "marker": "assets/marker.png",
        }
        for (const [key, value] of Object.entries(files)) {
            const img = new Image();
            img.src = value;
            await new Promise((resolve) => {
                img.onload = resolve;
            });
            this.images[key] = img;
        }

        // assign camera keymap (wasd, arrows)
        this.loadKeymap();
        this.loadButtons();
    }
    loadKeymap(){
        this.shift = false;
        this.alt = false;
        this.ctrl = false;

        this.showPreview = null;
        this.keyMap = {
            "Shift": { action: () => { this.shift = true; }, type: "hold", "release-action": () => { this.shift = false; } },
            "Alt": { action: () => { 
                this.alt = true; 
                    const worldPos = this.screenToWorld(this.mouse.x, this.mouse.y);
                    const tileX = Math.floor(worldPos.x / 32);
                    const tileY = Math.floor(worldPos.y / 32);
                    const regionX = Math.floor(tileX / 8);
                    const regionY = Math.floor(tileY / 8);
                    this.selectNoteTile();
                    this.lastPicked = { regionX, regionY, tileX: tileX % 8, tileY: tileY % 8 };
            }, type: "hold", "release-action": () => { this.alt = false; } },

            "ArrowUp": { action: () => { this.camera.vy -= this.camera.speed; }, type: "hold" },
            "ArrowLeft": { action: () => { this.camera.vx -= this.camera.speed; }, type: "hold" },
            "ArrowDown": { action: () => { this.camera.vy += this.camera.speed; }, type: "hold" },
            "ArrowRight": { action: () => { this.camera.vx += this.camera.speed; }, type: "hold" },

            "1": { action: () => { this.brushSize = 1; }, type: "tap" },
            "2": { action: () => { this.brushSize = 2; }, type: "tap" },
            "3": { action: () => { this.brushSize = 3; }, type: "tap" },
            "4": { action: () => { this.brushSize = 4; }, type: "tap" },
            "5": { action: () => { this.brushSize = 5; }, type: "tap" },
            "6": { action: () => { this.brushSize = 6; }, type: "tap" },
            "7": { action: () => { this.brushSize = 7; }, type: "tap" },
            "8": { action: () => { this.brushSize = 8; }, type: "tap" },
            "9": { action: () => { this.brushSize = 9; }, type: "tap" },
            "0": { action: () => { this.brushSize = 10; }, type: "tap" },

            "e": {
                action: () => {
                    const keys = Object.keys(this.images);
                    const currentIndex = keys.indexOf(this.selectedTileType);
                    const nextIndex = (currentIndex + 1) % keys.length;
                    this.selectedTileType = keys[nextIndex];
                },
                type: "tap"
            },

            "q": {
                action: () => {
                    const keys = Object.keys(this.images);
                    const currentIndex = keys.indexOf(this.selectedTileType);
                    const nextIndex = (currentIndex - 1 + keys.length) % keys.length;
                    this.selectedTileType = keys[nextIndex];
                },
                type: "tap"
            },

            "f": {
                action: () => {
                    const worldPos = this.screenToWorld(this.mouse.x, this.mouse.y);
                    const tileX = Math.floor(worldPos.x / 32);
                    const tileY = Math.floor(worldPos.y / 32);
                    this.fill(this.selectedTileType, tileX, tileY);
                },
                type: "tap"
            },
            "Control": {
                action: () => {
                    this.ctrl = true; 
                    const worldPos = this.screenToWorld(this.mouse.x, this.mouse.y);
                    const tileX = Math.floor(worldPos.x / 32);
                    const tileY = Math.floor(worldPos.y / 32);
                    const regionX = Math.floor(tileX / 8);
                    const regionY = Math.floor(tileY / 8);
                    const key = `${regionX}_${regionY}`;

                    if (this.map[key]) {
                        this.selectedTileType = this.map[key][tileY % 8][tileX % 8][0];
                    }

                    if (this.selectedTileType === "") {
                        this.selectedTileType = "delete";
                    }
                    if (!this.selectedTileType) {
                        this.selectedTileType = "delete";
                    }
                    this.selectNoteTile();
                    this.lastPicked = { regionX, regionY, tileX: tileX % 8, tileY: tileY % 8 };
                },
                "release-action": () => { this.ctrl = false; },
                type: "hold"
            },
            "c": {
                action: () => {
                    this.clipboard = {};
                    // copy selected tiles to clipboard, store mouse world tile as well
                    // get region mouse is in
                    const worldPos = this.screenToWorld(this.mouse.x, this.mouse.y);
                    const tileX = Math.floor(worldPos.x / 32);
                    const tileY = Math.floor(worldPos.y / 32);
                    const regionX = Math.floor(tileX / 8);
                    const regionY = Math.floor(tileY / 8);
                    const key = `${regionX}_${regionY}`;
                    if (!this.map[key]) return;
                    this.clipboard.regionKey = key;
                    this.clipboard.tiles = [];
                    for (let row = 0; row < 8; row++) {
                        for (let col = 0; col < 8; col++) {
                            if (this.map[key][row][col] !== "" && this.map[key][row][col][1] === "selected") {
                                this.clipboard.tiles.push({ x: col, y: row, type: this.map[key][row][col][0] });
                            }
                        }
                    }
                    let mouseTileX = tileX % 8;
                    let mouseTileY = tileY % 8;
                    this.clipboard.mouseTile = { x: mouseTileX, y: mouseTileY };
                    console.log("copied to clipboard", this.clipboard);
                },
                type: "tap"
            },
            "v": {
                action: () => {
                    if (!this.clipboard) return;

                    if (!this.showPreview) {
                        this.showPreview = true;
                        return;
                    }

                    const worldPos = this.screenToWorld(this.mouse.x, this.mouse.y);
                    const tileX = Math.floor(worldPos.x / 32);
                    const tileY = Math.floor(worldPos.y / 32);

                    for (const tile of this.clipboard.tiles) {
                        const targetX = tileX + (tile.x - this.clipboard.mouseTile.x);
                        const targetY = tileY + (tile.y - this.clipboard.mouseTile.y);

                        const regionX = Math.floor(targetX / 8);
                        const regionY = Math.floor(targetY / 8);

                        const localX = ((targetX % 8) + 8) % 8;
                        const localY = ((targetY % 8) + 8) % 8;

                        const key = `${regionX}_${regionY}`;

                        if (!this.map[key]) {
                            this.map[key] = Array.from({ length: 8 }, () => Array(8).fill(""));
                        }

                        this.map[key][localY][localX] = [tile.type, ""];
                    }

                    this.showPreview = false;
                },
                type: "tap"
            },
            "x": {
                action: () => {
                    // remove all selected tiles
                    for (const key in this.map) {
                        for (let row = 0; row < 8; row++) {
                            for (let col = 0; col < 8; col++) {
                                if (this.map[key][row][col] !== "" && this.map[key][row][col][1] === "selected") {
                                    this.map[key][row][col] = "";
                                }
                            }
                        }
                    }
                    // remove empty regions
                    for (const key in this.map) {
                        if (this.map[key].every(row => row.every(tile => tile === ""))) {
                            delete this.map[key];
                        }
                    }
                },
                type: "tap"
            },
            "s":{
                action: () => {
                    if(this.ctrl){
                        // save the current map
                        this.saver.save({
                            map: this.map,
                            camera: this.camera,
                            selectedTileType: this.selectedTileType,
                            brushSize: this.brushSize
                        });
                        return;
                    }
                    // otherwise select tile, then fill select
                    this.keyMap["Control"]["action"]();
                    this.keyMap["Alt"]["action"]();
                    this.keyMap["f"]["action"]();
                    setTimeout(() => {
                        this.keyMap["Control"]["release-action"]();
                        this.keyMap["Alt"]["release-action"]();
                    }, 100);
                },
                type: "tap"
            },
            "o":{
                action: () => {
                    // outline selected - aka turn the outside tiles of the selected area into walls, and the inside into floor
                    for (const key in this.map) {
                        for (let row = 0; row < 8; row++) {
                            for (let col = 0; col < 8; col++) {
                                if (this.map[key][row][col] !== "" && this.map[key][row][col][1] === "selected") {
                                    // check if any of the 4 neighbors are not selected or empty
                                    const neighbors = [
                                        [row - 1, col],
                                        [row + 1, col],
                                        [row, col - 1],
                                        [row, col + 1]
                                    ];
                                    let isEdge = false;
                                    for (const [nRow, nCol] of neighbors) {
                                        if (nRow < 0 || nRow >= 8 || nCol < 0 || nCol >= 8) {
                                            isEdge = true;
                                            break;
                                        }
                                        if (this.map[key][nRow][nCol] === "" || this.map[key][nRow][nCol][1] !== "selected") {
                                            isEdge = true;
                                            break;
                                        }
                                    }
                                    if (isEdge) {
                                        this.map[key][row][col][0] = "wall";
                                    } else {
                                        this.map[key][row][col][0] = "floor";
                                    }
                                }
                            }
                        }
                    }
                },
                "type": "tap" 
            }
        };
        this.activeKeys = new Set();
        this.pausedKeys = new Set();
        window.addEventListener('keydown', (e) => {    
            if (!this.mouse.inside) return;        
            e.preventDefault();
            if (this.keyMap[e.key]) {
                this.activeKeys.add(e.key);
            }
        });
        window.addEventListener('keyup', (e) => {
            if (!this.mouse.inside) return;
            if (this.keyMap[e.key] && this.keyMap[e.key]["release-action"]) {
                this.keyMap[e.key]["release-action"]();
            }
            this.activeKeys.delete(e.key);
            this.pausedKeys.delete(e.key);
        });

        // mouse
        this.mouse = {
            x: 0,
            y: 0,
            left: false,
            right: false,
            inside: false,
            middle: false,
            delta: [0, 0],
            paused: {
                'left' : false,
                'right' : false,
                'middle' : false
            }
        }
        this.canvas.addEventListener('mouseenter', () => {
            this.mouse.inside = true;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.mouse.inside = false;

            // release buttons if leaving while dragging
            this.mouse.left = false;
            this.mouse.right = false;
            this.mouse.middle = false;

            this.mouse.delta[0] = 0;
            this.mouse.delta[1] = 0;
        });
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
            this.mouse.delta[0] = e.movementX;
            this.mouse.delta[1] = e.movementY;
             
            if (this.mouse.middle) {
                this.camera.x -= this.mouse.delta[0] / this.dpi;
                this.camera.y -= this.mouse.delta[1] / this.dpi;
            }
        });
        this.canvas.addEventListener('mousedown', (e) => {
            const arr = ["left", "middle", "right"];
            if (this.mouse.paused[arr[e.button]]) {
                return;
            }
            if (!this.mouse[arr[e.button]]) {
                this.mouse.delta[0] = 0;
                this.mouse.delta[1] = 0;
            }
            if (e.button === 0) this.mouse.left = true;
            if (e.button === 1) this.mouse.middle = true;
            if (e.button === 2) this.mouse.right = true;
        });
        this.canvas.addEventListener('mouseup', (e) => {
            const arr = ["left", "middle", "right"];
            this.mouse.paused[arr[e.button]] = false;
            this.mouse.delta[0] = 0;
            this.mouse.delta[1] = 0;
            if (e.button === 0) this.mouse.left = false;
            if (e.button === 1) this.mouse.middle = false;
            if (e.button === 2) this.mouse.right = false;
        });
        // context menu (right click) to select delete tile
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }
    loadButtons(){
        // save map button 
        const saveMapButton = document.getElementById('saveMapButton');
        saveMapButton.addEventListener('click', async () => {
            const canvas_images = [];
            for (const key in this.map) {
                const regionX = parseInt(key.split('_')[0]);
                const regionY = parseInt(key.split('_')[1]);
                const smallMap = this.map[key];
                const canvas = document.createElement('canvas');
                canvas.width = 8 * 32;
                canvas.height = 8 * 32;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                for (let y = 0; y < 8; y++) {
                    for (let x = 0; x < 8; x++) {
                        const tileType = smallMap[y][x][0]; // get the tile type, ignoring selected state
                        if (tileType === "") continue;
                        const img = this.images[tileType];
                        if (img) {
                            ctx.drawImage(img, x * 32, y * 32, 32, 32);
                        }
                    }
                }
                // scale canvas to 300 dpi so printing is 1 inch = 1 tile
                const scaledCanvas = document.createElement('canvas');
                scaledCanvas.width = 8 * 300; // 300 dpi / 96 dpi
                scaledCanvas.height = 8 * 300;
                const scaledCtx = scaledCanvas.getContext('2d');
                scaledCtx.imageSmoothingEnabled = false;
                scaledCtx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
                // add cutout border to scaled canvas
                scaledCtx.strokeStyle = 'rgba(0, 0, 0, 1)';
                scaledCtx.lineWidth = 10; // 10 pixels border
                scaledCtx.strokeRect(0, 0, scaledCanvas.width, scaledCanvas.height);
                canvas_images.push(scaledCanvas);
            }
            // if no regions exist, create a blank canvas
            if (canvas_images.length === 0) {
                alert("No regions exist to save. Please draw something on the map before saving.");
                return;
            }
            // if one canvas image, download it directly, otherwise zip them
            if (canvas_images.length === 1) {
                const dataURL = canvas_images[0].toDataURL('image/png');
                const link = document.createElement('a');
                link.href = dataURL;
                link.download = 'map.png';
                link.click();
            } else {
                const zipBlob = await zipFiles(...canvas_images);
                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipBlob);
                link.download = 'map.zip';
                link.click();
            }
        });

        const saveButton = document.getElementById('saveButton');
        saveButton.addEventListener('click', () => {
            this.saver.save();
        });

        // save json button
        const saveJsonButton = document.getElementById('saveJSONButton');
        saveJsonButton.addEventListener('click', () => {
            const json = JSON.stringify({
                map: this.map,
                notes: this.notes,
                camera: this.camera,
                selectedTileType: this.selectedTileType,
                brushSize: this.brushSize
            });

            const blob = new Blob([json], { type: 'application/json' });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'map.json';
            link.click();
        });
        // load json button
        const loadJsonButton = document.getElementById('loadJSONButton');
        loadJsonButton.addEventListener('click', () => {
            const input = document.createElement('input');

            input.type = 'file';
            input.accept = '.json';

            input.addEventListener('change', (e) => {
                const file = e.target.files[0];

                const reader = new FileReader();

                reader.onload = (e) => {
                    const save = JSON.parse(e.target.result);

                    if (save.map) {
                        this.map = save.map;
                    }

                    if (save.notes) {
                        this.notes = save.notes;
                    } else {
                        this.notes = {};
                    }

                    if (save.camera) {
                        this.camera = save.camera;
                    }

                    if (save.selectedTileType) {
                        this.selectedTileType = save.selectedTileType;
                    }

                    if (save.brushSize) {
                        this.brushSize = save.brushSize;
                    }

                    // normalize old map formats
                    for (const key in this.map) {
                        for (let row = 0; row < 8; row++) {
                            for (let col = 0; col < 8; col++) {
                                const tile = this.map[key][row][col];

                                if (typeof tile === "string" && tile !== "") {
                                    this.map[key][row][col] = [tile, ""];
                                }
                            }
                        }
                    }

                    console.log("Loaded map:", this.map);
                    console.log("Loaded notes:", this.notes);
                };

                reader.readAsText(file);
            });

            input.click();
        });
        const noteInput = document.getElementById("noteInput");

        noteInput.addEventListener("input", () => {
            this.saveCurrentNote();
        });


        const addNoteButton = document.getElementById("addNoteButton");

        addNoteButton.addEventListener("click", () => {
            this.saveCurrentNote();
        });


        const removeNoteButton = document.getElementById("removeNoteButton");

        removeNoteButton.addEventListener("click", () => {
            if (!this.currentNoteKey) return;

            delete this.notes[this.currentNoteKey];

            noteInput.value = "";
        });
    }
    draw(){
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        this.ctx.fillStyle = 'rgb(255, 245, 224)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // apply dpi scaling
        this.ctx.scale(this.dpi, this.dpi);
        // apply camera transform
        this.ctx.translate(-this.camera.x, -this.camera.y);

        // draw full map in bounds
        const bounds = this.getBounds();
        const startRegionX = Math.min(0, Math.floor(bounds.left / (32 * 8)));
        const endRegionX = Math.floor(bounds.right / (32 * 8));
        const startRegionY = Math.min(0, Math.floor(bounds.top / (32 * 8)));
        const endRegionY = Math.floor(bounds.bottom / (32 * 8));
        for (let regionX = startRegionX; regionX <= endRegionX; regionX++) {
            for (let regionY = startRegionY; regionY <= endRegionY; regionY++) {
                const key = `${regionX}_${regionY}`;
                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 8; col++) {
                        if (!this.map[key]) {
                            continue;
                        }
                        let tileType = this.map[key][row][col];
                        if (tileType === "") {
                            continue;
                        }
                        tileType = tileType[0]; // get the tile type, ignoring selected state
                        const img = this.images[tileType];
                        if (img) {
                            this.ctx.drawImage(img, (regionX * 8 + col) * 32, (regionY * 8 + row) * 32, 32, 32);
                        }
                        // blue outline for selected tiles
                        if (this.map[key][row][col][1] === "selected") {
                            this.ctx.strokeStyle = 'rgb(0, 255, 255)';
                            this.ctx.lineWidth = 2;
                            this.ctx.strokeRect((regionX * 8 + col) * 32, (regionY * 8 + row) * 32, 32, 32);
                            // add little square in the top left corner to indicate selected tile
                            this.ctx.fillStyle = 'rgb(0, 255, 255)';
                            this.ctx.fillRect((regionX * 8 + col) * 32, (regionY * 8 + row) * 32, 5, 5);
                        }
                        // draw note marker
                        const noteKey = `${regionX}_${regionY}_${col}_${row}`;
                        // if the note starts with a hex code, use that as the color, otherwise use yellow
                        let noteColor = 'rgba(255, 255, 0, 0.5)';
                        if (this.notes[noteKey] && this.notes[noteKey].startsWith("#")) {
                            // grab digits until non-hex character
                            const hex = this.notes[noteKey].match(/^#([0-9a-fA-F]{6})/);
                            if (hex) {
                                noteColor = `rgba(${parseInt(hex[1].substring(0, 2), 16)}, ${parseInt(hex[1].substring(2, 4), 16)}, ${parseInt(hex[1].substring(4, 6), 16)}, 0.5)`;
                            }
                        }
                        if (this.notes[noteKey]) {
                            this.ctx.fillStyle = noteColor;
                            this.ctx.fillRect((regionX * 8 + col) * 32, (regionY * 8 + row) * 32, 32, 32);
                        }
                    }
                }
            }
        }
        // draw last picked tile with a yellow outline
        if (this.lastPicked) {
            const { regionX, regionY, tileX, tileY } = this.lastPicked;
            this.ctx.strokeStyle = 'rgb(123, 104, 70)';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect((regionX * 8 + tileX) * 32, (regionY * 8 + tileY) * 32, 32, 32);
        }
        // draw region grid lines
        for (let regionX = startRegionX; regionX <= endRegionX; regionX++) {
            for (let regionY = startRegionY; regionY <= endRegionY; regionY++) {
                // if negative region, draw black
                if (regionX < 0 || regionY < 0) {
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 1)';
                    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0)';
                    this.ctx.fillRect(regionX * 8 * 32-1, regionY * 8 * 32-1, 8 * 32+2, 8 * 32+2);
                    continue;
                }else{
                    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                    // fill region with semi-transparent color if it doesn't exist
                    if (!this.map[`${regionX}_${regionY}`]) {
                        this.ctx.fillStyle = 'rgb(216, 204, 178)';
                        this.ctx.fillRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                    }
                }
            }
        }

        // draw clipboard preview
        if (this.showPreview && this.clipboard) {
            const worldPos = this.screenToWorld(this.mouse.x, this.mouse.y);
            const tileX = Math.floor(worldPos.x / 32);
            const tileY = Math.floor(worldPos.y / 32);

            this.ctx.globalAlpha = 0.5;

            for (const tile of this.clipboard.tiles) {
                const drawX = tileX + (tile.x - this.clipboard.mouseTile.x);
                const drawY = tileY + (tile.y - this.clipboard.mouseTile.y);

                const img = this.images[tile.type];
                if (img) {
                    this.ctx.drawImage(
                        img,
                        drawX * 32,
                        drawY * 32,
                        32,
                        32
                    );
                }
            }

            this.ctx.globalAlpha = 1;
        }

        

        // blink tile under mouse
        const worldPos = this.screenToWorld(this.mouse.x, this.mouse.y);
        const tileX = Math.floor(worldPos.x / 32) - Math.floor(this.brushSize / 2-0.1);
        const tileY = Math.floor(worldPos.y / 32) - Math.floor(this.brushSize / 2-0.1);
        const value = performance.now() / 300; // change speed of blinking
        const alpha = (Math.sin(value) + 1) / 10 + 0.3; // oscillates between 0.3 and 0.5
        this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha/3})`;
        this.ctx.fillRect(tileX * 32, tileY * 32, 32 * this.brushSize, 32 * this.brushSize);
    }
    fill(type, x, y){
        // flood fill starting at tile x,y with type, replacing all connected tiles of the same type,does not cross regions
        const regionX = Math.floor(x / 8);
        const regionY = Math.floor(y / 8);
        const key = `${regionX}_${regionY}`;
        if (!this.map[key]) return;
        const localX = x % 8;
        const localY = y % 8;
        const targetType = this.map[key][localY][localX][0];
        if (targetType === type && !this.alt) return;
        const stack = [[localX, localY]];
        while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            if (cx < 0 || cx >= 8 || cy < 0 || cy >= 8) continue;
            if (!this.alt){
                if (this.map[key][cy][cx][0] !== targetType) continue;
                if (this.selectedTileType === "delete") {
                    this.map[key][cy][cx] = "";
                } else {
                    this.map[key][cy][cx] = [type, ""];
                }
            }
            if (this.alt) {
                if (this.map[key][cy][cx][0] !== type) continue;
                if (this.map[key][cy][cx][1] === "selected") continue;
                if (this.map[key][cy][cx] === "") continue;
                this.map[key][cy][cx][1] = "selected";
            }
            stack.push([cx + 1, cy]);
            stack.push([cx - 1, cy]);
            stack.push([cx, cy + 1]);
            stack.push([cx, cy - 1]);
        }
    }
    update(){
        // update keymap
        for (const key of this.activeKeys) {
            if (this.keyMap[key] && !this.pausedKeys.has(key)) {
                this.keyMap[key]["action"]();
            }
            if (this.keyMap[key] && this.keyMap[key]["type"] === "tap") {
                this.pausedKeys.add(key);
            }

        }
        this.updateCamera();

        // update tile container 
        const tileContainer = document.getElementById('tileContainer');
        for (const tileType in this.images) {
            // if a tile type is not a valid id under tileContainer, add it (img element with id of tile type)
            if (!document.getElementById(tileType)) {
                const img = document.createElement('img');
                img.src = this.images[tileType].src;
                img.id = tileType;
                img.classList.add('tile');
                img.draggable = true;
                img.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', tileType);
                });
                // add event listener for click to select tile type
                img.addEventListener('click', () => {
                    this.selectedTileType = tileType;
                });
                tileContainer.appendChild(img);
            }
            // if a tile type is not in this.images, remove it from tileContainer, as it's not an option
            if (!this.images[tileType]) {
                const img = document.getElementById(tileType);
                if (img) {
                    tileContainer.removeChild(img);
                }
            }
            // if tile type is selected, add a border to it, otherwise remove the border (toggle selected class)
            const img = document.getElementById(tileType);
            if (img) {
                if (this.selectedTileType === tileType) {
                    img.classList.add('selected');
                } else if (img.classList.contains('selected')) {
                    img.classList.remove('selected');
                }
            }
        }

        // if mouse left is down, place tile at mouse position, add tile to map if it doesn't exist
        let selectionExists = false;
        for (const key in this.map) {
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    if (this.map[key][row][col] !== "" && this.map[key][row][col][1] === "selected") {
                        selectionExists = true;
                        break;
                    }
                }
                if (selectionExists) break;
            }
            if (selectionExists) break;
        }
        if (this.mouse.right && this.showPreview) {
            this.showPreview = false;
            this.mouse.right = false;
            this.mouse.paused.right = true;
        } 
        if (this.mouse.right && selectionExists && !this.alt) {
            // delete all selected tiles
            for (const key in this.map) {
                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 8; col++) {
                        if (this.map[key][row][col] !== "" && this.map[key][row][col][1] === "selected") {
                            this.map[key][row][col][1] = ""; // unselect
                        }
                    }
                }
            }
            this.mouse.right = false;
            this.mouse.paused.right = true;
        }
        
        if (this.mouse.left || this.mouse.right) {
            const worldPos = this.screenToWorld(this.mouse.x, this.mouse.y);

            const startTileX = Math.floor(worldPos.x / 32) - Math.floor(this.brushSize / 2 - 0.1);
            const startTileY = Math.floor(worldPos.y / 32) - Math.floor(this.brushSize / 2 - 0.1);
            const endTileX = startTileX + this.brushSize - 1;
            const endTileY = startTileY + this.brushSize - 1;

            const startRegionX = Math.floor(startTileX / 8);
            const endRegionX = Math.floor(endTileX / 8);
            const startRegionY = Math.floor(startTileY / 8);
            const endRegionY = Math.floor(endTileY / 8);

            if (startRegionX < 0 || startRegionY < 0) {
                return;
            }

            for (let regionY = startRegionY; regionY <= endRegionY; regionY++) {
                for (let regionX = startRegionX; regionX <= endRegionX; regionX++) {
                    const key = `${regionX}_${regionY}`;

                    if (!this.map[key] && !this.alt && this.selectedTileType !== "delete") {
                        this.map[key] = Array.from({ length: 8 }, () => Array(8).fill(""));
                    }

                    if (!this.map[key]) continue;

                    const minTileX = Math.max(startTileX, regionX * 8);
                    const maxTileX = Math.min(endTileX, regionX * 8 + 7);
                    const minTileY = Math.max(startTileY, regionY * 8);
                    const maxTileY = Math.min(endTileY, regionY * 8 + 7);

                    for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
                        for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
                            const localX = tileX - regionX * 8;
                            const localY = tileY - regionY * 8;

                            const tile = this.map[key][localY][localX];

                            if (this.alt) {
                                // selection brush
                                if (tile !== "") {
                                    if (this.mouse.left) {
                                        tile[1] = "selected";
                                    } else if (this.mouse.right && tile[1] === "selected") {
                                        tile[1] = "";
                                    }
                                }
                            } else {
                                // paint/delete brush
                                if (this.mouse.right || this.selectedTileType === "delete") {
                                    this.map[key][localY][localX] = "";
                                } else {
                                    const wasSelected = tile[1] === "selected";
                                    this.map[key][localY][localX] = [
                                        this.selectedTileType,
                                        wasSelected
                                    ];
                                }
                            }
                        }
                    }

                    // remove empty regions only when painting/deleting
                    if (!this.alt &&
                        (this.mouse.right || this.selectedTileType === "delete") &&
                        this.map[key].every(row => row.every(tile => tile === ""))) {
                        delete this.map[key];
                    }
                }
            }
        }

    }
    updateCamera(){
        // update camera
        this.camera.x += this.camera.vx;
        this.camera.y += this.camera.vy;
        // multiply camera velocity by 0.9 to slow down over time
        this.camera.vx *= 0.9;
        this.camera.vy *= 0.9;
    }
    screenToWorld(x, y) {
        // convert screen coordinates to world coordinates, mainly for mouse input
        const worldX = (x / this.dpi) + this.camera.x;
        const worldY = (y / this.dpi) + this.camera.y;
        return { x: worldX, y: worldY };
    }
    getMouseTile() {
        const worldPos = this.screenToWorld(this.mouse.x, this.mouse.y);

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


    selectNoteTile() {
        const tile = this.getMouseTile();

        this.currentNoteKey = tile.key;

        const input = document.getElementById("noteInput");

        if (this.notes[this.currentNoteKey]) {
            input.value = this.notes[this.currentNoteKey];
        } else {
            input.value = "";
        }
    }


    saveCurrentNote() {
        if (!this.currentNoteKey) return;

        const input = document.getElementById("noteInput");
        const text = input.value.trim();

        if (text.length > 0) {
            this.notes[this.currentNoteKey] = text;
        } else {
            delete this.notes[this.currentNoteKey];
        }
    }
    getBounds(){
        // get the bounds of the camera
        const width = this.canvas.width / this.dpi;
        const height = this.canvas.height / this.dpi;
        return {
            left: this.camera.x,
            right: this.camera.x + width,
            top: this.camera.y,
            bottom: this.camera.y + height
        }
    }
}
document.addEventListener('DOMContentLoaded', async () => {
    const mapMaker = new MapMaker();
    await mapMaker.load();
    mapMaker.loop();
});
class Saver {
    constructor(){
        this.saveFile = {}
        this.saveHook = () => {}
    }
    save(){
        // save save to local storage
        this.saveHook();
        localStorage.setItem('mapMakerSave', JSON.stringify(this.saveFile));
        console.log("saved to local storage");
    }
    load(hook){
        // load save from local storage
        const save = localStorage.getItem('mapMakerSave');
        if (save) {
            this.saveFile = JSON.parse(save);
        }
        if (hook) {
            hook(this.saveFile);
        }
    }
    setSave(key, value){
        this.saveFile[key] = value;
    }
    startAutosave(){
        setInterval(() => {
            this.save();
        }, 10000);
    }
}

