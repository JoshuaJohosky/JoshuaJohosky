/* =====================================================================
 * Effects — Web Audio sound synthesis + SVG particle / floating-text FX.
 * No external assets: every sound is generated on the fly. All FX are
 * appended into the board SVG so they share its coordinate space.
 * ===================================================================== */

const FX = (() => {
  let ctx = null;
  let soundOn = true;

  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setSound(on) { soundOn = on; }
  function isOn() { return soundOn; }

  /* One synthesized blip. */
  function tone(freq, dur, type = 'square', gain = 0.12, slideTo = null) {
    if (!soundOn) return;
    const a = ac(); if (!a) return;
    const t0 = a.currentTime;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(a.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain = 0.08) {
    if (!soundOn) return;
    const a = ac(); if (!a) return;
    const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource(); src.buffer = buf;
    const g = a.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(a.destination); src.start();
  }

  // Sound library
  const sfx = {
    click:   () => tone(440, 0.05, 'square', 0.05),
    place:   () => tone(330, 0.08, 'square', 0.08, 520),
    dice:    () => { noise(0.12, 0.05); tone(220, 0.08, 'triangle', 0.04); },
    hit:     () => { noise(0.1, 0.09); tone(160, 0.1, 'sawtooth', 0.06, 90); },
    capture: () => { tone(523, 0.09, 'square', 0.1); setTimeout(() => tone(784, 0.12, 'square', 0.1), 90); },
    token:   () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.09), i * 70)); },
    unlock:  () => { [392, 523, 659, 880, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'square', 0.09), i * 80)); },
    win:     () => { [523, 659, 784, 1047, 1319, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'square', 0.1), i * 130)); },
    lose:    () => { [330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'sawtooth', 0.08), i * 130)); },
  };
  function play(name) { if (sfx[name]) sfx[name](); }

  /* ---- SVG particle burst ---- */
  function svgEl(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function getLayer() {
    const board = document.getElementById('board');
    if (!board) return null;
    let layer = board.querySelector('#fxLayer');
    if (!layer) { layer = svgEl('g', { id: 'fxLayer' }); board.appendChild(layer); }
    return layer;
  }

  function burst(x, y, color = '#ffd23f', count = 14, spread = 60) {
    const layer = getLayer(); if (!layer) return;
    const parts = [];
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = spread * (0.5 + Math.random());
      const p = svgEl('rect', { x: x - 3, y: y - 3, width: 6, height: 6, rx: 1, fill: color, opacity: 1 });
      layer.appendChild(p);
      parts.push({ el: p, vx: Math.cos(ang) * dist, vy: Math.sin(ang) * dist });
    }
    const t0 = performance.now();
    function step(now) {
      const k = Math.min(1, (now - t0) / 520);
      parts.forEach(pt => {
        const px = x + pt.vx * k, py = y + pt.vy * k + 40 * k * k;
        pt.el.setAttribute('x', px - 3); pt.el.setAttribute('y', py - 3);
        pt.el.setAttribute('opacity', 1 - k);
        pt.el.setAttribute('transform', `rotate(${k * 360} ${px} ${py})`);
      });
      if (k < 1) requestAnimationFrame(step);
      else parts.forEach(pt => pt.el.remove());
    }
    requestAnimationFrame(step);
  }

  /* ---- Floating text (e.g. "+3", "-1") ---- */
  function floatText(x, y, text, color = '#fff', size = 26) {
    const layer = getLayer(); if (!layer) return;
    const t = svgEl('text', {
      x, y, 'text-anchor': 'middle', fill: color, 'font-size': size,
      'font-family': "'Press Start 2P', monospace", 'paint-order': 'stroke',
      stroke: '#000', 'stroke-width': 4, opacity: 1,
    });
    t.textContent = text;
    layer.appendChild(t);
    const t0 = performance.now();
    function step(now) {
      const k = Math.min(1, (now - t0) / 900);
      t.setAttribute('y', y - 50 * k);
      t.setAttribute('opacity', 1 - k);
      if (k < 1) requestAnimationFrame(step); else t.remove();
    }
    requestAnimationFrame(step);
  }

  /* Briefly flash a node's blocky tile. */
  function flashNode(id, color) {
    const tile = document.querySelector(`g.terr[data-id="${id}"] .tile`);
    if (!tile) return;
    tile.classList.remove('hitflash'); void tile.offsetWidth;
    if (color) tile.style.setProperty('--flash', color);
    tile.classList.add('hitflash');
  }

  return { play, burst, floatText, flashNode, setSound, isOn };
})();

if (typeof module !== 'undefined') module.exports = { FX };
