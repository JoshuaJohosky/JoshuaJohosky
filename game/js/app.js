/* =====================================================================
 * App controller — setup, board rendering, interaction, AI driving.
 * ===================================================================== */

let game = null;
const UI = { sel: null, targets: new Set(), mode: 'idle', cardTarget: null, busy: false };

const STRUCT_ICON = {
  temple: '🏛️', sap: '🌳', summon: '🌀', cooler: '❄️', gravity: '⛰️',
  village: '🏘️', skyruins: '☁️', redplanet: '🪐', crater: '🌑', summit: '🌕', endesert: '🏜️',
};
const BANDS = [
  { c: 'space',     y0: 60,   y1: 470  },
  { c: 'aether',    y0: 480,  y1: 825  },
  { c: 'overworld', y0: 830,  y1: 1120 },
  { c: 'nether',    y0: 1125, y1: 1400 },
  { c: 'end',       y0: 1405, y1: 1705 },
];

/* ---------------- bootstrap ---------------- */
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('rulesBtn').onclick = showRules;
  document.getElementById('newGameBtn').onclick = showSetup;
  document.getElementById('board').addEventListener('click', onBoardClick);
  const sb = document.getElementById('soundBtn');
  if (sb) sb.onclick = () => {
    const on = !FX.isOn(); FX.setSound(on);
    sb.textContent = on ? '🔊' : '🔇';
    if (on) FX.play('click');
  };
  showSetup();
});

/* ---------------- modal helpers ---------------- */
function openModal(html, opts = {}) {
  const host = document.getElementById('overlayHost');
  host.innerHTML = `<div class="overlay"><div class="modal">${html}</div></div>`;
  if (opts.onOpen) opts.onOpen(host);
  return host;
}
function closeModal() { document.getElementById('overlayHost').innerHTML = ''; }

/* ---------------- SETUP ---------------- */
const setupState = { mode: 'lore', variant: 'strategic', count: 3, names: [] };

function showSetup() {
  const colors = PLAYER_COLORS;
  const playerRows = () => {
    let rows = '';
    for (let i = 0; i < setupState.count; i++) {
      const def = setupState.names[i] || (i === 0 ? 'You' : `Bot ${i}`);
      const isAI = setupState.names[i + '_ai'] != null ? setupState.names[i + '_ai'] : (i !== 0);
      rows += `<div class="player-row">
        <span class="swatch" style="background:${colors[i]}"></span>
        <input type="text" data-pi="${i}" value="${def}">
        <select data-ai="${i}">
          <option value="human" ${!isAI ? 'selected' : ''}>Human</option>
          <option value="ai" ${isAI ? 'selected' : ''}>Computer</option>
        </select></div>`;
    }
    return rows;
  };

  const html = `
    <h1><span class="risk">RISK</span> · <span class="mc">Minecraft</span> Global Domination</h1>
    <div class="sub">Control the dimensions, win battles with dice, climb from the End all the way to the Moon. Unofficial fan prototype.</div>

    <div class="field">
      <label>Victory Type</label>
      <div class="choice-row" id="modeChoices">
        <div class="choice" data-mode="classic"><div class="t">Classic</div><div class="d">Eliminate every rival. A simple battle game.</div></div>
        <div class="choice" data-mode="domination"><div class="t">Domination</div><div class="d">Hold all five continents at once.</div></div>
        <div class="choice" data-mode="lore"><div class="t">Lore (full)</div><div class="d">Hold all continents, take the Moon, keep it to your next turn.</div></div>
      </div>
    </div>

    <div class="field">
      <label>Setup Variant</label>
      <div class="choice-row" id="variantChoices">
        <div class="choice" data-variant="strategic"><div class="t">Strategic</div><div class="d">Draft End territories one at a time.</div></div>
        <div class="choice" data-variant="fast"><div class="t">Fast</div><div class="d">Deal End territories randomly.</div></div>
        <div class="choice" data-variant="chaos"><div class="t">Chaos</div><div class="d">Nether open from the start (everyone gets Enderite).</div></div>
      </div>
    </div>

    <div class="field">
      <label>Players: <span id="countLbl">${setupState.count}</span> (2–6)</label>
      <div class="range-row"><input type="range" id="countRange" min="2" max="6" value="${setupState.count}"></div>
      <div class="player-rows" id="playerRows">${playerRows()}</div>
    </div>

    <div class="btn-row" style="margin-top:18px;">
      <button class="btn primary" id="startBtn" style="flex:1;">Start Game</button>
      <button class="btn" id="rulesBtn2">Read the Rules</button>
    </div>`;

  openModal(html, { onOpen: host => {
    const refreshSel = () => {
      host.querySelectorAll('[data-mode]').forEach(el => el.classList.toggle('sel', el.dataset.mode === setupState.mode));
      host.querySelectorAll('[data-variant]').forEach(el => el.classList.toggle('sel', el.dataset.variant === setupState.variant));
    };
    host.querySelectorAll('[data-mode]').forEach(el => el.onclick = () => { setupState.mode = el.dataset.mode; refreshSel(); });
    host.querySelectorAll('[data-variant]').forEach(el => el.onclick = () => { setupState.variant = el.dataset.variant; refreshSel(); });
    refreshSel();

    const rebuildRows = () => {
      host.querySelector('#playerRows').innerHTML = playerRows();
      wireRows();
    };
    const wireRows = () => {
      host.querySelectorAll('input[data-pi]').forEach(inp => inp.oninput = () => { setupState.names[inp.dataset.pi] = inp.value; });
      host.querySelectorAll('select[data-ai]').forEach(sel => sel.onchange = () => { setupState.names[sel.dataset.ai + '_ai'] = (sel.value === 'ai'); });
    };
    wireRows();

    host.querySelector('#countRange').oninput = e => {
      setupState.count = +e.target.value;
      host.querySelector('#countLbl').textContent = setupState.count;
      rebuildRows();
    };
    host.querySelector('#rulesBtn2').onclick = showRules;
    host.querySelector('#startBtn').onclick = () => {
      const players = [];
      for (let i = 0; i < setupState.count; i++) {
        const nameInp = host.querySelector(`input[data-pi="${i}"]`);
        const aiSel = host.querySelector(`select[data-ai="${i}"]`);
        players.push({ name: (nameInp.value || `Player ${i + 1}`).trim(), isAI: aiSel.value === 'ai' });
      }
      startGame({ victoryMode: setupState.mode, variant: setupState.variant, players });
    };
  }});
}

