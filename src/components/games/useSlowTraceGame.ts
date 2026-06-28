import { useRef, useEffect } from "react";
import { audioSynth } from "../../utils/audioSynth";
import { CANVAS_FONT_SANS, CANVAS_FONT_MONO } from "../../utils/canvasDraw";

// The fixed course anchor, snapshotted once at countdown so the path does NOT
// follow the body during play (イライラ棒 = trace a still course with a moving
// hand). xMid/yMid = shoulder midpoint, wShoulder = shoulder width at snapshot.
export interface TraceAnchor {
  xMid: number;
  yMid: number;
  wShoulder: number;
}

// Helper: Calculate parametric path point for Slow Trace mode from a FIXED
// anchor (not live joints), so the course stays put while the child moves.
export const getTracePathPoint = (
  s: number,
  pathType: "horizontal" | "vertical" | "sine" | "circle",
  anchor: TraceAnchor
) => {
  const { xMid, yMid, wShoulder } = anchor;
  const scale = wShoulder * 1.35; // Safe reachable radius

  switch (pathType) {
    case "horizontal":
      return {
        x: xMid + scale * (2 * s - 1),
        y: yMid + wShoulder * 0.15
      };
    case "vertical":
      return {
        x: xMid,
        y: yMid + scale * (2 * s - 1)
      };
    case "sine":
      return {
        x: xMid + scale * (2 * s - 1),
        y: yMid + wShoulder * 0.15 + (wShoulder * 0.45) * Math.sin(2 * Math.PI * s)
      };
    case "circle": {
      const angle = Math.PI + Math.PI * s;
      return {
        x: xMid + scale * Math.cos(angle),
        y: yMid + wShoulder * 0.35 + scale * Math.sin(angle)
      };
    }
  }
};

// Round length in seconds (matches the other timed games).
const TRACE_SECONDS = 45;

interface UseSlowTraceGameProps {
  calibrated: boolean;
  gameMode: boolean;
  gameType: "pose" | "trace" | "kanji" | "balloon" | "catch" | "balance" | "command";
  traceHand: "left" | "right";
  tracePathType: "horizontal" | "vertical" | "sine" | "circle";
  setTracePathType: (val: "horizontal" | "vertical" | "sine" | "circle") => void;
  traceSpeed: "slow" | "medium" | "fast";
  setGameMode: (val: boolean) => void;
}

// Order the course shape cycles through after each completed round.
const TRACE_PATH_CYCLE = ["horizontal", "vertical", "sine", "circle"] as const;

