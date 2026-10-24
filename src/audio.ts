export class Sound {
  private ctx?: AudioContext; enabled = false; private beat = 0; private step = 0;
  unlock() { this.ctx ??= new AudioContext(); if (this.ctx.state === 'suspended') void this.ctx.resume(); }
  setEnabled(value: boolean) { this.unlock(); this.enabled = value; if (value) this.play('collect'); }
  private tone(freq: number, duration: number, type: OscillatorType = 'sine', volume = .08, slide = 1, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), gain = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(25, freq * slide), t + duration);
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(volume, t + .008); gain.gain.exponentialRampToValueAtTime(.001, t + duration);
    o.connect(gain); gain.connect(this.ctx.destination); o.start(t); o.stop(t + duration + .02);
  }
  play(kind: string) {
    if (kind === 'collect') { this.tone(660, .12, 'sine', .08, 1.3); this.tone(990, .2, 'sine', .06, 1.1, .08); }
    if (kind === 'attack' || kind === 'bonk') { this.tone(kind === 'bonk' ? 200 : 100, .16, 'triangle', .12, .3); this.tone(600, .06, 'square', .025, .3); }
    if (kind === 'dash') this.tone(180, .19, 'sawtooth', .035, 6);
    if (kind === 'hit') { this.tone(200, .35, 'sawtooth', .07, .25); this.tone(150, .3, 'square', .025, .5); }
    if (kind === 'ultimate') { [130.81, 164.81, 196, 261.63, 523.25].forEach((n, i) => this.tone(n, 1, 'sawtooth', .025, 1.01, i * .08)); }
    if (kind === 'end') [523, 440, 349, 262].forEach((n, i) => this.tone(n, .35, 'triangle', .06, 1, i * .13));
  }
  update(dt: number, playing: boolean) {
    if (!playing || !this.enabled) return;
    this.beat -= dt; if (this.beat > 0) return; this.beat += .24;
    const bass = [65.4, 65.4, 98, 65.4, 82.4, 82.4, 98, 73.4];
    if (this.step % 2 === 0) { this.tone(110, .13, 'sine', .1, .25); this.tone(bass[(this.step / 2) % 8], .19, 'triangle', .035); }
    this.tone(this.step % 4 === 2 ? 1600 : 3200, .035, 'square', .008, .4);
    this.step++;
  }
}