function startGame(config) {
  game = new Game({
    victoryMode: config.victoryMode, variant: config.variant, players: config.players,
    onLog: renderLog,
  });
  beginDraft();
}

/* ---------------- DRAFT ---------------- */
function beginDraft() {
  const endIds = Object.values(TERRITORIES).filter(t => t.continent === 'end').map(t => t.id);
  const n = game.players.length;
  const picksEach = Math.floor(endIds.length / n);
  const assignments = {};

  if (game.variant === 'fast') {
    // Random deal.
    const pool = [...endIds].sort(() => Math.random() - 0.5);
    let k = 0;
    for (let r = 0; r < picksEach; r++)
      for (let p = 0; p < n; p++) assignments[pool[k++]] = p;
    finishDraft(assignments);
    return;
  }

  // Strategic snake draft.
  const order = [];
  for (let r = 0; r < picksEach; r++) {
    const round = [...Array(n).keys()];
    if (r % 2 === 1) round.reverse();
    order.push(...round);
  }
  draftStep(order, 0, assignments, endIds);
}

function draftStep(order, i, assignments, endIds) {
  if (i >= order.length) { finishDraft(assignments); return; }
  const pIdx = order[i];
  const player = game.players[pIdx];
  const remaining = endIds.filter(id => assignments[id] == null);

  if (player.isAI) {
    // Pick the most-connected / structured End territory.
    let best = remaining[0], bestScore = -1;
    remaining.forEach(id => {
      let s = ADJ[id].filter(e => !e.gateway).length;
      if (TERRITORIES[id].structure) s += 5;
      if (s > bestScore) { bestScore = s; best = id; }
    });
    assignments[best] = pIdx;
    renderDraftBoard(assignments, order, i, `${player.name} drafted ${TERRITORIES[best].name}.`);
    setTimeout(() => draftStep(order, i + 1, assignments, endIds), 450);
  } else {
    UI.mode = 'draft';
    UI._draft = { order, i, assignments, endIds };
    renderDraftBoard(assignments, order, i, `${player.name}: pick an open End territory.`);
  }
}

function onDraftPick(id) {
  const d = UI._draft;
  if (!d || d.assignments[id] != null || TERRITORIES[id].continent !== 'end') return;
  d.assignments[id] = game.players[d.order[d.i]].idx;
  UI.mode = 'idle';
  draftStep(d.order, d.i + 1, d.assignments, d.endIds);
}

function finishDraft(assignments) {
  game.setup(assignments);
  game.player()._sapHeldSince = game.owner['sap_tree'] === 0 ? 1 : null;
  UI.mode = 'idle';
  document.getElementById('overlayHost').innerHTML = '';
  renderLogAll();
  render();
  maybeRunAI();
}

/* ---------------- BOARD RENDERING ---------------- */
function ownerColor(o) {
  if (o === NEUTRAL) return '#7c828c';
  if (o == null) return '#3a3f49';
  return game.players[o].color;
}

