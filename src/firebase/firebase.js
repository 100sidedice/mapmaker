import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import {
    getDatabase,
    get,
    ref,
    remove as removeValue,
    set,
    push, 
    onValue,
    onChildAdded
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAkaqu9HaVmGundHgrUM6Z5U7ZXpuyc5vY",
    authDomain: "georunner-9cd87.firebaseapp.com",
    databaseURL: "https://georunner-9cd87-default-rtdb.firebaseio.com",
    projectId: "georunner-9cd87",
    storageBucket: "georunner-9cd87.firebasestorage.app",
    messagingSenderId: "831642179185",
    appId: "1:831642179185:web:82baa30c4f4265d0c6edd0"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const dataRoot = "dnd";
const UPLOAD_FORMAT_VERSION = 1;

function dataRef(id) {
    return ref(db, `${dataRoot}/${id}`);
}

function encodeUploadData(value) {
    if (Array.isArray(value)) {
        return value.map(encodeUploadData);
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
                encodeURIComponent(key),
                encodeUploadData(child)
            ])
        );
    }

    return value;
}

function decodeUploadData(value) {
    if (Array.isArray(value)) {
        return value.map(decodeUploadData);
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
                decodeURIComponent(key),
                decodeUploadData(child)
            ])
        );
    }

    return value;
}

function decodeStoredUpload(value) {
    if (value?._mapmakerUploadFormat !== UPLOAD_FORMAT_VERSION) {
        return value;
    }

    return decodeUploadData(value.data);
}

export default class LobbyManager {
    constructor() {
        this.running = false;
        this.username = null;
        this.activeRoomKey = null;
        this.isHost = false;
        this.diffListeners = [];
        this.hostUsername = null;

        this.rtcConfig = {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        };

        this.rtcPeers = new Map();
        this.playerListenerUnsubscribe = null;

        this.helpers = { set, ref, removeValue, push, onValue, onChildAdded, db };
    }

    async upload(id, data) {
        await set(dataRef(id), {
            _mapmakerUploadFormat: UPLOAD_FORMAT_VERSION,
            data: encodeUploadData(data)
        });
    }

    async remove(id) {
        await removeValue(dataRef(id));
    }

    async load(id) {
        const snapshot = await get(dataRef(id));
        if (!snapshot.exists()) return null;

        return decodeStoredUpload(snapshot.val());
    }

    async print(id) {
        const data = await this.load(id);
        return data === null ? "" : JSON.stringify(data, null, 2);
    }

    async printAll() {
        const snapshot = await get(ref(db, dataRoot));
        if (!snapshot.exists()) return {};

        return Object.fromEntries(
            Object.entries(snapshot.val()).map(([id, data]) => [
                id,
                decodeStoredUpload(data)
            ])
        );
    }
    heartbeat(){
        if (this.running) return;
        this.running = true;
        setInterval(() => {
            this.update();
        }, 5000); 
    }
    
    update() {
        if (!this.activeRoomKey) return;

        this.load(this.activeRoomKey).then(data => {
            if (data === null) {
                this.activeRoomKey = null;
                this.isHost = false;

                if (this.playerListenerUnsubscribe) {
                    this.playerListenerUnsubscribe();
                    this.playerListenerUnsubscribe = null;
                }

                return;
            }

            const timestamp = Date.now();
            const playerKey = encodeURIComponent(this.username);

            set(
                this.roomDataRef(`players/${playerKey}/lastTime`),
                timestamp
            );

            if (!this.isHost) return;

            set(this.roomDataRef("lastTime"), timestamp);

            get(this.roomDataRef("players")).then(snapshot => {
                if (!snapshot.exists()) return;

                const players = snapshot.val();

                for (const [encodedName, playerData] of Object.entries(players)) {
                    const playerName = decodeURIComponent(encodedName);

                    if (
                        playerData.lastTime &&
                        timestamp - playerData.lastTime > 30000
                    ) {
                        removeValue(
                            this.roomDataRef(
                                `players/${encodeURIComponent(playerName)}`
                            )
                        );
                    }
                }
            }).catch(error => {
                console.error("Error checking players:", error);
            });
        }).catch(error => {
            console.error("Error checking room existence:", error);
        });
    }


