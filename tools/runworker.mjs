#!/usr/bin/env node
/**
 * Runs the whole worker loop without a browser.
 *
 *   ./tools/runworker.mjs [--verbose]
 *
 * `app/gameWorker.js` is started in a mock worker environment (postMessage,
 * setTimeout, Date, importScripts – `bootyLogic.js` is loaded for real)
 * with the data the model gives it: `data/global.json#memory`, the ROM font
 * from svision, `data/global.json#transition`. Checked:
 *
 * - **start**: the worker answers `init` with a frame and its screen is
 *   **byte for byte the original's screen at the start of the first pass**
 *   (`build/trace/walk/init.bin`); panel: hold 1, three lives, booty
 *   0 / 125, key 0
 * - **pace**: the pass runs at a constant rate, once every `passTStates`
 *   T-states of frames (the worker's `PASS_TSTATES`) – in 1000 ticks as
 *   many passes as that gives, and the screen comes only with the frame in
 *   which a pass ran
 * - **keys**: actions are translated into the original's keys (`$5BEB`) and
 *   ROM `KEY-SCAN` – Jim walks right while "right" is held
 * - **seed**: the state `$F343` arrives and two runs with the same seed and
 *   the same keys give the same state
 * - ★ **clock**: with a substituted time a tick every `TICK_MS` of the worker,
 *   never more than one scheduled timer, pause, a double `continue`, a tab
 *   stall (no accumulator, so nothing is caught up: one tick after a stall)
 * - **door transition** (`data/global.json#transition`): Jim in front of a door
 *   with enter held – the pass changes the hold, the worker then shows frame
 *   by frame the clearing, the black and the new hold
 *   (`BootyLogic.transitionScreen`), the border changes only with it, the
 *   next pass waits, and the held enter does not count for another
 *   `ENTER_LOCK_FRAMES` frames after the transition
 * - `reset` stops and drops the state
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, initData, startWorker } from './workersandbox.mjs';

// the worker's own constant (TICK_MS in app/gameWorker.js), read from it
let TICK_MS = null;

let INIT = null;

let checks = 0, failures = 0;
function check(condition, label) {
  checks++;
  if (!condition) {
    failures++;
    console.log('  FAIL: '+label);
  }
}

function run(extra, ticks, controlsAt) {
  const messages = [];
  const worker = startWorker((message) => messages.push(message));
  worker.send({id: 'init', initData: Object.assign({headless: true}, INIT, extra || {})});
  for (let t = 0; t < ticks; t++) {
    if (controlsAt && controlsAt[t]) { worker.send(Object.assign({id: 'controls'}, controlsAt[t])); }
    worker.send({id: 'tick'});
  }
  return {worker, messages};
}

async function main() {
  INIT = await initData();
  const verbose = process.argv.includes('--verbose');

  // --- start
  const { worker, messages } = run({seed: 0}, 0);
  const first = messages[0];
  check(first && first.id === 'frame', 'init answered with a frame');
  check(first && first.screen && first.screen.length === 6912, 'the frame after init carries the screen');
  const init = fs.readFileSync(path.join(ROOT, 'build/trace/walk/init.bin'));
  const same = first && first.screen && first.screen.every((b, i) => b === init[0x4000+i]);
  check(same, 'the screen after init = the original\'s screen at the start of the first pass (walk/init.bin)');
  check(first && first.hold === 1, 'the game starts in hold 1');
  check(first && first.panel.lives === 3 && first.panel.key === 0, 'three lives, key 0');
  check(first && first.panel.booty === 0 && first.panel.treasure === 125, 'booty 0 / 125');
  check(first && first.rand === 0, 'seed 0 = the state of $F343 after loading');
  check(first && first.border === 0, 'the border of hold 1 is black');

  // --- tempo: one pass per passTStates of frames
  const ticks = 1000;
  const { worker: w2, messages: m2 } = run({seed: 0}, ticks);
  const passTStates = w2.context.PASS_TSTATES;
  const expected = Math.floor(ticks*69888/passTStates);
  const last = m2[m2.length-1];
  check(last.pass === expected, `${expected} passes in ${ticks} ticks (got ${last.pass})`);
  check(last.frame === ticks, `frame counter ${ticks} (got ${last.frame})`);
  const withScreen = m2.slice(1).filter((msg) => msg.screen).length;
  check(withScreen === expected, `the screen only with the frame in which a pass ran (${withScreen})`);

  // --- keys: holding right walks Jim right (C goes down)
  const right = run({seed: 0}, 200, {20: {right: true}});
  const startC = right.messages[0].jim[0];
  const endC = right.messages[right.messages.length-1].jim[0];
  check(endC < startC, `"right" held: Jim walks right (C ${startC} → ${endC})`);
  const left = run({seed: 0}, 200, {20: {left: true}});
  check(left.messages[left.messages.length-1].jim[0] > startC, '"left" held: Jim walks left');
  const both = run({seed: 0}, 200, {20: {left: true, right: true}});
  check(JSON.stringify(both.messages[both.messages.length-1].jim) === JSON.stringify(left.messages[left.messages.length-1].jim),
        'left and right at once = what KEY-SCAN returns (5 comes before 8 in row $F7FE)');

  // --- seed and determinism
  const a = run({seed: 0x1234}, 400, {10: {right: true}, 200: {right: false, up: true}});
  const b = run({seed: 0x1234}, 400, {10: {right: true}, 200: {right: false, up: true}});
  check(a.messages[0].rand === 0x1234, 'the seed is the initial state of $F343');
  check(JSON.stringify(a.messages[a.messages.length-1]) === JSON.stringify(b.messages[b.messages.length-1]),
        'the same seed and the same keys give the same state');

  // --- a door: the change of hold the way the original shows it
  const seen = [];
  const doorWorker = startWorker((message) => seen.push(message));
  doorWorker.send({id: 'init', initData: Object.assign({headless: true, seed: 0}, INIT)});
  {
    // as tools/tracephysics.py to_hold(2): the first big door of hold 1 leads
    // to hold 2 and Jim stands in front of it
    const mem = doorWorker.context.logic.m;
    const door = mem[0x5BD6] | (mem[0x5BD7] << 8);
    mem[door+3] = 2;
    const c = mem[door], b = (mem[door+1]-1) & 0xFF;
    [[0xF231, c], [0xF232, b], [0xF23E, c], [0xF23F, b]].forEach(([at, v]) => { mem[at] = v; });
  }
  doorWorker.send({id: 'controls', enter: true});
  let times = null;
  for (let t = 0; t < 300; t++) {
    doorWorker.send({id: 'tick'});
    if (!times && doorWorker.context.state.transition) {
      times = doorWorker.context.state.transition.times;
    }
  }
  const at = seen.findIndex((msg) => msg.hold === 2);
  check(at > 0, 'enter held in front of the door leads into hold 2');
  if (at > 0) {
    const black = (msg) => msg.screen && msg.screen.subarray(0x1800).every((v) => v === 0);
    const passAt = seen[at].pass;
    let end = at;
    while (end < seen.length && seen[end].pass === passAt) {
      end++;
    }
    const frames = end-at;
    const blackFrames = seen.slice(at, end).filter(black).length;
    check(!black(seen[at]) && seen[at].border === seen[at-1].border,
          'the first frame of the transition still has the old hold and border');
    check(blackFrames >= 4, `the picture is black for several frames (${blackFrames})`);
    // the length of the transition: the clearing and the end TRANSITION_SLOWDOWN×
    // slower, the black as in the original (tools/tracetransition.py), + a pass
    const length = doorWorker.context.transitionLength(times)/69888;
    check(frames >= Math.floor(length) && frames <= Math.ceil(length)+3,
          `the next pass waits for the end of the transition (${frames} frames, transition ${length.toFixed(1)})`);
    const blackOriginal = (times.copy-times.black)/69888;
    check(Math.abs(seen.slice(at, end).filter(black).length-blackOriginal) <= 2,
          `the black lasts as in the original (${blackOriginal.toFixed(1)} frames)`);
    const firstBlack = seen.findIndex((msg, i) => i >= at && black(msg));
    const shownAt = seen.findIndex((msg, i) => i > firstBlack && msg.screen && !black(msg));
    check(seen.slice(at, shownAt+1).every((msg) => msg.screen), 'every frame during the transition carries the screen');
    check(shownAt > at && seen.slice(at, shownAt).every((msg) => msg.border === seen[at].border),
          'the border changes only with the new hold');
    const lock = doorWorker.context.ENTER_LOCK_FRAMES;
    check(seen.slice(shownAt, shownAt+lock).every((msg) => msg.hold === 2) && seen.length > shownAt+lock,
          `the held enter does not count for another ${lock} frames after the transition (hold 2 stays)`);
    check(!black(seen[shownAt]) && seen.slice(shownAt+1, end).every((msg) => !msg.screen || !black(msg)),
          'the transition ended with the new hold');
    if (verbose) {
      console.log(`transition: from frame ${at}, ${frames} frames, ${blackFrames} black, the hold visible from ${shownAt}`);
    }
  }

  // --- reset
  const before = messages.length;
  worker.send({id: 'reset'});
  worker.send({id: 'tick'});
  check(messages.length === before, 'reset stops the headless ticking');

  // --- the clock (R-046)
  const live = [];
  const clocked = startWorker((message) => live.push(message));
  clocked.send({id: 'init', initData: Object.assign({headless: false, seed: 0}, INIT)});
  clocked.advance(1000);
  const ticksDone = live[live.length-1].frame;
  TICK_MS = clocked.context.TICK_MS;
  const perSecond = Math.floor(1000/TICK_MS);
  check(ticksDone === perSecond, `${perSecond} ticks of ${TICK_MS} ms in a second (got ${ticksDone})`);
  clocked.advance(10000);
  const tenSeconds = live[live.length-1].frame-ticksDone;
  check(Math.abs(tenSeconds-Math.round(10000/TICK_MS)) <= 1,
        `${Math.round(10000/TICK_MS)} ticks in ten seconds (got ${tenSeconds})`);
  check(clocked.clock.maxPending === 1, `never more than one scheduled timer (was ${clocked.clock.maxPending})`);
  clocked.send({id: 'pause'});
  const paused = live.length;
  clocked.advance(1000);
  check(live.length === paused, 'pause stops the clock');
  check(clocked.clock.timers.length === 0, 'no scheduled timer is left after pause');
  clocked.send({id: 'continue'});
  clocked.send({id: 'continue'});
  check(clocked.clock.timers.length === 1, 'continue twice does not start two clocks');
  const resumed = live[live.length-1].frame;
  clocked.advance(1000);
  check(Math.abs(live[live.length-1].frame-resumed-perSecond) <= 1, `after continue ${perSecond} ticks a second again`);
  const stalled = live[live.length-1].frame;
  clocked.clock.timers[0].at = clocked.clock.now+10000;
  clocked.advance(10000+TICK_MS, 1);
  check(live[live.length-1].frame-stalled <= 5, 'at most four ticks at once after a stall');
  clocked.send({id: 'reset'});
  check(clocked.clock.timers.length === 0, 'reset stops the clock');

  if (verbose) { console.log(JSON.stringify(last).slice(0, 300)); }
  console.log(`${checks} checks, **${failures} failures**`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
