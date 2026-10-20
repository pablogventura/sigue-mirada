export interface FaceReference {
  mirroredMidX: number;
  imageMidY: number;
  eyeSpan: number;
  distanceM: number;
}

export interface HeadMeasurement {
  detected: boolean;
  offsetXM: number;
  offsetYM: number;
  distanceM: number;
  yawRad: number;
  pitchRad: number;
  rollRad: number;
  landmarks: ReadonlyArray<{ readonly x: number; readonly y: number }> | null;
}

export interface EyePosition {
  x: number;
  y: number;
  z: number;
}

export function createEmptyMeasurement(): HeadMeasurement {
  return {
    detected: false,
    offsetXM: 0,
    offsetYM: 0,
    distanceM: 0.6,
    yawRad: 0,
    pitchRad: 0,
    rollRad: 0,
    landmarks: null,
  };
}
