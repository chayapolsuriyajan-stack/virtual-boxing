import { OPP_ANSWER, OPP_LABEL } from '../game/combat';
import type { Match } from '../game/Match';
import type { DefenseState } from '../game/types';

const $ = <T extends HTMLElement>(root: HTMLElement, sel: string) => root.querySelector(sel) as T;

export class Hud {
  private root = document.getElementById('hud') as HTMLElement;
  private msgT = 0;
  private subT = 0;
  private el: Record<string, HTMLElement>;

  constructor() {
    this.root.innerHTML = `
      <div class="bars">
        <div class="fb"><div class="name">YOU</div>
          <div class="bar"><i id="ph"></i></div><div class="bar small stam"><i id="ps"></i></div></div>
        <div class="fb right"><div class="name" id="oname"></div>
          <div class="bar"><i id="oh"></i></div><div class="bar small stam"><i id="os"></i></div><div class="bar small stun"><i id="ost"></i></div></div>
      </div>
      <div class="clock"><div class="t" id="clk">1:30</div><div class="r" id="rnd"></div></div>
      <div class="combo" id="combo"></div>
      <div class="tell" id="tell"></div>
      <div class="center-msg" id="msg"></div>
      <div class="sub-msg" id="sub"></div>
      <div class="hint" id="hint"></div>
      <pre id="dbg" style="position:absolute;left:8px;bottom:8px;margin:0;font:12px monospace;color:#9f9;text-shadow:0 1px 2px #000;display:none"></pre>`;
    const ids = ['ph', 'ps', 'oh', 'os', 'ost', 'oname', 'clk', 'rnd', 'combo', 'tell', 'msg', 'sub', 'hint', 'dbg'];
    this.el = Object.fromEntries(ids.map((i) => [i, $(this.root, '#' + i)]));
  }

  show(v: boolean) { this.root.style.display = v ? '' : 'none'; }
  setHint(s: string) { this.el.hint.textContent = s; }
  message(s: string, sec = 1.2) { this.el.msg.textContent = s; this.msgT = sec; }
  sub(s: string, sec = 1.2) { this.el.sub.textContent = s; this.subT = sec; }
  debug(on: boolean, text = '') { this.el.dbg.style.display = on ? 'block' : 'none'; this.el.dbg.textContent = text; }

  update(m: Match, dt: number, def: DefenseState) {
    const e = this.el;
    const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
    e.ph.style.width = pct(m.player.health, m.player.maxHealth);
    e.ph.style.background = m.player.health < m.player.maxHealth * 0.3 ? '#e74c3c' : '#2ecc40';
    e.ps.style.width = pct(m.player.stamina, m.player.maxStamina);
    e.oh.style.width = pct(m.opp.health, m.opp.maxHealth);
    e.os.style.width = pct(m.opp.stamina, m.opp.maxStamina);
    e.ost.style.width = pct(m.opp.stun, 100);
    e.oname.textContent = m.profile.name.toUpperCase();
    const c = Math.max(0, Math.ceil(m.clock));
    e.clk.textContent = m.phase === 'fight' || m.phase === 'rest' || m.phase === 'kdOpp' || m.phase === 'kdPlayer'
      ? `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}` : '';
    e.rnd.textContent = m.phase === 'rest' ? 'REST' : `ROUND ${m.round} / ${m.settings.rounds}`;
    e.combo.textContent = m.combo >= 2 ? `${m.combo} HIT COMBO` : '';

    // opponent telegraph
    if (m.phase === 'fight' && m.pendingTell) {
      e.tell.textContent = OPP_LABEL[m.pendingTell];
      e.sub.textContent = OPP_ANSWER[m.pendingTell].toUpperCase();
      this.subT = 0.1;
    } else {
      e.tell.textContent = '';
    }

    // centre messages
    if (this.msgT > 0) this.msgT -= dt; else if (!this.persistent(m)) e.msg.textContent = '';
    if (this.subT > 0) this.subT -= dt; else if (!m.pendingTell) e.sub.textContent = '';
    this.persistentText(m, def);
  }

  private persistent(m: Match) { return m.phase === 'kdOpp' || m.phase === 'kdPlayer' || m.phase === 'ready' || m.phase === 'rest'; }

  private persistentText(m: Match, def: DefenseState) {
    const e = this.el;
    if (m.phase === 'kdOpp') { e.msg.textContent = m.count > 0 ? String(m.count) : 'KNOCKDOWN!'; e.sub.textContent = 'Stand back and wait...'; this.subT = 0.1; }
    else if (m.phase === 'kdPlayer') {
      e.msg.textContent = m.count > 0 ? String(m.count) : 'YOU ARE DOWN!';
      const p = Math.round(Math.min(1, m.recovery / m.recoveryNeed) * 100);
      e.sub.textContent = `Guard up and throw alternating punches to get up: ${p}%`;
      this.subT = 0.1;
    } else if (m.phase === 'ready') { e.msg.textContent = `ROUND ${m.round}`; e.sub.textContent = m.round === 1 ? 'Get into your stance' : ''; this.subT = 0.1; this.msgT = 0.1; }
    else if (m.phase === 'rest') { e.msg.textContent = `ROUND ${m.round} COMPLETE`; e.sub.textContent = 'Rest... press Space to skip'; this.subT = 0.1; this.msgT = 0.1; }
    void def;
  }
}
