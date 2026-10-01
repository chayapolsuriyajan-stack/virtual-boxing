import { GUARD_CHIP, OPP_DAMAGE, STAMINA_COST, STUN_FACTOR, playerDamage, resolveDefense } from './combat';
import type { OppAttack } from './combat';
import { Fighter } from './Fighter';
import { OpponentAI } from './ai/OpponentAI';
import type { Rng } from './ai/OpponentAI';
import { PLAYER_PROFILE } from './profiles';
import type { DefenseState, InputEvent, Profile, PunchEvent, PunchType } from './types';

export type Phase = 'ready' | 'fight' | 'kdOpp' | 'kdPlayer' | 'rest' | 'over';

export type GameEvent =
  | { t: 'bell'; start: boolean }
  | { t: 'tell'; atk: OppAttack }
  | { t: 'thrown'; ev: PunchEvent }
  | { t: 'oppHit'; dmg: number; ev: PunchEvent; counter: boolean }
  | { t: 'oppBlock'; ev: PunchEvent }
  | { t: 'oppSlip'; ev: PunchEvent }
  | { t: 'playerHit'; atk: OppAttack; dmg: number; blocked: boolean }
  | { t: 'dodge'; atk: OppAttack }
  | { t: 'knockdown'; who: 'player' | 'opp' }
  | { t: 'count'; n: number }
  | { t: 'getUp'; who: 'player' | 'opp' }
  | { t: 'stunned' }
  | { t: 'roundEnd'; round: number }
  | { t: 'matchEnd'; result: MatchResult };

export interface MatchResult {
  winner: 'player' | 'opp' | 'draw';
  method: 'KO' | 'TKO' | 'DEC';
  cards: [number, number][];
  round: number;
}
export interface Settings { rounds: number; roundSec: number; restSec: number }

const COUNTER_WINDOW = 0.8;
const EVADE_STAMINA_DRAIN = 4; // per second while slipping/ducking/leaning

export class Match {
  player: Fighter;
  opp: Fighter;
  ai: OpponentAI;
  phase: Phase = 'ready';
  round = 1;
  clock = 0; // time left in the round (or rest/ready countdown)
  events: GameEvent[] = [];
  combo = 0;
  maxCombo = 0;
  comboT = 0;
  lastType: PunchType | null = null;
  counterT = 0; // player's counter window after a successful dodge
  count = 0; // referee count
  countT = 0;
  riseAt = 0; // opponent gets up at this second of the count
  recovery = 0; // player's get-up meter
  recoveryNeed = 100;
  lastHand: 'L' | 'R' | null = null;
  pts = { p: 0, o: 0 }; // landed score this round
  cards: [number, number][][] = [[], [], []]; // per judge, per round
  result: MatchResult | null = null;
  stats = { thrown: 0, landed: 0, blocked: 0, dodged: 0, hitsTaken: 0 };
  pendingTell: OppAttack | null = null;
  private lastCount = 0;
  private roundKd = { p: 0, o: 0 };

  constructor(public profile: Profile, public settings: Settings, private rng: Rng = Math.random) {
    this.player = new Fighter(PLAYER_PROFILE.health, PLAYER_PROFILE.stamina);
    this.opp = new Fighter(profile.health, profile.stamina, profile.chin);
    this.ai = new OpponentAI(profile, rng);
    this.startReady(3);
  }

