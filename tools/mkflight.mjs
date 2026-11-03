#!/usr/bin/env node
/**
 * Data for the test flight: a whole game of the original from an RZX
 * recording as the worker's inputs.
 *
 *   ./tools/mkflight.mjs [--name gold1] [--out testFlight.json]
 *
 * It takes the output of `tools/tracerules.py` (`build/rules/<name>/`):
 * `inputs.json` holds what the original's `KEY-SCAN` gave (`K`) and what its
 * timer read of `FRAMES` (`F`) in every pass of the main loop, `start.bin`
 * the memory when the menu starts the game. The worker starts a new game from
 * its own data (`data/global.json#memory`) as `tools/matchrules.mjs` does,
 * with ★ the generator `$F343` and ★ the controls chosen in the menu with
 * their keys `$5BEA`–`$5BEF` out of the recording (`app/WORKER-PROTOCOL.md`,
 * `flight`).
 *
 * ★ `FRAMES` goes in **relative to what the previous pass left there**: the
 * game writes it itself (the timer of a creature), so the values the timer
 * read jump, but the difference is the original's interrupts since and fits
 * a character. The worker does not count FRAMES while it flies.
 *
 * The data are played twice through the worker in its sandbox
 * (`tools/workersandbox.mjs`), the way it runs in the browser: the first time
 * the differences of FRAMES are taken, the second time from the encoded data
 * alone. Both times every memory region after every pass is compared with the
 * original's (as `matchrules.mjs`) and so is the end of the game; a
 * difference is an error and nothing is written.
 *
 * The shape (`testFlightPage.php` hides it in `appIconSprite`):
 *
 * - `seed` — `$F343` + 256 × `$F344`, `controls` — `$5BEA`–`$5BEF`
 * - `keys` — the different keys a pass gets (`0xFF` = none)
 * - `runs` — the passes as runs: a character of `ALPHABET` = an index into
 *   `keys`, then the count of passes in decimal (none for one)
 * - `frames` — ★ per pass 0 when the timer does not read FRAMES, else 1 +
 *   the interrupts since the previous pass left it; runs the same way. The
 *   last character of `ALPHABET` stands for the next value of `long`: a few
 *   passes of the original wait long inside (a death, the gold key)
 * - `passes`, `outcome` — the count of passes and how the last one ended
 *   (the recordings end in the middle of a game: then the player goes on)
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, initData, startWorker } from './workersandbox.mjs';

// printable ASCII without the digits (a run's length follows it), the quote
// and the backslash (82 values) — app/gameWorker.js FLIGHT_ALPHABET
export const ALPHABET = Array.from({length: 94}, (_, i) => String.fromCharCode(33+i))
  .filter((c) => !/[0-9"\\]/.test(c)).join('');

/**
 * Values per pass as runs: a character of `ALPHABET` = the value, then the length.
 * @param {number[]} values
 * @returns {string|null} null when a value does not fit the alphabet.
 */
function encodeRuns(values) {
  let out = '';
  for (let i = 0; i < values.length;) {
    let n = 1;
    while (i+n < values.length && values[i+n] === values[i]) {
      n++;
    }
    if (values[i] < 0 || values[i] >= ALPHABET.length) {
      return null;
    }
    out += ALPHABET[values[i]]+(n > 1 ? String(n) : '');
    i += n;
  }
  return out;
}

function hex(v, n = 2) { return '$'+v.toString(16).toUpperCase().padStart(n, '0'); }

function load(dir) {
  const regions = JSON.parse(fs.readFileSync(path.join(dir, 'regions.json'), 'utf8'));
  const record = JSON.parse(fs.readFileSync(path.join(dir, 'inputs.json'), 'utf8'));
  const size = regions.reduce((sum, [lo, hi]) => sum+hi-lo, 0);
  const passes = zlib.gunzipSync(fs.readFileSync(path.join(dir, 'passes.xor.gz')), {maxOutputLength: 2**31-1});
  for (let i = size; i < passes.length; i++) { passes[i] ^= passes[i-size]; }
  return {
    regions, size, passes, inputs: record.inputs, outcomes: record.outcomes,
    start: new Uint8Array(fs.readFileSync(path.join(dir, 'start.bin'))),
  };
}

/**
 * The flight played through the worker, every pass compared with the original.
 * @param {Function} beforePass - (i, logic) → nothing; may fill in the flight's FRAMES.
 * @returns {{checks: number, error: string|null}}
 */
