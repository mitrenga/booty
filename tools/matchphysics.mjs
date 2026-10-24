#!/usr/bin/env node
/**
 * Replays a recording of the original pass by pass against `app/bootyLogic.js`.
 *
 *   ./tools/matchphysics.mjs [--script walk] [--all] [--verbose] [--base build/rules]
 *
 * The recording is made by `tools/tracephysics.py` (`build/trace/<script>/`),
 * or from an RZX recording by `tools/tracerules.py` (`--base build/rules`):
 * the original's memory at the start of the first pass (`init.bin`), the
 * inputs of every pass (the key from `KEY-SCAN`, the timer's `FRAMES`) and
 * the memory regions after every pass (`passes.xor.gz`, `regions.json`).
 *
 * The remake starts **from the same memory** and with the same inputs makes
 * the same number of passes with **the real code that goes into the browser**
 * (`BootyLogic.pass`). After each one all regions are compared – the screen,
 * game variables, the print system variables, buffers, the hold's work area,
 * objects – byte by byte. Jim is in them whole (`$F231`, 20 B), and with him
 * everything that affects him.
 *
 * At the first difference the tool prints the pass, the region, the address
 * and both values and stops – further passes would start from different memory.
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
      console.log(`  pass ${i}: ${error.message}`);
      if (verbose) { console.log(error.stack); }
      return {checks, diffs: 1, passes: i};
    }
    // ★ the end of the game must come where the original's came
    if ((outcome === 'gameover') !== (outcomes[i] === 'gameover')) {
      console.log(`  pass ${i}: remake ${outcome}, original ${outcomes[i]}`);
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
          console.log(`  pass ${i} (${outcome}), ${name}: ${hex(a)} remake ${hex(memory[a], 2)}, original ${hex(passes[at], 2)}`
                      + ` – ${count} differences in the region; inputs ${JSON.stringify(inputs[i])}`);
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
    console.log(`${name.padEnd(12)} ${String(r.passes).padStart(5)} passes, ${r.checks} checks, ${r.diffs} differences`);
    checks += r.checks;
    diffs += r.diffs;
    total += r.passes;
  }
  console.log(`total ${total} passes, ${checks} checks, **${diffs} differences**`);
  process.exit(diffs ? 1 : 0);
}

main();