  private emit(e: GameEvent) { this.events.push(e); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  private startReady(sec: number) { this.phase = 'ready'; this.clock = sec; this.ai.reset(); }

  private startRound() {
    this.phase = 'fight';
    this.clock = this.settings.roundSec;
    this.pts = { p: 0, o: 0 };
    this.roundKd = { p: 0, o: 0 };
    this.emit({ t: 'bell', start: true });
  }

  update(dt: number, inputs: InputEvent[], def: DefenseState) {
    switch (this.phase) {
      case 'ready':
        this.clock -= dt;
        this.regenBoth(dt, false);
        if (this.clock <= 0) this.startRound();
        break;
      case 'fight': this.fight(dt, inputs, def); break;
      case 'kdOpp': this.kdOpp(dt); break;
      case 'kdPlayer': this.kdPlayer(dt, inputs, def); break;
      case 'rest':
        this.clock -= dt;
        if (this.clock <= 0) { this.round++; this.startReady(3); }
        break;
      case 'over': break;
    }
  }

  skipRest() { if (this.phase === 'rest') this.clock = 0; }

  private regenBoth(dt: number, guard: boolean) {
    this.player.regen(dt, guard ? 14 : 9);
    this.opp.regen(dt, 8 * this.profile.speed);
  }

  private fight(dt: number, inputs: InputEvent[], def: DefenseState) {
    this.clock -= dt;
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    this.counterT -= dt;
    this.regenBoth(dt, def.guard);
    if (def.evade) this.player.spend(EVADE_STAMINA_DRAIN * dt);

    const prevState = this.ai.state;
    const landed = this.ai.update(dt, this.opp, true);
    if (prevState !== 'windup' && this.ai.state === 'windup' && this.ai.attack) {
      this.pendingTell = this.ai.attack;
      this.emit({ t: 'tell', atk: this.ai.attack });
    }
    if (landed) this.opponentImpact(landed, def);

    for (const ev of inputs) this.playerPunch(ev);

    if (this.phase === 'fight' && this.clock <= 0) this.endRound();
  }

  // --- player offense -------------------------------------------------------
  private playerPunch(ev: PunchEvent) {
    if (this.phase !== 'fight') return;
    this.stats.thrown++;
    this.emit({ t: 'thrown', ev });
    const power = this.player.stamina <= 1 ? ev.power * 0.5 : ev.power;
    this.player.spend(STAMINA_COST[ev.type] * (0.6 + 0.8 * ev.power));
    const body = ev.aim === 'body';
    const reaction = this.ai.defend(ev.type, body);
    if (reaction === 'block') {
      this.stats.blocked++;
      this.opp.hurt(playerDamage(ev.type, power, this.player.powerFactor, 0, false, false) * (body ? 0.4 : GUARD_CHIP));
      this.combo = 0;
      this.emit({ t: 'oppBlock', ev });
      return;
    }
    if (reaction === 'slip') {
      this.combo = 0;
      this.emit({ t: 'oppSlip', ev });
      // a slipped punch invites a quick counter
      if (this.rng() < 0.6) this.ai.startAttack(this.rng() < 0.5 ? 'jab' : 'cross', 0.5);
      return;
    }
    const counter = this.ai.vulnerable || this.counterT > 0;
    const same = this.lastType === ev.type;
    this.combo++;
    this.comboT = 1.3;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    let dmg = playerDamage(ev.type, power, this.player.powerFactor, this.combo, same, counter);
    const wasStunned = this.ai.state === 'stunned';
    if (wasStunned) dmg *= 1.4;
    this.lastType = ev.type;
    this.stats.landed++;
    if (body) {
      dmg *= 0.8;
      this.opp.sapCap(dmg * 0.35);
      this.opp.spend(dmg * 0.8);
    } else {
      this.opp.addStun(dmg * STUN_FACTOR[ev.type] * 1.1);
    }
    this.opp.hurt(dmg);
    this.pts.p += dmg + 1 + (counter ? 2 : 0);
    this.emit({ t: 'oppHit', dmg, ev, counter });
    this.ai.hit(dmg);

    if (this.opp.health <= 0 || (wasStunned && dmg >= 6 && !body)) return this.knockdownOpp();
    if (!body && this.opp.stun >= 100 && this.ai.state !== 'stunned') {
      this.ai.stun(2.5);
      this.emit({ t: 'stunned' });
    }
  }

  // --- opponent offense -----------------------------------------------------
  private opponentImpact(atk: OppAttack, def: DefenseState) {
    this.pendingTell = null;
    const r = resolveDefense(atk, def);
    if (r.dodged) {
      this.stats.dodged++;
      this.counterT = COUNTER_WINDOW;
      this.emit({ t: 'dodge', atk });
      return;
    }
    const dmg = OPP_DAMAGE[atk] * this.profile.power * (0.8 + 0.4 * this.opp.powerFactor) * r.mult;
    this.player.hurt(dmg);
    this.stats.hitsTaken++;
    if (!r.blocked) {
      this.player.addStun(dmg * 2);
      if (atk === 'body') this.player.sapCap(dmg * 0.25);
    }
    this.pts.o += r.blocked ? 0.5 : dmg + 1;
    this.combo = 0;
    this.emit({ t: 'playerHit', atk, dmg, blocked: r.blocked });
    if (this.player.health <= 0 || (!r.blocked && this.player.stun >= 100 && dmg >= 8)) this.knockdownPlayer();
  }

  // --- knockdowns -----------------------------------------------------------
  private knockdownOpp() {
    this.opp.knockdowns++;
    this.opp.totalKnockdowns++;
    this.roundKd.o++;
    this.pts.p += 12;
    this.ai.down();
    this.emit({ t: 'knockdown', who: 'opp' });
    this.opp.stun = 0;
    if (this.roundKd.o >= 3) return this.finish('player', 'TKO');
    const frac = Math.max(0, this.opp.health) / this.opp.maxHealth;
    this.riseAt = 3.5 + this.opp.knockdowns * 1.8 + this.rng() * 2 - frac * 2 + (this.opp.health <= 0 ? 1.5 : 0);
    this.opp.health = Math.max(this.opp.health, this.opp.maxHealth * 0.22);
    this.phase = 'kdOpp';
    this.count = 0; this.countT = 0; this.lastCount = 0;
  }

  private tickCount(dt: number) {
    this.countT += dt;
    this.count = Math.floor(this.countT);
    if (this.count > this.lastCount) { this.lastCount = this.count; this.emit({ t: 'count', n: this.count }); }
  }

  private kdOpp(dt: number) {
    this.tickCount(dt);
    if (this.countT >= 10) return this.finish('player', 'KO');
    if (this.countT >= this.riseAt) {
      this.ai.getUp();
      this.opp.stun = 30;
      this.emit({ t: 'getUp', who: 'opp' });
      this.phase = 'fight';
    }
  }

  private knockdownPlayer() {
    this.player.knockdowns++;
    this.player.totalKnockdowns++;
    this.roundKd.p++;
    this.pts.o += 12;
    this.emit({ t: 'knockdown', who: 'player' });
    this.player.stun = 0;
    if (this.roundKd.p >= 3) return this.finish('opp', 'TKO');
    this.ai.reset();
    this.player.health = Math.max(this.player.health, 1);
    this.phase = 'kdPlayer';
    this.count = 0; this.countT = 0; this.lastCount = 0;
    this.recovery = 0;
    this.recoveryNeed = 100 + 30 * this.player.knockdowns;
    this.lastHand = null;
  }

  private kdPlayer(dt: number, inputs: InputEvent[], def: DefenseState) {
    if (def.guard) this.recovery += 9 * dt;
    for (const ev of inputs) {
      this.recovery += this.lastHand && this.lastHand !== ev.hand ? 22 : 10;
      this.lastHand = ev.hand;
    }
    this.tickCount(dt);
    if (this.recovery >= this.recoveryNeed) {
      this.player.health = Math.max(this.player.health, this.player.maxHealth * 0.3);
      this.player.stamina = Math.max(this.player.stamina, this.player.maxStamina * 0.4);
      this.emit({ t: 'getUp', who: 'player' });
      this.phase = 'fight';
      this.ai.reset();
      return;
    }
    if (this.countT >= 10) this.finish('opp', 'KO');
  }

  // --- rounds & decision ----------------------------------------------------
  private endRound() {
    this.emit({ t: 'bell', start: false });
    this.emit({ t: 'roundEnd', round: this.round });
    for (let j = 0; j < 3; j++) this.cards[j].push(this.judgeRound());
    if (this.round >= this.settings.rounds) return this.decide();
    this.player.roundReset(0.3);
    this.opp.roundReset(0.3);
    this.ai.reset();
    this.phase = 'rest';
    this.clock = this.settings.restSec;
  }

  /** 10-point-must: [player, opponent] */
  private judgeRound(): [number, number] {
    const noise = () => 0.9 + this.rng() * 0.2;
    const p = this.pts.p * noise();
    const o = this.pts.o * noise();
    let a = 10, b = 10;
    if (p > o * 1.05) b = p > o * 2 && p > 30 ? 8 : 9;
    else if (o > p * 1.05) a = o > p * 2 && o > 30 ? 8 : 9;
    a -= this.roundKd.p;
    b -= this.roundKd.o;
    return [a, b];
  }

  private decide() {
    const totals: [number, number][] = this.cards.map((c) => [c.reduce((s, r) => s + r[0], 0), c.reduce((s, r) => s + r[1], 0)]);
    let pw = 0, ow = 0;
    for (const [a, b] of totals) { if (a > b) pw++; else if (b > a) ow++; }
    this.finish(pw > ow ? 'player' : ow > pw ? 'opp' : 'draw', 'DEC', totals);
  }

  private finish(winner: 'player' | 'opp' | 'draw', method: 'KO' | 'TKO' | 'DEC', totals?: [number, number][]) {
    this.phase = 'over';
    this.result = { winner, method, cards: totals ?? [], round: this.round };
    this.emit({ t: 'matchEnd', result: this.result });
  }
}
