/* Render the real page in headless Chromium and capture screenshots. */
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1024, deviceScaleFactor: 1 });
  const url = 'file://' + path.join(__dirname, 'index.html');
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1200));

  // 1) Setup screen
  await page.screenshot({ path: 'shot-setup.png' });
  console.log('saved shot-setup.png');

  // 2) Start a game and capture the board
  await page.evaluate(() => {
    startGame({
      victoryMode: 'lore', variant: 'fast',
      players: [{ name: 'You', isAI: false }, { name: 'Creeper', isAI: true }, { name: 'Enderman', isAI: true }],
    });
    // give the human some tokens so locked bands render unlocked for the shot
    game.players[0].tokens.add('enderite'); game.players[0].tokens.add('cooler');
    render();
  });
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: 'shot-board.png' });
  console.log('saved shot-board.png');

  // 3) Trigger a combat modal to capture animated dice (settled state)
  await page.evaluate(() => {
    const g = game;
    const from = g.ownedTerritories(0).find(id => g.armies[id] >= 2) || g.ownedTerritories(0)[0];
    g.armies[from] = 8;
    const adj = ADJ[from].map(e => e.to).filter(t => g.owner[t] !== 0);
    const to = adj[0];
    g.owner[to] = 1; g.armies[to] = 2;
    g.phase = 'attack';
    doAttack(from, to);
  });
  await new Promise(r => setTimeout(r, 1100)); // wait past the ~760ms roll
  await page.screenshot({ path: 'shot-combat.png' });
  console.log('saved shot-combat.png');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
