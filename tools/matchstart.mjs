#!/usr/bin/env node
/**
 * Začne remake hru ze své výchozí paměti stejně jako originál?
 *
 *   ./tools/matchstart.mjs
 *
 * Paměť se složí tak, jak ji skládá worker: `data/global.json#memory` (datové
 * oblasti originálu, `tools/mkmemory.py`) a ROM font ze svision
 * (`ZXFonts8x8`). Pak:
 *
 * 1. `BootyLogic.newGame()` – přepis `$DEA8` … `$DF13` – a porovnání všech
 *    oblastí z `regions.json` se stavem originálu na začátku prvního průchodu
 *    (`build/trace/walk/init.bin`)
 * 2. z té paměti se přehrají celé záznamy, které se od nové hry liší jen
 *    zápisy čísel (`walk`, `quietwalk`, `fuzz1`–`fuzz4`, `quiet1`,
 *    `quiet2`) – po každém průchodu porovnání jako v `matchphysics.mjs`
 *
 * Nula tu říká, že v `global.json#memory` je všechno, co hra čte, a že remake
 * nepotřebuje nic z originálu, co v datech není – ani kód.
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
        console.log(`  ${label}, ${name}: ${hex(a)} remake ${hex(memory[a], 2)}, originál ${hex(reference[a-lo], 2)}`);
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
    if (r.diff) { diffs++; console.log(`${name}: start se liší`); continue; }
    // 2. the passes
    let ok = true, done = 0;
    for (let i = 0; i < inputs.length && ok; i++) {
      logic.pass(inputs[i]);
      let off = i*size;
      for (const [lo, hi, region] of regions) {
        const res = compare(memory, passes.subarray(off, off+hi-lo), [[lo, hi, region]], `${name} průchod ${i}`);
        checks += res.checks;
        off += hi-lo;
        if (res.diff) { ok = false; diffs++; break; }
      }
      done = i+1;
    }
    console.log(`${name.padEnd(10)} start + ${done} průchodů z výchozí paměti remaku${ok ? '' : ' – ROZDÍL'}`);
  }
  console.log(`celkem ${checks} kontrol, **${diffs} rozdílů**`);
  process.exit(diffs ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
