#!/usr/bin/env node
/**
 * A whole game of the original replayed against the **worker** – the rules of the ship (M4).
 *
 *   ./tools/matchrules.mjs [--name gold1] [--verbose] [--no-lock] [--base DIR]
 *
 * The recording is a whole game played by a human: an RZX recording from the
 * RZX Archive (Mousey collects all 125 pieces of booty and finds the gold
 * key), replayed in the simulator by `tools/tracerules.py` →
 * `build/rules/<name>/`: the original's memory at the start of the game and
 * after every pass, and the inputs of the pass.
 *
 * Unlike `matchphysics.mjs` (which runs `BootyLogic.pass` alone), here plays
 * **the worker the way it runs in the browser** (`app/gameWorker.js` in a
 * mock environment, `tools/workersandbox.mjs`):
 *
 * - **start**: `init` with the model's data (`data/global.json#memory`, ROM font)
 *   and the seed = the original's `$F343` at the moment the menu starts the
 *   game; the worker composes the memory and starts a new game itself. The
 *   only thing written into its memory is **the choice of controls and the
 *   key codes** `$5BEA`–`$5BEF` from the recording (Mousey plays on
 *   Interface 2: `6 7 9 8 0`), because the controls and key redefinition are
 *   the model's job in the remake. Then all regions are compared with the
 *   original at the start of the first pass
 * - **keys**: what the original's `KEY-SCAN` returned is translated back into
 *   actions (left, right, up, down, ENTER ROOM) and sent to the worker in a
 *   `controls` message; the pass gets what the worker makes of them
 *   (`heldKey`). It is checked that it is **the same code**. `M` (music) and
 *   `P` (pause) are the model's job in the remake – the pass gets them as
 *   "nothing"
 * - **ticks**: the worker is ticked with `tick` messages until the pass has
 *   run – at a constant pace, with the wait for the door transition, with
 *   the end of the game
 * - ★ **`FRAMES`**: the original runs 1.5–3.4 frames a pass, the remake at a
 *   constant pace (`ZADANI.md` §10) and ticks every 30 ms – the number of
 *   interrupts between passes is a **deliberate deviation**. The value the
 *   creature timer (`$E12A`) reads in the pass therefore comes from the
 *   recording: it is written to `$5C78` just before the pass. Nothing else
 *   is slipped in
 * - ★ **ENTER ROOM after a transition**: for 25 interrupts after a change of
 *   hold the worker does not pass the enter key on (`ENTER_LOCK_FRAMES`,
 *   deviation §10); the original does. The worker plays with it the way it
 *   plays in the browser, and the tool **prints how many times it would
 *   have struck in the game** (the game would then diverge); `--no-lock`
 *   turns it off
 *
 * Plus three recordings of `tools/tracephysics.py` that start with an
 * **untouched new game** (`walk`, `gameover`, and `lastlife` to the end of
 * the game – the deaths Mousey did not make); the others overwrite numbers
 * in memory before the first pass, and the worker only starts with a new game.
 *
 * After every pass all memory regions (the screen, game variables, buffers,
 * all holds, objects) and the end of the game are compared; and the `frame`
 * message the model gets (panel, hold, outcome) against the memory. On top
 * of that **what happened in the game** is counted – booty, explosions,
 * keys, doors, deaths by cause, the edges of the ship's graph, the countdown
 * and the gold key – that is the evidence for the rules in
 * `sources/docs/rules.md`.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, initData, startWorker } from './workersandbox.mjs';

const ACTIONS = ['left', 'right', 'up', 'down', 'enter'];
// ★ tools/tracephysics.py: a new game from the menu with no numbers written
// into it – `lastlife` plays to the end of the game (four deaths)
const NEW_GAME_TRACES = ['walk', 'gameover', 'lastlife'];

function hex(v, n = 4) { return '$'+v.toString(16).toUpperCase().padStart(n, '0'); }

function load(dir) {
  const regions = JSON.parse(fs.readFileSync(path.join(dir, 'regions.json'), 'utf8'));
  const record = JSON.parse(fs.readFileSync(path.join(dir, 'inputs.json'), 'utf8'));
  const size = regions.reduce((sum, [lo, hi]) => sum+hi-lo, 0);
  const passes = zlib.gunzipSync(fs.readFileSync(path.join(dir, 'passes.xor.gz')), {maxOutputLength: 2**31-1});
  for (let i = size; i < passes.length; i++) { passes[i] ^= passes[i-size]; }
  return {
    regions, size, passes, inputs: record.inputs, outcomes: record.outcomes,
    start: new Uint8Array(fs.readFileSync(path.join(dir, 'start.bin'))),
    init: new Uint8Array(fs.readFileSync(path.join(dir, 'init.bin'))),
  };
}

/** what happened in the game: the rules at work (the remake = the original) */
function instrument(logic, events) {
  const wrap = (name, fn) => {
    const original = logic[name].bind(logic);
    logic[name] = function(...args) { return fn(original, ...args); };
  };
  // which routine Jim died in
  const stack = [];
  ['creature', 'splinters', 'pirates', 'jim', 'enter', 'goldKey'].forEach((name) => {
    wrap(name, (original, ...args) => {
      stack.push(name);
      try {
        return original(...args);
      } finally {
        stack.pop();
      }
    });
  });
  const count = (key) => { events[key] = (events[key] || 0)+1; };
  wrap('death', (original) => {
    count('death: '+({creature: 'creature', splinters: 'splinter of an explosion', pirates: 'pirate',
                     jim: 'fall', enter: 'sea', goldKey: 'the gold key ran out of time'}[stack[stack.length-1]] || '?'));
    return original();
  });
  wrap('collect', (original, ix, c, b) => {
    const m = logic.m;
    const before = m[0xE479];
    original(ix, c, b);
    count('booty');
    if (!before && m[0xE479]) { count('booty exploded'); }
    if (logic.rd16(0x5BF2) === 0) { count('gold key countdown'); }
    events.treasures.add(`${m[0x5BD3]}:${c},${b}`);
  });
  wrap('pickKey', (original, c, b) => {
    const m = logic.m;
    const had = m[0xF241];
    original(c, b);
    if (m[0xF241] !== had) {
      count('key picked up');
      if (had) { count('key swapped (the old one back in place)'); }
    }
  });
  wrap('openDoor', (original, record) => {
    count('numbered door opened');
    events.doors.add(`${logic.m[0x5BD3]}/${logic.m[record+4]}`);
    return original(record);
  });
  wrap('goToHold', (original, to) => {
    const from = logic.m[0x5BD3];
    if (logic.m[0xF241]) { count('key lost by going through a door'); }
    events.edges.add(`${from}→${to}`);
    count('change of hold');
    return original(to);
  });
}

