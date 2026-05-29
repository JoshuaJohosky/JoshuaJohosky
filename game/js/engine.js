/* =====================================================================
 * Game Engine — state + rules for RISK: Minecraft Global Domination.
 * Pure logic; the UI layer reads state and calls these methods.
 * ===================================================================== */

const PHASES = { PLACE: 'place', ATTACK: 'attack', FORTIFY: 'fortify' };
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];
const STARTING_ARMIES = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 };
const NEUTRAL = 'neutral';

class Game {
  constructor(opts) {
    this.victoryMode = opts.victoryMode || 'lore';   // classic | domination | lore
    this.variant = opts.variant || 'strategic';      // strategic | fast | chaos
    this.roundLimit = opts.roundLimit || 100;        // safety net: resolve by tiebreaker if reached
    this.log = [];
    this.onLog = opts.onLog || (() => {});
    this.rng = opts.rng || Math.random;

    // Players
    this.players = opts.players.map((p, i) => ({
      idx: i, name: p.name, color: PLAYER_COLORS[i], isAI: !!p.isAI,
      eliminated: false, tokens: new Set(), cards: [],
      reserve: 0, unlockedFirst: new Set(), // continents this player has already drawn a card for
    }));

    // Ownership
    this.owner = {};   // territoryId -> playerIdx | 'neutral'
    this.armies = {};  // territoryId -> count
    Object.keys(TERRITORIES).forEach(id => { this.owner[id] = null; this.armies[id] = 0; });

    // Reset module-global visual lock flags for a fresh game.
    CONTINENTS.end.locked = false;
    CONTINENT_ORDER.slice(1).forEach(c => { CONTINENTS[c].locked = true; });

    this.current = 0;
    this.round = 0;
    this.phase = PHASES.PLACE;
    this.turnState = this._freshTurnState();
    this.winner = null;
    this.moonCapturedBy = null;   // idx that captured the Moon Summit (lore final round)
    this.moonHeldSince = null;    // round at which summit was captured -> hold to next turn
  }

  _freshTurnState() {
    return {
      specialUsed: false,
      fortified: false,
      extraFortify: 0,
      freezeUsedOn: {},   // territoryId -> true (Freezing Anomaly defense, once/turn)
      capturedThisTurn: false,
      cardEarned: false,
      gravityOn: null,    // territoryId where Gravity Shift card active
      coolerCharges: 0,   // safe-placement charges from Cooler card
      flyoverAvail: false,
      grayMoveUsed: false,
    };
  }

  _log(msg, cls = '') {
    const entry = { round: this.round, player: this.current, msg, cls };
    this.log.push(entry);
    this.onLog(entry);
  }

  player(idx = this.current) { return this.players[idx]; }
  alivePlayers() { return this.players.filter(p => !p.eliminated); }

  // ---------------- SETUP ----------------
  setup(draftAssignments) {
    // draftAssignments: { territoryId: playerIdx } for End territories chosen.
    const endIds = Object.values(TERRITORIES).filter(t => t.continent === 'end').map(t => t.id);
    const n = this.players.length;
    const startArmies = STARTING_ARMIES[n];

    // Apply draft; unassigned End territories become neutral.
    endIds.forEach(id => {
      if (draftAssignments[id] != null) {
        this.owner[id] = draftAssignments[id];
        this.armies[id] = 1;
      } else {
        this.owner[id] = NEUTRAL;
        this.armies[id] = TERRITORIES[id].structure ? 4 : 2; // objectives defend harder
      }
    });

    // Chaos variant: also open Nether at the draft (give everyone Enderite).
    if (this.variant === 'chaos') {
      this.players.forEach(p => p.tokens.add('enderite'));
      CONTINENTS.nether.locked = false;
      this._log('Chaos setup: the Nether is open from the start — everyone holds Enderite.', 'sys');
    }

    // Distribute remaining starting armies evenly onto owned territories.
    this.players.forEach((p, idx) => {
      const owned = endIds.filter(id => this.owner[id] === idx);
      let remaining = startArmies - owned.length; // 1 already placed each
      let i = 0;
      while (remaining > 0 && owned.length) {
        this.armies[owned[i % owned.length]]++;
        remaining--; i++;
      }
    });

    this.round = 1;
    this.current = 0;
    this.phase = PHASES.PLACE;
    this.turnState = this._freshTurnState();
    this.player().reserve = this.calcReinforcements(0);
    this._log(`Setup complete. ${this.players[0].name} begins in the End. Victory: ${this.victoryMode.toUpperCase()}.`, 'sys');
  }

