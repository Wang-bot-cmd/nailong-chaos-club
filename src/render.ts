import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Simulation, Entity, GameEvent } from './simulation';
import { characterMaterial } from './character-material';
import { SciFiEffects, spaceDistortion } from './sci-fi';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CHARACTERS = [
  { key: 'hands', mood: '揣手，但不认错。', name: '揣手奶龙', yaw: 0 },
  { key: 'shock', mood: '啊？还要上班啊？', name: '震惊奶龙', yaw: 0 },
  { key: 'tongue', mood: '略略略，气不到我。', name: '吐舌奶龙', yaw: 0 },
  { key: 'egg', mood: '外表脆皮，内心叛逆。', name: '奶蛋', yaw: 0 },
  { key: 'frog', mood: '孤寡？不，是呱王。', name: '奶蛙', yaw: 0 },
];
const ACID = 0xdcff42, PINK = 0xff63c2, CYAN = 0x8afaff;
const tmp = new THREE.Vector3();
const material = (color: number, roughness = .5, metalness = .1) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
function mesh<G extends THREE.BufferGeometry, M extends THREE.Material>(g: G, m: M, parent?: THREE.Object3D) { const o = new THREE.Mesh(g, m); if (parent) parent.add(o); return o; }
function textTexture(text: string, color: string, bg = '') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const ctx = c.getContext('2d')!;
  if (bg) { ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(3, 3, 506, 122, 10); ctx.fill(); }
  ctx.font = '800 58px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; color: THREE.Color };