async function runGame(name, dir, INIT, options) {
  const rec = load(dir);
  const { regions, size, passes, inputs, outcomes, start, init } = rec;
  const messages = [];
  const worker = startWorker((message) => messages.push(message));
  const ctx = worker.context;
  const LOCK = ctx.ENTER_LOCK_FRAMES;
  if (!options.lock) { ctx.ENTER_LOCK_FRAMES = 0; }
  const seed = start[0xF343] | (start[0xF344] << 8);
  worker.send({id: 'init', initData: Object.assign({headless: true, seed}, INIT)});
  const logic = ctx.logic;
  const m = logic.m;
  // ★ the controls chosen in the original's menu ($5BEA) and the keys they
  // define ($5BEB-$5BEF); the remake's model maps keys to the five actions
  // itself, so the worker keeps the original's codes
  for (let a = 0x5BEA; a < 0x5BF0; a++) { m[a] = start[a]; }
  const codes = Array.from(m.subarray(0x5BEB, 0x5BF0));
  let checks = 0;

  // --- the start: the worker's new game = the original's at its first pass
  for (const [lo, hi, label] of regions) {
    for (let a = lo; a < hi; a++) {
      checks++;
      if (m[a] !== init[a]) {
        console.log(`  start, ${label}: ${hex(a)} remake ${hex(m[a], 2)}, original ${hex(init[a], 2)}`);
        return {checks, diffs: 1, passes: 0};
      }
    }
  }

  const events = {treasures: new Set(), doors: new Set(), edges: new Set()};
  instrument(logic, events);
  // FRAMES as the original's timer read it, written just before the pass
  let pending = null;
  const pass = logic.pass.bind(logic);
  logic.pass = (input) => {
    const want = pending;
    pending = null;
    if (!want) { throw new Error('a pass the tool did not expect'); }
    if (want.key !== null && input.key !== want.key) {
      throw new Error(`the worker gave the pass key ${input.key}, the original ${want.key}`
                      +(want.locked ? ' (ENTER_LOCK_FRAMES)' : ''));
    }
    if (want.frames !== null) { logic.wr16(0x5C78, want.frames); }
    return pass(input);
  };

  let lockUntil = -1, lockHits = 0, ticks = 0, rounds = 0;
  for (let i = 0; i < inputs.length; i++) {
    const keys = inputs[i].filter(([tag]) => tag === 'K').map(([, v]) => v);
    const frames = inputs[i].filter(([tag]) => tag === 'F').map(([, v]) => v);
    // ★ no key when the pass ends before $ED35 (a death, the gold key)
    if (keys.length > 1 || frames.length > 1) {
      console.log(`  pass ${i}: expected at most one key and one read of FRAMES, got ${JSON.stringify(inputs[i])}`);
      return {checks, diffs: 1, passes: i};
    }
    const action = keys.length ? codes.indexOf(keys[0]) : -1;
    const controls = {};
    ACTIONS.forEach((a, k) => { controls[a] = k === action; });
    worker.send(Object.assign({id: 'controls'}, controls));
    // a key that is not one of the five (M, P, any other) reaches the pass as none
    const key = !keys.length ? null : action >= 0 ? keys[0] : 0xFF;
    if (action === 4 && ctx.state.frame < lockUntil) { lockHits++; }
    pending = {key, frames: frames.length ? frames[0] : null, locked: options.lock && action === 4};
    const hold = m[0x5BD3];
    const before = ctx.state.pass;
    messages.length = 0;
    let guard = 0;
    while (ctx.state.pass === before) {
      try {
        worker.send({id: 'tick'});
      } catch (error) {
        console.log(`  pass ${i}: ${error.message}`);
        if (options.verbose) { console.log(error.stack); }
        return {checks, diffs: 1, passes: i};
      }
      ticks++;
      if (++guard > 1000) {
        console.log(`  pass ${i}: the worker did not make it in 1000 ticks`);
        return {checks, diffs: 1, passes: i};
      }
    }
    if (pending) {
      console.log(`  pass ${i}: the worker did not go through the guarded pass`);
      return {checks, diffs: 1, passes: i};
    }
    if (m[0x5BD3] !== hold) {
      // where the remake's lock would end (ENTER_LOCK_FRAMES = 25, from the
      // end of the change of hold)
      lockUntil = ctx.state.enterLockUntil+(options.lock ? 0 : LOCK);
    }
    const outcome = ctx.state.outcome;
    if (outcome === 'round') { rounds++; }
    checks++;
    if ((outcome === 'gameover') !== (outcomes[i] === 'gameover')) {
      console.log(`  pass ${i}: remake ${outcome}, original ${outcomes[i]}`);
      return {checks, diffs: 1, passes: i};
    }
    let at = i*size;
    for (const [lo, hi, label] of regions) {
      for (let a = lo; a < hi; a++, at++) {
        checks++;
        if (m[a] !== passes[at]) {
          let count = 0;
          for (let b = a, k = at; b < hi; b++, k++) { if (m[b] !== passes[k]) { count++; } }
          console.log(`  pass ${i} (${outcome}), ${label}: ${hex(a)} remake ${hex(m[a], 2)}, original ${hex(passes[at], 2)}`
                      +` – ${count} differences in the region; inputs ${JSON.stringify(inputs[i])}`);
          return {checks, diffs: count, passes: i};
        }
      }
    }
    // the frame the model gets: what it shows comes out of the same memory
    const frame = messages.filter((msg) => msg.id === 'frame').pop();
    if (outcome !== 'gameover') {
      const ok = frame && frame.pass === ctx.state.pass && frame.outcome === outcome && frame.hold === m[0x5BD3]
        && frame.panel.lives === m[0x5BF1] && frame.panel.booty === (m[0x5BF4] | (m[0x5BF5] << 8))
        && frame.panel.treasure === (m[0x5BF2] | (m[0x5BF3] << 8)) && frame.panel.key === m[0xF241]
        && frame.screen && frame.screen.every((v, k) => v === m[0x4000+k]);
      checks++;
      if (!ok && !ctx.state.transition) {
        console.log(`  pass ${i}: the frame message does not match the memory: `
                    +JSON.stringify(Object.assign({}, frame, {screen: frame && !!frame.screen, jim: undefined}))
                    +` pass ${ctx.state.pass}, hold ${m[0x5BD3]}, key ${m[0xF241]}`);
        return {checks, diffs: 1, passes: i};
      }
    } else {
      checks++;
      if (!messages.some((msg) => msg.id === 'gameOver')) {
        console.log(`  pass ${i}: end of the game without a gameOver message`);
        return {checks, diffs: 1, passes: i};
      }
      return {checks, diffs: 0, passes: i+1, events, lockHits, ticks, rounds};
    }
  }
  return {checks, diffs: 0, passes: inputs.length, events, lockHits, ticks, rounds};
}

