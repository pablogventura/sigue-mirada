import { clamp } from "../math/clamp";
import { createEmptyMeasurement, type EyePosition, type HeadMeasurement } from "./types";

export type PoseSource = "idle" | "mouse" | "head";

const HOLD_LOST_FACE_MS = 400;
const RETURN_LOST_FACE_MS = 700;
const DEADZONE_M = 0.0015;
const LIMIT_X_M = 0.35;
const LIMIT_Y_M = 0.25;
const MIN_DISTANCE_M = 0.3;
const MAX_DISTANCE_M = 1.4;
const MOUSE_RANGE_M = 0.2;
const MAX_DELTA_SECONDS = 0.05;

/**
 * Smooths raw head or mouse samples into a stable eye position.
 * Z uses a longer time constant because face size is noisier than the
 * eye midpoint. A small dead zone keeps a still head from drifting.
 */
export class HeadPoseFilter {
  sensitivity = 1;
  private smoothingTauSeconds = 0.09;
  private readonly zTauFactor = 2.2;

  private neutralZ = 0.6;
  private readonly eye: EyePosition = { x: 0, y: 0, z: 0.6 };
  private readonly target: EyePosition = { x: 0, y: 0, z: 0.6 };
  private readonly held: EyePosition = { x: 0, y: 0, z: 0.6 };

  private source: PoseSource = "idle";
  private lostMs = 0;
  private mouseX = 0;
  private mouseY = 0;
  private mouseZ = 0.6;
  private measurement: HeadMeasurement = createEmptyMeasurement();

  get position(): EyePosition {
    return this.eye;
  }

  get activeSource(): PoseSource {
    return this.source;
  }

  setSmoothing(amount: number): void {
    const normalized = clamp(amount, 0, 1);
    this.smoothingTauSeconds = 0.02 + normalized * 0.26;
  }

  setNeutralDistance(distanceM: number): void {
    this.neutralZ = clamp(distanceM, MIN_DISTANCE_M, MAX_DISTANCE_M);
    this.mouseZ = this.neutralZ;
    if (this.source !== "head") {
      this.target.z = this.neutralZ;
    }
    if (this.source === "idle") {
      this.eye.x = 0;
      this.eye.y = 0;
      this.eye.z = this.neutralZ;
      this.target.x = 0;
      this.target.y = 0;
      this.target.z = this.neutralZ;
    }
  }

  setSource(source: PoseSource): void {
    if (source === this.source) return;
    this.source = source;
    this.lostMs = 0;
    if (source === "idle") {
      this.target.x = 0;
      this.target.y = 0;
      this.target.z = this.neutralZ;
    }
    if (source === "mouse") {
      this.mouseZ = this.neutralZ;
      this.target.z = this.neutralZ;
    }
  }

  setMouse(normalizedX: number, normalizedY: number): void {
    this.mouseX = clamp(normalizedX, -1, 1) * MOUSE_RANGE_M;
    this.mouseY = clamp(normalizedY, -1, 1) * MOUSE_RANGE_M;
  }

  addMouseWheel(deltaY: number): void {
    this.mouseZ = clamp(this.mouseZ + deltaY * 0.00035, MIN_DISTANCE_M, MAX_DISTANCE_M);
  }

  pushMeasurement(measurement: HeadMeasurement): void {
    this.measurement = measurement;
  }

  update(deltaSeconds: number): void {
    const dt = clamp(deltaSeconds, 0, MAX_DELTA_SECONDS);
    this.updateTarget(dt);
    this.smoothAxis("x", dt, this.smoothingTauSeconds);
    this.smoothAxis("y", dt, this.smoothingTauSeconds);
    this.smoothAxis("z", dt, this.smoothingTauSeconds * this.zTauFactor);
  }

  private updateTarget(dt: number): void {
    if (this.source === "idle") {
      this.target.x = 0;
      this.target.y = 0;
      this.target.z = this.neutralZ;
      return;
    }

    if (this.source === "mouse") {
      const gain = this.sensitivity;
      this.target.x = clamp(this.mouseX * gain, -LIMIT_X_M, LIMIT_X_M);
      this.target.y = clamp(this.mouseY * gain, -LIMIT_Y_M, LIMIT_Y_M);
      this.target.z = clamp(this.neutralZ + (this.mouseZ - this.neutralZ) * gain, MIN_DISTANCE_M, MAX_DISTANCE_M);
      return;
    }

    if (!this.measurement.detected) {
      this.lostMs += dt * 1000;
      if (this.lostMs < HOLD_LOST_FACE_MS) return;
      const blend = clamp((this.lostMs - HOLD_LOST_FACE_MS) / RETURN_LOST_FACE_MS, 0, 1);
      const eased = blend * blend * (3 - 2 * blend);
      this.target.x = this.held.x * (1 - eased);
      this.target.y = this.held.y * (1 - eased);
      this.target.z = this.held.z + (this.neutralZ - this.held.z) * eased;
      return;
    }

    this.lostMs = 0;
    const gain = this.sensitivity;
    const desiredX = clamp(this.measurement.offsetXM * gain, -LIMIT_X_M, LIMIT_X_M);
    const desiredY = clamp(this.measurement.offsetYM * gain, -LIMIT_Y_M, LIMIT_Y_M);
    const desiredZ = clamp(
      this.neutralZ + (this.measurement.distanceM - this.neutralZ) * gain,
      MIN_DISTANCE_M,
      MAX_DISTANCE_M,
    );
    this.target.x = Math.abs(desiredX - this.target.x) < DEADZONE_M ? this.target.x : desiredX;
    this.target.y = Math.abs(desiredY - this.target.y) < DEADZONE_M ? this.target.y : desiredY;
    this.target.z = Math.abs(desiredZ - this.target.z) < DEADZONE_M ? this.target.z : desiredZ;
    this.held.x = this.target.x;
    this.held.y = this.target.y;
    this.held.z = this.target.z;
  }

  private smoothAxis(axis: keyof EyePosition, dt: number, tauSeconds: number): void {
    const alpha = 1 - Math.exp(-dt / Math.max(tauSeconds, 0.001));
    this.eye[axis] += (this.target[axis] - this.eye[axis]) * alpha;
  }
}