  // ---------------- REINFORCEMENTS ----------------
  ownedTerritories(idx) {
    return Object.keys(this.owner).filter(id => this.owner[id] === idx);
  }

  holdsContinent(idx, contId) {
    return Object.values(TERRITORIES)
      .filter(t => t.continent === contId)
      .every(t => this.owner[t.id] === idx);
  }

  heldContinents(idx) {
    return CONTINENT_ORDER.filter(c => this.holdsContinent(idx, c));
  }

  calcReinforcements(idx) {
    const owned = this.ownedTerritories(idx);
    let armies = Math.max(3, Math.floor(owned.length / 3));
    const detail = [`base ${Math.max(3, Math.floor(owned.length / 3))} (${owned.length} territories)`];
    // Continent bonuses
    CONTINENT_ORDER.forEach(c => {
      if (this.holdsContinent(idx, c)) {
        armies += CONTINENTS[c].bonus;
        detail.push(`+${CONTINENTS[c].bonus} ${CONTINENTS[c].name}`);
      }
    });
    // Flat per-territory bonuses (Temple, Plum Forest). Village = +1 once if held.
    let villageApplied = false;
    owned.forEach(id => {
      const t = TERRITORIES[id];
      if (t.structure === 'village') {
        if (!villageApplied) { armies += 1; detail.push('+1 Village'); villageApplied = true; }
      } else if (t.bonusReinforce) {
        armies += t.bonusReinforce; detail.push(`+${t.bonusReinforce} ${t.name}`);
      }
    });
    this._lastReinforceDetail = detail;
    return armies;
  }

  // ---------------- PLACEMENT ----------------
  placeArmy(id, count = 1) {
    if (this.phase !== PHASES.PLACE) return false;
    if (this.owner[id] !== this.current) return false;
    const p = this.player();
    count = Math.min(count, p.reserve);
    if (count <= 0) return false;
    this.armies[id] += count;
    p.reserve -= count;
    return true;
  }

  finishPlacement() {
    if (this.player().reserve > 0) return false;
    this.phase = PHASES.ATTACK;
    return true;
  }

  // ---------------- ADJACENCY / MOVEMENT GATING ----------------
  edgeBetween(from, to) {
    return ADJ[from].find(e => e.to === to) || null;
  }

  canTraverse(idx, from, to) {
    const e = this.edgeBetween(from, to);
    if (!e) return false;
    const p = this.players[idx];
    if (e.gateway && e.requires && !p.tokens.has(e.requires)) return false;
    if (e.gap && !p.tokens.has('aether')) return false; // gaps need Fly Over (Aether token)
    return true;
  }

  attackableFrom(from) {
    if (this.owner[from] !== this.current || this.armies[from] < 2) return [];
    return ADJ[from]
      .filter(e => this.canTraverse(this.current, from, e.to) && this.owner[e.to] !== this.current)
      .map(e => e.to);
  }

  // ---------------- COMBAT ----------------
  _roll(n) {
    const dice = [];
    for (let i = 0; i < n; i++) dice.push(1 + Math.floor(this.rng() * 6));
    return dice.sort((a, b) => b - a);
  }

