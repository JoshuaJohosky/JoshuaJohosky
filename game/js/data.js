/* =====================================================================
 * RISK: Minecraft Global Domination — Board Data
 * ---------------------------------------------------------------------
 * All continents, territories, adjacencies, structures and continent
 * bonuses are defined here, faithful to the fan rulebook.
 *
 * The "world stack" is drawn bottom-to-top so the board reads as a climb:
 *   End (start) -> Nether -> Overworld -> Aether -> Space -> Moon.
 * ===================================================================== */

// Continent metadata. `bonus` = armies for holding every territory.
const CONTINENTS = {
  end:       { id: 'end',       name: 'The End',    bonus: 4, color: '#c7b8e8', band: 5, locked: false },
  nether:    { id: 'nether',    name: 'The Nether', bonus: 5, color: '#d98a8a', band: 4, locked: true  },
  overworld: { id: 'overworld', name: 'Overworld',  bonus: 7, color: '#8fce8f', band: 3, locked: true  },
  aether:    { id: 'aether',    name: 'The Aether', bonus: 5, color: '#bfe3f2', band: 2, locked: true  },
  space:     { id: 'space',     name: 'Space',      bonus: 3, color: '#b9b9d6', band: 1, locked: true  },
};

// Order continents must be held in for Domination/Lore (all five).
const CONTINENT_ORDER = ['end', 'nether', 'overworld', 'aether', 'space'];

// Y band centers (board is ~1700 tall). Bottom = End.
const BAND_Y = { 5: 1560, 4: 1240, 3: 920, 2: 600, 1: 290 };

/* Helper to build a territory record. */
function T(id, name, continent, x, y, opts = {}) {
  return Object.assign({
    id, name, continent, x, y,
    structure: null,   // 'temple','sap','summon','cooler','gravity','skyruins','redplanet','crater','summit'
    bonusReinforce: 0, // flat +N reinforcement while held
    note: '',
  }, opts);
}

// ---- THE END (10) -------------------------------------------------------
const END = [
  T('endstone_wall',   'Endstone Wall',         'end', 120, 1620),
  T('waterfall_wall',  'Waterfall Wall',        'end', 300, 1655),
  T('purple_mushroom', 'Purple Mushroom Fields','end', 470, 1640),
  T('octarine_grove',  'Octarine Grove',        'end', 650, 1660),
  T('end_jungle',      'End Jungle',            'end', 830, 1635),
  T('end_badlands',    'End Badlands',          'end', 1000,1650),
  T('endesert',        'Endesert',              'end', 1110,1545, { note: 'Capturing FROM here moves +1 extra army into the captured space.' }),
  T('sap_tree',        'Sap Tree Region',       'end', 230, 1480, { structure: 'sap',    note: 'Capture: +1 bonus army. Hold until your next turn to gain a Sap Core token.' }),
  T('end_temple',      'End Temple',            'end', 540, 1470, { structure: 'temple', bonusReinforce: 1, note: 'End Temple: +1 reinforcement. Grants the Purify special action.' }),
  T('summoning',       'Summoning Structure',   'end', 860, 1485, { structure: 'summon', note: 'Control with a Sap Core token, then Activate to gain Enderite (unlocks the Nether) and draw a card.' }),
];

// ---- THE NETHER (10) ----------------------------------------------------
const NETHER = [
  T('plum_forest',     'Plum Forest',          'nether', 150, 1300, { bonusReinforce: 1, note: 'Safe Nether zone: +1 reinforcement while held.' }),
  T('yellow_canopy',   'Yellow Canopy',        'nether', 320, 1330, { note: 'Ignores the first special-movement effect used against it each turn.' }),
  T('cherry_pocket',   'Cherry Blossom Pocket','nether', 480, 1310),
  T('grey_biome',      'Grey Biome',           'nether', 640, 1335, { note: 'Allows one sideways Grey-connection move per turn.' }),
  T('green_biome',     'Green Biome',          'nether', 800, 1305),
  T('freezing_anomaly','Freezing Anomaly',     'nether', 960, 1330, { structure: 'cooler', note: 'COOLER SITE. Defending: remove 1 attacking die once/turn. Capture to gain the Cooler token (unlocks the Overworld water routes).' }),
  T('obsidian',        'Obsidian Obscurity',   'nether', 1120,1300),
  T('nether_desert',   'Nether Desert',        'nether', 240, 1180),
  T('crimson_wastes',  'Crimson Wastes',       'nether', 560, 1175),
  T('warped_fringe',   'Warped Fringe',        'nether', 880, 1180),
];