// Per-band decorative gradient stops.
const BAND_GRAD = {
  space:     ['#1a1640', '#0a0820'],
  aether:    ['#1d3a52', '#0e2030'],
  overworld: ['#1d3a24', '#0e1c12'],
  nether:    ['#3a1716', '#1c0c0b'],
  end:       ['#2a1640', '#140a22'],
};
// Cache a deterministic starfield for the Space band so it doesn't jitter.
let STAR_FIELD = null;
function starField() {
  if (STAR_FIELD) return STAR_FIELD;
  let s = ''; let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 70; i++) {
    const x = 30 + rnd() * 1190, y = 65 + rnd() * 400, r = 0.6 + rnd() * 1.8, o = 0.3 + rnd() * 0.7;
    s += `<rect class="star" x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${r.toFixed(1)}" height="${r.toFixed(1)}" opacity="${o.toFixed(2)}"/>`;
  }
  STAR_FIELD = s; return s;
}

function buildBoardSVG(opts = {}) {
  const draftMode = opts.draft;
  let s = '';

  // Gradient defs
  s += '<defs>';
  Object.keys(BAND_GRAD).forEach(k => {
    const [a, b] = BAND_GRAD[k];
    s += `<linearGradient id="g_${k}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  });
  s += '</defs>';

  // Bands
  BANDS.forEach(b => {
    const c = CONTINENTS[b.c];
    const locked = c.locked && !draftMode;
    s += `<rect class="band-rect" x="20" y="${b.y0}" width="1210" height="${b.y1 - b.y0}" rx="16"
            fill="url(#g_${b.c})" opacity="${locked ? 0.55 : 1}"/>`;
    if (b.c === 'space') s += starField();
    s += `<text class="band-label" x="40" y="${(b.y0 + b.y1) / 2 + 12}">${c.name}</text>`;
    if (locked) {
      const tok = UNLOCK_REQUIREMENT[b.c];
      s += `<text class="lock-badge" x="${1135}" y="${b.y0 + 36}">🔒</text>`;
      s += `<text x="${940}" y="${b.y0 + 30}" fill="#ffffff66" font-size="14" font-weight="bold">🔒 needs ${TOKENS[tok].name} token</text>`;
    }
  });

  // Edges
  const drawn = new Set();
  EDGES.forEach(e => {
    const [a, b, meta = {}] = e;
    if (meta.skip || !TERRITORIES[a] || !TERRITORIES[b]) return;
    const key = [a, b].sort().join('|');
    if (drawn.has(key)) return; drawn.add(key);
    const A = TERRITORIES[a], B = TERRITORIES[b];
    let cls = 'edge';
    if (meta.gateway) {
      cls += ' gateway';
      const tokHeld = game && !draftMode && game.players[game.current].tokens.has(meta.requires);
      if (!tokHeld) cls += ' locked';
    } else if (meta.gap) cls += ' gap';
    s += `<line class="${cls}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;
  });

  // Nodes (blocky tiles)
  const SZ = 46;
  Object.values(TERRITORIES).forEach(t => {
    const o = draftMode ? (opts.assignments && opts.assignments[t.id]) : game.owner[t.id];
    const col = o == null && draftMode ? '#3a3f49' : ownerColor(o);
    const cnt = draftMode ? '' : (game.armies[t.id] || '');
    const contLocked = CONTINENTS[t.continent].locked && !draftMode;
    let cls = 'terr';
    if (contLocked && (draftMode || game.owner[t.id] !== game.current)) cls += ' dim';
    if (UI.sel === t.id) cls += ' selected';
    else if (UI.targets.has(t.id)) cls += (UI.mode === 'attack' || UI.mode === 'purify') ? ' target' : ' selectable';
    if (draftMode && opts.selectable && opts.selectable.has(t.id)) cls += ' selectable';

    const x = t.x - SZ / 2, y = t.y - SZ / 2;
    const icon = t.structure
      ? `<circle class="struct-glow" cx="${t.x + 17}" cy="${t.y - 16}" r="12"/>
         <text class="struct-icon" x="${t.x + 17}" y="${t.y - 11}" text-anchor="middle">${STRUCT_ICON[t.structure] || '★'}</text>`
      : '';
    const badge = cnt !== ''
      ? `<rect class="badge-bg" x="${t.x - 14}" y="${t.y + 3}" width="28" height="19" rx="6"/>
         <text class="cnt" x="${t.x}" y="${t.y + 17}" text-anchor="middle">${cnt}</text>`
      : '';
    s += `<g class="${cls}" data-id="${t.id}">
            <rect class="ring" x="${x - 5}" y="${y - 5}" width="${SZ + 10}" height="${SZ + 10}" rx="13"/>
            <rect class="tile" x="${x}" y="${y}" width="${SZ}" height="${SZ}" rx="9" fill="${col}"/>
            <rect class="tile-top" x="${x + 4}" y="${y + 4}" width="${SZ - 8}" height="${(SZ - 8) / 2.4}" rx="6" fill="#ffffff"/>
            ${icon}${badge}
            <text class="nm" x="${t.x}" y="${y + SZ + 14}" text-anchor="middle">${t.name}</text>
          </g>`;
  });

  return s;
}

