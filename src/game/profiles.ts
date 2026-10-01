import type { Profile } from './types';

export const PROFILES: Profile[] = [
  { name: 'Rookie Rico', blurb: 'Slow and wild. Learn to block and slip.', health: 70, stamina: 80, aggression: 0.35, windup: 0.9, blockChance: 0.15, slipChance: 0.05, power: 0.7, chin: 0.8, speed: 0.8, color: 0x4a90d9 },
  { name: 'Brawler Bruno', blurb: 'Heavy hooks. Duck under them and counter.', health: 100, stamina: 90, aggression: 0.55, windup: 0.75, blockChance: 0.3, slipChance: 0.1, power: 1.0, chin: 1.1, speed: 0.9, color: 0xd9822b },
  { name: 'Slick Sasha', blurb: 'Fast hands and good defense. Be patient.', health: 100, stamina: 110, aggression: 0.6, windup: 0.6, blockChance: 0.4, slipChance: 0.3, power: 0.9, chin: 1.0, speed: 1.15, color: 0x8e44ad },
  { name: 'The Champ', blurb: 'Reads your habits. Mix it up or get stopped.', health: 130, stamina: 130, aggression: 0.7, windup: 0.5, blockChance: 0.5, slipChance: 0.35, power: 1.2, chin: 1.3, speed: 1.2, color: 0xc0392b },
];

export const PLAYER_PROFILE = { health: 100, stamina: 100 };