async function main() {
  const args = process.argv.slice(2);
  const options = {verbose: args.includes('--verbose'), lock: !args.includes('--no-lock')};
  // the recordings of tools/tracephysics.py that start with an untouched new
  // game go as well (the others write numbers into the memory first)
  let games;
  if (args.includes('--base')) {
    const base = path.resolve(ROOT, args[args.indexOf('--base')+1]);
    const names = args.includes('--name') ? [args[args.indexOf('--name')+1]]
      : fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'inputs.json'))).sort();
    games = names.map((name) => [name, path.join(base, name)]);
  } else {
    const rules = path.join(ROOT, 'build/rules');
    if (!fs.existsSync(rules)) {
      console.log('build/rules/ is missing – ./tools/tracerules.py');
      process.exit(2);
    }
    games = fs.readdirSync(rules).filter((d) => fs.existsSync(path.join(rules, d, 'inputs.json'))).sort()
      .map((name) => [name, path.join(rules, name)])
      .concat(NEW_GAME_TRACES.map((name) => [name, path.join(ROOT, 'build/trace', name)]));
    if (args.includes('--name')) {
      games = games.filter(([name]) => name === args[args.indexOf('--name')+1]);
    }
  }
  const INIT = await initData();
  let checks = 0, diffs = 0, total = 0;
  for (const [name, dir] of games) {
    const r = await runGame(name, dir, INIT, options);
    console.log(`${name.padEnd(8)} ${String(r.passes).padStart(6)} passes, ${r.checks} checks, ${r.diffs} differences`);
    if (r.events) {
      const e = r.events;
      const counts = Object.keys(e).filter((k) => typeof e[k] === 'number').sort()
        .map((k) => `${k} ${e[k]}`).join(', ');
      console.log(`         ${counts}`);
      console.log(`         new round (gold key) ${r.rounds}×; distinct pieces of booty ${e.treasures.size}, `
                  +`doors opened ${e.doors.size}, edges of the ship ${e.edges.size}`);
      if (options.verbose) {
        console.log(`         edges: ${[...e.edges].sort((a, b) => parseInt(a)-parseInt(b) || a.localeCompare(b)).join(' ')}`);
        console.log(`         doors (hold/number): ${[...e.doors].sort((a, b) => parseInt(a)-parseInt(b)).join(' ')}`);
      }
      console.log(`         ENTER_LOCK_FRAMES would have struck ${r.lockHits}×; worker ticks ${r.ticks}`);
    }
    checks += r.checks;
    diffs += r.diffs;
    total += r.passes;
  }
  console.log(`total ${total} passes, ${checks} checks, **${diffs} differences**`);
  process.exit(diffs ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
