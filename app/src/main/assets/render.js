import {lowVehicle,useLowVehicle} from './vehicle-lod.js';
import {VehiclePresentation,BattleRenderBudget} from './vehicle-presentation.js';
import {pickVehicleSurface} from './cosmetic-picking.js';
import {applyCharmWear} from './cosmetic-wear.js';
import {applyCosmetics,swingCosmetics,charmModel,ensureCharm,prepareCosmetic,onCosmeticTextureReady,clearCosmetics} from './cosmetic-render.js';
import {articulateCrimson} from './crimson-parts.js';
import {articulateFalcon} from './su100p-parts.js';
import {batchBuildings,freezeStaticScenery} from './scenery-batches.js';
import {MapLOD} from './map-lod.js';
import {cityMaterials} from './city-materials.js';
import {HillsEnvironment} from './hills-environment.js';
import {articulateKatyusha,articulatePo2} from "./katyusha-parts.js";
import {
  articulateJudicator,
  articulateValkyrie,
} from "./premium-vehicle-parts.js";
import * as THREE from "./three.module.js";
import { mergeGeometries } from "./BufferGeometryUtils.js";
import { GLTFLoader } from "./GLTFLoader.js";
import { MeshoptDecoder } from "./meshopt_decoder.module.js";
import {
  articulateBear,
  articulateAvenger,
  rollTracks,
  articulateKFZ,
  articulateTank,
  rollBelts,
  articulateTierTwo,
  articulateCougar,
} from "./vehicle-parts.js";
import { frameFlight } from "./flight-camera.js";
import { ExplosionEffects } from "./explosion-effects.js";
import {
  articulateWarhorse,
  articulateFV,
  articulateGladiator,
} from "./v1-vehicle-parts.js";
import { MissileExhaust } from "./missile-exhaust.js";
import { StructureRenderer } from "./structures-renderer.js";
import { ChaseCamera } from "./chase-camera.js";
import {
  applyGroundContact,
  contactFromRunningGear,
} from "./vehicle-grounding.js";
import { updatePolyline } from "./render-lines.js";
import { canUseGunSight, GUN_SIGHT_FOV } from "./gun-sight.js";
import { splitAvengerWheels } from "./vehicle-wheels.js";
const B = window.Blindfire,
  FORWARD = new THREE.Vector3(0, 0, -1);
const mat = (color, opts = {}) =>
  new THREE.MeshLambertMaterial({ color, ...opts });
