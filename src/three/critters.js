import * as THREE from 'three';

/**
 * A roster of procedurally-built, low-poly "cartoony" ships and critters
 * that periodically fly across the page — a playful decorative layer, in
 * the same neon-wireframe style as the orb so it reads as part of the same
 * world rather than a mismatched add-on. Runs on its OWN canvas/renderer
 * (not the main BackgroundScene's) with plain unlit rendering and no
 * post-processing, so it can safely sit above the page content: layering
 * the main scene's canvas above content broke transparency, because
 * UnrealBloomPass's composite shader doesn't preserve alpha — this field
 * never touches that pipeline, so its canvas stays properly transparent
 * wherever nothing is flying.
 *
 * Roughly every ~10s a random idle critter launches on a random straight-ish
 * path (with a light sinusoidal wobble so it doesn't read as a robotic
 * straight line) across the visible depth range, fading in/out at the
 * start/end of its flight, then goes idle again.
 */

const isLowPower =
  window.matchMedia('(max-width: 720px)').matches ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

// Runs on mobile too (unlike the main scene's bloom pass) — critters are
// cheap unlit meshes with no post-processing, so the cost is low. Pixel
// ratio and concurrency are still trimmed on low-power devices below.
export const CRITTERS_ENABLED = true;

function solidMat(color, opacity = 0.85) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
  mat.userData.baseOpacity = opacity;
  return mat;
}

/** Adds a glowing neon outline to a mesh, matching the main orb's look. */
function edged(mesh, color, opacity = 0.9) {
  const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  lineMat.userData.baseOpacity = opacity;
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20), lineMat));
  return mesh;
}

/** A pair of small eye dots facing -Z (Three's default "forward"), so they
 * lead the direction of travel once a critter is oriented via lookAt. */
function addEyes(group, color, { spacing = 0.08, size = 0.04, z = -0.15, y = 0.02 } = {}) {
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), solidMat(color, 1));
    eye.position.set(side * spacing, y, z);
    group.add(eye);
  });
}

// --- "Sad trombone" explosion sound -----------------------------------
// Synthesized via Web Audio rather than an audio file — no external asset
// to license/host for a one-off comedic sting this small, and it's a
// handful of lines either way.

let audioCtx = null;

function getAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  // Browsers start contexts suspended until a user gesture; this is
  // always called from a click handler, so resuming here is safe.
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

/** Classic descending "wah-wah-wah-waaah" — four notes, each with a
 * slight downward pitch bend, the last one held and bent further for
 * the comedic "sad" finish. */
function playSadTrombone() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [
    { freq: 392.0, start: 0, duration: 0.22 }, // G4
    { freq: 369.99, start: 0.22, duration: 0.22 }, // F#4
    { freq: 349.23, start: 0.44, duration: 0.22 }, // F4
    { freq: 329.63, start: 0.66, duration: 0.6 }, // E4, held + bent for the "waaah"
  ];

  const master = ctx.createGain();
  master.gain.value = 0.14;
  master.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1100;
  filter.connect(master);

  notes.forEach(({ freq, start, duration }) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const t0 = ctx.currentTime + start;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.linearRampToValueAtTime(freq * 0.92, t0 + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(1, t0 + 0.03);
    gain.gain.setValueAtTime(1, t0 + duration - 0.08);
    gain.gain.linearRampToValueAtTime(0, t0 + duration);

    osc.connect(gain);
    gain.connect(filter);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  });
}

// --- Ship archetypes (forward = -Z) ---------------------------------------

function buildSaucer(color, accent) {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8), solidMat(color));
  disc.scale.set(1, 0.28, 1);
  edged(disc, accent);
  group.add(disc);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    solidMat(accent, 0.7)
  );
  dome.position.y = 0.1;
  group.add(dome);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.02, 6, 24), solidMat(accent, 1));
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  return group;
}

