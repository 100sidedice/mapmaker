/**
 * Show an alert message for a specified duration.
 * @param {string} message 
 * @param {number} timeout 
 */
globalThis.showAlert = (message, timeout = 1000) => {
    const container = document.getElementById("alertContainer");
    setTimeout(() => {
        container.classList.add("hide");
    }, timeout);
    container.classList.remove("hide");
    container.textContent = message;
}