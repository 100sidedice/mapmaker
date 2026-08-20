export default class App {
    constructor() {
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