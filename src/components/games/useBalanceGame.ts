import { useRef, useEffect } from "react";
import { CANVAS_FONT_SANS } from "../../utils/canvasDraw";

interface UseBalanceGameProps {
  calibrated: boolean;
  gameMode: boolean;
  gameType: string;
}

// Weighting of the upper (shoulder) vs lower (hip) torso midpoint when
// approximating the center of mass. Hips dominate but shoulders pull the CoM
// toward a leaning upper body. (Not a true mass-integrated CoM — good enough
// for a child-facing visualization.)
const SHOULDER_W = 0.4;
const HIP_W = 0.6;

// CoM position smoothing (per frame lerp) — higher = snappier, lower = calmer.
const SMOOTH = 0.35;

export const useBalanceGame = ({
  calibrated,
  gameMode,
  gameType,
}: UseBalanceGameProps) => {
  // Smoothed center of mass (canvas px). null until first valid frame.
  const comRef = useRef<{ x: number; y: number } | null>(null);
  // Previous CoM for velocity. null until established.
  const prevComRef = useRef<{ x: number; y: number } | null>(null);
  // Smoothed velocity vector (px/sec).
  const velRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Baseline (still) reference point and how we got it.
  const baselineRef = useRef<{ x: number; y: number } | null>(null);
  // Sway trail (recent CoM positions) for a fading wake.
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  // Auto-baseline: accumulate "is the CoM holding still?" time.
  const stillSinceRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  useEffect(() => {
    if (calibrated && gameMode && gameType === "balance") {
      comRef.current = null;
      prevComRef.current = null;
      velRef.current = { x: 0, y: 0 };
      baselineRef.current = null;
      trailRef.current = [];
      stillSinceRef.current = 0;
      lastFrameRef.current = Date.now();
    }
  }, [calibrated, gameMode, gameType]);

  const reset = () => {
    baselineRef.current = null;
    trailRef.current = [];
  };

  // Allow the baseline to be re-captured at the current CoM (e.g. a button or
  // an external trigger). Exposed for future wiring; safe no-op if no CoM yet.
  const recenter = () => {
    if (comRef.current) {
      baselineRef.current = { ...comRef.current };
    }
  };

  const updateAndDrawBalanceGame = (
    ctx: CanvasRenderingContext2D,
    joints: any,
    width: number,
    height: number,
    colors: any,
    _particlesRef: React.MutableRefObject<any[]>
  ) => {
    const now = Date.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameRef.current) / 1000));
    lastFrameRef.current = now;

    const haveShoulders = joints.lShoulder && joints.rShoulder &&
      joints.lShoulder.visibility > 0.5 && joints.rShoulder.visibility > 0.5;
    const haveHips = joints.lHip && joints.rHip &&
      joints.lHip.visibility > 0.5 && joints.rHip.visibility > 0.5;

    if (!haveShoulders || !haveHips) {
      ctx.save();
      ctx.font = `bold ${height * 0.034}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = "#ff8888";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("からだ全体を カメラにうつしてね！", width / 2, height * 0.3);
      ctx.restore();
      return;
    }

    // Center of mass = weighted blend of shoulder-mid and hip-mid.
    const shoulderMid = {
      x: (joints.lShoulder.x + joints.rShoulder.x) / 2,
      y: (joints.lShoulder.y + joints.rShoulder.y) / 2,
    };
    const hipMid = {
      x: (joints.lHip.x + joints.rHip.x) / 2,
      y: (joints.lHip.y + joints.rHip.y) / 2,
    };
    const rawCom = {
      x: shoulderMid.x * SHOULDER_W + hipMid.x * HIP_W,
      y: shoulderMid.y * SHOULDER_W + hipMid.y * HIP_W,
    };

    // Smooth the CoM.
    if (!comRef.current) {
      comRef.current = { ...rawCom };
    } else {
      comRef.current = {
        x: comRef.current.x + (rawCom.x - comRef.current.x) * SMOOTH,
        y: comRef.current.y + (rawCom.y - comRef.current.y) * SMOOTH,
      };
    }
    const com = comRef.current;

    // Velocity (px/sec), smoothed.
    if (prevComRef.current) {
      const vx = (com.x - prevComRef.current.x) / dt;
      const vy = (com.y - prevComRef.current.y) / dt;
      velRef.current = {
        x: velRef.current.x + (vx - velRef.current.x) * 0.3,
        y: velRef.current.y + (vy - velRef.current.y) * 0.3,
      };
    }
    prevComRef.current = { ...com };

    // Use shoulder width as a body-scale reference for thresholds/lengths.
    const bodyScale = Math.hypot(
      joints.lShoulder.x - joints.rShoulder.x,
      joints.lShoulder.y - joints.rShoulder.y
    );
    const speed = Math.hypot(velRef.current.x, velRef.current.y);

    // Auto-capture baseline: when the CoM has been nearly still for ~1.2s.
    if (!baselineRef.current) {
      if (speed < bodyScale * 0.6) {
        if (stillSinceRef.current === 0) stillSinceRef.current = now;
        if (now - stillSinceRef.current > 1200) {
          baselineRef.current = { ...com };
        }
      } else {
        stillSinceRef.current = 0;
      }
    }

    // Sway trail.
    trailRef.current.push({ x: com.x, y: com.y });
    if (trailRef.current.length > 40) trailRef.current.shift();

    // ---- Draw ----
    ctx.save();

    // Sway trail (fading wake).
    for (let i = 0; i < trailRef.current.length; i++) {
      const p = trailRef.current[i];
      const a = (i / trailRef.current.length) * 0.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, bodyScale * 0.04, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 240, 255, ${a})`;
      ctx.fill();
    }

    const baseline = baselineRef.current;

    // Baseline marker (◎) + deviation arrow (baseline -> current).
    if (baseline) {
      ctx.beginPath();
      ctx.arc(baseline.x, baseline.y, bodyScale * 0.16, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(baseline.x, baseline.y, bodyScale * 0.04, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fill();

      const dx = com.x - baseline.x;
      const dy = com.y - baseline.y;
      const dev = Math.hypot(dx, dy);
      // Deviation arrow: longer/redder the further from baseline.
      if (dev > bodyScale * 0.05) {
        const devNorm = Math.min(1, dev / (bodyScale * 1.2));
        const devColor = `hsl(${(1 - devNorm) * 130}, 100%, 55%)`; // green→red
        drawArrow(ctx, baseline.x, baseline.y, com.x, com.y, bodyScale * 0.05, devColor, 0.85);
      }
    }

    // Motion arrow: current CoM along the velocity vector (where it's heading).
    if (speed > bodyScale * 0.4) {
      // Scale the velocity into a visible arrow length (capped).
      const t = Math.min(1, speed / (bodyScale * 6));
      const len = bodyScale * (0.2 + t * 0.6);
      const ang = Math.atan2(velRef.current.y, velRef.current.x);
      const tipX = com.x + Math.cos(ang) * len;
      const tipY = com.y + Math.sin(ang) * len;
      const motColor = `hsl(${40 - t * 40}, 100%, 55%)`; // yellow→red with speed
      drawArrow(ctx, com.x, com.y, tipX, tipY, bodyScale * 0.045, motColor, 0.95);
    }

    // Current CoM dot.
    ctx.beginPath();
    ctx.arc(com.x, com.y, bodyScale * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = "#00f0ff";
    ctx.shadowBlur = 18;
    ctx.shadowColor = colors.rightGlow;
    ctx.fill();
    ctx.restore();

    // HUD / coaching text.
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (!baseline) {
      ctx.font = `bold ${height * 0.03}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = colors.right;
      ctx.fillText("じっとして 中心をきめよう…", width / 2, height * 0.16);
    } else {
      const dev = Math.hypot(com.x - baseline.x, com.y - baseline.y);
      const stable = dev < bodyScale * 0.25;
      ctx.font = `bold ${height * 0.032}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = stable ? "#00ff88" : "#ffb700";
      ctx.fillText(stable ? "バランス いいね！" : "ふらふら…まん中にもどそう", width / 2, height * 0.16);
    }
    ctx.restore();
  };

  return {
    reset,
    recenter,
    updateAndDrawBalanceGame,
  };
};

// Simple filled arrow from (x1,y1) to (x2,y2).
function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  width: number, color: string, alpha: number
) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const head = width * 3;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = width;
  ctx.shadowBlur = 10;
  ctx.shadowColor = color;
  // Shaft (stop short so the head sits at the tip).
  const bx = x2 - Math.cos(ang) * head;
  const by = y2 - Math.sin(ang) * head;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(bx, by);
  ctx.stroke();
  // Head.
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(bx - Math.sin(ang) * head * 0.5, by + Math.cos(ang) * head * 0.5);
  ctx.lineTo(bx + Math.sin(ang) * head * 0.5, by - Math.cos(ang) * head * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export default useBalanceGame;