function buildRocket(color, accent) {
  const group = new THREE.Group();
  const bodyGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.6, 10).rotateX(Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, solidMat(color));
  edged(body, accent);
  group.add(body);
  const noseGeo = new THREE.ConeGeometry(0.14, 0.3, 10).rotateX(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, solidMat(accent));
  nose.position.z = -0.45;
  group.add(nose);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.16), solidMat(accent));
    fin.position.set(Math.cos(angle) * 0.16, Math.sin(angle) * 0.16, 0.28);
    group.add(fin);
  }
  return group;
}

function buildFighter(color, accent) {
  const group = new THREE.Group();
  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.66), solidMat(color));
  edged(fuselage, accent);
  group.add(fuselage);
  const wingGeo = new THREE.ConeGeometry(0.3, 0.46, 3).rotateZ(Math.PI / 2);
  const wingL = new THREE.Mesh(wingGeo, solidMat(accent, 0.8));
  wingL.scale.set(0.4, 1, 1);
  wingL.position.set(0.3, 0, 0.08);
  group.add(wingL);
  const wingR = wingL.clone();
  wingR.position.x = -0.3;
  wingR.scale.x = -0.4;
  group.add(wingR);
  return group;
}

function buildCargo(color, accent) {
  const group = new THREE.Group();
  const main = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.5), solidMat(color));
  edged(main, accent);
  group.add(main);
  const pod = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.2), solidMat(accent, 0.8));
  pod.position.z = -0.28;
  edged(pod, accent);
  group.add(pod);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4), solidMat(accent));
  antenna.position.set(0, 0.22, 0.1);
  group.add(antenna);
  return group;
}

function buildDrone(color, accent) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), solidMat(color));
  edged(core, accent);
  group.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.015, 6, 28), solidMat(accent, 1));
  ring.rotation.x = Math.PI / 3;
  group.add(ring);
  return group;
}

function buildShuttle(color, accent) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.5), solidMat(color));
  edged(body, accent);
  group.add(body);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), solidMat(accent, 0.8));
  cockpit.position.set(0, 0.07, -0.2);
  group.add(cockpit);
  const wingGeo = new THREE.ConeGeometry(0.34, 0.5, 3).rotateZ(Math.PI / 2);
  const wingL = new THREE.Mesh(wingGeo, solidMat(accent, 0.75));
  wingL.scale.set(0.32, 1, 1);
  wingL.position.set(0.15, -0.02, 0.08);
  group.add(wingL);
  const wingR = wingL.clone();
  wingR.position.x = -0.15;
  wingR.scale.x = -0.32;
  group.add(wingR);
  return group;
}

function buildInterceptor(color, accent) {
  const group = new THREE.Group();
  const boomGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8).rotateX(Math.PI / 2);
  [-0.18, 0.18].forEach((x) => {
    const boom = new THREE.Mesh(boomGeo, solidMat(color));
    boom.position.x = x;
    edged(boom, accent);
    group.add(boom);
  });
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.1), solidMat(accent, 0.8));
  crossbar.position.z = 0.05;
  group.add(crossbar);
  const pod = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), solidMat(accent));
  pod.position.z = -0.32;
  group.add(pod);
  return group;
}

function buildProbe(color, accent) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), solidMat(color));
  edged(core, accent);
  group.add(core);
  const legGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(legGeo, solidMat(accent));
    leg.position.set(Math.cos(angle) * 0.16, -0.15, Math.sin(angle) * 0.16);
    leg.rotation.z = Math.cos(angle) * 0.5;
    leg.rotation.x = Math.sin(angle) * 0.5;
    group.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), solidMat(accent, 1));
    foot.position.set(Math.cos(angle) * 0.24, -0.28, Math.sin(angle) * 0.24);
    group.add(foot);
  }
  return group;
}

// --- Character archetypes (forward = -Z) ----------------------------------

function buildBlob(color, accent) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), solidMat(color));
  body.scale.set(1, 0.9, 1);
  edged(body, accent, 0.6);
  group.add(body);
  addEyes(group, 0xffffff, { spacing: 0.1, size: 0.045, z: -0.22 });
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 4), solidMat(accent));
  antenna.position.set(0, 0.3, 0.02);
  antenna.rotation.x = -0.3;
  group.add(antenna);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), solidMat(accent, 1));
  tip.position.set(0, 0.38, -0.05);
  group.add(tip);
  return group;
}

