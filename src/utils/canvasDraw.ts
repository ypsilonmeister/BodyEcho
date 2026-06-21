// Pure canvas drawing helpers extracted from BodyCanvas.
// These take a 2D context plus plain arguments and hold no component state.

import type { Particle, Ripple } from "../types";

// Canvas's ctx.font does NOT resolve CSS variables (var(--font-sans)); an
// unparseable font string silently falls back to ~10px sans-serif. Always use
// these literal stacks for canvas text.
export const CANVAS_FONT_SANS = "Outfit, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif";
export const CANVAS_FONT_MONO = "'JetBrains Mono', 'Courier New', monospace";

// Vector angle calculation helper (used by skeleton drawing and game hooks)
export const calculateAngle = (
  a: { x: number; y: number } | null,
  b: { x: number; y: number } | null,
  c: { x: number; y: number } | null
): number => {
  if (!a || !b || !c) return 0;

  // Vectors from joint vertex b
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };

  const dotProduct = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y);
  const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y);

  if (magBA === 0 || magBC === 0) return 0;

  const cosTheta = dotProduct / (magBA * magBC);
  const clampedCos = Math.max(-1.0, Math.min(1.0, cosTheta));
  return Math.acos(clampedCos) * (180.0 / Math.PI);
};

// Draw a single skeleton bone segment
export const drawBone = (
  ctx: CanvasRenderingContext2D,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  color: string,
  glowColor: string,
  width: number
) => {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.shadowColor = glowColor;
  ctx.stroke();
  ctx.restore();
};

// Draw a single joint node (glowing dot with white core)
export const drawJoint = (
  ctx: CanvasRenderingContext2D,
  pt: { x: number; y: number },
  color: string,
  glowColor: string,
  radius: number
) => {
  ctx.save();
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, radius, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.shadowBlur = 15;
  ctx.shadowColor = glowColor;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(pt.x, pt.y, radius * 0.4, 0, 2 * Math.PI);
  ctx.fillStyle = "#ffffff";
  ctx.shadowBlur = 0;
  ctx.fill();
  ctx.restore();
};

// Update particle positions/fade and render them. Mutates `particles` in place.
export const updateAndDrawParticles = (
  ctx: CanvasRenderingContext2D,
  particles: Particle[]
) => {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= p.life;

    if (p.alpha <= 0) {
      particles.splice(i, 1);
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;
      ctx.fill();
      ctx.restore();
    }
  }
};

// Update expanding ripples and render them. Mutates `ripples` in place.
export const updateAndDrawRipples = (
  ctx: CanvasRenderingContext2D,
  ripples: Ripple[],
  height: number
) => {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.radius += height * 0.006; // expansion rate
    r.alpha -= 0.025; // fade rate

    if (r.alpha <= 0) {
      ripples.splice(i, 1);
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, 2 * Math.PI);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.alpha;
      ctx.lineWidth = height * 0.003;
      ctx.shadowBlur = 15;
      ctx.shadowColor = r.color;
      ctx.stroke();
      ctx.restore();
    }
  }
};
