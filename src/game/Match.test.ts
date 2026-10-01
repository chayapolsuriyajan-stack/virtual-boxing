import { describe, expect, it } from 'vitest';
import { Match } from './Match';
import { PROFILES } from './profiles';
import { resolveDefense, playerDamage } from './combat';
import type { DefenseState, PunchEvent } from './types';

const idle: DefenseState = { guard: false, evade: null };
const settings = { rounds: 3, roundSec: 90, restSec: 30 };
const punch = (type: PunchEvent['type'] = 'cross', power = 1, aim: PunchEvent['aim'] = 'head'): PunchEvent => ({ kind: 'punch', hand: 'R', type, power, aim, lane: 0 });
// rng that never triggers opponent defense and never feints
const noDefense = () => 0.99;

function startFight(profile = PROFILES[0], rng = noDefense) {
  const m = new Match(profile, settings, rng);
  for (let i = 0; i < 200 && m.phase !== 'fight'; i++) m.update(0.02, [], idle);
  return m;
}

describe('combat maths', () => {
  it('counters hit harder, tired fighters hit softer', () => {
    const base = playerDamage('cross', 1, 1, 0, false, false);
    expect(playerDamage('cross', 1, 1, 0, false, true)).toBeCloseTo(base * 1.6);
    expect(playerDamage('cross', 1, 0.45, 0, false, false)).toBeLessThan(base);
  });
  it('maps attacks to their correct answers', () => {
    expect(resolveDefense('jab', { guard: false, evade: 'slipL' }).dodged).toBe(true);
    expect(resolveDefense('hook', { guard: false, evade: 'slipL' }).dodged).toBe(false);
    expect(resolveDefense('hook', { guard: false, evade: 'duck' }).dodged).toBe(true);
    expect(resolveDefense('uppercut', { guard: false, evade: 'lean' }).dodged).toBe(true);
    expect(resolveDefense('hook', { guard: true, evade: null }).mult).toBeLessThan(0.2);
  });
});

describe('match flow', () => {
  it('starts the bell after the countdown', () => {
    const m = startFight();
    expect(m.phase).toBe('fight');
  });
  it('lands damage and builds stun on head shots', () => {
    const m = startFight();
    m.ai.reset();
    const hp = m.opp.health;
    m.update(0.016, [punch('hook')], idle);
    expect(m.opp.health).toBeLessThan(hp);
    expect(m.opp.stun).toBeGreaterThan(0);
  });
  it('body shots shrink the opponent stamina cap', () => {
    const m = startFight();
    const cap = m.opp.staminaCap;
    m.update(0.016, [punch('hook', 1, 'body')], idle);
    expect(m.opp.staminaCap).toBeLessThan(cap);
  });
  it('a barrage knocks the opponent down and the count runs to a KO or a get-up', () => {
    const m = startFight(PROFILES[0]);
    for (let i = 0; i < 40 && m.phase === 'fight'; i++) {
      m.ai.reset(); // keep opponent passive so every punch lands
      m.update(0.016, [punch('hook')], idle);
    }
    expect(['kdOpp', 'over']).toContain(m.phase);
    for (let i = 0; i < 1200 && m.phase === 'kdOpp'; i++) m.update(0.016, [], idle);
    expect(m.phase).not.toBe('kdOpp');
  });
  it('decides a fight on points after the last round', () => {
    const m = startFight();
    const events: string[] = [];
    for (let i = 0; i < 90 * 60 * 3 + 5000 && m.phase !== 'over'; i++) {
      // player guards constantly and the AI rarely wins by stoppage with slow profile
      m.update(1 / 60, [], { guard: true, evade: null });
      if (m.phase === 'rest') m.skipRest();
      for (const e of m.drainEvents()) events.push(e.t);
    }
    expect(m.phase).toBe('over');
    expect(m.result).not.toBeNull();
  });
  it('the opponent telegraphs before it lands a punch', () => {
    const m = startFight(PROFILES[1], () => 0.3);
    const seen: string[] = [];
    for (let i = 0; i < 60 * 20; i++) {
      m.update(1 / 60, [], idle);
      for (const e of m.drainEvents()) seen.push(e.t);
      if (seen.includes('playerHit') || seen.includes('dodge')) break;
    }
    expect(seen.indexOf('tell')).toBeGreaterThanOrEqual(0);
    expect(seen.indexOf('tell')).toBeLessThan(seen.findIndex((x) => x === 'playerHit' || x === 'dodge'));
  });
  it('slipping a jab dodges it and opens a counter window', () => {
    const m = startFight(PROFILES[1], () => 0.3);
    let dodged = false;
    for (let i = 0; i < 60 * 30 && !dodged; i++) {
      const tell = m.pendingTell;
      const evade = tell === 'jab' || tell === 'cross' ? 'slipL' : tell === 'hook' ? 'duck' : tell ? 'lean' : null;
      m.update(1 / 60, [], { guard: false, evade });
      dodged = m.drainEvents().some((e) => e.t === 'dodge');
    }
    expect(dodged).toBe(true);
    expect(m.counterT).toBeGreaterThan(0);
  });
});
