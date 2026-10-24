#!/usr/bin/env node
/**
 * Does the remake start a game from its own default memory the way the original does?
 *
 *   ./tools/matchstart.mjs
 *
 * The memory is composed the way the worker composes it: `data/global.json#memory`
 * (the original's data regions, `tools/mkmemory.py`) and the ROM font from
 * svision (`ZXFonts8x8`). Then:
 *
 * 1. `BootyLogic.newGame()` – a port of `$DEA8` … `$DF13` – and a comparison of
 *    all regions of `regions.json` with the original's state at the start of
 *    the first pass (`build/trace/walk/init.bin`)
 * 2. from that memory the whole recordings that differ from a new game only
 *    by written numbers are replayed (`walk`, `quietwalk`, `fuzz1`–`fuzz4`,
 *    `quiet1`, `quiet2`) – after every pass a comparison as in
 *    `matchphysics.mjs`
 *
 * Zero here says that `global.json#memory` holds everything the game reads,
 * and that the remake needs nothing of the original that is not in the data
 * – not even code.
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
const loadClassicScript = require(path.join(ROOT, 'app/svision/tools/classicScript.cjs'));
const BootyLogic = loadClassicScript(path.join(ROOT, 'app/bootyLogic.js'));

// ★ the numbers tools/tracephysics.py writes before the first pass
const POKES = {walk: {}, quietwalk: {0xFFF8: 0}, fuzz1: {0x5BF1: 9}, fuzz2: {0x5BF1: 9},
               fuzz3: {0x5BF1: 9}, fuzz4: {0x5BF1: 9, 0x5BF4: 100},
               quiet1: {0x5BF1: 9, 0xFFF8: 0}, quiet2: {0x5BF1: 9, 0xFFF8: 0}};

function hex(v, n = 4) { return '$'+v.toString(16).toUpperCase().padStart(n, '0'); }

async function romFont() {
  global.atob = (data) => Buffer.from(data, 'base64').toString('binary');
  await import(url.pathToFileURL(path.join(ROOT, 'app/svision/tools/nodeEnv.mjs')).href);
  const { ZXFonts8x8 } = await import(
    url.pathToFileURL(path.join(ROOT, 'app/svision/js/platform/canvas2D/zx/zxFonts8x8.js')).href);
  const font = new ZXFonts8x8({}, false);
  const bytes = new Uint8Array(768);
  for (let c = 0; c < 96; c++) { bytes.set(font.glyphBytes(font.fontsChars.charAt(c)), c*8); }
  return bytes;
}

function compare(memory, reference, regions, label) {
  let checks = 0;
  for (const [lo, hi, name] of regions) {
    for (let a = lo; a < hi; a++) {
      checks++;
      if (memory[a] !== reference[a-lo]) {
        console.log(`  ${label}, ${name}: ${hex(a)} remake ${hex(memory[a], 2)}, original ${hex(reference[a-lo], 2)}`);
        return {checks, diff: true};
      }
    }
  }
  return {checks, diff: false};
}

async function main() {
  const font = await romFont();
  const memoryData = readSection('memory');
  const decode = (b64) => new Uint8Array(Buffer.from(b64, 'base64'));
  const base = path.join(ROOT, 'build/trace');
  let checks = 0, diffs = 0;
  for (const name of Object.keys(POKES)) {
    const dir = path.join(base, name);
    const regions = JSON.parse(fs.readFileSync(path.join(dir, 'regions.json'), 'utf8'));
    const { inputs } = JSON.parse(fs.readFileSync(path.join(dir, 'inputs.json'), 'utf8'));
    const init = fs.readFileSync(path.join(dir, 'init.bin'));
    const size = regions.reduce((sum, [lo, hi]) => sum+hi-lo, 0);
    const passes = zlib.gunzipSync(fs.readFileSync(path.join(dir, 'passes.xor.gz')));
    for (let i = size; i < passes.length; i++) { passes[i] ^= passes[i-size]; }

    const memory = BootyLogic.composeMemory(memoryData, font, decode);
    const logic = new BootyLogic(memory);
    logic.newGame();
    for (const [address, value] of Object.entries(POKES[name])) { memory[Number(address)] = value; }
    // 1. the start
    const flat = Buffer.concat(regions.map(([lo, hi]) => init.subarray(lo, hi)));
    const r = {checks: 0, diff: false};
    let at = 0;
    for (const [lo, hi, region] of regions) {
      const res = compare(memory, flat.subarray(at, at+hi-lo), [[lo, hi, region]], `${name} start`);
      r.checks += res.checks;
      at += hi-lo;
      if (res.diff) { r.diff = true; break; }
    }
    checks += r.checks;
    if (r.diff) { diffs++; console.log(`${name}: the start differs`); continue; }
    // 2. the passes
    let ok = true, done = 0;
    for (let i = 0; i < inputs.length && ok; i++) {
      logic.pass(inputs[i]);
      let off = i*size;
      for (const [lo, hi, region] of regions) {
        const res = compare(memory, passes.subarray(off, off+hi-lo), [[lo, hi, region]], `${name} pass ${i}`);
        checks += res.checks;
        off += hi-lo;
        if (res.diff) { ok = false; diffs++; break; }
      }
      done = i+1;
    }
    console.log(`${name.padEnd(10)} start + ${done} passes from the remake's default memory${ok ? '' : ' – DIFFERENCE'}`);
  }
  console.log(`total ${checks} checks, **${diffs} differences**`);
  process.exit(diffs ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
