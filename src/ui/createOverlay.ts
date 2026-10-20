export interface OverlayControls {
  root: HTMLElement;
  panel: HTMLElement;
  presence: HTMLElement;
  banner: HTMLElement;
  status: HTMLElement;
  trackingButton: HTMLButtonElement;
  calibrateButton: HTMLButtonElement;
  mouseButton: HTMLButtonElement;
  fullscreenButton: HTMLButtonElement;
  sensitivity: HTMLInputElement;
  smoothing: HTMLInputElement;
  sceneSelect: HTMLSelectElement;
  fileInput: HTMLInputElement;
  sampleButton: HTMLButtonElement;
  scale: HTMLInputElement;
  debug: HTMLInputElement;
  preview: HTMLCanvasElement;
  readout: HTMLElement;
  screenWidth: HTMLInputElement;
  screenHeight: HTMLInputElement;
  distance: HTMLInputElement;
}

export function createOverlay(): OverlayControls {
  const root = document.createElement("div");
  root.id = "hud";
  root.innerHTML = `
    <div id="presence" title="Seguimiento apagado"></div>
    <p id="banner" hidden></p>
    <section id="panel">
      <header>
        <h1>Ventana 3D</h1>
        <p id="status">Pose neutra</p>
      </header>
      <div class="row">
        <button id="tracking" type="button">Activar seguimiento de cabeza</button>
        <button id="calibrate" type="button">Calibrar posición</button>
      </div>
      <div class="row">
        <button id="mouse" type="button" aria-pressed="false">Control con mouse</button>
        <button id="fullscreen" type="button">Pantalla completa</button>
      </div>
      <label>Sensibilidad <input id="sensitivity" type="range" min="0.4" max="2.2" step="0.05" value="1" /></label>
      <label>Suavizado <input id="smoothing" type="range" min="0" max="1" step="0.01" value="0.35" /></label>
      <label>Escena
        <select id="scene">
          <option value="corridor">Corredor industrial</option>
          <option value="splat">Gaussian splat</option>
        </select>
      </label>
      <div class="row">
        <label class="file">Cargar splat <input id="file" type="file" accept=".ply,.splat,.spz,.ksplat,.sog,.zip,.rad" /></label>
        <button id="sample" type="button">Descargar ejemplo</button>
      </div>
      <label>Escala <input id="scale" type="range" min="0.3" max="3" step="0.05" value="1" disabled /></label>
      <label class="check"><input id="debug" type="checkbox" /> Landmarks y coordenadas</label>
      <canvas id="preview" width="200" height="150" hidden></canvas>
      <p id="readout" hidden>x 0.0 cm · y 0.0 cm · z 60.0 cm</p>
      <div class="dims">
        <label>Ancho cm <input id="width" type="number" min="20" max="120" step="0.1" value="53.1" /></label>
        <label>Alto cm <input id="height" type="number" min="12" max="80" step="0.1" value="29.9" /></label>
        <label>Distancia cm <input id="distance" type="number" min="30" max="140" step="1" value="60" /></label>
      </div>
    </section>
  `;
  document.body.appendChild(root);

  const required = <T extends Element>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing overlay element ${selector}`);
    return element;
  };

  return {
    root,
    panel: required("#panel"),
    presence: required("#presence"),
    banner: required("#banner"),
    status: required("#status"),
    trackingButton: required("#tracking"),
    calibrateButton: required("#calibrate"),
    mouseButton: required("#mouse"),
    fullscreenButton: required("#fullscreen"),
    sensitivity: required("#sensitivity"),
    smoothing: required("#smoothing"),
    sceneSelect: required("#scene"),
    fileInput: required("#file"),
    sampleButton: required("#sample"),
    scale: required("#scale"),
    debug: required("#debug"),
    preview: required("#preview"),
    readout: required("#readout"),
    screenWidth: required("#width"),
    screenHeight: required("#height"),
    distance: required("#distance"),
  };
}
