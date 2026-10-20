import { PerspectiveCamera, Vector3 } from "three";

const DEFAULT_SCREEN_WIDTH_M = 0.531;
const DEFAULT_SCREEN_HEIGHT_M = 0.299;
const NEAR_M = 0.05;
const FAR_M = 40;
const MIN_EYE_Z_M = 0.2;

/**
 * Fish-tank camera. The screen is the rectangle z = 0, and the eye sits at
 * z > 0 looking down -Z. Head motion changes the eye position only. The
 * frustum is rebuilt so each edge of the window stays on the same physical
 * corner of the screen.
 */
export class OffAxisCamera extends PerspectiveCamera {
  screenWidthM = DEFAULT_SCREEN_WIDTH_M;
  screenHeightM = DEFAULT_SCREEN_HEIGHT_M;
  private readonly eye = new Vector3(0, 0, 0.6);

  constructor() {
    super(50, 1, NEAR_M, FAR_M);
    this.position.copy(this.eye);
    this.quaternion.identity();
    this.updateProjectionMatrix();
  }

  setScreenSize(widthM: number, heightM: number): void {
    this.screenWidthM = widthM;
    this.screenHeightM = heightM;
    this.updateProjectionMatrix();
  }

  setEye(x: number, y: number, z: number): void {
    this.eye.set(x, y, Math.max(MIN_EYE_Z_M, z));
    this.position.copy(this.eye);
    this.quaternion.identity();
    this.updateMatrixWorld();
    this.updateProjectionMatrix();
  }

  override updateProjectionMatrix(): void {
    const eyeZ = Math.max(MIN_EYE_Z_M, this.position.z);
    const near = Math.min(this.near, eyeZ * 0.35);
    const scale = near / eyeZ;
    const halfWidth = this.screenWidthM * 0.5;
    const halfHeight = this.screenHeightM * 0.5;
    const left = (-halfWidth - this.position.x) * scale;
    const right = (halfWidth - this.position.x) * scale;
    const top = (halfHeight - this.position.y) * scale;
    const bottom = (-halfHeight - this.position.y) * scale;
    this.projectionMatrix.makePerspective(left, right, top, bottom, near, this.far);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}
