import './style.css';
import { BackgroundScene } from './three/scene.js';
import { CritterField, CRITTERS_ENABLED } from './three/critters.js';
import { initScrollAnimations } from './scroll/scrollController.js';
import { initConsent } from './consent.js';

const loader = document.getElementById('loader');
const barFill = document.getElementById('loader-bar-fill');
const pctLabel = document.getElementById('loader-pct');

function setLoaderProgress(pct) {
  const clamped = Math.min(100, Math.round(pct));
  barFill.style.width = `${clamped}%`;
  pctLabel.textContent = `${clamped}%`;
}

function hideLoader() {
  loader.classList.add('is-hidden');
  loader.addEventListener('transitionend', () => loader.remove(), { once: true });
}

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch (e) {
    return false;
  }
}

function initSmoothNavLinks() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

async function bootstrap() {
  // There are no heavy remote assets yet, so the loading screen mainly
  // covers font loading + first scene frame. The staged progress keeps the
  // indicator feeling alive rather than jumping straight to 100%.
  setLoaderProgress(15);

  const canvas = document.getElementById('bg-canvas');
  const critterCanvas = document.getElementById('critter-canvas');
  let scene = null;
  let critters = null;

  if (supportsWebGL()) {
    scene = new BackgroundScene(canvas);
    if (CRITTERS_ENABLED) {
      critters = new CritterField(critterCanvas, scene.colorA, scene.colorB);
    } else {
      critterCanvas.style.display = 'none';
    }
  } else {
    canvas.style.display = 'none';
    critterCanvas.style.display = 'none';
  }

  setLoaderProgress(55);

  await document.fonts.ready.catch(() => {});
  setLoaderProgress(85);

  initScrollAnimations(scene);
  initSmoothNavLinks();
  initConsent();

  if (scene) scene.start();
  if (critters) critters.start();

  setLoaderProgress(100);
  window.setTimeout(hideLoader, 250);
}

bootstrap();