  /* Resolve a single attack (one volley). Returns a detailed result. */
  attack(from, to) {
    if (this.phase !== PHASES.ATTACK) return null;
    if (this.owner[from] !== this.current || this.armies[from] < 2) return null;
    if (this.owner[to] === this.current) return null;
    if (!this.canTraverse(this.current, from, to)) return null;

    const fromT = TERRITORIES[from], toT = TERRITORIES[to];

    // Attacker dice: min(3, armies-1), +1 if Gravity Shift card active here.
    let maxA = Math.min(3, this.armies[from] - 1);
    if (this.turnState.gravityOn === from) maxA = Math.min(4, this.armies[from] - 1);
    let aDice = this._roll(maxA);

    // Defender dice: min(2, armies); Moon bonus +1 (+1 more if also holds crater).
    let maxD = Math.min(2, this.armies[to]);
    let moonNote = '';
    if (toT.structure === 'summit' || toT.structure === 'crater') {
      maxD += 1; moonNote = ' (Moon +1 die)';
      if (toT.structure === 'summit' && this.owner['moon_crater'] === this.owner[to]) {
        maxD += 1; moonNote = ' (Moon Summit +2: Crater held)';
      }
    }
    let dDice = this._roll(maxD);

    // Freezing Anomaly: defending, remove 1 attacking die once per turn.
    let freezeNote = '';
    if (toT.structure === 'cooler' && !this.turnState.freezeUsedOn[to] && aDice.length > 0) {
      aDice = aDice.slice(0, -1); // drop attacker's lowest
      this.turnState.freezeUsedOn[to] = true;
      freezeNote = ' Freezing Anomaly removes 1 attack die!';
    }

    // Mountains (Gravity Site): defending, reroll the lower defense die, keep new.
    let mtnNote = '';
    if (toT.structure === 'gravity' && dDice.length > 0) {
      const idxLow = dDice.length - 1;
      dDice[idxLow] = 1 + Math.floor(this.rng() * 6);
      dDice.sort((a, b) => b - a);
      mtnNote = ' Mountains reroll a defense die.';
    }

    // Compare
    let attackerLosses = 0, defenderLosses = 0;
    const comparisons = Math.min(aDice.length, dDice.length);
    for (let i = 0; i < comparisons; i++) {
      if (aDice[i] > dDice[i]) defenderLosses++;
      else attackerLosses++; // ties go to defender
    }
    this.armies[from] -= attackerLosses;
    this.armies[to] -= defenderLosses;

    const result = {
      from, to, aDice, dDice, attackerLosses, defenderLosses,
      captured: false, note: moonNote + freezeNote + mtnNote,
    };

    if (this.armies[to] <= 0) {
      result.captured = true;
      // minimum move-in = number of attacker dice rolled (rule of thumb), capped to available.
      const minMove = Math.max(1, Math.min(maxA, this.armies[from] - 1));
      result.minMove = minMove;
      result.maxMove = this.armies[from] - 1;
      result.endesertBonus = (fromT.structure === 'endesert' || from === 'endesert');
    }
    this._lastCombat = result;
    return result;
  }

  /* Complete a capture by moving armies into the conquered space. */
  resolveCapture(from, to, moveCount) {
    const fromT = TERRITORIES[to]; // captured territory
    const prevOwner = this.owner[to];
    const defenderWasPlayer = prevOwner !== NEUTRAL && prevOwner != null;
    let move = Math.max(1, Math.min(moveCount, this.armies[from] - 1));
    // Endesert: +1 extra army may move in.
    if ((TERRITORIES[from].structure === 'endesert' || from === 'endesert') && this.armies[from] - 1 > move) {
      move += 1;
    }
    this.armies[from] -= move;
    this.owner[to] = this.current;
    this.armies[to] = move;
    this.turnState.capturedThisTurn = true;

    this._log(`${this.player().name} captured ${TERRITORIES[to].name}.`, 'capture');
    this._onCapture(to, prevOwner, defenderWasPlayer);
    this._checkElimination(prevOwner);
    this._checkWin();
    return true;
  }

