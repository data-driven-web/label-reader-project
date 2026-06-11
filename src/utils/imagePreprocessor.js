/**
 * imagePreprocessor — canvas preprocessing and PDF rendering.
 *
 * Preprocessing (grayscale + contrast stretch) is applied on retry when a
 * first OCR pass comes back below the low-confidence threshold. PDF pages
 * are rasterized client-side with pdf.js — still zero server involvement.
 */

/** Grayscale + linear contrast stretch. Returns a new canvas. */
export function enhanceCanvas(sourceCanvas) {
  const canvas = document.createElement('canvas');
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, ((g - min) / range) * 255));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Render the first page of a PDF file to a PNG blob.
 * Throws { code: 'PDF_UNREADABLE' } when the PDF has no renderable page.
 */
export async function pdfToImageBlob(file) {
  // Dynamic import keeps pdf.js out of the main bundle — most uploads are
  // images and never pay this cost.
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  } catch {
    const err = new Error('PDF could not be parsed');
    err.code = 'PDF_UNREADABLE';
    throw err;
  }
  if (pdf.numPages < 1) {
    const err = new Error('PDF has no pages');
    err.code = 'PDF_UNREADABLE';
    throw err;
  }
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else {
        const err = new Error('PDF render produced no image');
        err.code = 'PDF_UNREADABLE';
        reject(err);
      }
    }, 'image/png');
  });
}
