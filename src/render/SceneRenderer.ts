import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PCFSoftShadowMap,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { OffAxisCamera } from "../camera/OffAxisCamera";
import { IndustrialCorridor } from "./IndustrialCorridor";

export class SceneRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new OffAxisCamera();
  readonly corridor = new IndustrialCorridor();

  constructor(host: HTMLElement) {
    this.renderer = new WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      stencil: false,
      alpha: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.resize();
    host.appendChild(this.renderer.domElement);

    this.scene.background = new Color(0x14120f);
    this.scene.fog = new FogExp2(0x14120f, 0.048);
    this.scene.add(this.corridor.room);
    this.scene.add(this.corridor.frame);

    const sky = new HemisphereLight(0xd9d3c6, 0x3a342c, 0.8);
    this.scene.add(sky);

    const sun = new DirectionalLight(0xffe2bc, 2.4);
    sun.position.set(-4.2, 3.4, -1.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.4;
    sun.shadow.camera.far = 22;
    sun.shadow.camera.left = -7;
    sun.shadow.camera.right = 7;
    sun.shadow.camera.top = 7;
    sun.shadow.camera.bottom = -7;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.scene.add(sun.target);
    sun.target.position.set(0, 0, -5);

    const fill = new DirectionalLight(0xc9d4e2, 0.35);
    fill.position.set(3.5, 1.5, -2);
    this.scene.add(fill);

    this.corridor.updateFrame(this.camera.screenWidthM, this.camera.screenHeightM);
    window.addEventListener("resize", this.resize);
  }

  start(onFrame: (deltaSeconds: number) => void): void {
    let previousMs = performance.now();
    this.renderer.setAnimationLoop((nowMs) => {
      const deltaSeconds = Math.min(0.05, (nowMs - previousMs) / 1000);
      previousMs = nowMs;
      onFrame(deltaSeconds);
      this.renderer.render(this.scene, this.camera);
    });
  }

  setScreenSize(widthM: number, heightM: number): void {
    this.camera.setScreenSize(widthM, heightM);
    this.corridor.updateFrame(widthM, heightM);
  }

  setCorridorVisible(visible: boolean): void {
    this.corridor.room.visible = visible;
  }

  private readonly resize = (): void => {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}
