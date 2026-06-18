import React, { useRef, useEffect } from "react";
import { audioSynth } from "../utils/audioSynth";
import usePoseMatchingGame from "./games/usePoseMatchingGame";
import useSlowTraceGame from "./games/useSlowTraceGame";

// Vector Angle calculation helper (pure utility exported for game hooks)
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

interface BodyCanvasProps {
  landmarks: any[] | null;
  calibrated: boolean;
  setCalibrated: (val: boolean) => void;
  showTrails: boolean;
  theme: string;
  autoCalibMode: "full" | "upper";
  onResetTriggered: () => void;
  videoElement: HTMLVideoElement | null;
  cameraBackground: "calibration" | "always" | "never";
  gameMode: boolean;
  setGameMode: (val: boolean) => void;
  gameType: "pose" | "trace";
  traceHand: "left" | "right";
  tracePathType: "horizontal" | "vertical" | "sine" | "circle";
  traceSpeed: "slow" | "medium" | "fast";
  stretchHighlights: boolean;
}

interface Point2D {
  x: number;
  y: number;
  time: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  size: number;
  life: number;
}

// Queue size for trails
const TRAIL_MAX_POINTS = 16;

export const BodyCanvas: React.FC<BodyCanvasProps> = ({
  landmarks,
  calibrated,
  setCalibrated,
  showTrails,
  theme,
  autoCalibMode,
  onResetTriggered,
  videoElement,
  cameraBackground,
  gameMode,
  setGameMode,
  gameType,
  traceHand,
  tracePathType,
  traceSpeed,
  stretchHighlights,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Calibration State
  const calibrationProgressRef = useRef<number>(0);
  const calibrationTimerRef = useRef<number | null>(null);
  const isCalibratingRef = useRef<boolean>(false);
  const calibStartTimeRef = useRef<number>(0);

  // Gesture Reset State
  const resetProgressRef = useRef<number>(0);
  const resetTimerRef = useRef<number | null>(null);
  const isResettingRef = useRef<boolean>(false);
  const resetStartTimeRef = useRef<number>(0);

  // Joint Trails
  const leftWristTrail = useRef<Point2D[]>([]);
  const rightWristTrail = useRef<Point2D[]>([]);
  const leftAnkleTrail = useRef<Point2D[]>([]);
  const rightAnkleTrail = useRef<Point2D[]>([]);

  // Speed values for extremities
  const leftWristSpeed = useRef<number>(0);
  const rightWristSpeed = useRef<number>(0);
  const leftAnkleSpeed = useRef<number>(0);
  const rightAnkleSpeed = useRef<number>(0);

  // Interactive Visual Effects Arrays
  const ripplesRef = useRef<Ripple[]>([]);
  const particlesRef = useRef<Particle[]>([]);

  // Straight Joint Click Trigger States (prevent repeated play)
  const prevStraightRef = useRef({
    lElbow: false,
    rElbow: false,
    lKnee: false,
    rKnee: false,
  });

  // Game hooks integration
  const {
    currentPose,
    reset: resetPoseGame,
    updateAndDrawPoseGame
  } = usePoseMatchingGame({ autoCalibMode });

  const {
    reset: resetTraceGame,
    updateAndDrawTraceGame
  } = useSlowTraceGame({
    calibrated,
    gameMode,
    gameType,
    traceHand,
    tracePathType,
    traceSpeed,
    setGameMode
  });

  const btnHoverProgressRef = useRef<number>(0); // 0 to 100 for Air Button

  // Persistent smoothed joints array (for 33 landmarks)
  const smoothedJointsRef = useRef<Array<{ x: number; y: number; z: number; visibility: number } | null>>(
    Array(33).fill(null)
  );

  // Sync props and state into refs to avoid recreating the continuous 60fps render loop
  const landmarksRef = useRef(landmarks);
  const calibratedRef = useRef(calibrated);
  const showTrailsRef = useRef(showTrails);
  const themeRef = useRef(theme);
  const autoCalibModeRef = useRef(autoCalibMode);
  const videoElementRef = useRef(videoElement);
  const cameraBackgroundRef = useRef(cameraBackground);
  const gameModeRef = useRef(gameMode);
  const setGameModeRef = useRef(setGameMode);
  const gameTypeRef = useRef(gameType);
  const traceHandRef = useRef(traceHand);
  const tracePathTypeRef = useRef(tracePathType);
  const traceSpeedRef = useRef(traceSpeed);
  const stretchHighlightsRef = useRef(stretchHighlights);
  const onResetTriggeredRef = useRef(onResetTriggered);
  const setCalibratedRef = useRef(setCalibrated);

  useEffect(() => {
    landmarksRef.current = landmarks;
    calibratedRef.current = calibrated;
    showTrailsRef.current = showTrails;
    themeRef.current = theme;
    autoCalibModeRef.current = autoCalibMode;
    videoElementRef.current = videoElement;
    cameraBackgroundRef.current = cameraBackground;
    gameModeRef.current = gameMode;
    setGameModeRef.current = setGameMode;
    gameTypeRef.current = gameType;
    traceHandRef.current = traceHand;
    tracePathTypeRef.current = tracePathType;
    traceSpeedRef.current = traceSpeed;
    stretchHighlightsRef.current = stretchHighlights;
    onResetTriggeredRef.current = onResetTriggered;
    setCalibratedRef.current = setCalibrated;
  }, [landmarks, calibrated, showTrails, theme, autoCalibMode, videoElement, cameraBackground, gameMode, setGameMode, gameType, traceHand, tracePathType, traceSpeed, stretchHighlights, onResetTriggered, setCalibrated]);

  // Track calibration toggle state
  const prevCalibrated = useRef<boolean>(calibrated);

  // Clear trails and visual effects helper
  const clearTrails = () => {
    leftWristTrail.current = [];
    rightWristTrail.current = [];
    leftAnkleTrail.current = [];
    rightAnkleTrail.current = [];
    ripplesRef.current = [];
    particlesRef.current = [];
    btnHoverProgressRef.current = 0;
    resetPoseGame();
    resetTraceGame();
  };

  // Canvas scaling and resizing
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // Initial call

    const timer = setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
    };
  }, []);

  // Watch for calibration changes
  useEffect(() => {
    if (calibrated !== prevCalibrated.current) {
      if (!calibrated) {
        clearTrails();
      }
      prevCalibrated.current = calibrated;
    }
  }, [calibrated]);



  // Helper: Spawn fireworks particles on clear
  const triggerFireworks = (centerX: number, centerY: number, colors: any) => {
    const particles = particlesRef.current;
    const palette = [colors.right, colors.left, "#ffffff", "#ffb700", "#00ffaa"];
    
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 3;
      particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: palette[Math.floor(Math.random() * palette.length)],
        alpha: 1.0,
        size: Math.random() * 4 + 2,
        life: Math.random() * 0.02 + 0.015,
      });
    }
  };

  // Helper: Spawn sparkles for high-velocity joint trails
  const triggerTrailSparkles = (x: number, y: number, color: string, speed: number) => {
    const particles = particlesRef.current;
    const particleCount = Math.min(3, Math.floor(speed / 6));

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * 2 + 1;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 0.5, // slight upward float
        color: color,
        alpha: 0.8,
        size: Math.random() * 2.5 + 1,
        life: 0.03, // quick fade
      });
    }
  };



  // Continuous 60 FPS render loop
  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);

      // Clear canvas background
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillRect(0, 0, width, height);

      // Render camera feed as background if requested
      const shouldShowCamera = cameraBackgroundRef.current === "always" || 
        (!calibratedRef.current && cameraBackgroundRef.current === "calibration");
      if (shouldShowCamera && videoElementRef.current && videoElementRef.current.readyState >= 2) {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.globalAlpha = 0.25;
        ctx.drawImage(videoElementRef.current, 0, 0, width, height);
        ctx.restore();
      }

      // Draw grid background guidelines if not calibrated
      if (!calibratedRef.current) {
        drawCalibrationOverlay(ctx, width, height);
      }

      const activeLandmarks = landmarksRef.current;

      if (!activeLandmarks || activeLandmarks.length === 0) {
        cancelCalibration();
        cancelReset();
        smoothedJointsRef.current.fill(null);
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const pose = activeLandmarks[0];

      // Update smoothed joints based on the new raw pose coordinates using lerp
      for (let i = 0; i < 33; i++) {
        const rawPt = pose[i];
        if (!rawPt) {
          smoothedJointsRef.current[i] = null;
          continue;
        }

        const targetX = (1.0 - rawPt.x) * width;
        const targetY = rawPt.y * height;
        const targetZ = rawPt.z;
        const targetVis = rawPt.visibility !== undefined ? rawPt.visibility : 1.0;

        if (!smoothedJointsRef.current[i]) {
          smoothedJointsRef.current[i] = { x: targetX, y: targetY, z: targetZ, visibility: targetVis };
        } else {
          const current = smoothedJointsRef.current[i]!;
          const lerpFactor = 0.25; // 25% smooth linear interpolation per frame
          current.x += (targetX - current.x) * lerpFactor;
          current.y += (targetY - current.y) * lerpFactor;
          current.z += (targetZ - current.z) * lerpFactor;
          current.visibility += (targetVis - current.visibility) * lerpFactor;
        }
      }

      // Check calibration & reset states
      handleCalibrationCheck(pose);
      handleResetCheck(pose);

      if (calibratedRef.current) {
        // Retrieve theme color values
        const style = getComputedStyle(document.body);
        const colorRight = style.getPropertyValue("--color-right").trim() || "#00f0ff";
        const colorLeft = style.getPropertyValue("--color-left").trim() || "#ff007f";
        const colorCenter = style.getPropertyValue("--color-center").trim() || "#ffffff";
        const colorRightGlow = style.getPropertyValue("--color-right-glow").trim() || "rgba(0, 240, 255, 0.4)";
        const colorLeftGlow = style.getPropertyValue("--color-left-glow").trim() || "rgba(255, 0, 127, 0.4)";
        const colorCenterGlow = style.getPropertyValue("--color-center-glow").trim() || "rgba(255, 255, 255, 0.3)";

        const colors = {
          right: colorRight,
          left: colorLeft,
          center: colorCenter,
          rightGlow: colorRightGlow,
          leftGlow: colorLeftGlow,
          centerGlow: colorCenterGlow,
        };

        const jointRadius = height * 0.011;
        const boneWidth = height * 0.005;

        const getCanvasPoint = (index: number) => {
          const pt = smoothedJointsRef.current[index];
          if (!pt) return null;
          return {
            x: pt.x,
            y: pt.y,
            z: pt.z,
            visibility: pt.visibility,
          };
        };

        const joints = {
          nose: getCanvasPoint(0),
          lEye: getCanvasPoint(2),
          rEye: getCanvasPoint(5),
          lShoulder: getCanvasPoint(11),
          rShoulder: getCanvasPoint(12),
          lElbow: getCanvasPoint(13),
          rElbow: getCanvasPoint(14),
          lWrist: getCanvasPoint(15),
          rWrist: getCanvasPoint(16),
          lHip: getCanvasPoint(23),
          rHip: getCanvasPoint(24),
          lKnee: getCanvasPoint(25),
          rKnee: getCanvasPoint(26),
          lAnkle: getCanvasPoint(27),
          rAnkle: getCanvasPoint(28),
        };

        // Air Button (Hover Trigger) Logic
        const btnX = width * 0.88;
        const btnY = height * 0.22;
        const btnRadius = height * 0.055;
        let isHovered = false;

        if (joints.lWrist && joints.lWrist.visibility > 0.65) {
          const distL = Math.hypot(joints.lWrist.x - btnX, joints.lWrist.y - btnY);
          if (distL < btnRadius * 1.5) {
            isHovered = true;
          }
        }
        if (!isHovered && joints.rWrist && joints.rWrist.visibility > 0.65) {
          const distR = Math.hypot(joints.rWrist.x - btnX, joints.rWrist.y - btnY);
          if (distR < btnRadius * 1.5) {
            isHovered = true;
          }
        }

        if (isHovered) {
          // Increment progress (~1.1 seconds hold time at 60fps)
          btnHoverProgressRef.current = Math.min(100, btnHoverProgressRef.current + 1.5);

          // Add visual particles around the active wrist for feedback
          const activeWrist = (joints.lWrist && joints.lWrist.visibility > 0.65 && Math.hypot(joints.lWrist.x - btnX, joints.lWrist.y - btnY) < btnRadius * 1.5)
            ? joints.lWrist
            : joints.rWrist;

          if (activeWrist && Math.random() < 0.4) {
            particlesRef.current.push({
              x: activeWrist.x,
              y: activeWrist.y,
              vx: (Math.random() - 0.5) * 3,
              vy: (Math.random() - 0.5) * 3,
              color: "#ffb700",
              alpha: 0.9,
              size: Math.random() * 3 + 1.5,
              life: 0.04
            });
          }

          if (btnHoverProgressRef.current >= 100) {
            // Trigger! Toggle gameMode
            audioSynth.playGoalAchieved();
            
            // Add a burst of particles at the button center
            triggerFireworks(btnX, btnY, colors);

            setGameModeRef.current(!gameModeRef.current);
            btnHoverProgressRef.current = 0; // reset
          }
        } else {
          // Slowly decay progress when not hovered
          btnHoverProgressRef.current = Math.max(0, btnHoverProgressRef.current - 4);
        }

        // Helper for drawing Air Button
        const drawAirButton = (
          ctx: CanvasRenderingContext2D,
          bx: number,
          by: number,
          br: number,
          hovered: boolean,
          progress: number,
          colors: any
        ) => {
          ctx.save();

          const colorActive = "#ffb700";
          const colorNormal = colors.right;
          const colorGlow = hovered ? "rgba(255, 183, 0, 0.4)" : colors.rightGlow;
          const btnColor = hovered ? colorActive : colorNormal;

          // Outer glowing ring
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, 2 * Math.PI);
          ctx.strokeStyle = hovered ? "rgba(255, 183, 0, 0.2)" : "rgba(255, 255, 255, 0.08)";
          ctx.lineWidth = 4;
          ctx.shadowBlur = hovered ? 12 : 0;
          ctx.shadowColor = colorGlow;
          ctx.stroke();

          // Progress Arc
          if (progress > 0) {
            ctx.beginPath();
            ctx.arc(bx, by, br, -0.5 * Math.PI, (-0.5 + 2 * (progress / 100)) * Math.PI);
            ctx.strokeStyle = colorActive;
            ctx.lineWidth = 5;
            ctx.shadowBlur = 10;
            ctx.shadowColor = "rgba(255, 183, 0, 0.6)";
            ctx.stroke();
          }

          // Inner solid circle
          ctx.beginPath();
          ctx.arc(bx, by, br * 0.85, 0, 2 * Math.PI);
          ctx.fillStyle = hovered ? "rgba(255, 183, 0, 0.15)" : "rgba(0, 0, 0, 0.25)";
          ctx.fill();

          // Text Label
          const isGameOn = gameModeRef.current;
          ctx.font = `bold ${br * 0.3}px var(--font-sans)`;
          ctx.fillStyle = btnColor;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          
          if (isGameOn) {
            ctx.fillText("EXIT", bx, by - br * 0.15);
            ctx.font = `bold ${br * 0.22}px var(--font-sans)`;
            ctx.fillText("おわる", bx, by + br * 0.2);
          } else {
            ctx.fillText("PLAY", bx, by - br * 0.15);
            ctx.font = `bold ${br * 0.22}px var(--font-sans)`;
            ctx.fillText("あそぶ", bx, by + br * 0.2);
          }

          ctx.restore();
        };

        // Draw Air Button
        drawAirButton(ctx, btnX, btnY, btnRadius, isHovered, btnHoverProgressRef.current, colors);

        // 1. Calculate Joint Angles
        const angles = {
          lElbow: calculateAngle(joints.lShoulder, joints.lElbow, joints.lWrist),
          rElbow: calculateAngle(joints.rShoulder, joints.rElbow, joints.rWrist),
          lKnee: calculateAngle(joints.lHip, joints.lKnee, joints.lAnkle),
          rKnee: calculateAngle(joints.rHip, joints.rKnee, joints.rAnkle),
        };

        // 2. Trigonometry Stretches Feedback (Ripples & Clicks)
        if (stretchHighlightsRef.current) {
          const checkStretch = (
            angle: number,
            jointPt: any,
            sideKey: "lElbow" | "rElbow" | "lKnee" | "rKnee",
            color: string
          ) => {
            if (!jointPt || jointPt.visibility < 0.6) return;
            const isStraightNow = angle > 166;
            
            if (isStraightNow) {
              // Trigger ripple once on initial transition
              if (!prevStraightRef.current[sideKey]) {
                prevStraightRef.current[sideKey] = true;
                audioSynth.playJointClick(sideKey.startsWith("l") ? 680 : 880);
                
                // Spawn a neon ripple ring
                ripplesRef.current.push({
                  x: jointPt.x,
                  y: jointPt.y,
                  radius: jointRadius,
                  maxRadius: jointRadius * 4,
                  alpha: 0.8,
                  color: color,
                });
              }
            } else if (angle < 140) {
              // Add hysteresis window to prevent rapid clicking toggling
              prevStraightRef.current[sideKey] = false;
            }
          };

          checkStretch(angles.lElbow, joints.lElbow, "lElbow", colors.left);
          checkStretch(angles.rElbow, joints.rElbow, "rElbow", colors.right);
          
          if (autoCalibModeRef.current === "full") {
            checkStretch(angles.lKnee, joints.lKnee, "lKnee", colors.left);
            checkStretch(angles.rKnee, joints.rKnee, "rKnee", colors.right);
          }
        }

        // 3. Update Joint Trails (Speed Responsive)
        if (showTrailsRef.current) {
          updateTrailsWithSpeed(joints);
          drawTrails(ctx, colors, height);
        }

        // 4. Update and Render Ripples & Sparkle Particles
        updateAndDrawRipples(ctx, height);
        updateAndDrawParticles(ctx);

        // 5. Draw Skeleton Bones
        ctx.shadowBlur = 15;
        ctx.lineCap = "round";

        if (joints.lShoulder && joints.rShoulder && joints.lHip && joints.rHip) {
          const neckCenter = {
            x: (joints.lShoulder.x + joints.rShoulder.x) / 2,
            y: (joints.lShoulder.y + joints.rShoulder.y) / 2,
          };
          const pelvisCenter = {
            x: (joints.lHip.x + joints.rHip.x) / 2,
            y: (joints.lHip.y + joints.rHip.y) / 2,
          };

          // Draw center lines
          drawBone(ctx, neckCenter, pelvisCenter, colors.center, colors.centerGlow, boneWidth);
          drawBone(ctx, joints.lShoulder, joints.rShoulder, colors.center, colors.centerGlow, boneWidth);
          drawBone(ctx, joints.lHip, joints.rHip, colors.center, colors.centerGlow, boneWidth);
          if (joints.nose) {
            drawBone(ctx, joints.nose, neckCenter, colors.center, colors.centerGlow, boneWidth);
          }
        }

        // Draw Left Half (Magenta)
        const drawBoneWithHighlight = (p1: any, p2: any, angleCheck: boolean, color: string, glow: string) => {
          if (!p1 || !p2) return;
          const currentBoneWidth = angleCheck && stretchHighlightsRef.current ? boneWidth * 1.8 : boneWidth;
          const currentColor = angleCheck && stretchHighlightsRef.current ? "#ffffff" : color;
          const currentGlow = angleCheck && stretchHighlightsRef.current ? "rgba(255,255,255,0.8)" : glow;
          
          drawBone(ctx, p1, p2, currentColor, currentGlow, currentBoneWidth);
        };

        drawBoneWithHighlight(joints.lShoulder, joints.lElbow, angles.lElbow > 166, colors.left, colors.leftGlow);
        drawBoneWithHighlight(joints.lElbow, joints.lWrist, angles.lElbow > 166, colors.left, colors.leftGlow);
        if (joints.lShoulder && joints.lHip) drawBone(ctx, joints.lShoulder, joints.lHip, colors.left, colors.leftGlow, boneWidth * 0.7);
        drawBoneWithHighlight(joints.lHip, joints.lKnee, angles.lKnee > 166, colors.left, colors.leftGlow);
        drawBoneWithHighlight(joints.lKnee, joints.lAnkle, angles.lKnee > 166, colors.left, colors.leftGlow);

        // Draw Right Half (Cyan)
        drawBoneWithHighlight(joints.rShoulder, joints.rElbow, angles.rElbow > 166, colors.right, colors.rightGlow);
        drawBoneWithHighlight(joints.rElbow, joints.rWrist, angles.rElbow > 166, colors.right, colors.rightGlow);
        if (joints.rShoulder && joints.rHip) drawBone(ctx, joints.rShoulder, joints.rHip, colors.right, colors.rightGlow, boneWidth * 0.7);
        drawBoneWithHighlight(joints.rHip, joints.rKnee, angles.rKnee > 166, colors.right, colors.rightGlow);
        drawBoneWithHighlight(joints.rKnee, joints.rAnkle, angles.rKnee > 166, colors.right, colors.rightGlow);

        // Draw Joint Nodes
        if (joints.nose && joints.nose.visibility > 0.5) {
          drawJoint(ctx, joints.nose, colors.center, colors.centerGlow, jointRadius * 1.5);
        }

        // Draw left joints
        const leftJointItems = [
          { pt: joints.lShoulder, active: false },
          { pt: joints.lElbow, active: angles.lElbow > 166 },
          { pt: joints.lWrist, active: false },
          { pt: joints.lHip, active: false },
          { pt: joints.lKnee, active: angles.lKnee > 166 },
          { pt: joints.lAnkle, active: false },
        ];
        leftJointItems.forEach((item) => {
          if (item.pt && item.pt.visibility > 0.5) {
            const r = item.active && stretchHighlightsRef.current ? jointRadius * 1.5 : jointRadius;
            const col = item.active && stretchHighlightsRef.current ? "#ffffff" : colors.left;
            drawJoint(ctx, item.pt, col, colors.leftGlow, r);
          }
        });

        // Draw right joints
        const rightJointItems = [
          { pt: joints.rShoulder, active: false },
          { pt: joints.rElbow, active: angles.rElbow > 166 },
          { pt: joints.rWrist, active: false },
          { pt: joints.rHip, active: false },
          { pt: joints.rKnee, active: angles.rKnee > 166 },
          { pt: joints.rAnkle, active: false },
        ];
        rightJointItems.forEach((item) => {
          if (item.pt && item.pt.visibility > 0.5) {
            const r = item.active && stretchHighlightsRef.current ? jointRadius * 1.5 : jointRadius;
            const col = item.active && stretchHighlightsRef.current ? "#ffffff" : colors.right;
            drawJoint(ctx, item.pt, col, colors.rightGlow, r);
          }
        });

        // 6. Game Mode Overlay & Posture Checks
        if (gameModeRef.current) {
          if (gameTypeRef.current === "pose") {
            updateAndDrawPoseGame(ctx, joints, width, height, colors, jointRadius, triggerFireworks);
          } else if (gameTypeRef.current === "trace") {
            updateAndDrawTraceGame(ctx, joints, width, height, colors, particlesRef);
          }
        }

        // Reset Gesture Ring
        if (isResettingRef.current && joints.nose) {
          drawResetRing(ctx, joints.nose, height);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Update particles positions and fade
  const updateAndDrawParticles = (ctx: CanvasRenderingContext2D) => {
    const particles = particlesRef.current;
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

  // Update expanding ripples
  const updateAndDrawRipples = (ctx: CanvasRenderingContext2D, height: number) => {
    const ripples = ripplesRef.current;
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

  // Helper: Draw single skeleton bone segment
  const drawBone = (
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

  // Helper: Draw single joint node
  const drawJoint = (
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

  // Update trail queues and calculate velocity values
  const updateTrailsWithSpeed = (joints: any) => {
    const now = Date.now();
    const updateJointTrail = (
      joint: any,
      trailRef: React.MutableRefObject<Point2D[]>,
      speedRef: React.MutableRefObject<number>
    ) => {
      if (joint && joint.visibility > 0.7) {
        const lastPt = trailRef.current[trailRef.current.length - 1];
        if (lastPt) {
          const dx = joint.x - lastPt.x;
          const dy = joint.y - lastPt.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          speedRef.current = distance; // pixels moved this frame
        } else {
          speedRef.current = 0;
        }

        trailRef.current.push({ x: joint.x, y: joint.y, time: now });
        if (trailRef.current.length > TRAIL_MAX_POINTS) {
          trailRef.current.shift();
        }
      } else {
        if (trailRef.current.length > 0) {
          trailRef.current.shift();
        }
        speedRef.current = 0;
      }
    };

    updateJointTrail(joints.lWrist, leftWristTrail, leftWristSpeed);
    updateJointTrail(joints.rWrist, rightWristTrail, rightWristSpeed);
    updateJointTrail(joints.lAnkle, leftAnkleTrail, leftAnkleSpeed);
    updateJointTrail(joints.rAnkle, rightAnkleTrail, rightAnkleSpeed);
  };

  // Draw extremity trails ribbons with velocity feedback
  const drawTrails = (ctx: CanvasRenderingContext2D, colors: any, height: number) => {
    const drawSingleTrail = (trail: Point2D[], speed: number, color: string, glowColor: string) => {
      if (trail.length < 2) return;

      const isFast = speed > 10;
      // If moving quickly, blend the trail color with gold/white
      const ribbonColor = isFast ? "#ffffff" : color;
      const ribbonGlow = isFast ? "rgba(255, 255, 255, 0.7)" : glowColor;

      ctx.save();
      ctx.shadowBlur = isFast ? 18 : 10;
      ctx.shadowColor = ribbonGlow;

      // Draw trail particles
      for (let i = 0; i < trail.length; i++) {
        const pt = trail[i];
        const opacity = (i + 1) / trail.length;
        const size = (height * 0.007) * opacity * (isFast ? 1.4 : 1.0);

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = ribbonColor;
        ctx.globalAlpha = opacity * 0.45;
        ctx.fill();

        // High speed sparks particles spawning along trails
        if (isFast && i === trail.length - 1) {
          triggerTrailSparkles(pt.x, pt.y, color, speed);
        }

        // Spiral secondary particle DNA tracer
        if (i > 0 && i % 3 === 0) {
          const angle = (pt.time / 130) + (i * 0.5);
          const offset = size * (isFast ? 2.8 : 2.2);
          const spiralX = pt.x + Math.cos(angle) * offset;
          const spiralY = pt.y + Math.sin(angle) * offset;

          ctx.beginPath();
          ctx.arc(spiralX, spiralY, size * 0.35, 0, 2 * Math.PI);
          ctx.fillStyle = "#ffffff";
          ctx.globalAlpha = opacity * 0.6;
          ctx.fill();
        }
      }

      // Draw ribbon connecting line
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) {
        const xc = (trail[i].x + trail[i - 1].x) / 2;
        const yc = (trail[i].y + trail[i - 1].y) / 2;
        ctx.quadraticCurveTo(trail[i - 1].x, trail[i - 1].y, xc, yc);
      }
      ctx.lineWidth = height * (isFast ? 0.004 : 0.0025);
      ctx.strokeStyle = ribbonColor;
      ctx.globalAlpha = 0.5;
      ctx.stroke();

      ctx.restore();
    };

    drawSingleTrail(leftWristTrail.current, leftWristSpeed.current, colors.left, colors.leftGlow);
    drawSingleTrail(rightWristTrail.current, rightWristSpeed.current, colors.right, colors.rightGlow);
    drawSingleTrail(leftAnkleTrail.current, leftAnkleSpeed.current, colors.left, colors.leftGlow);
    drawSingleTrail(rightAnkleTrail.current, rightAnkleSpeed.current, colors.right, colors.rightGlow);
  };

  // Calibration state checkers
  const handleCalibrationCheck = (pose: any) => {
    if (calibratedRef.current) return;

    const requiredIndices = autoCalibModeRef.current === "full" 
      ? [11, 12, 23, 24, 25, 26, 27, 28] 
      : [11, 12, 23, 24];

    const allVisible = requiredIndices.every((idx) => {
      const pt = pose[idx];
      return pt && pt.visibility > 0.65;
    });

    if (allVisible) {
      if (!isCalibratingRef.current) {
        isCalibratingRef.current = true;
        calibStartTimeRef.current = Date.now();
        audioSynth.playCalibrationStart();
        
        if (calibrationTimerRef.current) clearInterval(calibrationTimerRef.current);
        
        calibrationTimerRef.current = window.setInterval(() => {
          const elapsed = Date.now() - calibStartTimeRef.current;
          const progress = Math.min(100, (elapsed / 3000) * 100);
          calibrationProgressRef.current = progress;

          if (elapsed >= 3000) {
            clearInterval(calibrationTimerRef.current!);
            calibrationTimerRef.current = null;
            isCalibratingRef.current = false;
            calibrationProgressRef.current = 0;
            setCalibratedRef.current(true);
            audioSynth.playCalibrationSuccess();
          }
        }, 50);
      }
    } else {
      cancelCalibration();
    }
  };

  const cancelCalibration = () => {
    if (isCalibratingRef.current) {
      isCalibratingRef.current = false;
      if (calibrationTimerRef.current) {
        clearInterval(calibrationTimerRef.current);
        calibrationTimerRef.current = null;
      }
      calibrationProgressRef.current = 0;
    }
  };

  // Reset Gesture checks
  const handleResetCheck = (pose: any) => {
    if (!calibratedRef.current) return;

    const lWrist = pose[15];
    const rWrist = pose[16];
    const nose = pose[0];
    const lEye = pose[2];
    const rEye = pose[5];
    
    const headTopY = nose && lEye && rEye 
      ? Math.min(nose.y, lEye.y, rEye.y) 
      : 0.2;

    const isWristAboveHead = (wrist: any) => {
      return wrist && wrist.visibility > 0.65 && wrist.y < headTopY - 0.08;
    };

    const isResetGestureActive = isWristAboveHead(lWrist) && isWristAboveHead(rWrist);

    if (isResetGestureActive) {
      if (!isResettingRef.current) {
        isResettingRef.current = true;
        resetStartTimeRef.current = Date.now();

        if (resetTimerRef.current) clearInterval(resetTimerRef.current);
        
        resetTimerRef.current = window.setInterval(() => {
          const elapsed = Date.now() - resetStartTimeRef.current;
          const progress = Math.min(100, (elapsed / 1500) * 100);
          resetProgressRef.current = progress;

          if (elapsed >= 1500) {
            clearInterval(resetTimerRef.current!);
            resetTimerRef.current = null;
            isResettingRef.current = false;
            resetProgressRef.current = 0;
            
            audioSynth.playReset();
            onResetTriggeredRef.current();
            setCalibratedRef.current(false);
          }
        }, 50);
      }
    } else {
      cancelReset();
    }
  };

  const cancelReset = () => {
    if (isResettingRef.current) {
      isResettingRef.current = false;
      if (resetTimerRef.current) {
        clearInterval(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      resetProgressRef.current = 0;
    }
  };

  // Outer calibration overlays
  const drawCalibrationOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const isCalibActive = isCalibratingRef.current;
    
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = isCalibActive ? "rgba(0, 240, 255, 0.2)" : "rgba(255, 255, 255, 0.08)";
    ctx.setLineDash([8, 8]);
    ctx.strokeRect(30, 30, width - 60, height - 60);

    if (isCalibActive) {
      const centerX = width / 2;
      const centerY = height * 0.45;
      const radius = height * 0.12;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(0, 240, 255, 0.1)";
      ctx.lineWidth = height * 0.015;
      ctx.setLineDash([]);
      ctx.stroke();

      ctx.beginPath();
      const startAngle = -0.5 * Math.PI;
      const endAngle = startAngle + (2 * Math.PI * (calibrationProgressRef.current / 100));
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.strokeStyle = "var(--color-right)";
      ctx.lineWidth = height * 0.01;
      ctx.shadowBlur = 15;
      ctx.shadowColor = "var(--color-right-glow)";
      ctx.stroke();

      const countdownSec = Math.ceil(3 - (3 * (calibrationProgressRef.current / 100)));
      ctx.font = `bold ${height * 0.07}px var(--font-sans)`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(0, 240, 255, 0.4)";
      ctx.fillText(String(countdownSec), centerX, centerY);
    } else {
      const centerX = width / 2;
      const centerY = height * 0.45;
      const scale = height * 0.15;
      
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      
      ctx.beginPath();
      ctx.arc(centerX, centerY - scale * 0.35, scale * 0.2, 0, 2 * Math.PI);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(centerX - scale * 0.6, centerY + scale * 0.2);
      ctx.lineTo(centerX + scale * 0.6, centerY + scale * 0.2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(centerX - scale * 0.3, centerY + scale * 0.2);
      ctx.lineTo(centerX - scale * 0.3, centerY + scale * 0.8);
      ctx.moveTo(centerX + scale * 0.3, centerY + scale * 0.2);
      ctx.lineTo(centerX + scale * 0.3, centerY + scale * 0.8);
      ctx.stroke();
    }

    ctx.restore();
  };

  const drawResetRing = (ctx: CanvasRenderingContext2D, nose: any, height: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(nose.x, nose.y, height * 0.05, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(255, 0, 127, 0.15)";
    ctx.lineWidth = height * 0.008;
    ctx.stroke();

    ctx.beginPath();
    const startAngle = -0.5 * Math.PI;
    const endAngle = startAngle + (2 * Math.PI * (resetProgressRef.current / 100));
    ctx.arc(nose.x, nose.y, height * 0.05, startAngle, endAngle);
    ctx.strokeStyle = "var(--color-left)";
    ctx.lineWidth = height * 0.006;
    ctx.shadowBlur = 10;
    ctx.shadowColor = "var(--color-left-glow)";
    ctx.stroke();

    ctx.font = `bold ${height * 0.015}px var(--font-sans)`;
    ctx.fillStyle = "var(--color-left)";
    ctx.textAlign = "center";
    ctx.fillText("RESETTING", nose.x, nose.y - height * 0.07);

    ctx.restore();
  };



  return (
    <div className="app-container" ref={containerRef}>
      {/* Dynamic Game Title Overlay inside Canvas viewport */}
      {calibrated && gameMode && gameType === "pose" && currentPose && (
        <div style={{
          position: "absolute",
          top: 76,
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily: "var(--font-sans)",
          textAlign: "center",
          zIndex: 5,
          pointerEvents: "none"
        }}>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#ffb700",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            marginBottom: 2
          }}>
            POSE MATCHING GAME
          </div>
          <div style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#ffffff",
            textShadow: "0 0 10px rgba(255, 255, 255, 0.2)"
          }}>
            {currentPose.japaneseName}
          </div>
          <div style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginTop: 4
          }}>
            {currentPose.description}
          </div>
        </div>
      )}

      {/* Slow Trace Mode instruction overlay */}
      {calibrated && gameMode && gameType === "trace" && (
        <div style={{
          position: "absolute",
          top: 76,
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily: "var(--font-sans)",
          textAlign: "center",
          zIndex: 5,
          pointerEvents: "none"
        }}>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: traceHand === "right" ? "var(--color-right)" : "var(--color-left)",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            marginBottom: 2
          }}>
            SLOW TRACE GAME / イライラ棒
          </div>
          <div style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#ffffff",
            textShadow: "0 0 10px rgba(255, 255, 255, 0.2)"
          }}>
            {tracePathType === "horizontal" && "まっすぐ線（よこ）"}
            {tracePathType === "vertical" && "まっすぐ線（たて）"}
            {tracePathType === "sine" && "なみの線"}
            {tracePathType === "circle" && "まるい線"}
          </div>
          <div style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginTop: 4
          }}>
            {traceHand === "right" ? "右手" : "左手"}で光の球をゆっくりおいかけてね！
          </div>
        </div>
      )}
      <canvas className="render-canvas" ref={canvasRef} />
    </div>
  );
};
export default BodyCanvas;
