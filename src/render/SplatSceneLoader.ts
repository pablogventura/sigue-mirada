import { Quaternion, Vector3 } from "three";
import { SplatFileType, SplatMesh, SparkRenderer } from "@sparkjsdev/spark";
import type { Scene, WebGLRenderer } from "three";

const SAMPLE_SPLAT_URL = "https://sparkjs.dev/assets/splats/butterfly.spz";

const EXTENSION_TO_TYPE: Record<string, SplatFileType> = {
  ply: SplatFileType.PLY,
  spz: SplatFileType.SPZ,
  splat: SplatFileType.SPLAT,
  ksplat: SplatFileType.KSPLAT,
  sog: SplatFileType.PCSOGS,
  zip: SplatFileType.PCSOGSZIP,
  rad: SplatFileType.RAD,
};

function fileTypeFromName(fileName: string): SplatFileType | undefined {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension) return undefined;
  return EXTENSION_TO_TYPE[extension];
}

/**
 * Loads a Gaussian splat behind the window. SparkRenderer is created on the
 * first load so the mesh corridor does not pay for it at startup.
 */
export class SplatSceneLoader {
  private spark: SparkRenderer | null = null;
  private mesh: SplatMesh | null = null;
  private sampleBytes: Uint8Array | null = null;
  private loadToken = 0;
  private userScale = 1;
  private flipUpright = false;
  private readonly center = new Vector3();
  private readonly size = new Vector3();
  private readonly placedCenter = new Vector3();
  private readonly upright = new Quaternion(1, 0, 0, 0);

  constructor(
    private readonly scene: Scene,
    private readonly renderer: WebGLRenderer,
  ) {}

  get hasMesh(): boolean {
    return this.mesh !== null;
  }

  setUserScale(scale: number): void {
    this.userScale = scale;
    if (this.mesh) this.frameMesh(this.mesh);
  }

  setVisible(visible: boolean): void {
    if (this.spark) this.spark.visible = visible;
    if (this.mesh) this.mesh.visible = visible;
  }

  async loadSample(onProgress?: (event: ProgressEvent) => void): Promise<void> {
    if (!this.sampleBytes) {
      const response = await fetch(SAMPLE_SPLAT_URL);
      if (!response.ok) {
        throw new Error(`No se pudo descargar el splat de ejemplo (${response.status}).`);
      }
      this.sampleBytes = new Uint8Array(await response.arrayBuffer());
    }
    await this.mount(this.sampleBytes, "butterfly.spz", true, onProgress);
  }

  async loadFile(file: File, onProgress?: (event: ProgressEvent) => void): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await this.mount(bytes, file.name, false, onProgress);
  }

  clear(): void {
    this.loadToken += 1;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = null;
    }
  }

  private async mount(
    bytes: Uint8Array,
    fileName: string,
    flipUpright: boolean,
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<void> {
    const token = ++this.loadToken;
    this.ensureSpark();
    const fileType = fileTypeFromName(fileName);
    const mesh = new SplatMesh({
      fileBytes: bytes,
      fileName,
      fileType,
      raycastable: false,
      editable: false,
      onProgress,
    });
    await mesh.initialized;
    if (token !== this.loadToken) {
      mesh.dispose();
      return;
    }
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.dispose();
    }
    this.flipUpright = flipUpright;
    this.mesh = mesh;
    this.frameMesh(mesh);
    this.scene.add(mesh);
  }

  private ensureSpark(): void {
    if (this.spark) {
      this.spark.visible = true;
      return;
    }
    this.spark = new SparkRenderer({ renderer: this.renderer });
    this.scene.add(this.spark);
  }

  private frameMesh(mesh: SplatMesh): void {
    const box = mesh.getBoundingBox(true);
    box.getCenter(this.center);
    box.getSize(this.size);
    if (!Number.isFinite(this.center.x) || !Number.isFinite(this.size.x)) {
      mesh.position.set(0, 0, -2.2);
      mesh.scale.setScalar(this.userScale);
      return;
    }
    const maxDimension = Math.max(this.size.x, this.size.y, this.size.z, 1e-4);
    const scale = (3.2 / maxDimension) * this.userScale;
    mesh.scale.setScalar(scale);
    if (this.flipUpright) mesh.quaternion.copy(this.upright);
    else mesh.quaternion.identity();
    this.placedCenter.copy(this.center).applyQuaternion(mesh.quaternion).multiplyScalar(scale);
    mesh.position.set(-this.placedCenter.x, 0.05 - this.placedCenter.y, -2.2 - this.placedCenter.z);
  }
}
