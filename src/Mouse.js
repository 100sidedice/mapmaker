export function detectTrackpad(event) {
    if (event.deltaMode !== 0) {
        return false;
    }

    if (event.deltaX !== 0) {
        return true;
    }

    return Math.abs(event.deltaY) < 5;
}

export default class Mouse {
    constructor(element) {
        this.element = element;
        this.x = 0;
        this.y = 0;

        this.buttons = {
            "left": {
                "state": false,
                "paused": -1
            },
            "middle": {
                "state": false,
                "paused": -1
            },
            "right": {
                "state": false,
                "paused": -1
            }
        };

        this.wheel = 0;
        this.wheelX = 0;
        this.trackpadMode = false;
        this.trackpadScrollDistance = 0;
        this.delta = [0, 0];
        this.inside = false;
        this.hooks = {};
        this.extraData = {};
        this.touch = {
            fingers: new Map(),
            mode: null,
            previousCenter: null,
            previousDistance: null,

            drawTimer: null,
            drawStarted: false,

            drawX: 0,
            drawY: 0,
            targetX: 0,
            targetY: 0,
            drawAnimation: null
        };

    }

    attachListeners() {
        this.element.addEventListener('mouseenter', () => {
            this.inside = true;
            this.runHook('mouseenter', this.getPos());
        });

        this.element.addEventListener('mouseleave', () => {
            this.inside = false;
            this.clear();
            this.runHook('mouseleave', this.getPos());
        });

        this.element.addEventListener('mousemove', (e) => {
            if (this.lockedPos) {
                return;
            }
            const rect = this.element.getBoundingClientRect();

            this.setPos(e.clientX - rect.left, e.clientY - rect.top);
            this.setDelta(e.movementX, e.movementY);

            this.runHook('mousemove', this.getPos(), this.getDelta());
        });

        this.element.addEventListener('mousedown', (e) => {
            if (this.isPaused(e.button)) {
                return;
            }

            if (!this.get(e.button)) {
                this.setDelta(0, 0);
            }

            this.set(e.button, true);

            const button = this.getButtonName(e.button);

            this.runHook(`${button}-down`, this.getPos());
        });

        this.element.addEventListener('mouseup', (e) => {
            this.unpause(e.button);
            this.setDelta(0, 0);
            this.set(e.button, false);
            const button = this.getButtonName(e.button);
            this.runHook(`${button}-up`, this.getPos());
        });

        this.element.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (!this.trackpadMode && detectTrackpad(e)) {
                this.trackpadMode = true;
            }
            if (this.trackpadMode){
                this.wheelX += e.deltaX;
                this.wheel += e.deltaY;
                this.trackpadScrollDistance += Math.abs(e.deltaX) + Math.abs(e.deltaY);
            } else {
                this.wheel += e.deltaY;
            }
            // if not trackpad mode, and deltas are small, scale up
            if (!this.trackpadMode && Math.abs(e.deltaY) < 10) {
                this.wheel += e.deltaY * 15;
            }
            this.runHook('wheel', this.getPos(), e.deltaY, e);
        });

        this.element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.runHook('contextmenu', this.getPos());
        });

        this.element.style.touchAction = "none";
        this.element.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.updateTouches(e);
            const count = this.touch.fingers.size;
            if (count === 1) {
                const pos = this.getTouchCenter();

                this.setPos(pos.x, pos.y);
                this.setDelta(0, 0);

                this.touch.mode = "draw";
                this.touch.drawStarted = false;

                this.touch.drawX = pos.x;
                this.touch.drawY = pos.y;
                this.touch.targetX = pos.x;
                this.touch.targetY = pos.y;

                clearTimeout(this.touch.drawTimer);

                this.touch.drawTimer = setTimeout(() => {
                    if (this.touch.fingers.size !== 1 || this.touch.mode !== "draw") return;

                    this.touch.drawStarted = true;
                    this.set("left", true);

                    this.runHook("left-down", {
                        x: this.touch.drawX,
                        y: this.touch.drawY
                    });

                    this.startDrawAnimation();
                }, 120);
            }

            if (count === 2) {
                clearTimeout(this.touch.drawTimer);
                this.touch.drawTimer = null;
                this.touch.pendingPositions = [];

                if (this.get("left")) {
                    this.set("left", false);
                    this.setDelta(0, 0);
                    this.runHook("left-up", this.getPos());
                }

                this.touch.drawStarted = false;
                this.touch.mode = "gesture";

                const center = this.getTouchCenter();
                const distance = this.getTouchDistance();

                this.touch.previousCenter = center;
                this.touch.previousDistance = distance;

                this.setPos(center.x, center.y);
                this.setDelta(0, 0);

                this.runHook("touch-start", { fingers: 2, pos: center });
            }
        });
        window.addEventListener("blur", () => {
            if (this.touch.mode === "draw" && !this.touch.drawStarted) {
                this.cancelTouchDraw();
            }
        });
        document.addEventListener("mousedown", e => {
            if (!this.element.contains(e.target)) {
                this.cancelTouchDraw();
            }
        });
        this.element.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.updateTouches(e);
            const rect = this.element.getBoundingClientRect();
            const touch = [...this.touch.fingers.values()][0];

            if (touch && this.touch.fingers.size === 1 && this.touch.mode === "draw") {
                const inside = touch.clientX >= rect.left &&
                    touch.clientX <= rect.right &&
                    touch.clientY >= rect.top &&
                    touch.clientY <= rect.bottom;

                if (!inside && !this.touch.drawStarted) {
                    this.cancelTouchDraw();
                    return;
                }
            }
            
            const count = this.touch.fingers.size;
            if (count === 1 && this.touch.mode === "draw") {
                const pos = this.getTouchCenter();

                this.setPos(pos.x, pos.y);

                if (!this.touch.drawStarted) {
                    this.touch.targetX = pos.x;
                    this.touch.targetY = pos.y;
                } else {
                    this.touch.targetX = pos.x;
                    this.touch.targetY = pos.y;
                }

                return;
            }

            if (count >= 2 && this.touch.mode === "gesture") {
                const center = this.getTouchCenter();
                const distance = this.getTouchDistance();
                const panDelta = {
                    dx: center.x - this.touch.previousCenter.x,
                    dy: center.y - this.touch.previousCenter.y
                };
                const pinchDelta = distance - this.touch.previousDistance;
                this.setPos(center.x, center.y);
                this.setDelta(panDelta.dx, panDelta.dy);
                this.runHook( 'touch-pan', center, panDelta );

                this.runHook('touch-pinch',center,pinchDelta,distance);

                this.touch.previousCenter = center;
                this.touch.previousDistance = distance;
            }
        });
        this.element.addEventListener("touchend", e => {
            e.preventDefault();

            this.updateTouches(e);

            const count = this.touch.fingers.size;

            clearTimeout(this.touch.drawTimer);
            this.touch.drawTimer = null;

            if (count === 0) {
                if (this.touch.drawStarted && this.get("left")) {
                    // Let the drawing animation finish catching up.
                    this.touch.mode = "draw";
                    this.touch.finishingDraw = true;

                    this.touch.targetX = this.touch.drawX;
                    this.touch.targetY = this.touch.drawY;

                    // Don't release left yet. The animation will do it
                    // when the drawn position catches up.
                } else {
                    this.set("left", false);
                    this.setDelta(0, 0);
                }

                this.touch.pendingPositions = [];

                this.runHook("touch-end", {
                    fingers: 0,
                    pos: this.getTouchCenter()
                });

                this.touch.previousCenter = null;
                this.touch.previousDistance = null;
            } else if (count === 1) {
                // Coming from a two-finger gesture. Don't accidentally
                // turn the remaining finger into a drawing gesture.
                this.set("left", false);
                this.setDelta(0, 0);

                this.touch.drawStarted = false;
                this.touch.finishingDraw = false;
                this.touch.mode = "gesture";
                this.touch.previousCenter = this.getTouchCenter();
                this.touch.previousDistance = null;

                this.runHook("touch-end", {
                    fingers: 1,
                    pos: this.touch.previousCenter
                });
            }
        });
        this.element.addEventListener('touchcancel', (e) => {
            e.preventDefault();

            this.touch.fingers.clear();
            this.touch.mode = null;
            this.touch.previousCenter = null;
            this.touch.previousDistance = null;

            this.runHook('touch-cancel');
        });
    }

    updateTouches(e) {
        for (const touch of e.changedTouches) {
            if (
                e.type === 'touchend' ||
                e.type === 'touchcancel'
            ) {
                this.touch.fingers.delete(touch.identifier);
            } else {
                this.touch.fingers.set(touch.identifier, touch);
            }
        }
    }

    getTouchCenter() {
        const touches = [...this.touch.fingers.values()];

        if (touches.length === 0) {
            return this.getPos();
        }

        const rect = this.element.getBoundingClientRect();

        let x = 0;
        let y = 0;

        for (const touch of touches) {
            x += touch.clientX - rect.left;
            y += touch.clientY - rect.top;
        }

        return {
            x: x / touches.length,
            y: y / touches.length
        };
    }

    getTouchDistance() {
        const touches = [...this.touch.fingers.values()];

        if (touches.length < 2) {
            return 0;
        }

        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;

        return Math.hypot(dx, dy);
    }

    addPendingPosition(pos) {
        const positions = this.touch.pendingPositions;

        if (positions.length === 0) {
            positions.push(pos);
            return;
        }

        const previous = positions[positions.length - 1];
        const dx = pos.x - previous.x;
        const dy = pos.y - previous.y;
        const distance = Math.hypot(dx, dy);

        const steps = Math.ceil(distance / 4);

        for (let i = 1; i <= steps; i++) {
            const t = i / steps;

            positions.push({
                x: previous.x + dx * t,
                y: previous.y + dy * t
            });
        }
    }

    startDrawAnimation() {
        cancelAnimationFrame(this.touch.drawAnimation);

        let lastTime = performance.now();

        const animate = now => {
            if (!this.touch.drawStarted || !this.get("left")) return;

            const dt = Math.min((now - lastTime) / 1000, 0.05);
            lastTime = now;

            const dx = this.touch.targetX - this.touch.drawX;
            const dy = this.touch.targetY - this.touch.drawY;

            // ~200ms-ish catch-up time.
            const follow = 1 - Math.exp(-dt / 0.06);

            const oldX = this.touch.drawX;
            const oldY = this.touch.drawY;

            this.touch.drawX += dx * follow;
            this.touch.drawY += dy * follow;

            const moveX = this.touch.drawX - oldX;
            const moveY = this.touch.drawY - oldY;

            if (Math.abs(moveX) > 0.01 || Math.abs(moveY) > 0.01) {
                this.setPos(this.touch.drawX, this.touch.drawY);
                this.setDelta(moveX, moveY);

                this.runHook("left-hold", this.getPos());
            }

            this.touch.drawAnimation = requestAnimationFrame(animate);
        };

        this.touch.drawAnimation = requestAnimationFrame(animate);
    }

    cancelTouchDraw() {
        clearTimeout(this.touch.drawTimer);
        this.touch.drawTimer = null;

        cancelAnimationFrame(this.touch.drawAnimation);
        this.touch.drawAnimation = null;

        this.touch.drawStarted = false;
        this.touch.finishingDraw = false;
        this.touch.mode = null;
        this.touch.pendingPositions = [];

        this.set("left", false);
        this.setDelta(0, 0);
    }

    getButtonName(button) {
        if (typeof button === "number") {
            return ["left", "middle", "right"][button];
        }

        return button;
    }

    set(button, state) {
        button = this.getButtonName(button);

        if (!this.buttons[button]) {
            return;
        }

        this.buttons[button].state = state;
    }

    get(button) {
        button = this.getButtonName(button);

        if (!this.buttons[button]) {
            return false;
        }

        return this.buttons[button].state;
    }

    pause(button, duration = 9999999999999) {
        // if it has a -, delete everything after it
        if (button.includes("-")) {
            button = button.split("-")[0];
        }
        button = this.getButtonName(button);

        if (!this.buttons[button]) {
            return;
        }

        this.buttons[button].paused = duration;
        this.set(button, false);
    }

    unpause(button) {
        button = this.getButtonName(button);

        if (!this.buttons[button]) {
            return;
        }

        this.buttons[button].paused = 0;
    }

    isPaused(button) {
        button = this.getButtonName(button);

        if (!this.buttons[button]) {
            return false;
        }

        return this.buttons[button].paused > 0;
    }

    clear() {
        for (const button in this.buttons) {
            this.buttons[button].state = false;
            this.buttons[button].paused = -1;
        }

        this.delta = [0, 0];
    }

    update() {
        this.runHook('wheel-update');

        if (!this.trackpadMode) {
            this.wheel *= 0.8;
            this.wheelX *= 0.8;
        }else{
            this.wheel *= 0.8;
            this.wheelX *= 0.8;
        }
        if (this.get("middle")) {
            this.trackpadMode = false;
        }
        

        for (const button in this.buttons) {
            if (this.get(button)) {
                this.runHook(`${button}-hold`, this.getPos());
            }
        }
    }

    setPos(x, y) {
        this.x = x;
        this.y = y;
    }

    getPos() {
        return {
            x: this.x,
            y: this.y
        };
    }

    setDelta(dx, dy) {
        this.delta[0] = dx;
        this.delta[1] = dy;
    }

    getDelta() {
        return {
            dx: this.delta[0],
            dy: this.delta[1]
        };
    }

    hook(hookName, name, callback, priority = null) {
        if (!this.hooks[hookName]) {
            this.hooks[hookName] = {};
        }
        if (priority === null) {
            priority = Object.keys(this.hooks[hookName]).length;
        }

        this.hooks[hookName][name] = {
            callback,
            priority
        };
    }
    weakHook(hookName, name, callback, low_or_high = "low", bindTo) {
        function run(...args) {
            if (bindTo) {
                callback = callback.bind(bindTo);
            }
            callback(...args);
            this.unhook(hookName, name);
        }
        if (low_or_high === "high") {
            this.hook(hookName, name, run.bind(this), 100);
        } else {
            this.hook(hookName, name, run.bind(this), -100);
        }
        this.hooks[hookName][name].weak = true;
    }

    unhook(hookName, name = null) {
        if (!this.hooks[hookName]) {
            return;
        }

        if (!name) {
            this.hooks[hookName] = {};
            return;
        }

        delete this.hooks[hookName][name];
    }

    unhookAll() {
        this.hooks = {};
    }

    runHook(hookName, ...args) {
        const hooks = this.hooks[hookName];

        if (!hooks) {
            return;
        }

        const orderedHooks = Object.values(hooks).sort((a, b) => a.priority - b.priority);

        const event = {
            consumed: false,
            consume() {
                this.consumed = true;
            }
        };

        for (const hook of orderedHooks) {
            if (event.consumed) {
                break;
            }

            hook.callback(...args, event);
        }
    }
    runAction(hook, actionName, ...args){
        this.hooks[hook][actionName].callback(...args);
    }

    lockPos() {
        this.lockedPos = true;
    }
    unlockPos() {
        this.lockedPos = false;
    }
}