function render() {
  if (!game) return;
  document.getElementById('board').innerHTML = buildBoardSVG();
  renderTopbar();
  renderPhasebar();
  renderControls();
  renderSpecials();
  renderTokens();
  renderCards();
}

function renderDraftBoard(assignments, order, i, hint) {
  const endIds = Object.values(TERRITORIES).filter(t => t.continent === 'end').map(t => t.id);
  const selectable = new Set(endIds.filter(id => assignments[id] == null));
  document.getElementById('board').innerHTML = buildBoardSVG({ draft: true, assignments, selectable });
  document.getElementById('hint').textContent = hint;
  renderTopbar(true);
}

function renderTopbar(draft) {
  document.getElementById('modePill').textContent = 'Mode: ' + game.victoryMode.toUpperCase();
  document.getElementById('roundPill').textContent = draft ? 'Drafting…' : 'Round ' + game.round;
  const p = game.player();
  const pill = document.getElementById('playerPill');
  pill.textContent = (draft ? '' : '▶ ') + p.name + (p.isAI ? ' (CPU)' : '');
  pill.style.color = p.color;
}

function renderPhasebar() {
  const order = ['place', 'attack', 'fortify'];
  document.querySelectorAll('#phasebar .step').forEach(el => {
    el.classList.remove('active', 'done');
    const ph = el.dataset.phase;
    if (ph === game.phase) el.classList.add('active');
    else if (order.indexOf(ph) < order.indexOf(game.phase)) el.classList.add('done');
  });
}

/* ---------------- side controls ---------------- */
function renderControls() {
  const host = document.getElementById('phaseControls');
  const p = game.player();
  if (game.winner != null) { host.innerHTML = ''; return; }
  if (p.isAI) { host.innerHTML = '<span class="help">Computer is thinking…</span>'; setHint(''); return; }

  let html = '';
  if (game.phase === PHASES.PLACE) {
    const done = p.reserve <= 0;
    html = `<button class="btn small" id="autoPlace">Auto-place</button>
            <button class="btn primary" id="donePlace" ${done ? '' : 'disabled'}>Done Placing →</button>`;
    setHint(p.reserve > 0
      ? `Place ${p.reserve} armies — click your territories (Shift-click = 5).`
      : 'All armies placed. Continue to Attack.');
  } else if (game.phase === PHASES.ATTACK) {
    html = `<button class="btn primary" id="endAttack">End Attacks →</button>`;
    if (UI.mode !== 'purify' && UI.mode !== 'card')
      setHint(UI.sel ? `Attacking from ${TERRITORIES[UI.sel].name} — click a red target. (Click it again to deselect.)`
                     : 'Click one of your territories (2+ armies) to attack from.');
  } else if (game.phase === PHASES.FORTIFY) {
    html = `<button class="btn" id="skipFort">Skip</button>
            <button class="btn primary" id="endTurn">End Turn →</button>`;
    if (UI.mode !== 'card')
      setHint(UI.sel ? `Fortify from ${TERRITORIES[UI.sel].name} — click a connected territory you own.`
                     : 'Click a territory to move armies FROM (or Skip).');
  }
  host.innerHTML = html;

  const $ = id => document.getElementById(id);
  if ($('autoPlace')) $('autoPlace').onclick = () => { autoPlace(); };
  if ($('donePlace')) $('donePlace').onclick = () => { game.finishPlacement(); clearSel(); render(); };
  if ($('endAttack')) $('endAttack').onclick = () => { game.phase = PHASES.FORTIFY; clearSel(); render(); };
  if ($('skipFort')) $('skipFort').onclick = () => endHumanTurn();
  if ($('endTurn')) $('endTurn').onclick = () => endHumanTurn();
}

function autoPlace() {
  const p = game.player();
  const borders = game.ownedTerritories(game.current);
  let i = 0;
  while (p.reserve > 0) { game.placeArmy(borders[i % borders.length], 1); i++; }
  render();
}

