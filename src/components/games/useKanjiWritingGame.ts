import { useState, useRef, useEffect } from "react";
import { audioSynth } from "../../utils/audioSynth";
import type { Point2D } from "../../types";

export interface KanjiItem {
  char: string;
  reading: string;
  meaning: string;
  category: string;
}

export type { Point2D };

// Font + slack shared by the visible お手本 guide (BodyCanvas) and the hit
// mask here, so the line a child sees is exactly the line they can draw on.
// KANJI_GUIDE_SLACK is the mask stroke width as a fraction of the box; the
// guide glyph is stroked at the same width so visual == hittable.
export const KANJI_GUIDE_FONT = "Outfit, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif";
export const KANJI_GUIDE_SLACK = 0.07;

/**
 * The on-canvas writing box (the お手本 grid). Shared between the guide
 * rendering in BodyCanvas and the "area" draw-trigger here so the visible
 * frame and the hit-test can never drift apart. Mirrors the geometry that
 * BodyCanvas uses for the kanji guide: centered horizontally, pushed below
 * the air-button zone, square of side height*0.4.
 */
export const getKanjiBox = (width: number, height: number) => {
  const cX = width / 2;
  const cY = height * 0.58;
  const boxSize = height * 0.4;
  return {
    cX,
    cY,
    boxSize,
    left: cX - boxSize / 2,
    right: cX + boxSize / 2,
    top: cY - boxSize / 2,
    bottom: cY + boxSize / 2,
  };
};

export const KANJI_CATEGORIES: Record<string, string> = {
  nature: "しぜん (Nature)",
  life: "いきもの (Life)",
  action: "うごき・かたち (Action & Shape)",
  body: "からだ・こころ (Body & Mind)",
};

export const kanjiList: KanjiItem[] = [
  // Nature
  { char: "雨", reading: "あめ", meaning: "Rain", category: "nature" },
  { char: "雲", reading: "くも", meaning: "Cloud", category: "nature" },
  { char: "雪", reading: "ゆき", meaning: "Snow", category: "nature" },
  { char: "風", reading: "かぜ", meaning: "Wind", category: "nature" },
  { char: "星", reading: "ほし", meaning: "Star", category: "nature" },
  { char: "光", reading: "ひかり", meaning: "Light", category: "nature" },
  // Life
  { char: "花", reading: "はな", meaning: "Flower", category: "life" },
  { char: "草", reading: "くさ", meaning: "Grass", category: "life" },
  { char: "虫", reading: "むし", meaning: "Insect", category: "life" },
  { char: "魚", reading: "さかな", meaning: "Fish", category: "life" },
  { char: "鳥", reading: "とり", meaning: "Bird", category: "life" },
  { char: "馬", reading: "うま", meaning: "Horse", category: "life" },
  // Action & Shapes
  { char: "走", reading: "はしる", meaning: "Run", category: "action" },
  { char: "引", reading: "ひく", meaning: "Pull", category: "action" },
  { char: "会", reading: "あう", meaning: "Meet", category: "action" },
  { char: "丸", reading: "まる", meaning: "Circle", category: "action" },
  { char: "弓", reading: "ゆみ", meaning: "Bow", category: "action" },
  { char: "矢", reading: "や", meaning: "Arrow", category: "action" },
  // Body & Mind
  { char: "手", reading: "て", meaning: "Hand", category: "body" },
  { char: "足", reading: "あし", meaning: "Foot", category: "body" },
  { char: "目", reading: "め", meaning: "Eye", category: "body" },
  { char: "首", reading: "くび", meaning: "Neck/Head", category: "body" },
  { char: "頭", reading: "あたま", meaning: "Head", category: "body" },
  { char: "心", reading: "こころ", meaning: "Heart/Mind", category: "body" },
];

interface UseKanjiWritingGameProps {
  calibrated: boolean;
  gameMode: boolean;
  gameType: "pose" | "trace" | "kanji" | "balloon" | "catch" | "balance" | "command";
  kanjiHand: "left" | "right";
  kanjiChar: string;
  kanjiBrushStyle: "neon" | "flame" | "rainbow";
  setKanjiChar?: (char: string) => void;
}