const palette = {
  body: mat("#496153"),
  hostile: mat("#785049"),
  hostileAir: mat("#905b50"),
  trim: mat("#273b35"),
  dark: mat("#1b2729"),
  steel: mat("#7c8b82"),
  glass: mat("#14343e"),
  tire: mat("#202425"),
  white: mat("#edf1d9"),
  sand: mat("#c2bca0"),
  roof: mat("#8b8571"),
  flame: new THREE.MeshBasicMaterial({ color: "#ffb461" }),
  bullet: new THREE.MeshBasicMaterial({ color: "#ffeabd" }),
};
const sharedMaterials=new Set(Object.values(palette));
function box(g, x, y, z, w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function cylinder(g, x, y, z, top, bottom, h, material, sides = 10) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(top, bottom, h, sides),
    material,
  );
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function truck(hostile = false) {
  const g = new THREE.Group(),
    body = hostile ? palette.hostile : palette.body;
  // 8x8 chassis + armored cab. Keep original overall dimensions so hitboxes/camera remain unchanged.
  box(g, 0, 2.05, 0, 8.5, 1.25, 19.2, palette.dark);
  box(g, 0, 2.95, 3.9, 8.15, 0.8, 11.1, body);
  box(g, 0, 3.65, -6.15, 8.35, 2.7, 6.6, body);
  const roof = box(g, 0, 5.75, -6.0, 8.05, 1.15, 5.6, body);
  roof.rotation.x = 0.055;
  // Split windshield, side glass, door seams and mirrors.
  for (const x of [-2.0, 2.0]) {
    const w = box(g, x, 5.18, -9.48, 3.5, 1.4, 0.12, palette.glass);
    w.rotation.x = 0.055;
  }
  box(g, 0, 5.18, -9.55, 0.2, 1.55, 0.16, palette.dark);
  for (const x of [-4.2, 4.2]) {
    box(g, x, 5.05, -6.45, 0.12, 1.35, 2.5, palette.glass);
    box(g, x, 4.15, -4.9, 0.13, 2.35, 0.16, palette.dark);
    box(g, x, 4.3, -5.2, 0.18, 0.18, 0.75, palette.steel);
  }
  for (const x of [-4.72, 4.72]) {
    box(g, x, 5.2, -7.55, 0.08, 1.1, 0.08, palette.dark);
    box(g, x, 5.65, -7.9, 0.48, 0.7, 0.18, palette.dark);
  }
  // Front bumper, grille, lamps and towing points.
  box(g, 0, 2.55, -9.78, 8.9, 0.5, 0.55, palette.steel);
  box(g, 0, 3.35, -9.72, 5.4, 0.92, 0.18, palette.dark);
  for (const x of [-2.2, -1.45, -0.72, 0, 0.72, 1.45, 2.2])
    box(g, x, 3.35, -9.83, 0.13, 0.68, 0.2, palette.steel);
  for (const x of [-3.25, 3.25]) {
    const lamp = cylinder(
      g,
      x,
      3.35,
      -9.88,
      0.47,
      0.47,
      0.15,
      palette.white,
      24,
    );
    lamp.rotation.x = Math.PI / 2;
    const marker = cylinder(
      g,
      x,
      2.8,
      -9.89,
      0.23,
      0.23,
      0.13,
      palette.steel,
      20,
    );
    marker.rotation.x = Math.PI / 2;
  }
  // Rear equipment deck, storage bins, steps and mud guards.
  box(g, 0, 3.55, 4.8, 7.75, 0.7, 8.6, body);
  box(g, 0, 4.05, 7.55, 5.2, 0.75, 2.0, palette.trim);
  for (const x of [-3.65, 3.65]) {
    box(g, x, 3.72, 5.1, 0.95, 1.15, 3.8, palette.trim);
    box(g, x, 2.25, -5.25, 0.75, 0.18, 3.0, palette.steel);
    box(g, x, 1.82, 8.55, 1.45, 1.35, 0.14, palette.dark);
  }
  for (const x of [-4.55, 4.55]) box(g, x, 2.58, 0.3, 0.5, 0.22, 17.0, body);
  box(g, 0, 2.55, 9.72, 8.65, 0.45, 0.45, palette.steel);
  // High-detail rotating launcher pedestal.
  const turret = new THREE.Group();
  turret.position.set(0, 4.55, 1.25);
  g.add(turret);
  cylinder(turret, 0, 0, 0, 2.85, 2.85, 0.85, palette.steel, 36);
  cylinder(turret, 0, 0.62, 0, 2.45, 2.45, 0.45, body, 36);
  const arm = new THREE.Group();
  arm.position.y = 1.05;
  turret.add(arm);
  box(arm, 0, 0, 0.9, 5.45, 0.9, 8.2, body);
  for (const x of [-2.55, 2.55])
    box(arm, x, 0.15, 0.65, 0.32, 1.35, 6.9, palette.steel);
  // Twin launch tubes, reinforcing collars and rear caps.
  for (const x of [-1.55, 1.55]) {
    const tube = cylinder(arm, x, 0.85, 0, 0.84, 0.84, 10, palette.trim, 36);
    tube.rotation.x = Math.PI / 2;
    for (const z of [-4.2, -1.5, 1.5, 4.2]) {
      const ring = cylinder(
        arm,
        x,
        0.85,
        z,
        0.92,
        0.92,
        0.22,
        palette.steel,
        36,
      );
      ring.rotation.x = Math.PI / 2;
    }
    const front = cylinder(
      arm,
      x,
      0.85,
      -5.12,
      0.76,
      0.76,
      0.24,
      palette.dark,
      36,
    );
    front.rotation.x = Math.PI / 2;
    const rear = cylinder(
      arm,
      x,
      0.85,
      5.12,
      0.74,
      0.74,
      0.2,
      palette.steel,
      36,
    );
    rear.rotation.x = Math.PI / 2;
  }
  // Manually aimed artillery tube between launchers.
  const gun = cylinder(arm, 0, 1.4, -0.4, 0.34, 0.34, 8.8, palette.steel, 28);
  gun.rotation.x = Math.PI / 2;
  const muzzle = cylinder(
    arm,
    0,
    1.4,
    -4.95,
    0.46,
    0.46,
    0.44,
    palette.dark,
    28,
  );
  muzzle.rotation.x = Math.PI / 2;
  const breech = cylinder(arm, 0, 1.4, 3.7, 0.49, 0.49, 1.0, palette.dark, 28);
  breech.rotation.x = Math.PI / 2;
  // Roof machine gun remains a separate animated group.
  const mg = new THREE.Group();
  mg.position.set(3.05, 1.55, 0.9);
  turret.add(mg);
  box(mg, 0, 0, 0.55, 0.62, 0.58, 1.45, palette.dark);
  box(mg, 0.52, -0.2, 0.6, 0.72, 0.5, 0.34, palette.steel);
  const mgBarrel = cylinder(mg, 0, 0, -1.55, 0.13, 0.13, 4.4, palette.dark, 20);
  mgBarrel.rotation.x = Math.PI / 2;
  box(mg, 0, -0.55, 1.3, 1.15, 0.72, 1.1, body);
  // Roof hatch, optics, exhaust and antennas.
  cylinder(g, -2.7, 6.42, -4.6, 0.75, 0.75, 0.18, body, 28);
  cylinder(g, -2.7, 6.82, -4.6, 0.22, 0.22, 0.68, palette.steel, 20);
  const exhaust = cylinder(
    g,
    -3.7,
    4.85,
    7.4,
    0.22,
    0.22,
    4.2,
    palette.dark,
    20,
  );
  const cap = cylinder(g, -3.7, 6.96, 7.4, 0.28, 0.28, 0.38, palette.steel, 20);
  for (const [x, z, h] of [
    [-3.2, 3, 5.3],
    [3.25, 4, 3.7],
  ]) {
    cylinder(g, x, 7 + h / 2, z, 0.045, 0.045, h, palette.dark, 8);
    cylinder(g, x, 7, z, 0.1, 0.1, 0.24, palette.steel, 16);
  }
  // Higher-poly wheels with separate rims/hubs.
  const wheels = [];
  for (const x of [-4.25, 4.25])
    for (const z of [-6.2, -2.1, 2.9, 7.0]) {
      const wheel = cylinder(g, x, 1.45, z, 1.62, 1.62, 1.18, palette.tire, 32);
      wheel.rotation.z = Math.PI / 2;
      wheels.push(wheel);
      const rim = cylinder(
        g,
        x + Math.sign(x) * 0.62,
        1.45,
        z,
        0.78,
        0.78,
        0.16,
        palette.steel,
        28,
      );
      rim.rotation.z = Math.PI / 2;
      const hub = cylinder(
        g,
        x + Math.sign(x) * 0.72,
        1.45,
        z,
        0.31,
        0.31,
        0.18,
        palette.dark,
        20,
      );
      hub.rotation.z = Math.PI / 2;
    }
  g.userData = { turret, arm, mg, wheels };
  return g;
}
function bombModel() {
  const g = new THREE.Group(),
    m = new THREE.MeshLambertMaterial({ color: "#49533a" });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 1.15, 12),
    m,
  );
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), m);
  nose.position.z = -0.57;
  g.add(nose);
  for (const angle of [0, Math.PI / 2]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.035, 0.35), m);
    fin.position.z = 0.5;
    fin.rotation.z = angle;
    g.add(fin);
  }
  return g;
}
function aircraft(kind, hostile) {
  const g = new THREE.Group(),
    body = hostile ? palette.hostileAir : palette.white;
  if (kind === "uav") {
    box(g, 0, 0, 0, 2.3, 1.2, 5, body);
    box(g, 0, 0.1, 0.5, 13, 0.22, 2.3, body);
    box(g, 0, 0.3, 2, 5, 0.2, 1.4, body);
    box(g, 0, 0.85, 2, 0.22, 1.5, 1.5, palette.trim);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2, 8), body);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -3.1;
    g.add(nose);
    box(g, 0, -0.7, -1, 0.65, 0.6, 0.65, palette.dark);
    g.userData.prop = box(g, 0, 0.05, -4.3, 3.4, 0.13, 0.15, palette.dark);
  } else if (["bullet", "autocannon", "tankCannon"].includes(kind))
    box(g, 0, 0, 0, 0.2, 0.2, 3, palette.bullet);
  else {
    const r = kind === "artillery" ? 0.3 : kind === "sam" ? 0.4 : 0.65,
      len = kind === "artillery" ? 1.3 : kind === "sam" ? 4 : 6;
    const shaft = cylinder(g, 0, 0, 0, r, r, len, body, 8);
    shaft.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(r, len * 0.32, 8),
      palette.steel,
    );
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -len * 0.66;
    g.add(nose);
    if (kind !== "artillery") {
      box(g, 0, 0, len * 0.3, r * 5, 0.16, 1.4, palette.trim);
      box(g, 0, 0, len * 0.3, 0.16, r * 5, 1.4, palette.trim);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(r * 0.72, 2.9, 6),
        palette.flame,
      );
      flame.rotation.x = Math.PI / 2;
      flame.position.z = len / 2 + 1.3;
      g.add(flame);
      g.userData.flame = flame;
    }
  }
  return g;
}
export class Renderer {
  constructor(canvas, mini) {
    this.canvas = canvas;
    this.mini = mini;
    this.miniCtx = mini.getContext("2d");
    this.meshes = new Map();
    this.trailMeshes = new Map();
    this.effectMeshes = new Map();
    this.ready = false;
    this.cameraKey = null;
    this.modelsReady = false;
    try {
      this.gl = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: "high-performance",
        alpha: false,
      });
      this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.gl.outputColorSpace = THREE.SRGBColorSpace;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color("#b8cbd0");
      this.scene.fog = new THREE.Fog("#b8c5ba", 230, 2400);
      this.camera = new THREE.PerspectiveCamera(62, 1, 0.35, 8000);
      this.scene.add(new THREE.HemisphereLight("#ddeef1", "#484535", 2.1));
      const sun = new THREE.DirectionalLight("#fff0d2", 2.3);
      sun.position.set(-240, 520, -250);
      this.scene.add(sun);
      this.exhaust = new MissileExhaust();
      this.explosions = new ExplosionEffects();
      this.explosionsPromise = this.explosions.ready.catch((e) => {
        this.explosionError = String(e);
        console.error("Explosion textures unavailable", e);
      });
      this.structureRenderer = new StructureRenderer(this.scene);
      this.structureRenderer.ready.catch((e) => {
        this.structureError = String(e);
      });
      this.createLandscape();
      this.hillsEnvironment=new HillsEnvironment();
      this.environmentPromise=this.hillsEnvironment.load().then(()=>this.createLandscape(true)).catch(e=>{this.environmentError=String(e);console.error('Hills assets unavailable',e);});
      this.ownTruck = truck();
      this.enemyTruck = truck(true);
      this.scene.add(this.ownTruck, this.enemyTruck);
      this.enemyTruck.visible = false;
      this.modelsPromise = this.loadVehicles().catch((e) => {
        this.modelError = String(e);
        console.error("Vehicle model unavailable", e);
        const panel = document.getElementById("graphicsError");
        panel.querySelector("h3").textContent = "车辆模型载入失败";
        panel.querySelector("p").textContent = "请重新打开游戏后重试。";
        panel.classList.remove("hidden");
      });
      this.arc = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineDashedMaterial({
          color: "#ffe58a",
          dashSize: 7,
          gapSize: 4,
          transparent: true,
          opacity: 1,
          depthTest: false,
          depthWrite: false,
        }),
      );
      this.arc.renderOrder = 11;
      this.scene.add(this.arc);
      this.hitRing = new THREE.Mesh(
        new THREE.RingGeometry(5, 7, 32),
        new THREE.MeshBasicMaterial({
          color: "#ff514b",
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.7,
          depthTest: false,
          depthWrite: false,
        }),
      );
      this.hitRing.rotation.x = -Math.PI / 2;
      this.hitRing.renderOrder = 12;
      this.scene.add(this.hitRing);
      const arrowShape = new THREE.Shape();
      for (const [i, [x, y]] of [
        [-3, 12],
        [3, 12],
        [3, 1],
        [9, 1],
        [0, -12],
        [-9, 1],
        [-3, 1],
      ].entries()) {
        if (i) arrowShape.lineTo(x, y);
        else arrowShape.moveTo(x, y);
      }
      arrowShape.closePath();
      this.landingArrow = new THREE.Mesh(
        new THREE.ShapeGeometry(arrowShape),
        new THREE.MeshBasicMaterial({
          color: "#ff3434",
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        }),
      );
      this.landingArrow.name = "artilleryLandingArrow";
      this.landingArrow.renderOrder = 13;
      this.scene.add(this.landingArrow);
      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(arrowShape.getPoints()),
        new THREE.LineBasicMaterial({
          color: "#ffe3d9",
          depthTest: false,
          depthWrite: false,
        }),
      );
      outline.renderOrder = 14;
      this.landingArrow.add(outline);
      this.enemyMarker = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(10, 11.2, 32),
        new THREE.MeshBasicMaterial({
          color: "#ffad7f",
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 10;
      this.enemyMarker.add(ring);
      const pin = new THREE.Mesh(
        new THREE.OctahedronGeometry(2.2),
        new THREE.MeshBasicMaterial({
          color: "#ffad7f",
          depthTest: false,
          depthWrite: false,
        }),
      );
      pin.position.y = 21;
      pin.renderOrder = 10;
      this.enemyMarker.add(pin);
      this.scene.add(this.enemyMarker);
      this.ready = true;
      this.resize();
      canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        this.ready = false;
        document.getElementById("graphicsError").classList.remove("hidden");
      });
      canvas.addEventListener("webglcontextrestored", () => location.reload());
    } catch (e) {
      console.error("3D renderer unavailable", e);
      document.getElementById("graphicsError").classList.remove("hidden");
    }
    window.addEventListener("resize", () => this.resize());
  }
  async loadVehicles() {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);const originals=new Map(),load=loader.loadAsync.bind(loader);loader.loadAsync=async path=>{if(!originals.has(path))originals.set(path,load(path));const gltf=await originals.get(path);return {...gltf,scene:gltf.scene.clone(true)};};
    this.vehicleModels = [{}, {}];
    for (let i = 0; i < 2; i++) {
      const av = (
          await loader.loadAsync(`models/m1097_${i ? "enemy" : "friendly"}.glb`)
        ).scene,
        bounds = new THREE.Box3().setFromObject(av),
        size = bounds.getSize(new THREE.Vector3()),
        center = bounds.getCenter(new THREE.Vector3());
      av.position.add(new THREE.Vector3(-center.x, -bounds.min.y, -center.z));
      const model = new THREE.Group();
      model.rotation.y = Math.PI / 2;
      model.scale.setScalar(4.84 / size.x);
      model.add(av);
      const wheels = splitAvengerWheels(model),
        launcher = articulateAvenger(model);
      this.vehicleModels[i].handlv_missile = {
        node: model,
        model: true,
        source: "M1097 Avenger",
        patches: 2,
        wheels,
        launcher,
      };
      const bear = (await loader.loadAsync("models/2s19.glb")).scene,
        bb = new THREE.Box3().setFromObject(bear),
        bs = bb.getSize(new THREE.Vector3()),
        bc = bb.getCenter(new THREE.Vector3()),
        scale = 11.91 / bs.z;
      const parts = articulateBear(bear, scale);
      bear.position.add(new THREE.Vector3(-bc.x, -bb.min.y, -bc.z));
      const bm = new THREE.Group();
      bm.scale.setScalar(scale);
      bm.add(bear);
      // Two small identification patches remain fixed on the chassis.
      box(
        bm,
        -1.82,
        1.7,
        0.5,
        0.05,
        0.3,
        0.65,
        i
          ? palette.hostileAir
          : new THREE.MeshLambertMaterial({ color: "#1679ed" }),
      );
      box(
        bm,
        1.82,
        1.7,
        0.5,
        0.05,
        0.3,
        0.65,
        i
          ? palette.hostileAir
          : new THREE.MeshLambertMaterial({ color: "#1679ed" }),
      );
      this.vehicleModels[i].longnose_artillery = {
        node: bm,
        model: true,
        source: "2S19 MSTA-S",
        ...parts,
      };
      const grille = (await loader.loadAsync("models/kfz_grille.glb")).scene,
        gun = [];
      grille.updateMatrixWorld(true);
      grille.traverse((o) => {
        if (o.isMesh && /polySurface387(05|23|06)_Gun/.test(o.name))
          gun.push(o);
      });
      if (gun.length !== 3) throw Error("KFZ barrel parts missing");
      const gb = new THREE.Box3();
      for (const o of gun) gb.union(new THREE.Box3().setFromObject(o));
      const pivot = new THREE.Group();
      pivot.position.set(
        gb.getCenter(new THREE.Vector3()).x,
        gb.getCenter(new THREE.Vector3()).y,
        gb.max.z - 0.3,
      );
      grille.add(pivot);
      grille.updateMatrixWorld(true);
      for (const o of gun) pivot.attach(o);
      this.vehicleModels[i].kfz_artillery = {
        node: grille,
        model: true,
        ...articulateKFZ(grille),
        barrel: pivot,
      };
    }
    for (let i = 0; i < 2; i++)
      this.vehicleModels[i].silver_valkyrie = articulateValkyrie(
        (await loader.loadAsync("models/silver_valkyrie.glb")).scene,
      );
    for (let i = 0; i < 2; i++)
      this.vehicleModels[i].grand_judicator = articulateJudicator(
        (await loader.loadAsync("models/grand_judicator.glb")).scene,
      );
    for (let i = 0; i < 2; i++)
      this.vehicleModels[i].b_tank = articulateTank(
        (await loader.loadAsync("models/panzer_ii.glb")).scene,
      );
    for (let i = 0; i < 2; i++)
      for (const [id, file] of [
        ["hero_tank", "is2.glb"],
        ["black_turtle", "shturm.glb"],
      ])
        this.vehicleModels[i][id] = articulateTierTwo(
          (await loader.loadAsync("models/" + file)).scene,
          id,
        );
    for (let i = 0; i < 2; i++)
      this.vehicleModels[i].cougar_artillery = articulateCougar(
        (await loader.loadAsync("models/m53m55.glb")).scene,
      );
    for (let i = 0; i < 2; i++) {
      this.vehicleModels[i].gladiator_kfz = articulateGladiator(
        (await loader.loadAsync("models/bison_kfz.glb")).scene,
      );
      this.vehicleModels[i].warhorse = articulateWarhorse(
        (await loader.loadAsync("models/panzer_iv.glb")).scene,
      );
      this.vehicleModels[i].annihilator_fv = articulateFV(
        (await loader.loadAsync("models/humber_fv.glb")).scene,
      );
    }
    let crimson;
    try{crimson=articulateCrimson((await loader.loadAsync('models/crimson_steel.glb')).scene);}
    catch(_){crimson=this.cloneVehicle(this.vehicleModels[0].warhorse);}
    this.vehicleModels[0].crimson_steel=crimson;this.vehicleModels[1].crimson_steel=this.cloneVehicle(crimson);
    let falcon;
    try{falcon=articulateFalcon((await loader.loadAsync("models/su100p.glb")).scene);}
    catch(_){falcon=this.cloneVehicle(this.vehicleModels[0].cougar_artillery);}
    this.vehicleModels[0].swift_falcon=falcon;this.vehicleModels[1].swift_falcon=this.cloneVehicle(falcon);
    for (const models of this.vehicleModels)
      for (const id of [
        "silver_valkyrie",
        "grand_judicator",
        "b_tank",
        "kfz_artillery",
        "hero_tank",
        "black_turtle",
        "cougar_artillery",
        "warhorse",
        "gladiator_kfz",
        "crimson_steel",
        "swift_falcon",
      ]) {
        const a = models[id],
          bounds = new THREE.Box3();
        a.node.updateMatrixWorld(true);
        for (const b of a.tracks.belts)
          bounds.union(b.contactBounds.clone().applyMatrix4(a.node.matrix));
        a.groundContact = {
          minY: bounds.min.y,
          halfWidth: Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
          front: bounds.min.z,
          rear: bounds.max.z,
        };
      }
    for (const models of this.vehicleModels) {
      const c = B.GUN_CONTACTS.annihilator_fv;
      models.annihilator_fv.groundContact = {
        minY: c[0],
        halfWidth: c[1],
        front: c[2],
        rear: c[3],
      };
    }
    for (const models of this.vehicleModels)
      for (const id of ["handlv_missile", "longnose_artillery"]) {
        models[id].groundContact = contactFromRunningGear(models[id]);
        const c = models[id].groundContact;
        B.GUN_CONTACTS[id] = [c.minY, c.halfWidth, c.front, c.rear];
      }
    for (const id of ["grand_judicator", "silver_valkyrie"]) {
      const gc = this.vehicleModels[0][id].groundContact;
      B.GUN_CONTACTS[id] = [gc.minY, gc.halfWidth, gc.front, gc.rear];
    }
    const kat=articulateKatyusha((await loader.loadAsync("models/katyusha.glb")).scene);this.vehicleModels[0].katyusha=kat;this.vehicleModels[1].katyusha=this.cloneVehicle(kat);const kc=kat.groundContact;B.GUN_CONTACTS.katyusha=[kc.minY,kc.halfWidth,kc.front,kc.rear];this.airModels = {};
    for (const [kind, file] of [
      ["reconPlane", "fi156.glb"],
      ["bomber", "ju87_redtail.glb"],
      ["uav", "uav.glb"],
    ])
      this.airModels[kind] = (await loader.loadAsync("models/" + file)).scene;
    this.airModels.po2=articulatePo2((await loader.loadAsync("models/po2.glb")).scene);
    const tow = (await loader.loadAsync("models/tow_missile.glb")).scene;
    const towBounds = new THREE.Box3().setFromObject(tow),
      towSize = towBounds.getSize(new THREE.Vector3()),
      towCenter = towBounds.getCenter(new THREE.Vector3());
    tow.position.sub(towCenter);
    const towRoot = new THREE.Group();
    towRoot.rotation.y = Math.PI;
    towRoot.scale.setScalar(1.17 / towSize.z);
    towRoot.add(tow);
    towRoot.userData.source = "Supplied BGM-71 TOW assembled missile";
    const flightRoot = new THREE.Group();
    flightRoot.add(towRoot);
    flightRoot.userData.noseAxis = "-Z";
    this.projectileModels = { tow: flightRoot };
    this.projectileModels.ss11 = (
      await loader.loadAsync("models/ss11_missile.glb")
    ).scene;
    this.projectileModels.hornet = (
      await loader.loadAsync("models/hornet_missile.glb")
    ).scene;
    this.projectileModels.m13=(await loader.loadAsync("models/m13_rocket.glb")).scene;
    const drone = this.airModels.uav,
      droneBounds = new THREE.Box3().setFromObject(drone),
      droneSize = droneBounds.getSize(new THREE.Vector3()),
      droneCenter = droneBounds.getCenter(new THREE.Vector3());
    drone.position.sub(droneCenter);
    const droneRoot = new THREE.Group();
    droneRoot.scale.setScalar(2 / droneSize.x);
    droneRoot.add(drone);
    droneRoot.userData.propNames = [];
    for (const [index, name] of ["UAV_Propeller", "UAV_Part_8"].entries()) {
      const blade = drone.getObjectByName(name);
      if (!blade) throw Error("UAV blade missing: " + name);
      droneRoot.updateMatrixWorld(true);
      const point = blade.getWorldPosition(new THREE.Vector3()),
        pivot = new THREE.Group();
      pivot.name = "uavPropellerPivot" + index;
      pivot.position.copy(droneRoot.worldToLocal(point));
      droneRoot.add(pivot);
      pivot.attach(blade);
      droneRoot.userData.propNames.push(pivot.name);
    }
    droneRoot.userData.source = "Supplied UAV";
    this.airModels.uav = droneRoot;
    this.switchVehicle(this.ownTruck, 0, B.DEFAULT_VEHICLE);
    this.switchVehicle(this.enemyTruck, 1, B.DEFAULT_VEHICLE);
    this.modelsReady = true;
    const preview = document.getElementById("vehiclePreview");
    if (preview?.dataset.vehicle)
      this.showPreview(preview, preview.dataset.vehicle);
  }
  cloneVehicle(asset) {
    const node = asset.node.clone(true),
      map = new Map();
    const pair = (a, b) => {
      map.set(a, b);
      if (a.isMesh && a.userData.thermalOriginal) {
        b.material = a.userData.thermalOriginal;
        delete b.userData.thermalOriginal;
        b.renderOrder = 0;
      }
      a.children.forEach((c, i) => pair(c, b.children[i]));
    };
    pair(asset.node, node);
    const copy = {
      ...asset,
      node,
      groundState: null,
      wheels: (asset.wheels || []).map((w) => ({
        ...w,
        pivot: map.get(w.pivot),
      })),
    };
    for (const k of [
      "turret",
      "barrel",
      "launcher",
      "spade",
      "mgYaw",
      "mgPitch",
    ])
      if (asset[k]) copy[k] = map.get(asset[k]);
    if(asset.rockets)copy.rockets=asset.rockets.map(r=>map.get(r));
    if (asset.launchers)
      copy.launchers = asset.launchers.map((l) => ({
        ...l,
        yaw: map.get(l.yaw),
        pitch: map.get(l.pitch),
        loaded: map.get(l.loaded),
      }));
    if (asset.tracks?.belts)
      copy.tracks = {
        belts: asset.tracks.belts.map((b) => {
          const mesh = map.get(b.mesh),
            uniform = { value: 0 },
            source = b.mesh.material;
          mesh.material = source.clone();
          mesh.material.onBeforeCompile = (shader) => {
            source.onBeforeCompile(shader);
            shader.uniforms.treadTravel = uniform;
          };
          mesh.material.customProgramCacheKey = () =>
            source.customProgramCacheKey();
          if(!b.gpu)mesh.geometry=b.mesh.geometry.clone();
          return { ...b, mesh, uniform, lastTravel:undefined };
        }),
      };
    else if (asset.tracks)
      copy.tracks = { ...asset.tracks, mesh: map.get(asset.tracks.mesh), lastTravel:undefined };
    return copy;
  }
  switchVehicle(g, role, id, friendly = false) {
    const sourceRole = friendly ? 0 : 1;
    if (friendly) role += 20;
    if (
      this.modelsReady &&
      !this.vehicleModels?.[role]?.[id] &&
      this.vehicleModels[sourceRole]?.[id]
    ) {
      this.vehicleModels[role] ||= {};
      this.vehicleModels[role][id] = this.cloneVehicle(
        this.vehicleModels[sourceRole][id],
      );
    }
    const asset = this.vehicleModels?.[role]?.[id || B.DEFAULT_VEHICLE];
    if (!asset) return;
    if (g.userData.vehicleId === id) {
      if (!g.userData.groundContact && asset.groundContact) {
        g.userData.groundContact = asset.groundContact;
        g.userData.groundState = null;
      }
      return;
    }
    clearCosmetics(g);
    if(!g.userData.model)this.disposeGroup(g);
    g.clear();
    g.add(asset.node);
    g.userData = { ...asset, vehicleId: id };
  }
  createLandscape(preserve = false) {
    if (this.landscape) {
      const materials=new Set(),geometries=new Set();this.landscape.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.isInstancedMesh)o.dispose();for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m&&!sharedMaterials.has(m))materials.add(m);});for(const g of geometries)g.dispose();for(const m of materials){if(m.userData.ownedMap)m.map?.dispose();m.dispose();}
      this.hillsEnvironment?.farMaterials?.dispose();
      this.scene.remove(this.landscape);
    }
    this.mapLOD=new MapLOD();
    this.landscape = new THREE.Group();
    this.landscape.name = "battleLandscape";
    this.scene.add(this.landscape);
    if (!preserve)
      this.landscapeMap = B.configureMap(
        this.landscapeMap || "hills",
        this.landscapeSize || 2000,
      );
    const geo = new THREE.PlaneGeometry(B.W + 1000, B.H + 1000, 140, 140);
    geo.rotateX(-Math.PI / 2);
    geo.translate(B.W / 2, 0, B.H / 2);
    const pos = geo.attributes.position,
      colors = [];
    const city = this.landscapeMap === "city",
      green = new THREE.Color(city ? "#85898c" : "#82896a"),
      sand = new THREE.Color(city ? "#a0a2a3" : "#b6a784"),
      rock = new THREE.Color(city ? "#72777b" : "#9b9581");
    this.scene.background.set(city ? "#bfc4c8" : "#b8cbd0");
    this.normalFog = new THREE.Fog(city ? "#bfc4c8" : "#b8c5ba", 230, 2400);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i),
        h = B.terrain(x, z);
      pos.setY(i, h);
      const color = green
        .clone()
        .lerp(
          sand,
          Math.min(1, 0.18 + 0.32 * (Math.sin(x * 0.04 + z * 0.014) + 1)),
        )
        .lerp(rock, B.clamp((h - 16) / 35, 0, 0.65));
      const jitter = 0.93 + 0.07 * Math.sin(x * 2 + z * 1.3);
      colors.push(color.r * jitter, color.g * jitter, color.b * jitter);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.landscape.add(
      new THREE.Mesh(geo, !city&&this.hillsEnvironment?.textures ? this.hillsEnvironment.material("grass",(B.W+1000)/6) : mat("#ffffff", { vertexColors: true })),
    );
    if (this.landscapeMap === "city") {
      for (let n = 0; n <= B.W; n += 200) {
        this.road(
          [
            [n, 0],
            [n, B.H],
          ],
          17,
        );
        this.road(
          [
            [0, n],
            [B.W, n],
          ],
          17,
        );
      }
      const water = new THREE.Mesh(
        new THREE.CircleGeometry(1, 64),
        mat("#538799", { transparent: true, opacity: 0.86 }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(B.LAKE.x, 0.25, B.LAKE.z);
      water.scale.set(B.LAKE.rx, B.LAKE.rz, 1);
      this.landscape.add(water);
    } else {
      this.road(
        [
          [140, 1850],
          [530, 1360],
          [960, 990],
          [620, 510],
          [810, 220],
          [1770, 140],
        ],
        9,
      );
      this.road(
        [
          [610, 1910],
          [1440, 1450],
          [1530, 1070],
          [1390, 690],
          [1840, 370],
        ],
        7,
      );
      this.road(
        [
          [620, 510],
          [960, 990],
          [1440, 1450],
        ],
        6,
      );
      this.road(
        [
          [530, 1360],
          [960, 990],
          [1390, 690],
        ],
        6,
      );
    }
    const wallVariants=city?cityMaterials():null;
    const cityWall = mat("#929699"),
      factoryWall = mat("#6e767b"),
      commercialWall = mat("#a5a8ab"),
      cityRoof = mat("#50575d"), hillWall=!city&&this.hillsEnvironment?.textures?this.hillsEnvironment.material("wall",4):palette.sand;
    const buildingGroups = [];
    for (const b of B.BUILDINGS) {
      if (b.structureId) continue;
      const g = new THREE.Group();
      g.position.set(b.x, B.terrain(b.x, b.z), b.z);
      box(
        g,
        0,
        b.h / 2,
        0,
        b.w,
        b.h,
        b.d,
        city
          ? b.district === "factory" || b.district === "chimney"
            ? factoryWall
            : b.district === "commercial"
              ? commercialWall
              : wallVariants[(Math.floor(b.x/80)+Math.floor(b.z/80))%wallVariants.length]
          : hillWall,
      );
      box(
        g,
        0,
        b.h + 0.4,
        0,
        b.w + 1,
        0.8,
        b.d + 1,
        city ? cityRoof : palette.roof,
      );
      for (const x of [-b.w * 0.28, b.w * 0.28])
        for (let y = 2.8; y < b.h - 1; y += 3.2)
          if (y < b.h - 1)
            box(g, x, y, -b.d / 2 - 0.03, 1.4, 1.5, 0.1, palette.glass);
      box(g, 0, 1.2, -b.d / 2 - 0.05, 1.4, 2.4, 0.12, palette.dark);
      if (b.district === "factory") {
        for (const x of [-b.w * 0.28, b.w * 0.28])
          box(g, x, 4, -b.d / 2 - 0.12, 18, 8, 0.2, palette.dark);
        box(g, 0, b.h + 1.5, 0, b.w * 0.75, 3, b.d * 0.25, cityRoof);
      }
      if (b.district === "commercial") {
        box(g, 0, 5, -b.d / 2 - 0.3, b.w * 0.8, 3, 0.5, mat("#415b65"));
        for (const x of [-b.w * 0.3, 0, b.w * 0.3])
          box(g, x, 1.8, -b.d / 2 - 0.3, 18, 3.6, 0.35, palette.glass);
      }
      if(city)for(const m of g.children){if(!m.material.map)continue;const uv=m.geometry.attributes.uv;const p=m.geometry.attributes.position;for(let i=0;i<uv.count;i++){const normal=m.geometry.attributes.normal;uv.setXY(i,(Math.abs(normal.getX(i))>.5?p.getZ(i):p.getX(i))/8,p.getY(i)/8);}}
      buildingGroups.push(g);
    }
    this.buildingCellCount=batchBuildings(buildingGroups,this.landscape,this.mapLOD);
    let seed = 7919;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    if(this.hillsEnvironment?.models)this.hillsEnvironment.populate(this.landscape,B,{lod:this.mapLOD,rocks:!city,grass:!city});
    else {
    const treeCount = B.TREES.length,
      trees = new THREE.InstancedMesh(
        new THREE.ConeGeometry(4.6, 14, 6),
        mat("#4e6553"),
        treeCount,
      ),
      trunks = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.4, 0.65, 5, 5),
        mat("#6d6351"),
        treeCount,
      ),
      dummy = new THREE.Object3D();
    for (let i = 0; i < treeCount; i++) {
      const { x, z, y: h, scale, yaw } = B.TREES[i];
      dummy.position.set(x, h + 9 * scale, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.y = yaw;
      dummy.updateMatrix();
      trees.setMatrixAt(i, dummy.matrix);
      dummy.position.y = h + 2.5 * scale;
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
    }
    this.landscape.add(trees, trunks);
    if (B.BUSHES.length) {
      const count = B.BUSHES.length * 48,
        grass = new THREE.InstancedMesh(
          new THREE.IcosahedronGeometry(1, 0),
          mat("#647e43", { vertexColors: false }),
          count,
        );
      grass.name = "concealmentBushes";
      const color = new THREE.Color();
      let i = 0;
      for (const patch of B.BUSHES)
        for (let n = 0; n < 48; n++) {
          const a = n * 2.399963,
            r = patch.radius * Math.sqrt((n + 0.5) / 48),
            x = patch.x + Math.cos(a) * r,
            z = patch.z + Math.sin(a) * r,
            h = 0.8 + 0.5 * (Math.sin(n * 7.1 + patch.x) + 1);
          dummy.position.set(x, B.terrain(x, z) + h * 0.55, z);
          dummy.rotation.set(0.18 * Math.sin(n), a, 0.15 * Math.cos(n));
          dummy.scale.set(
            1.3 + 0.5 * Math.sin(n * 3) ** 2,
            h,
            1.1 + 0.6 * Math.cos(n * 2) ** 2,
          );
          dummy.updateMatrix();
          grass.setMatrixAt(i, dummy.matrix);
          color.setHSL(
            0.23 + 0.025 * Math.sin(n * 5),
            0.27,
            0.24 + (0.1 * (Math.sin(n * 3) + 1)) / 2,
          );
          grass.setColorAt(i++, color);
        }
      grass.instanceColor.needsUpdate = true;
      this.landscape.add(grass);
    }
    }
    const ridgeMat = mat("#899c93");
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2,
        r = 2300 + random() * 200,
        g = new THREE.Mesh(
          new THREE.ConeGeometry(150 + random() * 140, 110 + random() * 150, 6),
          ridgeMat,
        );
      g.position.set(
        B.W / 2 + Math.sin(angle) * r,
        40,
        B.H / 2 + Math.cos(angle) * r,
      );
      g.rotation.y = random() * 3;
      this.landscape.add(g);
    }
    const cloudMat = new THREE.MeshBasicMaterial({
      color: "#e5ece2",
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    for (let i = 0; i < 12; i++) {
      const cloud = new THREE.Mesh(
        new THREE.SphereGeometry(1, 12, 6),
        cloudMat,
      );
      cloud.position.set(
        -300 + random() * (B.W + 600),
        230 + random() * 100,
        -300 + random() * (B.H + 600),
      );
      cloud.scale.set(
        110 + random() * 65,
        12 + random() * 8,
        40 + random() * 45,
      );
      this.landscape.add(cloud);
    }
    const boundary = [];
    for (const [x, z] of [
      [0, 0],
      [B.W, 0],
      [B.W, B.H],
      [0, B.H],
      [0, 0],
    ])
      boundary.push(new THREE.Vector3(x, B.terrain(x, z) + 0.8, z));
    const border = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(boundary),
      new THREE.LineDashedMaterial({
        color: "#dec693",
        dashSize: 15,
        gapSize: 12,
        transparent: true,
        opacity: 0.55,
      }),
    );
    border.computeLineDistances();
    this.landscape.add(border);
    freezeStaticScenery(this.landscape);
    for (const old of this.shadows || []) this.scene.remove(old);
    this.shadows = [];
    for (let i = 0; i < 2; i++) {
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(1, 24),
        new THREE.MeshBasicMaterial({
          color: "#263a2a",
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(1.3, 2.5, 1);
      this.landscape.add(shadow);
      this.shadows.push(shadow);
    }
  }
  road(points,width){
    const scale=this.landscapeMap==='city'?1:B.W/2000;points=points.map(([x,z])=>[x*scale,z*scale]);const vertices=[],marks=[];
    for(let j=0;j<points.length-1;j++){
      const[a,b]=[points[j],points[j+1]],length=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/length,nz=(b[0]-a[0])/length;
      const q=(d,o,y)=>{const x=a[0]+(b[0]-a[0])*d/length+nx*o,z=a[1]+(b[1]-a[1])*d/length+nz*o;return[x,B.terrain(x,z)+y,z];};
      for(let d=0;d<length;d+=4){const end=Math.min(length,d+4),steps=Math.ceil(width);for(let w=0;w<steps;w++){const lo=-width+w*2*width/steps,hi=-width+(w+1)*2*width/steps;vertices.push(...q(d,lo,.2),...q(d,hi,.2),...q(end,lo,.2),...q(d,hi,.2),...q(end,hi,.2),...q(end,lo,.2));}if(d%36<12)marks.push(...q(d,-.2,.25),...q(d,.2,.25),...q(end,-.2,.25),...q(d,.2,.25),...q(end,.2,.25),...q(end,-.2,.25));}
    }
    for(const[v,color]of[[vertices,'#5c625a'],[marks,'#bfc2aa']]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));let material;
      if(v===vertices&&this.hillsEnvironment?.textures){const uv=[];for(let i=0;i<v.length;i+=3)uv.push(v[i]/6,v[i+2]/6);g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));material=this.hillsEnvironment.material('asphalt');}else material=mat(color);material.side=THREE.DoubleSide;material.polygonOffset=true;material.polygonOffsetFactor=v===vertices?-2:-3;material.polygonOffsetUnits=-2;g.computeVertexNormals();const mesh=new THREE.Mesh(g,material);mesh.name=v===vertices?'asphaltRoad':'roadMarkings';this.landscape.add(mesh);
    }
  }
  resize() {
    if (!this.ready) return;
    const width = this.canvas.clientWidth || innerWidth,
      height = this.canvas.clientHeight || innerHeight;
    this.gl.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.mini.width = 228;
    this.mini.height = 228;
  }
  orient(g, s) {
    g.position.set(s.x, s.y, s.z);
    g.rotation.set(s.pitch, -s.yaw, 0, "YXZ");
  }
  updateTruck(g, p, selected, t) {
    if(g===this.ownTruck&&this.cosmeticProfile){applyCosmetics(g,this.cosmeticProfile.vehicleStyle(p.vehicleId));swingCosmetics(g,p,t);}
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = -p.yaw;
    if(g.userData.lowDetail){g.rotation.set(0,-p.yaw,0);g.position.y=p.y+.15;return;}
    applyGroundContact(g, p, B.terrain, this.landscapeMap);
    if (g.userData.model) {
      for(const [i,r]of (g.userData.rockets||[]).entries())r.visible=i>=16-(p.rocketAmmo??16);
      if(g.userData.vehicleId==='crimson_steel'&&(g.userData.suspensionAt===undefined||t-g.userData.suspensionAt>.1)){
        g.userData.suspensionAt=t;g.updateMatrixWorld(true);const point=this.suspensionPoint||(this.suspensionPoint=new THREE.Vector3());
        for(const w of g.userData.wheels){w.restY??=w.pivot.position.y;point.set(w.pivot.position.x,w.restY-w.radius,w.pivot.position.z).applyMatrix4(g.matrixWorld);w.pivot.position.y=w.restY+B.clamp(B.terrain(point.x,point.z)+.15-point.y,-.06,.06);}
      }
      for (const w of g.userData.wheels || [])
        w.pivot.rotation[w.axis || "y"] =
          (-(w.side && p.trackTravel
            ? p.trackTravel[w.side]
            : p.wheelTravel || 0) /
            w.radius) *
          w.axisSign;
      if (
        g.userData.launcherAxis &&
        ["uav", "missile", "sam"].includes(selected)
      )
        g.userData.launcherWeapon = selected;
      const a = p.aim?.[
        g.userData.mainGun ||
          g.userData.launcherWeapon ||
          (g.userData.vehicleId === "b_tank" ? "autocannon" : selected)
      ] || { yaw: p.yaw, pitch: 0 };

      if (g.userData.launchers) {
        const aim = p.aim.missile,
          rel = B.wrap(aim.yaw - p.yaw);
        for (const [i, l] of g.userData.launchers.entries()) {
          l.yaw.rotation.y = -B.clamp(
            rel,
            i === 0 ? -Math.PI / 2 : 0,
            i === 0 ? 0 : Math.PI / 2,
          );
          l.pitch.rotation.x = aim.pitch;
          l.loaded.visible = !(p.launcherReloadLeft?.[i] > 0);
        }
        const mg = p.aim.mg,
          m = B.PREMIUM_MODELS.silver_valkyrie.mounts.mg;
        g.userData.mgYaw.rotation.y = -B.wrap(mg.yaw - p.yaw);
        g.userData.mgPitch.rotation.x =
          mg.pitch - Math.atan2(m.tip[1] - m.pivot[1], m.pivot[2] - m.tip[2]);
      }
      if(g.userData.vehicleId==='crimson_steel'&&g.userData.mgYaw){
        g.userData.mgYaw.rotation.y=-B.wrap(p.aim.mg.yaw-p.aim.tankCannon.yaw);
        g.userData.mgPitch.rotation.x=p.aim.mg.pitch-Math.atan2(.02118279,1.27107795);
      }
      if (g.userData.spade) {
        const delta =
          g.userData.spadeAt === undefined
            ? 0
            : Math.max(0, Math.min(0.1, t - g.userData.spadeAt));
        g.userData.spade.rotation.x =
          g.userData.spadeAt === undefined
            ? p.spadeDeployed
              ? g.userData.spadeAngle
              : 0
            : THREE.MathUtils.damp(
                g.userData.spade.rotation.x,
                p.spadeDeployed ? g.userData.spadeAngle : 0,
                5,
                delta,
              );
        g.userData.spadeAt = t;
      }
      if (
        g.userData.launcher &&
        !B.vehicleSpec(g.userData.vehicleId).launcherFixed
      )
        g.userData.launcher.rotation[g.userData.launcherAxis || "z"] = -(
          a.yaw - p.yaw
        );
      if (g.userData.turret)
        g.userData.turret.rotation[g.userData.turretAxis || "z"] = -(
          a.yaw - p.yaw
        );
      if (g.userData.barrel)
        g.userData.barrel.rotation.x =
          g.userData.mainGun || g.userData.launcherAxis
            ? g.userData.barrelSign *
              (a.pitch - B.gunRestPitch(g.userData.vehicleId))
            : ["artillery", "autocannon"].includes(selected) ||
                g.userData.vehicleId === "b_tank"
              ? g.userData.vehicleId === "b_tank"
                ? -(a.pitch - B.gunRestPitch(g.userData.vehicleId))
                : a.pitch - B.gunRestPitch(g.userData.vehicleId)
              : 0;
      if (
        g.userData.tracks &&
        g.userData.lastTravel !==
          `${p.wheelTravel}:${p.trackTravel?.left}:${p.trackTravel?.right}`
      ) {
        (g.userData.tracks.belts ? rollBelts : rollTracks)(
          g.userData.tracks,
          g.userData.tracks.belts
            ? p.trackTravel || p.wheelTravel || 0
            : p.wheelTravel || 0,
        );
        g.userData.lastTravel = `${p.wheelTravel}:${p.trackTravel?.left}:${p.trackTravel?.right}`;
      }
      return;
    }
    const a = p.aim[selected];
    g.userData.turret.rotation.y = -(a.yaw - p.yaw);
    g.userData.arm.rotation.x = a.pitch;
    g.userData.mg.rotation.x = selected === "mg" ? a.pitch : 0;
    for (const w of g.userData.wheels || [])
      w.rotation.x = -(p.wheelTravel || 0) / 1.65;
  }
  draw(view, t, dt = 0.016) {
    if (!this.ready) return;
    if (
      view?.field?.mapId &&
      (view.field.mapId !== this.landscapeMap ||
        view.field.width !== this.landscapeSize)
    )
      this.setMap(view.field.mapId, view.field.width);
    this.vehiclePresentation ||= new VehiclePresentation();
    const presentationKey=view?`${view.seed}:${view.field?.mapId}:${view.battleMode}`:'menu';
    if(presentationKey!==this.presentationKey){this.vehiclePresentation.clear();this.presentationKey=presentationKey;}
    this.renderBudget ||= new BattleRenderBudget(Math.min(window.devicePixelRatio||1,1.5));
    const heavy=!!view&&(view.battleMode==='dark_forest'||(view.team?.alive||[]).reduce((a,b)=>a+b,0)>=8);
    const ratio=this.renderBudget.update(dt,heavy);
    if(this.gl.getPixelRatio()!==ratio){this.gl.setPixelRatio(ratio);this.resize();}
    const demo = !view;
    const p = view
      ? this.vehiclePresentation.sample('own',view.own,view.t,t)
      : {
          vehicleId: this.menuVehicle || B.DEFAULT_VEHICLE,
          x: 195,
          y: B.terrain(195, 935),
          z: 935,
          yaw: 0.62,
          speed: 0,
          aim: Object.fromEntries(
            Object.keys(B.C).map((k) => [k, { yaw: 0.62, pitch: 0.35 }]),
          ),
          selected: B.vehicleSpec(this.menuVehicle || B.DEFAULT_VEHICLE).weapons[0],
          pilot: null,
        };
    this.canvas.classList.toggle(
      "thermal-active",
      !!this.gunSight && B.Wire.thermal(p),
    );
    this.switchVehicle(this.ownTruck, 0, p.vehicleId || B.DEFAULT_VEHICLE);
    this.updateTruck(this.ownTruck, p, p.selected, t);
    this.shadows[0].position.set(p.x, p.y + 0.15, p.z);
    this.shadows[0].rotation.z = p.yaw;
    const footprint = B.vehicleSpec(p.vehicleId).dimensions,
      offset = B.vehicleSpec(p.vehicleId).collisionOffset || 0;
    this.shadows[0].position.x += Math.sin(p.yaw) * offset;
    this.shadows[0].position.z -= Math.cos(p.yaw) * offset;
    this.shadows[0].scale.set(footprint.width / 2, footprint.length / 2, 1);
    this.enemyTruck.visible = false;
    this.enemyMarker.visible = false;
    this.shadows[1].visible = false;
    this.enemyFleet ||= new Map();
    const contacts = view
        ? [
            ...(view.enemies || [view.enemy].filter(Boolean)),
            ...(view.allies || []),
          ]
        : [],
      seen = new Set();
    for (const contact of contacts) {
      const id = contact.id ?? 1;
      const enemy=this.vehiclePresentation.sample(id,contact,contact.t??view.t,t);
      seen.add(id);
      let g = this.enemyFleet.get(id);
      if (!g) {
        g = truck(true);
        this.enemyFleet.set(id, g);
        this.scene.add(g);
      }
      g.visible = true;
      this.switchVehicle(
        g,
        id,
        enemy.vehicleId,
        !!view?.team && enemy.team === view.team.id,
      );
      const low=useLowVehicle(this.camera,enemy,B.vehicleSpec(enemy.vehicleId),this.canvas.clientHeight||390,g.userData.lowDetail);
      if(low&&!g.userData.lowMesh){g.userData.lowMesh=lowVehicle(B.vehicleSpec(enemy.vehicleId),!!view?.team&&enemy.team===view.team.id);g.add(g.userData.lowMesh);}
      g.userData.lowDetail=low;
      if(g.userData.node)g.userData.node.visible=!low;
      if(g.userData.lowMesh)g.userData.lowMesh.visible=low;
      this.updateTruck(
        g,
        { ...enemy, aim: enemy.aim || p.aim },
        enemy.selected || "missile",
        t,
      );
      this.thermalMaterial ||= new THREE.MeshBasicMaterial({
        color: "#fff4dc",
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const hot = !!enemy.thermal && this.gunSight && B.Wire.thermal(p);
      if (g.userData.thermalHot !== hot)
        g.traverse((mesh) => {
          if (!mesh.isMesh) return;
          if (hot) {
            if (!mesh.userData.thermalOriginal)
              mesh.userData.thermalOriginal = mesh.material;
            mesh.material = this.thermalMaterial;
            mesh.renderOrder = 20;
          } else if (mesh.userData.thermalOriginal) {
            mesh.material = mesh.userData.thermalOriginal;
            delete mesh.userData.thermalOriginal;
            mesh.renderOrder = 0;
          }
        });
      g.userData.thermalHot = hot;
    }
    for (const [id, g] of this.enemyFleet) if (!seen.has(id)) g.visible = false;
    seen.add('own');this.vehiclePresentation.forgetExcept(seen);
    this.zoneRing ||= (() => {
      const g = new THREE.LineLoop(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: "#8beb8a",
          transparent: true,
          opacity: 0.9,
        }),
      );
      g.frustumCulled = false;
      this.scene.add(g);
      return g;
    })();
    this.zoneRing.visible = !!view?.zone;
    if (view?.zone) {
      const zone = view.zone,
        key = `${this.landscapeMap}:${zone.x}:${zone.z}:${zone.radius}`;
      if (this.zoneRingKey !== key) {
        this.zoneRingKey = key;
        updatePolyline(
          this.zoneRing,
          Array.from({ length: 128 }, (_, i) => {
            const a = (i / 128) * Math.PI * 2,
              x = zone.x + Math.sin(a) * zone.radius,
              z = zone.z + Math.cos(a) * zone.radius;
            return { x, y: B.terrain(x, z) + 3, z };
          }),
        );
      }
    }
    this.structureRenderer.update(view?.structures || []);
    const active = new Set();
    for (const s of view ? view.shots : []) {
      active.add(s.id);
      let g = this.meshes.get(s.id);
      if (!g) {
        const imported =
          this.projectileModels?.[s.model]
            ? this.projectileModels[s.model]
            : this.airModels?.[s.model] || this.airModels?.[s.kind];
        g =
          imported?.clone(true) ||
          (s.kind === "bomb" ? bombModel() : aircraft(s.kind, !s.mine));
        g.userData.sharedAsset = !!imported;if(!imported){const owned=new Set();g.traverse(o=>{for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m&&!sharedMaterials.has(m))owned.add(m);});g.userData.ownedMaterials=owned;}
        g.userData.assetKind =
          s.kind === "missile" && s.model ? s.model : s.kind;
        if (g.userData.propNames)
          g.userData.props = g.userData.propNames.map((name) =>
            g.getObjectByName(name),
          );
        if ((["missile", "sam"].includes(s.kind)||s.model==="m13") && this.exhaust) {
          if (g.userData.flame) {
            g.remove(g.userData.flame);
            g.userData.flame.geometry.dispose();
            delete g.userData.flame;
          }
          this.exhaust.attach(g);
        }
        if (s.kind === "bomber") {
          const bomb = bombModel();
          bomb.position.y = -1.4;
          g.add(bomb);
          g.userData.bomb = bomb;
        }
        this.meshes.set(s.id, g);
        this.scene.add(g);
      }
      this.orient(g, s);
      if (g.userData.bomb) g.userData.bomb.visible = s.bombs !== 0;
      for (const [i, prop] of (g.userData.props || []).entries())
        prop.rotation.z = t * 50 * (i ? -1 : 1);
      if (g.userData.exhaust) this.exhaust.update(g, t);
      if (g.userData.flame)
        g.userData.flame.scale.y = 0.75 + 0.25 * Math.sin(t * 70);
    }
    for (const [id, g] of this.meshes)
      if (!active.has(id)) {
        this.scene.remove(g);
        this.disposeGroup(g);
        this.meshes.delete(id);
      }
    const trailIds = new Set();
    for (const tr of view ? view.trails : []) {
      trailIds.add(tr.id);
      let line = this.trailMeshes.get(tr.id);
      if (!line) {
        line = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({
            color: "#ffffff",
            transparent: true,
            opacity: 0.72,
          }),
        );
        line.frustumCulled = false;
        this.scene.add(line);
        this.trailMeshes.set(tr.id, line);
      }
      updatePolyline(line, tr.points);
      line.material.opacity =
        0.66 * Math.max(0.12, 1 - tr.points[tr.points.length - 1].age / 8);
    }
    for (const [id, line] of this.trailMeshes)
      if (!trailIds.has(id)) {
        this.scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
        this.trailMeshes.delete(id);
      }
    if(!this.smokeMesh){
      this.smokeMesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,2),new THREE.MeshLambertMaterial({color:'#8e9692',transparent:true,opacity:.86,depthWrite:false,side:THREE.DoubleSide}),96);
      this.smokeMesh.frustumCulled=false;this.scene.add(this.smokeMesh);this.smokeMatrix=new THREE.Matrix4();
    }
    let smokeCount=0;
    for(const s of view?.smokes||[]){for(let i=0;i<3&&smokeCount<96;i++){
      const age=view.t-s.born,grow=Math.min(1,.4+age*.6),fade=Math.min(1,s.left);
      this.smokeMatrix.makeScale(s.radius*grow,6*fade,s.radius*grow);
      this.smokeMatrix.setPosition(s.x+Math.sin(i*2.1)*s.radius*.18,s.y+5,s.z+Math.cos(i*2.1)*s.radius*.18);
      this.smokeMesh.setMatrixAt(smokeCount++,this.smokeMatrix);
    }}
    this.smokeMesh.count=smokeCount;this.smokeMesh.visible=smokeCount>0;this.smokeMesh.instanceMatrix.needsUpdate=true;
    const effectIds = new Set();
    for (const e of view ? view.effects : []) {
      effectIds.add(e.id);
      let g = this.effectMeshes.get(e.id);
      if (!g) {
        if (e.kind === "crater") {
          g = new THREE.Mesh(
            new THREE.CircleGeometry(e.radius, 16),
            new THREE.MeshBasicMaterial({
              color: "#4b473b",
              transparent: true,
              opacity: 0.4,
              depthWrite: false,
            }),
          );
          g.rotation.x = -Math.PI / 2;
        } else if(e.kind==='gunSmoke'){
          g=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshLambertMaterial({color:'#9da49b',transparent:true,opacity:.5,depthWrite:false}));
        } else if (e.kind === "muzzle") {
          g = new THREE.Mesh(
            new THREE.SphereGeometry(1, 8, 6),
            new THREE.MeshBasicMaterial({
              color: "#ffcf65",
              transparent: true,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          );
        } else if (
          e.kind === "explosion" &&
          this.explosions?.textures.size === 3
        )
          g = this.explosions.create(e);
        else if (e.kind === "explosion")
          continue; // Start at current age when textures arrive.
        else
          g = new THREE.Mesh(
            new THREE.IcosahedronGeometry(1, 0),
            new THREE.MeshBasicMaterial({
              color: "#fff4bf",
              transparent: true,
              opacity: 0.8,
              depthWrite: false,
            }),
          );
        this.effectMeshes.set(e.id, g);
        this.scene.add(g);
      }
      if (g.userData.explosion) this.explosions.update(g, e);
      else if (e.kind === "muzzle") {
        g.position.set(e.x, e.y, e.z);
        g.scale.setScalar(e.radius * (1 - e.age / e.life));
        g.material.opacity = Math.max(0, 1 - e.age / e.life);
      } else {
        g.position.set(e.x, e.y, e.z);
        if (e.kind !== "crater") {
          g.scale.setScalar(Math.max(0.2, e.radius * (0.2 + e.age * 0.8)));
          g.material.opacity = Math.max(0, 0.7 * (1 - e.age / e.life));
        }
      }
    }
    for (const [id, g] of this.effectMeshes)
      if (!effectIds.has(id)) {
        this.scene.remove(g);
        g.geometry.dispose();
        g.material.dispose();
        this.effectMeshes.delete(id);
      }
    const pilot = view && view.shots.find((s) => s.id === p.pilot && s.mine);
    this.arc.visible = !demo && !pilot && p.selected === "artillery";
    this.hitRing.visible = this.arc.visible;
    this.landingArrow.visible = false;
    this.lastArc = this.arc.visible ? this.artilleryPreview(p) : null;
    if (this.arc.visible) {
      const arc = this.lastArc;
      if (this.arcBufferKey !== this.arcCacheKey) {
        updatePolyline(this.arc, arc.points, true);
        this.arcBufferKey = this.arcCacheKey;
      }
      this.hitRing.visible = !!arc.hit;
      if (arc.hit)
        this.hitRing.position.set(arc.hit.x, arc.hit.y + 0.35, arc.hit.z);
    }
    const desired = (this.desiredCamera ||= new THREE.Vector3()),
      target = (this.targetCamera ||= new THREE.Vector3());
    let key;
    this.menuPlatform ||= (() => {
      const platform = new THREE.Mesh(
        new THREE.BoxGeometry(24, 0.12, 24),
        mat("#777b7a"),
      );
      this.scene.add(platform);
      return platform;
    })();
    this.menuPlatform.visible = demo;
    if (demo)
      this.menuPlatform.position.set(p.x, B.terrain(p.x, p.z) + 0.08, p.z);
    if (demo) {
      const height = B.vehicleSpec(p.vehicleId).dimensions.height,
        length = B.vehicleSpec(p.vehicleId).totalLength || B.vehicleSpec(p.vehicleId).dimensions.length,
        distance = Math.max(7, height * 2.8, length * 0.9);
      desired.set(
        p.x + Math.sin(this.menuYaw??Math.PI/4)*distance*1.14*(this.menuZoom||1),
        this.ownTruck.position.y + height*.55 + Math.sin(this.menuPitch??.35)*distance*(this.menuZoom||1),
        p.z - Math.cos(this.menuYaw??Math.PI/4)*distance*1.14*(this.menuZoom||1),
      );
      target.set(p.x, this.ownTruck.position.y + height * 0.55, p.z);
      key = "demo" + p.vehicleId;
      target.y = this.ownTruck.position.y + height * 0.25;
      this.camera.fov = 48;
    } else if (this.mapAim && !pilot && p.selected === "artillery") {
      this.mapCenter ||= { x: p.x, z: p.z };
      this.mapHeight ||= 800;
      desired.set(this.mapCenter.x, this.mapHeight, this.mapCenter.z);
      target.set(this.mapCenter.x, 0, this.mapCenter.z);
      key = "mapAim";
      this.camera.fov = 58;
    } else if (this.gunSight && canUseGunSight(p)) {
      const a = p.aim[p.selected],
        d = B.projectileDirection(p, p.selected),
        m = B.muzzle(p, p.selected);
      desired.set(m.x, m.y, m.z);
      target.set(
        desired.x + d.x * 1000,
        desired.y + d.y * 1000,
        desired.z + d.z * 1000,
      );
      key = "gunSight" + p.vehicleId;
      this.camera.fov = GUN_SIGHT_FOV;
    } else if (pilot) {
      const d = B.direction(pilot.yaw, pilot.pitch),
        small = ["uav", "missile"].includes(pilot.kind),
        model = this.meshes.get(pilot.id);
      if (small && model) {
        frameFlight(this.camera, model, pilot, d, desired, target, B.terrain);
      } else {
        desired.set(
          pilot.x - d.x * 20,
          pilot.y - d.y * 20 + 10,
          pilot.z - d.z * 20,
        );
        target.set(
          pilot.x + d.x * 45,
          pilot.y + d.y * 45 - 3,
          pilot.z + d.z * 45,
        );
      }
      key = "flight" + pilot.id;
      this.camera.fov = 68;
    } else {
      const a = p.aim[p.selected];
      (this.chaseFraming ||= new ChaseCamera()).update(
        this.ownTruck,
        p,
        a,
        desired,
        target,
      );
      key = "truck" + p.vehicleId;
      this.camera.fov = 62;
    }
    this.camera.near =
      pilot && ["uav", "missile"].includes(pilot.kind) ? 0.04 : 0.35;
    this.camera.up.set(0, key === "mapAim" ? 0 : 1, key === "mapAim" ? -1 : 0);
    if (key === "mapAim" || key !== this.cameraKey) {
      this.camera.position.copy(desired);
      this.look = target.clone();
      this.cameraKey = key;
    } else if (
      key.startsWith("flight") &&
      ["uav", "missile"].includes(pilot?.kind)
    ) {
      this.camera.position.copy(desired);
      this.look.copy(target);
    } else if (key.startsWith("gunSight")) {
      this.camera.position.copy(desired);
      this.look.copy(target);
    } else {
      this.camera.position.lerp(desired, 1 - Math.exp(-dt * 11));
      this.look.lerp(target, 1 - Math.exp(-dt * 13));
    }
    this.camera.lookAt(this.look);
    if (
      this.projectionFov !== this.camera.fov ||
      this.projectionAspect !== this.camera.aspect ||
      this.projectionNear !== this.camera.near
    ) {
      this.camera.updateProjectionMatrix();
      this.projectionFov = this.camera.fov;
      this.projectionAspect = this.camera.aspect;
      this.projectionNear = this.camera.near;
    }
    const landing = this.lastArc && this.lastArc.hit;
    this.landingArrow.visible = !!landing;
    if (landing) {
      const distance = this.camera.position.distanceTo(
          new THREE.Vector3(landing.x, landing.y, landing.z),
        ),
        scale = B.clamp(
          ((distance *
            2 *
            Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) /
            innerHeight) *
            (28 / 24),
          0.6,
          9,
        );
      this.landingArrow.scale.setScalar(scale);
      this.landingArrow.position.set(
        landing.x,
        landing.y + scale * (15 + Math.sin(t * 3) * 1.5),
        landing.z,
      );
      this.landingArrow.quaternion.copy(this.camera.quaternion);
    }
    this.scene.fog = this.mapAim
      ? null
      : (this.normalFog ||= new THREE.Fog("#b8c5ba", 230, 2400));
    for (const g of this.effectMeshes.values())
      if (g.userData.explosion) g.quaternion.copy(this.camera.quaternion);
    this.camera.updateMatrixWorld();
    if (view) {
      this.drawEnemyDots(view);
      this.structureRenderer.labels(view.structures || [], this.camera);
    } else {
      document.getElementById("enemyDots").replaceChildren();
      this.enemyDotNodes?.clear();
    }
    const scoped = this.gunSight && canUseGunSight(p);
    if (scoped) this.ownTruck.visible = false;
    this.mapLOD.update(this.camera);
    this.gl.render(this.scene, this.camera);
    if (scoped) this.ownTruck.visible = true;
    if (view) {
      if (
        this.miniDrawAt === undefined ||
        t - this.miniDrawAt >= 0.1 ||
        t < this.miniDrawAt
      ) {
        this.drawMini(view);
        this.miniDrawAt = t;
      }
      this.updateReticle(p, pilot);
      this.drawScope(p, this.lastArc);
    }
  }
  artilleryPreview(p) {
    const a = p.aim.artillery,
      key = `${this.landscapeMap}:${p.vehicleId}:${p.x}:${p.y}:${p.z}:${a.yaw}:${a.pitch}`;
    if (this.arcCacheKey !== key) {
      this.arcCacheKey = key;
      this.arcCache = B.ballistic(p);
    }
    return this.arcCache;
  }
  setMap(id, size = 2000) {
    if (this.landscapeMap === id && this.landscapeSize === size) return;
    this.landscapeMap = id;
    this.landscapeSize = size;
    B.configureMap(id, size);
    this.createLandscape();
    this.mapCenter = null;
    this.cameraKey = null;
  }
  panMap(dx, dy) {
    this.mapCenter ||= { x: 1000, z: 1000 };
    const span =
      (2 * (this.mapHeight || 800) * Math.tan((Math.PI * 29) / 180)) /
      innerHeight;
    this.mapCenter.x = B.clamp(this.mapCenter.x - dx * span, 0, B.W);
    this.mapCenter.z = B.clamp(this.mapCenter.z - dy * span, 0, B.H);
  }
  zoomMap(f) {
    this.mapHeight = B.clamp((this.mapHeight || 800) * f, 140, 2600);
  }
  async showCharmPreview(canvas,index,wear=0){await ensureCharm(index);if(!canvas.isConnected)return;const source=charmModel(index);if(!source)return;const node=source.clone(true);applyCharmWear(node,wear,index+17);this.vehicleModels[0]['charm-preview']={node};this.showPreview(canvas,'charm-preview');}
  showPreview(canvas, id, overrideStyle, focusSide) {
    canvas.dataset.vehicle=id;
    const asset = this.vehicleModels?.[0]?.[id];
    if (!asset) {
      canvas.dataset.vehicle = id;
      return;
    }
    const previousOrbit=this.preview?.canvas===canvas?this.preview.orbit:null;
    let gl;
    if(this.preview?.canvas===canvas){clearCosmetics(this.preview.model);gl=this.preview.gl;this.preview.observer?.disconnect();this.preview.unsubscribe?.();}
    else{this.hidePreview();gl=new THREE.WebGLRenderer({canvas,antialias:true});}
    gl.setPixelRatio(Math.min(devicePixelRatio, 2.5));
    gl.setSize(canvas.clientWidth || 300, canvas.clientHeight || 220, false);
    gl.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#263b33");
    scene.add(new THREE.HemisphereLight("#fff7e7", "#536157", 2.7));
    const sun = new THREE.DirectionalLight("#fff5df", 2);
    sun.position.set(5, 12, -8);
    scene.add(sun);
    const model = new THREE.Group();model.userData.vehicleId=id;model.add(asset.node.clone(true));
    const style=overrideStyle??this.cosmeticProfile?.vehicleStyle(id,this.customPreviewUid);
    if(this.cosmeticProfile&&id!=='charm-preview')applyCosmetics(model,style);
    scene.add(model);
    const bounds = new THREE.Box3().setFromObject(model),
      center = bounds.getCenter(new THREE.Vector3()),
      size = bounds.getSize(new THREE.Vector3()),
      radius = size.length() / 2,
      camera = new THREE.PerspectiveCamera(
        38,
        (canvas.clientWidth || 300) / (canvas.clientHeight || 220),
        0.05,
        200,
      );
    let yaw=focusSide?(focusSide==='left'?-Math.PI/2:Math.PI/2):.7,pitch=.28,zoom=1,panY=previousOrbit?.panY||0;if(previousOrbit){pitch=previousOrbit.pitch;zoom=previousOrbit.zoom;if(previousOrbit.side===focusSide)yaw=previousOrbit.yaw;}
    const render = () => {
      const width = canvas.clientWidth || 300,
        height = canvas.clientHeight || 220;
      gl.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      camera.position.set(
        center.x + Math.sin(yaw) * Math.cos(pitch) * radius * 3.2 * zoom,
        center.y + panY + Math.sin(pitch) * radius * 3.2 * zoom,
        center.z - Math.cos(yaw) * Math.cos(pitch) * radius * 3.2 * zoom,
      );
      camera.lookAt(center.x,center.y+panY,center.z);
      if(this.preview?.model===model)this.preview.orbit={yaw,pitch,zoom,panY,side:focusSide};
      gl.render(scene, camera);
    };
    render();
    const pointers=new Map();let tap=null;
    canvas.onpointerdown=e=>{e.preventDefault();e.stopPropagation();canvas.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});tap=pointers.size===1?{id:e.pointerId,x:e.clientX,y:e.clientY}:null;};
    canvas.onpointermove=e=>{const prev=pointers.get(e.pointerId);if(!prev)return;if(tap&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>7)tap=null;e.preventDefault();const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)?.[1];if(other){const before=Math.hypot(prev.x-other.x,prev.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);panY=Math.max(-radius*1.5,Math.min(radius*1.5,panY+(e.clientY-prev.y)*radius*zoom*.007));if(after>5)zoom=Math.max(.24,Math.min(2,zoom*before/after));}else{yaw+=(e.clientX-prev.x)*.012;pitch=Math.max(-.15,Math.min(1.2,pitch+(e.clientY-prev.y)*.008));}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});render();};
    canvas.onpointerup=e=>{const point=tap&&tap.id===e.pointerId&&pointers.size===1&&this.preview?.model===model&&this.preview.placementEnabled?pickVehicleSurface(model,camera,canvas.getBoundingClientRect(),e.clientX,e.clientY):null;pointers.delete(e.pointerId);tap=null;if(point)this.preview?.onPlace?.(point);};
    canvas.onpointercancel=e=>{pointers.delete(e.pointerId);tap=null;};
    canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.24,Math.min(2,zoom*Math.exp(e.deltaY*.001)));render();};
    const zoomBy=f=>{zoom=Math.max(.24,Math.min(2,zoom*f));render();};
    const panBy=f=>{panY=Math.max(-radius*1.5,Math.min(radius*1.5,panY+f*radius));render();};
    const unsubscribe=onCosmeticTextureReady(render);
    const observer = new ResizeObserver(render);
    this.preview = { gl, canvas, camera, observer, zoomBy, panBy, unsubscribe, model, orbit:{yaw,pitch,zoom,panY,side:focusSide} };
    if(this.cosmeticProfile&&id!=='charm-preview')prepareCosmetic(style).then(()=>{if(canvas.isConnected&&this.preview?.model===model){applyCosmetics(model,style);render();}});
    observer.observe(canvas);
  }
  hidePreview() {
    if (this.preview) {
      this.preview.observer?.disconnect();this.preview.unsubscribe?.();clearCosmetics(this.preview.model);
      for(const k of['onpointerdown','onpointermove','onpointerup','onpointercancel','onwheel'])this.preview.canvas[k]=null;this.preview.gl.dispose();this.preview.gl.forceContextLoss?.();
      this.preview = null;
    }
  }
  mapTarget(x, y) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2),
      this.camera,
    );
    return ray.intersectObject(this.landscape, true)[0]?.point || null;
  }
  drawEnemyDots(v) {
    const container = document.getElementById("enemyDots"),
      nodes = (this.enemyDotNodes ||= new Map()),
      seen = new Set();
    const world = (this.dotWorld ||= new THREE.Vector3()),
      q = (this.dotProjection ||= new THREE.Vector3()),
      local = (this.dotLocal ||= new THREE.Vector3());
    const show = (e, key, friendly = false) => {
      world.set(e.x, e.y + 5, e.z);
      q.copy(world).project(this.camera);
      local.copy(world).applyMatrix4(this.camera.matrixWorldInverse);
      const behind = local.z > 0;
      if(this.gunSight){const lens=document.querySelector('.gun-sight-lens'),r=lens?.getBoundingClientRect(),rect=container.getBoundingClientRect();if(!r||behind||q.z< -1||q.z>1)return;const px=(q.x*.5+.5)*rect.width+rect.left,py=(-q.y*.5+.5)*rect.height+rect.top;if(Math.hypot(px-r.left-r.width/2,py-r.top-r.height/2)>r.width/2-12)return;}
      let x = q.x,
        y = -q.y;
      if (
        friendly &&
        (behind || q.z > 1 || q.z < -1 || Math.abs(x) > 1 || Math.abs(y) > 1)
      )
        return;
      seen.add(key);
      if (behind) {
        x = -x;
        y = -y;
      }
      const outside = behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.8;
      if (outside) {
        if (Math.abs(x) + Math.abs(y) < 0.001) y = 0.8;
        const f = Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.8, 0.001);
        x /= f;
        y /= f;
      }
      let dot = nodes.get(key);
      if (!dot) {
        dot = document.createElement("span");
        dot.className = friendly ? "enemy-dot ally-dot" : "enemy-dot";
        nodes.set(key, dot);
        container.appendChild(dot);
      }
      dot.dataset.edge = String(outside);
      dot.style.left = `${(x * 0.5 + 0.5) * 100}%`;
      dot.style.top = `${(y * 0.5 + 0.5) * 100}%`;
    };
    for (const ally of v.allies || [])
      if (
        B.dist(v.own, ally) <=
        Math.min(
          B.vehicleSpec(v.own.vehicleId).communicationRange,
          B.vehicleSpec(ally.vehicleId).communicationRange,
        )
      )
        show(ally, "ally:" + ally.id, true);
    for (const e of v.enemies || [v.enemy].filter(Boolean))
      show(e, "vehicle:" + e.id);
    // Red world markers identify enemy vehicles only; projectile models remain visible.
    for (const [key, dot] of nodes)
      if (!seen.has(key)) {
        dot.remove();
        nodes.delete(key);
      }
  }

  updateReticle(p, pilot) {
    const a = pilot || p.aim[p.selected],
      d = pilot
        ? B.direction(a.yaw, a.pitch)
        : B.projectileDirection(p, p.selected),
      m = pilot || B.muzzle(p, p.selected),
      q = (this.reticlePoint ||= new THREE.Vector3())
        .set(m.x + d.x * 300, m.y + d.y * 300, m.z + d.z * 300)
        .project(this.camera),
      el = document.getElementById("reticle");
    el.style.left = `${B.clamp((q.x * 0.5 + 0.5) * 100, 5, 95)}%`;
    el.style.top = `${B.clamp((-q.y * 0.5 + 0.5) * 100, 15, 72)}%`;
    el.classList.toggle(
      "hidden",
      this.mapAim || (!pilot && p.selected === "sam"),
    );
  }
  drawScope(p, arc) {
    const panel = document.getElementById("ballisticPanel");
    panel.classList.toggle("hidden", !arc);
    if (!arc) {
      this.scopeArc = null;
      return;
    }
    if (this.scopeArc === arc) return;
    this.scopeArc = arc;
    panel.querySelector("span").textContent = "火炮弹道";
    const canvas = document.getElementById("ballisticScope"),
      c = canvas.getContext("2d"),
      start = arc.points[0],
      range = B.dist(start, arc.points[arc.points.length - 1]) || 1,
      maxY = Math.max(...arc.points.map((q) => q.y)) - start.y + 20;
    c.clearRect(0, 0, 240, 116);
    c.strokeStyle = "#739783";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(12, 94);
    c.lineTo(228, 94);
    c.stroke();
    c.strokeStyle = "#c7ffd9";
    c.lineWidth = 2;
    c.beginPath();
    arc.points.forEach((q, i) => {
      const x = 12 + (B.dist(start, q) / range) * 216,
        y = 90 - ((q.y - start.y) / maxY) * 73;
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    });
    c.stroke();
    c.font = "16px monospace";
    c.fillStyle = "#bdd5b7";
    c.fillText(
      arc.range === null
        ? "OUT"
        : `${arc.range.toFixed(0)} m / ${arc.time.toFixed(1)} s`,
      12,
      112,
    );
  }
  drawMini(v) {
    const c = this.miniCtx,
      w = 228,
      h = 228,
      sc = 200 / B.W,
      own = v.own;
    c.clearRect(0, 0, w, h);
    c.save();
    c.fillStyle = "rgba(13,30,28,.9)";
    c.fillRect(0, 0, w, h);
    c.beginPath();
    c.rect(14, 14, 200, 200);
    c.clip();
    const map = (q) => ({ x: 14 + q.x * sc, y: 14 + q.z * sc });
    this.mapPoint = map;
    c.strokeStyle = "#436052";
    c.lineWidth = 1;
    for (let x = 0; x <= B.W; x += 250) {
      const a = map({ x, z: 0 }),
        b = map({ x, z: B.H });
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    for (let z = 0; z <= B.H; z += 250) {
      const a = map({ x: 0, z }),
        b = map({ x: B.W, z });
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    c.strokeStyle = "#8fe9ad77";
    for (const s of [
      own,
      ...v.shots.filter(
        (s) =>
          s.mine &&
          !s.ballistic &&
          ["uav", "missile", "reconPlane", "bomber"].includes(s.kind),
      ),
    ]) {
      const q = map(s);
      c.beginPath();
      c.arc(
        q.x,
        q.y,
        (s === own
          ? B.vehicleSpec(own.vehicleId).recon
          : B.weaponSpec(own, s.kind).recon) * sc,
        0,
        Math.PI * 2,
      );
      c.stroke();
    }
    if (own.observationLeft > 0) {
      const q = map(own),
        yaw = own.observationYaw ?? own.yaw;
      c.fillStyle = "rgba(143,233,173,.18)";
      c.beginPath();
      c.moveTo(q.x, q.y);
      c.arc(
        q.x,
        q.y,
        500 * sc,
        yaw - Math.PI / 2 - Math.PI / 4,
        yaw - Math.PI / 2 + Math.PI / 4,
      );
      c.closePath();
      c.fill();
      c.stroke();
    }
    for (const s of v.shots.filter(
      (s) => s.mine && s.kind === "uav" && s.orbit,
    )) {
      const q = map(s.orbit);
      c.strokeStyle = "#86d9ef";
      c.setLineDash([3, 2]);
      c.beginPath();
      c.arc(q.x, q.y, s.orbit.radius * sc, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    if (v.zone) {
      const q = map(v.zone);
      c.fillStyle = "#83bc6544";
      c.beginPath();
      c.rect(14, 14, 200, 200);
      c.arc(q.x, q.y, v.zone.radius * sc, 0, Math.PI * 2, true);
      c.fill("evenodd");
      c.strokeStyle = "#9bf28c";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(q.x, q.y, v.zone.radius * sc, 0, Math.PI * 2);
      c.stroke();
    }
    for (const b of B.BUILDINGS) {
      const q = map(b);
      c.fillStyle = "#8d927a";
      c.fillRect(
        q.x - (b.w * sc) / 2,
        q.y - (b.d * sc) / 2,
        b.w * sc,
        b.d * sc,
      );
    }
    for (const clue of v.clues) {
      const q = map(clue);
      c.strokeStyle = "#ffe063";
      c.lineWidth = 2;
      c.fillStyle = "rgba(255,208,62,.24)";
      c.beginPath();
      if (clue.kind === "probe")
        c.arc(q.x, q.y, clue.radius * sc, 0, Math.PI * 2);
      else {
        c.moveTo(q.x, q.y);
        c.arc(
          q.x,
          q.y,
          clue.radius * sc,
          clue.yaw - Math.PI / 2 - clue.spread,
          clue.yaw - Math.PI / 2 + clue.spread,
        );
        c.closePath();
      }
      c.fill();
      c.stroke();
      if (clue.tutorial) {
        const center = map({
          x: clue.x + Math.sin(clue.yaw) * clue.radius * 0.5,
          z: clue.z - Math.cos(clue.yaw) * clue.radius * 0.5,
        });
        c.beginPath();
        c.arc(center.x, center.y, clue.radius * 0.6 * sc, 0, Math.PI * 2);
        c.stroke();
      }
    }
    for (const tr of v.trails) {
      c.strokeStyle = tr.mine ? "#a9cdbd" : "#e8d4b2";
      c.lineWidth = 1;
      c.beginPath();
      tr.points.forEach((p, i) => {
        const q = map(p);
        if (i) c.lineTo(q.x, q.y);
        else c.moveTo(q.x, q.y);
      });
      c.stroke();
    }
    for (const ally of v.allies || []) {
      const q = map(ally);
      c.fillStyle = "#68c4ff";
      c.fillRect(q.x - 2, q.y - 2, 4, 4);
    }
    for (const structure of v.structures || []) {
      const q = map(structure);
      c.fillStyle =
        structure.hp <= 0
          ? "#777"
          : structure.team === 0
            ? "#58b5ff"
            : "#ff7769";
      c.fillRect(q.x - 4, q.y - 4, 8, 8);
    }
    for (const enemy of v.enemies || [v.enemy].filter(Boolean)) {
      const q = map(enemy);
      c.strokeStyle = enemy.retained ? "#ae9978" : "#ffb185";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(q.x, q.y, 6, 0, Math.PI * 2);
      c.moveTo(q.x - 9, q.y);
      c.lineTo(q.x + 9, q.y);
      c.moveTo(q.x, q.y - 9);
      c.lineTo(q.x, q.y + 9);
      c.stroke();
    }
    for (const s of v.shots.filter(
      (s) => s.kind !== "bullet" && !s.visualOnly,
    )) {
      const q = map(s);
      c.fillStyle = s.mine ? "#d0ffe0" : s.retained ? "#ae9978" : "#ffb185";
      c.beginPath();
      c.arc(q.x, q.y, s.kind === "uav" ? 3.5 : 2.5, 0, 7);
      c.fill();
    }
    if (this.lastArc && this.lastArc.hit) {
      const q = map(this.lastArc.hit);
      c.fillStyle = "#ffdf62";
      c.strokeStyle = "#142720";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(q.x, q.y, 6, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.strokeStyle = "#ffe991";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(q.x - 10, q.y);
      c.lineTo(q.x + 10, q.y);
      c.moveTo(q.x, q.y - 10);
      c.lineTo(q.x, q.y + 10);
      c.stroke();
      this.miniImpact = { x: q.x, y: q.y, range: this.lastArc.range };
    } else this.miniImpact = null;
    const q = map(own);
    c.save();
    c.translate(q.x, q.y);
    c.rotate(own.yaw);
    c.fillStyle = "#d0ffe0";
    c.beginPath();
    c.moveTo(0, -8);
    c.lineTo(-5, 6);
    c.lineTo(0, 3);
    c.lineTo(5, 6);
    c.closePath();
    c.fill();
    c.restore();
    c.restore();
    c.strokeStyle = "#799185";
    c.lineWidth = 2;
    c.strokeRect(13, 13, 202, 202);
    c.font = "13px monospace";
    c.fillStyle = "#c6d8c7";
    c.textAlign = "center";
    c.fillText("N", w / 2, 12);
  }
  disposeGroup(g) {
    if (g.userData.exhaust) {
      const { group, material } = g.userData.exhaust;
      group.traverse((o) => o.geometry?.dispose());
      material.dispose();
      g.remove(group);
    }
    if (g.userData.sharedAsset) return;
    for(const m of g.userData.ownedMaterials||[])m.dispose();
    g.traverse((m) => {
      if (m.geometry) m.geometry.dispose();
    });
  }
  get stats() {
    return this.ready
      ? {
          webgl: true,
          models: this.modelsReady,
          calls: this.gl.info.render.calls,
          triangles: this.gl.info.render.triangles,
        }
      : { webgl: false };
  }
}
