export function zipFiles(...canvas_images) {
    // create a zip file with the given canvas images
    const zip = new JSZip();
    canvas_images.forEach((canvas_image, index) => {
        const dataURL = canvas_image.toDataURL('image/png');
        const base64Data = dataURL.split(',')[1];
        zip.file(`map_${index}.png`, base64Data, { base64: true });
    });
    return zip.generateAsync({ type: 'blob' });

}
export function resizeCanvas() {
    const canvas = document.getElementById('mapCanvas');
    const dpi = window.devicePixelRatio || 1;
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const width = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    canvas.width = width * dpi;
    canvas.height = height * dpi;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    return dpi; //scale factor
}
/**
 * Hashes the tiles in a region.
 * @param {*} tiles 
 * @returns 
 */
export function hashTiles(tiles){
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
