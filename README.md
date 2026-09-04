# Timothy Ogden — Portfolio / CV

A single-page, scroll-driven 3D portfolio built with Vite, vanilla Three.js, and GSAP
(ScrollTrigger). Content is generated from a CV; the WebGL background reacts to scroll
position with a particle field and a slow-rotating wireframe geometry.

## Stack & why

- **Vite + vanilla Three.js** rather than React Three Fiber: the site is a single page with
  no component-driven UI state, so a plain `<canvas>` + a small `BackgroundScene` class keeps
  the render loop and Three.js object lifecycle simple to reason about and easy to profile,
  without the extra abstraction/render-reconciliation cost R3F adds for a scene this size.
- **GSAP + ScrollTrigger** for scroll-linked pinning and reveal animations — mature, handles
  pin/scrub edge cases (resize, nested pins) that hand-rolled `IntersectionObserver` code
  tends to get wrong.

## Project structure

```
index.html                  # markup for all sections + loader + nav
src/
  main.js                   # bootstraps loader, scene, scroll animations
  style.css                 # theme tokens, layout, typography
  three/
    scene.js                # BackgroundScene: particle field + wireframe, scroll-reactive
  scroll/
    scrollController.js     # GSAP ScrollTrigger setup: pin, reveal, nav progress
.github/workflows/deploy.yml  # GitHub Actions: build + deploy to GitHub Pages
```

## Develop

```bash
npm install
npm run dev
```

Opens a local dev server with hot reload.

## Build

```bash
npm run build
npm run preview   # sanity-check the production build locally
```

Output goes to `dist/`.

## Deploy to GitHub Pages

Two options are set up — pick one.

### Option A: GitHub Actions (recommended)

The included workflow (`.github/workflows/deploy.yml`) builds and deploys on every push to
`main`. One-time setup:

1. Push this repo to GitHub.
2. In the repo settings, go to **Pages** → set **Source** to **GitHub Actions**.
3. Push to `main` — the workflow builds and publishes automatically.

### Option B: `gh-pages` package

```bash
npm run deploy
```

This builds the site and pushes `dist/` to a `gh-pages` branch. In repo settings, set
**Pages** → **Source** to **Deploy from a branch** → `gh-pages` / `root`.

### Base path

`vite.config.js` uses `base: './'` (relative paths), so the build works unmodified whether
it's served from a project page (`username.github.io/repo-name/`) or a custom domain — no
need to hardcode the repo name.

## Performance / accessibility notes

- The loading screen covers font loading and the first render frame; there are no heavy
  remote assets yet, so it resolves quickly by design.
- Particle count and pixel ratio are reduced automatically on narrow viewports / low
  `hardwareConcurrency` devices (see `isLowPower` in `scene.js` and `scrollController.js`).
- Section pinning is skipped on low-power/mobile devices — sections still fade in on scroll,
  but native scrolling stays untouched instead of paying pin/scrub costs on weaker hardware.
- `prefers-reduced-motion` disables the continuous rotation/drift in the background scene and
  skips scroll-scrubbed reveals in favour of content being visible immediately.
- The render loop pauses via the Page Visibility API when the tab isn't visible.

## Next steps (iteration)

This scaffold ships a working baseline: placeholder particle field + wireframe background,
per-section pin/reveal, loading screen, responsive layout. From here, effects can be tuned
section-by-section (e.g. distinct geometry/camera behaviour per section rather than a single
continuous scene, custom shaders, section-specific particle formations).
