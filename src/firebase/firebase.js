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

function dataRef(id) {
    return ref(db, `${dataRoot}/${id}`);
}

export default class LobbyManager {
    async upload(id, data) {
        await set(dataRef(id), data);
    }

    async remove(id) {
        await removeValue(dataRef(id));
    }

    async load(id) {
        const snapshot = await get(dataRef(id));
        return snapshot.exists() ? snapshot.val() : null;
    }

    async print(id) {
        const data = await this.load(id);
        return data === null ? "" : JSON.stringify(data, null, 2);
    }

    async printAll() {
        const snapshot = await get(ref(db, dataRoot));
        return snapshot.exists() ? snapshot.val() : {};
    }
}