function buildRobot(color, accent) {
  const group = new THREE.Group();
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.2), solidMat(color));
  edged(head, accent);
  group.add(head);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.22), solidMat(color));
  body.position.y = -0.24;
  edged(body, accent);
  group.add(body);
  addEyes(group, accent, { spacing: 0.06, size: 0.03, z: -0.11 });
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 4), solidMat(accent));
  antenna.position.set(0, 0.28, 0);
  group.add(antenna);
  return group;
}

function buildGhost(color, accent) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65),
    solidMat(color, 0.7)
  );
  edged(body, accent, 0.6);
  group.add(body);
  addEyes(group, accent, { spacing: 0.08, size: 0.04, z: -0.2 });
  return group;
}

function buildCreature(color, accent) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), solidMat(color));
  edged(body, accent, 0.6);
  group.add(body);
  const wingGeo = new THREE.ConeGeometry(0.22, 0.34, 3).rotateZ(Math.PI / 2.4);
  const wingL = new THREE.Mesh(wingGeo, solidMat(accent, 0.7));
  wingL.scale.set(0.3, 1, 1);
  wingL.position.set(0.2, 0.05, 0);
  group.add(wingL);
  const wingR = wingL.clone();
  wingR.position.x = -0.2;
  wingR.scale.x = -0.3;
  group.add(wingR);
  addEyes(group, 0xffffff, { spacing: 0.06, size: 0.035, z: -0.17 });
  return group;
}

function buildTallAlien(color, accent) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), solidMat(color));
  body.scale.set(0.8, 1.6, 0.8);
  edged(body, accent, 0.6);
  group.add(body);
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), solidMat(0x0a0614, 1));
    eye.position.set(side * 0.08, 0.1, -0.13);
    group.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), solidMat(accent, 1));
    pupil.position.set(side * 0.08, 0.1, -0.19);
    group.add(pupil);
  });
  return group;
}

function buildJelly(color, accent) {
  const group = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    solidMat(color, 0.65)
  );
  edged(dome, accent, 0.5);
  group.add(dome);
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const len = 0.22 + Math.random() * 0.1;
    const tentacle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.006, len, 5),
      solidMat(accent, 0.6)
    );
    tentacle.position.set(Math.cos(angle) * 0.14, -len / 2, Math.sin(angle) * 0.14);
    group.add(tentacle);
  }
  return group;
}

function buildCrab(color, accent) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.22), solidMat(color));
  edged(body, accent, 0.7);
  group.add(body);
  const legGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4);
  [-1, 1].forEach((side) => {
    [-0.06, 0.06].forEach((z) => {
      const leg = new THREE.Mesh(legGeo, solidMat(accent));
      leg.position.set(side * 0.2, -0.06, z);
      leg.rotation.z = side * 0.9;
      group.add(leg);
    });
  });
  [-1, 1].forEach((side) => {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 4), solidMat(accent));
    stalk.position.set(side * 0.06, 0.1, -0.13);
    stalk.rotation.x = -0.5;
    group.add(stalk);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), solidMat(0xffffff, 1));
    eye.position.set(side * 0.06, 0.15, -0.19);
    group.add(eye);
  });
  return group;
}

function buildCruiser(color, accent) {
  const group = new THREE.Group();
  const segments = [
    { size: [0.22, 0.16, 0.22], z: 0.2 },
    { size: [0.18, 0.14, 0.24], z: -0.06 },
    { size: [0.13, 0.11, 0.22], z: -0.3 },
  ];
  segments.forEach(({ size, z }) => {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(...size), solidMat(color));
    seg.position.z = z;
    edged(seg, accent, 0.7);
    group.add(seg);
  });
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.18), solidMat(accent));
  fin.position.set(0, 0.13, 0.2);
  group.add(fin);
  return group;
}

