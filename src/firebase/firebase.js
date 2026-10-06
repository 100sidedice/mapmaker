import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import {
    getDatabase,
    get,
    ref,
    remove as removeValue,
    set
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
}
