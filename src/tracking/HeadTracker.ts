import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { measureFace, referenceFromLandmarks } from "./estimateHeadPose";
import { createEmptyMeasurement, type FaceReference, type HeadMeasurement } from "./types";

export type TrackerPhase = "off" | "loading" | "live" | "lost" | "error";

const TARGET_INTERVAL_MS = 33;

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Permiso de cámara denegado.";
    }
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return "No hay una webcam disponible.";
    }
    if (error.name === "NotReadableError") {
      return "La cámara está en uso por otro programa.";
    }
  }
  return "No se pudo abrir la cámara.";
}

/**
 * Opens the webcam only after the user asks for tracking and estimates the
 * head on its own timer, around 30 Hz, so inference does not run inside the
 * render frame.
 */
export class HeadTracker {
  private readonly video: HTMLVideoElement;
  private landmarker: FaceLandmarker | null = null;
  private stream: MediaStream | null = null;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastTimestampMs = -1;
  private reference: FaceReference | null = null;
  private calibrateRequested = false;
  private calibrationDistanceM = 0.6;
  private includeLandmarks = false;
  private latest: HeadMeasurement = createEmptyMeasurement();
  private phase: TrackerPhase = "off";

  constructor(
    private readonly listeners: {
      onMeasurement: (measurement: HeadMeasurement) => void;
      onPhase: (phase: TrackerPhase) => void;
      onError: (message: string) => void;
    },
  ) {
    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.setAttribute("playsinline", "");
  }

  get previewVideo(): HTMLVideoElement {
    return this.video;
  }

  get measurement(): HeadMeasurement {
    return this.latest;
  }

  setDebug(enabled: boolean): void {
    this.includeLandmarks = enabled;
  }

  setReferenceDistance(distanceM: number): void {
    this.calibrationDistanceM = distanceM;
    if (this.reference) this.reference.distanceM = distanceM;
  }

  requestCalibration(distanceM: number): void {
    this.calibrationDistanceM = distanceM;
    this.calibrateRequested = true;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.setPhase("loading");
    try {
      await this.ensureLandmarker();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.running = true;
      this.lastTimestampMs = -1;
      this.setPhase("lost");
      this.schedule(0);
    } catch (error) {
      this.stopStream();
      this.running = false;
      this.setPhase("error");
      const message = this.landmarker ? cameraErrorMessage(error) : "No se pudo cargar el modelo de seguimiento facial.";
      if (!this.landmarker && error instanceof Error && error.message) {
        this.listeners.onError(`${message} ${error.message}`);
      } else {
        this.listeners.onError(message);
      }
      throw error;
    }
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.stopStream();
    this.latest = createEmptyMeasurement();
    this.listeners.onMeasurement(this.latest);
    this.setPhase("off");
  }

  private stopStream(): void {
    this.video.pause();
    this.video.srcObject = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private async ensureLandmarker(): Promise<void> {
    if (this.landmarker) return;
    const wasmRoot = `${import.meta.env.BASE_URL}mediapipe/wasm`;
    const modelPath = `${import.meta.env.BASE_URL}models/face_landmarker.task`;
    const fileset = await FilesetResolver.forVisionTasks(wasmRoot);
    const options = {
      numFaces: 1,
      runningMode: "VIDEO" as const,
      minFaceDetectionConfidence: 0.6,
      minFacePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    };
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { modelAssetPath: modelPath, delegate: "GPU" },
      });
    } catch {
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { modelAssetPath: modelPath, delegate: "CPU" },
      });
    }
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => this.step(), delayMs);
  }

  private step(): void {
    if (!this.running || !this.landmarker) return;
    const startedMs = performance.now();
    if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      let timestampMs = startedMs;
      if (timestampMs <= this.lastTimestampMs) timestampMs = this.lastTimestampMs + 1;
      this.lastTimestampMs = timestampMs;
      try {
        const result = this.landmarker.detectForVideo(this.video, timestampMs);
        const landmarks = result.faceLandmarks[0];
        if (!landmarks) {
          this.publish({ ...createEmptyMeasurement(), distanceM: this.calibrationDistanceM });
          this.setPhase("lost");
        } else {
          if (!this.reference || this.calibrateRequested) {
            const captured = referenceFromLandmarks(landmarks, this.calibrationDistanceM);
            if (captured) {
              this.reference = captured;
              this.calibrateRequested = false;
            }
          }
          if (this.reference) {
            const aspect = this.video.videoWidth / Math.max(this.video.videoHeight, 1);
            this.publish(measureFace(landmarks, this.reference, aspect, this.includeLandmarks));
            this.setPhase("live");
          }
        }
      } catch {
        this.listeners.onError("El seguimiento facial se interrumpió.");
        this.stop();
        return;
      }
    }
    const elapsedMs = performance.now() - startedMs;
    this.schedule(Math.max(0, TARGET_INTERVAL_MS - elapsedMs));
  }

  private publish(measurement: HeadMeasurement): void {
    this.latest = measurement;
    this.listeners.onMeasurement(measurement);
  }

  private setPhase(phase: TrackerPhase): void {
    if (phase === this.phase) return;
    this.phase = phase;
    this.listeners.onPhase(phase);
  }
}
