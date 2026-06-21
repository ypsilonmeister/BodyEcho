import { useRef, useEffect } from "react";
import { audioSynth } from "../../utils/audioSynth";
import { CANVAS_FONT_SANS, CANVAS_FONT_MONO } from "../../utils/canvasDraw";

type Command = "jump" | "squat" | "right" | "left" | "spinRight" | "spinLeft";

interface UseCommandGameProps {
  calibrated: boolean;
  gameMode: boolean;
  gameType: string;
}

const GAME_SECONDS = 60;
// How long "squat / right / left" must be held to count (ms).
const HOLD_MS = 700;

const COMMAND_LABELS: Record<Command, string> = {
  jump: "ジャンプ！",
  squat: "しゃがむ！",
  right: "みぎへ！",
  left: "ひだりへ！",
  spinRight: "みぎむき！",
  spinLeft: "ひだりむき！",
};

const ALL_COMMANDS: Command[] = ["jump", "squat", "right", "left", "spinRight", "spinLeft"];

export const useCommandGame = ({
  calibrated,
  gameMode,
  gameType,
}: UseCommandGameProps) => {
  const stateRef = useRef<"countdown" | "playing" | "timeup" | "idle">("idle");
  const countdownStartRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const cmdRef = useRef<Command>("jump");
  const holdSinceRef = useRef<number>(0);  // when the correct pose started (for hold cmds)
  const successFlashRef = useRef<number>(0); // timestamp of last success (for flash)
  // Baseline: still reference captured at start (nose x/y, shoulder width).
  const baseRef = useRef<{ x: number; y: number; sw: number } | null>(null);
  const stillSinceRef = useRef<number>(0);

  useEffect(() => {
    if (calibrated && gameMode && gameType === "command") {
      stateRef.current = "countdown";
      countdownStartRef.current = Date.now();
      scoreRef.current = 0;
      baseRef.current = null;
      stillSinceRef.current = 0;
      successFlashRef.current = 0;
    } else {
      stateRef.current = "idle";
    }
  }, [calibrated, gameMode, gameType]);

  const reset = () => {
    stateRef.current = "idle";
    baseRef.current = null;
  };

  const pickNextCommand = () => {
    // Avoid repeating the same command twice in a row.
    let next = ALL_COMMANDS[Math.floor(Math.random() * ALL_COMMANDS.length)];
    if (next === cmdRef.current) {
      next = ALL_COMMANDS[(ALL_COMMANDS.indexOf(next) + 1) % ALL_COMMANDS.length];
    }
    cmdRef.current = next;
    holdSinceRef.current = 0;
  };

  // Does the body currently satisfy the active command? Returns true when met.
  // For hold-commands the caller manages the dwell timer.
  const isCommandMet = (cmd: Command, joints: any, base: { x: number; y: number; sw: number }) => {
    const nose = joints.nose;
    if (!nose || nose.visibility < 0.5) return false;
    const sw = base.sw;

    switch (cmd) {
      case "jump": {
        // Whole body rises: nose well above baseline.
        return nose.y < base.y - sw * 0.5;
      }
      case "squat": {
        // Body lowers: nose well below baseline.
        return nose.y > base.y + sw * 0.5;
      }
      case "right": {
        // Mirrored canvas: moving to the child's right shifts nose +x on screen.
        return nose.x > base.x + sw * 0.6;
      }
      case "left": {
        return nose.x < base.x - sw * 0.6;
      }
      case "spinRight":
      case "spinLeft": {
        if (!joints.lShoulder || !joints.rShoulder) return false;
        const curSw = Math.hypot(
          joints.lShoulder.x - joints.rShoulder.x,
          joints.lShoulder.y - joints.rShoulder.y
        );
        // Turning narrows the shoulder line (foreshortening).
        const narrowed = curSw < sw * 0.7;
        // Direction from shoulder depth (z): when turned, one shoulder is nearer.
        const dz = (joints.lShoulder.z ?? 0) - (joints.rShoulder.z ?? 0);
        // lShoulder is landmark 11 (child's left) → appears on screen right.
        // Turning right (child's right forward) brings right shoulder closer (smaller z).
        if (cmd === "spinRight") return narrowed && dz < -0.02;
        return narrowed && dz > 0.02;
      }
    }
  };

  const updateAndDrawCommandGame = (
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

    if (state === "countdown") {
      const elapsed = now - countdownStartRef.current;
      const count = Math.ceil(3 - elapsed / 1000);
      drawCenterText(String(count > 0 ? count : "スタート！"), 0.45, 0.08, "#ffffff");
      drawCenterText("しじに あわせて からだを うごかそう！", 0.34, 0.03, colors.right);
      if (elapsed >= 3000) {
        stateRef.current = "playing";
        startTimeRef.current = Date.now();
        baseRef.current = null;
        pickNextCommand();
        audioSynth.playCalibrationSuccess();
      }
      return;
    }

    if (state === "timeup") {
      drawCenterText("タイムアップ！", 0.42, 0.06, "#ffb700");
      drawCenterText(`スコア: ${scoreRef.current}`, 0.52, 0.04, "#ffffff");
      drawCenterText("よくがんばったね！", 0.58, 0.028, "#cccccc");
      return;
    }

    if (state !== "playing") return;

    const elapsedPlay = now - startTimeRef.current;
    const timeLeft = Math.max(0, GAME_SECONDS - Math.floor(elapsedPlay / 1000));
    if (timeLeft <= 0) {
      stateRef.current = "timeup";
      audioSynth.playGoalAchieved();
      return;
    }

    const nose = joints.nose;
    const haveBody = nose && nose.visibility > 0.5 && joints.lShoulder && joints.rShoulder;

    // Capture baseline once: when the player holds still near center.
    if (!baseRef.current) {
      if (haveBody) {
        const sw = Math.hypot(
          joints.lShoulder.x - joints.rShoulder.x,
          joints.lShoulder.y - joints.rShoulder.y
        );
        // Treat "still" as low nose motion; approximate by just waiting ~1s with
        // a body present (kids settle quickly at game start).
        if (stillSinceRef.current === 0) stillSinceRef.current = now;
        if (now - stillSinceRef.current > 900) {
          baseRef.current = { x: nose.x, y: nose.y, sw };
        }
      } else {
        stillSinceRef.current = 0;
      }
      drawCenterText("まん中で じっとしてね…", 0.16, 0.03, colors.right);
      return;
    }

    const base = baseRef.current;
    const cmd = cmdRef.current;
    const isHoldCmd = cmd === "squat" || cmd === "right" || cmd === "left";

    let success = false;
    if (haveBody && isCommandMet(cmd, joints, base)) {
      if (isHoldCmd) {
        if (holdSinceRef.current === 0) holdSinceRef.current = now;
        if (now - holdSinceRef.current >= HOLD_MS) success = true;
      } else {
        success = true; // jump / spin: instant
      }
    } else {
      holdSinceRef.current = 0;
    }

    if (success) {
      scoreRef.current += 10;
      successFlashRef.current = now;
      audioSynth.playGoalAchieved();
      triggerFireworks(width / 2, height * 0.45, colors);
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = Math.random() * 5 + 2;
        particlesRef.current.push({
          x: width / 2, y: height * 0.45,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          color: `hsl(${Math.random() * 360}, 90%, 65%)`,
          alpha: 0.95, size: Math.random() * 3 + 2, life: 0.03,
        });
      }
      pickNextCommand();
    }

    // ---- Draw the command prompt big in the center ----
    const flashing = now - successFlashRef.current < 350;
    drawCenterText(COMMAND_LABELS[cmd], 0.42, 0.085, flashing ? "#00ff88" : "#ffffff");

    // Hold progress bar for hold-commands.
    if (isHoldCmd && holdSinceRef.current > 0) {
      const prog = Math.min(1, (now - holdSinceRef.current) / HOLD_MS);
      const barW = width * 0.4;
      const bx = width / 2 - barW / 2;
      const by = height * 0.55;
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(bx, by, barW, height * 0.018);
      ctx.fillStyle = "#00ff88";
      ctx.fillRect(bx, by, barW * prog, height * 0.018);
      ctx.restore();
      drawCenterText("キープ！", 0.51, 0.026, "#00ff88");
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
    updateAndDrawCommandGame,
  };
};

export default useCommandGame;
