#!/usr/bin/env node
/**
 * Compares the remake's hidden mini-game with the original — pass by pass.
 *
 *   ./tools/matchgoldfish.mjs [--ink] [--verbose]
 *
 * ★ The reference is `tools/tracegoldfish.py`: the real code from the tape in
 * a Z80 simulator, the mini-game started through a POKE, with no keys, and
 * after every pass `$CF36` the screen, sprite buffers, variables, objects,
 * the diver, the sand and the bubbles. The remake is `app/goldfishLogic.js`,
 * **the code that runs in SECRET SUB GAME** (`app/subGameWorker.js`), run
 * from the memory it starts from (`data/global.json#goldfish`, data regions
 * only – whatever the port would read elsewhere shows up – and the ROM font
 * at `$3D00`), with the diver's animation and rows 22–23 printed as in the
 * original (`animateDiver`, `panel`).
 *
 * Two runs: **idle** (no keys, memory from `data/global.json#goldfish`) and
 * **keys** (`tracegoldfish.py --keys`, `build/goldfish-keys/`): randomly held
 * diver keys, what ROM `KEY-SCAN` returned, replayed into the port through
 * `input` (`$D579`) – the diver's movement and erasing, a catch, a collision
 * with the big fish.
 *
 * Everything is checked after every pass, byte by byte – rows 22–23 too
 * (FISH, the fish count `$CFA8`, the AIR gauge `$D2F8`). The menu runs the
 * same code without the diver and without fish (`diver: false`, `objects:
 * false`) and writes its own rows 22–23.
 *
 * `--ink` runs both with the **ink plane** (`inkPlane`, R-036, as SECRET SUB
 * GAME does under `ScreenLayout.TRUE_COLOUR`): the memory must still match to
 * the byte (the plane sits *beside* it), only lit pixels may have an owner,
 * and it prints how many lit pixels have an ink other than the one their
 * cell would give them – zero would mean the plane is not being filled
 * (DESIGN-inkplane.md §5).
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { readSection } from './jsonformat.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require = createRequire(import.meta.url);
const verbose = process.argv.includes('--verbose');
const withInk = process.argv.includes('--ink');

function hex(v, n = 4) { return '$'+v.toString(16).toUpperCase().padStart(n, '0'); }

/**
 * One recorded run against the port.
 * @param {string} name - Its name.
 * @param {string} base - The directory of tracegoldfish.py's output.
 * @param {Uint8Array} memory - The memory the port starts from.
 * @param {Function} GoldfishLogic - The port.
 */
function runRecord(name, base, memory, GoldfishLogic) {
  const info = JSON.parse(fs.readFileSync(path.join(base, 'info.json'), 'utf8'));
  const regions = info.regions;
  const size = regions.reduce((sum, [lo, hi]) => sum+hi-lo, 0);
  const passes = zlib.gunzipSync(fs.readFileSync(path.join(base, 'passes.xor.gz')));
  for (let i = size; i < passes.length; i++) { passes[i] ^= passes[i-size]; }
  // the keys KEY-SCAN gave, mapped through the game's own codes ($5BEB-$5BEE:
  // left, right, up, down) — the original's `$D579`
  let pass = 0;
  const codes = [memory[0x5BEB], memory[0x5BEC], memory[0x5BED], memory[0x5BEE]];
  const input = info.keys ? () => {
    const e = info.keys[pass][0];
    const k = codes.indexOf(e);
    return k < 0 ? null : ['left', 'right', 'up', 'down'][k];
  } : null;
  const logic = new GoldfishLogic(memory, {animateDiver: true, panel: true, input: input, inkPlane: withInk});
  let checks = 0, diffs = 0, done = 0;
  const ink = {pixels: 0, recoloured: 0, most: 0};
  for (pass = 0; pass < info.passes; pass++) {
    const i = pass;
    let outcome;
    try {
      outcome = logic.pass();
    } catch (error) {
      console.log(`${name} pass ${i}: ${error.message}`);
      if (verbose) { console.log(error.stack); }
      diffs++;
      break;
    }
    if (outcome !== 'pass') {
      console.log(`${name} pass ${i}: remake ${outcome}, the original goes on`);
      diffs++;
      break;
    }
    let at = i*size, first = null, count = 0;
    for (const [lo, hi, region] of regions) {
      for (let a = lo; a < hi; a++, at++) {
        checks++;
        if (memory[a] !== passes[at]) {
          count++;
          if (!first) { first = `${region}: ${hex(a)} remake ${hex(memory[a], 2)}, original ${hex(passes[at], 2)}`; }
        }
      }
    }
    if (withInk && !count) {
      const r = inkCheck(memory, logic.ink, ink);
      checks += r.checks;
      if (r.first) {
        first = r.first;
        count = r.diffs;
      }
    }
    if (count) {
      console.log(`${name} pass ${i}: ${count} differences, first ${first}`);
      diffs += count;
      break;
    }
    done++;
  }
  console.log(`${name.padEnd(8)} ${done} passes of ${info.passes}, ${checks} checks, ${diffs} differences`);
  if (withInk) {
    console.log(`${''.padEnd(8)} plane: ${ink.recoloured} of ${ink.pixels} lit pixels recoloured (${(100*ink.recoloured/Math.max(1, ink.pixels)).toFixed(2)} %), most in a pass ${ink.most}`);
  }
  return {checks, diffs};
}

