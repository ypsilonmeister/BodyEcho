// Pure canvas drawing helpers extracted from BodyCanvas.
// These take a 2D context plus plain arguments and hold no component state.

// Vector angle calculation helper (used by skeleton drawing and game hooks)
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

// Draw a single skeleton bone segment
export const drawBone = (
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

// Draw a single joint node (glowing dot with white core)
export const drawJoint = (
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