    roomDataRef(path = "") {
        const base = `${dataRoot}/${this.activeRoomKey}/data`;
        return ref(db, path ? `${base}/${path}` : base);
    }

    rtcRef(remoteUsername, path = "") {
        const host = this.isHost ? this.username : remoteUsername;
        const guest = this.isHost ? remoteUsername : this.username;
        const pair = `${encodeURIComponent(host)}/${encodeURIComponent(guest)}`;
        const base = `${dataRoot}/${this.activeRoomKey}/rtc/${pair}`;
        return ref(db, path ? `${base}/${path}` : base);
    }
    async startRTC(remoteUsername) {
        if (!this.activeRoomKey || remoteUsername === this.username) return;
        if (this.rtcPeers.has(remoteUsername)) return;

        const peer = {
            pc: new RTCPeerConnection(this.rtcConfig),
            channel: null,
            unsubscribers: [],
            pendingCandidates: []
        };
        this.rtcPeers.set(remoteUsername, peer);

        peer.pc.onicecandidate = event => {
            if (!event.candidate) return;
            push(this.rtcRef(remoteUsername, `candidates/${this.username}`), event.candidate.toJSON());
        };

        peer.pc.onconnectionstatechange = () => {
            console.log(remoteUsername, peer.pc.connectionState);
        };

        this.listenForRTCCandidates(remoteUsername, peer);

        if (this.isHost) {
            peer.channel = peer.pc.createDataChannel("dnd");
            this.setupRTCChannel(remoteUsername, peer.channel);
            await this.createRTCOffer(remoteUsername, peer);
        } else {
            peer.pc.ondatachannel = event => {
                peer.channel = event.channel;
                this.setupRTCChannel(remoteUsername, peer.channel);
            };
            await this.acceptRTCOffer(remoteUsername, peer);
        }
    }

    listenForRTCCandidates(remoteUsername, peer) {
        const candidatesRef = this.rtcRef(remoteUsername, `candidates/${remoteUsername}`);
        const unsubscribe = onChildAdded(candidatesRef, snapshot => {
            this.addRTCCandidate(peer, snapshot.val()).catch(console.error);
        });
        peer.unsubscribers.push(unsubscribe);
    }
    async addRTCCandidate(peer, candidate) {
        if (!peer.pc.remoteDescription) {
            peer.pendingCandidates.push(candidate);
            return;
        }
        await peer.pc.addIceCandidate(candidate);
    }
    async flushRTCCandidates(peer) {
        const candidates = peer.pendingCandidates.splice(0);
        for (const candidate of candidates) {
            await peer.pc.addIceCandidate(candidate);
        }
    }
    async createRTCOffer(remoteUsername, peer) {
        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);
        await set(this.rtcRef(remoteUsername, "offer"), peer.pc.localDescription.toJSON());