  /* Special-territory triggers on capture. */
  _onCapture(id, prevOwner, defenderWasPlayer) {
    const t = TERRITORIES[id];
    const p = this.player();
    switch (t.structure) {
      case 'sap':
        this.armies[id] += 1;
        this._log('Sap Tree Region: +1 bonus army placed. Hold it to your next turn for a Sap Core token.', 'reward');
        break;
      case 'temple':
        if (defenderWasPlayer) { this._earnCard('captured the End Temple'); }
        break;
      case 'skyruins':
        if (!p.unlockedFirst.has('skyruins')) {
          p.unlockedFirst.add('skyruins');
          this._earnCard('first reached the Sky Ruins');
        }
        // Controlling the Aether Gate grants Space Access.
        if (!p.tokens.has('space')) { this._grantToken('space', 'controlling the Sky Ruins (Aether Gate)'); }
        break;
      case 'redplanet':
        if (!p.unlockedFirst.has('redplanet')) {
          p.unlockedFirst.add('redplanet');
          this.armies[id] += 2;
          this._earnCard('first landed on the Red Planet');
          this._log('Red Planet: +2 bonus armies placed.', 'reward');
        }
        break;
      case 'cooler':
        if (!p.tokens.has('cooler')) this._grantToken('cooler', 'capturing the Freezing Anomaly (Cooler Site)');
        break;
      case 'gravity':
        if (!p.tokens.has('gravity')) this._grantToken('gravity', 'capturing the Mountains (Gravity Site)');
        break;
      case 'summit':
        this._log(`★ ${p.name} has captured the MOON SUMMIT! ★`, 'moon');
        this.moonCapturedBy = this.current;
        this.moonHeldSince = this.round;
        break;
    }
    // First time entering a brand-new continent draws a card.
    const cont = t.continent;
    if (cont !== 'end' && !p.unlockedFirst.has('cont_' + cont)) {
      p.unlockedFirst.add('cont_' + cont);
      this._earnCard(`first set foot in ${CONTINENTS[cont].name}`);
    }
  }

  _grantToken(tok, why) {
    const p = this.player();
    if (p.tokens.has(tok)) return;
    p.tokens.add(tok);
    this._log(`${p.name} gained the ${TOKENS[tok].name} token by ${why}.`, 'token');
    if (UNLOCK_REQUIREMENT.nether === tok || tok === 'enderite') {/* messaging handled below */}
    const unlocks = Object.keys(UNLOCK_REQUIREMENT).find(c => UNLOCK_REQUIREMENT[c] === tok);
    if (unlocks) {
      CONTINENTS[unlocks].locked = false;
      this._log(`🔓 ${CONTINENTS[unlocks].name} is now unlocked!`, 'unlock');
    }
  }

  _earnCard(why) {
    if (this.round === 1) return; // First Round Rule: no Reward Cards in round 1.
    const id = drawRandomCard(this.rng);
    this.player().cards.push(id);
    this.turnState.cardEarned = true;
    this._log(`${this.player().name} drew a Reward Card (${CARD_BY_ID[id].name}) for ${why}.`, 'reward');
  }

  // ---------------- UNLOCK-PATH ACTIONS ----------------
  /* Sap Core: granted at the start of a turn if you've held the Sap Tree
   * since your previous turn. Checked in beginTurn(). */
  _checkSapCore() {
    const p = this.player();
    if (this.owner['sap_tree'] === this.current && !p.tokens.has('sapcore')) {
      if (p._sapHeldSince != null && p._sapHeldSince < this.round) {
        this._grantToken('sapcore', 'holding the Sap Tree Region a full turn');
      }
    }
  }

  /* Activate the Summoning Structure (special action). */
  activateSummoning() {
    const p = this.player();
    if (this.turnState.specialUsed) return { ok: false, msg: 'You already used a special action this turn.' };
    if (this.owner['summoning'] !== this.current) return { ok: false, msg: 'You must control the Summoning Structure.' };
    if (!p.tokens.has('sapcore')) return { ok: false, msg: 'You need a Sap Core token first.' };
    if (p.tokens.has('enderite')) return { ok: false, msg: 'Enderite already obtained.' };
    this.turnState.specialUsed = true;
    this._grantToken('enderite', 'activating the Summoning Structure');
    this._earnCard('activating the Summoning Structure');
    return { ok: true, msg: 'The Summoning Structure roars to life — the Nether is open!' };
  }

