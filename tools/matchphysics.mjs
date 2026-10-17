#!/usr/bin/env node
/**
 * Přehraje záznam originálu průchod po průchodu proti `app/bootyLogic.js`.
 *
 *   ./tools/matchphysics.mjs [--script walk] [--all] [--verbose] [--base build/rules]
 *
 * Záznam dělá `tools/tracephysics.py` (`build/trace/<skript>/`), nebo
 * z nahrávky RZX `tools/tracerules.py` (`--base build/rules`): paměť
 * originálu na začátku prvního průchodu (`init.bin`), vstupy každého
 * průchodu (klávesa z `KEY-SCAN`, `FRAMES` časovače) a oblasti paměti po
 * každém průchodu (`passes.xor.gz`, `regions.json`).
 *
 * Remake začne **z téže paměti** a s týmiž vstupy udělá týž počet průchodů
 * **skutečným kódem, který jde do prohlížeče** (`BootyLogic.pass`). Po
 * každém se porovnají všechny oblasti – obrazovka, proměnné hry, systémové
 * proměnné tisku, buffery, pracovní oblast podpalubí, objekty – bajt po
 * bajtu. Jim je v nich celý (`$F231`, 20 B), a s ním všechno, co ho ovlivňuje.
 *
 * U prvního rozdílu nástroj vypíše průchod, oblast, adresu a obě hodnoty
 * a skončí – další průchody by už začínaly z jiné paměti.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require = createRequire(import.meta.url);
const loadClassicScript = require(path.join(ROOT, 'app/svision/tools/classicScript.cjs'));
const BootyLogic = loadClassicScript(path.join(ROOT, 'app/bootyLogic.js'));

function hex(v, n = 4) { return '$'+v.toString(16).toUpperCase().padStart(n, '0'); }

function runScript(dir, verbose) {
  const memory = new Uint8Array(fs.readFileSync(path.join(dir, 'init.bin')));
  const regions = JSON.parse(fs.readFileSync(path.join(dir, 'regions.json'), 'utf8'));
  const { inputs, outcomes } = JSON.parse(fs.readFileSync(path.join(dir, 'inputs.json'), 'utf8'));
  const size = regions.reduce((sum, [lo, hi]) => sum+hi-lo, 0);
  // stored as XOR with the previous pass, gzipped (tools/tracephysics.py)
  const passes = zlib.gunzipSync(fs.readFileSync(path.join(dir, 'passes.xor.gz')));
  for (let i = size; i < passes.length; i++) { passes[i] ^= passes[i-size]; }
  const logic = new BootyLogic(memory);
  let checks = 0;
  for (let i = 0; i < inputs.length; i++) {
    let outcome;
    try {
      outcome = logic.pass(inputs[i]);
    } catch (error) {
      console.log(`  průchod ${i}: ${error.message}`);
      if (verbose) { console.log(error.stack); }
      return {checks, diffs: 1, passes: i};
    }
    // ★ the end of the game must come where the original's came
    if ((outcome === 'gameover') !== (outcomes[i] === 'gameover')) {
      console.log(`  průchod ${i}: remake ${outcome}, originál ${outcomes[i]}`);
      return {checks, diffs: 1, passes: i};
    }
    checks++;
    let at = i*size;
    for (const [lo, hi, name] of regions) {
      for (let a = lo; a < hi; a++, at++) {
        checks++;
        if (memory[a] !== passes[at]) {
          let count = 0;
          for (let b = a, k = at; b < hi; b++, k++) { if (memory[b] !== passes[k]) { count++; } }
          console.log(`  průchod ${i} (${outcome}), ${name}: ${hex(a)} remake ${hex(memory[a], 2)}, originál ${hex(passes[at], 2)}`
                      + ` – v oblasti ${count} rozdílů; vstupy ${JSON.stringify(inputs[i])}`);
          return {checks, diffs: count, passes: i};
        }
      }
    }
    if (outcome === 'gameover') {
      return {checks, diffs: 0, passes: i+1};
    }
  }
  return {checks, diffs: 0, passes: inputs.length};
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const base = path.resolve(ROOT, args.includes('--base') ? args[args.indexOf('--base')+1] : 'build/trace');
  const scripts = args.includes('--all') || !args.includes('--script')
    ? fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'inputs.json'))).sort()
    : [args[args.indexOf('--script')+1]];
  let checks = 0, diffs = 0, total = 0;
  for (const name of scripts) {
    const r = runScript(path.join(base, name), verbose);
    console.log(`${name.padEnd(12)} ${String(r.passes).padStart(5)} průchodů, ${r.checks} kontrol, ${r.diffs} rozdílů`);
    checks += r.checks;
    diffs += r.diffs;
    total += r.passes;
  }
  console.log(`celkem ${total} průchodů, ${checks} kontrol, **${diffs} rozdílů**`);
  process.exit(diffs ? 1 : 0);
}

main();
