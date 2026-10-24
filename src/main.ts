import './style.css';
import './sci-fi.css';
import { Simulation, type GameEvent, type Input } from './simulation';
import { GameRenderer, CHARACTERS } from './render';
import { Sound } from './audio';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
// Keep the game's controls above a hosting provider's footer badge.
function syncHostFooter() { document.body.classList.toggle('has-host-footer', !!document.getElementById('nl-badge-frame')); }
new MutationObserver(syncHostFooter).observe(document.body, { childList: true });
syncHostFooter();
const sim = new Simulation(); const sound = new Sound();
let view: GameRenderer; let selected = 'shock'; let loaded = false; let last = performance.now();
let toastTimer = 0; let modalReturn: 'intro' | 'playing' | 'paused' | 'result' = 'intro'; let modalOpen = false;
let memeClock = 0; let captionClock = 5; let readyAnnounced = false; let lowFrames = 0; let autoQuality = false;
let hudClock = 0; let attackHeld = false; let fixedTime = 0; let qualityMode: 'auto' | 'high' | 'eco' = 'auto';
const FIXED_STEP = 1 / 60;
const keys = new Set<string>(); const joystick: Input = { x: 0, z: 0 };
let best = 0; try { best = Number(localStorage.getItem('nailong-best-v1')) || 0; } catch { /* Private mode still supports play. */ }
const captions = ['今天的 KPI：快乐。', '只要我够圆，生活就拿捏不了我。', '奶茶全糖，人生免苦。', '不是我不努力，是奶龙在加载。', '精神状态良好，偶尔发疯。', '工资没涨，快乐值先涨。', '不听不听，奶龙念经。'];
const chat = ['这就是传说中的奶龙步？', '不是，哥们你真创啊', '奶门！', '你小子有点奶东西', '好圆润的精神状态', '不愧是我电子同事', '班味已经被创飞', '呱！有挂！', '建议全公司推广'];

