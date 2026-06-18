import { useState, useRef } from "react";
import { audioSynth } from "../../utils/audioSynth";
import { calculateAngle } from "../../utils/canvasDraw";

export interface Pose {
  name: string;
  japaneseName: string;
  description: string;
  checkMatch: (joints: any, height: number, width: number) => boolean;
  drawSilhouette: (ctx: CanvasRenderingContext2D, width: number, height: number, color: string) => void;
}

const gamePoses: Pose[] = [
  {
    name: "T-POSE",
    japaneseName: "Tのポーズ",
    description: "両うでをヨコにまっすぐ広げてね！",
    checkMatch: (joints: any, _height: number) => {
      if (!joints.lShoulder || !joints.rShoulder || !joints.lElbow || !joints.rElbow || !joints.lWrist || !joints.rWrist) return false;
      
      // Calculate arm straightness
      const lAngle = calculateAngle(joints.lShoulder, joints.lElbow, joints.lWrist);
      const rAngle = calculateAngle(joints.rShoulder, joints.rElbow, joints.rWrist);

      // Use shoulder width as a dynamic reference to scale matching thresholds
      const shoulderDist = Math.hypot(
        joints.lShoulder.x - joints.rShoulder.x,
        joints.lShoulder.y - joints.rShoulder.y
      );
      if (shoulderDist < 10) return false;

      // Check if wrists are horizontal relative to shoulders (scaled dynamically)
      const lHoriz = Math.abs(joints.lWrist.y - joints.lShoulder.y) < shoulderDist * 0.6;
      const rHoriz = Math.abs(joints.rWrist.y - joints.rShoulder.y) < shoulderDist * 0.6;

      return lAngle > 158 && rAngle > 158 && lHoriz && rHoriz;
    },
    drawSilhouette: (ctx: CanvasRenderingContext2D, width: number, height: number, color: string) => {
      const cX = width / 2;
      const sY = height * 0.38;
      const armL = width * 0.25;
      const spineL = height * 0.35;

      ctx.beginPath();
      // Arms
      ctx.moveTo(cX - armL, sY);
      ctx.lineTo(cX + armL, sY);
      // Spine
      ctx.moveTo(cX, sY);
      ctx.lineTo(cX, sY + spineL);
      // Hips
      ctx.moveTo(cX - width * 0.06, sY + spineL);
      ctx.lineTo(cX + width * 0.06, sY + spineL);
      // Legs
      ctx.moveTo(cX - width * 0.04, sY + spineL);
      ctx.lineTo(cX - width * 0.04, sY + spineL + height * 0.2);
      ctx.moveTo(cX + width * 0.04, sY + spineL);
      ctx.lineTo(cX + width * 0.04, sY + spineL + height * 0.2);
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();

      // Draw node guides
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cX - armL, sY, 8, 0, 2 * Math.PI);
      ctx.arc(cX + armL, sY, 8, 0, 2 * Math.PI);
      ctx.arc(cX, sY - 40, 15, 0, 2 * Math.PI); // head
      ctx.fill();
    }
  },
  {
    name: "STAR POSE",
    japaneseName: "星のポーズ",
    description: "手足を大きく広げて、お星さまになろう！",
    checkMatch: (joints: any, _height: number, _width: number) => {
      if (!joints.lShoulder || !joints.rShoulder || !joints.lWrist || !joints.rWrist || !joints.lAnkle || !joints.rAnkle) return false;
      
      // Use shoulder width as a dynamic reference to scale matching thresholds
      const shoulderDist = Math.hypot(
        joints.lShoulder.x - joints.rShoulder.x,
        joints.lShoulder.y - joints.rShoulder.y
      );
      if (shoulderDist < 10) return false;

      // Wrists above shoulders (scaled dynamically)
      const lHigh = joints.lWrist.y < joints.lShoulder.y - shoulderDist * 0.45;
      const rHigh = joints.rWrist.y < joints.rShoulder.y - shoulderDist * 0.45;
      
      // Legs spread wide (scaled dynamically relative to shoulder width)
      const legsWide = Math.abs(joints.lAnkle.x - joints.rAnkle.x) > shoulderDist * 1.3;

      return lHigh && rHigh && legsWide;
    },
    drawSilhouette: (ctx: CanvasRenderingContext2D, width: number, height: number, color: string) => {
      const cX = width / 2;
      const sY = height * 0.38;
      const spineL = height * 0.35;

      ctx.beginPath();
      // Left Arm raised
      ctx.moveTo(cX, sY);
      ctx.lineTo(cX - width * 0.18, sY - height * 0.15);
      // Right Arm raised
      ctx.moveTo(cX, sY);
      ctx.lineTo(cX + width * 0.18, sY - height * 0.15);
      // Spine
      ctx.moveTo(cX, sY);
      ctx.lineTo(cX, sY + spineL);
      // Left Leg wide
      ctx.moveTo(cX, sY + spineL);
      ctx.lineTo(cX - width * 0.16, sY + spineL + height * 0.2);
      // Right Leg wide
      ctx.moveTo(cX, sY + spineL);
      ctx.lineTo(cX + width * 0.16, sY + spineL + height * 0.2);

      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cX - width * 0.18, sY - height * 0.15, 8, 0, 2 * Math.PI);
      ctx.arc(cX + width * 0.18, sY - height * 0.15, 8, 0, 2 * Math.PI);
      ctx.arc(cX, sY - 40, 15, 0, 2 * Math.PI); // head
      ctx.fill();
    }
  },
  {
    name: "FLAMINGO",
    japaneseName: "フラミンゴのポーズ",
    description: "片足で立って、もう片方のヒザを曲げてキープしてね！",
    checkMatch: (joints: any, _height: number) => {
      if (!joints.lHip || !joints.rHip || !joints.lKnee || !joints.rKnee || !joints.lAnkle || !joints.rAnkle || !joints.lShoulder || !joints.rShoulder) return false;
      
      const lKneeAngle = calculateAngle(joints.lHip, joints.lKnee, joints.lAnkle);
      const rKneeAngle = calculateAngle(joints.rHip, joints.rKnee, joints.rAnkle);

      // Use shoulder width as a dynamic reference to scale matching thresholds
      const shoulderDist = Math.hypot(
        joints.lShoulder.x - joints.rShoulder.x,
        joints.lShoulder.y - joints.rShoulder.y
      );
      if (shoulderDist < 10) return false;

      // One leg straight, other leg bent and ankle raised (scaled dynamically relative to shoulder width)
      const leftLegBent = lKneeAngle < 110 && joints.lAnkle.y < joints.rAnkle.y - shoulderDist * 0.4 && rKneeAngle > 155;
      const rightLegBent = rKneeAngle < 110 && joints.rAnkle.y < joints.lAnkle.y - shoulderDist * 0.4 && lKneeAngle > 155;

      return leftLegBent || rightLegBent;
    },
    drawSilhouette: (ctx: CanvasRenderingContext2D, width: number, height: number, color: string) => {
      const cX = width / 2;
      const sY = height * 0.38;
      const spineL = height * 0.35;

      ctx.beginPath();
      // Arms slightly low
      ctx.moveTo(cX - width * 0.15, sY + height * 0.05);
      ctx.lineTo(cX, sY);
      ctx.lineTo(cX + width * 0.15, sY + height * 0.05);
      // Spine
      ctx.moveTo(cX, sY);
      ctx.lineTo(cX, sY + spineL);
      // Left Leg straight
      ctx.moveTo(cX - width * 0.02, sY + spineL);
      ctx.lineTo(cX - width * 0.02, sY + spineL + height * 0.2);
      // Right Leg bent triangularly
      ctx.moveTo(cX + width * 0.02, sY + spineL);
      ctx.lineTo(cX + width * 0.1, sY + spineL + height * 0.08); // knee
      ctx.lineTo(cX + width * 0.02, sY + spineL + height * 0.08); // foot resting

      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cX, sY - 40, 15, 0, 2 * Math.PI); // head
      ctx.fill();
    }
  },
  {
    name: "ARCHER",
    japaneseName: "弓矢のポーズ",
    description: "片うでをまっすぐ伸ばし、もう片方のうでをグッと引いてね！",
    checkMatch: (joints: any, _height: number) => {
      if (!joints.lShoulder || !joints.rShoulder || !joints.lElbow || !joints.rElbow || !joints.lWrist || !joints.rWrist) return false;

      const lArmAngle = calculateAngle(joints.lShoulder, joints.lElbow, joints.lWrist);
      const rArmAngle = calculateAngle(joints.rShoulder, joints.rElbow, joints.rWrist);

      // Use shoulder width as a dynamic reference to scale matching thresholds
      const shoulderDist = Math.hypot(
        joints.lShoulder.x - joints.rShoulder.x,
        joints.lShoulder.y - joints.rShoulder.y
      );
      if (shoulderDist < 10) return false;

      // Archer Left: Left fully straight, Right arm bent near shoulder (scaled dynamically)
      const archerLeft = lArmAngle > 160 && rArmAngle < 110 && Math.abs(joints.lWrist.y - joints.lShoulder.y) < shoulderDist * 0.6;
      // Archer Right: Right fully straight, Left arm bent near shoulder (scaled dynamically)
      const archerRight = rArmAngle > 160 && lArmAngle < 110 && Math.abs(joints.rWrist.y - joints.rShoulder.y) < shoulderDist * 0.6;

      return archerLeft || archerRight;
    },
    drawSilhouette: (ctx: CanvasRenderingContext2D, width: number, height: number, color: string) => {
      const cX = width / 2;
      const sY = height * 0.38;
      const spineL = height * 0.35;

      ctx.beginPath();
      // Left Arm extended straight
      ctx.moveTo(cX, sY);
      ctx.lineTo(cX - width * 0.25, sY);
      // Right Arm pulled back
      ctx.moveTo(cX, sY);
      ctx.lineTo(cX + width * 0.08, sY - height * 0.04);
      ctx.lineTo(cX + width * 0.05, sY + height * 0.06);
      // Spine
      ctx.moveTo(cX, sY);
      ctx.lineTo(cX, sY + spineL);
      // Legs standing
      ctx.moveTo(cX - width * 0.05, sY + spineL);
      ctx.lineTo(cX - width * 0.05, sY + spineL + height * 0.2);
      ctx.moveTo(cX + width * 0.05, sY + spineL);
      ctx.lineTo(cX + width * 0.05, sY + spineL + height * 0.2);

      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cX - width * 0.25, sY, 8, 0, 2 * Math.PI); // left wrist
      ctx.arc(cX + width * 0.05, sY + height * 0.06, 8, 0, 2 * Math.PI); // right wrist
      ctx.arc(cX, sY - 40, 15, 0, 2 * Math.PI); // head
      ctx.fill();
    }
  }
];