function fly(INIT, rec, flight, beforePass) {
  const { regions, size, passes, outcomes } = rec;
  const worker = startWorker(() => {});
  const ctx = worker.context;
  worker.send({id: 'init', initData: Object.assign({headless: true, seed: 0, flight}, INIT)});
  const m = ctx.logic.m;
  let checks = 0;
  for (let i = 0; i < flight.passes; i++) {
    beforePass(i, ctx);
    const before = ctx.state.pass;
    let guard = 0;
    while (ctx.state.pass === before) {
      worker.send({id: 'tick'});
      if (++guard > 1000) {
        return {checks, error: `pass ${i}: the worker did not make it in 1000 ticks`};
      }
    }
    const outcome = ctx.state.outcome;
    checks++;
    if ((outcome === 'gameover') !== (outcomes[i] === 'gameover')) {
      return {checks, error: `pass ${i}: remake ${outcome}, original ${outcomes[i]}`};
    }
    let at = i*size;
    for (const [lo, hi, label] of regions) {
      for (let a = lo; a < hi; a++, at++) {
        checks++;
        if (m[a] !== passes[at]) {
          return {checks, error: `pass ${i}, ${label}: ${hex(a, 4)} remake ${hex(m[a])}, original ${hex(passes[at])}`};
        }
      }
    }
  }
  return {checks, error: null};
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name, value) => (args.includes(name) ? args[args.indexOf(name)+1] : value);
  const name = arg('--name', 'gold1');
  const out = path.resolve(ROOT, arg('--out', 'testFlight.json'));
  const dir = path.join(ROOT, 'build/rules', name);
  if (!fs.existsSync(path.join(dir, 'start.bin'))) {
    console.error(`missing ${path.relative(ROOT, dir)}/start.bin – run ./tools/tracerules.py --name ${name}`);
    process.exit(1);
  }
  const rec = load(dir);
  const { inputs, outcomes, start } = rec;
  const seed = start[0xF343] | (start[0xF344] << 8);
  const controls = Array.from(start.subarray(0x5BEA, 0x5BF0));
  const codes = controls.slice(1);

  // the key of every pass: ★ none when the pass ends before KEY-SCAN, and a
  // key that is not one of the five (M, P …) reaches the pass as none, as
  // the model's controls give it (matchrules.mjs)
  const keys = [], index = new Map();
  const keyRuns = encodeRuns(inputs.map((reads) => {
    const read = reads.filter(([tag]) => tag === 'K').map(([, v]) => v);
    const key = read.length && codes.includes(read[0]) ? read[0] : 0xFF;
    if (!index.has(key)) {
      index.set(key, keys.length);
      keys.push(key);
    }
    return index.get(key);
  }));
  const reads = inputs.map((reads) => {
    const read = reads.filter(([tag]) => tag === 'F').map(([, v]) => v);
    return read.length ? read[0] : null;
  });

  const INIT = await initData();
  const flight = {source: name, passes: inputs.length, outcome: outcomes[outcomes.length-1], seed, controls,
                  keys, runs: keyRuns, frames: ALPHABET[0]+inputs.length};

  // 1. FRAMES as the difference from what the previous pass left
  const LONG = ALPHABET.length-1;
  const frames = [], long = [];
  let first = fly(INIT, rec, flight, (i, ctx) => {
    const want = reads[i];
    const d = want === null ? 0 : ((want-ctx.logic.rd16(0x5C78)) & 0xFFFF)+1;
    if (d >= LONG) {
      long.push(d);
    }
    frames.push(Math.min(d, LONG));
    ctx.state.flight.frames[i] = d;
  });
  if (first.error) {
    console.error(`mkflight, first flight: ${first.error}`);
    process.exit(1);
  }
  flight.frames = encodeRuns(frames);
  flight.long = long;

  // 2. the encoded data alone, as the browser gets them
  const second = fly(INIT, rec, flight, () => {});
  if (second.error) {
    console.error(`mkflight, second flight: ${second.error}`);
    process.exit(1);
  }

  fs.writeFileSync(out, JSON.stringify(flight)+'\n');
  console.log(`mkflight: ${name}, ${inputs.length} passes → ${flight.outcome}, seed ${hex(seed, 4)}, `
              +`controls ${controls.join(' ')}, ${keys.length} keys, ${keyRuns.length} + ${flight.frames.length} characters `
              +`of runs, ${long.length} long, ${first.checks+second.checks} checks, 0 differences → ${path.relative(ROOT, out)}`);
}

main();
