// Crop an image (data URL or blob URL) to the given pixel rectangle, then
// resize so the longest side is no more than `maxOut`. Returns a JPEG data
// URL suitable for inline storage in the pack's images[] JSONB.
//
// react-easy-crop returns `pixelCrop` in natural-image coordinates, so we
// pass them straight into ctx.drawImage. The output canvas is sized to the
// crop (up to maxOut) to avoid bloating localStorage with 4K-scale photos.

// Crop output is at high quality (0.95) and a generous max dimension
// (2400px) so detail survives intact for the final compressForUpload
// pass which is where real compression to WebP @ 0.92 happens.
export function getCroppedDataUrl(src, pixelCrop, maxOut = 2400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const { x, y, width, height } = pixelCrop;
        if (!width || !height) {
          resolve(src);
          return;
        }

        let outW = Math.round(width);
        let outH = Math.round(height);
        const longest = Math.max(outW, outH);
        if (longest > maxOut) {
          const scale = maxOut / longest;
          outW = Math.round(outW * scale);
          outH = Math.round(outH * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, x, y, width, height, 0, 0, outW, outH);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = src;
  });
}

// Turn a File/Blob into a data URL. Used when the user drops a new image
// into an AspectPhoto slot — we need a URL before opening the crop modal.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