// ---- OVERWORLD (14) -----------------------------------------------------
const OVERWORLD = [
  T('forest',     'Forest',         'overworld', 120, 1000),
  T('birch',      'Birch Forest',   'overworld', 270, 1010),
  T('taiga',      'Taiga',          'overworld', 420, 990),
  T('plains',     'Plains',         'overworld', 570, 1015),
  T('desert_ow',  'Desert',         'overworld', 720, 995),
  T('savanna',    'Savanna',        'overworld', 870, 1015),
  T('badlands_ow','Badlands',       'overworld', 1020,995),
  T('mountains',  'Mountains',      'overworld', 1140,895, { structure: 'gravity', note: 'GRAVITY SITE. Defending: reroll one defense die once/battle. Capture to gain the Gravity token.' }),
  T('swamp',      'Swamp',          'overworld', 180, 880),
  T('jungle_ow',  'Jungle',         'overworld', 360, 885),
  T('river',      'River',          'overworld', 540, 880, { note: 'River route: links coastal/ocean spaces.' }),
  T('ocean',      'Ocean',          'overworld', 720, 885, { note: 'Oceans slow movement unless routes are controlled (Cooler token).' }),
  T('caves',      'Cave Systems',   'overworld', 900, 880, { note: 'Caves defend well.' }),
  T('village',    'Village Regions','overworld', 1050,885, { structure: 'village', bonusReinforce: 1, note: 'Village: +1 reinforcement on any Overworld territory you hold.' }),
];

// ---- THE AETHER (9) -----------------------------------------------------
const AETHER = [
  T('cloudbank',   'Cloudbank',      'aether', 180, 680, { note: 'Move armies across one non-adjacent Aether gap once per turn.' }),
  T('aercloud',    'Aercloud Isles', 'aether', 350, 700),
  T('floating',    'Floating Meadow','aether', 520, 685),
  T('sky_ruins',   'Sky Ruins',      'aether', 690, 700, { structure: 'skyruins', note: 'AETHER GATE. First capture: draw a card. Control it to gain Space Access (unlocks Space).' }),
  T('high_peak',   'High Peak',      'aether', 860, 685),
  T('lightwind',   'Lightwind Ridge','aether', 1020,700),
  T('upper_mist',  'Upper Mist',     'aether', 280, 540),
  T('temple_drift','Temple Drift',   'aether', 560, 535),
  T('starfall',    'Starfall Shelf', 'aether', 840, 540),
];

// ---- SPACE + MOON (10) --------------------------------------------------
const SPACE = [
  T('orbit_path',   'Orbit Path',      'space', 200, 380, { note: 'Travel route only — gives no reinforcements.' }),
  T('small_ast',    'Small Asteroid',  'space', 360, 400, { note: 'No bonus, but connects distant Space zones.' }),
  T('shattered',    'Shattered Asteroid','space',520, 385),
  T('ice_moonlet',  'Ice Moonlet',     'space', 680, 405),
  T('red_planet',   'Red Planet',      'space', 840, 385, { structure: 'redplanet', note: 'First capture: draw a card and place 2 bonus armies.' }),
  T('grey_moon',    'Grey Moon',       'space', 1000,405),
  T('cube_alpha',   'Planet Cube Alpha','space',300, 250),
  T('cube_beta',    'Planet Cube Beta','space', 540, 250),
  T('moon_crater',  'Moon Crater',     'space', 700, 150, { structure: 'crater', note: 'Hold to make the Summit defend even harder. Take this before the Summit.' }),
  T('moon_summit',  'Moon Summit',     'space', 880, 130, { structure: 'summit', note: 'FINAL OBJECTIVE. +1 defense die while you hold any Moon space. Capture only with all continents + Space access; hold until your next turn to win the Lore game.' }),
];

const TERRITORIES = {};
[...END, ...NETHER, ...OVERWORLD, ...AETHER, ...SPACE].forEach(t => { TERRITORIES[t.id] = t; });

/* Adjacency. Each pair is connected both ways. Within-continent edges plus
 * inter-continent GATEWAY edges. Gateways are tagged so the engine can gate
 * them behind unlock tokens. */
