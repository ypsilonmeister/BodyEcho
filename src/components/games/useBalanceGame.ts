import { useRef, useEffect } from "react";
import { audioSynth } from "../../utils/audioSynth";
import { CANVAS_FONT_SANS, CANVAS_FONT_MONO } from "../../utils/canvasDraw";

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

// Dash & Stop game timing.
const GAME_SECONDS = 50;
const DASH_MS = 3500; // "ダッシュ！" window
const STOP_MS = 2500; // "ストップ！" window
// A "stopped" CoM moves slower than this (× body scale, px/sec).
const STOP_SPEED = 0.7;

type Phase = "idle" | "countdown" | "dash" | "stop" | "timeup";

export const useBalanceGame = ({
  calibrated,
  gameMode,
  gameType,
}: UseBalanceGameProps) => {
  // Smoothed center of mass (canvas px). null until first valid frame.
  const comRef = useRef<{ x: number; y: number } | null>(null);
  const prevComRef = useRef<{ x: number; y: number } | null>(null);
  const velRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  const lastFrameRef = useRef<number>(0);

  // Game phase machine.
  const phaseRef = useRef<Phase>("idle");
  const phaseStartRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  // During a dash, track the peak speed reached (scored when the dash ends).
  const dashPeakRef = useRef<number>(0);
  // During a stop, where the CoM was when "stop" began (the freeze target), and
  // how long it has stayed put.
  const stopAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const stopHeldMsRef = useRef<number>(0);
  // Flash banner timestamp + text for phase-end feedback.
  const flashRef = useRef<{ at: number; text: string; good: boolean }>({ at: 0, text: "", good: true });

  useEffect(() => {
    if (calibrated && gameMode && gameType === "balance") {
      comRef.current = null;
      prevComRef.current = null;
      velRef.current = { x: 0, y: 0 };
      trailRef.current = [];
      lastFrameRef.current = Date.now();
      phaseRef.current = "countdown";
      phaseStartRef.current = Date.now();
      scoreRef.current = 0;
    } else {
      phaseRef.current = "idle";
    }
  }, [calibrated, gameMode, gameType]);

  const reset = () => {
    phaseRef.current = "idle";
    trailRef.current = [];
  };

  const updateAndDrawBalanceGame = (
    ctx: CanvasRenderingContext2D,
    joints: any,
    width: number,
    height: number,
    colors: any,
    particlesRef: React.MutableRefObject<any[]>
  ) => {
    const now = Date.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameRef.current) / 1000));
    lastFrameRef.current = now;

    const drawCenterText = (text: string, y: number, size: number, color: string) => {
      ctx.save();
      ctx.font = `bold ${height * size}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 12;
      ctx.shadowColor = colors.rightGlow;
      ctx.fillText(text, width / 2, height * y);
      ctx.restore();
    };

    const haveBody = joints.lShoulder && joints.rShoulder && joints.lHip && joints.rHip &&
      joints.lShoulder.visibility > 0.5 && joints.rShoulder.visibility > 0.5 &&
      joints.lHip.visibility > 0.5 && joints.rHip.visibility > 0.5;

    if (!haveBody) {
      drawCenterText("からだ全体を カメラにうつしてね！", 0.3, 0.034, "#ff8888");
      return;
    }

    // --- Center of mass + velocity ---
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
    if (!comRef.current) {
      comRef.current = { ...rawCom };
    } else {
      comRef.current = {
        x: comRef.current.x + (rawCom.x - comRef.current.x) * SMOOTH,
        y: comRef.current.y + (rawCom.y - comRef.current.y) * SMOOTH,
      };
    }
    const com = comRef.current;

    if (prevComRef.current) {
      const vx = (com.x - prevComRef.current.x) / dt;
      const vy = (com.y - prevComRef.current.y) / dt;
      velRef.current = {
        x: velRef.current.x + (vx - velRef.current.x) * 0.3,
        y: velRef.current.y + (vy - velRef.current.y) * 0.3,
      };
    }
    prevComRef.current = { ...com };

    const bodyScale = Math.hypot(
      joints.lShoulder.x - joints.rShoulder.x,
      joints.lShoulder.y - joints.rShoulder.y
    );
    const speed = Math.hypot(velRef.current.x, velRef.current.y);
    // Normalize speed by body scale so it's distance-independent.
    const normSpeed = speed / Math.max(1, bodyScale);

    // Sway trail.
    trailRef.current.push({ x: com.x, y: com.y });
    if (trailRef.current.length > 40) trailRef.current.shift();

    const phase = phaseRef.current;
    const phaseElapsed = now - phaseStartRef.current;

    // --- Phase machine ---
    if (phase === "countdown") {
      const count = Math.ceil(3 - phaseElapsed / 1000);
      drawCenterText(String(count > 0 ? count : "ようい！"), 0.45, 0.08, "#ffffff");
      drawCenterText("「だるまさんが…」で うごいて 「ころんだ！」で ピタッ！", 0.33, 0.026, colors.right);
      if (phaseElapsed >= 3000) {
        phaseRef.current = "dash";
        phaseStartRef.current = now;
        startTimeRef.current = now;
        dashPeakRef.current = 0;
      }
    } else if (phase === "timeup") {
      drawCenterText("タイムアップ！", 0.42, 0.06, "#ffb700");
      drawCenterText(`スコア: ${scoreRef.current}`, 0.52, 0.04, "#ffffff");
      drawCenterText("よくがんばったね！", 0.58, 0.028, "#cccccc");
      drawCoM(ctx, com, velRef.current, bodyScale, normSpeed, colors, null, particlesRef);
      return;
    } else if (phase === "dash") {
      // Track peak speed; score it when the dash ends.
      dashPeakRef.current = Math.max(dashPeakRef.current, normSpeed);
      if (phaseElapsed >= DASH_MS) {
        // Award speed points: 0..~6 normSpeed → up to ~30 pts.
        const pts = Math.round(Math.min(30, dashPeakRef.current * 6));
        scoreRef.current += pts;
        flashRef.current = { at: now, text: pts > 12 ? `はやい！ +${pts}` : `+${pts}`, good: pts > 6 };
        // Move into the stop phase, anchoring where they are now.
        phaseRef.current = "stop";
        phaseStartRef.current = now;
        stopAnchorRef.current = { ...com };
        stopHeldMsRef.current = 0;
        audioSynth.playJointClick(700);
      }
    } else if (phase === "stop") {
      // Accumulate held-still time while the CoM stays slow & near the anchor.
      const anchor = stopAnchorRef.current!;
      const nearAnchor = Math.hypot(com.x - anchor.x, com.y - anchor.y) < bodyScale * 0.6;
      if (normSpeed < STOP_SPEED && nearAnchor) {
        stopHeldMsRef.current += dt * 1000;
      } else {
        // Drifted — reset the anchor to current so they can re-settle.
        stopHeldMsRef.current = Math.max(0, stopHeldMsRef.current - dt * 1500);
        stopAnchorRef.current = { ...com };
      }
      if (phaseElapsed >= STOP_MS) {
        // Bonus for how much of the window was held still.
        const heldFrac = Math.min(1, stopHeldMsRef.current / (STOP_MS * 0.7));
        const pts = Math.round(heldFrac * 20);
        scoreRef.current += pts;
        flashRef.current = {
          at: now,
          text: pts > 12 ? `ピタッ！ +${pts}` : (pts > 0 ? `+${pts}` : "うごいちゃった"),
          good: pts > 6,
        };
        if (pts > 6) audioSynth.playGoalAchieved();
        // Next dash.
        phaseRef.current = "dash";
        phaseStartRef.current = now;
        dashPeakRef.current = 0;
      }
    }

    // End of game? (read the live phase — it may have advanced above)
    const livePhase = phaseRef.current;
    if (livePhase === "dash" || livePhase === "stop") {
      const totalElapsed = now - startTimeRef.current;
      if (totalElapsed >= GAME_SECONDS * 1000) {
        phaseRef.current = "timeup";
        phaseStartRef.current = now;
        audioSynth.playGoalAchieved();
      }
    }

    // --- Draw CoM + arrows + trail ---
    const stopAnchor = phaseRef.current === "stop" ? stopAnchorRef.current : null;
    drawCoM(ctx, com, velRef.current, bodyScale, normSpeed, colors, stopAnchor, particlesRef);

    // --- Phase banner + HUD ---
    if (phaseRef.current === "dash") {
      drawCenterText("だるまさんが…！ はやく うごこう！", 0.13, 0.038, "#ff5544");
      // Speed meter.
      drawSpeedMeter(ctx, width, height, Math.min(1, normSpeed / 6));
    } else if (phaseRef.current === "stop") {
      const remain = Math.max(0, STOP_MS - phaseElapsed);
      const stoppedNow = normSpeed < STOP_SPEED;
      drawCenterText("ころんだ！ ピタッと とまって！", 0.13, 0.04, stoppedNow ? "#00ff88" : "#ffb700");
      drawCenterText(`${(remain / 1000).toFixed(1)}`, 0.21, 0.05, stoppedNow ? "#00ff88" : "#ffffff");
    }

    // Flash banner for the last phase result.
    if (now - flashRef.current.at < 900) {
      drawCenterText(flashRef.current.text, 0.7, 0.05, flashRef.current.good ? "#00ff88" : "#ffb700");
    }

    // HUD: time + score.
    const timeLeft = phaseRef.current === "timeup"
      ? 0
      : Math.max(0, GAME_SECONDS - Math.floor((now - startTimeRef.current) / 1000));
    ctx.save();
    ctx.font = `bold ${height * 0.034}px ${CANVAS_FONT_MONO}`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.shadowBlur = 8;
    ctx.shadowColor = colors.rightGlow;
    ctx.fillText(`TIME: ${timeLeft}s`, width * 0.06, height * 0.27);
    ctx.fillText(`スコア: ${scoreRef.current}`, width * 0.06, height * 0.32);
    ctx.restore();
  };

  return {
    reset,
    updateAndDrawBalanceGame,
  };
};

// Draw the CoM dot, sway trail, velocity arrow, and (during stop) the freeze
// target ring. Pulled out so the timeup screen can keep showing the CoM.
function drawCoM(
  ctx: CanvasRenderingContext2D,
  com: { x: number; y: number },
  vel: { x: number; y: number },
  bodyScale: number,
  normSpeed: number,
  colors: any,
  stopAnchor: { x: number; y: number } | null,
  _particlesRef: React.MutableRefObject<any[]>
) {
  ctx.save();

  // Freeze target ring during stop phase.
  if (stopAnchor) {
    ctx.beginPath();
    ctx.arc(stopAnchor.x, stopAnchor.y, bodyScale * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,255,136,0.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Motion arrow along the velocity vector.
  const speed = Math.hypot(vel.x, vel.y);
  if (speed > bodyScale * 0.4) {
    const t = Math.min(1, normSpeed / 6);
    const len = bodyScale * (0.2 + t * 0.7);
    const ang = Math.atan2(vel.y, vel.x);
    const tipX = com.x + Math.cos(ang) * len;
    const tipY = com.y + Math.sin(ang) * len;
    const motColor = `hsl(${40 - t * 40}, 100%, 55%)`; // yellow→red with speed
    drawArrow(ctx, com.x, com.y, tipX, tipY, bodyScale * 0.05, motColor, 0.95);
  }

  // Current CoM dot.
  ctx.beginPath();
  ctx.arc(com.x, com.y, bodyScale * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = stopAnchor && normSpeed < 0.7 ? "#00ff88" : "#00f0ff";
  ctx.shadowBlur = 18;
  ctx.shadowColor = colors.rightGlow;
  ctx.fill();
  ctx.restore();
}

// Vertical-ish speed meter bar at the right edge.
function drawSpeedMeter(ctx: CanvasRenderingContext2D, width: number, height: number, frac: number) {
  const barW = width * 0.5;
  const x = width / 2 - barW / 2;
  const y = height * 0.2;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(x, y, barW, height * 0.016);
  ctx.fillStyle = `hsl(${40 - frac * 40}, 100%, 55%)`;
  ctx.fillRect(x, y, barW * frac, height * 0.016);
  ctx.restore();
}

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
  const bx = x2 - Math.cos(ang) * head;
  const by = y2 - Math.sin(ang) * head;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(bx - Math.sin(ang) * head * 0.5, by + Math.cos(ang) * head * 0.5);
  ctx.lineTo(bx + Math.sin(ang) * head * 0.5, by - Math.cos(ang) * head * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export default useBalanceGame;
