#!/usr/bin/env node
/**
 * Compares the worker's random generator with the original's — over the whole period.
 *
 *   ./tools/matchrand.mjs [--seed 0xABCD]
 *
 * ★ The original has a single generator, `$E349`, with a sixteen-bit state at
 * `$F343` (`sources/docs/disasm_notes.md` §5), and `app/gameWorker.js` ports
 * it instruction by instruction (`originalRand`). This tool proves it:
 *
 * - `tools/tracerand.py` runs **the real code from the tape** in a Z80
 *   simulator (SkoolKit) and calls `$E349` 65,536 times – the whole period –
 *   from the seed
 * - `originalRand` from `app/gameWorker.js` makes the same number of calls,
 *   run the way the browser runs it (a mock worker)
 * - after every call the returned number **and the new state of `$F343`** are
 *   compared: 3 × 65,536 = 196,608 checks
 *
 * Without `--seed` it starts from `$0000`, that is from the original's state
 * fresh after loading. Because the period is full, every state is visited
 * exactly once and the seed then does not matter – that is checked too.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const COUNT = 65536;

function worker() {
  const sandbox = {
    console, setTimeout: () => 0, clearTimeout: () => {},
    postMessage: () => {}, importScripts() {},
  };
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'app/gameWorker.js'), 'utf8'),
                  context, {filename: 'gameWorker.js'});
  return context;
}

function main() {
  const args = process.argv.slice(2);
  const seed = args.includes('--seed') ? Number(args[args.indexOf('--seed')+1]) & 0xFFFF : 0;

  const z80 = execFileSync(path.join(HERE, 'tracerand.py'),
                           ['--count', String(COUNT), '--seed', '0x'+seed.toString(16)],
                           {maxBuffer: 16*1024*1024});
  if (z80.length !== 3*COUNT) {
    console.error(`tracerand.py returned ${z80.length} B instead of ${3*COUNT}`);
    process.exit(2);
  }

  const context = worker();
  vm.runInContext(`seedRand(${seed});`, context);
  let checks = 0, diffs = 0, first = null;
  const seen = new Uint8Array(65536);
  for (let i = 0; i < COUNT; i++) {
    const value = vm.runInContext('randSource()', context);
    const state = vm.runInContext('rand', context);
    const expect = [z80[3*i], z80[3*i+1], z80[3*i+2]];
    const got = [value, state & 0xFF, state >> 8];
    for (let k = 0; k < 3; k++) {
      checks++;
      if (got[k] !== expect[k]) {
        diffs++;
        if (first === null) {
          first = `call ${i+1}: worker ${got.map((v) => v.toString(16))}, `
                  + `Z80 ${expect.map((v) => v.toString(16))}`;
        }
      }
    }
    seen[state] = 1;
  }
  const states = seen.reduce((sum, v) => sum+v, 0);
  console.log(`seed $${seed.toString(16).toUpperCase().padStart(4, '0')}, ${COUNT} calls of $E349`);
  console.log(`returned number and state $F343: ${checks} checks, ${diffs} differences`);
  console.log(`distinct states over the period: ${states} of 65536`);
  if (first) { console.log('  first difference: '+first); }
  if (states !== 65536) { diffs++; }
  console.log(`total ${checks} checks, **${diffs} differences**`);
  process.exit(diffs ? 1 : 0);
}

main();