const EDGES = [
  // --- End internal ---
  ['endstone_wall','waterfall_wall'],['waterfall_wall','purple_mushroom'],
  ['purple_mushroom','octarine_grove'],['octarine_grove','end_jungle'],
  ['end_jungle','end_badlands'],['end_badlands','endesert'],
  ['endstone_wall','sap_tree'],['waterfall_wall','sap_tree'],
  ['sap_tree','end_temple'],['purple_mushroom','end_temple'],
  ['octarine_grove','end_temple'],['end_temple','summoning'],
  ['end_jungle','summoning'],['summoning','end_badlands'],
  ['endesert','end_badlands'],['endesert','summoning'],
  // --- Nether internal ---
  ['plum_forest','yellow_canopy'],['yellow_canopy','cherry_pocket'],
  ['cherry_pocket','grey_biome'],['grey_biome','green_biome'],
  ['green_biome','freezing_anomaly'],['freezing_anomaly','obsidian'],
  ['plum_forest','nether_desert'],['nether_desert','cherry_pocket'],
  ['cherry_pocket','crimson_wastes'],['crimson_wastes','green_biome'],
  ['green_biome','warped_fringe'],['warped_fringe','obsidian'],
  ['nether_desert','crimson_wastes'],['crimson_wastes','warped_fringe'],
  ['grey_biome','crimson_wastes'],
  // --- Overworld internal ---
  ['forest','birch'],['birch','taiga'],['taiga','plains'],['plains','desert_ow'],
  ['desert_ow','savanna'],['savanna','badlands_ow'],['badlands_ow','mountains'],
  ['forest','swamp'],['swamp','jungle_ow'],['jungle_ow','river'],['river','ocean'],
  ['ocean','caves'],['caves','village'],['village','mountains'],
  ['birch','jungle_ow'],['taiga','river'],['plains','river'],['plains','ocean'],
  ['desert_ow','ocean'],['savanna','caves'],['badlands_ow','caves'],['swamp','birch'],
  // --- Aether internal ---
  ['cloudbank','aercloud'],['aercloud','floating'],['floating','sky_ruins'],
  ['sky_ruins','high_peak'],['high_peak','lightwind'],
  ['cloudbank','upper_mist'],['upper_mist','temple_drift'],['temple_drift','floating'],
  ['temple_drift','starfall'],['starfall','high_peak'],['upper_mist','aercloud'],
  ['lightwind','starfall'],
  // Aether "gaps" — crossable only with Fly Over / Cloudbank power:
  ['cloudbank','floating',  {gap:true}],
  ['floating','high_peak',  {gap:true}],
  ['upper_mist','starfall',  {gap:true}],
  // --- Space internal ---
  ['orbit_path','small_ast'],['small_ast','shattered'],['shattered','ice_moonlet'],
  ['ice_moonlet','red_planet'],['red_planet','grey_moon'],
  ['orbit_path','cube_alpha'],['cube_alpha','cube_beta'],['cube_beta','shattered'],
  ['cube_beta','moon_crater'],['moon_crater','moon_summit'],['red_planet','moon_crater'],
  ['ice_moonlet','cube_beta'],['grey_moon','moon_summit'],
  ['cube_alpha','small_ast'],
  // --- GATEWAYS between continents (gated by unlock tokens) ---
  ['summoning','plum_forest',     {gateway:'nether',    requires:'enderite'}],
  ['obsidian','nether_desert'], // close the Nether loop
  ['freezing_anomaly','ocean',    {gateway:'overworld', requires:'cooler'}],
  ['warped_fringe','forest',      {gateway:'overworld', requires:'cooler'}],
  ['mountains','starfall',        {gateway:'aether',    requires:'aether'}],
  ['village','lightwind',         {gateway:'aether',    requires:'aether'}],
  ['sky_ruins','orbit_path',      {gateway:'space',     requires:'space'}],
  ['lightwind','small_ast',       {gateway:'space',     requires:'space'}],
];

/* Continent bonus + unlock token required to ENTER a continent. */
const UNLOCK_REQUIREMENT = {
  nether: 'enderite',
  overworld: 'cooler',
  aether: 'aether',
  space: 'space',
};

/* Token catalogue (permanent keys). */
const TOKENS = {
  sapcore:  { name: 'Sap Core',     desc: 'Earned by holding the Sap Tree Region a full turn. Needed to activate the Summoning Structure.' },
  enderite: { name: 'Enderite',     desc: 'From activating the Summoning Structure. Unlocks the Nether.' },
  cooler:   { name: 'Cooler',       desc: 'From capturing the Freezing Anomaly. Opens Overworld water routes and safe placement.' },
  gravity:  { name: 'Gravity',      desc: 'From capturing the Mountains (Gravity Site). Enables Gravity Shift.' },
  aether:   { name: 'Aether',       desc: 'From the Great Combine. Unlocks the Aether and grants Fly Over.' },
  space:    { name: 'Space Access', desc: 'From controlling the Sky Ruins (Aether Gate). Unlocks Space.' },
};

/* Build undirected adjacency map (including gateway metadata). */
const ADJ = {};
Object.keys(TERRITORIES).forEach(id => { ADJ[id] = []; });
EDGES.forEach(e => {
  const [a, b, meta = {}] = e;
  if (meta.skip || !TERRITORIES[a] || !TERRITORIES[b]) return;
  ADJ[a].push({ to: b, ...meta });
  ADJ[b].push({ to: a, ...meta });
});

if (typeof module !== 'undefined') {
  module.exports = { CONTINENTS, CONTINENT_ORDER, TERRITORIES, ADJ, EDGES, BAND_Y, TOKENS, UNLOCK_REQUIREMENT };
}
