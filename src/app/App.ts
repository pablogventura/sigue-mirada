import { HeadPoseFilter } from "../tracking/HeadPoseFilter";
import type { HeadTracker, TrackerPhase } from "../tracking/HeadTracker";
import type { EyePosition, HeadMeasurement } from "../tracking/types";
import { SceneRenderer } from "../render/SceneRenderer";
import type { SplatSceneLoader } from "../render/SplatSceneLoader";
import { clamp } from "../math/clamp";
import { createOverlay, type OverlayControls } from "../ui/createOverlay";

const STORAGE_KEY = "sigue-mirada-screen";

interface ScreenSettings {
  widthCm: number;
  heightCm: number;
  distanceCm: number;
}

export class App {
  private readonly renderer: SceneRenderer;
  private readonly filter = new HeadPoseFilter();
  private tracker: HeadTracker | null = null;
  private splats: SplatSceneLoader | null = null;
  private readonly ui: OverlayControls;
  private mouseEnabled = false;
  private trackingEnabled = false;
  private calibrating = false;
  private debugEnabled = false;
  private hideTimer = 0;
  private readonly previewContext: CanvasRenderingContext2D | null;

  constructor(host: HTMLElement) {
    this.renderer = new SceneRenderer(host);
    this.ui = createOverlay();
    this.previewContext = this.ui.preview.getContext("2d");
    this.bindOverlay();
    this.bindPointer();
    this.restoreScreen();
    this.filter.setSmoothing(Number(this.ui.smoothing.value));
    this.applyScreen();
  }

  start(): void {
    this.armHide();
    this.renderer.start((deltaSeconds) => {
      this.filter.update(deltaSeconds);
      const eye = this.filter.position;
      this.renderer.camera.setEye(eye.x, eye.y, eye.z);
      if (this.ui.debug.checked) this.writeReadout(eye);
    });
  }

  private bindOverlay(): void {
    this.ui.trackingButton.addEventListener("click", () => void this.toggleTracking());
    this.ui.calibrateButton.addEventListener("click", () => this.calibrate());
    this.ui.mouseButton.addEventListener("click", () => this.toggleMouse());
    this.ui.fullscreenButton.addEventListener("click", () => void this.toggleFullscreen());
    this.ui.sensitivity.addEventListener("input", () => {
      this.filter.sensitivity = Number(this.ui.sensitivity.value);
    });
    this.ui.smoothing.addEventListener("input", () => {
      this.filter.setSmoothing(Number(this.ui.smoothing.value));
    });
    this.ui.sceneSelect.addEventListener("change", () => this.applyScene());
    this.ui.fileInput.addEventListener("change", () => void this.loadChosenFile());
    this.ui.sampleButton.addEventListener("click", () => void this.loadSample());
    this.ui.scale.addEventListener("input", () => {
      this.splats?.setUserScale(Number(this.ui.scale.value));
    });
    this.ui.debug.addEventListener("change", () => {
      this.debugEnabled = this.ui.debug.checked;
      this.tracker?.setDebug(this.debugEnabled);
      this.ui.preview.hidden = !this.debugEnabled;
      this.ui.readout.hidden = !this.debugEnabled;
      if (this.debugEnabled) this.drawPreview();
    });
    for (const input of [this.ui.screenWidth, this.ui.screenHeight, this.ui.distance]) {
      input.addEventListener("change", () => {
        this.applyScreen();
        this.storeScreen();
      });
    }
    this.ui.presence.addEventListener("pointerenter", () => this.reveal());
    document.addEventListener("fullscreenchange", () => {
      this.ui.fullscreenButton.textContent = document.fullscreenElement ? "Salir de pantalla completa" : "Pantalla completa";
    });
  }

  private bindPointer(): void {
    window.addEventListener("pointermove", (event) => {
      const overPanel = this.ui.panel.contains(event.target as Node);
      if (!this.mouseEnabled || overPanel) this.reveal();
      if (!this.mouseEnabled) return;
      const normalizedX = (event.clientX / window.innerWidth) * 2 - 1;
      const normalizedY = -((event.clientY / window.innerHeight) * 2 - 1);
      this.filter.setMouse(normalizedX, normalizedY);
    });
    window.addEventListener(
      "wheel",
      (event) => {
        if (!this.mouseEnabled) return;
        event.preventDefault();
        this.filter.addMouseWheel(event.deltaY);
      },
      { passive: false },
    );
  }

