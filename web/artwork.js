/** Bundled GPT Image bitmap artwork. Never included in state or generation inputs. */
import {VIEW_IDS} from './presentation_state.js';
import {avatarSVG} from './avatar.js';

export const ATLAS_SIZE = Object.freeze([1254, 1254]);
// All three bodies use identical viewport sizes to retain a common figure scale.
// The side viewport includes transparent horizontal padding, not enlarged anatomy.
export const ARTWORK_RECTS = Object.freeze({
  face_front: Object.freeze([0, 75, 470, 560]),
  // Reuse the approved bald, neutral side-view bitmap from head through chest.
  // This is a bounded viewport only: no mirrored face or replacement artwork.
  face_left: Object.freeze([1010, 35, 140, 205]),
  body_front: Object.freeze([495, 20, 350, 625]),
  body_3q: Object.freeze([495, 20, 350, 625]),
  body_left: Object.freeze([904, 20, 350, 625]),
  body_right: Object.freeze([904, 20, 350, 625]),
  body_back: Object.freeze([55, 625, 350, 625]),
  hands: Object.freeze([415, 755, 445, 400]),
  feet: Object.freeze([860, 820, 380, 340]),
});
let artworkSequence = 0;
const EXTRA_VIEWS = new Set(['face_right', 'face_3q_left', 'face_3q_right', 'face_back']);
export const ATLAS_URL = new URL('./assets/mannequin-atlas.png', import.meta.url).href;

export function artworkRect(view) {
  if (!VIEW_IDS.includes(view)) throw new RangeError(`Unknown artwork view: ${view}`);
  return ARTWORK_RECTS[view];
}

export function createArtwork(view, idPrefix, {mirror = false, crop = null} = {}) {
  if (view.startsWith('clothing_')) {
    const frame = document.createElement('span'); frame.className = 'moss-artwork';
    frame.dataset.artwork = view; frame.dataset.artworkSource = 'garment-symbol';
    frame.setAttribute('aria-hidden', 'true');
    const back = view === 'clothing_back';
    frame.innerHTML = `<svg viewBox="0 0 100 120" aria-hidden="true"><g fill="#a8b4bd" stroke="#53616b" stroke-width="2" stroke-linejoin="round"><path d="M34 8L18 17 7 42 23 49 31 31 31 61 69 61 69 31 77 49 93 42 82 17 66 8Q50 ${back ? '17' : '30'} 34 8Z"/><path d="M32 68H68L76 111 56 114 50 83 44 114 24 111Z"/></g><path d="M34 8Q50 ${back ? '17' : '30'} 66 8M32 74H68" fill="none" stroke="#53616b" stroke-width="2"/></svg>`;
    return frame;
  }
  if (EXTRA_VIEWS.has(view)) {
    const frame = document.createElement('span'); frame.className = 'moss-artwork';
    if (mirror) frame.style.transform = 'scaleX(-1)';
    frame.dataset.artwork = view; frame.dataset.artworkSource = 'gpt-image-derived';
    frame.setAttribute('aria-hidden', 'true');
    const image = document.createElement('img'); image.alt = ''; image.draggable = false;
    image.src = new URL('./assets/' + view + '.png', import.meta.url).href;
    image.addEventListener('error', () => {
      // Remain selectable if an incomplete installation omitted this local asset.
      frame.dataset.artworkFallback = 'missing'; image.remove();
    }, {once: true});
    frame.append(image); return frame;
  }
  const rect = crop ?? artworkRect(view);
  const frame = document.createElement('span');
  frame.className = 'moss-artwork';
  if (mirror) frame.style.transform = 'scaleX(-1)';
  frame.dataset.artwork = view;
  frame.dataset.artworkSource = 'gpt-image';
  frame.setAttribute('aria-hidden', 'true');
  // SVG is only a lossless atlas viewport here. The visible art is the original
  // generated PNG bitmap; no hand-drawn mannequin paths are used on success.
  const ns = 'http://www.w3.org/2000/svg';
  const viewport = document.createElementNS(ns, 'svg');
  viewport.classList.add('moss-raster-avatar');
  viewport.setAttribute('viewBox', rect.join(' '));
  viewport.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  viewport.setAttribute('aria-hidden', 'true');
  viewport.setAttribute('focusable', 'false');
  viewport.setAttribute('overflow', 'hidden');
  const clipId = `moss-atlas-${String(idPrefix ?? 'view').replace(/[^a-zA-Z0-9_-]/g, '_')}-${++artworkSequence}`;
  const defs = document.createElementNS(ns, 'defs');
  const clip = document.createElementNS(ns, 'clipPath');
  clip.id = clipId;
  clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
  const clipRect = document.createElementNS(ns, 'rect');
  for (const [index, attribute] of ['x', 'y', 'width', 'height'].entries()) clipRect.setAttribute(attribute, String(rect[index]));
  clip.append(clipRect); defs.append(clip); viewport.append(defs);
  const image = document.createElementNS(ns, 'image');
  // Clip the source rectangle itself, not merely the viewport. Otherwise
  // preserveAspectRatio letterboxing can expose neighboring atlas figures.
  image.setAttribute('clip-path', `url(#${clipId})`);
  image.setAttribute('width', String(ATLAS_SIZE[0]));
  image.setAttribute('height', String(ATLAS_SIZE[1]));
  image.addEventListener('error', () => {
    // Missing local asset only: preserve an operable selector, never fetch remote art.
    frame.innerHTML = avatarSVG(view, idPrefix);
    frame.dataset.artworkFallback = 'svg';
    frame.dataset.artworkSource = 'local-fallback';
  }, {once: true});
  image.setAttribute('href', ATLAS_URL);
  viewport.append(image);
  frame.append(viewport);
  return frame;
}