function renderSpecials() {
  const info = document.getElementById('reserveInfo');
  const p = game.player();
  info.innerHTML = game.phase === PHASES.PLACE
    ? `<b>${p.reserve}</b> armies to place. ${game._lastReinforceDetail ? '<br><span class="legend">' + game._lastReinforceDetail.join(' · ') + '</span>' : ''}`
    : `<span class="legend">${game.heldContinents(game.current).length} of 5 continents held.</span>`;

  const host = document.getElementById('specialBtns');
  if (p.isAI || game.winner != null) { host.innerHTML = ''; return; }
  const r1 = game.round === 1;
  let btns = [];
  const owned = game.ownedTerritories(game.current);
  if (owned.some(id => TERRITORIES[id].structure === 'summon') && p.tokens.has('sapcore') && !p.tokens.has('enderite'))
    btns.push(`<button class="btn small ${r1 ? '' : 'primary'}" id="actSummon" ${r1 ? 'disabled' : ''}>🌀 Activate Summoning</button>`);
  if (p.tokens.has('gravity') && p.tokens.has('cooler') && !p.tokens.has('aether'))
    btns.push(`<button class="btn small primary" id="actCombine" ${r1 ? 'disabled' : ''}>✨ Great Combine</button>`);
  if (owned.some(id => TERRITORIES[id].structure === 'temple') && !game.turnState.specialUsed)
    btns.push(`<button class="btn small" id="actPurify" ${r1 ? 'disabled' : ''}>🧪 Purify (Temple)</button>`);

  host.innerHTML = btns.length ? btns.join('') : (r1 ? '<span class="legend">No special actions in round 1.</span>' : '<span class="legend">No special actions available.</span>');
  const $ = id => document.getElementById(id);
  if ($('actSummon')) $('actSummon').onclick = () => { flash(game.activateSummoning().msg); render(); };
  if ($('actCombine')) $('actCombine').onclick = () => { flash(game.greatCombine().msg); render(); };
  if ($('actPurify')) $('actPurify').onclick = () => { UI.mode = 'purify'; highlightPurifyTargets(); setHint('Purify: click an enemy End territory next to yours.'); render(); };
}

function renderTokens() {
  const host = document.getElementById('tokenList');
  const p = game.player();
  host.innerHTML = Object.keys(TOKENS).map(t =>
    `<span class="token-chip ${p.tokens.has(t) ? '' : 'empty'}" title="${TOKENS[t].desc}">${TOKENS[t].name}</span>`).join('');
}

function renderCards() {
  const host = document.getElementById('cardList');
  const p = game.player();
  if (p.isAI) { host.innerHTML = '<span class="help">—</span>'; return; }
  if (!p.cards.length) { host.innerHTML = 'None yet.'; return; }
  const r1 = game.round === 1;
  host.innerHTML = p.cards.map((cid, i) => {
    const def = CARD_BY_ID[cid];
    return `<div class="card ${r1 ? 'disabled' : ''}" data-ci="${i}" data-cid="${cid}">
              <span class="cname">${def.name}</span> — ${def.text}</div>`;
  }).join('');
  if (r1) return;
  host.querySelectorAll('.card').forEach(el => el.onclick = () => playCardUI(el.dataset.cid));
}

function playCardUI(cid) {
  const def = CARD_BY_ID[cid];
  if (def.kind === 'army_boost' || def.kind === 'gravity') {
    UI.mode = 'card'; UI.cardTarget = cid;
    highlightOwnTargets();
    setHint(`${def.name}: click one of your territories.`); render();
  } else if (def.kind === 'purify') {
    UI.mode = 'card'; UI.cardTarget = cid;
    highlightPurifyTargets();
    setHint('Purification: click an enemy End territory next to yours.'); render();
  } else {
    flash(game.playCard(cid).msg); render();
  }
}

/* ---------------- targeting helpers ---------------- */
function highlightOwnTargets() { UI.targets = new Set(game.ownedTerritories(game.current)); }
function highlightPurifyTargets() {
  UI.targets = new Set();
  game.ownedTerritories(game.current).forEach(id => {
    ADJ[id].forEach(e => {
      const t = TERRITORIES[e.to];
      if (t.continent === 'end' && game.owner[e.to] !== game.current && game.owner[e.to] != null) UI.targets.add(e.to);
    });
  });
}
function clearSel() { UI.sel = null; UI.targets = new Set(); UI.mode = game.phase === PHASES.ATTACK ? 'attack' : (game.phase === PHASES.FORTIFY ? 'fortify' : 'idle'); UI.cardTarget = null; }

/* ---------------- board click ---------------- */
function onBoardClick(ev) {
  const g = ev.target.closest('g.terr');
  if (!g) return;
  const id = g.dataset.id;
  if (UI.busy) return;

  if (UI.mode === 'draft') { onDraftPick(id); return; }
  if (!game || game.winner != null || game.player().isAI) return;

  // Card / purify targeting
  if (UI.mode === 'card') {
    const def = CARD_BY_ID[UI.cardTarget];
    const res = game.playCard(UI.cardTarget, { territory: id });
    flash(res.msg);
    if (res.ok) clearSel();
    render(); return;
  }
  if (UI.mode === 'purify') {
    const res = game.purify(id);
    flash(res.msg);
    if (res.ok) clearSel();
    render(); return;
  }

  if (game.phase === PHASES.PLACE) {
    if (game.owner[id] === game.current && game.player().reserve > 0) {
      const before = game.player().reserve;
      game.placeArmy(id, ev.shiftKey ? 5 : 1);
      const placed = before - game.player().reserve;
      render();
      FX.play('place');
      const t = TERRITORIES[id];
      FX.floatText(t.x, t.y - 28, '+' + placed, game.player().color, 20);
      FX.flashNode(id, '#ffffff');
    }
    return;
  }

  if (game.phase === PHASES.ATTACK) { handleAttackClick(id); return; }
  if (game.phase === PHASES.FORTIFY) { handleFortifyClick(id); return; }
}

