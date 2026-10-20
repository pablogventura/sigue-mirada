import { createWriteStream, existsSync, mkdirSync, cpSync } from "node:fs";
import { rename } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { dirname, join } from "node:path";

const wasmSource = join("node_modules", "@mediapipe", "tasks-vision", "wasm");
const wasmDestination = join("public", "mediapipe", "wasm");
const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const modelDestination = join("public", "models", "face_landmarker.task");

if (!existsSync(wasmSource)) {
  console.error(`MediaPipe wasm folder not found at ${wasmSource}`);
  process.exit(1);
}

mkdirSync(wasmDestination, { recursive: true });
cpSync(wasmSource, wasmDestination, { recursive: true });

if (existsSync(modelDestination)) {
  console.log("Face landmarker model already present");
} else {
  mkdirSync(dirname(modelDestination), { recursive: true });
  console.log("Downloading face landmarker model...");
  const response = await fetch(modelUrl);
  if (!response.ok || !response.body) {
    console.error(`Model download failed: ${response.status} ${response.statusText}`);
    process.exit(1);
  }
  const temporaryPath = `${modelDestination}.partial`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryPath));
  await rename(temporaryPath, modelDestination);
  console.log("Face landmarker model saved");
}
