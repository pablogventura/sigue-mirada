import {
  BoxGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
  type Texture,
} from "three";

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0);
  const b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1);
  const d = hash(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number): number {
  let amplitude = 0.5;
  let sum = 0;
  let frequency = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    sum += amplitude * valueNoise(x * frequency, y * frequency);
    frequency *= 2;
    amplitude *= 0.5;
  }
  return sum;
}

function makeTexture(size: number, paint: (pixels: Uint8ClampedArray, size: number) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D is unavailable");
  const image = context.createImageData(size, size);
  paint(image.data, size);
  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function paintWall(pixels: Uint8ClampedArray, size: number): void {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const grain = fbm(x * 0.03, y * 0.03);
      const peel = fbm(x * 0.007 + 8, y * 0.009);
      const stain = fbm(x * 0.08, y * 0.04 + 3);
      const plaster = peel > 0.58;
      const base = plaster ? 150 + grain * 36 : 78 + grain * 28;
      const index = (y * size + x) * 4;
      pixels[index] = base + (plaster ? 18 : -6) + stain * 14;
      pixels[index + 1] = base + (plaster ? 8 : -4) + stain * 6;
      pixels[index + 2] = base - (plaster ? 8 : 16);
      pixels[index + 3] = 255;
    }
  }
}

function paintFloor(pixels: Uint8ClampedArray, size: number): void {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const grain = fbm(x * 0.05, y * 0.05);
      const pit = fbm(x * 0.12 + 4, y * 0.12);
      const base = 58 + grain * 22 - (pit > 0.72 ? 16 : 0);
      const index = (y * size + x) * 4;
      pixels[index] = base + 6;
      pixels[index + 1] = base + 4;
      pixels[index + 2] = base;
      pixels[index + 3] = 255;
    }
  }
}

function paintRust(pixels: Uint8ClampedArray, size: number): void {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const rust = fbm(x * 0.04, y * 0.04);
      const metal = fbm(x * 0.15 + 2, y * 0.02);
      const index = (y * size + x) * 4;
      pixels[index] = 90 + rust * 80;
      pixels[index + 1] = 48 + metal * 30;
      pixels[index + 2] = 32 + metal * 12;
      pixels[index + 3] = 255;
    }
  }
}

function repeatedMaterial(texture: Texture, repeatX: number, repeatY: number, roughness: number, metalness: number): MeshStandardMaterial {
  const map = texture.clone();
  map.needsUpdate = true;
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.repeat.set(repeatX, repeatY);
  return new MeshStandardMaterial({ map, roughness, metalness, side: DoubleSide });
}

