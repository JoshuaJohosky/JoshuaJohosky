# RISK: Minecraft Global Domination 🟥🟩

A complete, playable browser version of the fan-made **RISK · Minecraft Global
Domination** board game — a territory-control war game with a campaign climb
from **the End all the way to the Moon**.

> Unofficial fan-made prototype. Not for sale. Not connected to the official
> creators of *Risk* or *Minecraft*.

## ▶ Play

No build step, no dependencies — it's plain HTML/CSS/JavaScript.

```bash
# from this folder
python3 -m http.server 8000      # or: npm run serve
# then open http://localhost:8000/
```

Or just open `index.html` directly in any modern browser.

## 🎮 What you get

- **The full world stack** — 53 territories across 5 continents (The End,
  The Nether, Overworld, The Aether, Space) plus the **Moon**, drawn as a
  clickable SVG board you climb from bottom to top.
- **Three victory modes** — Classic (eliminate everyone), Domination (hold all
  five continents), and **Lore** (the full End-to-Moon adventure: hold every
  continent, take the Moon Summit, and keep it to your next turn).
- **Dice combat** exactly per the rulebook — attacker up to 3 dice, defender up
  to 2, ties to the defender, highest-vs-highest then second-vs-second.
- **The dimension unlock path** — earn permanent **tokens** (Sap Core →
  Enderite → Cooler → Gravity → Aether → Space Access) that act as keys and
  light up new continents as you progress.
- **Reward cards** — Army Boost, Fortify Move, Purification, Cooler, Gravity
  Shift, Fly Over, Moon Signal — drawn from milestones (never an instant win).
- **Special territories with real rules** — End Temple (+1 & Purify), Sap Tree,
  Summoning Structure, Freezing Anomaly (Cooler site, removes an attack die),
  Mountains (Gravity site, defensive reroll), Village (+1), Sky Ruins (draw +
  Space access), Red Planet (draw + 2 armies), Endesert (+1 army on capture),
  and the **Moon Crater / Moon Summit fortress** (+1 / +2 defense dice).
- **2–6 players**, any mix of humans and **heuristic AI opponents**.
- **Setup variants** — Strategic draft, Fast deal, and Chaos (Nether open from
  the start).
- Continent bonuses, neutral armies, the First-Round rule, elimination, and the
  Section-18 tiebreaker are all implemented.

## 🕹️ How a turn works

1. **Reinforce** — armies = territories ÷ 3 (min 3) + continent & structure bonuses.
2. **Place** them on territories you hold (Shift-click drops 5 at a time).
3. **Special action** (one per turn) — Activate Summoning, Great Combine, Purify, or play a card.
4. **Attack** adjacent enemies; resolve a capture by choosing how many armies move in.
5. **Fortify** once along a connected path you own, then **End Turn**.

Click the **Rules** button in-game for the full reference, including the unlock
path table and special-territory list.

## 🧪 Tests

```bash
npm install      # installs jsdom (only needed for the DOM smoke test)
npm test         # engine simulation: combat, unlock path, all victory modes
npm run smoke    # headless DOM test: drives the real UI end-to-end
npm run verify   # both
```

- `test.js` runs many all-AI games across every mode/player-count and verifies
  every unlock-path mechanic deterministically (23 checks).
- `smoke.js` loads the real page in jsdom and drives placement, attack/capture,
  fortify, AI turns, cards, the rules modal, and the win screen (16 checks).

## 📐 Rulebook interpretation (filling the prototype's gaps)

The source rulebook is an early prototype with a few under-specified spots.
This implementation makes them concrete and consistent (and documents them in
the in-game Rules panel):

| Rulebook gap | Decision in this build |
|---|---|
| Which territory is the "Cooler Site"? | **Freezing Anomaly** (it's the icy Nether biome). Capturing it grants the Cooler token. |
| Which territory is the "Gravity Site"? | **Mountains** (Overworld). Capturing it grants the Gravity token. |
| How is the **Overworld** unlocked? (path skips it) | Gaining the **Cooler** token opens the Overworld water routes. |
| Prerequisites for the **Great Combine** → Aether | Requires the **Gravity** *and* **Cooler** tokens; performing it grants the Aether token (access + Fly Over). |
| Source of **Space Access** | Controlling the **Sky Ruins** (the Aether Gate). |
| Endless stalemates in Classic mode | A generous **round limit** resolves the game by the rulebook's Section-18 tiebreaker (Moon → continents → territories → armies), so a game always ends. |

## 🗂️ Code layout

```
index.html        page shell
css/style.css     blocky Minecraft-flavoured styling
js/data.js        continents, 53 territories, adjacency, gateways, tokens
js/cards.js       reward-card definitions + weighted draw
js/engine.js      rules engine: setup, reinforcement, combat, fortify,
                  unlock path, special actions, win/tiebreaker logic
js/ai.js          heuristic AI opponent
js/app.js         board rendering + interaction state machine + flow
test.js           engine simulation suite (Node)
smoke.js          headless DOM suite (jsdom)
```
