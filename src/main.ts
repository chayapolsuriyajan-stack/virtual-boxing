import * as THREE from 'three';
import { Sfx } from './audio/Audio';
import { Match } from './game/Match';
import type { GameEvent, Settings } from './game/Match';
import { PROFILES } from './game/profiles';
import type { InputSource } from './game/types';
import { KeyboardInput } from './input/KeyboardInput';
import { PoseInput } from './input/PoseInput';
import { Effects } from './render/Effects';
import { PlayerGloves } from './render/Gloves';
import { OpponentModel } from './render/OpponentModel';
import { Arena } from './render/Scene';
import { Hud } from './ui/Hud';
import * as ui from './ui/Menus';

const STEP = 1 / 60;
const arena = new Arena(document.getElementById('game') as HTMLCanvasElement);
const sfx = new Sfx();
const hud = new Hud();
const fx = new Effects(arena.camera, arena.scene);
const gloves = new PlayerGloves(arena.camera);
const pip = document.getElementById('pip') as HTMLElement;

const settings: Settings = { rounds: 3, roundSec: 90, restSec: 30 };
let input: InputSource | null = null;
let pose: PoseInput | null = null;
let match: Match | null = null;
let model: OpponentModel | null = null;
let oppIndex = 0;
let mode: 'title' | 'select' | 'calibrate' | 'fight' | 'result' = 'title';
let debug = false;
let paused = false;
let acc = 0;
let last = performance.now();
let endTimer = 0;

hud.show(false);
pip.style.display = 'none';

// ---------------------------------------------------------------- flow
async function keepAwake() {
  try { if (!document.fullscreenElement && matchMedia('(pointer: coarse)').matches) await document.documentElement.requestFullscreen?.(); } catch { /* not allowed (iOS) */ }
  try { await (navigator as any).wakeLock?.request('screen'); } catch { /* unsupported */ }
}

function toTitle() {
  mode = 'title';
  hud.show(false);
  ui.titleScreen(async (m) => {
    sfx.init();
    void keepAwake();
    if (m === 'keyboard') { input = new KeyboardInput(); pip.style.display = 'none'; return toSelect(); }
    ui.loadingScreen('STARTING CAMERA...');
    try {
      pose = new PoseInput();
      await pose.start();
      input = pose;
      pip.style.display = 'block';
      toSelect();
    } catch (e) {
      pose = null;
      ui.errorScreen(e instanceof Error ? e.message : String(e), () => { input = new KeyboardInput(); toSelect(); }, toTitle);
    }
  });
}

function toSelect() {
  mode = 'select';
  hud.show(false);
  ui.selectScreen(settings.roundSec, (i) => { oppIndex = i; pose ? toCalibrate() : startMatch(); },
    () => { settings.roundSec = settings.roundSec === 90 ? 120 : settings.roundSec === 120 ? 60 : 90; toSelect(); }, toTitle);
}

function toCalibrate() {
  if (!pose) return startMatch();
  mode = 'calibrate';
  pose.stance = undefined;
  pose.beginCalibration();
  ui.calibrationScreen(() => { pose!.stance = (pose!.stance ?? 'L') === 'L' ? 'R' : 'L'; pose!.beginCalibration(); });
}

function tickCalibration() {
  if (!pose) return;
  const s = pose.status;
  const msg = s === 'ok' ? 'Hold still...' : s === 'too-close' ? 'Step back a little' : s === 'too-far' ? 'Step closer' : s === 'error' ? pose.error : 'Looking for you...';
  const stance = pose.stance ? (pose.stance === 'L' ? 'orthodox (left lead)' : 'southpaw (right lead)') : 'auto-detect';
  ui.updateCalibration(msg, pose.calibrationProgress, stance);
  if (pose.calibrationProgress >= 1 && pose.finishCalibration()) startMatch();
}

function startMatch() {
  if (model) { arena.scene.remove(model.group); }
  const profile = PROFILES[oppIndex];
  match = new Match(profile, { ...settings });
  model = new OpponentModel(profile);
  model.add(arena.scene);
  fx.setFall(false);
  ui.closeMenu();
  hud.show(true);
  hud.setHint(pose ? 'Fists up. Watch the red wind-up, then slip, duck, lean or block.' : 'J/K punch · H/L hooks · U/I uppercuts · Space guard · A/D slip · S duck · W lean');
  mode = 'fight';
  paused = false;
  endTimer = 0;
  acc = 0;
}

function finishMatch() {
  if (!match?.result) return;
  mode = 'result';
  const r = match.result;
  if (r.winner === 'player') ui.progress.unlock(oppIndex + 1);
  ui.resultScreen(r, match.profile.name, match.stats, match.maxCombo, oppIndex + 1 < PROFILES.length,
    () => { oppIndex++; pose ? toCalibrate() : startMatch(); }, () => { startMatch(); }, toSelect);
}

