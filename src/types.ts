// Shared types across BodyCanvas, canvas draw helpers, and game hooks.

export interface Point2D {
  x: number;
  y: number;
  // BodyCanvas trail points carry a timestamp; kanji stroke points don't.
  time?: number;
}

// A MediaPipe pose landmark / canvas-space joint.
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

// Alias kept distinct for call-site clarity (joints are landmarks in canvas space).
export type Joint = Landmark;

// Theme color set resolved from CSS variables (see refreshThemeColors in BodyCanvas).
export interface ThemeColors {
  right: string;
  left: string;
  center: string;
  rightGlow: string;
  leftGlow: string;
  centerGlow: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  size: number;
  life: number;
}

export interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}
