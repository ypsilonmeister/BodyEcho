import { useRef, useEffect } from "react";
import { audioSynth } from "../../utils/audioSynth";
import { CANVAS_FONT_SANS, CANVAS_FONT_MONO } from "../../utils/canvasDraw";

type ItemKind = "heart" | "spike";

interface FallingItem {
  x: number;
  y: number;
  r: number;
  vy: number; // fall speed (px/sec)
  kind: ItemKind;
  spin: number;
  hit: boolean;
}

interface UseCatchDodgeGameProps {
  calibrated: boolean;
  gameMode: boolean;
  gameType: string;
}

const GAME_SECONDS = 45;
const MAX_ITEMS = 6;

export const useCatchDodgeGame = ({
  calibrated,
  gameMode,
  gameType,
}: UseCatchDodgeGameProps) => {
  const stateRef = useRef<"countdown" | "playing" | "timeup" | "idle">("idle");
  const countdownStartRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const itemsRef = useRef<FallingItem[]>([]);
  const scoreRef = useRef<number>(0);
  const lastSpawnRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  // Reachable play area, snapshotted at game start (so items fall within arm's
  // reach of where the child stands, not across a very wide screen).
  const playAreaRef = useRef<{ cx: number; halfW: number } | null>(null);

  useEffect(() => {
    if (calibrated && gameMode && gameType === "catch") {
      stateRef.current = "countdown";
      countdownStartRef.current = Date.now();
      itemsRef.current = [];
      scoreRef.current = 0;
      lastSpawnRef.current = 0;
      playAreaRef.current = null; // capture on first frame
    } else {
      stateRef.current = "idle";
      itemsRef.current = [];
    }
  }, [calibrated, gameMode, gameType]);

  const reset = () => {
    stateRef.current = "idle";
    itemsRef.current = [];
    scoreRef.current = 0;
  };

  const spawnItem = (width: number, height: number, elapsedPlay: number) => {
    const r = height * (0.045 + Math.random() * 0.02);
    const area = playAreaRef.current ?? { cx: width / 2, halfW: width * 0.4 };
    const minX = Math.max(r, area.cx - area.halfW);
    const maxX = Math.min(width - r, area.cx + area.halfW);
    const x = minX + Math.random() * Math.max(0, maxX - minX);
    // Speed ramps up over the game; hearts a touch slower than spikes.
    const ramp = Math.min(1, elapsedPlay / (GAME_SECONDS * 1000));
    const base = height * (0.22 + ramp * 0.28);
    // ~35% spikes so hearts stay the majority (catching should feel rewarding).
    const kind: ItemKind = Math.random() < 0.35 ? "spike" : "heart";
    itemsRef.current.push({
      x,
      y: -r,
      r,
      vy: base * (kind === "spike" ? 1.15 : 1.0),
      kind,
      spin: Math.random() * Math.PI,
      hit: false,
    });
  };

  const drawHeart = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    const s = r / 16;
    ctx.moveTo(0, 6 * s);
    ctx.bezierCurveTo(-2 * s, -4 * s, -16 * s, -4 * s, -16 * s, -8 * s);
    ctx.bezierCurveTo(-16 * s, -16 * s, -4 * s, -16 * s, 0, -8 * s);
    ctx.bezierCurveTo(4 * s, -16 * s, 16 * s, -16 * s, 16 * s, -8 * s);
    ctx.bezierCurveTo(16 * s, -4 * s, 2 * s, -4 * s, 0, 6 * s);
    ctx.closePath();
    ctx.fillStyle = "#ff4d8d";
    ctx.shadowBlur = 18;
    ctx.shadowColor = "rgba(255, 77, 141, 0.8)";
    ctx.fill();
    // little highlight
    ctx.beginPath();
    ctx.arc(-5 * s, -8 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.shadowBlur = 0;
    ctx.fill();
    ctx.restore();
  };

  const drawSpike = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    const spikes = 8;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const ang = (Math.PI * i) / spikes;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "#9b59ff";
    ctx.shadowBlur = 16;
    ctx.shadowColor = "rgba(155, 89, 255, 0.8)";
    ctx.fill();
    // dark core
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20,0,40,0.6)";
    ctx.shadowBlur = 0;
    ctx.fill();
    ctx.restore();
  };

  const updateAndDrawCatchGame = (
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

    // Capture reachable play area once from the shoulders.
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

    // Hearts (catch) can be touched with the whole body — hands, head, feet,
    // knees — so they're easy and rewarding to grab.
    const catchPoints: Array<{ x: number; y: number }> = [];
    const catchCandidates = [
      joints.lWrist, joints.rWrist,
      joints.lIndex, joints.rIndex,
      joints.nose,
      joints.lAnkle, joints.rAnkle,
      joints.lKnee, joints.rKnee,
    ];
    for (const p of catchCandidates) {
      if (p && p.visibility > 0.5) catchPoints.push({ x: p.x, y: p.y });
    }

    // Spikes (dodge) only hit the head (nose). Dodging the whole body is too
    // hard/unfair for kids — just keep your head out of the way.
    const dodgePoints: Array<{ x: number; y: number }> = [];
    if (joints.nose && joints.nose.visibility > 0.5) {
      dodgePoints.push({ x: joints.nose.x, y: joints.nose.y });
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

      ctx.font = `bold ${height * 0.032}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = colors.right;
      ctx.fillText("ハート💖はキャッチ！ トゲ⚡はよけてね！", width / 2, height * 0.34);
      ctx.restore();

      if (elapsed >= 3000) {
        stateRef.current = "playing";
        startTimeRef.current = Date.now();
        lastSpawnRef.current = Date.now();
        lastFrameRef.current = Date.now();
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
      ctx.fillText(`スコア: ${scoreRef.current}`, width / 2, height * 0.52);

      ctx.font = `500 ${height * 0.03}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = "var(--text-secondary)";
      ctx.fillText("よくがんばったね！", width / 2, height * 0.58);
      ctx.restore();
      return;
    }

    if (state !== "playing") return;

    const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000); // clamp to avoid jumps
    lastFrameRef.current = now;

    const elapsedPlay = now - startTimeRef.current;
    const timeLeft = Math.max(0, GAME_SECONDS - Math.floor(elapsedPlay / 1000));
    if (timeLeft <= 0) {
      stateRef.current = "timeup";
      audioSynth.playGoalAchieved();
      return;
    }

    // Spawn over time, faster as the game progresses.
    const spawnInterval = Math.max(420, 950 - (elapsedPlay / GAME_SECONDS) * 0.5);
    if (itemsRef.current.length < MAX_ITEMS && now - lastSpawnRef.current > spawnInterval) {
      spawnItem(width, height, elapsedPlay);
      lastSpawnRef.current = now;
    }

    // Move, hit-test, render.
    const live: FallingItem[] = [];
    for (const it of itemsRef.current) {
      it.y += it.vy * dt;
      it.spin += dt * 2;

      // Hearts test against the whole body; spikes only against the head.
      const testPoints = it.kind === "heart" ? catchPoints : dodgePoints;
      let touched = false;
      for (const hp of testPoints) {
        if (Math.hypot(hp.x - it.x, hp.y - it.y) <= it.r + height * 0.01) {
          touched = true;
          break;
        }
      }

      if (touched && !it.hit) {
        it.hit = true;
        if (it.kind === "heart") {
          scoreRef.current += 1;
          audioSynth.playJointClick(620 + Math.random() * 200);
          triggerFireworks(it.x, it.y, colors);
          for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = Math.random() * 4 + 1.5;
            particlesRef.current.push({
              x: it.x, y: it.y,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              color: "#ff4d8d", alpha: 0.95,
              size: Math.random() * 3 + 2, life: 0.03,
            });
          }
        } else {
          // Spike: lose a point, shaky purple burst, buzzer.
          scoreRef.current -= 1;
          audioSynth.playTraceError();
          for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = Math.random() * 3 + 1;
            particlesRef.current.push({
              x: it.x, y: it.y,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              color: "#9b59ff", alpha: 0.9,
              size: Math.random() * 3 + 1.5, life: 0.04,
            });
          }
        }
        continue; // remove touched item
      }

      // Drop off the bottom.
      if (it.y - it.r > height) continue;
      live.push(it);
    }
    itemsRef.current = live;

    for (const it of itemsRef.current) {
      if (it.kind === "heart") drawHeart(ctx, it.x, it.y, it.r);
      else drawSpike(ctx, it.x, it.y, it.r, it.spin);
    }

    // HUD: time + score.
    ctx.save();
    ctx.font = `bold ${height * 0.036}px ${CANVAS_FONT_MONO}`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.shadowBlur = 8;
    ctx.shadowColor = colors.rightGlow;
    ctx.fillText(`TIME: ${timeLeft}s`, width * 0.06, height * 0.16);
    ctx.fillText(`スコア: ${scoreRef.current}`, width * 0.06, height * 0.21);
    ctx.restore();
  };

  return {
    reset,
    updateAndDrawCatchGame,
  };
};

export default useCatchDodgeGame;
