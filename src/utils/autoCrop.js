// Auto-crop helper: finds the bounding box of "content" pixels (those that
// differ from the four-corner background by more than `tolerance`) and
// returns a data URL cropped to that box.
//
// Works well for product photography on flat backgrounds (white, grey,
// dark studio). Falls back to the original image if no content is detected
// (e.g. solid-color images, fully transparent, or background that exactly
// matches the subject).

export async function autoCropDataUrl(dataUrl, { tolerance = 30, padding = 12, maxOutputWidth = 1200 } = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) { resolve(dataUrl); return; }

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      let imgData;
      try {
        imgData = ctx.getImageData(0, 0, w, h);
      } catch {
        // Tainted canvas (CORS) — bail out, return original
        resolve(dataUrl); return;
      }
      const data = imgData.data;

      // Sample 5×5 patches from each corner for a robust background colour.
      const cs = 5;
      const samples = [];
      const corners = [
        [0, 0], [w - cs, 0], [0, h - cs], [w - cs, h - cs],
      ];
      for (const [cx, cy] of corners) {
        for (let dy = 0; dy < cs; dy++) {
          for (let dx = 0; dx < cs; dx++) {
            const i = ((cy + dy) * w + (cx + dx)) * 4;
            samples.push([data[i], data[i + 1], data[i + 2]]);
          }
        }
      }
      const bg = [0, 1, 2].map(c =>
        samples.reduce((s, v) => s + v[c], 0) / samples.length
      );

      const diff = (i) => {
        // Treat fully transparent pixels as background
        if (data[i + 3] < 16) return 0;
        return Math.max(
          Math.abs(data[i] - bg[0]),
          Math.abs(data[i + 1] - bg[1]),
          Math.abs(data[i + 2] - bg[2]),
        );
      };

      let minX = w, minY = h, maxX = -1, maxY = -1;
      // Single pass — fast enough for typical 1200px images
      for (let y = 0; y < h; y++) {
        const row = y * w * 4;
        for (let x = 0; x < w; x++) {
          if (diff(row + x * 4) > tolerance) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // Nothing detected, or detected box is suspiciously small (< 5% of image)
      const detectedW = maxX - minX + 1;
      const detectedH = maxY - minY + 1;
      if (maxX < 0 || detectedW * detectedH < w * h * 0.005) {
        resolve(dataUrl); return;
      }

      const px = padding;
      minX = Math.max(0, minX - px);
      minY = Math.max(0, minY - px);
      maxX = Math.min(w - 1, maxX + px);
      maxY = Math.min(h - 1, maxY + px);

      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;

      // Resize down if the cropped region is wider than maxOutputWidth
      let outW = cropW, outH = cropH;
      if (outW > maxOutputWidth) {
        outH = Math.round((maxOutputWidth / outW) * outH);
        outW = maxOutputWidth;
      }

      const out = document.createElement('canvas');
      out.width = outW; out.height = outH;
      out.getContext('2d').drawImage(canvas, minX, minY, cropW, cropH, 0, 0, outW, outH);
      resolve(out.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
