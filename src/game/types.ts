export type Hand = 'L' | 'R';
export type PunchType = 'jab' | 'cross' | 'hook' | 'uppercut';
export type Aim = 'head' | 'body';
export type Lane = -1 | 0 | 1;
export type Evade = 'slipL' | 'slipR' | 'duck' | 'lean';

export interface PunchEvent { kind: 'punch'; hand: Hand; type: PunchType; power: number; aim: Aim; lane: Lane }
export interface DefenseState { guard: boolean; evade: Evade | null }
export type InputEvent = PunchEvent;

/** What the sim reads each tick from whichever input device is active. */
export interface InputSource {
  drain(): InputEvent[];
  defense(): DefenseState;
  /** normalized screen-space glove positions (0..1), null when unknown */
  gloves(): { L: [number, number, number]; R: [number, number, number] } | null;
}

export type Profile = {
  name: string; blurb: string;
  health: number; stamina: number;
  aggression: number;      // 0..1 how often it attacks
  windup: number;          // ms telegraph
  blockChance: number; slipChance: number;
  power: number;           // damage multiplier
  chin: number;            // stun tolerance multiplier
  speed: number;           // recovery speed multiplier
  color: number;
};
