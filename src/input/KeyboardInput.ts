import type { DefenseState, Evade, InputEvent, InputSource, PunchEvent } from '../game/types';

/** Dev / no-camera fallback. J jab, K cross, H/L hooks, U/I uppercuts, hold Shift for body.
 *  Space guard, A/D slip, S duck, W lean back. */
export class KeyboardInput implements InputSource {
  private q: InputEvent[] = [];
  private held = new Set<string>();
  private anim = { L: 0, R: 0 };

  constructor() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.held.add(k);
      const body = e.shiftKey;
      const p = (hand: 'L' | 'R', type: PunchEvent['type']) => {
        this.q.push({ kind: 'punch', hand, type, power: 0.7 + Math.random() * 0.25, aim: body ? 'body' : 'head', lane: 0 });
        this.anim[hand] = 1;
      };
      if (k === 'j') p('L', 'jab');
      else if (k === 'k') p('R', 'cross');
      else if (k === 'h') p('L', 'hook');
      else if (k === 'l') p('R', 'hook');
      else if (k === 'u') p('L', 'uppercut');
      else if (k === 'i') p('R', 'uppercut');
    });
    addEventListener('keyup', (e) => this.held.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.held.clear());
  }

  drain() { const q = this.q; this.q = []; return q; }

  defense(): DefenseState {
    const h = this.held;
    let evade: Evade | null = null;
    if (h.has('a')) evade = 'slipL';
    else if (h.has('d')) evade = 'slipR';
    else if (h.has('s')) evade = 'duck';
    else if (h.has('w')) evade = 'lean';
    return { guard: h.has(' '), evade };
  }

  gloves() {
    this.anim.L = Math.max(0, this.anim.L - 0.08);
    this.anim.R = Math.max(0, this.anim.R - 0.08);
    const g = this.held.has(' ');
    const mk = (x: number, a: number): [number, number, number] => [x, g ? 0.4 : 0.62 - a * 0.1, a];
    return { L: mk(0.4, this.anim.L), R: mk(0.6, this.anim.R) };
  }
}
