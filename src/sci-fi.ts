import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const CYAN = 0x57ecff;
export function holographicFloor() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform float uPower;
      float line(float x,float width){return 1.-smoothstep(width,width+.012,abs(x));}
      void main(){
        vec2 p=(vUv-.5)*24.; float r=length(p); float a=atan(p.y,p.x);
        float grid=max(line(fract(p.x*.5)-.5,.008),line(fract(p.y*.5)-.5,.008))*.15;
        float rings=line(fract(r*.25)-.5,.008)*.17;
        float scan=exp(-pow((r-mod(uTime*1.7,15.))/.38,2.))*.5;
        float sector=pow(max(0.,cos(a-uTime*.22)),64.)*.2;
        float rim=line(r-11.3,.018)*(.5+.5*pow(sin(a*24.+uTime),2.));
        float radial=line(fract((a+3.14159)/6.28318*12.)-.5,.003)*smoothstep(4.,11.,r)*.12;
        float alpha=(grid+rings+scan+sector+rim+radial)*smoothstep(12.,11.6,r);
        vec3 color=mix(vec3(.04,.62,.86),vec3(.55,1.,.72),uPower);
        gl_FragColor=vec4(color*(1.+scan*1.4),alpha*(.65+uPower*.3));
      }`,
    blending: THREE.AdditiveBlending,
  });
}

export const spaceDistortion = () => new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uPulse: { value: 0 }, uImpact: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    uniform float uTime,uPulse,uImpact,uAspect;
    void main(){
      vec2 p=vUv-.5; vec2 aspect=vec2(uAspect,1.); float r=length(p*aspect);
      float wave=sin(r*45.-uTime*14.)*exp(-r*3.)*uPulse*.006;
      vec2 uv=vUv+normalize(p+vec2(.0001))*wave;
      float edge=smoothstep(.15,.75,r);
      vec2 split=p*edge*(uPulse*.009+uImpact*.007);
      vec4 base=texture2D(tDiffuse,clamp(uv,vec2(.002),vec2(.998)));
      base.r=texture2D(tDiffuse,clamp(uv+split,vec2(.002),vec2(.998))).r;
      base.b=texture2D(tDiffuse,clamp(uv-split,vec2(.002),vec2(.998))).b;
      float scan=sin(vUv.y*850.+uTime*2.)*.006*edge;
      base.rgb*=1.-scan;
      gl_FragColor=base;
    }`,
});

