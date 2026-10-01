import type { Aim, PunchType } from './types';

export const BASE_DAMAGE: Record<PunchType, number> = { jab: 3.2, cross: 7.2, hook: 8.8, uppercut: 9.6 };
export const STAMINA_COST: Record<PunchType, number> = { jab: 3, cross: 7, hook: 8, uppercut: 8 };
export const STUN_FACTOR: Record<PunchType, number> = { jab: 0.8, cross: 1.3, hook: 1.6, uppercut: 1.7 };

export type OppAttack = 'jab' | 'cross' | 'hook' | 'uppercut' | 'body';
export const OPP_DAMAGE: Record<OppAttack, number> = { jab: 4, cross: 9, hook: 11, uppercut: 12, body: 8 };
export const OPP_STAMINA: Record<OppAttack, number> = { jab: 3, cross: 7, hook: 8, uppercut: 8, body: 7 };
export const OPP_LABEL: Record<OppAttack, string> = { jab: 'JAB!', cross: 'STRAIGHT!', hook: 'HOOK!', uppercut: 'UPPERCUT!', body: 'BODY SHOT!' };
/** the right answer to each attack, shown in the in-game hint */
export const OPP_ANSWER: Record<OppAttack, string> = { jab: 'block or slip', cross: 'slip', hook: 'duck or block', uppercut: 'lean back or block', body: 'lean back or block' };

export const COUNTER_MULT = 1.6;
export const GUARD_CHIP = 0.15;       // head shot into a high guard
export const GUARD_BODY = 0.5;        // body shot into a guard (arms don't cover the ribs fully)

export function comboMultiplier(combo: number, sameAsLast: boolean) {
  const m = 1 + 0.06 * Math.min(combo, 6);
  return sameAsLast ? m * 0.85 : m;
}

export function playerDamage(type: PunchType, power: number, powerFactor: number, combo: number, sameAsLast: boolean, counter: boolean) {
  return BASE_DAMAGE[type] * (0.4 + 0.9 * power) * powerFactor * comboMultiplier(combo, sameAsLast) * (counter ? COUNTER_MULT : 1);
}

/** does the player's defensive state stop this attack? returns damage multiplier and whether it was fully dodged */
export function resolveDefense(atk: OppAttack, d: { guard: boolean; evade: string | null }): { mult: number; dodged: boolean; blocked: boolean } {
  const e = d.evade;
  const dodgedBy: Record<OppAttack, string[]> = {
    jab: ['slipL', 'slipR'], cross: ['slipL', 'slipR'], hook: ['duck'], uppercut: ['lean'], body: ['lean'],
  };
  if (e && dodgedBy[atk].includes(e)) return { mult: 0, dodged: true, blocked: false };
  if (d.guard) return { mult: atk === 'body' ? GUARD_BODY : GUARD_CHIP, dodged: false, blocked: true };
  return { mult: 1, dodged: false, blocked: false };
}

export function isBody(aim: Aim) { return aim === 'body'; }