  private async toggleTracking(): Promise<void> {
    if (this.trackingEnabled) {
      this.tracker?.stop();
      this.trackingEnabled = false;
      this.ui.trackingButton.textContent = "Activar seguimiento de cabeza";
      if (!this.mouseEnabled) this.filter.setSource("idle");
      this.setStatus("Pose neutra");
      return;
    }
    this.mouseEnabled = false;
    this.ui.mouseButton.setAttribute("aria-pressed", "false");
    this.ui.trackingButton.disabled = true;
    this.ui.trackingButton.textContent = "Cargando seguimiento...";
    try {
      const tracker = await this.ensureTracker();
      await tracker.start();
      this.trackingEnabled = true;
      this.filter.setSource("head");
      this.ui.trackingButton.textContent = "Detener seguimiento";
      this.setStatus("Buscando el rostro...");
      this.setBanner(null);
    } catch {
      this.trackingEnabled = false;
      this.ui.trackingButton.textContent = "Activar seguimiento de cabeza";
      if (!this.mouseEnabled) this.filter.setSource("idle");
    } finally {
      this.ui.trackingButton.disabled = false;
    }
  }

  private calibrate(): void {
    if (!this.trackingEnabled) {
      this.setBanner("Activa el seguimiento para calibrar.");
      return;
    }
    this.calibrating = true;
    this.tracker?.requestCalibration(this.distanceMeters());
    this.setBanner("Quedate quieto frente a la pantalla.");
  }