function handleAttackClick(id) {
  // Select source
  if (game.owner[id] === game.current) {
    if (game.armies[id] < 2 || game.attackableFrom(id).length === 0) {
      flash('No valid attacks from there.'); return;
    }
    UI.sel = id; UI.mode = 'attack';
    UI.targets = new Set(game.attackableFrom(id));
    render(); return;
  }
  // Attack target
  if (UI.sel && UI.targets.has(id)) {
    doAttack(UI.sel, id);
  }
}

function doAttack(from, to) {
  const res = game.attack(from, to);
  if (!res) { flash('Attack not allowed.'); return; }
  showCombat(res, () => {
    if (res.captured) {
      askMoveIn(res, (move) => {
        game.resolveCapture(from, to, move);
        const t = TERRITORIES[to];
        FX.play('capture');
        FX.burst(t.x, t.y, game.player().color, 18, 75);
        FX.floatText(t.x, t.y - 32, 'CAPTURED', '#5ad65a', 15);
        afterAction();
        // keep attacking from the new territory if possible
        if (game.winner == null) {
          UI.sel = to;
          UI.targets = new Set(game.attackableFrom(to));
          if (!UI.targets.size) clearSel();
          render();
        }
      });
    } else {
      // refresh selection (source may now be too weak)
      if (game.armies[from] < 2 || !game.attackableFrom(from).length) clearSel();
      else UI.targets = new Set(game.attackableFrom(from));
      afterAction();
    }
  });
}

function afterAction() {
  if (game.winner != null) { render(); showWin(); return; }
  render();
}

function handleFortifyClick(id) {
  if (!UI.sel) {
    if (game.owner[id] === game.current && game.armies[id] > 1) {
      UI.sel = id; UI.mode = 'fortify';
      UI.targets = new Set(game.ownedTerritories(game.current).filter(t => t !== id && game.connected(id, t, game.current)));
      if (!UI.targets.size) { flash('Nowhere connected to fortify.'); UI.sel = null; }
      render();
    }
    return;
  }
  if (id === UI.sel) { clearSel(); render(); return; }
  if (UI.targets.has(id)) {
    const max = game.armies[UI.sel] - 1;
    askCount(`Move how many from ${TERRITORIES[UI.sel].name} to ${TERRITORIES[id].name}?`, 1, max, max, (n) => {
      const res = game.fortify(UI.sel, id, n);
      flash(res.ok ? 'Fortified.' : res.msg);
      clearSel(); render();
    });
  }
}

/* ---------------- combat / count modals ---------------- */
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function mkDie(parent, cls) {
  const d = document.createElement('div');
  d.className = 'die-face ' + cls;
  for (let i = 0; i < 9; i++) {
    const c = document.createElement('div'); c.className = 'cell';
    const dot = document.createElement('div'); dot.className = 'dot';
    c.appendChild(dot); d.appendChild(c);
  }
  parent.appendChild(d); return d;
}
function setDie(el, v) {
  const on = new Set(PIPS[v] || []);
  [...el.children].forEach((c, i) => c.classList.toggle('on', on.has(i)));
}