        const unsubscribe = onValue(this.rtcRef(remoteUsername, "answer"), async snapshot => {
            if (!snapshot.exists() || peer.pc.remoteDescription) return;
            try {
                await peer.pc.setRemoteDescription(snapshot.val());
                await this.flushRTCCandidates(peer);
            } catch (error) {
                console.error("RTC answer error:", error);
            }
        });
        peer.unsubscribers.push(unsubscribe);
    }
    async acceptRTCOffer(remoteUsername, peer) {
        await new Promise((resolve, reject) => {
            const unsubscribe = onValue(this.rtcRef(remoteUsername, "offer"), async snapshot => {
                if (!snapshot.exists() || peer.pc.remoteDescription) return;
                unsubscribe();
                try {
                    await peer.pc.setRemoteDescription(snapshot.val());
                    await this.flushRTCCandidates(peer);
                    const answer = await peer.pc.createAnswer();
                    await peer.pc.setLocalDescription(answer);
                    await set(this.rtcRef(remoteUsername, "answer"), peer.pc.localDescription.toJSON());
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }, reject);
            peer.unsubscribers.push(unsubscribe);
        });
    }
    setupRTCChannel(remoteUsername, channel) {
        channel.onopen = () => console.log(`Connected to ${remoteUsername}`);
        channel.onclose = () => console.log(`Disconnected from ${remoteUsername}`);
        channel.onmessage = event => {
            try {
                const message = JSON.parse(event.data);
                this.handleRTCMessage(remoteUsername, message);
            } catch (error) {
                console.error("Invalid RTC message:", error);
            }
        };
    }

    /**
     * Returns the host's username.
     * @returns {string|null}
     */
    getHostUsername() {
        if (this.isHost) return this.username;
        return this.hostUsername ?? null;
    }


    // THE IMPORTANT METHODS YAYAYAY this took ages to get to onDiff and sendDiff lol
    /**
     * Registers a listener for incoming diffs.
     * @param {(diff: object, sender: string) => void} callback
     * @returns {() => void} Function to unsubscribe.
     */
    onDiff(callback) {
        this.diffListeners.push(callback);

        return () => {
            this.diffListeners = this.diffListeners.filter(
                listener => listener !== callback
            );
        };
    }

    /**
     * Sends a diff to the host, or broadcasts it when called by the host.
     * aka say we got 5 people. Person A is the host. Person B makes a change. Person B calls sendDiff, which sends the diff to Person A (the host). Person A receives the diff, applies it, and then broadcasts it to everyone else (C, D, E).
     * @param {object} diff
     */
    sendDiff(diff) {
        if (this.isHost) {
            this.applyIncomingDiff(diff, this.username);
            this.broadcastDiff(diff);
            return;
        }

        const host = this.getHostUsername();

        if (!host) {
            console.error("Cannot send diff: host is unknown.");
            return;
        }

        this.sendRTC(host, {
            type: "diff",
            diff
        });
    }

    /**
     * Checks whether a peer's data channel is connected.
     * @param {string} username
     * @returns {boolean}
     */
    isConnected(username) {
        return this.rtcPeers.get(username)?.channel?.readyState === "open";
    }

    /**
     * Checks whether at least one peer is connected.
     * @returns {boolean}
     */
    hasConnection() {
        return [...this.rtcPeers.values()].some(
            peer => peer.channel?.readyState === "open"
        );
    }

    applyIncomingDiff(diff, sender) {
        for (const listener of this.diffListeners) {
            try {
                listener(diff, sender);
            } catch (error) {
                console.error("Diff listener failed:", error);
            }
        }
    }

    handleRTCMessage(remoteUsername, message) {
        if (message.type !== "diff") return;

        if (this.isHost) {
            // Apply the guest's change, then relay it to everyone else.
            this.applyIncomingDiff(message.diff, remoteUsername);
            this.broadcastDiff(message.diff, remoteUsername);
            return;
        }

        // Guests only accept diffs from their host.
        if (remoteUsername !== this.getHostUsername()) return;

        this.applyIncomingDiff(message.diff, remoteUsername);
    }

    broadcastDiff(diff, excludeUsername = null) {
        for (const [username, peer] of this.rtcPeers) {
            if (username === excludeUsername) continue;
            if (peer.channel?.readyState !== "open") continue;

            peer.channel.send(JSON.stringify({
                type: "diff",
                diff
            }));
        }
    }

    sendRTC(remoteUsername, data) {
        const channel = this.rtcPeers.get(remoteUsername)?.channel;
        if (channel?.readyState !== "open") return false;
        channel.send(JSON.stringify(data));
        return true;
    }
    closeRTC(remoteUsername) {
        const peer = this.rtcPeers.get(remoteUsername);
        if (!peer) return;

        peer.unsubscribers.forEach(unsubscribe => unsubscribe());
        peer.pc.close();
        this.rtcPeers.delete(remoteUsername);
    }

    listenForPlayers() {
        if (!this.isHost || !this.activeRoomKey) return;

        if (this.playerListenerUnsubscribe) {
            this.playerListenerUnsubscribe();
        }

        this.playerListenerUnsubscribe = onChildAdded(
            this.roomDataRef("players"),
            snapshot => {
                const remoteUsername = decodeURIComponent(snapshot.key);

                if (remoteUsername === this.username) return;
                if (this.rtcPeers.has(remoteUsername)) return;

                console.log(`New player joined: ${remoteUsername}`);

                this.startRTC(remoteUsername).catch(error => {
                    console.error(
                        `Failed to connect to ${remoteUsername}:`,
                        error
                    );
                });
            }
        );
    }
}