  /* The Great Combine: with the Gravity token and a foothold reaching the
   * Aether gateway, combine to gain the Aether token (Fly Over + access). */
  greatCombine() {
    const p = this.player();
    if (this.turnState.specialUsed) return { ok: false, msg: 'Special action already used.' };
    if (p.tokens.has('aether')) return { ok: false, msg: 'You already performed the Great Combine.' };
    if (!p.tokens.has('gravity')) return { ok: false, msg: 'The Great Combine needs the Gravity token.' };
    if (!p.tokens.has('cooler')) return { ok: false, msg: 'You must have opened the Overworld (Cooler token) first.' };
    this.turnState.specialUsed = true;
    this._grantToken('aether', 'performing the Great Combine');
    this._earnCard('performing the Great Combine');
    return { ok: true, msg: 'The Great Combine succeeds — the Aether opens and you may Fly Over!' };
  }

  // ---------------- SPECIAL ACTIONS ----------------
  /* Purify: remove 1 enemy army from an End territory adjacent to one you
   * hold. Requires End Temple control or a Purification card (card handled
   * separately). Here = the Temple-based special action. */
  purify(targetId) {
    if (this.turnState.specialUsed) return { ok: false, msg: 'Special action already used.' };
    const holdsTemple = this.ownedTerritories(this.current).some(id => TERRITORIES[id].structure === 'temple');
    if (!holdsTemple) return { ok: false, msg: 'You must control the End Temple to Purify.' };
    const ok = this._doPurify(targetId);
    if (ok.ok) this.turnState.specialUsed = true;
    return ok;
  }

  _doPurify(targetId) {
    const t = TERRITORIES[targetId];
    if (!t || t.continent !== 'end') return { ok: false, msg: 'Purify targets End territories only.' };
    if (this.owner[targetId] === this.current || this.owner[targetId] == null) return { ok: false, msg: 'Target must be an enemy/neutral End territory.' };
    const adjMine = ADJ[targetId].some(e => this.owner[e.to] === this.current);
    if (!adjMine) return { ok: false, msg: 'Target must be adjacent to one of your End territories.' };
    if (this.armies[targetId] <= 1 && this.owner[targetId] !== NEUTRAL) {
      // would empty an enemy territory -> capture-by-attrition is not allowed; require >1 unless neutral
    }
    this.armies[targetId] = Math.max(0, this.armies[targetId] - 1);
    this._log(`${this.player().name} purified 1 army from ${t.name}.`, 'special');
    if (this.armies[targetId] === 0) {
      // territory emptied: it becomes neutral with 1 (cannot be auto-captured by purify per Balance Rule)
      this.armies[targetId] = 1; this.owner[targetId] = NEUTRAL;
      this._log(`${t.name} was abandoned and is now neutral.`, 'special');
    }
    return { ok: true, msg: `Purified ${t.name}.` };
  }