function showCombat(res, done) {
  const fromN = TERRITORIES[res.from].name, toN = TERRITORIES[res.to].name;
  const html = `
    <div class="combat-head"><h2>⚔️ ${fromN} → ${toN}</h2></div>
    <div class="dice-row"><span class="label atk">ATTACK</span><div class="dice-set" id="aSet"></div></div>
    <div class="dice-row"><span class="label def">DEFEND</span><div class="dice-set" id="dSet"></div></div>
    <div class="combat-result" id="cres">🎲 Rolling…</div>
    <div class="btn-row" style="margin-top:14px;"><button class="btn primary" id="cbOk" disabled>Continue</button></div>`;
  openModal(html, { onOpen: h => {
    const aSet = h.querySelector('#aSet'), dSet = h.querySelector('#dSet');
    const aEls = res.aDice.map(() => mkDie(aSet, 'atk'));
    const dEls = res.dDice.map(() => mkDie(dSet, 'def'));
    if (!aEls.length) aSet.innerHTML = '<span class="legend">—</span>';
    if (!dEls.length) dSet.innerHTML = '<span class="legend">—</span>';
    const all = aEls.concat(dEls);
    all.forEach(e => e.classList.add('rolling'));
    FX.play('dice');
    let ticks = 0;
    const iv = setInterval(() => {
      all.forEach(e => setDie(e, 1 + Math.floor(Math.random() * 6)));
      if (ticks++ % 3 === 0) FX.play('dice');
    }, 70);
    setTimeout(() => {
      clearInterval(iv);
      all.forEach(e => e.classList.remove('rolling'));
      res.aDice.forEach((v, i) => setDie(aEls[i], v));
      res.dDice.forEach((v, i) => setDie(dEls[i], v));
      const cmp = Math.min(res.aDice.length, res.dDice.length);
      for (let i = 0; i < cmp; i++) {
        if (res.aDice[i] > res.dDice[i]) { aEls[i].classList.add('win'); dEls[i].classList.add('lose'); }
        else { dEls[i].classList.add('win'); aEls[i].classList.add('lose'); }
      }
      FX.play('hit');
      const ft = TERRITORIES[res.to], ff = TERRITORIES[res.from];
      if (res.defenderLosses) { FX.burst(ft.x, ft.y, '#ff5a52', 8, 42); FX.floatText(ft.x, ft.y - 22, '-' + res.defenderLosses, '#ff5a52', 22); FX.flashNode(res.to, '#ff5a52'); }
      if (res.attackerLosses) { FX.floatText(ff.x, ff.y - 22, '-' + res.attackerLosses, '#ffae42', 22); FX.flashNode(res.from, '#ffae42'); }
      h.querySelector('#cres').innerHTML =
        `Attacker loses <b>${res.attackerLosses}</b> · Defender loses <b>${res.defenderLosses}</b>` +
        `${res.note ? '<br><span style="color:#9ad">' + res.note + '</span>' : ''}` +
        `${res.captured ? '<br><span class="cap">▶ TERRITORY CAPTURED!</span>' : ''}`;
      const ok = h.querySelector('#cbOk'); ok.disabled = false; ok.focus();
      ok.onclick = () => { closeModal(); done(); };
    }, 760);
  }});
}
function askMoveIn(res, done) {
  const min = res.minMove, max = res.maxMove;
  if (max <= min) { closeModalThen(() => done(max)); return; }
  const bonus = res.endesertBonus ? ' (Endesert: +1 may move in)' : '';
  askCount(`Move armies into ${TERRITORIES[res.to].name}${bonus}?`, min, max, max, done);
}
function closeModalThen(fn) { closeModal(); fn(); }
function askCount(title, min, max, def, done) {
  const html = `
    <h2>${title}</h2>
    <div class="range-row"><input type="range" id="cnt" min="${min}" max="${max}" value="${def}">
      <b id="cntLbl" style="min-width:30px;text-align:center;font-size:18px;">${def}</b></div>
    <div class="btn-row" style="margin-top:14px;"><button class="btn primary" id="ok">Confirm</button></div>`;
  openModal(html, { onOpen: h => {
    const r = h.querySelector('#cnt'), l = h.querySelector('#cntLbl');
    r.oninput = () => l.textContent = r.value;
    h.querySelector('#ok').onclick = () => { closeModal(); done(+r.value); };
  }});
}

