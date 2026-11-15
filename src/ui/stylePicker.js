import { STYLES, applyStyle } from '../render/stylePresets.js';

const KEY = 'merry.style';
function load() { try { return localStorage.getItem(KEY); } catch { return null; } }
function save(v) { try { localStorage.setItem(KEY, v); } catch { /* storage unavailable */ } }

/** A row of style buttons (and number keys 1–5) for comparing art styles. */
export function createStylePicker(pipeline, onChange) {
  const keys = Object.keys(STYLES);
  const bar = document.createElement('div');
  bar.className = 'style-picker';
  bar.innerHTML = `<span class="label">Art style</span>`;
  const blurb = document.createElement('div');
  blurb.className = 'style-blurb';
  const buttons = keys.map((k, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<kbd>${i + 1}</kbd> ${STYLES[k].label}`;
    b.addEventListener('click', () => select(k));
    bar.appendChild(b);
    return b;
  });
  bar.appendChild(blurb);
  document.getElementById('hud').appendChild(bar);

  function select(k) {
    applyStyle(pipeline, k);
    buttons.forEach((b, i) => b.classList.toggle('active', keys[i] === k));
    blurb.textContent = STYLES[k].blurb;
    save(k);
    onChange?.(k);
  }
  window.addEventListener('keydown', (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= keys.length) select(keys[n - 1]);
  });
  select(keys.includes(load()) ? load() : 'storybook');
}