  // ---------------- CARD PLAY ----------------
  playCard(cardId, params = {}) {
    const p = this.player();
    const idx = p.cards.indexOf(cardId);
    if (idx === -1) return { ok: false, msg: 'You do not hold that card.' };
    const def = CARD_BY_ID[cardId];
    let res;
    switch (def.kind) {
      case 'army_boost':
        if (this.owner[params.territory] !== this.current) return { ok: false, msg: 'Choose a territory you control.' };
        this.armies[params.territory] += 3;
        res = { ok: true, msg: `Army Boost: +3 armies on ${TERRITORIES[params.territory].name}.` };
        break;
      case 'fortify':
        this.turnState.extraFortify += 1;
        res = { ok: true, msg: 'You may make one extra fortify move this turn.' };
        break;
      case 'purify':
        res = this._doPurify(params.territory);
        if (!res.ok) return res; // keep card if unplayable
        break;
      case 'cooler':
        this.turnState.coolerCharges += 1;
        res = { ok: true, msg: 'Cooler: place 2 armies on any territory you control (use the place tool).' };
        // grant 2 reserve usable this turn for a safe placement
        p.reserve += 2;
        if (this.phase !== PHASES.PLACE) this.phase = this.phase; // placement allowed via place tool anytime this turn
        break;
      case 'gravity':
        if (this.owner[params.territory] !== this.current) return { ok: false, msg: 'Choose one of your territories.' };
        this.turnState.gravityOn = params.territory;
        res = { ok: true, msg: `Gravity Shift active on ${TERRITORIES[params.territory].name}: +1 attack die this turn.` };
        break;
      case 'flyover':
        this.turnState.flyoverAvail = true;
        p.tokens.add('aether'); // enables gap traversal for the turn (kept as flavour)
        res = { ok: true, msg: 'Fly Over ready: you may cross one Aether gap.' };
        break;
      case 'moon_signal':
        p.reserve += 2;
        res = { ok: true, msg: 'Moon Signal: +2 reinforcements to place now.' };
        break;
      default:
        res = { ok: false, msg: 'Unknown card.' };
    }
    if (res.ok) {
      p.cards.splice(idx, 1);
      this._log(`${p.name} played ${def.name}.`, 'card');
    }
    return res;
  }

  // ---------------- FORTIFY ----------------
  /* BFS through territories owned by the player to test connectivity. */
  connected(from, to, idx) {
    if (from === to) return false;
    const seen = new Set([from]); const q = [from];
    while (q.length) {
      const cur = q.shift();
      for (const e of ADJ[cur]) {
        if (!this.canTraverse(idx, cur, e.to)) {
          // fortify may still pass gateways the player owns both sides of if token held
        }
        if (this.owner[e.to] === idx && !seen.has(e.to)) {
          if (e.gateway && e.requires && !this.players[idx].tokens.has(e.requires)) continue;
          if (e.gap && !this.players[idx].tokens.has('aether')) continue;
          if (e.to === to) return true;
          seen.add(e.to); q.push(e.to);
        }
      }
    }
    return false;
  }

  fortify(from, to, count) {
    if (this.phase !== PHASES.FORTIFY && this.phase !== PHASES.ATTACK) return { ok: false, msg: 'Not the fortify phase.' };
    if (this.turnState.fortified && this.turnState.extraFortify <= 0) return { ok: false, msg: 'You have already fortified this turn.' };
    if (this.owner[from] !== this.current || this.owner[to] !== this.current) return { ok: false, msg: 'Both territories must be yours.' };
    if (!this.connected(from, to, this.current)) return { ok: false, msg: 'No connected path through your territory.' };
    count = Math.min(count, this.armies[from] - 1); // never empty a territory
    if (count < 1) return { ok: false, msg: 'You must leave at least 1 army behind.' };
    this.armies[from] -= count;
    this.armies[to] += count;
    if (this.turnState.fortified) this.turnState.extraFortify -= 1;
    else this.turnState.fortified = true;
    this._log(`${this.player().name} fortified ${count} from ${TERRITORIES[from].name} to ${TERRITORIES[to].name}.`, 'fortify');
    return { ok: true };
  }

  // ---------------- TURN FLOW ----------------
  beginTurn() {
    const p = this.player();
    this.turnState = this._freshTurnState();
    this._checkSapCore();
    // record current sap holding for next-turn check
    if (this.owner['sap_tree'] === this.current) {
      if (p._sapHeldSince == null) p._sapHeldSince = this.round;
    } else { p._sapHeldSince = null; }

    p.reserve = this.calcReinforcements(this.current);
    this.phase = PHASES.PLACE;
    this._log(`— ${p.name}'s turn (Round ${this.round}) — gains ${p.reserve} armies [${this._lastReinforceDetail.join(', ')}].`, 'turn');
  }