/* ---------------- turn flow / AI ---------------- */
function announceTurn() {
  const p = game.player();
  const b = document.getElementById('turnBanner');
  if (!b) return;
  b.textContent = `${p.name}${p.isAI ? ' (CPU)' : ''}  ·  Round ${game.round}`;
  b.style.borderColor = p.color;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

/* Single entry point for the start of any player's turn. */
function beginCurrentTurn() {
  if (game.winner != null) { render(); showWin(); return; }
  clearSel();
  announceTurn();
  render();
  if (game.player().isAI) runAITurn();
}

function runAITurn() {
  UI.busy = true; render();
  setTimeout(() => {
    aiTakeTurn(game);
    render();
    if (game.winner != null) { UI.busy = false; showWin(); return; }
    setTimeout(() => {
      game.endTurn();
      UI.busy = false;
      beginCurrentTurn();
    }, 700);
  }, 650);
}

function endHumanTurn() {
  clearSel();
  game.endTurn();
  beginCurrentTurn();
}
// Back-compat alias used by finishDraft.
function maybeRunAI() { beginCurrentTurn(); }

/* ---------------- win ---------------- */
function showWin() {
  const w = game.players[game.winner];
  const html = `
    <div class="modal-inner">
    <div class="trophy">🏆</div>
    <h1 style="text-align:center"><span class="mc">VICTORY!</span></h1>
    <h2 style="color:${w.color}; text-align:center">${w.name} wins the ${game.victoryMode.toUpperCase()} game.</h2>
    <p class="help" style="text-align:center">${game.log.filter(e => e.cls === 'win').slice(-1)[0]?.msg || ''}</p>
    <p style="text-align:center">${game.alivePlayers().length} explorer(s) remaining across ${Object.keys(TERRITORIES).length} territories.</p>
    <div class="btn-row" style="margin-top:16px; justify-content:center;">
      <button class="btn primary" id="again">New Game</button>
      <button class="btn" id="closeWin">Review Board</button>
    </div></div>`;
  const host = openModal(html, { onOpen: h => {
    h.querySelector('#again').onclick = showSetup;
    h.querySelector('#closeWin').onclick = closeModal;
  }});
  const modal = host.querySelector('.modal');
  if (modal) modal.classList.add('win-modal');
  FX.play('win');
  // Confetti bursts across the board.
  let n = 0;
  const confetti = setInterval(() => {
    const x = 80 + Math.random() * 1080, y = 80 + Math.random() * 1500;
    FX.burst(x, y, [w.color, '#ffd23f', '#5ad65a', '#49b6ff'][n % 4], 10, 90);
    if (++n > 14) clearInterval(confetti);
  }, 180);
}

/* ---------------- log ---------------- */
function renderLog(entry) {
  const host = document.getElementById('log');
  if (!host) return;
  const div = document.createElement('div');
  div.className = 'e ' + (entry.cls || '');
  div.textContent = entry.msg;
  host.appendChild(div);
  host.scrollTop = host.scrollHeight;
  // Audio cues for milestone events (skip while replaying history at setup).
  if (!UI._replaying && typeof FX !== 'undefined') {
    if (entry.cls === 'unlock') FX.play('unlock');
    else if (entry.cls === 'token') FX.play('token');
    else if (entry.cls === 'win') FX.play('win');
  }
}
function renderLogAll() {
  const host = document.getElementById('log');
  host.innerHTML = '';
  UI._replaying = true;
  game.log.forEach(renderLog);
  UI._replaying = false;
}

/* ---------------- misc ---------------- */
let _flashTimer = null;
function flash(msg) { if (msg) setHint(msg); }
function setHint(msg) { const el = document.getElementById('hint'); if (el) el.textContent = msg; }

/* ---------------- rules ---------------- */
function showRules() {
  const html = `
    <h1>How to Play</h1>
    <div class="scroll-y">
    <p class="help">A territory-control war game with a campaign climb. Start in the End and unlock your way up the world stack to the Moon.</p>
    <h3>Your turn (in order)</h3>
    <ol>
      <li><b>Reinforce</b> — get armies = territories ÷ 3 (min 3), plus continent & structure bonuses.</li>
      <li><b>Place</b> them on territories you hold.</li>
      <li><b>Special action</b> (one per turn) — Activate Summoning, Great Combine, or Purify.</li>
      <li><b>Attack</b> adjacent enemies with dice.</li>
      <li><b>Fortify</b> once — move armies along a connected path you own.</li>
    </ol>
    <h3>Dice combat</h3>
    <p>Attacker rolls up to 3 dice (needs 2+ armies, leaves 1 behind). Defender rolls up to 2. Compare highest vs highest, then second vs second. <b>Ties go to the defender.</b> Empty the defender to capture.</p>
    <h3>The unlock path (tokens are permanent keys)</h3>
    <table class="rules">
      <tr><th>Step</th><th>How</th><th>Unlocks</th></tr>
      <tr><td>Sap Core</td><td>Hold the Sap Tree Region a full turn</td><td>—</td></tr>
      <tr><td>Enderite</td><td>Activate the Summoning Structure (needs Sap Core)</td><td>🔓 Nether</td></tr>
      <tr><td>Cooler</td><td>Capture the Freezing Anomaly</td><td>🔓 Overworld</td></tr>
      <tr><td>Gravity</td><td>Capture the Mountains</td><td>—</td></tr>
      <tr><td>Aether (Great Combine)</td><td>Have Gravity + Cooler, then Combine</td><td>🔓 Aether + Fly Over</td></tr>
      <tr><td>Space Access</td><td>Control the Sky Ruins (Aether Gate)</td><td>🔓 Space</td></tr>
      <tr><td>Moon</td><td>Take the Moon Crater, then the Moon Summit</td><td>Final objective</td></tr>
    </table>
    <h3>Winning</h3>
    <ul>
      <li><b>Classic</b>: eliminate every rival.</li>
      <li><b>Domination</b>: hold all five continents at once.</li>
      <li><b>Lore</b>: hold all continents, take the Moon Summit, and still hold it at the start of your next turn. The Moon defends with +1 die (and +1 more if you also hold the Crater).</li>
    </ul>
    <h3>Special territories</h3>
    <p class="help">🏛️ End Temple +1 & Purify · 🌳 Sap Tree · 🌀 Summoning · ❄️ Freezing Anomaly (Cooler, defends) · ⛰️ Mountains (Gravity, reroll) · 🏘️ Village +1 · ☁️ Sky Ruins (draw + Space) · 🪐 Red Planet (draw +2) · 🌑 Moon Crater · 🌕 Moon Summit · 🏜️ Endesert (+1 army on capture).</p>
    <p class="legend"><b>Dashed purple</b> lines are dimension gateways (need a token). <b>Dotted blue</b> lines are Aether gaps (need Fly Over / Aether token).</p>
    </div>
    <div class="btn-row" style="margin-top:14px;"><button class="btn primary" id="closeR">Got it</button></div>`;
  openModal(html, { onOpen: h => h.querySelector('#closeR').onclick = () => { closeModal(); if (!game) showSetup(); } });
}
