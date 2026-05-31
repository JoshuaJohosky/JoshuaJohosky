/* =====================================================================
 * AI opponent — mode-aware, objective-driven strategy.
 *
 * Goals of this version:
 *  - Play the chosen VICTORY MODE, not just land-grab. In Lore/Domination
 *    the AI chases the unlock path (Sap Core -> Enderite -> Cooler -> Gravity
 *    -> Aether -> Space -> Moon) and completes continents; in Classic it
 *    focuses fire on the weakest rival.
 *  - Stop dumping every army to "cover the most ground": placement and
 *    attacks funnel toward the current objective, captures keep real stacks,
 *    and a per-turn capture budget prevents 1-army sprawl.
 *  - Protect key holdings (Sap Tree, Summoning Structure) so token progress
 *    actually completes.
 * ===================================================================== */

// Cache continent -> territory ids.
const _CONT_TILES = {};
function _contTiles(c) {
  if (!_CONT_TILES[c]) _CONT_TILES[c] = Object.values(TERRITORIES).filter(t => t.continent === c).map(t => t.id);
  return _CONT_TILES[c];
}

function aiTakeTurn(game) {
  const me = game.current;
  const mode = game.victoryMode;

  // 1) Free progression specials (no-ops unless eligible).
  game.activateSummoning();
  game.greatCombine();
  _aiPlayCards(game);

  // 2) Figure out what we're chasing this turn.
  const weakest = _weakestEnemy(game, me);

  // 3) Place reinforcements toward the objective + protect key holdings + shore up defence.
  _aiPlace(game, mode, weakest);
  game.finishPlacement();

  // 4) Attack toward the objective with overextension guards.
  _aiAttacks(game, mode, weakest);

  // 5) Temple purify if useful.
  _aiPurify(game);

  // 6) Fortify toward the active frontier (without abandoning key holdings).
  _aiFortify(game, mode, weakest);
}

/* ---- the unlock structures we still need, in order ---- */
function _nextUnlockTargets(game, me) {
  const t = game.players[me].tokens;
  const want = [];
  if (!t.has('sapcore')) want.push('sap_tree');
  if (t.has('sapcore') && !t.has('enderite')) want.push('summoning');
  if (t.has('enderite') && !t.has('cooler')) want.push('freezing_anomaly');
  if (t.has('cooler') && !t.has('gravity')) want.push('mountains');
  if (t.has('aether') && !t.has('space')) want.push('sky_ruins');
  if (t.has('space')) { want.push('moon_crater'); want.push('moon_summit'); }
  return want;
}

/* ---- how badly the AI wants a given target territory ---- */
function _valueOf(game, me, id, mode, weakest, wantList) {
  const t = TERRITORIES[id];
  let v = 1;

  // Next unlock structure(s): top priority, earlier ones worth more.
  const wi = wantList.indexOf(id);
  if (wi >= 0) v += 60 - wi * 6;

  if (t.structure) v += 5;
  if (t.structure === 'crater') v += 25;
  if (t.structure === 'summit') v += 40;

  // Continent completion: value finishing a continent we already partly hold.
  const tiles = _contTiles(t.continent);
  const mine = tiles.filter(x => game.owner[x] === me).length;
  if (mine > 0 && mine < tiles.length) v += 2 + 6 * (mine / tiles.length);

  // Classic: hunt the weakest rival's land.
  if (mode === 'classic') {
    const o = game.owner[id];
    if (o !== NEUTRAL && o != null && o !== me) { v += 6; if (o === weakest) v += 8; }
  } else {
    // Domination/Lore: enemy land that completes continents still matters,
    // but neutrals on the climb path are the main road forward.
    const o = game.owner[id];
    if (o !== NEUTRAL && o != null && o !== me) v += 2;
  }
  return v;
}

function _weakestEnemy(game, me) {
  let best = null, min = Infinity;
  game.players.forEach(p => {
    if (p.idx === me || p.eliminated) return;
    const n = game.ownedTerritories(p.idx).reduce((s, id) => s + game.armies[id], 0);
    if (n < min) { min = n; best = p.idx; }
  });
  return best;
}

function _borders(game, idx) {
  return game.ownedTerritories(idx).filter(id =>
    ADJ[id].some(e => game.owner[e.to] !== idx && game.canTraverse(idx, id, e.to)));
}

/* Best target value reachable from one of my border tiles. */
function _frontierScore(game, me, id, mode, weakest, wantList) {
  let best = 0;
  for (const e of ADJ[id]) {
    if (game.owner[e.to] !== me && game.canTraverse(me, id, e.to)) {
      best = Math.max(best, _valueOf(game, me, e.to, mode, weakest, wantList));
    }
  }
  return best;
}

function _aiPlace(game, mode, weakest) {
  const me = game.current;
  const P = game.player(me);
  if (P.reserve <= 0) return;
  const wantList = _nextUnlockTargets(game, me);

  // (a) Protect key token holdings first so progress doesn't get reverted.
  const keyHolds = [];
  if (game.owner['sap_tree'] === me && !P.tokens.has('sapcore')) keyHolds.push('sap_tree');
  if (game.owner['summoning'] === me && P.tokens.has('sapcore') && !P.tokens.has('enderite')) keyHolds.push('summoning');
  keyHolds.forEach(id => {
    while (P.reserve > 0 && game.armies[id] < 3) game.placeArmy(id, 1);
  });
  if (P.reserve <= 0) return;

  // (b) Shore up borders that face a stronger enemy stack (defence).
  const owned = game.ownedTerritories(me);
  owned.forEach(id => {
    if (P.reserve <= 0) return;
    let threat = 0;
    for (const e of ADJ[id]) {
      const o = game.owner[e.to];
      if (o !== me && o !== NEUTRAL && o != null) threat = Math.max(threat, game.armies[e.to]);
    }
    if (threat > game.armies[id]) game.placeArmy(id, Math.min(P.reserve, threat - game.armies[id] + 1));
  });
  if (P.reserve <= 0) return;

  // (c) Pour the rest onto the single best objective frontier (the breaker stack).
  let borders = _borders(game, me);
  if (!borders.length) borders = owned;
  borders.sort((a, b) =>
    (_frontierScore(game, me, b, mode, weakest, wantList) - _frontierScore(game, me, a, mode, weakest, wantList))
    || (game.armies[b] - game.armies[a]));
  const top = borders[0];
  game.placeArmy(top, P.reserve);
}