// ------------------------------------------------------------- events
function handle(e: GameEvent) {
  if (!match || !model) return;
  switch (e.t) {
    case 'bell': sfx.bell(e.start ? 1 : 3); if (e.start) hud.message('FIGHT!', 1.1); else hud.message('TIME!', 1.5); break;
    case 'tell': sfx.tell(); break;
    case 'thrown': gloves.throwPunch(e.ev.hand); sfx.swish(e.ev.power); break;
    case 'oppHit': {
      model.onHit(e.ev.power, e.ev.type, e.ev.lane);
      fx.burst(model.headWorld(), e.ev.power);
      fx.landed(e.ev.power);
      sfx.hit(e.ev.power, e.ev.aim === 'head');
      arena.crowdEnergy = Math.min(1, arena.crowdEnergy + e.dmg / 14);
      if (e.counter) hud.sub('COUNTER!', 0.7);
      break;
    }
    case 'oppBlock': model.onBlock(); sfx.block(); break;
    case 'oppSlip': model.onSlip(); sfx.whoosh(); break;
    case 'playerHit': {
      if (e.blocked) { sfx.block(); fx.playerHit(e.dmg * 3, 0); break; }
      const dir = e.atk === 'hook' ? (Math.random() < 0.5 ? -1 : 1) : (Math.random() - 0.5);
      fx.playerHit(e.dmg, dir, e.atk === 'uppercut' ? 1 : 0);
      sfx.playerHit(e.dmg);
      break;
    }
    case 'dodge': sfx.dodge(); hud.sub('NICE DODGE! Counter now!', 0.9); break;
    case 'knockdown':
      sfx.knockdown();
      hud.message('KNOCKDOWN!', 1.5);
      if (e.who === 'player') fx.setFall(true);
      arena.crowdEnergy = 1;
      break;
    case 'count': sfx.beep(); break;
    case 'getUp': fx.setFall(false); hud.message(e.who === 'player' ? 'BACK ON YOUR FEET!' : 'FIGHT ON!', 1); break;
    case 'stunned': hud.sub("HE'S HURT! GO GO GO!", 1.2); sfx.crowd(0.6); break;
    case 'matchEnd':
      endTimer = 2.5;
      hud.message(e.result.method === 'DEC' ? 'DECISION' : e.result.method + '!', 3);
      arena.crowdEnergy = 1;
      break;
  }
}

// --------------------------------------------------------------- loop
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;

  if (mode === 'calibrate') tickCalibration();

  if (mode === 'fight' && match && model && input) {
    const trackingBad = pose && (pose.status === 'lost' || pose.status === 'too-close' || pose.status === 'too-far') && match.phase !== 'over';
    const wasPaused = paused;
    paused = !!trackingBad || userPaused;
    if (paused !== wasPaused) {
      if (paused) hud.sub(userPaused ? 'PAUSED (Esc to resume)' : pose?.status === 'too-close' ? 'Step back!' : pose?.status === 'too-far' ? 'Step closer!' : 'Tracking lost: get back in frame', 999);
      else hud.sub('', 0);
    }
    const def = input.defense();
    if (fx.hitStop > 0) fx.hitStop -= dt;
    else if (!paused) {
      acc += dt;
      while (acc >= STEP) {
        acc -= STEP;
        match.update(STEP, input.drain(), input.defense());
        for (const e of match.drainEvents()) handle(e);
      }
    } else input.drain();

    model.update(dt, match.ai);
    gloves.update(dt, input.gloves(), def.guard);
    fx.update(dt, match.phase === 'fight' || match.phase === 'ready' ? def.evade : null, match.player.health / match.player.maxHealth, match.phase === 'kdPlayer');
    hud.update(match, dt, def);
    if (debug) hud.debug(true, debugText(def));
    if (endTimer > 0 && (endTimer -= dt) <= 0) finishMatch();
  } else if (model && match) {
    // idle animation behind menus
    model.update(dt, match.ai);
    fx.update(dt, null, 1, false);
  } else {
    fx.update(dt, null, 1, false);
  }
  arena.update(dt);
  arena.render();
}

function debugText(def: { guard: boolean; evade: string | null }) {
  if (!match) return '';
  const p = pose;
  return [
    `mode ${p ? 'camera' : 'keyboard'}  fps ${p?.fps ?? '-'}  tracking ${p?.status ?? '-'}`,
    `last punch: ${p?.lastEvent ?? '-'}`,
    `guard ${def.guard}  evade ${def.evade ?? '-'}`,
    `ai ${match.ai.state}  counter ${match.counterT.toFixed(1)}  opp stun ${match.opp.stun.toFixed(0)}`,
    `stamina ${match.player.stamina.toFixed(0)}/${match.player.staminaCap.toFixed(0)}`,
  ].join('\n');
}

let userPaused = false;
addEventListener('keydown', (e) => {
  if (e.key === 'd' && e.shiftKey && e.ctrlKey) { debug = !debug; hud.debug(debug); }
  if (e.key === 'F2') { debug = !debug; hud.debug(debug); }
  if (e.key === 'Escape' && mode === 'fight') { userPaused = !userPaused; }
  if (e.key === ' ' && mode === 'fight') { e.preventDefault(); match?.skipRest(); }
});

(window as any).__vb = { frame, arena, fx, get match() { return match; }, startKeyboard: () => { input = new KeyboardInput(); oppIndex = 0; startMatch(); } };

toTitle();
requestAnimationFrame(frame);
