import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { FaceReference, HeadMeasurement } from "./types";

/** MediaPipe face mesh indices. 33/263 are the outer eye corners. */
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN = 152;
const RIGHT_EYE_OUTER = 33;
const LEFT_EYE_OUTER = 263;
const RIGHT_CHEEK = 234;
const LEFT_CHEEK = 454;

/** Typical laptop webcam horizontal field of view. */
const CAMERA_HORIZONTAL_FOV_RAD = (68 * Math.PI) / 180;
/** Eyes sit about this far in front of the head's rotation center. */
const ORBIT_RADIUS_M = 0.09;
const MIN_COS_YAW = 0.35;

function distance2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Converts landmarks into a translation relative to the calibrated face.
 * Yaw and pitch come from distance ratios, which stay put when the whole
 * face slides in the image, and that rotation is then removed from the
 * eye midpoint so a turn is not reported as a sideways move.
 */
export function measureFace(
  landmarks: NormalizedLandmark[],
  reference: FaceReference,
  videoAspect: number,
  includeLandmarks: boolean,
): HeadMeasurement {
  const rightEye = landmarks[RIGHT_EYE_OUTER];
  const leftEye = landmarks[LEFT_EYE_OUTER];
  const nose = landmarks[NOSE_TIP];
  const forehead = landmarks[FOREHEAD];
  const chin = landmarks[CHIN];
  const rightCheek = landmarks[RIGHT_CHEEK];
  const leftCheek = landmarks[LEFT_CHEEK];

  if (!rightEye || !leftEye || !nose || !forehead || !chin || !rightCheek || !leftCheek) {
    return {
      detected: false,
      offsetXM: 0,
      offsetYM: 0,
      distanceM: reference.distanceM,
      yawRad: 0,
      pitchRad: 0,
      rollRad: 0,
      landmarks: null,
    };
  }

  // Unmirrored webcam: the user's right is the left side of the image.
  const mirroredMidX = (2 - rightEye.x - leftEye.x) / 2;
  const imageMidY = (rightEye.y + leftEye.y) / 2;
  const eyeSpan = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);

  const cheekRight = distance2D(rightCheek, nose);
  const cheekLeft = distance2D(leftCheek, nose);
  const yawRad = Math.atan2(cheekLeft - cheekRight, cheekLeft + cheekRight);

  const foreheadSpan = distance2D(forehead, nose);
  const chinSpan = distance2D(chin, nose);
  const pitchRad = Math.atan2(chinSpan - foreheadSpan, chinSpan + foreheadSpan);

  const rollRad = Math.atan2(leftEye.y - rightEye.y, leftEye.x - rightEye.x);

  const eyeSpanCorrected = eyeSpan / Math.max(MIN_COS_YAW, Math.cos(yawRad));
  const distanceM = reference.distanceM * (reference.eyeSpan / Math.max(eyeSpanCorrected, 1e-4));

  const halfWidth = Math.tan(CAMERA_HORIZONTAL_FOV_RAD / 2);
  const verticalFovRad = 2 * Math.atan(halfWidth / Math.max(videoAspect, 0.1));
  const imageWidthM = distanceM * 2 * halfWidth;
  const imageHeightM = distanceM * 2 * Math.tan(verticalFovRad / 2);

  // Positive yaw turns the face to the user's right and swings the eyes left
  // around a pivot behind them. Add that swing back to recover translation.
  const correctedMidX = mirroredMidX + (Math.sin(yawRad) * ORBIT_RADIUS_M) / imageWidthM;
  const correctedMidY = imageMidY + (Math.sin(pitchRad) * ORBIT_RADIUS_M) / imageHeightM;

  const offsetXM = (correctedMidX - reference.mirroredMidX) * imageWidthM;
  const offsetYM = -(correctedMidY - reference.imageMidY) * imageHeightM;

  return {
    detected: true,
    offsetXM,
    offsetYM,
    distanceM,
    yawRad,
    pitchRad,
    rollRad,
    landmarks: includeLandmarks ? landmarks.map((point) => ({ x: point.x, y: point.y })) : null,
  };
}

export function referenceFromLandmarks(
  landmarks: NormalizedLandmark[],
  distanceM: number,
): FaceReference | null {
  const rightEye = landmarks[RIGHT_EYE_OUTER];
  const leftEye = landmarks[LEFT_EYE_OUTER];
  if (!rightEye || !leftEye) return null;
  const eyeSpan = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  if (eyeSpan < 0.01) return null;
  return {
    mirroredMidX: (2 - rightEye.x - leftEye.x) / 2,
    imageMidY: (rightEye.y + leftEye.y) / 2,
    eyeSpan,
    distanceM,
  };
}