function _spreadTooThin(game, me) {
  const owned = game.ownedTerritories(me);
  if (!owned.length) return false;
  const total = owned.reduce((s, id) => s + game.armies[id], 0);
  return (total / owned.length) < 1.5;          // average garrison getting dangerously thin
}

function _hasFurtherTargets(game, me, id) {
  return ADJ[id].some(e => game.owner[e.to] !== me && game.canTraverse(me, id, e.to));
}

function _aiAttacks(game, mode, weakest) {
  const me = game.current;
  const wantList = _nextUnlockTargets(game, me);

  // Capture budget: scale with how much army we actually have, so a small
  // force consolidates instead of sprawling 1-army-thin across the map.
  const myArmies = game.ownedTerritories(me).reduce((s, id) => s + game.armies[id], 0);
  let budget = Math.max(2, Math.floor(myArmies / 5));
  let captures = 0;
  let guard = 0;

  while (guard++ < 200) {
    let best = null;
    for (const from of game.ownedTerritories(me)) {
      if (game.armies[from] < 2) continue;
      // Don't strip a key holding we still need to defend.
      const keepStrong = (from === 'sap_tree' && !game.players[me].tokens.has('sapcore')) ||
                         (from === 'summoning' && game.players[me].tokens.has('sapcore') && !game.players[me].tokens.has('enderite'));
      const minLeave = keepStrong ? 3 : 1;
      if (game.armies[from] <= minLeave) continue;

      for (const to of game.attackableFrom(from)) {
        const val = _valueOf(game, me, to, mode, weakest, wantList);
        const priority = val >= 25;                  // unlock structure / Moon / near-complete continent
        const favorable = game.armies[from] >= game.armies[to] + 1;
        const force = game.armies[from] - minLeave;   // armies actually free to commit
        // Only attack if favourable, or it's a priority objective we can plausibly take.
        if (!favorable && !(priority && force >= game.armies[to])) continue;
        const score = val * 3 + (game.armies[from] - game.armies[to]);
        if (best == null || score > best.score) best = { from, to, score, val, priority };
      }
    }
    if (!best) break;

    // Overextension guard: stop low-value expansion once the budget is spent
    // or the army is getting thin. Priority objectives ignore the budget.
    if (!best.priority && (captures >= budget || _spreadTooThin(game, me))) break;

    const r = game.attack(best.from, best.to);
    if (!r) break;
    if (r.captured) {
      captures++;
      // Commit a real stack when pushing forward toward more targets or a
      // priority objective; otherwise leave a minimal garrison.
      const commit = best.priority || _hasFurtherTargets(game, me, best.to);
      const move = commit ? r.maxMove : Math.min(r.maxMove, Math.max(r.minMove, 2));
      game.resolveCapture(best.from, best.to, move);
      if (game.winner != null) return;
    }
  }
}

function _aiPurify(game) {
  const me = game.current;
  if (game.turnState.specialUsed) return;
  const holdsTemple = game.ownedTerritories(me).some(id => TERRITORIES[id].structure === 'temple');
  if (!holdsTemple) return;
  let target = null, max = 0;
  for (const id of game.ownedTerritories(me)) {
    for (const e of ADJ[id]) {
      const t = TERRITORIES[e.to];
      if (t.continent === 'end' && game.owner[e.to] !== me && game.owner[e.to] != null) {
        if (game.armies[e.to] > max) { max = game.armies[e.to]; target = e.to; }
      }
    }
  }
  if (target) game.purify(target);
}

function _aiPlayCards(game) {
  const me = game.current;
  const P = game.player(me);
  for (const cid of [...P.cards]) {
    const def = CARD_BY_ID[cid];
    if (def.kind === 'moon_signal' || def.kind === 'cooler') {
      game.playCard(cid);
    } else if (def.kind === 'army_boost') {
      const borders = _borders(game, me).sort((a, b) => game.armies[b] - game.armies[a]);
      if (borders.length) game.playCard(cid, { territory: borders[0] });
    }
  }
}

function _aiFortify(game, mode, weakest) {
  const me = game.current;
  if (game.turnState.fortified) return;
  const wantList = _nextUnlockTargets(game, me);
  const owned = game.ownedTerritories(me);
  const borderSet = new Set(_borders(game, me));

  // Move from the fullest safe interior to the most valuable active frontier.
  const interior = owned.filter(id => !borderSet.has(id) && game.armies[id] > 1)
                        .sort((a, b) => game.armies[b] - game.armies[a]);
  const fronts = [...borderSet].sort((a, b) =>
    _frontierScore(game, me, b, mode, weakest, wantList) - _frontierScore(game, me, a, mode, weakest, wantList));

  for (const from of interior) {
    for (const to of fronts) {
      if (from !== to && game.connected(from, to, me)) {
        if (game.fortify(from, to, game.armies[from] - 1).ok) return;
      }
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { aiTakeTurn };
}