function buildStealth(color, accent) {
  const group = new THREE.Group();
  const wingGeo = new THREE.ConeGeometry(0.42, 0.62, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4);
  const body = new THREE.Mesh(wingGeo, solidMat(color));
  body.scale.set(1, 0.12, 1);
  edged(body, accent, 0.75);
  group.add(body);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), solidMat(accent));
  cockpit.position.set(0, 0.05, -0.1);
  group.add(cockpit);
  return group;
}

function buildSpiderBot(color, accent) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), solidMat(color));
  edged(body, accent, 0.65);
  group.add(body);
  const legGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.22, 4);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const leg = new THREE.Mesh(legGeo, solidMat(accent));
    leg.position.set(Math.cos(angle) * 0.16, -0.05, Math.sin(angle) * 0.16 - 0.02);
    leg.rotation.z = Math.cos(angle) * 0.7;
    leg.rotation.x = Math.sin(angle) * 0.7 + 0.3;
    group.add(leg);
  }
  addEyes(group, 0xffffff, { spacing: 0.06, size: 0.03, z: -0.16 });
  return group;
}

function buildEyeball(color, accent) {
  const group = new THREE.Group();
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), solidMat(0xffffff, 0.95));
  edged(eye, accent, 0.5);
  group.add(eye);
  const iris = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), solidMat(color, 1));
  iris.position.z = -0.2;
  group.add(iris);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), solidMat(0x07030f, 1));
  pupil.position.z = -0.27;
  group.add(pupil);
  return group;
}

const SHIP_BUILDERS = [
  buildSaucer,
  buildRocket,
  buildFighter,
  buildCargo,
  buildDrone,
  buildShuttle,
  buildInterceptor,
  buildProbe,
  buildCruiser,
  buildStealth,
];
const CHARACTER_BUILDERS = [
  buildBlob,
  buildRobot,
  buildGhost,
  buildCreature,
  buildTallAlien,
  buildJelly,
  buildCrab,
  buildSpiderBot,
  buildEyeball,
];

