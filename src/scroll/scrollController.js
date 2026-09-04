import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const isLowPower =
  window.matchMedia('(max-width: 720px)').matches ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Wires up scroll-driven behaviour:
 *  - per-section pin + content reveal (skipped on low-power/mobile so
 *    native scroll stays smooth and there's no extra scroll distance cost)
 *  - a single document-wide progress value fed to the Three.js background
 *  - nav active-link + top progress bar
 *
 * `scene` is the BackgroundScene instance (or null if WebGL is unavailable).
 */
export function initScrollAnimations(scene) {
  const panels = gsap.utils.toArray('.panel');
  const progressFill = document.getElementById('scroll-progress-fill');
  const navLinks = gsap.utils.toArray('.site-nav__links a');
  const orbDock = document.getElementById('orb-dock');

  if (orbDock) {
    orbDock.addEventListener('click', () => {
      const hero = document.getElementById('hero');
      if (hero) hero.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  }

  panels.forEach((panel) => {
    const inner = panel.querySelector('.panel__inner');
    if (!inner || panel.classList.contains('panel--hero')) return;

    if (prefersReducedMotion) {
      gsap.set(inner, { opacity: 1, y: 0 });
      return;
    }

    if (!isLowPower) {
      // Pin the section briefly while its content settles in, echoing the
      // "pinned storytelling" feel of the reference site.
      ScrollTrigger.create({
        trigger: panel,
        start: 'top top',
        end: '+=45%',
        pin: true,
        pinSpacing: true,
      });
    }

    gsap.fromTo(
      inner,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: panel,
          start: 'top 75%',
          end: 'top 35%',
          scrub: true,
        },
      }
    );
  });

  // Document-wide scroll progress drives the background scene and the
  // fixed progress bar in the nav.
  ScrollTrigger.create({
    trigger: document.body,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      if (scene) scene.setProgress(self.progress);
      if (progressFill) progressFill.style.width = `${self.progress * 100}%`;
      // Matches the orb's own shrink/dock threshold in scene.js so the
      // fixed corner button appears exactly as the 3D orb finishes
      // shrinking into place (CSS media query keeps this a no-op on desktop).
      if (orbDock) orbDock.classList.toggle('is-visible', self.progress > 0.05);
    },
  });

  // Active nav link tracking.
  const sections = gsap.utils.toArray('.panel[id]');
  sections.forEach((section) => {
    ScrollTrigger.create({
      trigger: section,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (!self.isActive) return;
        const id = section.getAttribute('id');
        navLinks.forEach((link) => {
          link.classList.toggle('is-active', link.dataset.nav === id);
        });
      },
    });
  });
}
