/* Headless DOM smoke test using jsdom — exercises the real UI code paths. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;

// Inject each script as an inline <script> so top-level declarations become
// real realm globals (function decls -> window props; class/const -> lexical).
['js/data.js', 'js/cards.js', 'js/engine.js', 'js/ai.js', 'js/effects.js', 'js/app.js'].forEach(f => {
  const el = window.document.createElement('script');
  el.textContent = fs.readFileSync(path.join(__dirname, f), 'utf8');
  window.document.body.appendChild(el);
});
// app.js registers a DOMContentLoaded listener on window; fire it now.
window.dispatchEvent(new window.Event('DOMContentLoaded'));

const ev = sel => window.eval(sel);
let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL ' + n + ' ' + x); } };

check('setup overlay rendered', window.document.querySelector('.modal h1') != null);

// Start a 3-player FAST lore game (p0 human).
window.startGame({
  victoryMode: 'lore', variant: 'fast',
  players: [{ name: 'Hero', isAI: false }, { name: 'Bot1', isAI: true }, { name: 'Bot2', isAI: true }],
});
const game = ev('game');
const NT = ev('Object.keys(TERRITORIES).length');
check('game created', game != null);
check('setup placed armies on End', Object.values(game.armies).reduce((a, b) => a + b, 0) >= 35);
check('no territory left unowned (neutral garrisons seeded)', Object.values(game.owner).every(o => o != null));
{
  const nether = Object.values(ev('TERRITORIES')).filter(t => t.continent === 'nether');
  check('Nether garrisoned with neutral armies', nether.every(t => game.owner[t.id] === 'neutral' && game.armies[t.id] >= 1));
}
check('FX module present', typeof ev('FX') === 'object');
check('board SVG drew all nodes', window.document.querySelectorAll('g.terr').length === NT);
check('board SVG drew blocky tiles', window.document.querySelectorAll('g.terr .tile').length === NT);
check('player 0 turn, place phase', game.current === 0 && game.phase === 'place');
check('reserve assigned', game.player().reserve >= 3);

// PLACE: click one of my territories.
const myTerr = game.ownedTerritories(0)[0];
const clickNode = (id, shift = false) => {
  const g = window.document.querySelector(`g.terr[data-id="${id}"]`);
  const e = new window.MouseEvent('click', { bubbles: true });
  if (shift) Object.defineProperty(e, 'shiftKey', { value: true });
  g.dispatchEvent(e);
};
const startReserve = game.player().reserve;
clickNode(myTerr);
check('clicking a territory placed 1 army', game.player().reserve === startReserve - 1);
window.autoPlace();
check('auto-place emptied reserve', game.player().reserve === 0);
game.finishPlacement();
check('advanced to attack phase', game.phase === 'attack');
window.render();

// ATTACK: guarantee a capture through the engine path.
const a = game.ownedTerritories(0).find(id => ADJExists(game, id)) || 'endstone_wall';
function ADJExists(g, id) { return ev('ADJ')[id] && ev('ADJ')[id].length > 0; }
game.armies[a] = 12;
const adj = ev('ADJ')[a].map(x => x.to);
const target = adj.find(t => game.owner[t] !== 0) || adj[0];
game.owner[target] = 1; game.armies[target] = 1;
let captured = false, guard = 0;
while (!captured && guard++ < 40 && game.armies[a] >= 2) {
  const r = game.attack(a, target);
  if (r && r.captured) { game.resolveCapture(a, target, r.maxMove); captured = true; }
}
check('attack + capture works', captured || game.owner[target] === 0);

// FORTIFY
game.phase = 'fortify';
let fortified = false;
const owned = game.ownedTerritories(0);
for (const from of owned) {
  if (game.armies[from] < 2) continue;
  for (const to of owned) {
    if (from !== to && game.connected(from, to, 0)) { if (game.fortify(from, to, 1).ok) { fortified = true; break; } }
  }
  if (fortified) break;
}
check('fortify along connected path works', fortified);

// End turn -> AI
game.endTurn();
check('turn advanced', game.current !== 0 || game.winner != null);
try { window.aiTakeTurn(game); game.endTurn(); window.render(); check('AI turn + render no throw', true); }
catch (e) { check('AI turn + render no throw', false, e.message); }

// Rules modal
window.showRules();
check('rules modal opens', /How to Play/.test(window.document.querySelector('.modal').textContent));
window.closeModal();

// Card rendering
game.current = 0; game.round = 3;
game.player().cards.push('army_boost');
window.render();
check('reward card renders', /Army Boost/.test(window.document.getElementById('cardList').textContent));

// Win screen
game.winner = 0;
window.showWin();
check('win screen renders', /victory/i.test(window.document.querySelector('.modal').textContent));

console.log(`\n=== smoke: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
