export default class TileEngine {
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
        this.ctx.imageSmoothingEnabled = false;
        // Tile-scope rendering
        // draw full map in bounds
        const bounds = this.mapMaker.getBounds();
        const startRegionX = Math.min(0, Math.floor(bounds.left / (32 * 8)));
        const endRegionX = Math.floor(bounds.right / (32 * 8));
        const startRegionY = Math.min(0, Math.floor(bounds.top / (32 * 8)));
        const endRegionY = Math.floor(bounds.bottom / (32 * 8));
        this.ctx.fillStyle = 'rgb(95, 88, 71)';
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
        // draw last picked tile with a yellow outline
        if (this.config.lastPicked) {
            const { regionX, regionY, tileX, tileY } = this.config.lastPicked;
            this.ctx.strokeStyle = 'rgb(123, 104, 70)';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect((regionX * 8 + tileX) * 32, (regionY * 8 + tileY) * 32, 32, 32);
        }
        // draw region grid lines
        if (this.config.lastPickedRegion){
            const lastKey = `${this.config.lastPickedRegion.regionX}_${this.config.lastPickedRegion.regionY}`;
        }
        for (let regionX = startRegionX; regionX <= endRegionX; regionX++) {
            for (let regionY = startRegionY; regionY <= endRegionY; regionY++) {
                const key = `${regionX}_${regionY}`;
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
                    if (!this.mapMaker.map[`${regionX}_${regionY}`]) {
                        this.ctx.fillStyle = 'rgb(216, 204, 178)';
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

        // draw clipboard preview
        if (this.config.showPreview && this.mapMaker.clipboard) {
            const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);
            const tileX = Math.floor(worldPos.x / 32);
            const tileY = Math.floor(worldPos.y / 32);

            this.ctx.globalAlpha = 0.5;

            for (const tile of this.mapMaker.clipboard.tiles) {
                const drawX = tileX + (tile.x - this.mapMaker.clipboard.mouseTile.x);
                const drawY = tileY + (tile.y - this.mapMaker.clipboard.mouseTile.y);

                const img = this.mapMaker.images[tile.type];
                if (img) {
                    this.ctx.drawImage(img, drawX * 32, drawY * 32, 32, 32);
                }
                // also add slight darken
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                this.ctx.fillRect(drawX * 32, drawY * 32, 32, 32);
            }

            this.ctx.globalAlpha = 1;
        }

        const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);

        if (this.config.annotate){
            // draw circle to indicate annotation enabled
            this.ctx.fillStyle = this.config.annotate_color
            this.ctx.beginPath();
            this.ctx.arc(worldPos.x, worldPos.y, 5, 0, Math.PI * 2)
            this.ctx.fill();
            this.ctx.strokeStyle = "#00000033"
            this.ctx.beginPath();
            this.ctx.arc(worldPos.x, worldPos.y, 5 * this.config.brushSize**2, 0, Math.PI * 2)
            this.ctx.stroke();
        } else {
            // blink tile under mouse
            
            const value = performance.now() / 300; // change speed of blinking
            const alpha = (Math.sin(value) + 1) / 10 + 0.3; // oscillates between 0.3 and 0.5
            if (this.mouse.extraData.shiftPos) {
                const startTileX = Math.floor(this.mouse.extraData.shiftPos.x / 32);
                const startTileY = Math.floor(this.mouse.extraData.shiftPos.y / 32);
                const endTileX = Math.floor(worldPos.x / 32);
                const endTileY = Math.floor(worldPos.y / 32);
                const minTileX = Math.min(startTileX, endTileX);
                const maxTileX = Math.max(startTileX, endTileX);
                const minTileY = Math.min(startTileY, endTileY);
                const maxTileY = Math.max(startTileY, endTileY);
                this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha/3})`;
                this.ctx.fillRect(minTileX * 32, minTileY * 32, (maxTileX - minTileX + 1) * 32, (maxTileY - minTileY + 1) * 32);
                return;
            }
            const tileX = Math.floor(worldPos.x / 32) - Math.floor(this.config.brushSize / 2-0.1);
            const tileY = Math.floor(worldPos.y / 32) - Math.floor(this.config.brushSize / 2-0.1);
            this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha/3})`;
            this.ctx.fillRect(tileX * 32, tileY * 32, 32 * this.config.brushSize, 32 * this.config.brushSize);
        }

