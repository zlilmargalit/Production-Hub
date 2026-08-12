// Turn a chosen file into a stored receipt URL.
//
// Photos go through a canvas first. A phone camera produces 3–8MB per shot and
// a receipt is legible at a fraction of that; sending the original would push
// megabytes through the JSON body for no gain in readability. PDFs pass through
// untouched — rasterising a PDF receipt would lose the text layer.

const MAX_WIDTH = 1600;   // enough to read small print on a long till receipt
const QUALITY   = 0.82;

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload  = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Could not read that file'));
  reader.readAsDataURL(file);
});

const compress = (dataUrl) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    let { width, height } = img;
    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width  = MAX_WIDTH;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    resolve(canvas.toDataURL('image/jpeg', QUALITY));
  };
  // A file the browser cannot decode is sent as-is and refused by the server,
  // which gives a clearer message than failing silently here.
  img.onerror = () => resolve(dataUrl);
  img.src = dataUrl;
});

/**
 * @param {File} file        from an <input type="file">
 * @param {string} artistQS  the caller's `?artistId=…` (or '')
 * @returns {Promise<string>} the stored receipt's URL
 */
export async function uploadReceipt(file, artistQS = '') {
  const raw = await readAsDataUrl(file);
  const body = file.type === 'application/pdf' ? raw : await compress(raw);

  const res = await fetch(`/api/receipts${artistQS}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload failed (${res.status})`);
  }
  return (await res.json()).url;
}
