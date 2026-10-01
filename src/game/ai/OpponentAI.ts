import type { OppAttack } from '../combat';
import { OPP_STAMINA } from '../combat';
import type { Fighter } from '../Fighter';
import type { Profile, PunchType } from '../types';

export type AIState = 'guard' | 'windup' | 'strike' | 'recover' | 'stagger' | 'stunned' | 'down';
export type Rng = () => number;

const WINDUP_FACTOR: Record<OppAttack, number> = { jab: 0.75, cross: 1, hook: 1.1, uppercut: 1.15, body: 1 };
const WEIGHTS: [OppAttack, number][] = [['jab', 35], ['cross', 25], ['hook', 20], ['uppercut', 8], ['body', 12]];
export const IMPACT_AT = 0.1; // seconds into the strike when the punch lands
const STRIKE_DUR = 0.2;

export class OpponentAI {
  state: AIState = 'guard';
  t = 0;
  attack: OppAttack | null = null;
  side: -1 | 1 = 1;
  windupDur = 0;
  feint = false;
  impacted = false;
  evading: 'slip' | null = null;
  evadeT = 0;
  nextAction = 1.2;
  private lastAttack: OppAttack | null = null;
  private recent: PunchType[] = [];
  private stunnedFor = 0;

  constructor(private p: Profile, private rng: Rng) {}

  private set(s: AIState) { this.state = s; this.t = 0; }

  /** True while the opponent is exposed to counters */
  get vulnerable() {
    return this.state === 'windup' || this.state === 'strike' || this.state === 'recover' || this.state === 'stunned';
  }

  reset() {
    this.set('guard');
    this.attack = null;
    this.nextAction = 1 + this.rng();
    this.recent = [];
    this.evading = null;
  }

  private pickAttack(): OppAttack {
    const pool = WEIGHTS.filter(([a]) => a !== this.lastAttack || this.rng() < 0.35);
    const total = pool.reduce((s, [, w]) => s + w, 0);
    let r = this.rng() * total;
    for (const [a, w] of pool) { if ((r -= w) <= 0) return a; }
    return 'jab';
  }

  startAttack(atk: OppAttack, speedUp = 1) {
    this.attack = atk;
    this.lastAttack = atk;
    this.side = this.rng() < 0.5 ? -1 : 1;
    this.feint = this.rng() < 0.12 * this.p.aggression && atk !== 'jab';
    this.windupDur = Math.max(0.28, this.p.windup * WINDUP_FACTOR[atk] * (0.85 + 0.3 * this.rng()) * speedUp);
    this.impacted = false;
    this.set('windup');
  }

  /** returns an attack when it lands this tick */
  update(dt: number, self: Fighter, active: boolean): OppAttack | null {
    this.t += dt;
    if (this.evading) { this.evadeT -= dt; if (this.evadeT <= 0) this.evading = null; }
    if (!active) return null;
    switch (this.state) {
      case 'guard': {
        this.nextAction -= dt;
        if (this.nextAction <= 0) {
          const tired = self.staminaFactor < 0.25;
          const go = this.rng() < (tired ? this.p.aggression * 0.4 : 0.5 + 0.5 * this.p.aggression);
          if (go) this.startAttack(this.pickAttack(), tired ? 1.25 : 1);
          else this.nextAction = 0.4 + this.rng() * 0.6;
        }
        break;
      }
      case 'windup':
        if (this.t >= this.windupDur) {
          if (this.feint) { this.attack = null; this.feint = false; this.set('recover'); this.t = -0.1; break; }
          self.spend(OPP_STAMINA[this.attack!]);
          this.set('strike');
        }
        break;
      case 'strike':
        if (!this.impacted && this.t >= IMPACT_AT) { this.impacted = true; return this.attack; }
        if (this.t >= STRIKE_DUR) this.set('recover');
        break;
      case 'recover':
        if (this.t >= 0.45 / this.p.speed) {
          const combo = this.attack && this.rng() < this.p.aggression * 0.45;
          this.set('guard');
          this.nextAction = combo ? 0.05 : (0.7 + this.rng() * 1.3) * (1.3 - this.p.aggression * 0.6);
          this.attack = null;
        }
        break;
      case 'stagger':
        if (this.t >= 0.28) { this.set('guard'); this.nextAction = 0.5 + this.rng() * 0.6; }
        break;
      case 'stunned':
        if (this.t >= this.stunnedFor) { self.stun = 40; this.set('guard'); this.nextAction = 0.8; }
        break;
      case 'down': break;
    }
    return null;
  }

  /** Called when a player punch is thrown. Returns how the opponent reacts before damage is computed. */
  defend(type: PunchType, body: boolean): 'block' | 'slip' | null {
    this.recent.push(type);
    if (this.recent.length > 5) this.recent.shift();
    if (this.state !== 'guard') return null; // can't defend mid-attack, staggered, stunned or down
    const repeats = this.recent.filter((x) => x === type).length;
    const habit = repeats >= 3 ? 0.25 : 0; // reads predictable players
    let block = this.p.blockChance + habit;
    let slip = this.p.slipChance + habit * 0.5;
    if (body) { block *= 0.5; slip = 0; }
    if (type === 'hook' || type === 'uppercut') slip *= 0.4;
    const r = this.rng();
    if (r < block) return 'block';
    if (r < block + slip) { this.evading = 'slip'; this.evadeT = 0.3; return 'slip'; }
    return null;
  }

  hit(dmg: number) {
    if (this.state === 'stunned' || this.state === 'down' || this.state === 'strike') return;
    if (this.state === 'windup' && dmg < 6) return; // light taps don't stop a punch being thrown
    this.set('stagger');
    this.attack = null;
  }

  stun(dur: number) { this.stunnedFor = dur; this.set('stunned'); this.attack = null; }
  down() { this.set('down'); this.attack = null; }
  getUp() { this.set('guard'); this.nextAction = 1.2; this.recent = []; }
}
