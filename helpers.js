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