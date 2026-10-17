#!/usr/bin/env node
/**
 * Projde celou smyčku workeru bez prohlížeče.
 *
 *   ./tools/runworker.mjs [--verbose]
 *
 * `app/gameWorker.js` se spustí v atrapě prostředí workeru (postMessage,
 * setTimeout, Date, importScripts – `bootyLogic.js` se načte doopravdy)
 * s daty, která mu dává model: `data/global.json#memory`, ROM font ze svision,
 * `data/global.json#transition`. Kontroluje se:
 *
 * - **start**: worker odpoví na `init` snímkem a jeho obrazovka je **bajt
 *   po bajtu obrazovka originálu na začátku prvního průchodu**
 *   (`build/trace/walk/init.bin`); panel: podpalubí 1, tři životy, kořist
 *   0 / 125, klíč 0
 * - **tempo**: průchod se pouští konstantně, jednou za `passTStates`
 *   T-stavů snímků (`PASS_TSTATES` workeru) – za 1000 tiků tolik průchodů,
 *   kolik z toho vyjde, a obrazovka chodí jen se snímkem, ve kterém průchod
 *   proběhl
 * - **klávesy**: akce se přeloží na klávesy originálu (`$5BEB`) a ROM
 *   `KEY-SCAN` – Jim jde vpravo, když se drží „vpravo“
 * - **semínko**: stav `$F343` dorazí a dva běhy s týmž semínkem a týmiž
 *   klávesami dají tentýž stav
 * - ★ **hodiny**: s podstrčeným časem tik po `TICK_MS` workeru, nikdy víc než
 *   jeden naplánovaný časovač, pauza, dvojí `continue`, výpadek karty (bez
 *   akumulátoru se nic nedohání: po výpadku jeden tik)
 * - **přechod dveřmi** (`data/global.json#transition`): Jim před dveřmi s drženým
 *   vstupem – průchod změní podpalubí, worker pak snímek po snímku ukazuje
 *   mazání, černo a nové podpalubí (`BootyLogic.transitionScreen`), border
 *   se změní až s ním, další průchod počká, a držený vstup se ještě
 *   `ENTER_LOCK_FRAMES` snímků po přechodu nepočítá
 * - `reset` zastaví a zahodí stav
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
    console.log('  CHYBA: '+label);
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
  check(first && first.id === 'frame', 'init odpovědělo snímkem');
  check(first && first.screen && first.screen.length === 6912, 'snímek po init nese obrazovku');
  const init = fs.readFileSync(path.join(ROOT, 'build/trace/walk/init.bin'));
  const same = first && first.screen && first.screen.every((b, i) => b === init[0x4000+i]);
  check(same, 'obrazovka po init = obrazovka originálu na začátku prvního průchodu (walk/init.bin)');
  check(first && first.hold === 1, 'hra začíná v podpalubí 1');
  check(first && first.panel.lives === 3 && first.panel.key === 0, 'tři životy, klíč 0');
  check(first && first.panel.booty === 0 && first.panel.treasure === 125, 'kořist 0 / 125');
  check(first && first.rand === 0, 'semínko 0 = stav $F343 po nahrání');
  check(first && first.border === 0, 'border podpalubí 1 je černý');

  // --- tempo: one pass per passTStates of frames
  const ticks = 1000;
  const { worker: w2, messages: m2 } = run({seed: 0}, ticks);
  const passTStates = w2.context.PASS_TSTATES;
  const expected = Math.floor(ticks*69888/passTStates);
  const last = m2[m2.length-1];
  check(last.pass === expected, `za ${ticks} tiků ${expected} průchodů (je ${last.pass})`);
  check(last.frame === ticks, `počítadlo snímků ${ticks} (je ${last.frame})`);
  const withScreen = m2.slice(1).filter((msg) => msg.screen).length;
  check(withScreen === expected, `obrazovka jen se snímkem, ve kterém proběhl průchod (${withScreen})`);

  // --- keys: holding right walks Jim right (C goes down)
  const right = run({seed: 0}, 200, {20: {right: true}});
  const startC = right.messages[0].jim[0];
  const endC = right.messages[right.messages.length-1].jim[0];
  check(endC < startC, `drží se „vpravo“: Jim jde vpravo (C ${startC} → ${endC})`);
  const left = run({seed: 0}, 200, {20: {left: true}});
  check(left.messages[left.messages.length-1].jim[0] > startC, 'drží se „vlevo“: Jim jde vlevo');
  const both = run({seed: 0}, 200, {20: {left: true, right: true}});
  check(JSON.stringify(both.messages[both.messages.length-1].jim) === JSON.stringify(left.messages[left.messages.length-1].jim),
        'vlevo a vpravo naráz = co vrátí KEY-SCAN (5 je v řadě $F7FE dřív než 8)');

  // --- seed and determinism
  const a = run({seed: 0x1234}, 400, {10: {right: true}, 200: {right: false, up: true}});
  const b = run({seed: 0x1234}, 400, {10: {right: true}, 200: {right: false, up: true}});
  check(a.messages[0].rand === 0x1234, 'semínko je počáteční stav $F343');
  check(JSON.stringify(a.messages[a.messages.length-1]) === JSON.stringify(b.messages[b.messages.length-1]),
        'tentýž seed a tytéž klávesy dají tentýž stav');

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
  check(at > 0, 'držený vstup před dveřmi vede do podpalubí 2');
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
          'v prvním snímku přechodu je ještě staré podpalubí i border');
    check(blackFrames >= 4, `obraz je několik snímků černý (${blackFrames})`);
    // délka přechodu: mazání a konec TRANSITION_SLOWDOWN× pomaleji, černo
    // jako originál (tools/tracetransition.py), + průchod
    const length = doorWorker.context.transitionLength(times)/69888;
    check(frames >= Math.floor(length) && frames <= Math.ceil(length)+3,
          `další průchod počká na konec přechodu (${frames} snímků, přechod ${length.toFixed(1)})`);
    const blackOriginal = (times.copy-times.black)/69888;
    check(Math.abs(seen.slice(at, end).filter(black).length-blackOriginal) <= 2,
          `černo trvá jako v originálu (${blackOriginal.toFixed(1)} snímku)`);
    const firstBlack = seen.findIndex((msg, i) => i >= at && black(msg));
    const shownAt = seen.findIndex((msg, i) => i > firstBlack && msg.screen && !black(msg));
    check(seen.slice(at, shownAt+1).every((msg) => msg.screen), 'během přechodu nese obrazovku každý snímek');
    check(shownAt > at && seen.slice(at, shownAt).every((msg) => msg.border === seen[at].border),
          'border se změní až s novým podpalubím');
    const lock = doorWorker.context.ENTER_LOCK_FRAMES;
    check(seen.slice(shownAt, shownAt+lock).every((msg) => msg.hold === 2) && seen.length > shownAt+lock,
          `držený vstup se po přechodu ještě ${lock} snímků nepočítá (zůstává podpalubí 2)`);
    check(!black(seen[shownAt]) && seen.slice(shownAt+1, end).every((msg) => !msg.screen || !black(msg)),
          'přechod skončil novým podpalubím');
    if (verbose) {
      console.log(`přechod: od snímku ${at}, ${frames} snímků, černých ${blackFrames}, podpalubí vidět od ${shownAt}`);
    }
  }

  // --- reset
  const before = messages.length;
  worker.send({id: 'reset'});
  worker.send({id: 'tick'});
  check(messages.length === before, 'reset zastaví headless tikání');

  // --- the clock (R-046)
  const live = [];
  const clocked = startWorker((message) => live.push(message));
  clocked.send({id: 'init', initData: Object.assign({headless: false, seed: 0}, INIT)});
  clocked.advance(1000);
  const ticksDone = live[live.length-1].frame;
  TICK_MS = clocked.context.TICK_MS;
  const perSecond = Math.floor(1000/TICK_MS);
  check(ticksDone === perSecond, `za vteřinu ${perSecond} tiků po ${TICK_MS} ms (je ${ticksDone})`);
  clocked.advance(10000);
  const tenSeconds = live[live.length-1].frame-ticksDone;
  check(Math.abs(tenSeconds-Math.round(10000/TICK_MS)) <= 1,
        `za deset vteřin ${Math.round(10000/TICK_MS)} tiků (je ${tenSeconds})`);
  check(clocked.clock.maxPending === 1, `nikdy víc než jeden naplánovaný časovač (bylo ${clocked.clock.maxPending})`);
  clocked.send({id: 'pause'});
  const paused = live.length;
  clocked.advance(1000);
  check(live.length === paused, 'pause zastaví hodiny');
  check(clocked.clock.timers.length === 0, 'po pause nezůstal naplánovaný časovač');
  clocked.send({id: 'continue'});
  clocked.send({id: 'continue'});
  check(clocked.clock.timers.length === 1, 'continue dvakrát nezaloží dvoje hodiny');
  const resumed = live[live.length-1].frame;
  clocked.advance(1000);
  check(Math.abs(live[live.length-1].frame-resumed-perSecond) <= 1, `po continue zase ${perSecond} tiků za vteřinu`);
  const stalled = live[live.length-1].frame;
  clocked.clock.timers[0].at = clocked.clock.now+10000;
  clocked.advance(10000+TICK_MS, 1);
  check(live[live.length-1].frame-stalled <= 5, 'po výpadku nejvýš čtyři tiky naráz');
  clocked.send({id: 'reset'});
  check(clocked.clock.timers.length === 0, 'reset zastaví hodiny');

  if (verbose) { console.log(JSON.stringify(last).slice(0, 300)); }
  console.log(`${checks} kontrol, **${failures} chyb**`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
