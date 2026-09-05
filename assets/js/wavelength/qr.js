/**
 * QR rendering for the clue-giver link.
 *
 * Uses `qrcode-generator` pulled from jsDelivr as an ES module so the site
 * stays dependency-free and buildless. If the CDN is unreachable (no wifi
 * at the party, etc.) we fall back to printing the raw URL so the round is
 * still playable.
 */

const CDN_URL = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm';

let libraryPromise = null;

function loadLibrary() {
  if (!libraryPromise) {
    libraryPromise = import(/* @vite-ignore */ CDN_URL).then((mod) => mod.default || mod);
  }
  return libraryPromise;
}

/**
 * Render `text` as an SVG QR code into `container`.
 * @returns {Promise<boolean>} true if a real QR was drawn
 */
export async function renderQr(container, text) {
  try {
    const qrcode = await loadLibrary();

    // Type 0 lets the library pick the smallest version that fits.
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();

    container.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
    container.classList.remove('wl-qr--failed');
    return true;
  } catch (error) {
    console.error('[wavelength] Could not render QR code:', error);
    container.classList.add('wl-qr--failed');
    container.innerHTML = `
      <p class="wl-qr-error-title">QR unavailable</p>
      <p class="wl-qr-error-url">${escapeHtml(text)}</p>
    `;
    return false;
  }
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
