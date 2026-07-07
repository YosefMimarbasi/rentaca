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
  //
  // The previous rig had the 3 secondary lights (fill+edgeGlow+rimUp) summing
  // to nearly the same intensity as the key light itself, from three
  // different directions — that flattened the render: both visible tower
  // faces came out reading almost identically bright, killing the sense of
  // 3D form the reference photo has. Key is now clearly dominant; the
  // secondaries are cut to a genuine "fill" role (hold shadow-side detail
  // and separate the silhouette from the sky, don't compete with the key).
  scene.add(new THREE.AmbientLight(0x140f1c, 0.38));
  const key = new THREE.DirectionalLight(0xffb15c, 2.8);
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
  const fillLight = new THREE.DirectionalLight(0xc2501f, 0.16);
  fillLight.position.set(-2, 1.5, 5);
  scene.add(fillLight);
  const edgeGlow = new THREE.DirectionalLight(0xffd9a0, 0.3);
  edgeGlow.position.set(0, 7, -5);
  scene.add(edgeGlow);
  const rimUp = new THREE.DirectionalLight(0xffa64d, 0.28);
  rimUp.position.set(-4, -1.5, -3); // low, from below/behind — grazes the silhouette edge
  scene.add(rimUp);
  // NOTE: every light here is warm-toned (matching the floodlit stone), so
  // the roof's dark vertex tint still comes out dark warm-brown rather than
  // true blue-gray once multiplied by an all-orange light set — there's no
  // blue anywhere in the scene for it to reflect. A dedicated cool light was
  // tried here and reverted: it raised the roof's overall brightness (light
  // intensity adds regardless of hue) without visibly shifting its color.
  // Getting dark-vs-stone contrast right instead relies on the vertex color
  // itself being aggressively dark (below) and the roof's own bounce/tint
  // being minimal, not on fighting the light palette.

  const tower = new THREE.Group();
  scene.add(tower);

  const TOWER_HEIGHT = 10;

  // Interior belfry lighting — every reference photo shows the arch
  // openings as the brightest, warmest part of the tower (lit from inside),
  // not dark recesses. A ring of short-range point lights at arch height
  // does this cheaply: each one mainly lights the inside surface of the
  // nearest arch notch, bleeding a warm glow out through the opening.
  // Height/radius measured directly off the STL (triangle density peaks at
  // raw Z 88-92 out of a 0-125 range, radius ~10-10.8 out of 11) rather than
  // guessed — the guessed values were off enough to visibly miss the arches.
  const BELFRY_LIGHT_Y = TOWER_HEIGHT * 0.72;
  const belfryLights = [];
  [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((angle) => {
    const light = new THREE.PointLight(0xffc477, 2.4, 3.2, 2);
    light.position.set(Math.cos(angle) * 0.85, BELFRY_LIGHT_Y, Math.sin(angle) * 0.85);
    tower.add(light);
    belfryLights.push(light);
  });

  // Vertex colors carry the broad material zones (buff stone shaft, amber
  // belfry band, dark slate roof), and an injected shader pass (below) adds
  // the per-PIXEL surface detail the real tower has — coursed stone masonry
  // with mortar joints and per-stone tonal variation, the diamond-pattern
  // slate roof, and painted glowing clock dials — computed procedurally
  // from the model's own object-space coordinates, since the STL has no UVs
  // and only ~6.8k triangles (vertex colors alone can never resolve
  // individual stones). Base material color stays white so vertex colors
  // show through true.
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, metalness: 0.05 });

  const STONE_BASE = new THREE.Color(0xb09678);   // grounded gray-buff stone (Cornell bluestone under warm light)
  const STONE_MID = new THREE.Color(0xe4c9a2);    // warm tan, uplit shaft
  const BELFRY_GLOW = new THREE.Color(0xffdf9e);  // brightest — floodlight + interior glow at the belfry
  const ROOF_DARK = new THREE.Color(0x3c4655);    // slate blue-gray roof: light enough for the shader's diamond
                                                   // pattern to read and to catch highlight instead of crushing to
                                                   // near-black, low-red so warm lights don't turn it orange
  const CLOCK_FACE = new THREE.Color(0xfff6de);   // backlit cream dial
  const CLOCK_HAND = new THREE.Color(0x201810);   // dark hands/numerals — read via shading on the raised geometry
  const KEY_DIR = new THREE.Vector3(6, 5, 0.5).normalize();

  // Procedural surface detail, spliced into MeshStandardMaterial's own
  // shader so it keeps full PBR lighting/shadows. Everything is derived
  // from object-space position (raw STL coords: Z-up, 0-125 tall, ±11
  // footprint — all thresholds below are measured off the file, same as
  // the JS-side zone constants):
  //   - walls: staggered stone courses w/ darker mortar joints, per-stone
  //     brightness/warmth variation and fine grain
  //   - roof (Z > ~92.5): diamond slate lattice with lighter ridge lines,
  //     matching the reference photo of the spire
  //   - clock dials: painted minute/hour ticks + rim ring on the flat dial
  //     surface, dark modeled hands, lighter stone surround, and a warm
  //     emissive glow on the cream face so it reads backlit at night
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
float mtDialGlow = 0.0;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  float axisSel = step(abs(vObjNormal.y), abs(vObjNormal.x));
  float u = mix(vObjPos.x, vObjPos.y, axisSel);
  float v = vObjPos.z;
  float hRad = length(vObjPos.xy);

  // HARD material break at the roof's true eave — re-verified against the
  // STL with fine (0.25-unit) height bins: raw Z 89.5-92.25 is a dense
  // corbel/cornice band (radius bulges to ~14.85 at the corners), but
  // there is a SECOND, higher lip at raw Z 99.25-100.0 (a sparse 12-point
  // ring, radius flaring to ~14.5 at the same 4 corners) with a completely
  // vertex-free gap between them (92.25-99.25) — a plain parapet wall
  // running between the corbel table and the actual roof eave. That upper
  // ring is the roof's real eave/base; the pyramid apex sits at Z~108 and
  // a thin finial/spire continues to Z=125. Cutting at 89 (the corbel, not
  // the eave) put the whole parapet into the roof/slate zone by mistake.
  // The roof is painted with an absolute slate color below (not the
  // interpolated vertex gradient), so the stone->slate edge is pixel-sharp.
  mtRoofZone = step(99.0, v);
  float m4 = mod(atan(vObjPos.y, vObjPos.x), 1.5707963);
  float angDist = min(m4, 1.5707963 - m4);
  // Clock plaque real angular half-width, re-measured off the STL: triangle
  // density within the Z 70-82.5 clock band stays high (300-2500/bin) out
  // to ~28-30 deg from each cardinal face before dropping off sharply — the
  // previous 0.20 rad (~11.5 deg) gate only covered a thin center sliver of
  // the actual shield-shaped plaque, so most of its surface fell outside the
  // shader entirely and rendered as flat, undetailed vertex-color cream.
  float clockZone = step(70.0, v) * step(v, 82.5) * step(9.6, hRad) * step(angDist, 0.5236) * (1.0 - mtRoofZone);

  // hand-laid coursed masonry: joints wobbled with smooth noise so the
  // courses read as laid by hand rather than machine-ruled, staggered rows,
  // mortar joints, per-stone tone + interior mottle, pillowed bevel relief
  // toward each stone's edges, and two scales of surface grain
  float wobU = (mtNoise(vec2(v * 1.6, u * 1.6)) - 0.5) * 0.18;
  float wobV = (mtNoise(vec2(u * 1.6 + 31.7, v * 1.6)) - 0.5) * 0.12;
  float su = u + wobU;
  float sv = v + wobV;
  float courseH = 0.75; // much smaller/more numerous stones than before
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

  // slate roof, painted absolute: diamond tiles shaded darker toward the
  // hanging tip (shingle overlap), per-tile tone shifting between bluer
  // and greener slate, lighter joint lines, and pale ridge caps running up
  // the pyramid's hips (where |x| meets |y|), like the reference photo
  vec2 diag = vec2(u + v, u - v) / 2.4;
  vec2 dCell = floor(diag);
  vec2 dF = fract(diag);
  float dEdge = min(min(dF.x, 1.0 - dF.x), min(dF.y, 1.0 - dF.y));
  float dLine = 1.0 - smoothstep(0.025, 0.09, dEdge);
  float s1 = mtHash(dCell);
  float s2 = mtHash(dCell + 7.3);
  // Lightened from the original near-black values — under this rig's warm
  // key light, dark-and-matte was crushing the whole roof to a flat
  // silhouette with no readable diamond pattern or highlight.
  float overlapShade = mix(0.85, 1.18, (dF.x + dF.y) * 0.5);
  vec3 slateCol = mix(vec3(0.19, 0.22, 0.28), vec3(0.18, 0.24, 0.245), s2)
                * (0.85 + 0.4 * s1) * overlapShade;
  slateCol += vec3(grain * 0.4);
  slateCol = mix(slateCol, vec3(0.42, 0.44, 0.48), dLine * 0.5);
  float hip = 1.0 - smoothstep(0.15, 0.75, abs(abs(vObjPos.x) - abs(vObjPos.y)));
  slateCol = mix(slateCol, vec3(0.38, 0.39, 0.43), hip * 0.85);

  diffuseColor.rgb = mix(diffuseColor.rgb * wallMul, slateCol, mtRoofZone);

  // clock dials on the model's real dial geometry: cream backlit face with
  // a soft radial falloff, minute ring + hour ticks (bolder at 12/3/6/9),
  // inner track ring, center hub, dark modeled hands, stone-toned surround
  if (clockZone > 0.5) {
    float vert = v - 76.3;
    float rho = length(vec2(u, vert));
    float raised = step(10.5, hRad);
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
    float marks = max(max(tick, max(ringOuter, ringInner)), hub);
    vec3 dialCream = vec3(1.0, 0.95, 0.80) * (0.90 + 0.12 * (1.0 - smoothstep(0.0, 4.4, rho)));
    vec3 dial = mix(dialCream, vec3(0.14, 0.11, 0.07), marks);
    vec3 clockCol = mix(dial, vec3(0.82, 0.75, 0.60) * stoneTint.x, step(4.5, rho));
    clockCol = mix(clockCol, vec3(0.12, 0.09, 0.06), raised * step(rho, 4.5));
    diffuseColor.rgb = clockCol;
    mtDialGlow = step(rho, 4.4) * (1.0 - raised) * (1.0 - marks);
  }
}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.38, mtRoofZone);
roughnessFactor = mix(roughnessFactor, 0.3, mtDialGlow);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.86, 0.6) * mtDialGlow * 1.05;`);
  };

  // The clock faces are real modeled geometry in the STL, not something to
  // add on top — confirmed by parsing the binary file directly (Python,
  // offline): a dense circular cluster of triangles sits at raw Z 71-82
  // (of a 0-125 height range) and radius 9.75-10.84 (of a ±11 footprint),
  // centered on all four cardinal angles (0°, 90°, 180°, -90°). Coloring
  // those actual vertices — instead of overlaying a separate flat disc —
  // is what makes the clock read as part of the tower rather than a sticker.
  const CLOCK_Z_MIN = 70, CLOCK_Z_MAX = 82.5, CLOCK_R_MIN = 9.5;
  const CLOCK_ANGLES_DEG = [0, 90, 180, -90];
  // Re-measured off the STL: the clock plaque's real triangle density holds
  // out to ~28-30deg from each cardinal face (vs. plain wall, which has
  // almost none) before dropping sharply — the previous 11deg tolerance
  // only covered a thin center sliver of the actual shield-shaped plaque.
  const CLOCK_ANGLE_TOLERANCE_DEG = 30;
  function isClockVertex(localX, localY, localZ) {
    if (localZ < CLOCK_Z_MIN || localZ > CLOCK_Z_MAX) return false;
    if (Math.hypot(localX, localY) < CLOCK_R_MIN) return false;
    const deg = (Math.atan2(localY, localX) * 180) / Math.PI;
    return CLOCK_ANGLES_DEG.some((target) => Math.abs(((deg - target + 180) % 360) - 180) < CLOCK_ANGLE_TOLERANCE_DEG);
  }

  /** Bakes a height gradient (stone -> belfry glow -> dark metal roof) plus a
   *  normal-based key-light tint into per-vertex colors, and picks out the
   *  clock faces' own real geometry for a distinct cream/dark tone instead
   *  of continuing the stone gradient over them. The STL is authored Z-up
   *  (height along local Z) and only reoriented to the scene's Y-up axes
   *  later via the mesh's rotation.x, so this reads/dots against
   *  local-Z-as-height and remaps each local normal into that same
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
      const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
      const t = (lz - minZ) / range;
      const onClock = isClockVertex(lx, ly, lz);

      if (onClock) {
        // The rim/back of the recess reads darker (hands + shadowed edges),
        // the face itself bright cream — driven by how far out the vertex
        // sits, since the modeled hands/numerals are the raised/thin bits.
        const radial = Math.hypot(lx, ly);
        c.copy(radial > 10.55 ? CLOCK_HAND : CLOCK_FACE);
      } else if (t < 0.5) c.copy(STONE_BASE).lerp(STONE_MID, t / 0.5);
      else if (t < 0.792) c.copy(STONE_MID).lerp(BELFRY_GLOW, (t - 0.5) / 0.292);
      // Slate starts at raw Z ~99 (t=0.792) — the roof's real eave ring, one
      // lip higher than the corbel/cornice band below it (raw Z 89-92, which
      // is now correctly left in the stone gradient as the plain parapet
      // wall above the corbel and below the eave). Hard cut, no fade — and
      // the shader paints the roof with an absolute slate color anyway, so
      // this is only the no-shader fallback.
      else c.copy(ROOF_DARK);

      // rotation.x = -90° maps local (x,y,z) -> world (x,z,-y); apply the same to the normal
      n.set(normal.getX(i), normal.getZ(i), -normal.getY(i));
      const tint = n.dot(KEY_DIR) * (onClock ? 0.03 : 0.07); // clock stays closer to flat/backlit
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

  // NOTE: SSAO + bloom via EffectComposer were tried here and reverted —
  // that post-processing pipeline broke the canvas's alpha transparency
  // (the whole sky rendered as opaque black, hiding the CSS photo behind
  // it, confirmed by direct testing). Shadow mapping + tone mapping above
  // don't need a composer at all — they render directly through
  // renderer.render() below, so the canvas stays correctly transparent
  // wherever there's no geometry.

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

  // Visible only while the hero is on screen — saves battery/CPU once scrolled past.
  let inView = true;

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

  function scrollProgress() {
    return Math.min(Math.max(window.scrollY / heroHeight, 0), 1);
  }
  function applyProgress(p) {
    const targetY = CAM_TOP_Y + (CAM_BOTTOM_Y - CAM_TOP_Y) * p;
    camera.position.set(Math.sin(CAM_ANGLE) * CAM_DIST, targetY, Math.cos(CAM_ANGLE) * CAM_DIST);
    camera.lookAt(0, targetY, 0);
    tower.rotation.y = TOWER_ROT_START + (TOWER_ROT_END - TOWER_ROT_START) * p;
  }

  // The raw scroll fraction jumps in large, discrete steps (mouse-wheel
  // notches especially), which made the camera/tower visibly teleport
  // between positions each tick instead of panning — the main source of the
  // animation feeling janky. `smoothed` now eases toward `target` every
  // rendered frame with frame-rate-independent exponential smoothing (a time
  // constant, not a fixed per-frame step), so it closes the gap at the same
  // real-world speed on a 60Hz or a 144Hz display instead of drifting out of
  // sync with the actual scroll on fast/slow monitors.
  let target = scrollProgress();
  let smoothed = target;
  applyProgress(smoothed);

  const SMOOTH_TAU = 0.15; // seconds to close ~63% of the remaining gap
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
    // Resetting lastFrameT on every wake() would force dt=0 (a hard instant
    // snap, via the else-branch below) each time a scroll resumes after the
    // loop had stopped at rest — exactly the teleporting this smoothing is
    // meant to remove. Leaving it as the last real frame time means a stale
    // gap just clamps to a slightly larger (but still eased, not snapped)
    // catch-up step on the first frame back.
    const dt = lastFrameT === null ? 0 : Math.min((now - lastFrameT) / 1000, 0.1);
    lastFrameT = now;

    const diff = target - smoothed;
    if (dt > 0 && Math.abs(diff) > SNAP_EPSILON) {
      smoothed += diff * (1 - Math.exp(-dt / SMOOTH_TAU));
    } else {
      smoothed = target;
    }
    applyProgress(smoothed);
    renderer.render(scene, camera);

    // Once caught up, stop rendering entirely instead of looping forever at
    // rest — nothing else in the scene animates on its own, so idle frames
    // are wasted GPU/CPU work (and, on lower-end devices, a source of jank
    // on the *rest* of the page while scrolling). The next scroll/resize
    // wakes it back up.
    if (Math.abs(target - smoothed) > SNAP_EPSILON) {
      requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }

  window.addEventListener("scroll", () => {
    target = scrollProgress();
    wake();
  }, { passive: true });

  // ResizeObserver on the hero itself (not just `window`) catches anything
  // that changes its height — viewport resize, orientation change, or a
  // late-swapping web font reflowing the layout — not only explicit window
  // resizes. rAF-debounced so a burst of resize/observer callbacks (some
  // browsers fire many in a row) collapses to one recompute per frame.
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

  wake(); // render the initial frame
})();
