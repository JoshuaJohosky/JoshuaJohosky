/* =====================================================================
 * AI opponent — heuristic player for RISK: Minecraft Global Domination.
 * Runs a full turn synchronously against the engine. The UI renders the
 * resulting state and replays the engine log.
 * ===================================================================== */

function aiTakeTurn(game) {
  const me = game.current;
  const P = game.player(me);

  // 1) Progression specials (free unlocks first).
  game.activateSummoning();   // no-op if not eligible
  game.greatCombine();

  // 1b) Play obviously-good cards.
  _aiPlayCards(game);

  // 2) Placement — reinforce the most useful frontline.
  _aiPlace(game);
  game.finishPlacement();

  // 3) Attacks.
  _aiAttacks(game);

  // 4) Temple purify, if it has the temple and a juicy target.
  _aiPurify(game);

  // 5) Fortify interior -> weakest border.
  _aiFortify(game);
}

function _borders(game, idx) {
  // Owned territories that touch a non-owned, traversable neighbour.
  return game.ownedTerritories(idx).filter(id =>
    ADJ[id].some(e => game.owner[e.to] !== idx && game.canTraverse(idx, id, e.to)));
}

function _aiPlace(game) {
  const me = game.current;
  const P = game.player(me);
  let borders = _borders(game, me);
  const owned = game.ownedTerritories(me);
  if (!borders.length) borders = owned; // pinned in — just stack up

  // Prioritise: territory that can attack a weak/structure target, or completes a continent.
  const score = id => {
    let s = game.armies[id];
    for (const e of ADJ[id]) {
      if (game.owner[e.to] !== me && game.canTraverse(me, id, e.to)) {
        const diff = game.armies[id] - game.armies[e.to];
        s += Math.max(0, diff);
        if (TERRITORIES[e.to].structure) s += 4;          // chase structures / unlock path
        if (TERRITORIES[e.to].continent !== TERRITORIES[id].continent) s += 2; // expand outward
      }
    }
    return s;
  };
  borders.sort((a, b) => score(b) - score(a));

  // Pour the bulk onto the single best border to build a breaker stack,
  // then spread the remainder so other fronts do not collapse.
  if (P.reserve <= 0) return;
  const top = borders[0];
  const bulk = Math.ceil(P.reserve * 0.75);
  game.placeArmy(top, bulk);
  let i = 0;
  while (P.reserve > 0 && borders.length) {
    game.placeArmy(borders[i % borders.length], 1);
    i++;
  }
}

function _aiAttacks(game) {
  const me = game.current;
  // Material lead -> press harder to actually close games out.
  const myArmies = game.ownedTerritories(me).reduce((s, id) => s + game.armies[id], 0);
  const totalArmies = Object.values(game.armies).reduce((s, v) => s + v, 0);
  const dominant = myArmies > totalArmies * 0.5;
  let guard = 0;
  while (guard++ < 120) {
    // Find the best attack available right now.
    let best = null;
    for (const from of game.ownedTerritories(me)) {
      if (game.armies[from] < 2) continue;
      for (const to of game.attackableFrom(from)) {
        let s = game.armies[from] - game.armies[to];
        if (TERRITORIES[to].structure) s += 3;       // value structures
        if (TERRITORIES[to].structure === 'summit' || TERRITORIES[to].structure === 'crater') s += 6;
        if (game.owner[to] === NEUTRAL) s += 0.5;     // soft targets
        if (game.owner[to] == null) s += 1;           // free expansion into empty board
        // Attack at parity (ties go to defender, but a bigger stack still grinds through).
        const worth = game.armies[from] >= game.armies[to] ||
                      game.owner[to] == null ||
                      (TERRITORIES[to].structure && game.armies[from] >= 2);
        if (worth && (best == null || s > best.s)) best = { from, to, s };
      }
    }
    if (!best) break;
    // A dominant player keeps pushing even into slightly-unfavourable fights to finish.
    if (best.s < (dominant ? -3 : -1)) break;

    const res = game.attack(best.from, best.to);
    if (!res) break;
    if (res.captured) {
      // Commit forward if the captured space borders more enemies, else minimal.
      const fwd = ADJ[best.to].some(e => game.owner[e.to] !== me);
      const move = fwd ? res.maxMove : res.minMove;
      game.resolveCapture(best.from, best.to, move);
      if (game.winner != null) return;
    }
    // If the source got too weak, it simply won't qualify next loop.
  }
}

function _aiPurify(game) {
  const me = game.current;
  if (game.turnState.specialUsed) return;
  const holdsTemple = game.ownedTerritories(me).some(id => TERRITORIES[id].structure === 'temple');
  if (!holdsTemple) return;
  // Target the strongest adjacent enemy End territory.
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
  // Army Boost onto the strongest border; Moon Signal / Cooler for extra armies.
  const playable = [...P.cards];
  for (const cid of playable) {
    const def = CARD_BY_ID[cid];
    if (def.kind === 'moon_signal' || def.kind === 'cooler') {
      game.playCard(cid);
    } else if (def.kind === 'army_boost') {
      const borders = _borders(game, me).sort((a, b) => game.armies[b] - game.armies[a]);
      if (borders.length) game.playCard(cid, { territory: borders[0] });
    }
  }
}

function _aiFortify(game) {
  const me = game.current;
  if (game.turnState.fortified) return;
  // Move from the safest, fullest interior territory to the weakest border.
  const owned = game.ownedTerritories(me);
  const borders = new Set(_borders(game, me));
  const interior = owned.filter(id => !borders.has(id) && game.armies[id] > 1)
                        .sort((a, b) => game.armies[b] - game.armies[a]);
  const weakBorders = [...borders].sort((a, b) => game.armies[a] - game.armies[b]);
  for (const from of interior) {
    for (const to of weakBorders) {
      if (game.connected(from, to, me)) {
        const res = game.fortify(from, to, game.armies[from] - 1);
        if (res.ok) return;
      }
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { aiTakeTurn };
}