        // draw annotation lines
        // filter out annotations that are outside of the current view
        const visibleAnnotations = this.mapMaker.annotations.filter(annotation => {
            return annotation.right >= bounds.left && annotation.left <= bounds.right &&
                annotation.bottom >= bounds.top && annotation.top <= bounds.bottom;
        });

        for (const annotation of visibleAnnotations) {
            this.ctx.strokeStyle = annotation.color;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            for (let i = 0; i < annotation.points.length; i++) {
                const point = annotation.points[i];
                if (i === 0) {
                    this.ctx.moveTo(point.x, point.y);
                } else {
                    this.ctx.lineTo(point.x, point.y);
                }
            }
            this.ctx.stroke();
        }
    }

    brush(pos, method="click", startTileX=null, startTileY=null, endTileX=null, endTileY=null){
        const worldPos = this.mapMaker.screenToWorld(pos.x, pos.y);
        // wrapped so that later we can add in other tools if we want
        if (startTileX === null || startTileY === null || endTileX === null || endTileY === null) {
            startTileX = Math.floor(worldPos.x / 32) - Math.floor(this.config.brushSize / 2 - 0.1);
            startTileY = Math.floor(worldPos.y / 32) - Math.floor(this.config.brushSize / 2 - 0.1);
            endTileX = startTileX + this.config.brushSize - 1;
            endTileY = startTileY + this.config.brushSize - 1;
            if (this.mouse.extraData.shiftPos) {
                // draw box from shiftPos to current worldPos
                startTileX = Math.floor(this.mouse.extraData.shiftPos.x / 32);
                startTileY = Math.floor(this.mouse.extraData.shiftPos.y / 32);
                endTileX = Math.floor(worldPos.x / 32);
                endTileY = Math.floor(worldPos.y / 32);
                // flip if axis is reversed
                if (startTileX > endTileX){
                    [startTileX, endTileX] = [endTileX, startTileX];
                }
                if (startTileY > endTileY){
                    [startTileY, endTileY] = [endTileY, startTileY];
                }
            }
        }
        startTileX = Math.max(0, startTileX);
        startTileY = Math.max(0, startTileY);
        if (startTileX > endTileX || startTileY > endTileY) {
            return;
        }
        
        const startRegionX = Math.floor(startTileX / 8);
        const endRegionX = Math.floor(endTileX / 8);
        const startRegionY = Math.floor(startTileY / 8);
        const endRegionY = Math.floor(endTileY / 8);
        
        
        if (startRegionX < 0 || startRegionY < 0) {
            return; // don't allow negative regions
        }

        for (let regionY = startRegionY; regionY <= endRegionY; regionY++) {
            for (let regionX = startRegionX; regionX <= endRegionX; regionX++) {
                const key = `${regionX}_${regionY}`;
                if (this.mapMaker.map[key]) {
                    this.queueRegion(key, this.mapMaker.map[key]["tiles"]);
                }
            }
        }

        for (let regionY = startRegionY; regionY <= endRegionY; regionY++) {
            for (let regionX = startRegionX; regionX <= endRegionX; regionX++) {
                const key = `${regionX}_${regionY}`;

                if (!this.mapMaker.map[key] && !this.config.alt && this.config.selectedTileType !== "delete") {
                    this.queueRegion(key, Array.from({ length: 8 }, () => Array(8).fill("")));
                    this.mapMaker.map[key] = {
                        "tiles": Array.from({ length: 8 }, () => Array(8).fill(""))
                    };
                }

                if (!this.mapMaker.map[key]) continue;

                const minTileX = Math.max(startTileX, regionX * 8);
                const maxTileX = Math.min(endTileX, regionX * 8 + 7);
                const minTileY = Math.max(startTileY, regionY * 8);
                const maxTileY = Math.min(endTileY, regionY * 8 + 7);

                for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
                    for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
                        const localX = tileX - regionX * 8;
                        const localY = tileY - regionY * 8;

                        const tile = this.mapMaker.map[key]["tiles"][localY][localX];

                        if (this.config.alt) {
                            // selection brush
                            if (tile !== "") {
                                if (this.mouse.get("left") || method==="select") {
                                    tile[1] = "selected";
                                } else if ((this.config.erase || this.mouse.get("right")) && tile[1] === "selected") {
                                    tile[1] = "";
                                }
                            }
                        } else {
                            // paint/delete brush
                            if ((this.config.erase || this.mouse.get("right")) || this.config.selectedTileType === "delete") {
                                this.mapMaker.map[key]["tiles"][localY][localX] = "";
                            } else {
                                let wasSelected = "";
                                if (this.mapMaker.map[key]["tiles"][localY][localX] !== "") {
                                    wasSelected = this.mapMaker.map[key]["tiles"][localY][localX][1];
                                }
                                this.mapMaker.map[key]["tiles"][localY][localX] = [
                                    this.config.selectedTileType,
                                    wasSelected
                                ];
                            }
                        }
                    }
                }

                // remove empty regions only when painting/deleting
                if (!this.config.alt &&
                    ((this.config.erase || this.mouse.get("right")) || this.config.selectedTileType === "delete") &&
                    this.mapMaker.map[key]["tiles"].every(row => row.every(tile => tile === ""))) {
                    delete this.mapMaker.map[key];
                }
            }
        }

        this.updateRegions()
        
    }

    annotate(pos,event){
        if (this.config.erase){
            this.annotateDelete(pos,event);
            return;
        }
        if (!this.config.annotate) return;
        const worldPos = this.mapMaker.screenToWorld(pos.x, pos.y);

        // plain draw, push new point to last annotation, update bounds
        const lastAnnotation = this.mapMaker.annotations[this.mapMaker.annotations.length - 1];
        lastAnnotation.points.push({x:worldPos.x, y:worldPos.y});
        lastAnnotation.left = Math.min(lastAnnotation.left, worldPos.x);
        lastAnnotation.top = Math.min(lastAnnotation.top, worldPos.y);
        lastAnnotation.right = Math.max(lastAnnotation.right, worldPos.x);
        lastAnnotation.bottom = Math.max(lastAnnotation.bottom, worldPos.y);
        event.consume()

    }

    annotateDelete(pos,event){
        if (!this.config.annotate) return;
        const worldPos = this.mapMaker.screenToWorld(pos.x, pos.y);
        // first get all annotations we are currently hovering over (aabb collision)
        const aabb = this.mapMaker.annotations.filter(annotation => {
            return worldPos.x >= annotation.left-5*this.config.brushSize**2 && worldPos.x <= annotation.right+5*this.config.brushSize**2 &&
                worldPos.y >= annotation.top - 5*this.config.brushSize**2 && worldPos.y <= annotation.bottom + 5*this.config.brushSize**2;
        });

        // now we do point check, if we collide with a point, remove it from the annotation, if the annotation has no points left, remove it from the annotations array.
        for (const annotation of aabb) {
            for (let i = 0; i < annotation.points.length; i++) {
                const point = annotation.points[i];
                const dx = worldPos.x - point.x;
                const dy = worldPos.y - point.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < 5*this.config.brushSize**2) {
                    annotation.points.splice(i, 1);
                    i--;
                    if (annotation.points.length === 0) {
                        const index = this.mapMaker.annotations.indexOf(annotation);
                        if (index > -1) {
                            this.mapMaker.annotations.splice(index, 1);
                            // also delete the note for this annotation
                            if (this.mapMaker.notes[annotation.key]) {
                                delete this.mapMaker.notes[annotation.key];
                                this.mapMaker.Notes.generateCatagories("annotations");
                            }
                        }
                    }
                    // also delete if only 1 point left, since it can't be drawn
                    if (annotation.points.length === 1) {
                        const index = this.mapMaker.annotations.indexOf(annotation);
                        if (index > -1) {
                            this.mapMaker.annotations.splice(index, 1);
                            // also delete the note for this annotation
                            if (this.mapMaker.notes[annotation.key]) {
                                delete this.mapMaker.notes[annotation.key];
                                this.mapMaker.Notes.generateCatagories("annotations");
                            }
                        }
                    }
                    // update bounds
                    annotation.left = Math.min(...annotation.points.map(p => p.x));
                    annotation.top = Math.min(...annotation.points.map(p => p.y));
                    annotation.right = Math.max(...annotation.points.map(p => p.x));
                    annotation.bottom = Math.max(...annotation.points.map(p => p.y));
                }
            }
        }
        event.consume()
    }

    fill(type, x, y){
        // flood fill starting at tile x,y with type, replacing all connected tiles of the same type,does not cross regions
        const regionX = Math.floor(x / 8);
        const regionY = Math.floor(y / 8);
        const key = `${regionX}_${regionY}`;
        if (!this.mapMaker.map[key]) return;
        this.queueRegion(key, this.mapMaker.map[key]["tiles"]);
        const localX = x % 8;
        const localY = y % 8;
        const targetType = this.mapMaker.map[key]["tiles"][localY][localX][0];
        if (targetType === type && !this.config.alt) return;
        const stack = [[localX, localY]];
        let itterations = 0;
        while (stack.length > 0 && itterations < 1000) {
            itterations++;
            const [cx, cy] = stack.pop();
            if (cx < 0 || cx >= 8 || cy < 0 || cy >= 8) continue;
            if (!this.config.alt){
                if (this.mapMaker.map[key]["tiles"][cy][cx][0] !== targetType) continue;
                if (this.config.selectedTileType === "delete") {
                    this.mapMaker.map[key]["tiles"][cy][cx] = "";
                } else {
                    this.mapMaker.map[key]["tiles"][cy][cx] = [type, ""];
                }
            }
            if (this.config.alt) {
                if (this.mapMaker.map[key]["tiles"][cy][cx][0] !== type) continue;
                if (this.mapMaker.map[key]["tiles"][cy][cx][1] === "selected") continue;
                if (this.mapMaker.map[key]["tiles"][cy][cx] === "") continue;
                this.mapMaker.map[key]["tiles"][cy][cx][1] = "selected";
            }
            stack.push([cx + 1, cy]);
            stack.push([cx - 1, cy]);
            stack.push([cx, cy + 1]);
            stack.push([cx, cy - 1]);
        }

        this.updateRegions()
        
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

    selectNoteTile() {
        const tile = this.getMouseTile();
        this.mapMaker.currentNoteKey = tile.key;
        this.mapMaker.Notes.goto(tile.key);
    }

    getNoteAtPicked(){
        // use the last picked tile if it exists, otherwise return null.
        if (this.config.lastPicked) {
            const { regionX, regionY, tileX, tileY } = this.config.lastPicked;
            const key = `${regionX}_${regionY}_${tileX}_${tileY}`;
            return this.mapMaker.notes[key] || null;
        }
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
                this.selectNoteTile();
                this.config.lastPicked = { regionX, regionY, tileX: tileX % 8, tileY: tileY % 8 };
            }, type: "hold", "release-action": () => { 
                if (this.mouse.extraData.shiftPos) {
                    this.brush(this.mouse.getPos(), "select");
                }
                this.config.alt = false; 
            } },
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
            // debug key. Usually will print something. Maybe.
            "/":{
                action:()=>{
                    console.log(this.config.selectionExists)
                }
            },
            // cycle brush type right
            "e": {
                action: () => {
                    const keys = Object.keys(this.mapMaker.images);
                    const currentIndex = keys.indexOf(this.config.selectedTileType);
                    const nextIndex = (currentIndex + 1) % keys.length;
                    this.config.selectedTileType = keys[nextIndex];
                },
                type: "tap"
            },
            // cycle brush type left
            "q": {
                action: () => {
                    const keys = Object.keys(this.mapMaker.images);
                    const currentIndex = keys.indexOf(this.config.selectedTileType);
                    const nextIndex = (currentIndex - 1 + keys.length) % keys.length;
                    this.config.selectedTileType = keys[nextIndex];
                },
                type: "tap"
            },
            // fill
            "f": {
                action: () => {
                    const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);
                    const tileX = Math.floor(worldPos.x / 32);
                    const tileY = Math.floor(worldPos.y / 32);
                    this.fill(this.config.selectedTileType, tileX, tileY);
                },
                type: "tap"
            },
            // eyedropper
            "Control": {
                action: () => {
                    this.config.ctrl = true; 
                    const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);
                    
                    if (this.config.annotate) {
                        // goto annotation note.

                        // aabb
                        const aabb = this.mapMaker.annotations.filter(annotation => {
                            return worldPos.x >= annotation.left-5*this.config.brushSize**2 && worldPos.x <= annotation.right+5*this.config.brushSize**2 &&
                                worldPos.y >= annotation.top - 5*this.config.brushSize**2 && worldPos.y <= annotation.bottom + 5*this.config.brushSize**2;
                        });

                        // now we do point check, if we collide with a point, select that annotation
                        for (const annotation of aabb) {
                            for (let i = 0; i < annotation.points.length; i++) {
                                const point = annotation.points[i];
                                const dx = worldPos.x - point.x;
                                const dy = worldPos.y - point.y;
                                const distance = Math.sqrt(dx * dx + dy * dy);
                                if (distance < 5*this.config.brushSize**2) {
                                    // if it's empty/doesn't exist, create a new note for it
                                    if (!this.mapMaker.notes[annotation.key]) {
                                        console.log("creating new note for annotation", annotation.key);
                                        this.mapMaker.notes[annotation.key] = {
                                            text: `Annotation #${annotation.key}`,
                                            color: annotation.color,
                                            key: annotation.key
                                        };
                                    }
                                    this.mapMaker.Notes.goto(annotation.key);
                                    console.log("goto annotation", annotation.key);
                                    return;
                                }
                            }
                        }
                        return;
                    }
                    const tileX = Math.floor(worldPos.x / 32);
                    const tileY = Math.floor(worldPos.y / 32);
                    const regionX = Math.floor(tileX / 8);
                    const regionY = Math.floor(tileY / 8);
                    const key = `${regionX}_${regionY}`;

                    if (this.mapMaker.map[key]) {
                        this.config.selectedTileType = this.mapMaker.map[key]["tiles"][tileY % 8][tileX % 8][0];
                    }

                    if (this.config.selectedTileType === "") {
                        this.config.selectedTileType = "delete";
                    }
                    if (!this.config.selectedTileType) {
                        this.config.selectedTileType = "delete";
                    }
                    this.selectNoteTile();
                    this.config.lastPicked = { regionX, regionY, tileX: tileX % 8, tileY: tileY % 8 };
                },
                "release-action": () => { this.config.ctrl = false; },
                type: "hold"
            },
            // copy
            "c": {
                action: () => {
                    this.mapMaker.clipboard = {};
                    const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);
                    const tileX = Math.floor(worldPos.x / 32);
                    const tileY = Math.floor(worldPos.y / 32);
                    const regionX = Math.floor(tileX / 8);
                    const regionY = Math.floor(tileY / 8);
                    const key = `${regionX}_${regionY}`;
                    if (!this.mapMaker.map[key]) return;
                    this.mapMaker.clipboard.regionKey = key;
                    this.mapMaker.clipboard.tiles = [];
                    for (let row = 0; row < 8; row++) {
                        for (let col = 0; col < 8; col++) {
                            if (this.mapMaker.map[key]["tiles"][row][col] !== "" && this.mapMaker.map[key]["tiles"][row][col][1] === "selected") {
                                this.mapMaker.clipboard.tiles.push({ x: col, y: row, type: this.mapMaker.map[key]["tiles"][row][col][0] });
                            }
                        }
                    }
                    let mouseTileX = tileX % 8;
                    let mouseTileY = tileY % 8;
                    this.mapMaker.clipboard.mouseTile = { x: mouseTileX, y: mouseTileY };
                },
                type: "tap"
            },
            // paste
            "v": {
                action: () => {
                    if (!this.mapMaker.clipboard) return;

                    if (!this.config.showPreview) {
                        this.config.showPreview = true;
                        return;
                    }

                    const worldPos = this.mapMaker.screenToWorld(this.mouse.x, this.mouse.y);
                    const tileX = Math.floor(worldPos.x / 32);
                    const tileY = Math.floor(worldPos.y / 32);
                    const queued = new Set();

                    for (const tile of this.mapMaker.clipboard.tiles) {
                        const targetX = tileX + (tile.x - this.mapMaker.clipboard.mouseTile.x);
                        const targetY = tileY + (tile.y - this.mapMaker.clipboard.mouseTile.y);

                        const regionX = Math.floor(targetX / 8);
                        const regionY = Math.floor(targetY / 8);
                        const localX = ((targetX % 8) + 8) % 8;
                        const localY = ((targetY % 8) + 8) % 8;
                        const key = `${regionX}_${regionY}`;

                        if (!this.mapMaker.map[key]) {
                            this.queueRegion(key, Array.from({ length: 8 }, () => Array(8).fill("")));
                            this.mapMaker.map[key] = {
                                tiles: Array.from({ length: 8 }, () => Array(8).fill("")),
                                data: {}
                            };
                        } else {
                            this.queueRegion(key, this.mapMaker.map[key]["tiles"]);
                        }

                        this.mapMaker.map[key]["tiles"][localY][localX] = [tile.type, ""];
                    }

                    this.config.showPreview = false;
                    this.updateRegions();
                },
                type: "tap"
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
            // outline
            "o": {
                action: () => {
                    for (const key in this.mapMaker.map) {
                        const tiles = this.mapMaker.map[key]["tiles"];
                        let changed = false;
                        for (let row = 0; row < 8; row++) {
                            for (let col = 0; col < 8; col++) {
                                const tile = tiles[row][col];
                                if (tile === "" || tile[1] !== "selected") {
                                    continue;
                                }
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
                                    const neighbor = tiles[nRow][nCol];
                                    if (neighbor === "" || neighbor[1] !== "selected") {
                                        isEdge = true;
                                        break;
                                    }
                                }
                                const newType = isEdge ? "wall" : "floor";
                                if (tile[0] !== newType) {
                                    if (!changed) {
                                        this.queueRegion(key, tiles);
                                        changed = true;
                                    }
                                    tile[0] = newType;
                                }
                            }
                        }
                    }
                    this.updateRegions()
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
            // Annotate
            "a":{
                action:()=>{
                    if (!this.config.annotate){
                        this.config.annotate = true;
                    } else {
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
        // annotate logic
        this.mouse.hook("left-down", "tile-annotate-start", (pos,event)=>{
            if (!this.config.annotate) return;
            // push new stack
            const worldPos = this.mapMaker.screenToWorld(pos.x, pos.y);
            this.mapMaker.annotations.push({key:`scribble_${this.mapMaker.annotations.length}`, color:this.config.annotate_color, points:[{x:worldPos.x, y:worldPos.y}], left:worldPos.x, top:worldPos.y, right:worldPos.x, bottom:worldPos.y});
            event.consume()
        }, 0);
        this.mouse.hook("left-hold", "tile-annotate", this.annotate.bind(this), 1);
        this.mouse.hook("right-hold", "tile-annotate", this.annotateDelete.bind(this), 1);

        // preview for pasting clipboard
        this.mouse.hook("right-hold", "tile-clipboard-preview", (pos)=>{
            if (this.config.showPreview) {
                this.config.showPreview = false;
                this.mouse.pause("right");
            }
        },2)
        // delete all selected tiles
        this.mouse.hook("right-down","tile-delete-selected",(pos)=>{
            this.deselectAll();
        },3)
        // brush logic
        this.mouse.hook("right-hold", "tile-brush-remove", this.brush.bind(this), 5);
        this.mouse.hook("left-hold", "tile-brush", this.brush.bind(this), 5);
    }

    deselectAll(){
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
    }

    update(){
        let selectionExists = false;
        for (const key in this.mapMaker.map) {
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    if (this.mapMaker.map[key]["tiles"][row][col] !== "" && this.mapMaker.map[key]["tiles"][row][col][1] === "selected") {
                        selectionExists = true;
                        break;
                    }
                }
                if (selectionExists) break;
            }
            if (selectionExists) break;
        }
        this.config.selectionExists = selectionExists;


        // update tile container 
        const tileContainer = document.getElementById('tileContainer');
        for (const tileType in this.mapMaker.images) {
            // if a tile type is not a valid id under tileContainer, add it (img element with id of tile type)
            if (!document.getElementById(tileType)) {
                const img = document.createElement('img');
                if (this.mapMaker.images[tileType] instanceof HTMLCanvasElement) {
                    img.src = this.mapMaker.images[tileType].toDataURL();
                } else {
                    img.src = this.mapMaker.images[tileType].src;
                }
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