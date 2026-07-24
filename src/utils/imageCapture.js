// RUTA: src/utils/imageCapture.js
//
// Captura de foto → base64 COMPACTO (JPEG redimensionado) para adjuntar en
// Firestore sin Storage (patrón ya usado en el proyecto: imágenes como data URL).
// Se redimensiona y comprime para no inflar los documentos (límite 1 MB de
// Firestore) — una planilla o novedad queda en ~40–150 KB.

// Convierte un File de imagen en un data URL JPEG redimensionado.
// maxDim: lado mayor máximo en px. quality: 0..1 de compresión JPEG.
export function fileToCompactDataURL(file, { maxDim = 1280, quality = 0.6 } = {}) {
    return new Promise((resolve, reject) => {
        if (!file) { reject(new Error('Sin archivo')); return; }
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('Imagen inválida'));
            img.onload = () => {
                try {
                    let { width, height } = img;
                    if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
                    else if (height >= width && height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
                    const canvas = document.createElement('canvas');
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    // Si el navegador (WebView viejo) no soporta toDataURL con calidad,
                    // cae al data URL original sin romper el flujo.
                    let out;
                    try { out = canvas.toDataURL('image/jpeg', quality); }
                    catch { out = reader.result; }
                    resolve(out || reader.result);
                } catch (e) { reject(e); }
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}
