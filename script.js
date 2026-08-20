import { zipFiles, resizeCanvas } from './helpers.js';
import App from './src/App.js';
import Mouse from './src/Mouse.js';
import TileEngine from './src/TileEngine.js';
import RegionEngine from './src/RegionEngine.js';
import PixelEngine from './src/PixelEngine.js';
import SpaceEngine from './src/SpaceEngine.js';
import Saver from './src/Saver.js';
import { hashTiles } from './helpers.js';
import Notes from './src/Notes.js';
import { initializeTooltips } from './src/Tooltip.js';
import { createColorSlider } from './src/Notes.js';

class MapMaker extends App{
    constructor() {
        super();
        this.dpi = resizeCanvas();
        window.addEventListener('resize', () => {
            this.dpi = resizeCanvas();
        });
        this.images = {};
        
        // camera (start centered at 0,0)
        this.camera = {
            "x": -this.canvas.width / 5 / this.dpi / 3,
            "y": -this.canvas.height / 5 / this.dpi / 3,
            "vx": 0,
            "vy": 0,
            "speed": 2,
            "zoom": 3,
            "width": this.canvas.width / this.dpi,
            "height": this.canvas.height / this.dpi
        }
        this.visualViewport = window.visualViewport || { width: window.innerWidth, height: window.innerHeight };

        // map  "x_y" = 8x8 region of the map, row:[col:[tile type, selected || ""]] 
        this.map = {
        }
        this.notes = { // "rx_ry_x_y" = note text
            "keywords":[] // {"text": "keyword", "color": "#hex", "tooltip": "tooltip text"}
        }
        this.regionTypes = new Map();  // hash -> { count, tiles }
        
        this.annotations = []; // {color, points:[{x,y}], left, top, right, bottom}
        this.regions = {};
        this.lastPicked = null;

        this.saver = new Saver();
        this.saver.saveHook = () => {
            this.saver.saveFile = {
                map: this.map,
                camera: this.camera,
                notes: this.notes,
                config: this.config,
                zoomLevel: this.zoomLevel,
                annotations: this.annotations,
            };
        };
        this.zoomLevel = 1; // 0 = pixel, 1 = tile, 2 = region
        // Config declaration
        this.config = {
            showPreview: null,
            lastPicked: null,
            brushSize: 1,
            selectedTileType: "floor",
            selectedColor: "#000000",
            selectedRegionType: 1588504069,
            printedRegionCount: 16, // How many 3d printed region bases we have
            annotate: false,
            annotate_color: "#FF0000",
            lastPickedRegion: null,
            lastPickedGroup: null,
            lastPicked: null
        }
        this.zoomLevel = 1;
        // give a default region type (default hash is filled floor with wall outline)
        this.defaultRegion = [];
        for (let y = 0; y < 8; y++) {
            const row = [];

            for (let x = 0; x < 8; x++) {
                const type =
                    y === 0 || y === 7 || x === 0 || x === 7
                        ? "wall"
                        : "floor";

                row.push([type, ""]);
            }

            this.defaultRegion.push(row);
        }
        this.defaultRegionHash = 1588504069;
        this.saver.load((save) => {
            if (save.map) this.map = save.map;
            if (save.camera) this.camera = save.camera;
            if (save.config) this.config = save.config;
            if (save.notes) this.notes = save.notes;
            if (save.zoomLevel !== undefined) this.zoomLevel = save.zoomLevel;
            if (save.annotations) this.annotations = save.annotations;

            // Normalize map first
            for (const key in this.map) {
                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 8; col++) {
                        const tile = this.map[key].tiles[row][col];

                        if (typeof tile === "string" && tile !== "") {
                            this.map[key].tiles[row][col] = [tile, ""];
                        }
                    }
                }
            }
            

            // regionTypes is derived data; rebuild it
            this.rebuildRegionTypes();
        });
        
        
        this.regionTypes.set(this.defaultRegionHash, { count: 1, tiles: this.defaultRegion });

        this.Notes = new Notes(this);
    }
    async load() {
        const save = await this.saver.load();

        if (save) {
            this.map = save.map ?? this.map;
            this.camera = save.camera ?? this.camera;
            this.config = save.config ?? this.config;
            this.notes = save.notes ?? this.notes;
            this.zoomLevel = save.zoomLevel ?? this.zoomLevel;
            this.annotations = save.annotations ?? this.annotations;
        }

        await this.loadImages(save?.images);
        this.PixelEngine = new PixelEngine(this);
        this.TileEngine = new TileEngine(this);
        this.RegionEngine = new RegionEngine(this);
        this.SpaceEngine = new SpaceEngine(this);

        this.loadKeymap();
        this.loadMouse(true);
        this.loadButtons();
        this.Notes.load();
        this.rebuildRegionTypes();
        this.PixelEngine.load(this);
        this.TileEngine.load(this);
        this.RegionEngine.load(this);
        this.SpaceEngine.load(this);

        initializeTooltips();
        // add color slider to the config panel
        const colorSliderContainer = document.getElementById("buttonContainer");
        const [slider, event] = createColorSlider(colorSliderContainer, (color) => {
            if (this.zoomLevel === 1) {
                this.config.annotate_color = color;
            } else {
                this.config.selectedColor = color;
            }
        }, false, this.config.selectedColor, "5rem", "3rem", true);
        this.colorSliderEvent = event;
        slider.id = "colorSlider";
        if (this.zoomLevel === 1) {
            this.colorSliderEvent(this.config.annotate_color, true, false);
        } else {
            this.colorSliderEvent(this.config.selectedColor, false, true);
        }
        this.saver.startAutosave(this.images);
    }
    /**
     * Loads the default and saved tile images.
     * @param {Object<string, Blob>} savedImages
     * @returns {Promise<void>}
     */
    async loadImages(savedImages = {}) {
        const files = {
            delete: "assets/delete.png",
            addTile: "assets/add.png",
            floor: "assets/floor.png",
            wall: "assets/wall.png",
            marker: "assets/marker.png",
        };
        for (const [key, src] of Object.entries(files)) {
            this.images[key] = await this.loadImage(src);
        }
        for (const [key, blob] of Object.entries(savedImages)) {
            this.images[key] = await this.loadImage(URL.createObjectURL(blob));
        }
    }

    /**
     * Loads an image from a URL.
     * @param {string} src
     * @returns {Promise<HTMLImageElement>}
     */
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const image = new Image();

            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = src;
        });
    }
    loadKeymap(){
        this.shift = false;
        this.alt = false;
        this.ctrl = false;

        if (this.zoomLevel === 0) this.PixelEngine.loadKeymap();
        if (this.zoomLevel === 1) this.TileEngine.loadKeymap();
        if (this.zoomLevel === 2) this.RegionEngine.loadKeymap();
        if (this.zoomLevel === 3) this.SpaceEngine.loadKeymap();
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
    }
    loadMouse(newMouse=false){
        if (newMouse){
            this.mouse = new Mouse(this.canvas);
            this.mouse.attachListeners();
        }else{
            this.mouse.unhookAll()
        }
        // middle mouse drag to move camera
        this.mouse.hook("mousemove", "camera-move", (pos,delta) => {
            if (this.mouse.get("middle")) {
                this.camera.x -= delta.dx / this.dpi / this.camera.zoom;
                this.camera.y -= delta.dy / this.dpi / this.camera.zoom;
            }
        });

        // camera zoom with mouse wheel
        this.mouse.hook("wheel", "camera-zoom", (pos) => {
            // Store the exact mouse position where the zoom is happening.
            this.mouse.extraData.wheelPos = {
                x: pos.x,
                y: pos.y
            };
        });

        this.mouse.hook("wheel-update", "camera-zoom-update", () => {
            const wheelPos = this.mouse.extraData.wheelPos;
            if (!wheelPos) return;
            const worldBefore = this.screenToWorld(wheelPos.x, wheelPos.y);
            const zoomFactor = Math.exp(-this.mouse.wheel * 0.0001);
            const oldZoom = this.camera.zoom;
            const newZoom = Math.max(0.05,Math.min(100, oldZoom * zoomFactor));
            const canvasPos = this.screenToCanvas(wheelPos.x,wheelPos.y);
            this.camera.zoom = newZoom;
            this.camera.x = worldBefore.x - canvasPos.x / newZoom;
            this.camera.y = worldBefore.y - canvasPos.y / newZoom;
        });

        this.mouse.hook("touch-pan", "camera-touch-pan", (pos, delta) => {
            this.camera.x -= delta.dx*2 / this.dpi / this.camera.zoom;
            this.camera.y -= delta.dy*2 / this.dpi / this.camera.zoom;
        });
        this.mouse.hook("touch-pinch", "camera-touch-zoom", (pos, delta) => {
            this.mouse.extraData.wheelPos = {
                x: pos.x,
                y: pos.y
            };

            this.mouse.wheel -= delta * 5;
        });

        // add engine keybinds
        if (this.zoomLevel === 0) this.PixelEngine.loadMouse(this.mouse)
        if (this.zoomLevel === 1) this.TileEngine.loadMouse(this.mouse)
        if (this.zoomLevel === 2) this.RegionEngine.loadMouse(this.mouse)
        if (this.zoomLevel === 3) this.SpaceEngine.loadMouse(this.mouse)
    }
    loadButtons(){
        // save map button 
        const saveMapButton = document.getElementById('saveMapButton');
        saveMapButton.addEventListener('click', async () => {
            const canvas_images = [];
            for (const key in this.map) {
                const regionX = parseInt(key.split('_')[0]);
                const regionY = parseInt(key.split('_')[1]);
                const smallMap = this.map[key]["tiles"];
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
            this.saver.save(this.images);
        });

        const clearSaveButton = document.getElementById('clearSave');
        clearSaveButton.addEventListener('click', () => {
            const conformation = document.getElementById("conformation");
            conformation.classList.remove("hide");
            const confirmYes = document.getElementById("confirm-yes");
            const confirmNo = document.getElementById("confirm-no");
            const overlay = document.getElementById("overlay");
            overlay.classList.remove("hide");
            overlay.addEventListener("click", () => {
                conformation.classList.add("hide");
                overlay.classList.add("hide");
            });
            conformation.focus();
            confirmYes.addEventListener("click", async () => {
                await this.saver.clear();
                window.location.reload();
            });
            confirmNo.addEventListener("click", () => {
                conformation.classList.add("hide");
                overlay.classList.add("hide");
            });
            conformation.addEventListener("blur", () => {
                conformation.classList.add("hide");
                this.mouse.pause("left", 0.5)
                overlay.classList.add("hide");
            });
        });

        // save json button
        const saveJsonButton = document.getElementById('saveJSONButton');
        saveJsonButton.addEventListener('click', () => {
            const json = JSON.stringify({
                map: this.map,
                notes: this.notes,
                camera: this.camera,
                config: this.config,
                zoomLevel: this.zoomLevel,
                annotations: this.annotations
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

                    if (save.map) this.map = save.map;
                    if (save.notes) this.notes = save.notes;
                    else this.notes = {};
                    if (save.camera) this.camera = save.camera;
                    if (save.config) this.config = save.config;
                    if (save.zoomLevel) this.zoomLevel = save.zoomLevel;
                    if (save.annotations) this.annotations = save.annotations;
                    else this.regionTypes = new Map();
                    
                    // normalize old map formats
                    for (const key in this.map) {
                        for (let row = 0; row < 8; row++) {
                            for (let col = 0; col < 8; col++) {
                                const tile = this.map[key]["tiles"][row][col];
                                if (typeof tile === "string" && tile !== "") {
                                    this.map[key]["tiles"][row][col] = [tile, ""];
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

        const rasterizeButton = document.getElementById("Rasterize");
        rasterizeButton.addEventListener("click", () => {
            this.rebuildRegionTypes();
        });

        const closeInstructionsButton = document.getElementById("close-instructions");
        closeInstructionsButton.addEventListener("click", () => {
            // if instructions are open, close them, change the button text to "Open Instructions"
            // toggle 'hide' class
            const instructions = document.getElementById("instructions");
            instructions.classList.toggle("hide");
            if (instructions.classList.contains("hide")) {
                closeInstructionsButton.textContent = "Open Information";
            } else {
                closeInstructionsButton.textContent = "Close Information";
            }
        });
    }
    draw(){
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        
        
        // apply camera zoom
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        // apply dpi scaling
        this.ctx.scale(this.dpi, this.dpi);
        // apply camera transform
        this.ctx.translate(-this.camera.x, -this.camera.y);

        

        if (this.zoomLevel === 0) {
            this.PixelEngine.render();
        }
        if (this.zoomLevel === 1) {
            this.TileEngine.render();
        }
        if (this.zoomLevel === 2) {
            this.RegionEngine.render();
        }
        if (this.zoomLevel === 3) {
            this.SpaceEngine.render();
        }
    }
    update(){
        this.mouse.update();
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

        
        // Zoom levels. [Pixel scope, Tile scope, Region scope]
        const zoomLevels = [20, 0.7, 0.2];
        const prevZoomLevel = this.zoomLevel;
        if (this.camera.zoom >= zoomLevels[0]) {
            this.zoomLevel = 0;
            this.PixelEngine.update();
        } else if (this.camera.zoom >= zoomLevels[1]) {
            this.zoomLevel = 1; // Tile scope
            this.TileEngine.update();
        } else if (this.camera.zoom >= zoomLevels[2]) {
            this.zoomLevel = 2; // Region scope
            this.RegionEngine.update();
        } else {
            this.zoomLevel = 3; // Space scope
            this.SpaceEngine.update();
        }
        if (prevZoomLevel!==this.zoomLevel){
            console.log("swapping engine")
            this.loadKeymap()
            this.loadMouse()

            // if going to tile scope, change color slider to selected annotate color
            if (this.zoomLevel === 1) {
                this.colorSliderEvent(this.config.annotate_color, true, false);
            } else {
                this.colorSliderEvent(this.config.selectedColor, false, true);
            }
            // if going to pixel scope, change color slider to selected color
            if (this.zoomLevel === 0) {
                this.colorSliderEvent(this.config.selectedColor, false, true);
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
    screenToCanvas(x, y) {
        const rect = this.canvas.getBoundingClientRect();

        const physicalX =
            (x - rect.left) * (this.canvas.width / rect.width);

        const physicalY =
            (y - rect.top) * (this.canvas.height / rect.height);

        return {
            x: physicalX / this.dpi,
            y: physicalY / this.dpi
        };
    }
    screenToWorld(x, y) {
        const canvasPos = this.screenToCanvas(x, y);

        return {
            x: canvasPos.x / this.camera.zoom + this.camera.x,
            y: canvasPos.y / this.camera.zoom + this.camera.y
        };
    }
    getBounds() {
        const width = (this.canvas.width / this.dpi) / this.camera.zoom;

        const height = (this.canvas.height / this.dpi) / this.camera.zoom;

        return {
            left: this.camera.x,
            right: this.camera.x + width,
            top: this.camera.y,
            bottom: this.camera.y + height
        };
    }
    save(){
        // save the current map
        this.saver.save({
            map: this.map,
            camera: this.camera,
            config: this.config,
            notes: this.notes,
            zoomLevel: this.zoomLevel,
            regionTypes: Array.from(this.regionTypes.entries())
        });
        return;
    }
    rebuildRegionTypes() {
        this.regionTypes.clear();

        for (const key in this.map) {
            const tiles = this.map[key].tiles;
            const hash = hashTiles(tiles);

            const existing = this.regionTypes.get(hash);

            if (existing) {
                existing.count++;
            } else {
                this.regionTypes.set(hash, {
                    count: 1,
                    tiles: tiles.map(row =>
                        row.map(tile =>
                            Array.isArray(tile) ? [...tile] : tile
                        )
                    )
                });
            }
        }

        // Make sure default is available even if no actual region uses it
        if (!this.regionTypes.has(this.defaultRegionHash)) {
            this.regionTypes.set(this.defaultRegionHash, {
                count: 0,
                tiles: this.defaultRegion.map(row => [...row])
            });
        }
        // If selectedRegionType is no longer valid, reset it to default
        if (!this.regionTypes.has(this.config.selectedRegionType)) {
            this.config.selectedRegionType = this.defaultRegionHash;
        }
        console.log("Rebuilt region types:", this.regionTypes);
    }
    
}
document.addEventListener('DOMContentLoaded', async () => {
    const mapMaker = new MapMaker();
    await mapMaker.load();
    mapMaker.loop();
});

