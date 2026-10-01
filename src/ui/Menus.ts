import { PROFILES } from '../game/profiles';
import type { MatchResult } from '../game/Match';

const menu = () => document.getElementById('menu') as HTMLElement;
const KEY = 'virtual-boxing-progress';

export const progress = {
  get(): number { try { return Math.min(PROFILES.length - 1, Number(localStorage.getItem(KEY) ?? 0) || 0); } catch { return 0; } },
  unlock(i: number) { try { localStorage.setItem(KEY, String(Math.max(this.get(), Math.min(PROFILES.length - 1, i)))); } catch { /* storage disabled */ } },
};

function open(html: string) { const m = menu(); m.innerHTML = `<div class="panel">${html}</div>`; m.classList.add('on'); return m; }
export function closeMenu() { menu().classList.remove('on'); }

const touch = matchMedia('(pointer: coarse)').matches;

export function titleScreen(onPick: (mode: 'camera' | 'keyboard') => void) {
  const m = open(`
    <h1>VIRTUAL BOXING</h1>
    <p>Step back until your head and both arms are in frame. Throw real punches at the camera.</p>
    <p><b>Jab / cross</b>: punch straight. <b>Hook</b>: swing wide with a bent arm. <b>Uppercut</b>: drive up from low.<br>
    <b>Slip</b>: lean your head left/right. <b>Duck</b>: drop down. <b>Lean back</b>: sway away. <b>Block</b>: hands up at your face.</p>
    <p>Watch for the opponent's wind-up and answer it, then counter.</p>
    <button id="btn-cam">PLAY WITH CAMERA</button>${touch ? '' : '<button id="kb" class="alt">KEYBOARD MODE</button>'}
    <p style="font-size:13px;opacity:.6">${touch ? 'Prop your phone landscape about 2 m away. ' : 'Keyboard: J jab, K cross, H/L hooks, U/I uppercuts, Shift = body, Space guard, A/D slip, S duck, W lean. '}Your video never leaves this device.</p>`);
  (m.querySelector('#btn-cam') as HTMLElement).onclick = () => onPick('camera');
  m.querySelector<HTMLElement>('#kb')?.addEventListener('click', () => onPick('keyboard'));
}

export function selectScreen(roundSec: number, onPick: (i: number) => void, onLength: () => void, onBack: () => void) {
  const open_ = progress.get();
  const cards = PROFILES.map((p, i) => `<div class="card ${i > open_ ? 'locked' : ''}" data-i="${i}"><b>${i + 1}. ${p.name}</b><br><span style="opacity:.8">${i > open_ ? 'Beat the previous boxer to unlock' : p.blurb}</span></div>`).join('');
  const m = open(`<h1 style="font-size:48px">CHOOSE YOUR FIGHT</h1><div class="cards">${cards}</div>
    <button id="len" class="alt">ROUND LENGTH: ${roundSec}s</button><button id="back" class="alt">BACK</button>`);
  m.querySelectorAll<HTMLElement>('.card').forEach((c) => { if (!c.classList.contains('locked')) c.onclick = () => onPick(Number(c.dataset.i)); });
  (m.querySelector('#len') as HTMLElement).onclick = onLength;
  (m.querySelector('#back') as HTMLElement).onclick = onBack;
}

export function loadingScreen(text: string) { open(`<h1 style="font-size:40px">${text}</h1><p>Allow camera access when asked.</p>`); }

export function errorScreen(msg: string, onKeyboard: () => void, onBack: () => void) {
  const m = open(`<h1 style="font-size:40px">CAMERA PROBLEM</h1><p>${msg}</p><button id="kb">PLAY WITH KEYBOARD</button><button id="back" class="alt">BACK</button>`);
  (m.querySelector('#kb') as HTMLElement).onclick = onKeyboard;
  (m.querySelector('#back') as HTMLElement).onclick = onBack;
}

export function calibrationScreen(onSwap: () => void) {
  const m = open(`<h1 style="font-size:48px">GET READY</h1>
    <p>Stand about 2 m back so your head, shoulders and both fists are visible.<br>Hold your <b>fighting stance</b> with fists up by your chin and stay still.</p>
    <p id="calstat" style="font-size:22px;color:#ffd23f">Looking for you...</p>
    <div class="bar" style="max-width:360px;margin:12px auto"><i id="calbar" style="width:0%"></i></div>
    <p>Stance: <b id="stance">auto-detect</b></p><button id="swap" class="alt">SWAP STANCE (lead hand)</button>`);
  (m.querySelector('#swap') as HTMLElement).onclick = onSwap;
  // let the webcam preview show through
  m.style.background = '#000a';
}
export function updateCalibration(status: string, progress01: number, stance: string) {
  const s = document.getElementById('calstat'), b = document.getElementById('calbar'), st = document.getElementById('stance');
  if (s) s.textContent = status;
  if (b) b.style.width = `${Math.round(progress01 * 100)}%`;
  if (st) st.textContent = stance;
}

export function resultScreen(r: MatchResult, opp: string, stats: { thrown: number; landed: number; blocked: number; dodged: number; hitsTaken: number }, maxCombo: number, hasNext: boolean, onNext: () => void, onRetry: () => void, onMenu: () => void) {
  const won = r.winner === 'player';
  const title = r.winner === 'draw' ? 'DRAW' : won ? 'YOU WIN!' : 'YOU LOSE';
  const how = r.method === 'DEC'
    ? `Decision: ${r.cards.map(([a, b]) => `${a}-${b}`).join(', ')}`
    : `${r.method} in round ${r.round}`;
  const acc = stats.thrown ? Math.round((stats.landed / stats.thrown) * 100) : 0;
  const m = open(`<h1 style="color:${won ? '#ffd23f' : '#ff3b3b'}">${title}</h1>
    <p style="font-size:22px">${how} vs ${opp}</p>
    <p>Punches thrown ${stats.thrown} &middot; landed ${stats.landed} (${acc}%) &middot; blocked ${stats.blocked}<br>
    Dodges ${stats.dodged} &middot; hits taken ${stats.hitsTaken} &middot; best combo ${maxCombo}</p>
    ${won && hasNext ? '<button id="next">NEXT FIGHT</button>' : ''}<button id="retry" class="alt">REMATCH</button><button id="menu" class="alt">MENU</button>`);
  (m.querySelector('#next') as HTMLElement | null)?.addEventListener('click', onNext);
  (m.querySelector('#retry') as HTMLElement).onclick = onRetry;
  (m.querySelector('#menu') as HTMLElement).onclick = onMenu;
}

export function pauseScreen(text: string) { open(`<h1 style="font-size:44px">PAUSED</h1><p style="font-size:20px">${text}</p>`); }
