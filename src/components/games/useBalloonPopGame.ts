import { useRef, useEffect } from "react";
import { audioSynth } from "../../utils/audioSynth";
import { CANVAS_FONT_SANS, CANVAS_FONT_MONO } from "../../utils/canvasDraw";

interface Balloon {
  x: number;
  y: number;
  r: number;
  hue: number;
  bornAt: number;
  popped: boolean;
}

interface UseBalloonPopGameProps {
  calibrated: boolean;
  gameMode: boolean;
  gameType: string;
}

const GAME_SECONDS = 45;
const MAX_BALLOONS = 5;

export const useBalloonPopGame = ({
  calibrated,
  gameMode,
  gameType,
}: UseBalloonPopGameProps) => {
  const stateRef = useRef<"countdown" | "playing" | "timeup" | "idle">("idle");
  const countdownStartRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const timeupAtRef = useRef<number>(0);
  const balloonsRef = useRef<Balloon[]>([]);
  const scoreRef = useRef<number>(0);
  const lastSpawnRef = useRef<number>(0);
  // Reachable play area, snapshotted at game start so balloons spawn within
  // arm's reach of where the child stands (not the whole — possibly very wide —
  // screen). { cx, halfW } in canvas pixels; null until captured.
  const playAreaRef = useRef<{ cx: number; halfW: number } | null>(null);

  // Lifecycle: enter countdown when this game becomes active, reset on exit.
  useEffect(() => {
    if (calibrated && gameMode && gameType === "balloon") {
      stateRef.current = "countdown";
      countdownStartRef.current = Date.now();
      balloonsRef.current = [];
      scoreRef.current = 0;
      lastSpawnRef.current = 0;
      playAreaRef.current = null; // capture on first frame
    } else {
      stateRef.current = "idle";
      balloonsRef.current = [];
    }
  }, [calibrated, gameMode, gameType]);

  const reset = () => {
    stateRef.current = "idle";
    balloonsRef.current = [];
    scoreRef.current = 0;
  };

  const spawnBalloon = (width: number, height: number) => {
    const r = height * (0.05 + Math.random() * 0.03);
    const area = playAreaRef.current ?? { cx: width / 2, halfW: width * 0.4 };
    // Spawn within the reachable area (centered on the child), clamped to the
    // screen, and below the top air-button zone (buttons sit up to ~height*0.32).
    const minX = Math.max(r + height * 0.02, area.cx - area.halfW);
    const maxX = Math.min(width - r - height * 0.02, area.cx + area.halfW);
    const x = minX + Math.random() * Math.max(0, maxX - minX);
    const y = height * 0.36 + Math.random() * (height * 0.5);
    balloonsRef.current.push({
      x,
      y,
      r,
      hue: Math.floor(Math.random() * 360),
      bornAt: Date.now(),
      popped: false,
    });
  };

  const updateAndDrawBalloonGame = (
    ctx: CanvasRenderingContext2D,
    joints: any,
    width: number,
    height: number,
    colors: any,
    particlesRef: React.MutableRefObject<any[]>,
    triggerFireworks: (centerX: number, centerY: number, colors: any) => void
  ) => {
    const state = stateRef.current;
    const now = Date.now();

    // Capture the reachable play area once, from the shoulders (center +
    // ~2.2× shoulder width of reach on each side). Fixed for the whole game so
    // balloons don't drift across very wide screens.
    if (!playAreaRef.current) {
      if (joints.lShoulder && joints.rShoulder) {
        const cx = (joints.lShoulder.x + joints.rShoulder.x) / 2;
        const sw = Math.hypot(
          joints.lShoulder.x - joints.rShoulder.x,
          joints.lShoulder.y - joints.rShoulder.y
        );
        playAreaRef.current = { cx, halfW: Math.max(sw * 2.2, width * 0.18) };
      } else {
        playAreaRef.current = { cx: width / 2, halfW: width * 0.4 };
      }
    }

    // Body points that can pop a balloon: hands, feet, knees, head.
    const hitPoints: Array<{ x: number; y: number }> = [];
    const candidates = [
      joints.lWrist, joints.rWrist,
      joints.lIndex, joints.rIndex,
      joints.lAnkle, joints.rAnkle,
      joints.lKnee, joints.rKnee,
      joints.nose,
    ];
    for (const p of candidates) {
      if (p && p.visibility > 0.5) hitPoints.push({ x: p.x, y: p.y });
    }

    if (state === "countdown") {
      const elapsed = now - countdownStartRef.current;
      const count = Math.ceil(3 - elapsed / 1000);

      ctx.save();
      ctx.font = `bold ${height * 0.08}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 12;
      ctx.shadowColor = colors.rightGlow;
      ctx.fillText(String(count > 0 ? count : "スタート！"), width / 2, height * 0.45);

      ctx.font = `bold ${height * 0.034}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = colors.right;
      ctx.fillText("ふうせんを 手や足でタッチして われ！", width / 2, height * 0.35);
      ctx.restore();

      if (elapsed >= 3000) {
        stateRef.current = "playing";
        startTimeRef.current = Date.now();
        lastSpawnRef.current = Date.now();
        audioSynth.playCalibrationSuccess();
      }
      return;
    }

    if (state === "timeup") {
      ctx.save();
      ctx.font = `bold ${height * 0.06}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = "#ffb700";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 15;
      ctx.shadowColor = "rgba(255, 183, 0, 0.4)";
      ctx.fillText("タイムアップ！", width / 2, height * 0.42);

      ctx.font = `bold ${height * 0.04}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`${scoreRef.current}こ われたよ！`, width / 2, height * 0.52);

      ctx.font = `500 ${height * 0.03}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = "var(--text-secondary)";
      ctx.fillText("よくがんばったね！", width / 2, height * 0.58);
      ctx.restore();
      return;
    }

    if (state !== "playing") return;

    const elapsedPlay = now - startTimeRef.current;
    const timeLeft = Math.max(0, GAME_SECONDS - Math.floor(elapsedPlay / 1000));
    if (timeLeft <= 0) {
      stateRef.current = "timeup";
      timeupAtRef.current = now;
      audioSynth.playGoalAchieved();
      return;
    }

    // Spawn balloons over time; spawn faster as the game progresses.
    const spawnInterval = Math.max(450, 1100 - (elapsedPlay / GAME_SECONDS / 1000) * 600);
    if (
      balloonsRef.current.length < MAX_BALLOONS &&
      now - lastSpawnRef.current > spawnInterval
    ) {
      spawnBalloon(width, height);
      lastSpawnRef.current = now;
    }

    // Pop detection + render.
    const live: Balloon[] = [];
    for (const b of balloonsRef.current) {
      let popped = false;
      for (const hp of hitPoints) {
        if (Math.hypot(hp.x - b.x, hp.y - b.y) <= b.r) {
          popped = true;
          break;
        }
      }

      if (popped) {
        scoreRef.current++;
        // Short, pitched pop — higher balloons pop higher for playful variety.
        audioSynth.playJointClick(500 + (1 - b.y / height) * 500);
        triggerFireworks(b.x, b.y, colors);
        // Confetti burst at the balloon.
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = Math.random() * 4 + 1.5;
          particlesRef.current.push({
            x: b.x,
            y: b.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            color: `hsl(${b.hue}, 90%, 65%)`,
            alpha: 0.95,
            size: Math.random() * 3 + 2,
            life: 0.03,
          });
        }
        continue; // drop it
      }

      // Expire balloons that linger too long, so they keep refreshing.
      if (now - b.bornAt > 6000) continue;
      live.push(b);
    }
    balloonsRef.current = live;

    // Draw balloons with a gentle bob.
    for (const b of balloonsRef.current) {
      const bob = Math.sin((now - b.bornAt) / 350) * b.r * 0.08;
      const cy = b.y + bob;
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, cy, b.r, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(
        b.x - b.r * 0.3, cy - b.r * 0.3, b.r * 0.1,
        b.x, cy, b.r
      );
      grad.addColorStop(0, `hsl(${b.hue}, 95%, 78%)`);
      grad.addColorStop(1, `hsl(${b.hue}, 85%, 52%)`);
      ctx.fillStyle = grad;
      ctx.shadowBlur = 18;
      ctx.shadowColor = `hsla(${b.hue}, 90%, 60%, 0.7)`;
      ctx.fill();

      // Highlight + little string.
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.32, cy - b.r * 0.3, b.r * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.shadowBlur = 0;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(b.x, cy + b.r);
      ctx.lineTo(b.x, cy + b.r + b.r * 0.5);
      ctx.strokeStyle = `hsla(${b.hue}, 70%, 70%, 0.6)`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // HUD: time + score.
    ctx.save();
    ctx.font = `bold ${height * 0.036}px ${CANVAS_FONT_MONO}`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.shadowBlur = 8;
    ctx.shadowColor = colors.rightGlow;
    ctx.fillText(`TIME: ${timeLeft}s`, width * 0.06, height * 0.16);
    ctx.fillText(`われた: ${scoreRef.current}こ`, width * 0.06, height * 0.21);
    ctx.restore();
  };

  return {
    reset,
    updateAndDrawBalloonGame,
  };
};

export default useBalloonPopGame;
