#!/usr/bin/env node
/**
 * Porovná skrytou minihru remaku s originálem — průchod po průchodu.
 *
 *   ./tools/matchgoldfish.mjs [--ink] [--verbose]
 *
 * ★ Reference je `tools/tracegoldfish.py`: skutečný kód z kazety
 * v simulátoru Z80, minihra spuštěná přes POKE, bez kláves, a po každém
 * průchodu `$CF36` obrazovka, buffery spritů, proměnné, objekty, potápěč,
 * písek a bubliny. Remake je `app/goldfishLogic.js`, **kód, který běží
 * v SECRET SUB GAME** (`app/subGameWorker.js`), puštěný z paměti, ze které
 * začíná (`data/global.json#goldfish`, jen datové oblasti – co by přepis četl
 * jinde, ukáže se – a ROM font na `$3D00`), s animací potápěče a s tiskem
 * řádků 22–23 jako v originálu (`animateDiver`, `panel`).
 *
 * Dva běhy: **klid** (bez kláves, paměť z `data/global.json#goldfish`) a **klávesy**
 * (`tracegoldfish.py --keys`, `build/goldfish-keys/`): náhodně držené klávesy
 * potápěče, co ROM `KEY-SCAN` vrátila, přehrané do přepisu přes `input`
 * (`$D579`) – pohyb a mazání potápěče, chycení, srážka s velkou rybou.
 *
 * Kontroluje se všechno po každém průchodu, bajt po bajtu – i řádky 22–23
 * (FISH, počet ryb `$CFA8`, ukazatel AIR `$D2F8`). Menu pouští tentýž kód
 * bez potápěče a bez ryb (`diver: false`, `objects: false`) a na řádky
 * 22–23 píše svoje.
 *
 * `--ink` pustí oba běhy s **barevnou rovinou** (`inkPlane`, R-036, jako
 * SECRET SUB GAME při `ScreenLayout.TRUE_COLOUR`): paměť musí dál sedět na
 * bajt (rovina je *vedle* ní), majitele smějí mít jen rozsvícené pixely, a
 * vypíše se, kolik rozsvícených pixelů má jiný inkoust, než by jim dala
 * buňka – nula by znamenala, že se rovina neplní (DESIGN-inkplane.md §5).
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
      console.log(`${name} průchod ${i}: ${error.message}`);
      if (verbose) { console.log(error.stack); }
      diffs++;
      break;
    }
    if (outcome !== 'pass') {
      console.log(`${name} průchod ${i}: remake ${outcome}, originál pokračuje`);
      diffs++;
      break;
    }
    let at = i*size, first = null, count = 0;
    for (const [lo, hi, region] of regions) {
      for (let a = lo; a < hi; a++, at++) {
        checks++;
        if (memory[a] !== passes[at]) {
          count++;
          if (!first) { first = `${region}: ${hex(a)} remake ${hex(memory[a], 2)}, originál ${hex(passes[at], 2)}`; }
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
      console.log(`${name} průchod ${i}: ${count} rozdílů, první ${first}`);
      diffs += count;
      break;
    }
    done++;
  }
  console.log(`${name.padEnd(8)} ${done} průchodů z ${info.passes}, ${checks} kontrol, ${diffs} rozdílů`);
  if (withInk) {
    console.log(`${''.padEnd(8)} rovina: přebarvených ${ink.recoloured} z ${ink.pixels} rozsvícených pixelů (${(100*ink.recoloured/Math.max(1, ink.pixels)).toFixed(2)} %), nejvíc v průchodu ${ink.most}`);
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
          if (!first) { first = `rovina: pixel ${col*8+bit},${y} má majitele a nesvítí`; }
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
    console.error('chybí build/goldfish – spusť ./tools/tracegoldfish.py');
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
  const runs = [runRecord('klid', base, memory, GoldfishLogic)];
  const keysBase = path.join(ROOT, 'build/goldfish-keys');
  if (fs.existsSync(path.join(keysBase, 'init.bin'))) {
    const full = new Uint8Array(fs.readFileSync(path.join(keysBase, 'init.bin')));
    runs.push(runRecord('klávesy', keysBase, full, GoldfishLogic));
  }
  const checks = runs.reduce((sum, r) => sum+r.checks, 0);
  const diffs = runs.reduce((sum, r) => sum+r.diffs, 0);
  console.log(`celkem ${checks} kontrol, **${diffs} rozdílů**`);
  process.exit(diffs ? 1 : 0);
}

main();