export const useKanjiWritingGame = ({
  calibrated,
  gameMode,
  gameType,
  kanjiHand,
  kanjiChar,
  kanjiBrushStyle,
  setKanjiChar,
}: UseKanjiWritingGameProps) => {
  const [kanjiState, setKanjiState] = useState<"writing" | "success">("writing");
  const strokesRef = useRef<Point2D[][]>([]);
  const currentStrokeRef = useRef<Point2D[]>([]);
  const isDrawingRef = useRef<boolean>(false);
  const wasClappedRef = useRef<boolean>(false);

  // Sync inputs
  const kanjiHandRef = useRef(kanjiHand);
  const kanjiCharRef = useRef(kanjiChar);
  const kanjiBrushStyleRef = useRef(kanjiBrushStyle);
  const kanjiStateRef = useRef<"writing" | "success">("writing");

  // Offscreen stroke mask: the お手本 glyph painted thick (with のりしろ slack)
  // onto a 1:1 canvas, so we can pixel-test whether the hand is on a stroke.
  // Rebuilt only when the char or box size changes.
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const maskKeyRef = useRef<string>("");

  useEffect(() => {
    kanjiHandRef.current = kanjiHand;
    kanjiCharRef.current = kanjiChar;
    kanjiBrushStyleRef.current = kanjiBrushStyle;
  }, [kanjiHand, kanjiChar, kanjiBrushStyle]);

  useEffect(() => {
    kanjiStateRef.current = kanjiState;
  }, [kanjiState]);

  // Handle success duration and auto-advance
  useEffect(() => {
    if (kanjiState === "success") {
      const timer = setTimeout(() => {
        setKanjiState("writing");
        clearCanvas();

        const currentIndex = kanjiList.findIndex((k) => k.char === kanjiCharRef.current);
        if (currentIndex !== -1) {
          const nextIndex = (currentIndex + 1) % kanjiList.length;
          const nextKanji = kanjiList[nextIndex].char;
          if (setKanjiChar) {
            setKanjiChar(nextKanji);
          }
        }
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [kanjiState, setKanjiChar]);

  // Audio setup on mode activation
  useEffect(() => {
    if (calibrated && gameMode && gameType === "kanji") {
      audioSynth.startDrawingSound();
    } else {
      audioSynth.stopDrawingSound();
    }
    return () => {
      audioSynth.stopDrawingSound();
    };
  }, [calibrated, gameMode, gameType]);

  // Automatically clear canvas when active parameters change
  useEffect(() => {
    clearCanvas();
  }, [kanjiChar, gameType, gameMode]);

  const clearCanvas = () => {
    strokesRef.current = [];
    currentStrokeRef.current = [];
    isDrawingRef.current = false;
    audioSynth.setDrawingSoundActive(false);
  };

  // Build (or reuse) the offscreen stroke mask for the current お手本 glyph.
  // The glyph is filled, then stroked thick on top to add のりしろ slack so a
  // child whose hand is a little off the line still counts as "on the stroke".
  const ensureMask = (char: string, width: number, height: number) => {
    const { cX, cY, boxSize } = getKanjiBox(width, height);
    const key = `${char}|${Math.round(boxSize)}`;
    if (maskKeyRef.current === key && maskCanvasRef.current) return;

    let canvas = maskCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      maskCanvasRef.current = canvas;
    }
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));

    const mctx = canvas.getContext("2d", { willReadFrequently: true });
    maskCtxRef.current = mctx;
    if (!mctx) return;

    mctx.clearRect(0, 0, canvas.width, canvas.height);
    mctx.fillStyle = "#fff";
    mctx.strokeStyle = "#fff";
    // Slack of ~3.5% of the box on each side (lineWidth = full slack, split
    // both sides by stroke). Kept modest so gaps between strokes stay "off the
    // line"; the visible guide is drawn at this same width (see KANJI_GUIDE_SLACK)
    // so what the child sees as the line IS the hittable area.
    mctx.lineWidth = boxSize * KANJI_GUIDE_SLACK;
    mctx.lineJoin = "round";
    mctx.lineCap = "round";
    mctx.textAlign = "center";
    mctx.textBaseline = "middle";
    mctx.font = `bold ${height * 0.34}px ${KANJI_GUIDE_FONT}`;
    mctx.strokeText(char, cX, cY);
    mctx.fillText(char, cX, cY);

    maskKeyRef.current = key;
  };

  // Is the point on the glyph stroke? Reads one pixel's alpha from the mask.
  const isOnStroke = (x: number, y: number): boolean => {
    const mctx = maskCtxRef.current;
    const canvas = maskCanvasRef.current;
    if (!mctx || !canvas) return false;
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return false;
    return mctx.getImageData(px, py, 1, 1).data[3] > 0;
  };

  const updateAndDrawKanjiGame = (
    ctx: CanvasRenderingContext2D,
    joints: any,
    width: number,
    height: number,
    colors: any,
    particlesRef: React.MutableRefObject<any[]>,
    triggerFireworks: (centerX: number, centerY: number, colors: any) => void
  ) => {
    const isKanjiActive = calibrated && gameMode && gameType === "kanji";
    if (!isKanjiActive) return;

    // 1. Detect Clapping Gesture to Clear Canvas
    const hasWrists = joints.lWrist && joints.rWrist && joints.lWrist.visibility > 0.6 && joints.rWrist.visibility > 0.6;
    const hasShoulders = joints.lShoulder && joints.rShoulder && joints.lShoulder.visibility > 0.5 && joints.rShoulder.visibility > 0.5;
    
    const shoulderWidth = hasShoulders
      ? Math.hypot(joints.lShoulder.x - joints.rShoulder.x, joints.lShoulder.y - joints.rShoulder.y)
      : width * 0.22;

    if (hasWrists) {
      const wristDist = Math.hypot(joints.lWrist.x - joints.rWrist.x, joints.lWrist.y - joints.rWrist.y);
      if (wristDist < shoulderWidth * 0.24) {
        if (!wasClappedRef.current) {
          // Trigger clap reset
          clearCanvas();
          audioSynth.playClapClear();
          triggerFireworks((joints.lWrist.x + joints.rWrist.x) / 2, (joints.lWrist.y + joints.rWrist.y) / 2, colors);
          wasClappedRef.current = true;
        }
      } else if (wristDist > shoulderWidth * 0.45) {
        wasClappedRef.current = false;
      }
    }

    // 2. Drawing Trigger Logic
    const hand = kanjiHandRef.current;
    const wrist = hand === "right" ? joints.rWrist : joints.lWrist;
    const index = hand === "right" ? joints.rIndex : joints.lIndex;

    // Tracking point: primary is index finger, wrist is backup
    const trackingPt = index && index.visibility > 0.5 ? index : wrist;

    // Draw only while the tracking point is on the お手本 glyph stroke
    // (pixel-tested against an offscreen mask), so strokes stay on the lines and
    // the pen naturally lifts between separate 画 when the hand leaves a stroke.
    let shouldDraw = false;
    if (trackingPt && trackingPt.visibility > 0.4 && kanjiStateRef.current === "writing") {
      ensureMask(kanjiCharRef.current, width, height);
      shouldDraw = isOnStroke(trackingPt.x, trackingPt.y);
    }

    if (shouldDraw && trackingPt) {
      const currentPoint = { x: trackingPt.x, y: trackingPt.y };
      const lastPoint = currentStrokeRef.current[currentStrokeRef.current.length - 1];

      if (lastPoint) {
        const jump = Math.hypot(currentPoint.x - lastPoint.x, currentPoint.y - lastPoint.y);
        // Pen-lift on a big jump (e.g. hopping between two nearby 画, or a
        // tracking glitch): commit the current stroke and start a fresh one
        // instead of drawing a long connector that makes the kanji look like
        // 一筆書き. Threshold scales with the writing box.
        const jumpLimit = getKanjiBox(width, height).boxSize * 0.22;
        if (jump > jumpLimit) {
          if (currentStrokeRef.current.length > 1) {
            strokesRef.current.push([...currentStrokeRef.current]);
          }
          currentStrokeRef.current = [currentPoint];
        } else if (jump > 2) {
          // Add point only if moved enough, to avoid duplicate spam.
          currentStrokeRef.current.push(currentPoint);
        }
      } else {
        currentStrokeRef.current.push(currentPoint);
      }

      isDrawingRef.current = true;

      // Play drawing sound pitch mapped to screen height (higher = higher pitch)
      const heightPercent = 1 - currentPoint.y / height;
      const freq = 220 + heightPercent * 440; // 220Hz - 660Hz
      audioSynth.setDrawingSoundActive(true, freq);

      // Spawn active drawing sparks
      if (Math.random() < 0.3) {
        const brushColor = hand === "right" ? colors.right : colors.left;
        particlesRef.current.push({
          x: currentPoint.x,
          y: currentPoint.y,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          color: kanjiBrushStyleRef.current === "rainbow" 
            ? `hsl(${Date.now() / 20 % 360}, 100%, 70%)` 
            : brushColor,
          alpha: 0.9,
          size: Math.random() * 3 + 1.5,
          life: 0.035,
        });
      }
    } else {
      if (isDrawingRef.current) {
        // Stop drawing, commit current stroke
        if (currentStrokeRef.current.length > 1) {
          strokesRef.current.push([...currentStrokeRef.current]);
        }
        currentStrokeRef.current = [];
        isDrawingRef.current = false;
        audioSynth.setDrawingSoundActive(false);
      }
    }

    // 3. Render Strokes (Persistent + Active)
    const brushStyle = kanjiBrushStyleRef.current;
    const defaultColor = hand === "right" ? colors.right : colors.left;
    const defaultGlow = hand === "right" ? colors.rightGlow : colors.leftGlow;

    const allStrokes = [...strokesRef.current];
    if (currentStrokeRef.current.length > 0) {
      allStrokes.push(currentStrokeRef.current);
    }

    allStrokes.forEach((stroke) => {
      if (stroke.length < 2) return;

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (kanjiStateRef.current === "success") {
        // Render success gold pulse trace
        const pulseWidth = (height * 0.0095) * (1 + 0.15 * Math.sin(Date.now() / 120));
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(stroke[i].x, stroke[i].y);
        }
        ctx.lineWidth = pulseWidth;
        ctx.strokeStyle = "#ffb700";
        ctx.shadowBlur = 24;
        ctx.shadowColor = "rgba(255, 183, 0, 0.9)";
        ctx.stroke();
      }
      else if (brushStyle === "neon") {
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(stroke[i].x, stroke[i].y);
        }
        ctx.lineWidth = height * 0.007;
        ctx.strokeStyle = defaultColor;
        ctx.shadowBlur = 18;
        ctx.shadowColor = defaultGlow;
        ctx.stroke();
      } 
      else if (brushStyle === "rainbow") {
        // Draw segment by segment to shift colors
        for (let i = 1; i < stroke.length; i++) {
          const p1 = stroke[i - 1];
          const p2 = stroke[i];
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          
          const hue = (i * 3 + Date.now() / 40) % 360;
          ctx.lineWidth = height * 0.0075;
          ctx.strokeStyle = `hsla(${hue}, 100%, 65%, 1)`;
          ctx.shadowBlur = 15;
          ctx.shadowColor = `hsla(${hue}, 100%, 65%, 0.6)`;
          ctx.stroke();
        }
      } 
      else if (brushStyle === "flame") {
        // Draw faint glowing path
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(stroke[i].x, stroke[i].y);
        }
        ctx.lineWidth = height * 0.006;
        ctx.strokeStyle = "rgba(255, 68, 0, 0.4)";
        ctx.shadowBlur = 15;
        ctx.shadowColor = "rgba(255, 68, 0, 0.8)";
        ctx.stroke();

        // Spawn upward drifting ember particles along active stroke path
        if (stroke === currentStrokeRef.current && Math.random() < 0.4) {
          const pt = stroke[stroke.length - 1];
          particlesRef.current.push({
            x: pt.x + (Math.random() - 0.5) * 10,
            y: pt.y + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 1.2,
            vy: -Math.random() * 2 - 0.6, // drift upwards
            color: `hsl(${Math.random() * 25 + 12}, 100%, ${Math.random() * 20 + 50}%)`, // Fire gold/orange
            alpha: 0.9,
            size: Math.random() * 3.5 + 2,
            life: Math.random() * 0.02 + 0.012,
          });
        }
      }

      ctx.restore();
    });

    // 3.5 Spawn particles and render success message if in success state
    if (kanjiStateRef.current === "success") {
      if (Math.random() < 0.25) {
        const cX = width / 2;
        const cY = height * 0.58;
        particlesRef.current.push({
          x: cX + (Math.random() - 0.5) * height * 0.45,
          y: cY + (Math.random() - 0.5) * height * 0.45,
          vx: (Math.random() - 0.5) * 2.2,
          vy: -Math.random() * 1.8 - 0.8, // drift upwards
          color: "#ffb700",
          alpha: 0.95,
          size: Math.random() * 3.5 + 2,
          life: 0.018,
        });
      }

      ctx.save();
      const cX = width / 2;
      const cY = height * 0.58;
      ctx.font = `bold ${height * 0.048}px Outfit, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif`;
      ctx.fillStyle = "#ffb700";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 20;
      ctx.shadowColor = "rgba(255, 183, 0, 0.7)";
      ctx.fillText("たいへんよくできました！💮", cX, cY);
      ctx.restore();
    }

    // 4. Render Active Pointer Indicator
    if (trackingPt) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(trackingPt.x, trackingPt.y, shouldDraw ? 10 : 6, 0, 2 * Math.PI);
      ctx.fillStyle = shouldDraw ? "#00ff66" : defaultColor;
      ctx.shadowBlur = 15;
      ctx.shadowColor = shouldDraw ? "rgba(0, 255, 102, 0.8)" : defaultGlow;
      ctx.fill();
      
      // Outer ring for calibration or trigger hint
      if (!shouldDraw) {
        ctx.beginPath();
        ctx.arc(trackingPt.x, trackingPt.y, 16, 0, 2 * Math.PI);
        ctx.strokeStyle = defaultColor;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  const triggerSuccess = (
    width: number,
    height: number,
    colors: any,
    triggerFireworks: (centerX: number, centerY: number, colors: any) => void
  ) => {
    if (kanjiStateRef.current !== "writing") return;
    setKanjiState("success");
    audioSynth.playGoalAchieved();

    // Trigger fireworks in multiple spots
    triggerFireworks(width * 0.3, height * 0.4, colors);
    triggerFireworks(width * 0.7, height * 0.4, colors);
    triggerFireworks(width * 0.5, height * 0.3, colors);
  };

  return {
    strokes: strokesRef.current,
    kanjiState,
    triggerSuccess,
    isDrawing: isDrawingRef.current,
    clearCanvas,
    updateAndDrawKanjiGame,
  };
};

export default useKanjiWritingGame;