export const useSlowTraceGame = ({
  calibrated,
  gameMode,
  gameType,
  traceHand,
  tracePathType,
  setTracePathType,
  traceSpeed,
  setGameMode
}: UseSlowTraceGameProps) => {
  const traceStateRef = useRef<"idle" | "countdown" | "playing" | "timeup" | "interval">("idle");
  const traceCountdownStartRef = useRef<number>(0);
  const traceStartTimeRef = useRef<number>(0);
  const traceProgressRef = useRef<number>(0);
  const traceDirectionRef = useRef<number>(1);
  const traceTimeLeftRef = useRef<number>(TRACE_SECONDS);
  const traceScoreRef = useRef<number>(0);
  const traceTotalFramesRef = useRef<number>(0);
  const traceErrorThrottleRef = useRef<number>(0);
  const traceLastFrameTimeRef = useRef<number>(0);
  const traceIntervalStartRef = useRef<number>(0);
  // Course anchor, frozen at countdown start. null = not yet captured.
  const traceAnchorRef = useRef<TraceAnchor | null>(null);

  // Sync parameters inside render loop
  const traceHandRef = useRef(traceHand);
  const tracePathTypeRef = useRef(tracePathType);
  const traceSpeedRef = useRef(traceSpeed);
  const setGameModeRef = useRef(setGameMode);
  const setTracePathTypeRef = useRef(setTracePathType);

  useEffect(() => {
    traceHandRef.current = traceHand;
    tracePathTypeRef.current = tracePathType;
    traceSpeedRef.current = traceSpeed;
    setGameModeRef.current = setGameMode;
    setTracePathTypeRef.current = setTracePathType;
  }, [traceHand, tracePathType, traceSpeed, setGameMode, setTracePathType]);

  // Manage synth loop lifecycle
  useEffect(() => {
    if (calibrated && gameMode && gameType === "trace") {
      traceStateRef.current = "countdown";
      traceCountdownStartRef.current = Date.now();
      traceAnchorRef.current = null; // capture fresh on first countdown frame
      traceProgressRef.current = 0;
      traceDirectionRef.current = 1;
      traceScoreRef.current = 0;
      traceTotalFramesRef.current = 0;
      traceTimeLeftRef.current = TRACE_SECONDS;
      traceLastFrameTimeRef.current = Date.now();
      audioSynth.startTraceChord();
      audioSynth.setTraceChordActive(false);
    } else {
      audioSynth.stopTraceChord();
      traceStateRef.current = "idle";
    }
    return () => {
      audioSynth.stopTraceChord();
    };
  }, [calibrated, gameMode, gameType]);

  const reset = () => {
    traceStateRef.current = "idle";
    traceProgressRef.current = 0;
    traceDirectionRef.current = 1;
    traceAnchorRef.current = null;
    audioSynth.stopTraceChord();
  };

  // Compute a course anchor from the live shoulders; falls back to screen
  // center when shoulders aren't visible (mirrors the old fallback path).
  const computeAnchor = (joints: any, width: number, height: number): TraceAnchor => {
    if (joints.lShoulder && joints.rShoulder) {
      return {
        xMid: (joints.lShoulder.x + joints.rShoulder.x) / 2,
        yMid: (joints.lShoulder.y + joints.rShoulder.y) / 2,
        wShoulder: Math.hypot(
          joints.lShoulder.x - joints.rShoulder.x,
          joints.lShoulder.y - joints.rShoulder.y
        ),
      };
    }
    // Fallback: shoulders not visible. width*0.25 was the old reachable radius;
    // express it as a shoulder width so scale (×1.35) reproduces it.
    return { xMid: width / 2, yMid: height * 0.45, wShoulder: (width * 0.25) / 1.35 };
  };

  const updateAndDrawTraceGame = (
    ctx: CanvasRenderingContext2D,
    joints: any,
    width: number,
    height: number,
    colors: any,
    particlesRef: React.MutableRefObject<any[]>
  ) => {
    const state = traceStateRef.current;
    const now = Date.now();

    // Freeze the course anchor on the first frame after countdown begins, so the
    // path stays put while the child reaches around. All path math below uses
    // this frozen anchor — never the live shoulders.
    if (!traceAnchorRef.current) {
      traceAnchorRef.current = computeAnchor(joints, width, height);
    }
    const anchor = traceAnchorRef.current;
    const wShoulder = anchor.wShoulder;

    // Choose hand color based on settings
    const handColor = traceHandRef.current === "right" ? colors.right : colors.left;
    const handGlow = traceHandRef.current === "right" ? colors.rightGlow : colors.leftGlow;

    // Draw route guidelines
    const drawCoursePath = (alpha: number) => {
      ctx.save();
      ctx.beginPath();
      const samplePoints: { x: number; y: number }[] = [];
      const samples = 60;
      for (let i = 0; i <= samples; i++) {
        const pt = getTracePathPoint(i / samples, tracePathTypeRef.current, anchor);
        samplePoints.push(pt);
      }
      
      ctx.moveTo(samplePoints[0].x, samplePoints[0].y);
      for (let i = 1; i <= samples; i++) {
        ctx.lineTo(samplePoints[i].x, samplePoints[i].y);
      }
      ctx.strokeStyle = handColor;
      ctx.globalAlpha = alpha * 0.22;
      ctx.lineWidth = height * 0.055;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowBlur = 15;
      ctx.shadowColor = handGlow;
      ctx.stroke();

      // Dashed center line
      ctx.beginPath();
      ctx.moveTo(samplePoints[0].x, samplePoints[0].y);
      for (let i = 1; i <= samples; i++) {
        ctx.lineTo(samplePoints[i].x, samplePoints[i].y);
      }
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = alpha * 0.35;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.restore();
    };

    if (state === "countdown") {
      drawCoursePath(0.4);
      
      // Draw target ball at start
      const startPt = getTracePathPoint(0, tracePathTypeRef.current, anchor);
      ctx.save();
      ctx.beginPath();
      ctx.arc(startPt.x, startPt.y, height * 0.025, 0, 2 * Math.PI);
      ctx.fillStyle = handColor;
      ctx.shadowBlur = 20;
      ctx.shadowColor = handGlow;
      ctx.fill();
      ctx.restore();

      const elapsed = now - traceCountdownStartRef.current;
      const count = Math.ceil(3 - (elapsed / 1000));
      
      ctx.save();
      ctx.font = `bold ${height * 0.08}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 10;
      ctx.shadowColor = handGlow;
      ctx.fillText(String(count > 0 ? count : "GO!"), width / 2, height * 0.45);
      
      ctx.font = `bold ${height * 0.032}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = handColor;
      ctx.fillText(
        traceHandRef.current === "right" 
          ? "右手首を 光の球に合わせてね！" 
          : "左手首を 光の球に合わせてね！", 
        width / 2, 
        height * 0.35
      );
      ctx.restore();

      if (elapsed >= 3000) {
        traceStateRef.current = "playing";
        traceStartTimeRef.current = Date.now();
        traceLastFrameTimeRef.current = Date.now();
        traceTimeLeftRef.current = TRACE_SECONDS;
        traceProgressRef.current = 0;
        traceDirectionRef.current = 1;
        traceScoreRef.current = 0;
        traceTotalFramesRef.current = 0;
        audioSynth.playCalibrationSuccess();
      }
    } else if (state === "playing") {
      const dt = now - traceLastFrameTimeRef.current;
      traceLastFrameTimeRef.current = now;

      const elapsedPlay = now - traceStartTimeRef.current;
      const timeLeft = Math.max(0, TRACE_SECONDS - Math.floor(elapsedPlay / 1000));
      traceTimeLeftRef.current = timeLeft;

      if (timeLeft <= 0) {
        traceStateRef.current = "timeup";
        traceIntervalStartRef.current = Date.now();
        audioSynth.playGoalAchieved();
        audioSynth.setTraceChordActive(false);
        return;
      }

      const targetWrist = traceHandRef.current === "right" ? joints.rWrist : joints.lWrist;
      const hasWrist = targetWrist && targetWrist.visibility > 0.65;
      
      let tripDuration = 10000;
      if (traceSpeedRef.current === "slow") tripDuration = 15000;
      if (traceSpeedRef.current === "fast") tripDuration = 6500;

      const targetPt = getTracePathPoint(traceProgressRef.current, tracePathTypeRef.current, anchor);
      let isInside = false;
      const rAllow = wShoulder * 0.28;

      if (hasWrist) {
        const dist = Math.hypot(targetWrist.x - targetPt.x, targetWrist.y - targetPt.y);
        isInside = dist <= rAllow;
      }

      const speedModifier = isInside ? 1.0 : 0.5;
      traceProgressRef.current += (dt / tripDuration) * traceDirectionRef.current * speedModifier;
      
      if (traceProgressRef.current > 1) {
        traceProgressRef.current = 1;
        traceDirectionRef.current = -1;
      } else if (traceProgressRef.current < 0) {
        traceProgressRef.current = 0;
        traceDirectionRef.current = 1;
      }

      traceTotalFramesRef.current++;
      if (isInside) {
        traceScoreRef.current++;
      }

      drawCoursePath(isInside ? 0.7 : 0.35);

      audioSynth.setTraceChordActive(isInside);
      if (hasWrist && !isInside) {
        if (now - traceErrorThrottleRef.current > 850) {
          audioSynth.playTraceError();
          traceErrorThrottleRef.current = now;
        }
      }

      // Particles
      if (hasWrist) {
        if (isInside) {
          if (Math.random() < 0.25) {
            particlesRef.current.push({
              x: targetPt.x + (Math.random() - 0.5) * 15,
              y: targetPt.y + (Math.random() - 0.5) * 15,
              vx: (Math.random() - 0.5) * 1.5,
              vy: (Math.random() - 0.5) * 1.5,
              color: "#ffffff",
              alpha: 0.8,
              size: Math.random() * 2 + 1.5,
              life: 0.02
            });
          }
        } else {
          if (Math.random() < 0.2) {
            const angle = Math.atan2(targetPt.y - targetWrist.y, targetPt.x - targetWrist.x);
            particlesRef.current.push({
              x: targetWrist.x,
              y: targetWrist.y,
              vx: Math.cos(angle) * 3 + (Math.random() - 0.5) * 2,
              vy: Math.sin(angle) * 3 + (Math.random() - 0.5) * 2,
              color: handColor,
              alpha: 0.7,
              size: Math.random() * 2.5 + 1.2,
              life: 0.03
            });
          }
        }
      }

      // Render Target Ball
      ctx.save();
      const pulseRadius = (height * 0.028) * (isInside ? (1 + 0.15 * Math.sin(now / 150)) : 1.0);
      ctx.beginPath();
      ctx.arc(targetPt.x, targetPt.y, pulseRadius, 0, 2 * Math.PI);
      
      if (isInside) {
        ctx.fillStyle = "#ffffff";
        ctx.shadowBlur = 25;
        ctx.shadowColor = handColor;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(targetPt.x, targetPt.y, pulseRadius * 0.8, 0, 2 * Math.PI);
        ctx.fillStyle = handColor;
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = handColor;
        ctx.shadowBlur = 10;
        ctx.shadowColor = handColor;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(targetPt.x, targetPt.y, pulseRadius * 1.5, 0, 2 * Math.PI);
        ctx.strokeStyle = handColor;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.18;
        ctx.stroke();
      }
      ctx.restore();

      // Wrist tracker ring
      if (hasWrist) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(targetWrist.x, targetWrist.y, rAllow, 0, 2 * Math.PI);
        if (isInside) {
          ctx.strokeStyle = "#00ff66";
          ctx.lineWidth = 2.5;
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#00ff66";
        } else {
          ctx.strokeStyle = "#ff8800";
          ctx.lineWidth = 1.8;
          ctx.setLineDash([4, 4]);
        }
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(targetWrist.x, targetWrist.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.font = `bold ${height * 0.032}px ${CANVAS_FONT_SANS}`;
        ctx.fillStyle = "#ff5555";
        ctx.textAlign = "center";
        ctx.fillText("カメラのなかに 手を入れてね！", width / 2, height * 0.28);
        ctx.restore();
      }

      // Draw HUD
      ctx.save();
      ctx.font = `bold ${height * 0.036}px ${CANVAS_FONT_MONO}`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.shadowBlur = 8;
      ctx.shadowColor = handGlow;
      ctx.fillText(`TIME: ${timeLeft}s`, width * 0.06, height * 0.16);

      const currentAcc = traceTotalFramesRef.current > 0 
        ? Math.round((traceScoreRef.current / traceTotalFramesRef.current) * 100)
        : 0;
      ctx.fillText(`KEEP: ${currentAcc}%`, width * 0.06, height * 0.21);

      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(width * 0.06, height * 0.24);
      ctx.lineTo(width * 0.22, height * 0.24);
      ctx.stroke();

      ctx.strokeStyle = isInside ? "#00ff66" : handColor;
      ctx.beginPath();
      ctx.moveTo(width * 0.06, height * 0.24);
      ctx.lineTo(width * 0.06 + (width * 0.16) * (currentAcc / 100), height * 0.24);
      ctx.stroke();
      ctx.restore();

    } else if (state === "timeup") {
      drawCoursePath(0.15);

      const elapsed = now - traceIntervalStartRef.current;
      const currentAcc = traceTotalFramesRef.current > 0 
        ? Math.round((traceScoreRef.current / traceTotalFramesRef.current) * 100)
        : 0;

      ctx.save();
      ctx.font = `bold ${height * 0.06}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = "#ffb700";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 15;
      ctx.shadowColor = "rgba(255, 183, 0, 0.4)";
      ctx.fillText("タイムアップ！", width / 2, height * 0.42);

      ctx.font = `bold ${height * 0.036}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`できたスコア: ${currentAcc}%`, width / 2, height * 0.52);

      ctx.font = `500 ${height * 0.028}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = "var(--text-secondary)";
      ctx.fillText("よくがんばったね！", width / 2, height * 0.58);
      ctx.restore();

      if (elapsed >= 3500) {
        traceStateRef.current = "interval";
        traceIntervalStartRef.current = Date.now();
      }
    } else if (state === "interval") {
      const elapsed = now - traceIntervalStartRef.current;
      const cycleTime = (elapsed % 6000) / 1000;
      const isInhaling = cycleTime < 3.0;
      const breatheScale = isInhaling 
        ? cycleTime / 3.0 
        : (6.0 - cycleTime) / 3.0;

      const breathRadius = height * 0.06 + (height * 0.08) * breatheScale;

      ctx.save();
      ctx.beginPath();
      ctx.arc(width / 2, height * 0.45, breathRadius, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(0, 240, 255, 0.25)";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(width / 2, height * 0.45, breathRadius * 1.3, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(0, 240, 255, 0.08)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(width / 2, height * 0.45, breathRadius * 0.5, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(0, 240, 255, 0.05)";
      ctx.fill();

      ctx.font = `bold ${height * 0.038}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(isInhaling ? "すって〜（すいこむ）" : "はいて〜（はきだす）", width / 2, height * 0.26);

      ctx.font = `bold ${height * 0.032}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = "var(--color-right)";
      ctx.fillText("深呼吸をしてリラックスしよう", width / 2, height * 0.31);

      // Tell the child which course comes next (play continues hands-free).
      const curIdx = TRACE_PATH_CYCLE.indexOf(tracePathTypeRef.current as typeof TRACE_PATH_CYCLE[number]);
      const nextShape = TRACE_PATH_CYCLE[(curIdx + 1) % TRACE_PATH_CYCLE.length];
      const nextLabel =
        nextShape === "horizontal" ? "まっすぐ線（よこ）" :
        nextShape === "vertical" ? "まっすぐ線（たて）" :
        nextShape === "sine" ? "なみの線" : "まるい線";
      ctx.font = `bold ${height * 0.028}px ${CANVAS_FONT_SANS}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`つぎは「${nextLabel}」`, width / 2, height * 0.37);

      const remSec = Math.ceil(10 - (elapsed / 1000));
      ctx.font = `bold ${height * 0.03}px ${CANVAS_FONT_MONO}`;
      ctx.fillStyle = "var(--text-secondary)";
      ctx.fillText(`インターバル: ${remSec}s`, width / 2, height * 0.68);
      ctx.restore();

      if (elapsed >= 10000) {
        // Advance to the next course shape and start a fresh round (countdown),
        // so play continues hands-free through よこ→たて→なみ→まる→…
        const idx = TRACE_PATH_CYCLE.indexOf(tracePathTypeRef.current as typeof TRACE_PATH_CYCLE[number]);
        const next = TRACE_PATH_CYCLE[(idx + 1) % TRACE_PATH_CYCLE.length];
        tracePathTypeRef.current = next;
        setTracePathTypeRef.current(next); // keep App/ControlPanel in sync

        traceStateRef.current = "countdown";
        traceCountdownStartRef.current = Date.now();
        traceAnchorRef.current = null; // re-snapshot the course for the new shape
        traceProgressRef.current = 0;
        traceDirectionRef.current = 1;
        traceScoreRef.current = 0;
        traceTotalFramesRef.current = 0;
        traceTimeLeftRef.current = TRACE_SECONDS;
      }
    }
  };

  return {
    traceState: traceStateRef.current,
    traceTimeLeft: traceTimeLeftRef.current,
    reset,
    updateAndDrawTraceGame
  };
};
export default useSlowTraceGame;