export class CritterField {
  constructor(canvas, colorA, colorB) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.isRunning = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 9);

    // No post-processing here — see the module docblock for why bloom
    // specifically is incompatible with sitting above the page content.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isLowPower ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Two brand accents plus two extra tones (soft violet, warm yellow) so
    // the 23-strong roster reads as varied rather than a palette of two.
    const palette = [colorA, colorB, 0xb388ff, 0xffe066];

    const configs = [];
    SHIP_BUILDERS.forEach((build, i) => {
      configs.push({ build, color: palette[i % 2], accent: palette[(i + 1) % 2] });
      configs.push({ build, color: palette[2 + (i % 2)], accent: palette[i % 2] });
    });
    CHARACTER_BUILDERS.forEach((build, i) => {
      configs.push({ build, color: palette[(i + 1) % 2], accent: palette[i % 2] });
    });
    // SHIP_BUILDERS x2 colour variants (20) + CHARACTER_BUILDERS (9) = 29.

    this.critters = configs.map(({ build, color, accent }) => {
      const mesh = build(color, accent);
      mesh.visible = false;
      mesh.scale.setScalar(1.5);
      this.scene.add(mesh);
      return {
        mesh,
        color,
        accent,
        flying: false,
        t: 0,
        duration: 8,
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        wobbleAxis: new THREE.Vector3(0, 1, 0),
        wobbleAmp: 0,
        wobbleFreq: 1,
        wobblePhase: 0,
      };
    });

    // Active pixel-burst explosions from clicked/tapped critters.
    this.explosions = [];

    // Launch the first one a few seconds in rather than instantly on load.
    this.sinceLastSpawn = 6;

    // The longer someone stays on the page, the busier the sky gets: spawn
    // interval shrinks and the concurrent-flight cap rises, both eased over
    // RAMP_DURATION seconds of real time spent on the page, then holding at
    // the capped/dense end state. See _rampedParams(), called every frame.
    this.sessionElapsed = 0;
    this.RAMP_DURATION = 150;
    this.spawnIntervalStart = 10;
    this.spawnIntervalMin = isLowPower ? 6 : 3.5;
    this.maxConcurrentStart = isLowPower ? 2 : 4;
    this.maxConcurrentCap = isLowPower ? 5 : 10;

    this.spawnInterval = this.spawnIntervalStart;
    this.maxConcurrent = this.maxConcurrentStart;

    this._onResize = this._onResize.bind(this);
    this._onClick = this._onClick.bind(this);
    window.addEventListener('resize', this._onResize);
    // Unlike BackgroundScene, this field doesn't pause on document.hidden —
    // critters are cheap unlit meshes with no bloom pass, so the perf case
    // for pausing is weak, and it's simpler/more reliable to just always run.
    // Bound to window rather than the canvas: the canvas has
    // pointer-events:none (so it never blocks clicks on nav/links/etc
    // beneath it), but a window-level listener still receives every click
    // via bubbling regardless of which element actually got hit-tested, so
    // we can hit-test critters ourselves without breaking anything else.
    window.addEventListener('click', this._onClick);
  }

  /** Screen-space hit test (forgiving for touch) rather than exact 3D
   * raycasting — critters are small and often far/fast, so a generous
   * pixel radius makes them reliably tappable on mobile. */
  _onClick(event) {
    const flying = this.critters.filter((c) => c.flying);
    if (!flying.length) return;

    const worldPos = new THREE.Vector3();
    let closest = null;
    let closestDist = Infinity;

    flying.forEach((c) => {
      c.mesh.getWorldPosition(worldPos);
      const projected = worldPos.project(this.camera);
      if (projected.z > 1) return; // behind the camera
      const screenX = (projected.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-projected.y * 0.5 + 0.5) * window.innerHeight;
      const dist = Math.hypot(event.clientX - screenX, event.clientY - screenY);
      if (dist < 42 && dist < closestDist) {
        closestDist = dist;
        closest = c;
      }
    });

    if (closest) this._explode(closest);
  }

  /** Hides the critter and bursts it into a shower of small colored
   * "pixels" (square additive points, matching its own two-tone colours)
   * that scatter outward, fall, and fade — then the critter goes back into
   * the idle pool to potentially fly again later. */
  _explode(c) {
    c.flying = false;
    c.mesh.visible = false;
    playSadTrombone();

    const origin = new THREE.Vector3();
    c.mesh.getWorldPosition(origin);

    const count = 26;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = [];
    const tmpColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;

      tmpColor.set(Math.random() < 0.5 ? c.color : c.accent);
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;

      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 3.2,
          (Math.random() - 0.5) * 3.2 + 0.8,
          (Math.random() - 0.5) * 3.2
        )
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // No map/texture: plain GL points render as crisp squares, which reads
    // as "pixels" rather than soft round dots — fits the 8-bit brief.
    const material = new THREE.PointsMaterial({
      size: 0.07,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);
    this.explosions.push({ points, velocities, age: 0, maxAge: 0.8 + Math.random() * 0.3 });
  }

  _updateExplosions(delta) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.age += delta;

      const posAttr = ex.points.geometry.attributes.position;
      for (let j = 0; j < ex.velocities.length; j++) {
        const v = ex.velocities[j];
        v.y -= delta * 2.4; // gravity
        posAttr.array[j * 3] += v.x * delta;
        posAttr.array[j * 3 + 1] += v.y * delta;
        posAttr.array[j * 3 + 2] += v.z * delta;
      }
      posAttr.needsUpdate = true;
      ex.points.material.opacity = Math.max(0, 1 - ex.age / ex.maxAge);

      if (ex.age >= ex.maxAge) {
        this.scene.remove(ex.points);
        ex.points.geometry.dispose();
        ex.points.material.dispose();
        this.explosions.splice(i, 1);
      }
    }
  }

  _onResize() {
    const { innerWidth, innerHeight } = window;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  _launch(c) {
    const depth = -2.5 - Math.random() * 4.5;
    const spanX = 7 + Math.random() * 2;
    const spanY = 3.5 + Math.random() * 1.5;
    const edge = Math.floor(Math.random() * 4);
    const along = (Math.random() - 0.5) * 2;
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();

    if (edge === 0) {
      from.set(-spanX, along * spanY, depth);
      to.set(spanX, -along * spanY, depth);
    } else if (edge === 1) {
      from.set(spanX, along * spanY, depth);
      to.set(-spanX, -along * spanY, depth);
    } else if (edge === 2) {
      from.set(along * spanX, spanY, depth);
      to.set(-along * spanX, -spanY, depth);
    } else {
      from.set(along * spanX, -spanY, depth);
      to.set(-along * spanX, spanY, depth);
    }

    c.start.copy(from);
    c.end.copy(to);
    c.t = 0;
    c.duration = 7 + Math.random() * 5;
    c.wobbleAxis.set(Math.random() - 0.5, Math.random() - 0.5, 0).normalize();
    c.wobbleAmp = 0.4 + Math.random() * 0.6;
    c.wobbleFreq = 1 + Math.random() * 1.5;
    c.wobblePhase = Math.random() * Math.PI * 2;
    c.flying = true;
    c.mesh.visible = true;
    c.mesh.position.copy(from);
    c.mesh.lookAt(to);
  }

  _updateCritters(delta) {
    this.sessionElapsed += delta;
    const rampT = Math.min(1, this.sessionElapsed / this.RAMP_DURATION);
    // Ease out so density ramps up quickly at first and levels off, rather
    // than a linear climb that keeps feeling like it's still "building".
    const eased = 1 - (1 - rampT) * (1 - rampT);
    this.spawnInterval = THREE.MathUtils.lerp(this.spawnIntervalStart, this.spawnIntervalMin, eased);
    this.maxConcurrent = Math.round(
      THREE.MathUtils.lerp(this.maxConcurrentStart, this.maxConcurrentCap, eased)
    );

    this.sinceLastSpawn += delta;
    if (this.sinceLastSpawn >= this.spawnInterval) {
      const flyingCount = this.critters.filter((c) => c.flying).length;
      const idle = this.critters.filter((c) => !c.flying);
      if (flyingCount < this.maxConcurrent && idle.length) {
        this._launch(idle[Math.floor(Math.random() * idle.length)]);
      }
      this.sinceLastSpawn = 0;
    }

    this.critters.forEach((c) => {
      if (!c.flying) return;
      c.t += delta / c.duration;
      if (c.t >= 1) {
        c.flying = false;
        c.mesh.visible = false;
        return;
      }

      const pos = c.start.clone().lerp(c.end, c.t);
      const wobble = Math.sin(c.t * Math.PI * c.wobbleFreq + c.wobblePhase) * c.wobbleAmp;
      pos.addScaledVector(c.wobbleAxis, wobble);
      c.mesh.position.copy(pos);
      c.mesh.rotation.z += delta * 0.5;

      // Fade in over the first ~15% of the flight and out over the last
      // ~15%, so entries/exits are soft rather than a hard pop in/out.
      const fade = Math.min(1, Math.min(c.t, 1 - c.t) * 7);
      c.mesh.traverse((child) => {
        if (child.material && child.material.userData && 'baseOpacity' in child.material.userData) {
          child.material.opacity = child.material.userData.baseOpacity * fade;
        }
      });
    });
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();
    this._tick();
  }

  stop() {
    this.isRunning = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  _tick() {
    if (!this.isRunning) return;
    this._rafId = requestAnimationFrame(() => this._tick());
    const delta = this.clock.getDelta();
    this._updateCritters(delta);
    this._updateExplosions(delta);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('click', this._onClick);
    this.critters.forEach((c) => {
      c.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    });
    this.explosions.forEach((ex) => {
      ex.points.geometry.dispose();
      ex.points.material.dispose();
    });
    this.renderer.dispose();
  }
}
