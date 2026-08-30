import { hashTiles } from "../helpers.js";

export default class RegionEngine {
    constructor(mapMaker) {
        this.mapMaker = mapMaker;

        this.queue = new Map(); // for rasterization of regions
    }

    load(mapMaker){
        this.keyMap = mapMaker.keyMap;
        this.config = mapMaker.config;
        this.ctx = mapMaker.ctx;
        this.mouse = mapMaker.mouse;
        this.clipboard = mapMaker.clipboard;
        this.lastPicked = mapMaker.lastPicked;
        this.config.alt = mapMaker.alt;
    }

    render(){
        // Tile-scope rendering
        // for now it just renders all tiles. will eventrally use rasterized images.
        const bounds = this.mapMaker.getBounds();
        const startRegionX = Math.min(0, Math.floor(bounds.left / (32 * 8)));
        const endRegionX = Math.floor(bounds.right / (32 * 8));
        const startRegionY = Math.min(0, Math.floor(bounds.top / (32 * 8)));
        const endRegionY = Math.floor(bounds.bottom / (32 * 8));
        this.ctx.fillStyle = 'rgb(41, 70, 48)';
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
                        // if the note starts with a hex code, use that as the color, otherwise use yellow
                        let noteColor = 'rgba(255, 255, 0, 0.5)';
                        if (this.mapMaker.notes[noteKey]?.color) {
                            noteColor = this.mapMaker.notes[noteKey].color.trimEnd().replace(')', ', 0.5)');
                        }
                        if (this.mapMaker.notes[noteKey]) {
                            this.ctx.fillStyle = noteColor;
                            this.ctx.fillRect((regionX * 8 + col) * 32, (regionY * 8 + row) * 32, 32, 32);
                        }
                    }
                }
            }
        }
        // draw last picked tile with a yellow outline
        if (this.config.lastPickedRegion) {
            const { regionX, regionY} = this.config.lastPickedRegion;
            this.ctx.strokeStyle = 'rgb(123, 104, 70)';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect((regionX * 256), (regionY * 256), 256, 256);
            const lastKey = `${this.config.lastPickedRegion.regionX}_${this.config.lastPickedRegion.regionY}`;
        }
        // draw region grid lines
        for (let regionX = startRegionX; regionX <= endRegionX; regionX++) {
            for (let regionY = startRegionY; regionY <= endRegionY; regionY++) {
                // if negative region, draw black
                if (regionX < 0 || regionY < 0) {
                    this.ctx.fillStyle = 'rgb(0, 28, 37)';
                    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0)';
                    this.ctx.fillRect(regionX * 8 * 32-1, regionY * 8 * 32-1, 8 * 32+2, 8 * 32+2);
                    continue;
                }else{
                    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                    // fill region with semi-transparent color if it doesn't exist
                    if (!this.mapMaker.map[`${regionX}_${regionY}`]) {
                        this.ctx.fillStyle = 'rgb(70, 97, 69)';
                        this.ctx.fillRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                    }
                }
                // draw if region is selected
                const key = `${regionX}_${regionY}`;
                if (this.mapMaker.map[key]?.["selected"]) {
                    this.ctx.strokeStyle = 'rgb(0, 255, 255)';
                    this.ctx.lineWidth = 5;
                    this.ctx.strokeRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                    // fill region with semi-transparent color
                    this.ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
                    this.ctx.fillRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                    // add little square in the top left corner to indicate selected region
                    this.ctx.strokeRect(regionX * 8 * 32, regionY * 8 * 32, 48, 48);
                }
                // draw if region is the last picked region
                if (this.config.lastPickedRegion && this.config.lastPickedRegion.regionX === regionX && this.config.lastPickedRegion.regionY === regionY) {
                    this.ctx.strokeStyle = 'rgb(107, 61, 0)';
                    this.ctx.lineWidth = 5;
                    this.ctx.strokeRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                }
                // draw if region has a note
                let noteKey = `${regionX}_${regionY}`;
                let noteColor = this.mapMaker.notes[noteKey]?.color || "#ffff0033";
                
                if (this.mapMaker.notes[noteKey]) {
                    this.ctx.strokeStyle = noteColor;
                    this.ctx.lineWidth = 5;
                    this.ctx.strokeRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                    // fill region with semi-transparent color
                    this.ctx.fillStyle = noteColor.trimEnd().replace(')', ', 0.5)');
                    this.ctx.fillRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                }
                // draw color for each group the region is in
                const groups = this.mapMaker.map[key]?.["groups"] ? Object.keys(this.mapMaker.map[key]["groups"]) : [];
                // if the group is selected (this.config.lastPickedGroup), darken all groups to indicate that we selected the group, not the region
                if (this.config.lastPickedGroup && (groups && groups.includes(this.config.lastPickedGroup))) {
                    this.ctx.fillStyle = this.config.lastPickedGroup + '40';
                    this.ctx.fillRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                }
                if (this.mapMaker.map[key]?.["groups"]) {
                    for (let i = 0; i < groups.length; i++) {
                        const groupName = groups[i];
                        // note, the group name is a hex color, so we can use that as the color
                        const groupColor = groupName;
                        this.ctx.strokeStyle = groupColor;
                        // we put a square in the top left corner of the region for each group, with a size of 32x32 and a 2 pixel gap between each square
                        this.ctx.strokeRect(regionX * 8 * 32 + i * 32, regionY * 8 * 32, 32, 32);
                        // fill with half alpha (append 88 to the hex color)
                        this.ctx.fillStyle = groupColor + '88';
                        this.ctx.fillRect(regionX * 8 * 32 + i * 32, regionY * 8 * 32, 32, 32);
                    }
                }
                // or if lastPickedGroup is set, and this region is not in that group, darken
                
                if (this.config.lastPickedGroup && (!groups || !groups.includes(this.config.lastPickedGroup))) {
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    this.ctx.fillRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                }else if(!this.config.lastPickedGroup){
                    // if the selected tile is in a group, and this is not that group, darken
                    const lastKey = `${this.config.lastPickedRegion?.regionX}_${this.config.lastPickedRegion?.regionY}`;
                    if (this.config.lastPickedRegion && this.mapMaker.map[lastKey]?.["groups"] && Object.keys(this.mapMaker.map[lastKey]["groups"]).length > 0) {
                        if (!this.mapMaker.map[key]?.["groups"] || !Object.keys(this.mapMaker.map[key]["groups"]).some(group => this.mapMaker.map[lastKey]["groups"][group])) {
                            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                            this.ctx.fillRect(regionX * 8 * 32, regionY * 8 * 32, 8 * 32, 8 * 32);
                        }
                    }
                }
                
            }
        }

        // draw clipboard preview
        if (this.config.showPreview && this.mapMaker.clipboard?.regions) {
            const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);
            const regionX = Math.floor(worldPos.x / 256);
            const regionY = Math.floor(worldPos.y / 256);

            this.ctx.globalAlpha = 0.5;


            for (const region of this.mapMaker.clipboard.regions) {
                const drawX = regionX + (region.x - this.mapMaker.clipboard.mouseRegion.x);
                const drawY = regionY + (region.y - this.mapMaker.clipboard.mouseRegion.y);

                // draw the region's tiles
                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 8; col++) {
                        const tile = region.tiles[row][col];
                        if (tile === "") {
                            continue;
                        }

                        const tileType = Array.isArray(tile) ? tile[0] : tile;
                        const img = this.mapMaker.images[tileType];

                        if (img) {
                            this.ctx.drawImage(img,(drawX * 8 + col) * 32,(drawY * 8 + row) * 32,32,32);
                        }
                    }
                }

                // draw region grid lines
                this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(drawX * 8 * 32, drawY * 8 * 32, 8 * 32, 8 * 32);
            }

            this.ctx.globalAlpha = 1;
        }

        // blink tile under mouse
        const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);
        const value = performance.now() / 300; // change speed of blinking
        const alpha = (Math.sin(value) + 1) / 10 + 0.3; // oscillates between 0.3 and 0.5
        if (this.mouse.extraData.shiftPos) {
            const startRegionX = Math.floor(this.mouse.extraData.shiftPos.x / 256);
            const startRegionY = Math.floor(this.mouse.extraData.shiftPos.y / 256);
            const endRegionX = Math.floor(worldPos.x / 256);
            const endRegionY = Math.floor(worldPos.y / 256);
            const minRegionX = Math.min(startRegionX, endRegionX);
            const maxRegionX = Math.max(startRegionX, endRegionX);
            const minRegionY = Math.min(startRegionY, endRegionY);
            const maxRegionY = Math.max(startRegionY, endRegionY);
            this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha/3})`;
            this.ctx.fillRect(minRegionX * 256, minRegionY * 256, (maxRegionX - minRegionX + 1) * 256, (maxRegionY - minRegionY + 1) * 256);
            return;
        }
        const tileX = Math.floor(worldPos.x / (32*8)) - Math.floor(this.config.brushSize / 2-0.1);
        const tileY = Math.floor(worldPos.y / (32*8)) - Math.floor(this.config.brushSize / 2-0.1);
        this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha/3})`;
        this.ctx.fillRect(tileX * (8*32), tileY * (8*32), 32 * 8 * this.config.brushSize, 32 * 8 * this.config.brushSize);
        // if lastSelectedGroup is set, put marker on the mouse
        if (this.config.lastPickedGroup) {
            const color = this.config.lastPickedGroup+'88';
            this.ctx.fillStyle = color;
            // around mouse pos, not tile
            this.ctx.fillRect(worldPos.x - 16, worldPos.y - 16, 32, 32);
        }
    }

    brush(pos, method="click", startRegionX=null, startRegionY=null, endRegionX=null, endRegionY=null){
        const worldPos = this.mapMaker.screenToWorld(pos.x, pos.y);
        // wrapped so that later we can add in other tools if we want
        if (startRegionX === null || startRegionY === null || endRegionX === null || endRegionY === null) {
            startRegionX = Math.floor(worldPos.x / 256) - Math.floor(this.config.brushSize / 2 - 0.1);
            startRegionY = Math.floor(worldPos.y / 256) - Math.floor(this.config.brushSize / 2 - 0.1);
            endRegionX = startRegionX + this.config.brushSize - 1;
            endRegionY = startRegionY + this.config.brushSize - 1;
            if (this.mouse.extraData.shiftPos) {
                // draw box from shiftPos to current worldPos
                startRegionX = Math.floor(this.mouse.extraData.shiftPos.x / 256);
                startRegionY = Math.floor(this.mouse.extraData.shiftPos.y / 256);
                endRegionX = Math.floor(worldPos.x / 256);
                endRegionY = Math.floor(worldPos.y / 256);
                // flip if axis is reversed
                if (startRegionX > endRegionX){
                    [startRegionX, endRegionX] = [endRegionX, startRegionX];
                }
                if (startRegionY > endRegionY){
                    [startRegionY, endRegionY] = [endRegionY, startRegionY];
                }
            }
        }
        startRegionX = Math.max(0, startRegionX);
        startRegionY = Math.max(0, startRegionY);
        if (startRegionX > endRegionX || startRegionY > endRegionY) {
            return;
        }
        
        if (startRegionX < 0 || startRegionY < 0) {
            return; // don't allow negative regions
        }

        for (let regionY = startRegionY; regionY <= endRegionY; regionY++) {
            for (let regionX = startRegionX; regionX <= endRegionX; regionX++) {
                const key = `${regionX}_${regionY}`;
                if (this.config.lastPickedGroup){
                    if (!this.mapMaker.map[key]) continue;
                    if (this.config.alt){
                        // select all of the regions in the group
                        for (const region in this.mapMaker.map){
                            if (!this.mapMaker.map[region]["groups"] || !this.mapMaker.map[region]["groups"][this.config.lastPickedGroup]) continue;
                            this.mapMaker.map[region]["selected"] = true;
                        }
                        continue;
                    }
                    if ((this.config.erase || this.mouse.get("right"))){
                        // remove the region from the group
                        if (this.mapMaker.map[key]["groups"] && this.mapMaker.map[key]["groups"][this.config.lastPickedGroup]){
                            delete this.mapMaker.map[key]["groups"][this.config.lastPickedGroup];
                            continue;
                        }
                    }else{
                        // add the region to the group
                        if (!this.mapMaker.map[key]["groups"]){
                            this.mapMaker.map[key]["groups"] = {};
                        } 
                        this.mapMaker.map[key]["groups"][this.config.lastPickedGroup] = true;
                    }
                    continue;
                }
                const wasGrouped = this.mapMaker.map[key]?.["groups"] ? this.mapMaker.map[key]["groups"] : {};
                if (this.config.alt) {
                    if (this.mapMaker.map[key]) {
                        if (this.mouse.get("right")) {
                            this.mapMaker.map[key] = {
                                "tiles": this.mapMaker.map[key]["tiles"],
                                "selected": false,
                                "groups": wasGrouped
                            };
                        }else {
                            this.mapMaker.map[key] = {
                                "tiles": this.mapMaker.map[key]["tiles"],
                                "selected": true,
                                "groups": wasGrouped
                            };
                        }
                        this.queueRegion(key, this.mapMaker.map[key]["tiles"]);
                    }
                } else {
                    const oldRegion = this.mapMaker.map[key];

                    if (this.mouse.get("right") || this.config.erase) {
                        if (oldRegion) {
                            this.queueRegion(key, oldRegion.tiles);
                            delete this.mapMaker.map[key];
                        }
                    } else {
                        const wasSelected = oldRegion ? oldRegion.selected : false;

                        if (oldRegion) {
                            this.queueRegion(key, oldRegion.tiles);
                        } else {
                            this.queueRegion(key, Array.from({ length: 8 }, () => Array(8).fill("")));
                        }

                        this.mapMaker.map[key] = {
                            tiles: this.getRegionType(this.config.selectedRegionType),
                            selected: wasSelected,
                            groups: wasGrouped
                        };
                    }
                }
            }
        }

        this.updateRegions()
        
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
        const [rx, ry] = key.split('_').map(Number);
        const worldX = (rx * 8 + 4) * 32 * this.mapMaker.camera.zoom * this.mapMaker.dpi;
        const worldY = (ry * 8 + 4) * 32 * this.mapMaker.camera.zoom * this.mapMaker.dpi;
        const viewportWidth = this.mapMaker.canvas.width / this.mapMaker.dpi
        const viewportHeight = this.mapMaker.canvas.height / this.mapMaker.dpi
        this.mapMaker.camera.x = (worldX - viewportWidth / 2) / this.mapMaker.camera.zoom;
        this.mapMaker.camera.y = (worldY - viewportHeight / 2) / this.mapMaker.camera.zoom;
    }

    getMouseRegion() {
        const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);

        const regionX = Math.floor(worldPos.x / 256);
        const regionY = Math.floor(worldPos.y / 256);

        return {
            regionX,
            regionY,
            key: `${regionX}_${regionY}`
        };
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

    selectNoteRegion() {
        const region = this.getMouseRegion();
        this.mapMaker.currentNoteKey = region.key;
        this.mapMaker.Notes.goto(region.key);
    }

    loadKeymap(){
        this.mapMaker.keyMap = {
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
            "Alt": { action: () => { 
                this.config.alt = true; 
                const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);
                const tileX = Math.floor(worldPos.x / 32);
                const tileY = Math.floor(worldPos.y / 32);
                const regionX = Math.floor(tileX / 8);
                const regionY = Math.floor(tileY / 8);
                this.selectNoteRegion();
                this.config.lastPicked = { regionX, regionY, tileX: tileX % 8, tileY: tileY % 8 };
            }, type: "hold", "release-action": () => { 
                if (this.mouse.extraData.shiftPos) {
                    this.brush(this.mouse.getPos(), "select");
                }
                this.config.alt = false; 
            } },

            "ArrowUp": { action: () => { this.mapMaker.camera.vy -= this.mapMaker.camera.speed; }, type: "hold" },
            "ArrowLeft": { action: () => { this.mapMaker.camera.vx -= this.mapMaker.camera.speed; }, type: "hold" },
            "ArrowDown": { action: () => { this.mapMaker.camera.vy += this.mapMaker.camera.speed; }, type: "hold" },
            "ArrowRight": { action: () => { this.mapMaker.camera.vx += this.mapMaker.camera.speed; }, type: "hold" },

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

            "/":{
                action:()=>{
                    console.log(this.mapMaker.regionTypes)
                }
            },

            "e": {
                action: () => {
                    const keys = Object.keys(this.mapMaker.images);
                    const currentIndex = keys.indexOf(this.config.selectedTileType);
                    const nextIndex = (currentIndex + 1) % keys.length;
                    this.config.selectedTileType = keys[nextIndex];
                },
                type: "tap"
            },
            "q": {
                action: () => {
                    const keys = Object.keys(this.mapMaker.images);
                    const currentIndex = keys.indexOf(this.config.selectedTileType);
                    const nextIndex = (currentIndex - 1 + keys.length) % keys.length;
                    this.config.selectedTileType = keys[nextIndex];
                },
                type: "tap"
            },
            "Control": {
                action: () => {
                    this.config.ctrl = true; 
                    this.config.lastPickedGroup = ""
                    const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);
                    const regionX = Math.floor(worldPos.x / 256);
                    const regionY = Math.floor(worldPos.y / 256);
                    const key = `${regionX}_${regionY}`;
                    if (!this.mapMaker.map[key]){
                        this.config.selectedRegionType = "floor";
                        return;
                    }
                    const hash = hashTiles(this.mapMaker.map[key]["tiles"])
                    this.config.selectedRegionType = hash
                    // if it's new, add it
                    if (!this.mapMaker.regionTypes.has(hash)) {
                        this.mapMaker.regionTypes.set(hash, {
                            count: 1,
                            tiles: this.mapMaker.map[key]["tiles"].map(row => row.map(tile => Array.isArray(tile) ? [...tile] : tile))
                        });
                    }
                    
                    if (this.config.selectedRegionType === "") {
                        this.config.selectedRegionType = "floor";
                    }
                    if (!this.config.selectedRegionType) {
                        this.config.selectedRegionType = "floor";
                    }
                    this.selectNoteRegion();
                    this.config.lastPickedRegion = { regionX, regionY };
                    // If this region has a group, and we are hovering over a tile representing a group, select that group type.
                    if (!this.mapMaker.map[key]["groups"] || Object.keys(this.mapMaker.map[key]["groups"]).length <= 0) return;
                    // get tile index
                    const tile = this.getMouseTile()
                    const localX = tile.localX;
                    const localY = tile.localY;
                    const index = localX + 8 * localY;
                    const groups = Object.keys(this.mapMaker.map[key]["groups"]);
                    if (index >= groups.length) return;
                    const groupKey = groups[Math.floor(index)];
                    this.config.lastPickedGroup = groupKey;
                    // go to note
                    this.mapMaker.Notes.goto(`group_${groupKey}`);
                },
                "release-action": () => { this.config.ctrl = false; },
                type: "hold"
            },
            "c": {
                action: () => {
                    this.mapMaker.clipboard = {
                        regions: []
                    };

                    const mouseRegion = this.getMouseRegion();

                    for (const key in this.mapMaker.map) {
                        const region = this.mapMaker.map[key];

                        if (!region?.selected) {
                            continue;
                        }

                        const [regionX, regionY] = key.split("_").map(Number);

                        this.mapMaker.clipboard.regions.push({
                            x: regionX,
                            y: regionY,
                            tiles: region.tiles.map(row =>
                                row.map(tile => Array.isArray(tile) ? [...tile] : tile)
                            ),
                            groups: region.groups
                                ? { ...region.groups }
                                : {},
                            selected: false
                        });
                    }

                    if (this.mapMaker.clipboard.regions.length === 0) {
                        this.mapMaker.clipboard = {};
                        return;
                    }

                    this.mapMaker.clipboard.mouseRegion = {
                        x: mouseRegion.regionX,
                        y: mouseRegion.regionY
                    };

                    console.log("Copied regions to clipboard", this.mapMaker.clipboard);
                },
                type: "tap"
            },

            "v": {
                action: () => {
                    if (!this.mapMaker.clipboard?.regions?.length) {
                        return;
                    }

                    if (!this.config.showPreview) {
                        this.config.showPreview = true;
                        return;
                    }

                    const mouseRegion = this.getMouseRegion();
                    const queued = new Set();

                    for (const region of this.mapMaker.clipboard.regions) {
                        const drawX = mouseRegion.regionX +
                            (region.x - this.mapMaker.clipboard.mouseRegion.x);

                        const drawY = mouseRegion.regionY +
                            (region.y - this.mapMaker.clipboard.mouseRegion.y);

                        const key = `${drawX}_${drawY}`;

                        if (!this.mapMaker.map[key]) {
                            this.mapMaker.map[key] = {
                                tiles: Array.from({ length: 8 }, () =>
                                    Array(8).fill("")
                                ),
                                selected: false,
                                groups: {}
                            };
                        }

                        if (!queued.has(key)) {
                            this.queueRegion(key, this.mapMaker.map[key].tiles);
                            queued.add(key);
                        }

                        this.mapMaker.map[key].tiles = region.tiles.map(row =>
                            row.map(tile => Array.isArray(tile) ? [...tile] : tile)
                        );

                        this.mapMaker.map[key].groups = {
                            ...(region.groups || {})
                        };

                        this.mapMaker.map[key].selected = false;
                    }

                    this.config.showPreview = false;
                    this.updateRegions();
                },
                type: "tap"
            },
            "x": {
                action: () => {
                    // delete all selected tiles
                    for (let key in this.mapMaker.map){
                        if (this.mapMaker.map[key]?.selected){
                            delete this.mapMaker.map[key]
                        }
                    }
                    this.updateRegions();
                },
                type: "tap"
            },
            "s":{
                action: () => {
                    if(this.config.ctrl){
                        // save the current map
                        this.mapMaker.save();
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
            // Group regions
            "g":{
                action: () => {
                    const name = `#${Math.floor(Math.random() * 16777215).toString(16)}`;
                    let weCreatedAGroup = false;
                    for (const key in this.mapMaker.map) {
                        if (this.mapMaker.map[key]["selected"]) {
                            this.mapMaker.map[key]["selected"] = false;
                            // gen random hex color for group name
                            if (!this.mapMaker.map[key]["groups"]) {
                                this.mapMaker.map[key]["groups"] = {};
                            }
                            if (this.mapMaker.map[key]["groups"][name]) {
                                delete this.mapMaker.map[key]["groups"][name];
                            } else {
                                this.mapMaker.map[key]["groups"][name] = true;
                            weCreatedAGroup = true;
                            }
                        }
                    }
                    if (weCreatedAGroup) {
                        // set note for the group
                        const noteKey = `group_${name}`;
                        this.mapMaker.notes[noteKey] = {
                            text: `Group ${name}`,
                            color: name + '88'
                        };
                    }

                },
                type: "tap"
            },
            // Annotate
            "a":{
                action:()=>{
                    this.config.annotate = true;
                    if (this.config.ctrl){
                        this.config.annotate = false;
                    }
                },
                "type":"tap"
            },
            "n": {
                action: () => {
                    const notes = document.getElementById("notes");
                    notes.classList.toggle("hide");
                },
                type: "tap"
            }

        };
    }
    
    loadMouse(mouse){
        this.mouse = mouse;

        // preview for pasting clipboard
        this.mouse.hook("right-hold", "region-clipboard-preview", (pos)=>{
            if (this.config.showPreview) {
                this.config.showPreview = false;
                this.mouse.pause("right");
            }
        })
        // clear selection
        this.mouse.hook("right-down","region-delete-selected",(pos)=>{
            this.deselectAll();
        })
        // brush logic
        this.mouse.hook("right-hold", "region-brush-remove", this.brush.bind(this));
        this.mouse.hook("left-hold", "region-brush", this.brush.bind(this));
    }

    deselectAll(){
        if (this.config.regionSelectionExists && !this.config.alt) {
            for (const key in this.mapMaker.map) {
                this.mapMaker.map[key]["selected"] = false;
            }
            this.mouse.pause("right");
        }
    }

    update(){
        let regionSelectionExists = false;
        for (const key in this.mapMaker.map) {
            if (this.mapMaker.map[key]["selected"]) {
                regionSelectionExists = true;
                break;
            }
        }
        this.config.regionSelectionExists = regionSelectionExists;


        // update tile container 
        const tileContainer = document.getElementById('tileContainer');
        for (const tileType in this.mapMaker.images) {
            // if a tile type is not a valid id under tileContainer, add it (img element with id of tile type)
            if (!document.getElementById(tileType)) {
                const img = document.createElement('img');
                img.src = this.mapMaker.images[tileType].src;
                img.id = tileType;
                img.classList.add('tile');
                img.draggable = true;
                img.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', tileType);
                });
                // add event listener for click to select tile type
                img.addEventListener('click', () => {
                    this.config.selectedTileType = tileType;
                });
                tileContainer.appendChild(img);
            }
            // if a tile type is not in this.images, remove it from tileContainer, as it's not an option
            if (!this.mapMaker.images[tileType]) {
                const img = document.getElementById(tileType);
                if (img) {
                    tileContainer.removeChild(img);
                }
            }
            // if tile type is selected, add a border to it, otherwise remove the border (toggle selected class)
            const img = document.getElementById(tileType);
            if (img) {
                if (this.config.selectedTileType === tileType) {
                    img.classList.add('selected');
                } else if (img.classList.contains('selected')) {
                    img.classList.remove('selected');
                }
            }
        }

        
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
            if (hash === this.mapMaker.defaultRegionHash) return; // don't remove the default region type

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

    getRegionType(hash){
        if (!this.mapMaker.regionTypes.has(hash) || !hash) {
            console.warn("Unreconized region selected. Using the default one to avoid a crash.")
            hash = 1588504069
        }
        const tiles = this.mapMaker.regionTypes.get(hash)["tiles"];
        // deep copy tiles
        return tiles.map(row => row.map(tile => Array.isArray(tile) ? [...tile] : tile));
    }
}

