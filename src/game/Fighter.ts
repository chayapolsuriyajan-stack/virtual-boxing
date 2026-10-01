export class Fighter {
  health: number;
  stamina: number;
  staminaCap: number;
  stun = 0;
  knockdowns = 0; // this round
  totalKnockdowns = 0;
  constructor(public maxHealth: number, public maxStamina: number, public chin = 1) {
    this.health = maxHealth;
    this.stamina = maxStamina;
    this.staminaCap = maxStamina;
  }
  get staminaFactor() { return Math.max(0, Math.min(1, this.stamina / this.maxStamina)); }
  /** punches get weaker as the tank empties, but never below 45% */
  get powerFactor() { return 0.45 + 0.55 * this.staminaFactor; }
  spend(n: number) { this.stamina = Math.max(0, this.stamina - n); }
  regen(dt: number, rate: number) {
    const slow = 0.5 + 0.5 * this.staminaFactor; // exhausted fighters recover slower
    this.stamina = Math.min(this.staminaCap, this.stamina + rate * slow * dt);
    this.stun = Math.max(0, this.stun - 6 * dt);
  }
  hurt(n: number) { this.health = Math.max(0, this.health - n); }
  /** body shots permanently sap the gas tank for the rest of the fight */
  sapCap(n: number) { this.staminaCap = Math.max(this.maxStamina * 0.4, this.staminaCap - n); this.stamina = Math.min(this.stamina, this.staminaCap); }
  addStun(n: number) { this.stun = Math.min(100, this.stun + n / this.chin); }
  roundReset(healthBack: number) {
    this.health = Math.min(this.maxHealth, this.health + this.maxHealth * healthBack);
    this.stamina = this.staminaCap;
    this.stun = 0;
    this.knockdowns = 0;
  }
}
