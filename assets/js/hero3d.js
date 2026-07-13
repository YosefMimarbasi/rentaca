/* Rentaca — hero 3D scene (McGraw Tower)
   Loads assets/models/mcgraw-tower.stl (geometry-only, no color/material
   data) via Three.js and lights it to match the warm amber-on-dark-sky
   photo behind it. The tower spins slowly in place; the camera pans down
   its height as the visitor scrolls, starting close on the clock/belfry
   and ending mid-shaft so the base is never revealed. Falls back to a
   procedural placeholder tower if the model isn't there, and to a flat
   CSS silhouette if WebGL is unavailable or reduced motion is requested. */
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

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

  // Filmic tone mapping for a richer amber rolloff; shadow mapping so the
  // arches/belfry self-shadow onto the stone around them.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Must recompute every frame: the tower rotates but the key light is
  // fixed in world space, so their relative orientation keeps changing.
  renderer.shadowMap.autoUpdate = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, hero.clientWidth / hero.clientHeight, 0.1, 100);

  // Warm floodlight rig matching the reference photo (no cool/blue sources).
  // Key light sits off-axis so the two faces the camera sees read as clearly
  // lit vs. shadowed; the rest are a subordinate fill that holds shadow-side
  // detail and separates the silhouette from the night sky.
  scene.add(new THREE.AmbientLight(0x140f1c, 0.38));
  const key = new THREE.DirectionalLight(0xffb15c, 2.8);
  key.position.set(6, 5, 0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  key.shadow.bias = -0.0015;
  key.shadow.normalBias = 0.02;
  // Frustum framed tightly to the tower's own bounds — a loose frustum here
  // is the usual cause of blocky, low-resolution shadows.
  const shadowCam = key.shadow.camera;
  shadowCam.left = -8; shadowCam.right = 8;
  shadowCam.top = 12; shadowCam.bottom = -2;
  shadowCam.near = 1; shadowCam.far = 25;
  scene.add(key);
  const fillLight = new THREE.DirectionalLight(0xc2501f, 0.16);
  fillLight.position.set(-2, 1.5, 5);
  scene.add(fillLight);
  const edgeGlow = new THREE.DirectionalLight(0xffd9a0, 0.3);
  edgeGlow.position.set(0, 7, -5);
  scene.add(edgeGlow);
  const rimUp = new THREE.DirectionalLight(0xffa64d, 0.28);
  rimUp.position.set(-4, -1.5, -3); // low, from below/behind — grazes the silhouette edge
  scene.add(rimUp);
  // Every light is warm-toned on purpose: with no blue light source in the
  // scene, the roof's dark vertex tint reads warm-brown rather than blue-gray.

  const tower = new THREE.Group();
  scene.add(tower);

  const TOWER_HEIGHT = 10;

  // Interior belfry glow: short-range point lights inside the open belfry
  // air (not flush against the stone) so each arch opening bleeds warm light
  // outward. Kept off the wall surface deliberately — a physically-correct
  // point light's brightness climbs toward infinity as distance shrinks, so
  // anything placed too close blows out into a hard white hotspot regardless
  // of its intensity value.
  const BELFRY_LIGHT_Y = TOWER_HEIGHT * 0.72;
  const belfryLights = [];
  [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((angle) => {
    const light = new THREE.PointLight(0xffc477, 1.5, 2.6, 1.6);
    light.position.set(Math.cos(angle) * 0.32, BELFRY_LIGHT_Y, Math.sin(angle) * 0.32);
    tower.add(light);
    belfryLights.push(light);
  });

  // Glass clock lenses — thin discs sitting slightly proud of the wall over
  // the shader-painted dial (below), giving each clock its own specular
  // highlight and a real self-shadow at the rim, instead of reading as flat
  // paint. The proud offset comfortably clears the STL's own raised rim bump.
  const CLOCK_DIAL_Y = (74.5 / 125) * TOWER_HEIGHT;
  const CLOCK_WALL_R = 0.82;
  const CLOCK_GLASS_PROUD = 0.055;
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xfff6e6,
    roughness: 0.06,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    reflectivity: 0.9,
    transparent: true,
    opacity: 0.34,
  });
  [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((angle) => {
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.36, 48), glassMat);
    const r = CLOCK_WALL_R + CLOCK_GLASS_PROUD;
    glass.position.set(Math.cos(angle) * r, CLOCK_DIAL_Y, Math.sin(angle) * r);
    glass.rotation.y = Math.PI / 2 - angle;
    glass.castShadow = true;
    tower.add(glass);
  });

  // Vertex colors carry the broad material zones (stone shaft, belfry glow,
  // slate roof); the shader below adds per-pixel surface detail (masonry,
  // slate diamonds, clock dials) from object-space position, since the STL
  // has no UVs and too few triangles for vertex colors alone to resolve
  // individual stones. Base material stays white so vertex colors show true.
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, metalness: 0.05 });

  const STONE_BASE = new THREE.Color(0xb09678);   // grounded gray-buff stone
  const STONE_MID = new THREE.Color(0xe4c9a2);    // warm tan, uplit shaft
  const BELFRY_GLOW = new THREE.Color(0xffdf9e);  // brightest — floodlight + interior glow
  const ROOF_DARK = new THREE.Color(0x3c4655);    // slate blue-gray, light enough to catch highlight
  const KEY_DIR = new THREE.Vector3(6, 5, 0.5).normalize();

  // Procedural surface detail, spliced into MeshStandardMaterial's shader so
  // it keeps full PBR lighting/shadows. Coordinates are raw STL space
  // (Z-up, 0-125 tall, ±11 footprint):
  //   - walls: coursed stone masonry with mortar joints + per-stone variation
  //   - roof (Z > ~99): diamond slate lattice with ridge lines
  //   - clock dials: painted ticks/ring/hub/hands with a backlit emissive glow
  stoneMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObjPos = position;\nvObjNormal = normal;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vObjPos;