function input(): Input { return { x: Math.max(-1, Math.min(1, (Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))) + joystick.x)), z: Math.max(-1, Math.min(1, (Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'))) + joystick.z)) }; }
function clearInput() { keys.clear(); joystick.x = joystick.z = 0; attackHeld = false; $('stick').style.transform = ''; }
function haptic(duration: number) { if (!view.reducedMotion && document.visibilityState === 'visible') navigator.vibrate?.(duration); }
function toast(text: string) { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').classList.add('visible'); toastTimer = window.setTimeout(() => $('toast').classList.remove('visible'), 2500); }
function soundButton() { $('sound').classList.toggle('muted', !sound.enabled); $('sound').setAttribute('aria-label', sound.enabled ? '关闭声音' : '开启声音'); $('sound').title = sound.enabled ? '关闭声音' : '开启声音'; }
function meme(text: string) { if (view.reducedMotion) { toast(text); return; } const el = document.createElement('div'); el.className = 'meme-word'; el.textContent = text; $('fx-text').append(el); setTimeout(() => el.remove(), 1250); }
function danmaku(text: string) { if (view.reducedMotion || sim.phase !== 'playing' || document.querySelectorAll('.danmaku').length > 4) return; const el = document.createElement('div'); el.className = 'danmaku'; el.style.top = `${27 + Math.random() * 12}%`; el.textContent = text; $('fx-text').append(el); setTimeout(() => el.remove(), 8100); }
function floatScore(e: GameEvent) { if (document.querySelectorAll('.float-score').length >= (view.touchDevice ? 10 : 20)) return; const pos = view.project(e.x, e.z); const el = document.createElement('div'); el.className = 'float-score'; el.textContent = `+${e.value}`; el.style.left = `${pos.x}px`; el.style.top = `${pos.y}px`; $('fx-text').append(el); setTimeout(() => el.remove(), 950); }
function updateHud() {
  $('score').textContent = String(sim.score).padStart(6, '0'); $('time').innerHTML = `${Math.ceil(sim.time)}<span>s</span>`;
  $('time').style.color = sim.time < 10 ? '#ff79af' : '';
  $('hearts').textContent = '♥ '.repeat(Math.max(0, sim.hp)) + '♡ '.repeat(Math.max(0, 3 - sim.hp));
  $('combo').textContent = String(sim.combo); $('combo-block').classList.toggle('active', sim.combo >= 2);
  $('energy-fill').style.width = `${sim.energy}%`; $('energy-label').textContent = `Q / ${Math.floor(sim.energy)}%`;
  $('ultimate-label').textContent = sim.energy >= 100 ? '现在就发疯！' : '发疯蓄力中'; $('ultimate').classList.toggle('ready', sim.energy >= 100);
  $('touch-dash').style.opacity = sim.dashCooldown > 0 ? '.4' : '1';
  $('touch-dash').style.setProperty('--cooldown', `${Math.min(100, sim.dashCooldown / 1.05 * 100)}%`);
  $('touch-dash').setAttribute('aria-label', sim.dashCooldown > 0 ? '闪现冷却中' : '闪现就绪');
  if (sim.energy >= 100 && !readyAnnounced && sim.phase === 'playing') { readyAnnounced = true; toast('精神状态已拉满！按 Q 释放发疯大招'); sound.play('collect'); }
  if (sim.energy < 100) readyAnnounced = false;
}
function start() {
  if (!loaded) return;
  hideModal(); sim.start(); view.resetEffects(); clearInput(); fixedTime = 0; $('fx-text').replaceChildren();
  document.body.classList.add('playing'); $('intro').hidden = true; $('hud').hidden = false;
  sound.unlock(); if (!$('sound').dataset.touched) sound.enabled = true; soundButton();
  captionClock = 5; memeClock = 0; readyAnnounced = false; updateHud();
  $('game-caption').textContent = captions[0]; toast(view.touchDevice || innerWidth <= 700 ? '左手移动 · 右手按住创飞 · 能量满就发疯！' : 'WASD 移动 · 点击创飞 · 空格闪现 · Q 发疯');
}
function home() {
  hideModal(); sim.phase = 'intro'; sim.entities = []; sim.x = sim.z = sim.facing = 0; sim.ultimateTime = sim.invincible = 0; view.resetEffects();
  clearInput(); $('intro').hidden = false; $('hud').hidden = true; document.body.classList.remove('playing'); $('fx-text').replaceChildren();
}
function showModal(content: string, after?: () => void) {
  modalOpen = true; clearInput(); $('modal-content').innerHTML = content; $('modal-backdrop').hidden = false;
  after?.(); setTimeout(() => $('modal-content').querySelector<HTMLButtonElement>('button')?.focus(), 0);
}
function hideModal() { modalOpen = false; $('modal-backdrop').hidden = true; }
function resume() { hideModal(); if (sim.phase === 'paused') sim.phase = 'playing'; clearInput(); last = performance.now(); }
function pause() {
  if (sim.phase !== 'playing' || modalOpen) return;
  sim.phase = 'paused';
  showModal('<div class="eyebrow">TAKE A MILK BREAK</div><h2 id="modal-title">先摆一会儿。</h2><p>快乐已暂停，班味也别想偷袭。<br/>奶龙正在原地思考龙生。</p><div class="modal-actions"><button id="resume" class="primary-button">继续发疯 ↗</button><button id="go-home" class="secondary-button">回事务所</button></div>', () => {
    $('resume').onclick = resume; $('go-home').onclick = home;
  });
}
function help() {
  if (modalOpen) return;
  modalReturn = sim.phase; if (sim.phase === 'playing') sim.phase = 'paused';
  showModal('<div class="eyebrow">OPERATING MANUAL / 不正经版</div><h2 id="modal-title">这班，一秒也不想上。</h2><p>坚持 60 秒，收集奶茶提升快乐值。小心追过来的班味公文包，被撞三次就会被抓去上班。</p><div class="help-rows"><b>WASD / 方向键</b><span>自由移动。手机用左下摇杆。</span><b>鼠标点击 / J</b><span>创飞附近的班味；手机点「创飞」。</span><b>空格 / Shift</b><span>短暂无敌闪现，也能撞飞公文包。</span><b>Q / 底部按钮</b><span>奶茶和连击会积攒能量，100% 时释放全场清屏大招。</span><b>Esc / P</b><span>暂停。连续得分可叠加奖励，4 秒未得分会断连。</span></div><div class="modal-actions"><button id="help-close" class="primary-button">懂了，奶门！ ↗</button></div>', () => {
    $('help-close').onclick = () => { hideModal(); if (modalReturn === 'playing') sim.phase = 'playing'; };
  });
}
function settings() {
  if (modalOpen) return;
  const from = sim.phase; if (from === 'playing') sim.phase = 'paused';
  showModal(`<div class="eyebrow">NEURAL ENGINE / 舞台调校</div><h2 id="modal-title">给奶龙配点科技。</h2><p>自动模式会在持续掉帧时降低开销。手机默认限制渲染分辨率，保留全息地台、能量护盾和闪现拖尾。</p><div class="quality-options"><button data-quality="auto">自适应<small>流畅与特效平衡</small></button><button data-quality="high">超频<small>辉光与空间扭曲</small></button><button data-quality="eco">轻量<small>减少发热与耗电</small></button></div><p id="quality-status"></p><div class="modal-actions"><button id="fullscreen" class="secondary-button">全屏沉浸</button><button id="settings-close" class="primary-button">就这样 ↗</button></div>`, () => {
    function refresh() { document.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach(b => b.classList.toggle('selected', b.dataset.quality === qualityMode)); $('quality-status').textContent = `当前：${view.quality ? '全特效' : '轻量'} · ${view.reducedMotion ? '已遵循减少动态效果设置' : '科幻动效已开启'}`; }
    document.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach(b => b.onclick = () => { qualityMode = b.dataset.quality as typeof qualityMode; autoQuality = false; lowFrames = 0; view.setQuality(qualityMode !== 'eco'); refresh(); }); refresh();
    $('settings-close').onclick = () => { hideModal(); if (from === 'playing') sim.phase = 'playing'; };
    $('fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else toast('当前浏览器暂不支持全屏，可添加到主屏幕游玩。'); } catch { toast('当前浏览器暂不支持全屏。'); } };
  });
}
function result() {
  clearInput(); const survived = sim.hp > 0;
  const rank = !survived ? '暂时被生活拿捏了' : sim.score >= 10000 ? '宇宙级发疯艺术家' : sim.score >= 5000 ? '全公司最靓的龙' : sim.score >= 2500 ? '反内耗精神领袖' : '快乐摸鱼实习生';
  const previous = best; best = Math.max(best, sim.score); try { localStorage.setItem('nailong-best-v1', String(best)); } catch { /* Optional persistence. */ }
  sound.play('end');
  showModal(`<div class="eyebrow">${survived ? 'MISSION COMPLETE / 成功下班' : 'MILK OVER / 奶龙已下线'}</div><h2 id="modal-title">${survived ? '班味清零，快乐起飞。' : '可恶，被抓去上班了。'}</h2><div class="result-number">${sim.score.toLocaleString()}</div><div class="result-meta"><span>喝了 ${sim.cups} 杯奶茶</span><span>创飞 ${sim.bonks} 份班味</span><span>最高 ${sim.maxCombo} 连击</span></div><div class="result-badge">✳ 本局认证：${rank}</div><p>${sim.score > previous ? '新纪录！建议把这一刻写进简历。' : `历史最佳 ${best.toLocaleString()} · 再来一局，快乐翻倍。`}</p><div class="modal-actions"><button id="restart" class="primary-button">再疯一把 ↗</button><button id="result-home" class="secondary-button">换只奶龙</button></div>`, () => { $('restart').onclick = start; $('result-home').onclick = home; });
}
function ultimate() { if (!sim.ultimate() && sim.phase === 'playing') toast(`再喝几口奶茶！发疯能量 ${Math.floor(sim.energy)}%`); }
function processEvents() {
  for (const e of sim.events) {
    view.event(e); if (e.type !== 'end') sound.play(e.type);
    if (e.type === 'collect' || e.type === 'bonk') floatScore(e);
    if (e.type === 'collect' && sim.cups % 5 === 0) danmaku(chat[Math.floor(Math.random() * chat.length)]);
    if (e.type === 'bonk' && sim.combo >= 5 && memeClock <= 0) { meme(sim.combo >= 10 ? '奶龙不讲武德！' : '这班味，创飞！'); memeClock = 5; }
    if (e.type === 'hit') {
      haptic(35);
      if (!view.reducedMotion) { $('hit-flash').animate([{ opacity: .38 }, { opacity: 0 }], { duration: 380 }); }
      $('game-caption').textContent = ['痛！这就是社会的毒打？', '谁在给本龙增加班味？', '奶龙：问题不大，继续发疯。'][Math.floor(Math.random() * 3)];
    }
    if (e.type === 'dash') haptic(10);
    if (e.type === 'ultimate') { haptic(60); meme('奶 龙 觉 醒 ！'); $('game-caption').textContent = '不是我疯了，是这个世界需要奶龙。'; danmaku('前方高能：奶龙进入无敌模式'); }
    if (e.type === 'end') result();
  }
  sim.events = [];
}

$('start').onclick = start; $('help').onclick = help; $('pause').onclick = pause; $('ultimate').onclick = ultimate;
$('settings').onclick = settings;
document.querySelector<HTMLAnchorElement>('.brand')!.onclick = e => { e.preventDefault(); if (loaded) home(); };
$('sound').onclick = () => { $('sound').dataset.touched = '1'; sound.setEnabled(!sound.enabled); soundButton(); toast(sound.enabled ? '声波已接通，奶龙开始蹦迪。' : '静音摸鱼，懂的都懂。'); };
soundButton();
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-char]')) button.onclick = async () => {
  if (!loaded) return;
  button.classList.add('transmitting'); button.setAttribute('aria-busy', 'true');
  try { const key = button.dataset.char!; if (!await view.select(key)) return; selected = key;
  document.querySelectorAll('.character').forEach(b => { const active = (b as HTMLButtonElement).dataset.char === selected; b.classList.toggle('selected', active); b.setAttribute('aria-pressed', String(active)); });
  $('mood-label').textContent = CHARACTERS.find(c => c.key === selected)!.mood; sound.play('collect');
  } catch { toast('传送稍有延迟，请再点一次这只奶龙。'); }
  finally { button.classList.remove('transmitting'); button.removeAttribute('aria-busy'); }
};
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (modalOpen && sim.phase === 'paused') { if (modalReturn === 'playing') resume(); else resume(); }
    else if (modalOpen && sim.phase === 'intro') hideModal(); else pause(); return;
  }
  if (modalOpen) return; keys.add(e.code);
  if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') sim.dash(input());
  if (e.code === 'KeyQ') ultimate(); if (e.code === 'KeyJ') sim.attack();
  if (e.code === 'Enter' && sim.phase === 'intro') start();
});
window.addEventListener('keyup', e => keys.delete(e.code));
$('world').addEventListener('pointerdown', e => { if (sim.phase !== 'playing' || modalOpen || e.pointerType === 'touch') return; if (e.button === 2) sim.dash(input()); else sim.attack(); });
$('world').addEventListener('contextmenu', e => e.preventDefault());
$('touch-dash').addEventListener('pointerdown', e => { e.preventDefault(); sim.dash(input()); });
$('touch-bonk').addEventListener('pointerdown', e => { e.preventDefault(); $('touch-bonk').setPointerCapture(e.pointerId); attackHeld = true; sim.attack(); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('touch-bonk').addEventListener(type, () => attackHeld = false);
let joyId: number | null = null;
function moveStick(e: PointerEvent) { const r = $('joystick').getBoundingClientRect(), dx = e.clientX - (r.x + r.width / 2), dy = e.clientY - (r.y + r.height / 2); const radius = r.width * .32; const n = Math.max(1, Math.hypot(dx, dy) / radius); const deadzone = Math.hypot(dx, dy) < 5; joystick.x = deadzone ? 0 : dx / n / radius; joystick.z = deadzone ? 0 : dy / n / radius; $('stick').style.transform = `translate(${dx / n}px,${dy / n}px)`; }
$('joystick').addEventListener('pointerdown', e => { e.preventDefault(); if (joyId !== null) return; joyId = e.pointerId; $('joystick').setPointerCapture(e.pointerId); moveStick(e); });
$('joystick').addEventListener('pointermove', e => { if (e.pointerId === joyId) moveStick(e); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('joystick').addEventListener(type, event => { if ((event as PointerEvent).pointerId !== joyId) return; joyId = null; joystick.x = joystick.z = 0; $('stick').style.transform = ''; });
window.addEventListener('blur', () => { clearInput(); if (sim.phase === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && sim.phase === 'playing') pause(); last = performance.now(); });

function tick(now: number) {
  requestAnimationFrame(tick); const rawDt = (now - last) / 1000; const dt = Math.min(rawDt, .1); last = now;
  if (document.hidden) { fixedTime = 0; return; }
  const i = modalOpen ? { x: 0, z: 0 } : input();
  if (sim.phase === 'playing') {
    fixedTime += dt; let steps = 0;
    while (fixedTime >= FIXED_STEP && steps++ < 6) { if (attackHeld) sim.attack(); sim.step(FIXED_STEP, i); fixedTime -= FIXED_STEP; }
  } else fixedTime = 0;
  processEvents();
  if (sim.phase === 'playing') {
    hudClock -= dt; if (hudClock <= 0) { updateHud(); hudClock = 1 / 12; } memeClock -= dt; captionClock -= dt;
    if (captionClock <= 0) { captionClock = 7; $('game-caption').textContent = captions[Math.floor(Math.random() * captions.length)]; if (Math.random() < .55) danmaku(chat[Math.floor(Math.random() * chat.length)]); }
  }
  sound.update(dt, sim.phase === 'playing'); view.update(dt, sim, Math.abs(i.x) + Math.abs(i.z) > .05);
  if (rawDt > .036 && rawDt < .3 && sim.phase === 'playing') lowFrames += dt; else lowFrames = Math.max(0, lowFrames - dt * .35);
  if (lowFrames > 3 && !autoQuality && qualityMode === 'auto') { autoQuality = true; view.setQuality(false); toast('已自动调轻特效，让奶龙跑得更丝滑。'); }
}
async function boot() {
  try {
    view = new GameRenderer($<HTMLCanvasElement>('world'));
    document.body.classList.toggle('touch-device', view.touchDevice);
    const motion = matchMedia('(prefers-reduced-motion: reduce)'); motion.addEventListener('change', () => { view.reducedMotion = motion.matches; });
    $('world').addEventListener('webglcontextlost', e => { e.preventDefault(); if (sim.phase === 'playing') pause(); toast('舞台走神了，正在重新连接…'); });
    $('world').addEventListener('webglcontextrestored', () => { toast('舞台回来了，继续发疯！'); });
    await view.load((n, total) => { $('loading-progress').style.width = `${n / total * 100}%`; $('loading-note').textContent = '震惊奶龙已就位，全息连接完成。'; });
    loaded = true; $<HTMLButtonElement>('start').disabled = false; $('start-label').textContent = '开 始 发 疯'; $('loading').classList.add('done'); setTimeout(() => $('loading').hidden = true, 600);
    document.querySelector('.character.selected')?.setAttribute('aria-pressed', 'true');
    last = performance.now(); requestAnimationFrame(tick);
    if (new URLSearchParams(location.search).has('debug')) {
      Object.assign(window, { __GAME__: { sim, view, start, home, pause, resume, ultimate, diagnostics: () => ({ phase: sim.phase, score: sim.score, hp: sim.hp, time: sim.time, x: sim.x, z: sim.z, entities: sim.entities.length, ...view.diagnostics() }) } });
    }
  } catch (e) {
    console.error(e); $('loading').hidden = true;
    showModal('<div class="eyebrow">奶龙遇到了一点小问题</div><h2 id="modal-title">舞台还没准备好。</h2><p>请通过「启动游戏」打开，或刷新页面重试。若仍无法进入，请确认浏览器已开启图形加速。</p><div class="modal-actions"><button id="reload" class="primary-button">再试一次 ↗</button></div>', () => { $('reload').onclick = () => location.reload(); });
  }
}
void boot();