/**
 * The ink plane after a pass: an owner only on a lit pixel (one check per
 * pixel), and the lit pixels whose owner's ink differs from the cell's
 * counted.
 * @param {Uint8Array} memory - The port's memory.
 * @param {Uint8Array} plane - Its ink plane, 256 × 192.
 * @param {Object} ink - The running totals.
 * @returns {{checks: number, diffs: number, first: string|null}}
 */
function inkCheck(memory, plane, ink) {
  let checks = 0, diffs = 0, first = null, recoloured = 0;
  for (let y = 0; y < 192; y++) {
    const line = 0x4000+((y & 0xC0) << 5)+((y & 7) << 8)+((y & 0x38) << 2);
    for (let col = 0; col < 32; col++) {
      const byte = memory[line+col];
      const attr = memory[0x5800+(y >> 3)*32+col];
      const cell = (attr & 0x07) | ((attr & 0x40) ? 0x08 : 0) | ((attr & 0x80) ? 0x10 : 0);
      for (let bit = 0; bit < 8; bit++) {
        const own = plane[y*256+col*8+bit];
        const lit = byte & (0x80 >> bit);
        checks++;
        if (own && !lit) {
          diffs++;
          if (!first) { first = `plane: pixel ${col*8+bit},${y} has an owner and is not lit`; }
        }
        if (lit) {
          ink.pixels++;
          if (own && (own & 0x1F) !== cell) {
            recoloured++;
          }
        }
      }
    }
  }
  ink.recoloured += recoloured;
  ink.most = Math.max(ink.most, recoloured);
  return {checks, diffs, first};
}

async function main() {
  const base = path.join(ROOT, 'build/goldfish');
  if (!fs.existsSync(path.join(base, 'init.bin'))) {
    console.error('build/goldfish is missing – run ./tools/tracegoldfish.py');
    process.exit(2);
  }
  await import(url.pathToFileURL(path.join(ROOT, 'app/svision/tools/nodeEnv.mjs')).href);
  const loadClassicScript = require(path.join(ROOT, 'app/svision/tools/classicScript.cjs'));
  globalThis.ZXRomDraw = loadClassicScript(path.join(ROOT, 'app/svision/js/platform/canvas2D/zx/zxRomDraw.js'));
  const GoldfishLogic = loadClassicScript(path.join(ROOT, 'app/goldfishLogic.js'));

  // ★ the memory the menu starts from: data/global.json#goldfish (tools/mkgoldfish.py),
  // only its data — nothing else of init.bin, so a read outside it shows
  const data = readSection('goldfish');
  const memory = new Uint8Array(65536);
  for (const seg of data.segments) {
    memory.set(Buffer.from(seg.bytes, 'base64'), seg.address);
  }
  // the ROM font at $3D00, as the sub game gets it (GameModel.romFont): the
  // machine's, not data of the hidden game — out of the run's memory
  const init = fs.readFileSync(path.join(base, 'init.bin'));
  memory.set(init.subarray(0x3D00, 0x4000), 0x3D00);
  // the keys of the game ($5BEB-$5BEE) are not data of the hidden game: from
  // the run, for the mapping of KEY-SCAN's codes only
  const runs = [runRecord('idle', base, memory, GoldfishLogic)];
  const keysBase = path.join(ROOT, 'build/goldfish-keys');
  if (fs.existsSync(path.join(keysBase, 'init.bin'))) {
    const full = new Uint8Array(fs.readFileSync(path.join(keysBase, 'init.bin')));
    runs.push(runRecord('keys', keysBase, full, GoldfishLogic));
  }
  const checks = runs.reduce((sum, r) => sum+r.checks, 0);
  const diffs = runs.reduce((sum, r) => sum+r.diffs, 0);
  console.log(`total ${checks} checks, **${diffs} differences**`);
  process.exit(diffs ? 1 : 0);
}

main();
