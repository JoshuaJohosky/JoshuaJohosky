/* =====================================================================
 * Reward Cards — one-time boosts earned from milestones.
 * Each card has: id, name, text, and a `kind` the engine uses to apply
 * it. No card may directly win the game (Balance Rule).
 * ===================================================================== */

const CARD_DEFS = [
  { id: 'army_boost', name: 'Army Boost',  kind: 'army_boost',
    text: 'Place 3 extra armies on one territory you control.' },
  { id: 'fortify',    name: 'Fortify Move', kind: 'fortify',
    text: 'Make one extra fortify move this turn.' },
  { id: 'purify',     name: 'Purification', kind: 'purify',
    text: 'Remove 1 enemy army from an End territory adjacent to one you control. Hold if none is available.' },
  { id: 'cooler',     name: 'Cooler',       kind: 'cooler',
    text: 'One safe Nether/water placement: drop 2 armies onto any territory you control this turn.' },
  { id: 'gravity',    name: 'Gravity Shift', kind: 'gravity',
    text: 'For one battle this turn, your attacker rolls +1 die in a chosen territory.' },
  { id: 'fly_over',   name: 'Fly Over',     kind: 'flyover',
    text: 'Move armies across one non-adjacent Aether gap once this turn.' },
  { id: 'moon_signal',name: 'Moon Signal',  kind: 'moon_signal',
    text: 'Reveal progress: gain +2 reinforcements now (cannot itself win the game).' },
];

const CARD_BY_ID = {};
CARD_DEFS.forEach(c => CARD_BY_ID[c.id] = c);

// Weighted draw: commons more frequent than the powerful end-game cards.
const CARD_WEIGHTS = {
  army_boost: 3, fortify: 3, purify: 2, cooler: 2,
  gravity: 2, fly_over: 2, moon_signal: 1,
};

function drawRandomCard(rng = Math.random) {
  const pool = [];
  CARD_DEFS.forEach(c => {
    const w = CARD_WEIGHTS[c.id] || 1;
    for (let i = 0; i < w; i++) pool.push(c.id);
  });
  return pool[Math.floor(rng() * pool.length)];
}

if (typeof module !== 'undefined') {
  module.exports = { CARD_DEFS, CARD_BY_ID, drawRandomCard };
}
