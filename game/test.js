/* Node simulation harness — runs all-AI games to validate the engine. */
const data = require('./js/data.js');     Object.assign(global, data);
const cards = require('./js/cards.js');    Object.assign(global, cards);
const engine = require('./js/engine.js');  Object.assign(global, engine);
const ai = require('./js/ai.js');          Object.assign(global, ai);

function deal(game) {
  const endIds = Object.values(TERRITORIES).filter(t => t.continent === 'end').map(t => t.id);
  const n = game.players.length;
  const picksEach = Math.floor(endIds.length / n);
  const pool = [...endIds].sort(() => game.rng() - 0.5);
  const a = {}; let k = 0;
  for (let r = 0; r < picksEach; r++) for (let p = 0; p < n; p++) a[pool[k++]] = p;
  return a;
}

function seeded(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

function runGame(nPlayers, mode, seed) {
  const players = []; for (let i = 0; i < nPlayers; i++) players.push({ name: 'AI' + i, isAI: true });
  const game = new Game({ players, victoryMode: mode, variant: 'fast', rng: seeded(seed), onLog: () => {} });
  game.setup(deal(game));
  game.players.forEach(p => { p._sapHeldSince = null; });

  let turns = 0;
  const tokensSeen = new Set();
  let maxContinents = 0;
  while (game.winner == null && turns < 4000) {
    aiTakeTurn(game);
    game.players.forEach(p => p.tokens.forEach(t => tokensSeen.add(t)));
    game.players.forEach(p => { maxContinents = Math.max(maxContinents, game.heldContinents(p.idx).length); });
    game.endTurn();
    turns++;
  }
  return {
    winner: game.winner, turns, mode, nPlayers,
    tokens: [...tokensSeen].sort(), maxContinents,
    rounds: game.round,
    moonHeld: game.owner['moon_summit'],
  };
}

let pass = 0, fail = 0;
function check(name, cond, extra = '') { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL: ' + name + ' ' + extra); } }

console.log('=== Simulating games ===');
for (const mode of ['classic', 'domination', 'lore']) {
  for (const n of [2, 4, 6]) {
    let wins = 0, totTurns = 0, anyTokens = new Set(), maxCont = 0;
    for (let s = 1; s <= 6; s++) {
      const r = runGame(n, mode, s * 7919 + n);
      if (r.winner != null) wins++;
      totTurns += r.turns;
      r.tokens.forEach(t => anyTokens.add(t));
      maxCont = Math.max(maxCont, r.maxContinents);
    }
    console.log(`\n[${mode} / ${n}p] wins ${wins}/6, avg turns ${Math.round(totTurns / 6)}, tokens {${[...anyTokens].join(',')}}, maxContinents ${maxCont}`);
    check(`${mode}/${n}p produces a winner`, wins >= 5, `(only ${wins}/6)`);
  }
}

// Targeted unlock-path test: drive each progression step deterministically.
console.log('\n=== Unlock path (mechanics) ===');
(() => {
  const game = new Game({ players: [{ name: 'P0' }, { name: 'P1' }], victoryMode: 'lore', variant: 'fast', rng: seeded(42), onLog: () => {} });
  game.setup(deal(game));
  const me = game.players[0];

  // 1) Sap Core: hold the Sap Tree across a turn boundary.
  game.owner['sap_tree'] = 0; game.armies['sap_tree'] = 3;
  game.current = 0; me._sapHeldSince = 1; game.round = 2;
  game._checkSapCore();
  check('Sap Core granted after holding Sap Tree', me.tokens.has('sapcore'));

  // 2) Enderite via Summoning Structure -> unlocks Nether.
  game.owner['summoning'] = 0; game.armies['summoning'] = 3;
  game.phase = PHASES.PLACE; game.turnState = game._freshTurnState();
  const r2 = game.activateSummoning();
  check('Summoning activation succeeds', r2.ok, JSON.stringify(r2));
  check('Enderite granted', me.tokens.has('enderite'));
  check('Nether unlocked', CONTINENTS.nether.locked === false);

  // 3) Cooler via capturing the Freezing Anomaly -> unlocks Overworld.
  game.owner['green_biome'] = 0; game.armies['green_biome'] = 8;
  game.owner['freezing_anomaly'] = 1; game.armies['freezing_anomaly'] = 1;
  game.phase = PHASES.ATTACK;
  let g = 0; while (game.owner['freezing_anomaly'] !== 0 && g++ < 30 && game.armies['green_biome'] >= 2) {
    const r = game.attack('green_biome', 'freezing_anomaly');
    if (r && r.captured) game.resolveCapture('green_biome', 'freezing_anomaly', r.maxMove);
  }
  check('Cooler granted on Freezing Anomaly capture', me.tokens.has('cooler'));
  check('Overworld unlocked', CONTINENTS.overworld.locked === false);

  // 4) Gravity via capturing the Mountains.
  game.owner['village'] = 0; game.armies['village'] = 8;
  game.owner['mountains'] = 1; game.armies['mountains'] = 1;
  g = 0; while (game.owner['mountains'] !== 0 && g++ < 40 && game.armies['village'] >= 2) {
    const r = game.attack('village', 'mountains');
    if (r && r.captured) game.resolveCapture('village', 'mountains', r.maxMove);
  }
  check('Gravity granted on Mountains capture', me.tokens.has('gravity'));

  // 5) Great Combine -> Aether token + unlock.
  game.turnState = game._freshTurnState();
  const r5 = game.greatCombine();
  check('Great Combine succeeds', r5.ok, JSON.stringify(r5));
  check('Aether token granted', me.tokens.has('aether'));
  check('Aether unlocked', CONTINENTS.aether.locked === false);

  // 6) Space access via Sky Ruins capture.
  game.owner['high_peak'] = 0; game.armies['high_peak'] = 8;
  game.owner['sky_ruins'] = 1; game.armies['sky_ruins'] = 1;
  game.phase = PHASES.ATTACK;
  g = 0; while (game.owner['sky_ruins'] !== 0 && g++ < 30 && game.armies['high_peak'] >= 2) {
    const r = game.attack('high_peak', 'sky_ruins');
    if (r && r.captured) game.resolveCapture('high_peak', 'sky_ruins', r.maxMove);
  }
  check('Space Access granted on Sky Ruins capture', me.tokens.has('space'));
  check('Space unlocked', CONTINENTS.space.locked === false);

  // Reset locked flags (they are module-global) for any later runs.
  CONTINENTS.nether.locked = CONTINENTS.overworld.locked = CONTINENTS.aether.locked = CONTINENTS.space.locked = true;
})();

// Combat sanity
console.log('\n=== Combat sanity ===');
(() => {
  const game = new Game({ players: [{ name: 'A', isAI: true }, { name: 'B', isAI: true }], victoryMode: 'classic', variant: 'fast', rng: seeded(5), onLog: () => {} });
  game.setup(deal(game));
  // force an adjacency battle
  const a = 'endstone_wall', b = 'waterfall_wall';
  game.owner[a] = 0; game.armies[a] = 10; game.owner[b] = 1; game.armies[b] = 3;
  game.current = 0; game.phase = PHASES.ATTACK;
  let captured = false, loops = 0;
  while (!captured && loops++ < 50 && game.armies[a] >= 2) {
    const r = game.attack(a, b);
    if (r && r.captured) { game.resolveCapture(a, b, r.maxMove); captured = true; }
  }
  check('attacker can capture a weaker neighbour', captured || game.owner[b] === 0);
  check('no territory left empty after capture', Object.values(game.armies).every((v, i) => game.owner[Object.keys(game.armies)[i]] == null || v >= 1));
})();

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