  private toggleMouse(): void {
    this.mouseEnabled = !this.mouseEnabled;
    this.ui.mouseButton.setAttribute("aria-pressed", this.mouseEnabled ? "true" : "false");
    if (this.mouseEnabled) {
      if (this.trackingEnabled) {
        this.tracker?.stop();
        this.trackingEnabled = false;
        this.ui.trackingButton.textContent = "Activar seguimiento de cabeza";
      }
      this.filter.setSource("mouse");
      this.setStatus("Control con mouse");
      this.setBanner(null);
      return;
    }
    if (!this.trackingEnabled) {
      this.filter.setSource("idle");
      this.setStatus("Pose neutra");
    }
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      this.setBanner("El navegador no pudo entrar en pantalla completa.");
    }
  }

  private applyScene(): void {
    const splatSelected = this.ui.sceneSelect.value === "splat";
    const hasMesh = this.splats?.hasMesh ?? false;
    if (splatSelected && !hasMesh) {
      this.setStatus("Carga un splat o descarga el ejemplo.");
      this.renderer.setCorridorVisible(true);
      this.splats?.setVisible(false);
      return;
    }
    this.renderer.setCorridorVisible(!splatSelected);
    this.splats?.setVisible(splatSelected);
    this.setStatus(splatSelected ? "Gaussian splat" : "Corredor industrial");
  }

  private async loadChosenFile(): Promise<void> {
    const file = this.ui.fileInput.files?.[0];
    this.ui.fileInput.value = "";
    if (!file) return;
    await this.loadSplat(file.name, (loader, onProgress) => loader.loadFile(file, onProgress));
  }

  private async loadSample(): Promise<void> {
    await this.loadSplat("butterfly.spz", (loader, onProgress) => loader.loadSample(onProgress));
  }

  private async loadSplat(
    label: string,
    load: (loader: SplatSceneLoader, onProgress: (event: ProgressEvent) => void) => Promise<void>,
  ): Promise<void> {
    this.ui.sampleButton.disabled = true;
    this.setStatus(`Cargando ${label}...`);
    this.setBanner(null);
    try {
      const loader = await this.ensureSplats();
      await load(loader, (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        this.setStatus(`Cargando ${label}... ${percent}%`);
      });
      this.ui.scale.disabled = false;
      this.ui.sceneSelect.value = "splat";
      this.applyScene();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el splat.";
      this.setBanner(message);
      this.ui.sceneSelect.value = "corridor";
      this.applyScene();
    } finally {
      this.ui.sampleButton.disabled = false;
    }
  }

  private onMeasurement(measurement: HeadMeasurement): void {
    this.filter.pushMeasurement(measurement);
    if (this.ui.debug.checked) this.drawPreview();
    if (this.calibrating && measurement.detected) {
      this.calibrating = false;
      this.setBanner("Posición calibrada.");
    }
  }

  private onPhase(phase: TrackerPhase): void {
    this.ui.presence.className = phase === "off" || phase === "error" ? "" : `is-${phase}`;
    const titles: Record<TrackerPhase, string> = {
      off: "Seguimiento apagado",
      loading: "Cargando seguimiento",
      live: "Rostro detectado",
      lost: "Rostro no detectado",
      error: "Error de seguimiento",
    };
    this.ui.presence.title = titles[phase];
    if (phase === "lost" && this.trackingEnabled) this.setStatus("Buscando el rostro...");
    if (phase === "live" && this.trackingEnabled) this.setStatus("Rostro detectado");
  }

  private drawPreview(): void {
    const context = this.previewContext;
    const tracker = this.tracker;
    const video = tracker?.previewVideo;
    if (!context || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const canvas = this.ui.preview;
    context.setTransform(-1, 0, 0, 1, canvas.width, 0);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    context.setTransform(1, 0, 0, 1, 0, 0);
    const landmarks = tracker.measurement.landmarks;
    if (!landmarks) return;
    context.fillStyle = "#e4d2b4";
    for (const point of landmarks) {
      context.fillRect((1 - point.x) * canvas.width, point.y * canvas.height, 1.5, 1.5);
    }
  }

  private writeReadout(eye: EyePosition): void {
    const x = (eye.x * 100).toFixed(1);
    const y = (eye.y * 100).toFixed(1);
    const z = (eye.z * 100).toFixed(1);
    this.ui.readout.textContent = `x ${x} cm · y ${y} cm · z ${z} cm`;
  }

  private applyScreen(): void {
    const widthM = clamp(this.numberValue(this.ui.screenWidth, 53.1) / 100, 0.2, 1.2);
    const heightM = clamp(this.numberValue(this.ui.screenHeight, 29.9) / 100, 0.12, 0.8);
    const distanceM = this.distanceMeters();
    this.renderer.setScreenSize(widthM, heightM);
    this.filter.setNeutralDistance(distanceM);
    this.tracker?.setReferenceDistance(distanceM);
  }

  private distanceMeters(): number {
    return clamp(this.numberValue(this.ui.distance, 60) / 100, 0.3, 1.4);
  }

  private numberValue(input: HTMLInputElement, fallback: number): number {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : fallback;
  }

  private restoreScreen(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as Partial<ScreenSettings>;
      if (typeof stored.widthCm === "number") this.ui.screenWidth.value = String(stored.widthCm);
      if (typeof stored.heightCm === "number") this.ui.screenHeight.value = String(stored.heightCm);
      if (typeof stored.distanceCm === "number") this.ui.distance.value = String(stored.distanceCm);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private storeScreen(): void {
    const settings: ScreenSettings = {
      widthCm: this.numberValue(this.ui.screenWidth, 53.1),
      heightCm: this.numberValue(this.ui.screenHeight, 29.9),
      distanceCm: this.numberValue(this.ui.distance, 60),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  private async ensureTracker(): Promise<HeadTracker> {
    if (this.tracker) return this.tracker;
    const { HeadTracker: HeadTrackerClass } = await import("../tracking/HeadTracker");
    this.tracker = new HeadTrackerClass({
      onMeasurement: (measurement) => this.onMeasurement(measurement),
      onPhase: (phase) => this.onPhase(phase),
      onError: (message) => this.setBanner(message),
    });
    this.tracker.setDebug(this.debugEnabled);
    this.tracker.setReferenceDistance(this.distanceMeters());
    return this.tracker;
  }

  private async ensureSplats(): Promise<SplatSceneLoader> {
    if (this.splats) return this.splats;
    const { SplatSceneLoader: SplatSceneLoaderClass } = await import("../render/SplatSceneLoader");
    this.splats = new SplatSceneLoaderClass(this.renderer.scene, this.renderer.renderer);
    this.splats.setUserScale(Number(this.ui.scale.value));
    return this.splats;
  }

  private setStatus(message: string): void {
    this.ui.status.textContent = message;
  }

  private setBanner(message: string | null): void {
    if (!message) {
      this.ui.banner.hidden = true;
      this.ui.banner.textContent = "";
      return;
    }
    this.ui.banner.hidden = false;
    this.ui.banner.textContent = message;
  }

  private reveal(): void {
    this.ui.panel.classList.remove("is-hidden");
    this.armHide();
  }

  private armHide(): void {
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && this.ui.panel.contains(active)) {
        this.armHide();
        return;
      }
      this.ui.panel.classList.add("is-hidden");
    }, 2500);
  }
}