type Ring = { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; life: number; max: number; radius: number };

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer; readonly scene = new THREE.Scene(); readonly camera = new THREE.PerspectiveCamera(38, 1, .1, 140);
  private composer: EffectComposer; private bloom: UnrealBloomPass; private stage = new THREE.Group(); private hero = new THREE.Group();
  private sciFi = new SciFiEffects(); private distortion = spaceDistortion();
  private transition = 0; private effectPulse = 0; private glow = 0; private spin = 0;
  private viewport = { width: innerWidth, height: innerHeight };
  private introCamera = new THREE.Vector3(); private playCamera = new THREE.Vector3(); private look = new THREE.Vector3();
  private entityPool: THREE.Group[] = []; private shaderMaterials: THREE.ShaderMaterial[] = [];
  private animationTime = 0;
  private entityGeometry = new Map<string, THREE.BufferGeometry>();
  private pendingModels = new Map<string, Promise<THREE.Group>>(); private selectionRequest = 0;
  private batchedEntityMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .42, metalness: .05 });
  private models = new Map<string, THREE.Group>(); private entityViews = new Map<number, THREE.Group>();
  private current?: THREE.Group; private selected = 'shock'; private elapsed = 0; private mix = 0; private hit = 0; private bonk = 0; private burst = 0;
  private particles: Particle[] = []; private rings: Ring[] = []; private points: THREE.Points;
  private particleGeo = new THREE.BufferGeometry(); private positions = new Float32Array(900 * 3); private colors = new Float32Array(900 * 3);
  private ambientPoints: THREE.Points; private decorations = new THREE.Group(); private halo: THREE.Mesh; private rimLight: THREE.PointLight;
  private enemyMaterials = [material(0xc57efa), material(0xff79af), material(0x9fc8ff), material(0x99dfd5), material(0xffa65d)];
  private teaGeometry = new THREE.CylinderGeometry(.28, .21, .65, 12); private teaMaterial = material(0xeec29d, .3);
  private enemyGeometry = new THREE.BoxGeometry(1.05, .8, .45); private darkMaterial = material(0x241d37, .35);
  private whiteMaterial = material(0xfff4dd, .4); private labelMaterials: THREE.SpriteMaterial[];
  private teaStrawMaterial = new THREE.MeshBasicMaterial({ color: PINK });
  private teaRingMaterial = new THREE.MeshBasicMaterial({ color: ACID });
  private lidGeometry = new THREE.CylinderGeometry(.3, .3, .07, 12);
  private strawGeometry = new THREE.CylinderGeometry(.025, .025, .47, 6);
  private pearlGeometry = new THREE.SphereGeometry(.045, 5, 4);
  private teaHaloGeometry = new THREE.TorusGeometry(.46, .02, 5, 24);
  private handleGeometry = new THREE.TorusGeometry(.2, .045, 5, 12, Math.PI);
  private buckleGeometry = new THREE.BoxGeometry(.16, .17, .02);
  private eyeGeometry = new THREE.BoxGeometry(.14, .07, .025);
  private footGeometry = new THREE.BoxGeometry(.22, .12, .35);
  private ringGeometry = new THREE.RingGeometry(.93, 1, 64);
  private stats = { calls: 0, triangles: 0 };
  readonly touchDevice = matchMedia('(pointer: coarse)').matches;
  quality = true; reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.touchDevice, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.touchDevice ? 1.25 : 1.65));
    this.renderer.shadowMap.enabled = !this.touchDevice; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    this.scene.background = new THREE.Color(0x030a16); this.scene.fog = new THREE.FogExp2(0x030a16, .018);
    this.scene.add(new THREE.HemisphereLight(0xf4e8ff, 0x462239, 2.4));
    const key = new THREE.DirectionalLight(0xfff5d5, 4.4); key.position.set(-5, 12, 10); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.layers.enable(1); Object.assign(key.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, far: 50 }); key.shadow.bias = -.0008; this.scene.add(key);
    this.rimLight = new THREE.PointLight(0xc986ff, 65, 24, 1.6); this.rimLight.position.set(5, 5, -4); this.scene.add(this.rimLight);
    const fill = new THREE.PointLight(PINK, 45, 23, 1.7); fill.position.set(-8, 3, 3); this.scene.add(fill);
    const ground = mesh(new THREE.PlaneGeometry(200, 200), material(0x071321, .72)); ground.rotation.x = -Math.PI / 2; ground.position.y = -.72; ground.receiveShadow = true; this.scene.add(ground);
    const grid = new THREE.GridHelper(120, 60, 0x246475, 0x102c3c); grid.position.y = -.7; (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = .35; this.scene.add(grid);
    this.scene.add(this.stage); this.buildStage(); this.stage.add(this.sciFi.group); this.scene.add(this.hero);
    const haloMat = new THREE.MeshBasicMaterial({ color: ACID, transparent: true, opacity: .8, side: THREE.DoubleSide });
    this.halo = mesh(new THREE.RingGeometry(1.1, 1.17, 64), haloMat); this.halo.rotation.x = -Math.PI / 2; this.halo.position.y = .025; this.scene.add(this.halo);
    this.scene.add(this.decorations); this.buildDecorations();
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3)); this.particleGeo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3)); this.particleGeo.setDrawRange(0, 0);
    const pointMat = new THREE.PointsMaterial({ size: .14, vertexColors: true, transparent: true, opacity: .95, depthWrite: false, blending: THREE.AdditiveBlending, map: this.softDot() });
    this.points = new THREE.Points(this.particleGeo, pointMat); this.points.frustumCulled = false; this.scene.add(this.points);
    const aGeo = new THREE.BufferGeometry(); const av = new Float32Array(160 * 3);
    for (let i = 0; i < av.length; i += 3) { av[i] = (Math.random() - .5) * 65; av[i + 1] = Math.random() * 20; av[i + 2] = (Math.random() - .5) * 50; }
    aGeo.setAttribute('position', new THREE.BufferAttribute(av, 3)); this.ambientPoints = new THREE.Points(aGeo, new THREE.PointsMaterial({ color: 0xc7a9ff, size: .045, transparent: true, opacity: .45, depthWrite: false })); this.scene.add(this.ambientPoints);
    this.labelMaterials = ['加班', 'KPI', '周一', '早八', '内耗'].map(t => new THREE.SpriteMaterial({ map: textTexture(t, '#251a36', '#f0d2ff'), depthWrite: false }));
    const renderTarget = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: this.touchDevice ? 0 : 4 });
    this.composer = new EffectComposer(this.renderer, renderTarget); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .38, .5, 1.3); this.composer.addPass(this.bloom); this.composer.addPass(this.distortion); this.composer.addPass(new OutputPass());
    this.resize(); window.addEventListener('resize', () => this.resize()); window.visualViewport?.addEventListener('resize', () => this.resize());
  }
  private softDot() {
    const c = document.createElement('canvas'); c.width = c.height = 32; const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, '#ffffff'); g.addColorStop(.2, '#ffffffff'); g.addColorStop(1, '#ffffff00'); ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
  }
  private buildStage() {
    const cylinder = mesh(new THREE.CylinderGeometry(12, 12.2, .58, 96), material(0x142a40, .35, .45), this.stage); cylinder.position.y = -.35; cylinder.receiveShadow = true;
    const top = mesh(new THREE.CircleGeometry(11.9, 96), material(0x0d1d30, .48, .3), this.stage); top.rotation.x = -Math.PI / 2; top.position.y = -.045; top.receiveShadow = true;
    for (const [r, color, opacity] of [[12, 0x57ecff, .95], [11.6, 0x727bff, .5], [8, 0x397084, .13], [4, 0x397084, .13]] as number[][]) {
      const ring = mesh(new THREE.TorusGeometry(r, r > 11 ? .045 : .015, 6, 128), new THREE.MeshBasicMaterial({ color, transparent: true, opacity }), this.stage); ring.rotation.x = Math.PI / 2; ring.position.y = -.012;
    }
    const axes = new THREE.Group(); this.stage.add(axes);
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2; const tick = mesh(new THREE.BoxGeometry(.055, .01, .3), new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? ACID : 0x946a9a }), axes);
      tick.position.set(Math.cos(a) * 11.15, -.01, Math.sin(a) * 11.15); tick.rotation.y = -a + Math.PI / 2;
      if (i % 3 === 0) {
        const pillar = mesh(new THREE.CylinderGeometry(.08, .15, .55, 8), material(0x422752), this.stage); pillar.position.set(Math.cos(a) * 12.25, -.18, Math.sin(a) * 12.25);
        const bulb = mesh(new THREE.SphereGeometry(.11, 8, 6), new THREE.MeshBasicMaterial({ color: PINK }), this.stage); bulb.position.copy(pillar.position); bulb.position.y = .1;
      }
    }
    const logo = mesh(new THREE.PlaneGeometry(6.2, 1.55), new THREE.MeshBasicMaterial({ map: textTexture('CHAOS // CORE', '#37647b'), transparent: true, depthWrite: false }), this.stage); logo.rotation.x = -Math.PI / 2; logo.position.set(0, -.02, 2);
  }
  private buildDecorations() {
    const pale = material(0x9d7bce, .35, .5);
    const donut = mesh(new THREE.TorusGeometry(.65, .17, 10, 40), pale, this.decorations); donut.position.set(8, 5, -4); donut.rotation.set(.4, .3, -.4);
    const orb = mesh(new THREE.IcosahedronGeometry(.42, 0), material(ACID, .3), this.decorations); orb.position.set(1.9, 5.7, -4);
    const x = new THREE.Group(); x.position.set(8.4, 1.1, 2.8); x.rotation.set(.3, -.3, .3); this.decorations.add(x);
    const barMat = material(0xff80ce, .35, .2);
    [Math.PI / 4, -Math.PI / 4].forEach(a => { const b = mesh(new THREE.BoxGeometry(.18, 1.4, .18), barMat, x); b.rotation.z = a; });
    const ball = mesh(new THREE.SphereGeometry(.24, 16, 12), material(0xe3e5ff, .2, .6), this.decorations); ball.position.set(1, 1.7, 3);
    const loop = mesh(new THREE.TorusGeometry(.45, .045, 6, 40), new THREE.MeshBasicMaterial({ color: PINK }), this.decorations); loop.position.set(6, 7.5, -6); loop.rotation.y = .5;
  }
  async load(progress: (loaded: number, total: number) => void) {
    await this.ensureModel('shock'); await this.select('shock'); progress(1, 1);
    // Enter with one model, then fetch alternatives without blocking play.
    window.setTimeout(() => { void (async () => {
      for (const c of CHARACTERS) if (c.key !== 'shock') { try { await this.ensureModel(c.key); } catch { /* Selecting this character can retry a failed download. */ } }
    })(); }, 900);
  }
  private ensureModel(key: string): Promise<THREE.Group> {
    const ready = this.models.get(key); if (ready) return Promise.resolve(ready);
    const pending = this.pendingModels.get(key); if (pending) return pending;
    const promise = (async () => {
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const embedded = (window as unknown as { NAILONG_MODELS?: Record<string, string> }).NAILONG_MODELS;
      const gltf = await loader.loadAsync(embedded?.[key] ?? `./models/${key}.glb`);
      gltf.scene.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true; o.receiveShadow = true;
          o.geometry.computeVertexNormals();
          o.material = characterMaterial();
          o.material.uniforms.uComposer.value = this.quality ? 1 : 0;
        }
      });
      this.models.set(key, gltf.scene); return gltf.scene;
    })().finally(() => this.pendingModels.delete(key));
    this.pendingModels.set(key, promise); return promise;
  }
  async select(key: string) {
    if (!CHARACTERS.some(c => c.key === key)) return false;
    const request = ++this.selectionRequest; const model = await this.ensureModel(key);
    if (request !== this.selectionRequest) return false;
    if (this.current) this.hero.remove(this.current);
    this.current = model; this.hero.add(model); this.selected = key; this.transition = this.reducedMotion ? 0 : .8;
    model.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.ShaderMaterial && !this.shaderMaterials.includes(o.material)) this.shaderMaterials.push(o.material); });
    return true;
  }
  resetEffects() {
    this.burst = this.hit = this.bonk = this.effectPulse = this.spin = 0; this.particles = []; this.sciFi.clear();
    for (const r of this.rings) { this.scene.remove(r.mesh); r.mesh.material.dispose(); }
    this.rings = []; this.hero.rotation.set(0, 0, 0);
  }
  resize() {
    const w = innerWidth, h = innerHeight; this.viewport = { width: w, height: h }; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio() * (this.touchDevice ? .7 : .85)); this.composer.setSize(w, h); this.distortion.uniforms.uAspect.value = w / h;
  }
  setQuality(high: boolean) { this.quality = high; this.models.forEach(g => g.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.ShaderMaterial) o.material.uniforms.uComposer.value = high ? 1 : 0; })); this.renderer.setPixelRatio(high ? Math.min(devicePixelRatio, this.touchDevice ? 1.25 : 1.65) : Math.min(devicePixelRatio, 1)); this.renderer.shadowMap.enabled = high && !this.touchDevice; this.resize(); }
  private makeEntity(e: Entity) {
    const pooled = this.entityPool.findIndex(g => g.userData.kind === e.kind && g.userData.flavor === e.flavor);
    if (pooled >= 0) { const g = this.entityPool.splice(pooled, 1)[0]; g.visible = true; this.scene.add(g); this.entityViews.set(e.id, g); return g; }
    const g = new THREE.Group(); g.userData = { kind: e.kind, flavor: e.flavor };
    const cacheKey = e.kind === 'tea' ? 'tea' : `enemy-${e.flavor}`;
    const cached = this.entityGeometry.get(cacheKey);
    if (cached) {
      const body = mesh(cached, this.batchedEntityMaterial, g); body.castShadow = e.kind === 'enemy';
      if (e.kind === 'enemy') this.addEnemyLabel(g, e.flavor);
      this.scene.add(g); this.entityViews.set(e.id, g); return g;
    }
    if (e.kind === 'tea') {
      const cup = mesh(this.teaGeometry, this.teaMaterial, g); cup.position.y = .65;
      const lid = mesh(this.lidGeometry, this.whiteMaterial, g); lid.position.y = 1.01;
      const straw = mesh(this.strawGeometry, this.teaStrawMaterial, g); straw.position.set(.09, 1.23, 0); straw.rotation.z = -.15;
      for (let i = 0; i < 4; i++) { const b = mesh(this.pearlGeometry, this.darkMaterial, g); b.position.set(Math.cos(i * 1.7) * .15, .43 + (i % 2) * .06, Math.sin(i * 1.7) * .15); }
      const ring = mesh(this.teaHaloGeometry, this.teaRingMaterial, g); ring.rotation.x = Math.PI / 2; ring.position.y = .16;
    } else {
      const body = mesh(this.enemyGeometry, this.enemyMaterials[e.flavor], g); body.position.y = .7; body.castShadow = true;
      const handle = mesh(this.handleGeometry, this.darkMaterial, g); handle.position.set(0, 1.12, 0);
      const face = mesh(this.buckleGeometry, this.whiteMaterial, g); face.position.set(0, .67, .24);
      for (const x of [-.28, .28]) { const eye = mesh(this.eyeGeometry, this.darkMaterial, g); eye.position.set(x, .83, .24); eye.rotation.z = -Math.sign(x) * .25; }
      this.addEnemyLabel(g, e.flavor);
      for (const x of [-.3, .3]) { const foot = mesh(this.footGeometry, this.darkMaterial, g); foot.position.set(x, .2, .08); }
    }
    const parts: THREE.BufferGeometry[] = [];
    for (const o of [...g.children]) if (o instanceof THREE.Mesh) {
      o.updateMatrix(); const geo = o.geometry.clone().applyMatrix4(o.matrix);
      const c = (o.material as THREE.MeshStandardMaterial).color;
      const colors = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(geo); g.remove(o);
    }
    const combined = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); this.entityGeometry.set(cacheKey, combined);
    const body = mesh(combined, this.batchedEntityMaterial, g); body.castShadow = e.kind === 'enemy';
    this.scene.add(g); this.entityViews.set(e.id, g); return g;
  }
  private addEnemyLabel(g: THREE.Group, flavor: number) { const tag = new THREE.Sprite(this.labelMaterials[flavor]); tag.position.set(0, 1.73, 0); tag.scale.set(1.25, .31, 1); g.add(tag); }
  private syncEntities(sim: Simulation) {
    const active = new Set(sim.entities.map(e => e.id));
    for (const [id, view] of this.entityViews) if (!active.has(id)) { this.scene.remove(view); this.entityViews.delete(id); this.disposeEntity(view); }
    for (const e of sim.entities) {
      const view = this.entityViews.get(e.id) ?? this.makeEntity(e);
      view.position.set(e.x, e.kind === 'tea' ? Math.sin(this.elapsed * 3 + e.id) * .13 : Math.abs(Math.sin(this.elapsed * 9 + e.id)) * .12, e.z);
      if (e.kind === 'tea') view.rotation.y = this.elapsed * 1.4 + e.id;
      else { view.rotation.y = Math.atan2(e.vx, e.vz); view.rotation.z = Math.sin(this.elapsed * 9 + e.id) * .09; }
      view.visible = sim.phase !== 'intro';
    }
  }
  private disposeEntity(g: THREE.Group) {
    if (this.entityPool.length < 60) this.entityPool.push(g);
  }
  event(e: GameEvent) {
    if (e.type === 'attack') { this.bonk = .3; this.ring(e.x, e.z, ACID, 3.4, .3); this.emit(e.x, .4, e.z, 15, ACID, 5); }
    if (e.type === 'collect') { this.emit(e.x, 1, e.z, 26, ACID, 4); this.ring(e.x, e.z, CYAN, 1.5, .4); }
    if (e.type === 'bonk') { this.hit = Math.max(this.hit, .13); this.emit(e.x, .8, e.z, 30, PINK, 7); this.ring(e.x, e.z, PINK, 2, .4); }
    if (e.type === 'dash') { this.effectPulse = .25; this.emit(e.x, .6, e.z, 45, CYAN, 5); this.ring(e.x, e.z, CYAN, 2.2, .4); }
    if (e.type === 'hit') { this.hit = .55; this.bonk = .5; this.emit(e.x, 1, e.z, 45, 0xff466f, 7); }
    if (e.type === 'ultimate') { this.hit = .9; this.burst = 3.3; this.effectPulse = 1.4; this.emit(e.x, 1, e.z, 260, CYAN, 17); this.ring(e.x, e.z, CYAN, 23, 1.25); this.ring(e.x, e.z, PINK, 19, 1.5); this.ring(e.x, e.z, ACID, 13, 1.1); }
  }
  private emit(x: number, y: number, z: number, count: number, color: number, speed: number) {
    if (this.reducedMotion) count = Math.min(count, 4); else if (this.touchDevice) count = Math.ceil(count * .55);
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (.3 + Math.random() * .7), life = .45 + Math.random() * .8;
      this.particles.push({ x, y, z, vx: Math.cos(a) * v, vy: 1 + Math.random() * speed * .8, vz: Math.sin(a) * v, life, max: life, color: c });
    }
    const cap = this.touchDevice ? 400 : 900; if (this.particles.length > cap) this.particles.splice(0, this.particles.length - cap);
  }
  private ring(x: number, z: number, color: number, radius: number, duration: number) {
    if (this.rings.length > 20 || this.reducedMotion) return;
    const m = mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, .1, z); this.scene.add(m); this.rings.push({ mesh: m, life: duration, max: duration, radius });
  }
  project(x: number, z: number) { tmp.set(x, 1.6, z).project(this.camera); return { x: (tmp.x + 1) * innerWidth / 2, y: (-tmp.y + 1) * innerHeight / 2 }; }
  update(dt: number, sim: Simulation, inputMoving: boolean) {
    const effectDt = sim.phase === 'paused' || sim.phase === 'result' ? 0 : dt;
    this.elapsed += effectDt; this.animationTime += this.reducedMotion ? 0 : effectDt;
    const t = this.animationTime, playing = sim.phase !== 'intro', mobile = this.viewport.width <= 700 || (this.touchDevice && this.viewport.height < 600);
    this.effectPulse = Math.max(0, this.effectPulse - effectDt * .8); this.transition = Math.max(0, this.transition - effectDt);
    this.mix = THREE.MathUtils.damp(this.mix, playing ? 1 : 0, 3.2, dt);
    this.hit = Math.max(0, this.hit - effectDt); this.bonk = Math.max(0, this.bonk - effectDt); this.burst = Math.max(0, this.burst - effectDt);
    const heroIntroX = mobile ? 0 : 4.3;
    const ix = heroIntroX * (1 - this.mix), iz = mobile ? .9 : 0;
    this.stage.position.x = ix; this.stage.position.z = iz * (1 - this.mix); this.stage.scale.setScalar(THREE.MathUtils.lerp(mobile ? .28 : .38, 1, this.mix));
    const introScale = mobile ? 1.12 : 1.6, heroScale = THREE.MathUtils.lerp(introScale, mobile ? .85 : .8, this.mix);
    const activeMove = playing && sim.phase === 'playing' && inputMoving;
    const bounce = this.reducedMotion ? 0 : activeMove ? Math.abs(Math.sin(t * 17)) * .22 : Math.sin(t * 2.6) * .055;
    this.hero.position.set(THREE.MathUtils.lerp(heroIntroX, sim.x, this.mix), bounce, THREE.MathUtils.lerp(iz, sim.z, this.mix));
    const squash = this.bonk > 0 ? Math.sin(this.bonk * 23) * .13 : activeMove ? Math.sin(t * 17) * .045 : Math.sin(t * 2.6) * .018;
    this.hero.scale.set(heroScale * (1 + squash * .5), heroScale * (1 - squash), heroScale * (1 + squash * .5));
    const introYaw = Math.sin(t * .45) * .17 - .2;
    const yaw = playing ? sim.facing : introYaw;
    const angle = Math.atan2(Math.sin(yaw - this.hero.rotation.y), Math.cos(yaw - this.hero.rotation.y)); this.hero.rotation.y += angle * Math.min(1, dt * 12);
    this.hero.rotation.z = this.reducedMotion ? 0 : activeMove ? Math.sin(t * 8) * .075 : Math.sin(t * 2) * .025;
    if (this.burst > 0 && !this.reducedMotion) { this.spin += effectDt * 15; this.hero.rotation.y = sim.facing + this.spin; this.hero.position.y += Math.sin((3.3 - this.burst) * 8) * .2 + .35; } else this.spin = 0;
    this.hero.visible = true;
    this.glow = THREE.MathUtils.damp(this.glow, sim.invincible > 0 && playing ? .3 : 0, 6, dt);
    this.shaderMaterials.forEach(m => { m.uniforms.uTime.value = t; m.uniforms.uReveal.value = this.transition / .8; m.uniforms.uShield.value = this.glow; });
    this.halo.position.set(this.hero.position.x, .035, this.hero.position.z); this.halo.scale.setScalar(playing ? 1 : 1.85); this.halo.visible = playing;
    this.halo.rotation.z = t;
    const landscape = this.viewport.width > this.viewport.height;
    this.introCamera.set(mobile ? 0 : -.7, mobile ? 8 : 7, mobile ? 22 : 21);
    this.playCamera.set(sim.x * .08, mobile ? (landscape ? 27 : 30) : 24, mobile ? (landscape ? 28 : 33) : 27 + sim.z * .08);
    this.camera.position.lerpVectors(this.introCamera, this.playCamera, this.mix);
    const fov = THREE.MathUtils.lerp(38, mobile ? (landscape ? 47 : 57) : 38, this.mix) + (this.reducedMotion ? 0 : this.effectPulse * 2);
    if (Math.abs(this.camera.fov - fov) > .01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.look.set(0, THREE.MathUtils.lerp(mobile ? 4.7 : 2, -.5, this.mix), 0);
    if (this.hit > 0 && !this.reducedMotion) { this.camera.position.x += (Math.random() - .5) * this.hit * .7; this.camera.position.y += (Math.random() - .5) * this.hit * .4; }
    this.camera.lookAt(this.look);
    this.decorations.visible = this.mix < .98;
    this.decorations.children.forEach((o, i) => { o.rotation.y += (this.reducedMotion ? 0 : effectDt) * (i % 2 ? .25 : -.17); o.position.y += Math.sin(t * 1.4 + i) * (this.reducedMotion ? 0 : effectDt) * .13; });
    this.ambientPoints.rotation.y = t * .009;
    this.rimLight.intensity = this.burst > 0 ? 115 : 65;
    this.bloom.strength = this.quality ? (this.burst > 0 ? .8 : .32) : 0;
    this.syncEntities(sim);
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach((p, i) => {
      p.life -= effectDt; p.x += p.vx * effectDt; p.y += p.vy * effectDt; p.z += p.vz * effectDt; p.vy -= effectDt * 11;
      const a = Math.max(0, p.life / p.max); this.positions.set([p.x, p.y, p.z], i * 3); this.colors.set([p.color.r * a, p.color.g * a, p.color.b * a], i * 3);
    });
    this.particleGeo.setDrawRange(0, this.particles.length); this.particleGeo.attributes.position.needsUpdate = true; this.particleGeo.attributes.color.needsUpdate = true;
    this.rings = this.rings.filter(r => {
      r.life -= effectDt; if (r.life <= 0) { this.scene.remove(r.mesh); r.mesh.material.dispose(); return false; }
      const a = 1 - r.life / r.max; r.mesh.scale.setScalar(.1 + a * r.radius); r.mesh.material.opacity = 1 - a; return true;
    });
    if (sim.dashTime > 0 && sim.phase === 'playing' && Math.random() < .8) this.emit(sim.x, .5, sim.z, 3, CYAN, 1.5);
    this.sciFi.update(effectDt, { x: sim.x, z: sim.z, facing: sim.facing, dash: sim.dashTime > 0 && sim.phase === 'playing', burst: this.burst, invincible: sim.invincible > 0, intro: !playing, energy: sim.energy, reduced: this.reducedMotion, mobile });
    this.distortion.uniforms.uTime.value = t; this.distortion.uniforms.uPulse.value = this.reducedMotion ? 0 : this.effectPulse; this.distortion.uniforms.uImpact.value = this.reducedMotion ? 0 : this.hit;
    this.renderer.info.reset();
    if (this.quality) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.stats.calls = this.renderer.info.render.calls; this.stats.triangles = this.renderer.info.render.triangles;
  }
  diagnostics() { return { models: [...this.models.keys()], selected: this.selected, drawCalls: this.stats.calls, triangles: this.stats.triangles, geometries: this.renderer.info.memory.geometries, particles: this.particles.length, pooledEntities: this.entityPool.length, quality: this.quality, pixelRatio: this.renderer.getPixelRatio(), touch: this.touchDevice }; }
}
