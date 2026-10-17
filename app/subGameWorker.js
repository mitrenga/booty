// begin code

/**
 * The worker of the SECRET SUB GAME — the original's hidden CATCH 20
 * GOLDFISH (`$CF36`, sources/docs/secondary_findings.md §7), played
 * (operator's decision 2026-10-09). The sibling of gameWorker.js: it keeps
 * the hidden game's memory, 64 KB laid out as the original's, runs its main
 * loop through goldfishLogic.js and sends the screen back; subGameModel.js
 * sends it the controls and draws.
 *
 * ★ **The hidden game is the original's, pass for pass**: the same
 * goldfishLogic.js, from the same memory (data/global.json#goldfish and the ROM
 * font), is checked by tools/matchgoldfish.mjs against the original run in a
 * Z80 simulator, the diver's keys and rows 22-23 (FISH, AIR) included — 0
 * differences.
 *
 * Messages, as gameWorker.js has them (WORKER-PROTOCOL.md):
 *
 * - model → worker: `init` {initData: {memory, romFont, inkPlane, scenery}},
 *   `controls` {left, right, up, down}, `pause`, `continue`, `reset`
 * - worker → model: `frame` {frame, pass, screen?, ink?, scenery?, sounds,
 *   fish, air},
 *   `won` when the goldfish caught reach the target (★ `$CF3E` → `$D08A`:
 *   the original starts Booty then), `error`
 *
 * **The clock.** A tick is an interrupt of the original (19.968 ms); one
 * pass of the main loop every `passTStates` T-states of ticks — ★ the
 * median pass of the original without the tune and the sounds
 * (data/global.json#goldfish, tools/mkgoldfish.py), 6.15 frames. As in the game,
 * the rate is constant: the original's BEEPERs and the noise of the air
 * stop its CPU, the remake's sound plays in its own thread. The clock is a
 * recursive `setTimeout`, one tick a call, no accumulator (R-046, as
 * gameWorker.js).
 */

var query = (typeof self !== 'undefined' && self.location) ? self.location.search : '';
importScripts('svision/js/platform/canvas2D/zxSpectrum/zxRomDraw.js'+query);
importScripts('goldfishLogic.js'+query);
// ROM KEY-SCAN (BootyLogic.keyScan): the machine's, shared with the game
importScripts('bootyLogic.js'+query);

// one tick = one interrupt of the original
var TICK_MS = 20;
var FRAME_T = 69888;
// ★ the keys the hidden game reads ($D579 compares KEY-SCAN's E with
// $5BEB-$5BEE: left, right, up, down) — the original's defaults 5 8 7 6, as
// the menu leaves them (disasm_notes.md §8); the remake's own keys are
// mapped onto them
var KEY_CODES = {left: 0x04, right: 0x13, up: 0x0B, down: 0x03};

var state = null;
var logic = null;
var timer = null;

function base64(text) {
  var binary = atob(text);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
} // base64

function reset() {
  clearTimeout(timer);
  timer = null;
  logic = null;
  state = {
    running: false, paused: false, won: false,
    frame: 0,
    pass: 0,
    passT: 0,
    passTStates: 429624,
    controls: {left: false, right: false, up: false, down: false},
    sounds: []
  };
} // reset

/**
 * `$D579`: the key of the diver ROM KEY-SCAN would give for the actions
 * held, as a direction — one a pass.
 * @returns {string|null} 'left', 'right', 'up', 'down' or null.
 */
function heldKey() {
  var codes = Object.keys(KEY_CODES).filter((action) => state.controls[action]).map((action) => KEY_CODES[action]);
  var e = BootyLogic.keyScan(codes);
  var actions = ['left', 'right', 'up', 'down'];
  for (var i = 0; i < actions.length; i++) {
    if (e === KEY_CODES[actions[i]]) {
      return actions[i];
    }
  }
  return null;
} // heldKey

/**
 * The frame the model draws.
 * @param {boolean} withScreen - Whether a pass ran since the last one.
 * @returns {Object} The 'frame' message.
 */
function frame(withScreen) {
  var m = logic.m;
  var message = {
    id: 'frame',
    frame: state.frame,
    pass: state.pass,
    controls: state.controls,
    sounds: state.sounds.splice(0, state.sounds.length),
    // ★ the catch ($DB42) and the air ($D33E, 19 when full)
    fish: m[0xDB42],
    air: m[0xD33E]
  };
  if (withScreen) {
    message.screen = m.slice(0x4000, 0x5B00);
    // the ink plane beside it, when the model asked for one (R-036)
    if (logic.ink) {
      message.ink = logic.ink.slice();
    }
    // the ships and the sand, for the menu to go on from
    message.scenery = logic.scenery();
  }
  return message;
} // frame

/** one pass of the main loop; false when the hidden game is won */
function runPass() {
  var outcome = logic.pass();
  state.pass++;
  logic.events.forEach((event) => state.sounds.push(event));
  if (outcome === 'won') {
    state.won = true;
    state.running = false;
    stopClock();
    postMessage(frame(true));
    postMessage({id: 'won', fish: logic.m[0xDB42]});
    return false;
  }
  return true;
} // runPass

function tick() {
  state.frame++;
  state.passT += FRAME_T;
  var drawn = false;
  while (state.passT >= state.passTStates) {
    state.passT -= state.passTStates;
    if (!runPass()) {
      return;
    }
    drawn = true;
  }
  if (drawn) {
    postMessage(frame(true));
  }
} // tick

function schedule() {
  if (!state.running || state.paused) {
    return;
  }
  timer = setTimeout(() => {
    if (timer === null) {
      return;
    }
    tick();
    schedule();
  }, TICK_MS);
} // schedule

function stopClock() {
  clearTimeout(timer);
  timer = null;
} // stopClock

onmessage = function(event) {
  var message = event.data;
  switch (message.id) {

    case 'init':
      reset();
      var initData = message.initData || {};
      if (!initData.memory || !initData.memory.segments || !initData.romFont) {
        postMessage({id: 'error', message: 'sub game data missing (data/global.json#goldfish)'});
        return;
      }
      if (initData.memory.passTStates) {
        state.passTStates = initData.memory.passTStates;
      }
      // ★ the memory as the original's at its first `$CF36`, the ROM font at
      // $3D00 for the digits of the catch (CHARS $3C00)
      var memory = new Uint8Array(65536);
      memory.set(initData.romFont, 0x3D00);
      initData.memory.segments.forEach((segment) => {
        memory.set(base64(segment.bytes), segment.address);
      });
      logic = new GoldfishLogic(memory, {animateDiver: true, panel: true, input: heldKey, inkPlane: !!initData.inkPlane});
      // the ships and the sand where the menu left them (GoldfishLogic#scenery)
      logic.setScenery(initData.scenery);
      // ★ the memory is the original's before its first pass, and the sand
      // (`$D8E2`) and the panel are printed by the pass: one pass now, so the
      // first frame has them (as the menu does, menuModel.js initGoldfish)
      runPass();
      state.running = true;
      postMessage(frame(true));
      schedule();
      break;

    case 'controls':
      Object.keys(state.controls).forEach((key) => {
        if (key in message) {
          state.controls[key] = !!message[key];
        }
      });
      break;

    case 'pause':
      state.paused = true;
      stopClock();
      break;

    case 'continue':
      if (state.paused) {
        state.paused = false;
        schedule();
      }
      break;

    case 'reset':
      reset();
      break;

  } // switch
}; // onmessage

reset();
