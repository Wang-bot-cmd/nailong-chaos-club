export type Phase = 'intro' | 'playing' | 'paused' | 'result';
export type Entity = { id: number; kind: 'tea' | 'enemy'; x: number; z: number; vx: number; vz: number; age: number; flavor: number };
export type GameEvent = { type: 'collect' | 'bonk' | 'hit' | 'dash' | 'ultimate' | 'end' | 'attack'; x: number; z: number; value?: number };
export type Input = { x: number; z: number };
export class Simulation {
  phase: Phase = 'intro'; score = 0; time = 60; hp = 3; combo = 0; maxCombo = 0; energy = 25;
  cups = 0; bonks = 0; x = 0; z = 0; facing = 0; invincible = 0; dashTime = 0; dashCooldown = 0;
  attackCooldown = 0; ultimateTime = 0; elapsed = 0; entities: Entity[] = []; events: GameEvent[] = [];
  private nextId = 0; private spawnClock = 0; private teaClock = 0; private comboClock = 0;
  private dashX = 0; private dashZ = -1; private seed = 137;
  random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  start() {
    Object.assign(this, { phase: 'playing', score: 0, time: 60, hp: 3, combo: 0, maxCombo: 0, energy: 25,
      cups: 0, bonks: 0, x: 0, z: 0, facing: 0, invincible: 1, dashTime: 0, dashCooldown: 0,
      attackCooldown: 0, ultimateTime: 0, elapsed: 0, spawnClock: .5, teaClock: 1.8, comboClock: 0 });
    this.seed = 137; this.entities = []; this.events = []; this.nextId = 0;
    for (let i = 0; i < 7; i++) this.spawnTea(i === 0 ? [0, -2.7] : undefined);
  }
  spawnTea(at?: number[]) {
    const angle = this.random() * Math.PI * 2, radius = 2 + this.random() * 7.5;
    this.entities.push({ id: this.nextId++, kind: 'tea', x: at?.[0] ?? Math.cos(angle) * radius, z: at?.[1] ?? Math.sin(angle) * radius, vx: 0, vz: 0, age: 0, flavor: Math.floor(this.random() * 3) });
  }
  spawnEnemy() {
    const a = this.random() * Math.PI * 2;
    this.entities.push({ id: this.nextId++, kind: 'enemy', x: Math.cos(a) * 11.7, z: Math.sin(a) * 11.7, vx: 0, vz: 0, age: 0, flavor: Math.floor(this.random() * 5) });
  }
  award(value: number) { this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.comboClock = 4.2; return Math.round(value * (1 + Math.min(this.combo - 1, 15) * .1)); }
  attack() {
    if (this.phase !== 'playing' || this.attackCooldown > 0) return;
    this.attackCooldown = .4; this.events.push({ type: 'attack', x: this.x, z: this.z });
    this.destroyWithin(3.3, false);
  }
  private destroyWithin(radius: number, ultimate: boolean) {
    this.entities = this.entities.filter(e => {
      if (e.kind !== 'enemy' || Math.hypot(e.x - this.x, e.z - this.z) > radius) return true;
      const value = this.award(ultimate ? 250 : 150); this.score += value; this.bonks++;
      this.energy = Math.min(100, this.energy + 14); this.events.push({ type: 'bonk', x: e.x, z: e.z, value }); return false;
    });
  }
  dash(input: Input) {
    if (this.phase !== 'playing' || this.dashCooldown > 0) return;
    const n = Math.hypot(input.x, input.z);
    this.dashX = n > .1 ? input.x / n : Math.sin(this.facing); this.dashZ = n > .1 ? input.z / n : Math.cos(this.facing);
    this.dashTime = .21; this.dashCooldown = 1.05; this.invincible = .6;
    this.events.push({ type: 'dash', x: this.x, z: this.z });
  }
  ultimate() {
    if (this.phase !== 'playing' || this.energy < 100) return false;
    this.events.push({ type: 'ultimate', x: this.x, z: this.z }); this.destroyWithin(100, true);
    this.energy = 0; this.ultimateTime = 3.3; this.invincible = 3.5;
    return true;
  }
  step(dt: number, input: Input) {
    if (this.phase !== 'playing') return;
    this.elapsed += dt; this.time = Math.max(0, 60 - this.elapsed);
    this.invincible = Math.max(0, this.invincible - dt); this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt); this.ultimateTime = Math.max(0, this.ultimateTime - dt);
    this.comboClock -= dt; if (this.comboClock <= 0) this.combo = 0;
    this.energy = Math.min(100, this.energy + dt * 1.2);
    const n = Math.max(1, Math.hypot(input.x, input.z));
    const dx = this.dashTime > 0 ? this.dashX : input.x / n, dz = this.dashTime > 0 ? this.dashZ : input.z / n;
    const speed = this.dashTime > 0 ? 23 : 7.6;
    this.x += dx * speed * dt; this.z += dz * speed * dt;
    if (Math.abs(dx) + Math.abs(dz) > .05) this.facing = Math.atan2(dx, dz);
    this.dashTime = Math.max(0, this.dashTime - dt);
    const radius = Math.hypot(this.x, this.z); if (radius > 10.7) { this.x *= 10.7 / radius; this.z *= 10.7 / radius; }
    if (this.dashTime > 0 || this.ultimateTime > 0) this.destroyWithin(this.ultimateTime > 0 ? 3.7 : 1.8, this.ultimateTime > 0);
    this.spawnClock -= dt; this.teaClock -= dt;
    if (this.spawnClock <= 0 && this.entities.filter(e => e.kind === 'enemy').length < 22) { this.spawnEnemy(); this.spawnClock = Math.max(.38, 1.25 - this.elapsed * .015); }
    if (this.teaClock <= 0) { if (this.entities.filter(e => e.kind === 'tea').length < 12) this.spawnTea(); this.teaClock = 1.6; }
    const slowed = this.ultimateTime > 0 ? .35 : 1;
    this.entities = this.entities.filter(e => {
      e.age += dt;
      if (e.kind === 'enemy') {
        const ex = this.x - e.x, ez = this.z - e.z, len = Math.hypot(ex, ez) || 1;
        const v = (1.8 + this.elapsed * .025 + e.flavor * .12) * slowed;
        e.vx = ex / len * v; e.vz = ez / len * v; e.x += e.vx * dt; e.z += e.vz * dt;
      }
      const distance = Math.hypot(e.x - this.x, e.z - this.z);
      if (e.kind === 'tea' && distance < 1.25) {
        const value = this.award(100); this.score += value; this.cups++; this.energy = Math.min(100, this.energy + 10);
        this.events.push({ type: 'collect', x: e.x, z: e.z, value }); return false;
      }
      if (e.kind === 'enemy' && distance < 1.05 && this.invincible <= 0) {
        this.hp--; this.combo = 0; this.invincible = 2;
        this.events.push({ type: 'hit', x: this.x, z: this.z }); return false;
      }
      return true;
    });
    if (this.time <= 0 || this.hp <= 0) { this.phase = 'result'; this.events.push({ type: 'end', x: this.x, z: this.z }); }
  }
}