interface UsePoseMatchingGameProps {
  autoCalibMode: "full" | "upper";
}

export const usePoseMatchingGame = ({ autoCalibMode }: UsePoseMatchingGameProps) => {
  const [activePoseIndex, setActivePoseIndex] = useState<number>(0);
  const matchProgressRef = useRef<number>(0); // 0 to 100
  const isMatchingRef = useRef<boolean>(false);
  const matchStartRef = useRef<number>(0);

  const getActivePoses = () => {
    if (autoCalibMode === "upper") {
      // Exclude Flamingo pose which requires ankle balance tracking
      return gamePoses.filter(pose => pose.name !== "FLAMINGO");
    }
    return gamePoses;
  };

  const reset = () => {
    setActivePoseIndex(0);
    matchProgressRef.current = 0;
    isMatchingRef.current = false;
  };

  const updateAndDrawPoseGame = (
    ctx: CanvasRenderingContext2D,
    joints: any,
    width: number,
    height: number,
    colors: any,
    jointRadius: number,
    triggerFireworks: (centerX: number, centerY: number, colors: any) => void
  ) => {
    const activePoses = getActivePoses();
    const currentPose = activePoses[activePoseIndex];
    if (!currentPose) return;

    // Draw target dotted silhouette
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(255, 255, 255, 0.15)";
    
    const isMatchActive = currentPose.checkMatch(joints, height, width);
    const silhouetteColor = isMatchActive ? "#ffb700" : "rgba(255, 255, 255, 0.18)";
    
    currentPose.drawSilhouette(ctx, width, height, silhouetteColor);
    ctx.restore();

    // Render matching progress circular ring
    if (isMatchActive) {
      if (!isMatchingRef.current) {
        isMatchingRef.current = true;
        matchStartRef.current = Date.now();
      }

      const elapsed = Date.now() - matchStartRef.current;
      const progress = Math.min(100, (elapsed / 1200) * 100); // 1.2 seconds hold
      matchProgressRef.current = progress;

      if (elapsed >= 1200) {
        // Target Matched! Play fanfare, burst fireworks, next pose
        audioSynth.playPoseClear();
        if (joints.nose) {
          triggerFireworks(joints.nose.x, joints.nose.y, colors);
        } else {
          triggerFireworks(width / 2, height * 0.4, colors);
        }

        // Advance index
        setActivePoseIndex((prev) => (prev + 1) % activePoses.length);
        matchProgressRef.current = 0;
        isMatchingRef.current = false;
      }
    } else {
      // Decay progress slowly if wobbly
      if (isMatchingRef.current) {
        const elapsed = Date.now() - matchStartRef.current;
        if (elapsed < 100) {
          isMatchingRef.current = false;
          matchProgressRef.current = 0;
        } else {
          matchProgressRef.current = Math.max(0, matchProgressRef.current - 4);
          if (matchProgressRef.current === 0) {
            isMatchingRef.current = false;
          }
        }
      }
    }

    // Draw progress ring around nose/head
    if (matchProgressRef.current > 0 && joints.nose) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(joints.nose.x, joints.nose.y, jointRadius * 2.2, -0.5 * Math.PI, (-0.5 + 2 * (matchProgressRef.current / 100)) * Math.PI);
      ctx.strokeStyle = "#ffb700";
      ctx.lineWidth = height * 0.005;
      ctx.shadowBlur = 10;
      ctx.shadowColor = "rgba(255, 183, 0, 0.6)";
      ctx.stroke();
      ctx.restore();
    }
  };

  const activePoses = getActivePoses();
  const currentPose = activePoses[activePoseIndex];

  return {
    activePoseIndex,
    currentPose,
    matchProgress: matchProgressRef.current,
    reset,
    updateAndDrawPoseGame
  };
};
export default usePoseMatchingGame;
