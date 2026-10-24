#!/usr/bin/env node
/**
 * Compares the remake's sound with the original's — edge by edge in T-states.
 *
 *   ./tools/matchsound.mjs [--verbose]
 *
 * ★ The reference is `tools/tracesound.py`: the real code from the tape in a
 * Z80 simulator (SkoolKit) and every `OUT` to port `$FE`. The remake is **the
 * code that plays in the browser**: `app/bootySound.js` fed with
 * `data/global.json#sounds` (`tools/mksounds.py`). Checked:
 *
 * 1. **the interrupt handler path by path** (`build/sound/paths.json`): the tune
 *    on every entry of the `$FA00` table and on `$FF`, the slots `$FFFB`+`$FFFC`,
 *    `$FFFF`, `$FFFD` (noise, even past the end of ROM), `$FFFE` 1–8, at
 *    various phases of `$FE88` – every `OUT` (T from the entry at `$FE69` and
 *    bit 4), the length up to `RET` and the memory the handler changed
 *    (`$FE88`, `$FFF9`, `$FE86`, `$FFFB`–`$FFFF`)
 * 2. **ROM `BEEPER`** with the game's parameters – every `OUT` and the length;
 *    **drowning** `$E361` (from the main loop, lengths from the generator
 *    `$E349`) for several states of `$F343` – every `OUT`, the length and the
 *    generator's state after it
 * 3. **the tune on the title** (`build/sound/title.json`): handler by handler
 *    the state (`$FE88`, `$FFF9`, `$FE86`), the edges from its entry and **the
 *    frame in which the next one comes** – that shows which interrupts a long
 *    note overruns and loses. Where exactly inside the frame the handler
 *    starts depends on the main-loop instruction the interrupt catches (a few
 *    T) – so the frame and the edges from the entry are compared, not the
 *    absolute T.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { readSection } from './jsonformat.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const verbose = process.argv.includes('--verbose');

function load(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) {
    console.error(`${file} is missing – run ./tools/tracesound.py and ./tools/mksounds.py`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function main() {
  const { BootySound } = await import(url.pathToFileURL(path.join(ROOT, 'app/bootySound.js')).href);
  const data = readSection('sounds');
  if (!data) {
    console.error('data/global.json#sounds is missing – run ./tools/tracesound.py and ./tools/mksounds.py');
    process.exit(2);
  }
  const paths = load('build/sound/paths.json');
  const title = load('build/sound/title.json');
  const sound = new BootySound(data);
  const base = paths.state;
  const tuneIndex = (addr) => (addr-0xFA00)/4;

  let checks = 0, diffs = 0;
  const firsts = [];
  const check = (what, got, want) => {
    checks++;
    if (got !== want) {
      diffs++;
      if (firsts.length < 10) { firsts.push(`${what}: remake ${got}, original ${want}`); }
    }
  };

  // 1. the handler, path by path
  let cases = 0;
  for (const [name, c] of Object.entries(paths.handler)) {
    const s = c.setup;
    const v = (k, d) => (k in s ? s[k] : d);
    const fff9 = v('FFF9', base.FFF9 & 0xFF) | (v('FFFA', base.FFF9 >> 8) << 8);
    sound.state = {
      fe88: v('FE88', base.FE88), tuneOn: v('FFF8', base.FFF8), tune: tuneIndex(fff9),
      fe86: v('FE86', base.FE86 & 0xFF) | (v('FE87', base.FE86 >> 8) << 8),
      fffb: v('FFFB', 0), fffc: v('FFFC', 0), fffd: v('FFFD', 0), fffe: v('FFFE', 0), ffff: v('FFFF', 0)
    };
    const outs = [];
    const length = sound.handler(0, outs);
    check(`${name}: number of OUTs`, outs.length, c.outs.length);
    for (let i = 0; i < Math.min(outs.length, c.outs.length); i++) {
      check(`${name}: OUT ${i} T`, outs[i][0], c.outs[i][0]);
      check(`${name}: OUT ${i} bit`, outs[i][1], c.outs[i][1]);
    }
    check(`${name}: length`, length, c.tstates);
    const st = sound.state, a = c.after;
    check(`${name}: $FE88`, st.fe88, a.FE88);
    check(`${name}: $FFF9`, 0xFA00+4*st.tune, a.FFF9);
    check(`${name}: $FE86`, st.fe86, a.FE86);
    for (const k of ['FFFB', 'FFFC', 'FFFD', 'FFFE', 'FFFF']) {
      check(`${name}: $${k}`, st[k.toLowerCase()], a[k]);
    }
    cases++;
  }
  console.log(`handler: ${cases} paths`);

  // 2. ROM BEEPER
  for (const [name, b] of Object.entries(paths.beeper)) {
    const outs = [];
    const length = sound.romBeeper(0, b.de, b.hl, outs);
    check(`BEEPER ${name}: number of OUTs`, outs.length, b.outs.length);
    for (let i = 0; i < Math.min(outs.length, b.outs.length); i++) {
      check(`BEEPER ${name}: OUT ${i} T`, outs[i][0], b.outs[i][0]);
      check(`BEEPER ${name}: OUT ${i} bit`, outs[i][1], b.outs[i][1]);
    }
    check(`BEEPER ${name}: length`, length, b.tstates);
  }
  console.log(`BEEPER: ${Object.keys(paths.beeper).length} calls`);

  // 2b. drowning ($E361 to $E3A3), from the main loop
  for (const [name, d] of Object.entries(paths.drown || {})) {
    const made = sound.drown(d.seed);
    check(`drowning ${name}: number of OUTs`, made.outs.length, d.outs.length);
    for (let i = 0; i < Math.min(made.outs.length, d.outs.length); i++) {
      check(`drowning ${name}: OUT ${i} T`, made.outs[i][0], d.outs[i][0]);
      check(`drowning ${name}: OUT ${i} bit`, made.outs[i][1], d.outs[i][1]);
    }
    check(`drowning ${name}: length`, made.length, d.tstates);
    check(`drowning ${name}: $F343 after`, made.seed, d.after);
  }
  console.log(`drowning: ${Object.keys(paths.drown || {}).length} seeds`);

  // 3. the tune on the title, handler by handler
  const F = BootySound.FRAME;
  const entries = title.entries, edges = title.edges;
  const e0 = entries[0];
  sound.state = {fe88: e0[1], tuneOn: base.FFF8, tune: tuneIndex(e0[2]), fe86: e0[3],
                 fffb: 0, fffc: 0, fffd: 0, fffe: 0, ffff: 0};
  let level = title.level === null ? 1 : title.level, e = 0;
  // the level before the first handler: the last change before it
  while (e < edges.length && edges[e][0] < e0[0]) { level = edges[e][1]; e++; }
  let lost = 0;
  for (let i = 0; i+1 < entries.length; i++) {
    const [t, fe88, fff9, fe86] = entries[i];
    check(`handler ${i}: $FE88`, sound.state.fe88, fe88);
    check(`handler ${i}: $FFF9`, 0xFA00+4*sound.state.tune, fff9);
    check(`handler ${i}: $FE86`, sound.state.fe86, fe86);
    const outs = [];
    const end = t+sound.handler(t, outs);
    // changes of the level, as the trace logs them
    const mine = [];
    for (const [ot, bit] of outs) {
      if (bit !== level) { level = bit; mine.push(ot); }
    }
    const theirs = [];
    while (e < edges.length && edges[e][0] < entries[i+1][0]) { theirs.push(edges[e][0]); e++; }
    check(`handler ${i}: number of edges`, mine.length, theirs.length);
    for (let k = 0; k < Math.min(mine.length, theirs.length); k++) {
      check(`handler ${i}: edge ${k}`, mine[k]-t, theirs[k]-t);
    }
    // the next interrupt: taken at the frame after the end (or while INT is
    // still held), the ones the handler overran are lost
    const kNext = Math.floor((end-BootySound.INT_ACTIVE)/F)+1;
    const next = entries[i+1][0];
    check(`handler ${i}: frame of the next handler`, kNext, Math.floor((next-BootySound.ACCEPT)/F));
    lost += kNext-Math.floor(t/F)-1;
  }
  console.log(`title: ${entries.length-1} handlers, ${edges.length} edges, ${lost} lost interrupts`);

  if (firsts.length) {
    console.log('first differences:');
    firsts.forEach((f) => console.log('  '+f));
  }
  console.log(`total ${checks} checks, **${diffs} differences**`);
  process.exit(diffs ? 1 : 0);
}

main();
