# Sigue mirada

The monitor is a fixed window into a 3D space. Moving your head (or the pointer) shifts the eye and rebuilds an off-axis frustum, so nearby objects slide more than the far wall.

## Run locally

```bash
npm install
npm run dev
```

`npm install` does not download the face model. The first `npm run dev` or `npm run build` copies the MediaPipe wasm files and downloads the Face Landmarker model into `public/`. The video never leaves the browser. MediaPipe's own library may send usage metrics to Google; this app does not upload frames.

Open the page, then turn on **Control con mouse** to try the parallax before granting the camera. **Activar seguimiento de cabeza** asks for the webcam. **Calibrar posición** sets the current face as the neutral pose.

Enter the real width and height of the display in centimeters, and the distance from your eyes to the screen. Fullscreen makes the window match that rectangle. Sensitivity `1` keeps the motion in real centimeters.

## Scenes

The industrial corridor is built with Three.js geometry and canvas textures. No external art files.

Gaussian splats load through `@sparkjsdev/spark`. Use **Cargar splat** for `.ply`, `.splat`, `.spz`, `.ksplat`, `.sog`, `.zip`, or `.rad`. **Descargar ejemplo** fetches Spark's `butterfly.spz` once per session.

## Pages

The public build is published with GitHub Actions to:

https://pablogventura.github.io/sigue-mirada/