type Arc = { object: THREE.Mesh; speed: number; phase: number };
export class SciFiEffects {
  readonly group = new THREE.Group();
  readonly floor = new THREE.Mesh(new THREE.CircleGeometry(11.8, 80), holographicFloor());
  private arcs: Arc[] = []; private dust: THREE.Points;
  private shards: THREE.InstancedMesh; private matrix = new THREE.Object3D();
  private shield: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private beam: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private trails: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private trailData: { x: number; z: number; angle: number; life: number }[] = [];
  private clock = 0; private trailClock = 0;
  constructor() {
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = .007; this.group.add(this.floor);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.MeshBasicMaterial({ color: i % 2 ? 0xad82ff : CYAN, transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const arc = new THREE.Mesh(new THREE.RingGeometry(12.3 + i * .36, 12.32 + i * .36, 96, 1, i * .3, Math.PI * (i % 2 ? 1.1 : .7)), m);
      arc.rotation.x = -Math.PI / 2; arc.position.y = -.25 - i * .06; this.group.add(arc); this.arcs.push({ object: arc, speed: (i % 2 ? -1 : 1) * (.07 + i * .02), phase: i * 1.3 });
    }
    const positions = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) { const a = i * 2.399; const r = 15 + (i % 17) * 1.8; positions.set([Math.cos(a) * r, -1 + (i % 31) * .7, Math.sin(a) * r], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: CYAN, size: .045, transparent: true, opacity: .55, depthWrite: false })); this.group.add(this.dust);
    this.shards = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.15, 0), new THREE.MeshBasicMaterial({ color: CYAN, wireframe: true, transparent: true, opacity: .55 }), 28); this.shards.frustumCulled = false; this.group.add(this.shards);
    const shieldMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
      vertexShader: `varying vec3 vNormal; varying vec3 vView; varying vec3 vPos; void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);vPos=position;gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying vec3 vNormal,vView,vPos;uniform float uTime,uPower;void main(){float fres=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.8);float bands=pow(max(0.,sin(vPos.y*35.-uTime*8.)),18.);float lat=pow(max(0.,cos(atan(vPos.z,vPos.x)*18.)),40.);gl_FragColor=vec4(vec3(.18,.85,1.),(fres*.48+bands*.065+lat*.025)*uPower);}`,
    });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), shieldMaterial); this.shield.visible = false; this.group.add(this.shield);
    const beamMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv;uniform float uTime,uPower;void main(){float lines=pow(max(0.,sin(vUv.x*100.+uTime*3.)),24.);float fade=pow(1.-vUv.y,2.);gl_FragColor=vec4(vec3(.12,.7,1.5),fade*(.025+lines*.11)*uPower);}` });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 11, 48, 1, true), beamMaterial); this.beam.position.y = 5.3; this.group.add(this.beam);
    this.trails = new THREE.InstancedMesh(new THREE.BoxGeometry(.6, .025, 1.35), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: .58, depthWrite: false, blending: THREE.AdditiveBlending }), 24); this.trails.count = 0; this.trails.frustumCulled = false; this.group.add(this.trails);
  }
  clear() { this.trailData = []; this.trails.count = 0; }
  update(dt: number, state: { x: number; z: number; facing: number; dash: boolean; burst: number; invincible: boolean; intro: boolean; energy: number; reduced: boolean; mobile: boolean }) {
    this.clock += state.reduced ? 0 : dt; const t = this.clock;
    this.floor.material.uniforms.uTime.value = t; this.floor.material.uniforms.uPower.value = state.burst > 0 ? .8 : state.energy * .002;
    for (const arc of this.arcs) arc.object.rotation.z = arc.phase + t * arc.speed;
    this.dust.rotation.y = t * .012;
    this.shards.count = state.mobile ? 14 : 28;
    for (let i = 0; i < this.shards.count; i++) {
      const a = i * 2.399 + t * .025, r = 13.8 + i % 4;
      this.matrix.position.set(Math.cos(a) * r, .6 + Math.sin(t * .6 + i) * .5 + i % 3, Math.sin(a) * r);
      this.matrix.rotation.set(t * .3 + i, t * .2, i); this.matrix.scale.setScalar(1); this.matrix.updateMatrix(); this.shards.setMatrixAt(i, this.matrix.matrix);
    }
    this.shards.instanceMatrix.needsUpdate = true;
    const shieldPower = state.burst > 0 ? Math.min(1, state.burst) : state.invincible ? .35 : 0;
    this.shield.visible = shieldPower > 0 && !state.intro;
    this.shield.position.set(state.x, 1.2, state.z); this.shield.scale.setScalar(state.burst > 0 ? 2.45 : 1.6);
    this.shield.material.uniforms.uTime.value = t; this.shield.material.uniforms.uPower.value = shieldPower;
    this.beam.visible = state.intro || state.burst > 0;
    this.beam.position.x = state.intro ? 0 : state.x; this.beam.position.z = state.intro ? 0 : state.z;
    this.beam.material.uniforms.uTime.value = t; this.beam.material.uniforms.uPower.value = state.intro ? .65 : Math.min(2, state.burst);
    this.trailClock -= dt;
    if (state.dash && !state.reduced && this.trailClock <= 0) { this.trailClock = .025; this.trailData.unshift({ x: state.x, z: state.z, angle: state.facing, life: .4 }); }
    this.trailData = this.trailData.filter(e => (e.life -= dt) > 0).slice(0, 24); this.trails.count = this.trailData.length;
    this.trailData.forEach((e, i) => { this.matrix.position.set(e.x, .04, e.z); this.matrix.rotation.set(0, e.angle, 0); this.matrix.scale.set(e.life * 2, 1, e.life * 3); this.matrix.updateMatrix(); this.trails.setMatrixAt(i, this.matrix.matrix); });
    this.trails.instanceMatrix.needsUpdate = true;
  }
}