varying vec3 vObjNormal;
float mtHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float mtNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mtHash(i), mtHash(i + vec2(1.0, 0.0)), f.x),
             mix(mtHash(i + vec2(0.0, 1.0)), mtHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float mtRoofZone = 0.0;
float mtDialGlow = 0.0;
// Tapered capsule distance, hub (origin) to point b — paints pixel-precise
// hands instead of relying on the STL's own low-poly bump geometry.
float sdHand(vec2 p, vec2 b, float w0, float w1) {
  float h = clamp(dot(p, b) / dot(b, b), 0.0, 1.0);
  float d = length(p - b * h);
  return d - mix(w0, w1, h);
}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  float axisSel = step(abs(vObjNormal.y), abs(vObjNormal.x));
  float uRaw = mix(vObjPos.x, vObjPos.y, axisSel);
  // Sign-corrects u so "right" is consistent on all 4 faces — without this,
  // 2 of the 4 clock faces render every asymmetric detail (ticks, hands) mirrored.
  float faceSign = mix(-sign(vObjNormal.y), sign(vObjNormal.x), axisSel);
  float u = uRaw * faceSign;
  float v = vObjPos.z;
  float hRad = length(vObjPos.xy);

  // Roof eave starts at raw Z 99 — one lip above the corbel/cornice band
  // (Z 89-92), which stays in the stone gradient as plain parapet wall.
  mtRoofZone = step(99.0, v);
  float m4 = mod(atan(vObjPos.y, vObjPos.x), 1.5707963);
  float angDist = min(m4, 1.5707963 - m4);
  // Clock plaque angular half-width (~30deg) and Z band, measured off the STL.
  float clockZone = step(65.5, v) * step(v, 82.5) * step(9.6, hRad) * step(angDist, 0.5236) * (1.0 - mtRoofZone);

  // Hand-laid coursed masonry: wobbled joints, staggered rows, mortar,
  // per-stone tone + mottle, pillowed edge bevel, two scales of grain.
  float wobU = (mtNoise(vec2(v * 1.6, u * 1.6)) - 0.5) * 0.18;
  float wobV = (mtNoise(vec2(u * 1.6 + 31.7, v * 1.6)) - 0.5) * 0.12;
  float su = u + wobU;
  float sv = v + wobV;
  float courseH = 0.75;
  float stoneW = 1.05;
  float row = floor(sv / courseH);
  float rowOff = mtHash(vec2(row, 7.0)) * stoneW;
  vec2 cellId = vec2(floor((su + rowOff) / stoneW), row);
  vec2 cf = vec2(fract((su + rowOff) / stoneW), fract(sv / courseH));
  float edgeX = min(cf.x, 1.0 - cf.x) * stoneW;
  float edgeY = min(cf.y, 1.0 - cf.y) * courseH;
  float edgeD = min(edgeX, edgeY);
  float mortar = 1.0 - smoothstep(0.018, 0.052, edgeD);
  float bevel = smoothstep(0.04, 0.22, edgeD);
  float t1 = mtHash(cellId);
  float t2 = mtHash(cellId + 19.7);
  vec3 stoneTint = vec3(0.80 + 0.34 * t1);
  stoneTint.r *= 1.0 + 0.10 * (t2 - 0.5);
  stoneTint.b *= 1.0 - 0.14 * (t2 - 0.5);
  float mottle = (mtNoise(vec2(su, sv) * 2.3 + cellId) - 0.5) * 0.14;
  float grain = (mtNoise(vec2(su, sv) * 9.0) - 0.5) * 0.10
              + (mtNoise(vec2(sv, su) * 23.0) - 0.5) * 0.05;
  vec3 stoneCol = (stoneTint + vec3(mottle + grain)) * mix(0.78, 1.0, bevel);
  vec3 wallMul = mix(stoneCol, vec3(0.50, 0.47, 0.43) + vec3(grain), mortar);

  // Slate roof, painted absolute: diamond tiles darker toward the hanging
  // tip, tone shifting bluer/greener per tile, lighter joints, pale ridge
  // caps along the pyramid's hips (where |x| meets |y|).
  vec2 diag = vec2(u + v, u - v) / 2.4;
  vec2 dCell = floor(diag);
  vec2 dF = fract(diag);
  float dEdge = min(min(dF.x, 1.0 - dF.x), min(dF.y, 1.0 - dF.y));
  float dLine = 1.0 - smoothstep(0.025, 0.09, dEdge);
  float s1 = mtHash(dCell);
  float s2 = mtHash(dCell + 7.3);
  float overlapShade = mix(0.85, 1.18, (dF.x + dF.y) * 0.5);
  vec3 slateCol = mix(vec3(0.19, 0.22, 0.28), vec3(0.18, 0.24, 0.245), s2)
                * (0.85 + 0.4 * s1) * overlapShade;
  slateCol += vec3(grain * 0.4);
  slateCol = mix(slateCol, vec3(0.42, 0.44, 0.48), dLine * 0.5);
  float hip = 1.0 - smoothstep(0.15, 0.75, abs(abs(vObjPos.x) - abs(vObjPos.y)));
  slateCol = mix(slateCol, vec3(0.38, 0.39, 0.43), hip * 0.85);

  diffuseColor.rgb = mix(diffuseColor.rgb * wallMul, slateCol, mtRoofZone);

  // Clock dial: cream backlit face, minute ring + hour ticks (bolder at
  // 12/3/6/9), inner track ring, hub, and shader-painted hands (see sdHand)
  // fixed at a "10:10" pose, identical on all 4 faces.
  if (clockZone > 0.5) {
    float vert = v - 74.5;
    float rho = length(vec2(u, vert));
    float dialAng = atan(vert, u);
    float tickA = mod(dialAng, 0.5235988);
    float tickD = min(tickA, 0.5235988 - tickA) * rho;
    float tickId = mod(floor((dialAng + 3.1415927) / 0.5235988 + 0.5), 3.0);
    float isQuarter = 1.0 - min(1.0, tickId);
    float tickW = mix(0.09, 0.17, isQuarter);
    float tickInner = mix(3.5, 3.15, isQuarter);
    float tick = (1.0 - smoothstep(tickW, tickW + 0.06, tickD))
               * smoothstep(tickInner - 0.06, tickInner, rho)
               * (1.0 - smoothstep(4.0, 4.06, rho));
    float ringOuter = 1.0 - smoothstep(0.09, 0.15, abs(rho - 4.28));
    float ringInner = 1.0 - smoothstep(0.045, 0.10, abs(rho - 3.05));
    float hub = 1.0 - smoothstep(0.30, 0.42, rho);

    vec2 dialP = vec2(u, vert);
    float hourAng = 2.617994; // 150deg from +u — hour hand toward "10"
    float minAng = 0.523599;  // 30deg from +u — minute hand toward "2"
    float handHour = sdHand(dialP, 2.05 * vec2(cos(hourAng), sin(hourAng)), 0.15, 0.045);
    float handMin = sdHand(dialP, 3.35 * vec2(cos(minAng), sin(minAng)), 0.12, 0.035);
    float hands = 1.0 - smoothstep(0.0, 0.04, min(handHour, handMin));

    float marks = max(max(tick, max(ringOuter, ringInner)), max(hub, hands));
    vec3 dialCream = vec3(1.0, 0.95, 0.80) * (0.90 + 0.12 * (1.0 - smoothstep(0.0, 4.4, rho)));
    vec3 dial = mix(dialCream, vec3(0.14, 0.11, 0.07), marks);
    // Only the round dial (rho < ~4.5) overrides the wall color, not the
    // whole rectangular clockZone gate — so it reads as a disc set into the
    // stone, no seam against the surrounding masonry.
    float dialMask = 1.0 - smoothstep(4.4, 4.6, rho);
    diffuseColor.rgb = mix(diffuseColor.rgb, dial, dialMask);
    mtDialGlow = step(rho, 4.4) * (1.0 - marks);
  }
}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.38, mtRoofZone);
roughnessFactor = mix(roughnessFactor, 0.3, mtDialGlow);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.86, 0.6) * mtDialGlow * 1.05;`);
  };

  // Clock-zone vertices are deliberately left on the ordinary stone-color
  // gradient below — the shader above overwrites them per-pixel anyway, and
  // this mesh's large low-poly triangles (no shared vertex indexing) would
  // otherwise Gouraud-interpolate any special vertex color into streaks
  // bleeding down into the wall.
  /** Bakes a height gradient (stone → belfry glow → dark roof) plus a
   *  normal-based key-light tint into per-vertex colors. The STL is
   *  authored Z-up and reoriented to the scene's Y-up axes via the mesh's
   *  rotation.x, so normals are remapped into that same orientation before
   *  comparing against the key light direction. */
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
      const lz = pos.getZ(i);
      const t = (lz - minZ) / range;

      if (t < 0.5) c.copy(STONE_BASE).lerp(STONE_MID, t / 0.5);
      else if (t < 0.792) c.copy(STONE_MID).lerp(BELFRY_GLOW, (t - 0.5) / 0.292);
      else c.copy(ROOF_DARK); // hard cut at the roof eave (t≈0.792); shader paints the real slate color anyway

      // rotation.x = -90° maps local (x,y,z) -> world (x,z,-y); apply the same to the normal
      n.set(normal.getX(i), normal.getZ(i), -normal.getY(i));
      const tint = n.dot(KEY_DIR) * 0.07;
      c.r = Math.min(1, c.r + tint);
      c.g = Math.min(1, c.g + tint * 0.6);
      c.b = Math.max(0, c.b - tint * 0.4);

      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  /** Blends the clock zone's own STL bump-geometry normals toward an
   *  idealized flat radial-outward direction. The bump's low-poly faceted
   *  normals otherwise catch PBR lighting as stray bright/dark shards that
   *  no diffuse-color painting can fix, since the artifact comes from the
   *  normal, not the color. Must run after colorizeTower() (whose own
   *  computeVertexNormals() would overwrite this) and before the mesh is built. */
  function smoothClockNormals(geometry) {
    const pos = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
      if (lz < 65.5 || lz > 82.5) continue;
      const hyp = Math.hypot(lx, ly);
      if (hyp < 9.5) continue;
      const ox = lx / hyp, oy = ly / hyp; // idealized flat radial-outward normal
      const nx = normal.getX(i) * 0.15 + ox * 0.85;
      const ny = normal.getY(i) * 0.15 + oy * 0.85;
      const nz = normal.getZ(i) * 0.15;
      const len = Math.hypot(nx, ny, nz) || 1;
      normal.setXYZ(i, nx / len, ny / len, nz / len);
    }
    normal.needsUpdate = true;
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
    smoothClockNormals(geometry);
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

  // No post-processing composer here: SSAO/bloom via EffectComposer breaks
  // the canvas's alpha transparency, hiding the CSS photo behind it. Shadow
  // mapping + tone mapping alone render directly through renderer.render()
  // below and stay correctly transparent wherever there's no geometry.

  let heroHeight = hero.offsetHeight;
  function resize() {
    const w = hero.clientWidth, h = hero.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    heroHeight = hero.offsetHeight;
  }
  resize();

  let inView = true; // paused via IntersectionObserver below once scrolled past

  // Camera pans straight down the tower's height as the visitor scrolls —
  // starts framing both the clock and the spire tip, ends mid-shaft so the
  // base is never in view. Distance/angle stay fixed (no zoom); the tower's
  // own rotation (ROTATION_SPEED below) is independent of this pan.
  const CAM_TOP_Y = TOWER_HEIGHT * 0.79;
  const CAM_BOTTOM_Y = TOWER_HEIGHT * 0.32;
  const CAM_DIST = 7.8;
  const CAM_ANGLE = 0.62; // radians off dead-center, for the 3/4 view

  // All 4 clock faces and belfry lights are 4-fold symmetric, so the
  // silhouette reads consistently at any rotation angle.
  const ROTATION_SPEED = 0.12; // radians/second (~52s per full turn)

  function scrollProgress() {
    return Math.min(Math.max(window.scrollY / heroHeight, 0), 1);
  }
  function applyProgress(p) {
    const targetY = CAM_TOP_Y + (CAM_BOTTOM_Y - CAM_TOP_Y) * p;
    camera.position.set(Math.sin(CAM_ANGLE) * CAM_DIST, targetY, Math.cos(CAM_ANGLE) * CAM_DIST);
    camera.lookAt(0, targetY, 0);
  }

  // Raw scroll fraction jumps in discrete steps (mouse-wheel notches
  // especially); `smoothed` eases toward `target` every frame with
  // frame-rate-independent exponential smoothing so it closes the gap at
  // the same real-world speed on any refresh rate instead of teleporting.
  let target = scrollProgress();
  let smoothed = target;
  applyProgress(smoothed);

  const SMOOTH_TAU = 0.06; // seconds to close ~63% of the remaining gap
  const SNAP_EPSILON = 0.0003;

  let running = false;
  let lastFrameT = null; // null only before the very first frame ever runs
  function wake() {
    if (running || !inView) return;
    running = true;
    requestAnimationFrame(tick);
  }

  function tick(now) {
    if (!inView) { running = false; return; }
    // Leaving lastFrameT stale (not reset on wake) means a scroll resuming
    // after idle just clamps to a larger eased catch-up step, not a snap.
    const dt = lastFrameT === null ? 0 : Math.min((now - lastFrameT) / 1000, 0.1);
    lastFrameT = now;

    const diff = target - smoothed;
    if (dt > 0 && Math.abs(diff) > SNAP_EPSILON) {
      smoothed += diff * (1 - Math.exp(-dt / SMOOTH_TAU));
    } else {
      smoothed = target;
    }
    applyProgress(smoothed);
    tower.rotation.y += ROTATION_SPEED * dt;
    renderer.render(scene, camera);

    // The tower's spin never settles, so rendering runs every frame for as
    // long as the hero is in view (unlike the scroll-smoothing above, which
    // does reach target).
    requestAnimationFrame(tick);
  }

  window.addEventListener("scroll", () => {
    target = scrollProgress();
    wake();
  }, { passive: true });

  // ResizeObserver on the hero (not just `window`) also catches late-swapping
  // web fonts reflowing the layout. rAF-debounced to collapse a resize burst
  // into one recompute per frame.
  const scheduleResize = (() => {
    let scheduled = false;
    return () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        resize();
        target = scrollProgress();
        wake();
      });
    };
  })();
  if (window.ResizeObserver) {
    new ResizeObserver(scheduleResize).observe(hero);
  } else {
    window.addEventListener("resize", scheduleResize);
  }

  if (window.IntersectionObserver) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) wake();
    }, { threshold: 0 }).observe(hero);
  }

  wake(); // start the render loop
})();
