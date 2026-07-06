/* Rentaca — hero 3D scene (McGraw Tower)
   Loads assets/models/mcgraw-tower.stl (a geometry-only 3D-print file, no
   color/material data) via Three.js and lights it to match the warm
   amber-on-dark-sky photo behind it. The tower stays fixed; the camera
   pans down its height as the visitor scrolls — starting close on the
   clock/belfry near the top, ending well above the base so the bottom of
   the tower is never revealed. Falls back to a procedural placeholder
   tower if the model isn't there, and to a flat CSS silhouette if WebGL
   is unavailable or the user has requested reduced motion. */
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

(async () => {
  const hero = document.querySelector(".hero");
  const canvas = document.getElementById("heroCanvas");
  if (!hero || !canvas) return;

  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return; // static CSS fallback silhouette stays visible

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (e) {
    return; // no WebGL — CSS fallback silhouette stays visible
  }
  hero.classList.add("hero--3d-ready"); // hides the CSS fallback once we know WebGL works

  // Filmic tone mapping so the amber floodlight rolls off richly instead of
  // clipping flat, and real shadow mapping so the arches/belfry openings
  // cast convincing shadows on the stone around them (self-shadowing off a
  // single mesh is what actually sells "carved" over "smooth-shaded solid").
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, hero.clientWidth / hero.clientHeight, 0.1, 100);

  // Lit to match the reference photo: warm amber floodlight on the stone
  // against a near-black sky, no cool/blue light sources at all. Key light
  // sits off to the side (not near the camera axis) so the two faces the
  // angled camera sees read as clearly lit vs. shadowed, not evenly washed.
  // A low warm rim light separates the silhouette's edge from the night sky.
  scene.add(new THREE.AmbientLight(0x140f1c, 0.3));
  const key = new THREE.DirectionalLight(0xffb15c, 3.8);
  key.position.set(6, 5, 0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0015;
  key.shadow.normalBias = 0.02;
  // Shadow camera frustum tightly framed around the tower's own bounding
  // volume (TOWER_HEIGHT=10, roughly ±6 in x/z) — a loose frustum here is
  // the usual cause of blocky, low-resolution shadows.
  const shadowCam = key.shadow.camera;
  shadowCam.left = -8; shadowCam.right = 8;
  shadowCam.top = 12; shadowCam.bottom = -2;
  shadowCam.near = 1; shadowCam.far = 25;
  scene.add(key);
  const fillLight = new THREE.DirectionalLight(0xc2501f, 0.5);
  fillLight.position.set(-2, 1.5, 5);
  scene.add(fillLight);
  const edgeGlow = new THREE.DirectionalLight(0xffd9a0, 0.65);
  edgeGlow.position.set(0, 7, -5);
  scene.add(edgeGlow);
  const rimUp = new THREE.DirectionalLight(0xffa64d, 0.9);
  rimUp.position.set(-4, -1.5, -3); // low, from below/behind — grazes the silhouette edge
  scene.add(rimUp);

  const tower = new THREE.Group();
  scene.add(tower);

  // Vertex-colored stone: a baked vertical gradient (grounded/cool at the
  // base rising to warm/lit near the spire) plus a subtle per-face-normal
  // tint keyed to the key light's direction, so the form reads with real
  // dimensionality even before the scene's dynamic lights land on it. Base
  // material color stays white so the vertex colors show through true.
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.62, metalness: 0.08 });

  const STONE_BASE = new THREE.Color(0x9c7b52); // grounded, slightly cool base
  const STONE_MID = new THREE.Color(0xd9b98a);  // mid-shaft floodlit limestone
  const STONE_TOP = new THREE.Color(0xf6dfae);  // bright warm stone near the spire
  const KEY_DIR = new THREE.Vector3(6, 5, 0.5).normalize();

  /** Bakes a height gradient + normal-based key-light tint into per-vertex colors.
   *  The STL is authored Z-up (height along local Z) and only reoriented to the
   *  scene's Y-up axes later via the mesh's rotation.x, so this reads/dots
   *  against local-Z-as-height and remaps each local normal into that same
   *  post-rotation (world) orientation before comparing it to the key light. */
  function colorizeTower(geometry) {
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const pos = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const minZ = geometry.boundingBox.min.z;
    const range = Math.max(geometry.boundingBox.max.z - minZ, 0.001);
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getZ(i) - minZ) / range;
      if (t < 0.55) c.copy(STONE_BASE).lerp(STONE_MID, t / 0.55);
      else c.copy(STONE_MID).lerp(STONE_TOP, (t - 0.55) / 0.45);

      // rotation.x = -90° maps local (x,y,z) -> world (x,z,-y); apply the same to the normal
      n.set(normal.getX(i), normal.getZ(i), -normal.getY(i));
      const tint = n.dot(KEY_DIR) * 0.07; // -1 (away from key light) .. 1 (toward it)
      c.r = Math.min(1, c.r + tint);
      c.g = Math.min(1, c.g + tint * 0.6);
      c.b = Math.max(0, c.b - tint * 0.4);

      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  function buildPlaceholderTower() {
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.6 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x9c7b52, roughness: 0.68, metalness: 0.06 });
    const midMat = new THREE.MeshStandardMaterial({ color: 0xd9b98a, roughness: 0.65, metalness: 0.06 });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.6, 5, 1.6), baseMat);
    shaft.position.y = 2.5;
    const belfry = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 2), midMat);
    belfry.position.y = 5.7;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.8, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 7.3;
    [shaft, belfry, roof].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
    tower.add(shaft, belfry, roof);
  }

  const TOWER_HEIGHT = 10;
  /** Scales/centers the model so its base sits at y=0 and its top at y=TOWER_HEIGHT. */
  function frameModel(object3d) {
    const box = new THREE.Box3().setFromObject(object3d);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = TOWER_HEIGHT / Math.max(size.y, 0.001);
    object3d.scale.setScalar(scale);
    box.setFromObject(object3d);
    const center = new THREE.Vector3();
    box.getCenter(center);
    object3d.position.x -= center.x;
    object3d.position.z -= center.z;
    object3d.position.y -= box.min.y;
  }

  const MODEL_PATH = "assets/models/mcgraw-tower.stl";
  try {
    const geometry = await new STLLoader().loadAsync(MODEL_PATH);
    colorizeTower(geometry);
    const mesh = new THREE.Mesh(geometry, stoneMat);
    // STL files are commonly authored Z-up (3D-print orientation) — stand it upright for the scene's Y-up axes.
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true; // self-shadowing: arches/belfry openings cast onto the stone around them
    tower.add(mesh);
    frameModel(mesh);
  } catch (e) {
    buildPlaceholderTower(); // model missing/failed to load — keep the mechanism demonstrable
  }

  // Post-processing: SSAO darkens the arches/belfry recesses and corners
  // the way real ambient occlusion would, so the carved detail reads as
  // sculpted rather than flat-shaded; a conservative, high-threshold bloom
  // adds a touch of glow to only the brightest lit stone/highlights.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const ssaoPass = new SSAOPass(scene, camera, hero.clientWidth, hero.clientHeight);
  ssaoPass.kernelRadius = 0.35;
  ssaoPass.minDistance = 0.001;
  ssaoPass.maxDistance = 0.15;
  composer.addPass(ssaoPass);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(hero.clientWidth, hero.clientHeight), 0.35, 0.5, 0.86);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  function resize() {
    const w = hero.clientWidth, h = hero.clientHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // EffectComposer.setSize() reads the renderer's current pixel ratio
    // internally (set just above), so it doesn't need its own setter.
    composer.setSize(w, h);
    ssaoPass.setSize(w, h);
  }
  resize();
  window.addEventListener("resize", resize);

  // Visible only while the hero is on screen — saves battery/CPU once scrolled past.
  let inView = true;
  if (window.IntersectionObserver) {
    new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; }, { threshold: 0 }).observe(hero);
  }

  // The camera pans down the tower's height as the visitor scrolls — starts
  // backed off enough to see both the clock (~66% up) and the spire tip
  // (100%) together, ends mid-shaft (~32% up) so the base is never in
  // frame. Distance stays FIXED throughout (no zoom); the tower itself
  // rotates in place instead, so the motion reads as a turntable pan
  // rather than a push-in.
  const CAM_TOP_Y = TOWER_HEIGHT * 0.82;    // framed between the clock and the tip
  const CAM_BOTTOM_Y = TOWER_HEIGHT * 0.32;
  const CAM_DIST = 7.8;                     // constant — never zooms while scrolling
  const CAM_ANGLE = 0.62; // radians off dead-center, for the 3/4 view
  const TOWER_ROT_START = 0;
  const TOWER_ROT_END = Math.PI * 0.55; // just over a quarter turn across the full scroll
  function updateFromScroll() {
    const progress = Math.min(Math.max(window.scrollY / hero.offsetHeight, 0), 1);
    const targetY = CAM_TOP_Y + (CAM_BOTTOM_Y - CAM_TOP_Y) * progress;
    camera.position.set(Math.sin(CAM_ANGLE) * CAM_DIST, targetY, Math.cos(CAM_ANGLE) * CAM_DIST);
    camera.lookAt(0, targetY, 0);
    tower.rotation.y = TOWER_ROT_START + (TOWER_ROT_END - TOWER_ROT_START) * progress;
  }

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) { requestAnimationFrame(() => { updateFromScroll(); ticking = false; }); ticking = true; }
  }, { passive: true });
  updateFromScroll();

  function animate() {
    requestAnimationFrame(animate);
    if (!inView) return;
    composer.render();
  }
  animate();
})();