  endTurn() {
    // Lore win check: captured Moon and survived to the start of own next turn.
    const prev = this.current;
    // advance to next alive player
    do {
      this.current = (this.current + 1) % this.players.length;
      if (this.current === 0) this.round++;
    } while (this.players[this.current].eliminated && this.alivePlayers().length > 1);

    // Lore: holder still holds Summit at the start of their own next turn.
    if (this.victoryMode === 'lore' && this.moonCapturedBy != null) {
      if (this.current === this.moonCapturedBy && this.owner['moon_summit'] === this.moonCapturedBy) {
        const holdsAll = CONTINENT_ORDER.every(c => this.holdsContinent(this.moonCapturedBy, c));
        if (holdsAll) { this._win(this.moonCapturedBy, 'held the Moon and the whole world stack'); return; }
      }
      if (this.owner['moon_summit'] !== this.moonCapturedBy) {
        this._log('The Moon Summit was lost — the lore clock resets.', 'moon');
        this.moonCapturedBy = null;
      }
    }
    // Safety net: if the game drags past the round limit, resolve by the
    // rulebook tiebreaker (Section 18) so it always reaches an ending.
    if (this.winner == null && this.round > this.roundLimit) { this._resolveByScore(); return; }
    if (this.winner == null) this.beginTurn();
  }

  /* Rulebook tiebreaker: Moon control, most continents, most territories,
   * then most armies. Exact ties co-win. */
  _resolveByScore() {
    const alive = this.alivePlayers();
    const score = p => [
      this.owner['moon_summit'] === p.idx ? 1 : 0,
      this.heldContinents(p.idx).length,
      this.ownedTerritories(p.idx).length,
      this.ownedTerritories(p.idx).reduce((s, id) => s + this.armies[id], 0),
    ];
    alive.sort((a, b) => {
      const sa = score(a), sb = score(b);
      for (let i = 0; i < sa.length; i++) if (sb[i] !== sa[i]) return sb[i] - sa[i];
      return 0;
    });
    const best = alive[0], bs = score(best);
    const cowinners = alive.filter(p => score(p).every((v, i) => v === bs[i]));
    if (cowinners.length > 1) {
      this._log(`Round limit reached — shared victory: ${cowinners.map(p => p.name).join(' & ')} (tiebreaker tie).`, 'win');
    } else {
      this._log(`Round limit reached — ${best.name} leads on the tiebreaker.`, 'sys');
    }
    this._win(best.idx, 'led on the rulebook tiebreaker at the round limit');
  }

  // ---------------- ELIMINATION / WIN ----------------
  _checkElimination(prevOwner) {
    if (prevOwner === NEUTRAL || prevOwner == null) return;
    const p = this.players[prevOwner];
    if (p.eliminated) return;
    if (this.ownedTerritories(prevOwner).length === 0) {
      p.eliminated = true;
      p.cards = [];                     // discard reward cards
      p.tokens = new Set();             // tokens leave the game
      this._log(`${p.name} has been eliminated!`, 'sys');
    }
  }

  _checkWin() {
    if (this.winner != null) return;
    if (this.victoryMode === 'classic') {
      const alive = this.alivePlayers();
      if (alive.length === 1) this._win(alive[0].idx, 'eliminated all rivals');
    } else if (this.victoryMode === 'domination') {
      this.players.forEach(p => {
        if (!p.eliminated && CONTINENT_ORDER.every(c => this.holdsContinent(p.idx, c)))
          this._win(p.idx, 'controlled every continent');
      });
    }
    // lore win is resolved at start of next turn (endTurn).
    // Also: classic-style last-man-standing always wins regardless of mode.
    const alive = this.alivePlayers();
    if (alive.length === 1 && this.winner == null) this._win(alive[0].idx, 'is the last explorer standing');
  }

  _win(idx, why) {
    if (this.winner != null) return;
    this.winner = idx;
    this._log(`🏆 ${this.players[idx].name} WINS — ${why}!`, 'win');
  }
}

if (typeof module !== 'undefined') {
  module.exports = { Game, PHASES, PLAYER_COLORS, STARTING_ARMIES, NEUTRAL };
}
