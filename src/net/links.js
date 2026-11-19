import QRCode from 'qrcode';
import { DEMO } from '../core/demo.js';

const LOCAL = ['localhost', '127.0.0.1', '[::1]', '::1'];
let basePromise = null;

/**
 * The address other devices on the Wi-Fi should use. If this page was opened as "localhost",
 * ask the server for the computer's real network address (localhost means nothing to a phone).
 */
export function lanBase() {
  if (DEMO || !LOCAL.includes(location.hostname)) return Promise.resolve(location.origin);
  basePromise ??= fetch('/api/lan')
    .then((r) => r.json())
    .then((j) => j.urls?.[0] ?? location.origin)
    .catch(() => location.origin);
  return basePromise;
}

export const packPath = (code) => `/pack/${encodeURIComponent(code)}`;
export async function packLink(code) { return `${await lanBase()}${packPath(code)}`; }

/** Read a pack code from a /pack/CODE link (or the old ?room=CODE style). */
export function packCodeFromUrl() {
  const m = location.pathname.match(/^\/pack\/([A-Za-z]{4}-?\d{2})\/?$/);
  if (m) return decodeURIComponent(m[1]).toUpperCase();
  return new URLSearchParams(location.search).get('room')?.toUpperCase() ?? null;
}

/**
 * A "share this link" box: QR code to scan, the link itself, Copy and (on phones) Share.
 * Fills `container` asynchronously.
 */
export async function fillShareBox(container, url, { title = "Merry's Big Escape", text = 'Come and play!' } = {}) {
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#3b2b25', light: '#fffaf0' } });
  container.classList.add('share-box');
  container.innerHTML = `
    <div class="qr">${svg}</div>
    <div class="share-side">
      <div class="hint">Scan with a phone camera, or send the link:</div>
      <input class="link" readonly>
      <div class="share-btns">
        <button class="pill copy">📋 Copy link</button>
        ${navigator.share ? '<button class="pill share">📤 Share…</button>' : ''}
      </div>
    </div>`;
  const input = container.querySelector('.link');
  input.value = url;
  input.onclick = () => input.select();
  const copyBtn = container.querySelector('.copy');
  copyBtn.onclick = async () => {
    try { await navigator.clipboard.writeText(url); }
    catch { input.select(); document.execCommand?.('copy'); } // clipboard API needs https; this works on plain Wi-Fi addresses
    copyBtn.textContent = '✅ Copied!';
    setTimeout(() => (copyBtn.textContent = '📋 Copy link'), 1800);
  };
  container.querySelector('.share')?.addEventListener('click', () => navigator.share({ title, text, url }).catch(() => {}));
}