export class IndustrialCorridor {
  readonly room = new Group();
  readonly frame = new Group();
  private frameWidthM = 0;
  private frameHeightM = 0;
  private readonly frameMaterial = new MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.38, metalness: 0.7 });

  constructor() {
    const wallTexture = makeTexture(512, paintWall);
    const floorTexture = makeTexture(512, paintFloor);
    const rustTexture = makeTexture(256, paintRust);

    const wall = repeatedMaterial(wallTexture, 4, 1.4, 0.9, 0.02);
    const wallLong = repeatedMaterial(wallTexture, 6, 1.6, 0.9, 0.02);
    const floor = repeatedMaterial(floorTexture, 8, 8, 0.95, 0.02);
    const ceiling = repeatedMaterial(wallTexture, 6, 6, 0.84, 0.05);
    ceiling.color = new Color(0xb0a89a);
    const rust = repeatedMaterial(rustTexture, 1, 6, 0.62, 0.35);
    const darkMetal = new MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.45, metalness: 0.62 });
    const crateMaterial = repeatedMaterial(wallTexture, 1, 1, 0.78, 0.08);
    crateMaterial.color = new Color(0x8a5a32);
    const windowMaterial = new MeshBasicMaterial({ color: 0xffd8a8, side: DoubleSide, toneMapped: false });
    const recessMaterial = new MeshStandardMaterial({ color: 0x12110f, roughness: 1, metalness: 0 });

    const floorMesh = new Mesh(new PlaneGeometry(12, 11), floor);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, -1.15, -5);
    floorMesh.receiveShadow = true;
    this.room.add(floorMesh);

    const ceilingMesh = new Mesh(new PlaneGeometry(12, 11), ceiling);
    ceilingMesh.rotation.x = Math.PI / 2;
    ceilingMesh.position.set(0, 1.55, -5);
    ceilingMesh.receiveShadow = true;
    this.room.add(ceilingMesh);

    this.addWall(-2.6, wallLong);
    this.addWall(2.6, wallLong);
    const back = new Mesh(new PlaneGeometry(12, 2.7), wall);
    back.position.set(0, 0.2, -10);
    back.receiveShadow = true;
    this.room.add(back);

    this.addWindow(-2.55, 0.35, -2.4, windowMaterial);
    this.addWindow(-2.55, 0.35, -6.2, windowMaterial);
    this.addWindow(2.55, 0.35, -4.1, windowMaterial, Math.PI);

    this.addDoor(-0.82, -3.9, recessMaterial, darkMetal);
    this.addDoor(0.15, -7.6, recessMaterial, darkMetal);

    this.addColumn(-0.32, -1.08, wall);
    this.addColumn(-0.95, -4.3, wall);
    this.addColumn(1.05, -6.4, wall);

    const crate = new Mesh(new BoxGeometry(0.4, 0.34, 0.46), crateMaterial);
    crate.position.set(0.5, -0.98, -1.48);
    crate.castShadow = true;
    crate.receiveShadow = true;
    this.room.add(crate);

    const crateFar = new Mesh(new BoxGeometry(0.5, 0.28, 0.5), crateMaterial);
    crateFar.position.set(-1.15, -1.01, -2.6);
    crateFar.castShadow = true;
    crateFar.receiveShadow = true;
    this.room.add(crateFar);

    this.addPipe(new CylinderGeometry(0.045, 0.045, 9.2, 12), -1.05, 1.34, -5.1, rust, true);
    this.addPipe(new CylinderGeometry(0.03, 0.03, 9.2, 10), -0.72, 1.42, -5.1, darkMetal, true);
    this.addPipe(new CylinderGeometry(0.035, 0.035, 8.4, 10), 0.95, 1.3, -5.4, rust, true);

    const hanger = new Mesh(new CylinderGeometry(0.028, 0.028, 0.85, 10), rust);
    hanger.position.set(0.14, 1.12, -0.82);
    hanger.castShadow = true;
    this.room.add(hanger);
    const lamp = new Mesh(new CylinderGeometry(0.09, 0.12, 0.16, 12), darkMetal);
    lamp.position.set(0.14, 0.66, -0.82);
    lamp.castShadow = true;
    this.room.add(lamp);

    const stencil = this.makeStencil();
    stencil.position.set(0.55, 0.35, -9.97);
    this.room.add(stencil);

    this.freeze(this.room);
  }

  updateFrame(widthM: number, heightM: number): void {
    if (Math.abs(widthM - this.frameWidthM) < 0.0001 && Math.abs(heightM - this.frameHeightM) < 0.0001) return;
    this.frameWidthM = widthM;
    this.frameHeightM = heightM;
    const geometries = new Set<BufferGeometry>();
    for (const child of [...this.frame.children]) {
      this.frame.remove(child);
      if (child instanceof Mesh) geometries.add(child.geometry);
    }
    for (const geometry of geometries) geometry.dispose();
    const material = this.frameMaterial;
    const depth = 0.04;
    const thickness = 0.016;
    const z = -0.03;
    const horizontal = new BoxGeometry(widthM, thickness, depth);
    const vertical = new BoxGeometry(thickness, heightM - thickness * 2, depth);
    const top = new Mesh(horizontal, material);
    top.position.set(0, heightM / 2 - thickness / 2, z);
    const bottom = new Mesh(horizontal, material);
    bottom.position.set(0, -heightM / 2 + thickness / 2, z);
    const left = new Mesh(vertical, material);
    left.position.set(-widthM / 2 + thickness / 2, 0, z);
    const right = new Mesh(vertical, material);
    right.position.set(widthM / 2 - thickness / 2, 0, z);
    this.frame.add(top, bottom, left, right);
    this.freeze(this.frame);
  }

  private addWall(x: number, material: Material): void {
    const wall = new Mesh(new PlaneGeometry(11, 2.7), material);
    wall.position.set(x, 0.2, -5);
    wall.rotation.y = x < 0 ? -Math.PI / 2 : Math.PI / 2;
    wall.receiveShadow = true;
    this.room.add(wall);
  }

  private addWindow(x: number, y: number, z: number, material: Material, rotationY = 0): void {
    const pane = new Mesh(new PlaneGeometry(1.15, 0.72), material);
    pane.position.set(x, y, z);
    pane.rotation.y = rotationY === 0 ? Math.PI / 2 : -Math.PI / 2;
    this.room.add(pane);
    const frameMaterial = new MeshStandardMaterial({ color: 0x4a4036, roughness: 0.7, metalness: 0.2 });
    const sill = new Mesh(new BoxGeometry(0.06, 0.05, 1.25), frameMaterial);
    sill.position.set(x > 0 ? x - 0.03 : x + 0.03, y - 0.38, z);
    sill.castShadow = true;
    this.room.add(sill);
  }

  private addDoor(x: number, z: number, recess: Material, metal: Material): void {
    const opening = new Mesh(new PlaneGeometry(0.86, 2.05), recess);
    opening.position.set(x, -0.12, z);
    this.room.add(opening);
    const jamb = new Mesh(new BoxGeometry(0.08, 2.15, 0.08), metal);
    const left = jamb.clone();
    left.position.set(x - 0.46, -0.07, z + 0.04);
    left.castShadow = true;
    const right = jamb.clone();
    right.position.set(x + 0.46, -0.07, z + 0.04);
    right.castShadow = true;
    const lintel = new Mesh(new BoxGeometry(1.0, 0.08, 0.08), metal);
    lintel.position.set(x, 0.96, z + 0.04);
    lintel.castShadow = true;
    this.room.add(left, right, lintel);
  }

  private addColumn(x: number, z: number, material: Material): void {
    const column = new Mesh(new BoxGeometry(0.22, 2.7, 0.22), material);
    column.position.set(x, 0.2, z);
    column.castShadow = true;
    column.receiveShadow = true;
    this.room.add(column);
  }

  private addPipe(geometry: CylinderGeometry, x: number, y: number, z: number, material: Material, alongZ: boolean): void {
    const pipe = new Mesh(geometry, material);
    if (alongZ) pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, y, z);
    pipe.castShadow = true;
    this.room.add(pipe);
  }

  private makeStencil(): Mesh {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    context.clearRect(0, 0, 256, 256);
    context.fillStyle = "rgba(70, 62, 48, 0.0)";
    context.fillRect(0, 0, 256, 256);
    context.fillStyle = "rgba(92, 78, 58, 0.85)";
    context.font = "700 150px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("04", 128, 128);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    return new Mesh(new PlaneGeometry(0.7, 0.7), material);
  }

  private freeze(group: Group): void {
    group.traverse((object) => {
      object.matrixAutoUpdate = false;
      object.updateMatrix();
    });
  }
}

