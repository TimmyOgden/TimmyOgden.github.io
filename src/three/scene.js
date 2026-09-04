import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Rough capability check used to scale geometry complexity down on phones /
// low-end devices so the background never becomes the bottleneck.
const isLowPower =
  window.matchMedia('(max-width: 720px)').matches ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mobile/tablet viewports get a different orb behaviour (see the dock
// logic in _tick): full-size at the top of the page, then shrunk into a
// fixed corner once scrolled, since there's no side margin to live in
// the way there is on desktop. Wider than the perf-driven isLowPower
// check above since tablets often have plenty of GPU headroom but still
// have the same narrow-column layout problem.
const isCompactViewport = window.matchMedia('(max-width: 1024px)').matches;

const PARTICLE_COUNT = isLowPower ? 900 : 3200;
const FIELD_RADIUS = 14;

/** White-to-transparent radial gradient, tinted at render time via material.color. */
function createGlowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Builds a faceted "shattered crystal" sphere: start from an icosahedron,
 * detach every triangle (toNonIndexed) so each face can be flat-shaded, then
 * extrude each face outward/inward by a random amount along its own normal
 * so the surface reads as irregular shards rather than a smooth geodesic.
 */
function createFracturedGeometry(radius, detail) {
  let geometry = new THREE.IcosahedronGeometry(radius, detail);
  geometry = geometry.toNonIndexed();

  const pos = geometry.attributes.position;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const center = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    center.copy(a).add(b).add(c).divideScalar(3);
    normal.copy(center).normalize();

    const extrude = (Math.random() - 0.35) * radius * 0.22;
    a.addScaledVector(normal, extrude);
    b.addScaledVector(normal, extrude);
    c.addScaledVector(normal, extrude);

    pos.setXYZ(i, a.x, a.y, a.z);
    pos.setXYZ(i + 1, b.x, b.y, b.z);
    pos.setXYZ(i + 2, c.x, c.y, c.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Abstract, cyberpunk-tinted WebGL background: a two-tone particle field
 * plus a constantly-pulsing "shattered crystal" orb — a faceted, extruded
 * icosahedron with glowing seams between its shards and a real bloom pass
 * for the halo (skipped on low-power devices in favour of a cheap additive
 * sprite). `setProgress` (0..1 across the whole page) drives camera drift
 * and an accent colour lerp so each section of the CV reads as a distinct
 * "beat" without changing the underlying scene.
 */
export class BackgroundScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.progress = 0;
    this.targetProgress = 0;
    this.isRunning = false;
    this.elapsed = 0;

    this.clock = new THREE.Clock();

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x07030f, 0.045);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 9);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isLowPower ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.colorA = new THREE.Color(0xff2ec4); // neon magenta
    this.colorB = new THREE.Color(0x17f3ff); // neon cyan
    this.currentColor = this.colorA.clone();

    this._buildParticleField();
    this._buildOrb();
    this._buildLights();
    if (!isLowPower) this._buildBloom();
    this._bindEvents();
  }

  _buildParticleField() {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const tmpColor = new THREE.Color();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const r = FIELD_RADIUS * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      tmpColor.copy(this.colorA).lerp(this.colorB, Math.random());
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: isLowPower ? 0.04 : 0.032,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  _buildOrb() {
    this.orbGroup = new THREE.Group();
    this.orbGroup.position.set(0, 0, -2);

    // Faceted shard mesh — the crystal core itself, lit by the point lights
    // set up in _buildLights so each shard face catches highlights.
    const shardGeometry = createFracturedGeometry(1.3, isLowPower ? 1 : 2);
    const shardMaterial = new THREE.MeshStandardMaterial({
      color: 0x140a24,
      flatShading: true,
      metalness: 0.65,
      roughness: 0.3,
      emissive: this.colorA,
      emissiveIntensity: 0.18,
    });
    this.orbMesh = new THREE.Mesh(shardGeometry, shardMaterial);
    this.orbGroup.add(this.orbMesh);

    // Glowing neon seams between shards, echoing the reference's cracked-glass look.
    const edgesGeometry = new THREE.EdgesGeometry(shardGeometry, 1);
    const edgesMaterial = new THREE.LineBasicMaterial({
      color: this.colorA,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    this.orbEdges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    this.orbGroup.add(this.orbEdges);

    // Cheap additive halo behind the mesh — the only glow on low-power
    // devices (no bloom pass there), and a soft base halo everywhere else.
    this.glowOuterBaseOpacity = isLowPower ? 0.55 : 0.3;
    this.glowOuter = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createGlowTexture(),
        color: this.colorB,
        transparent: true,
        opacity: this.glowOuterBaseOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.glowOuter.scale.set(8, 8, 1);
    this.orbGroup.add(this.glowOuter);

    this.scene.add(this.orbGroup);
  }

  _buildLights() {
    this.ambientLight = new THREE.AmbientLight(0x2a1740, 0.6);
    this.scene.add(this.ambientLight);

    this.lightA = new THREE.PointLight(this.colorA, 3, 14);
    this.lightA.position.set(2.5, 1.5, 3);
    this.scene.add(this.lightA);

    this.lightB = new THREE.PointLight(this.colorB, 2.5, 14);
    this.lightB.position.set(-2.5, -1.5, -1);
    this.scene.add(this.lightB);
  }

  _buildBloom() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomBaseStrength = 1.15;
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.bloomBaseStrength,
      0.7, // radius
      0.15 // threshold
    );
    this.composer.addPass(this.bloomPass);
  }

  _bindEvents() {
    this._onResize = this._onResize.bind(this);
    this._onVisibilityChange = this._onVisibilityChange.bind(this);
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  _onResize() {
    const { innerWidth, innerHeight } = window;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    if (this.composer) this.composer.setSize(innerWidth, innerHeight);
  }

  _onVisibilityChange() {
    if (document.hidden) {
      this.stop();
    } else {
      this.start();
    }
  }

  /** progress: 0..1 scroll fraction across the entire document. */
  setProgress(progress) {
    this.targetProgress = progress;
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
    this.elapsed += delta;

    // Ease the visible progress toward the scroll-driven target.
    this.progress += (this.targetProgress - this.progress) * 0.06;

    let pulse = 1;

    if (!prefersReducedMotion) {
      this.particles.rotation.y += delta * 0.02;
      this.particles.rotation.x += delta * 0.005;
      this.orbGroup.rotation.y += delta * 0.09;
      this.orbGroup.rotation.x += delta * 0.03;

      // A constant, organic glow pulse — the orb never sits still.
      pulse = 1 + Math.sin(this.elapsed * 1.4) * 0.08;
      const glowPulse = 1 + Math.sin(this.elapsed * 1.9 + Math.PI / 3) * 0.16;
      this.glowOuter.scale.set(8 * glowPulse, 8 * glowPulse, 1);
      this.orbMesh.material.emissiveIntensity = 0.16 + Math.sin(this.elapsed * 2.1) * 0.08;
      this.lightA.intensity = 3 + Math.sin(this.elapsed * 1.7) * 0.8;
      this.lightB.intensity = 2.5 + Math.sin(this.elapsed * 2.3 + Math.PI / 2) * 0.7;
    }

    // Camera drifts subtly with scroll, and the accent colour lerps between
    // the two theme colours so each CV section reads as its own "beat".
    this.camera.position.z = 9 - this.progress * 2.5;
    this.camera.position.y = -this.progress * 1.2;

    // Smoothstep the transition over the first few % of scroll so it reads
    // as one continuous move away from the hero rather than a snap.
    const shiftT = Math.min(1, this.progress / 0.05);
    const shiftEased = shiftT * shiftT * (3 - 2 * shiftT);

    // Target a fixed *fraction* of the visible width/height at the orb's
    // depth (rather than a fixed world-unit offset), so the same relative
    // screen position holds at any viewport size/aspect ratio.
    const depth = this.camera.position.z - this.orbGroup.position.z;
    const halfHeightAtDepth = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * depth;
    const halfWidthAtDepth = halfHeightAtDepth * this.camera.aspect;

    if (isCompactViewport) {
      // Mobile/tablet: content runs near edge-to-edge, so there's no side
      // margin to live in. Instead shrink the orb and dock it into the
      // top-right corner (a permanent CSS gutter there — see .panel in
      // style.css — keeps every card from rendering over it) once
      // scrolled, then restore it to full size when scrolling back up.
      this.orbGroup.position.x = shiftEased * halfWidthAtDepth * 0.7;
      this.orbGroup.position.y = shiftEased * halfHeightAtDepth * 0.62;

      // Bloom's blur kernel is a fixed screen-space radius, so at a small
      // enough scale it swamps the faceted mesh into a shapeless blob
      // instead of shrinking cleanly with it. Keep the dock size modest
      // (not tiny) and taper bloom strength + the soft halo sprite's
      // opacity as it shrinks, so the crisp edge lines stay the dominant
      // read rather than getting melted into glow.
      const dockScale = THREE.MathUtils.lerp(1, 0.58, shiftEased);
      this.orbGroup.scale.setScalar(dockScale * pulse);
      if (this.bloomPass) {
        this.bloomPass.strength = this.bloomBaseStrength * (1 - shiftEased * 0.75);
      }
      this.glowOuter.material.opacity = this.glowOuterBaseOpacity * (1 - shiftEased * 0.6);
    } else {
      // Desktop: content panels are left-aligned, so past the hero the orb
      // sits off in the open right-hand margin instead of behind the
      // text/card panels, with a gentle vertical bob (rather than a
      // monotonic drift) so it stays roughly centred for every section.
      this.orbGroup.position.x = shiftEased * halfWidthAtDepth * 0.62;
      this.orbGroup.position.y = Math.sin(this.progress * Math.PI * 6) * 0.6;
      this.orbGroup.scale.setScalar(pulse);
    }

    // 0 at progress=0 (pure colorA) so the orb starts crisply on-brand rather
    // than at a muddy 50/50 blend, then cycles through both accents.
    const lerpT = (1 - Math.cos(this.progress * Math.PI * 2)) / 2;
    this.currentColor.copy(this.colorA).lerp(this.colorB, lerpT);
    this.orbMesh.material.emissive.copy(this.currentColor);
    this.orbEdges.material.color.copy(this.currentColor);

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this.particles.geometry.dispose();
    this.particles.material.dispose();
    this.orbMesh.geometry.dispose();
    this.orbMesh.material.dispose();
    this.orbEdges.geometry.dispose();
    this.orbEdges.material.dispose();
    this.glowOuter.material.map.dispose();
    this.glowOuter.material.dispose();
    if (this.composer) this.composer.dispose();
    this.renderer.dispose();
  }
}
