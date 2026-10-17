// begin code

/**
 * Booty game worker.
 *
 * It keeps the game — the original's own memory, 64 KB laid out as on the
 * machine — and runs its main loop through the port in bootyLogic.js
 * (sources/docs/physics.md); the model only sends it the controls and draws
 * the screen that comes back (WORKER-PROTOCOL.md).
 *
 * ★ **The game is the original's, pass for pass.** tools/matchphysics.mjs
 * runs bootyLogic.js against recordings of the original — the screen, the
 * variables, the objects and the holds compared after every pass, zero
 * differences — and tools/matchstart.mjs starts it from the data this worker
 * gets (data/global.json#memory) and finds the same game.
 *
 * **Two clocks.**
 *
 * - the **frame**, 50.08 Hz: the ULA interrupt. Every tick adds one to
 *   FRAMES ($5C78) in the memory, as the ROM's interrupt does — the game's
 *   timer reads it ($E12A)
 * - the **pass** of the main loop: ★ the original's does not wait for the
 *   frame, it takes as long as its work and the interrupts take (1.5 to 3.4
 *   frames). **The remake runs it at a constant rate** (operator's decision,
 *   2026-10-06; ZADANI chap. 10): one pass every `passTStates` T-states of
 *   frames, the original's average pass without the tune (PASS_TSTATES,
 *   tools/measurecadence.py) — 1.632 frames, 30.69 passes a second. The
 *   sound plays in its own thread and slows nothing
 *
 * ★ **A change of hold through a door takes its time** (operator's
 * decision 2026-10-07; ZADANI chap. 10). The original wipes the screen with
 * ROM CL-LINE, draws the new hold under black attributes and then copies
 * them, which is seen as a cut, 9 to 12 frames long without the tune. The
 * pass does it all at once; the worker then shows, frame by frame, what the
 * original showed (BootyLogic.transitionScreen, data/global.json#transition,
 * tools/matchtransition.mjs) and the next pass waits for it.
 *
 * The clock is a recursive `setTimeout` with a constant delay, one tick per
 * call and no accumulator (operator's decision 2026-10-07, a trial of
 * dropping R-046 point 3): what the browser adds to each delay makes the
 * game a little slower, which the eye does not see. `setInterval` is not
 * used anywhere (R-046).
 */

var query = (typeof self !== 'undefined' && self.location) ? self.location.search : '';
importScripts('bootyLogic.js'+query);

// one tick = one ULA interrupt of the original (19.968 ms there). ? 30 ms is
// the operator's choice by eye (2026-10-07), to be measured later; what
// counts ticks and should keep the original's time is adjusted on its own
// if needed (ZADANI chap. 10)
var TICK_MS = 25;
var FRAME_T = 69888;
// ★ one pass of the main loop every this many T-states of frames: the
// original's average pass without the tune, 114 056.95 T over 66 843 passes
// = 1.632 frames, 30.69 passes a second (tools/measurecadence.py checks it
// against the records of tools/tracephysics.py)
var PASS_TSTATES = 114057;
// remake's: after a change of hold the ENTER key is not seen for about half
// a second (25 interrupts), so a held key does not bounce Jim back through the
// door at once (ZADANI chap. 10, operator's decision 2026-10-07). ★ The
// original enters again on the very next pass
var ENTER_LOCK_FRAMES = 25;
// remake's: the change of hold is shown this many times slower than the
// original takes it (operator's decision 2026-10-07, ZADANI chap. 10); 1 =
// the original's pace. Only the wipe and what comes after the black: the
// black screen while the hold is drawn keeps the original's length
var TRANSITION_SLOWDOWN = 2;
// the original's T-states in one tick of real time (3.5 MHz): what the water
// of a drowning rises by, so that it keeps step with its sound, which the
// audio thread plays in real time
var REAL_T_PER_TICK = TICK_MS*3500;

/** the real time a change of hold takes, T-states (TRANSITION_SLOWDOWN) */
function transitionLength(times) {
  return times.end*TRANSITION_SLOWDOWN-(times.copy-times.black)*(TRANSITION_SLOWDOWN-1);
} // transitionLength

/** the original's T-states from ENTER ROOM for `w` T-states of real time */
function transitionTime(w, times) {
  var slow = TRANSITION_SLOWDOWN;
  if (w < times.black*slow) {
    return w/slow;
  }
  w -= times.black*slow;
  if (w < times.copy-times.black) {
    return times.black+w;
  }
  return times.copy+(w-(times.copy-times.black))/slow;
} // transitionTime

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
    running: false, paused: false, headless: false, over: false,
    // ★ interrupts since the start (FRAMES counts them in the memory too)
    frame: 0,
    // passes of the main loop
    pass: 0,
    // T-states of frames gathered towards the next pass
    passT: 0,
    passTStates: PASS_TSTATES,
    // the interrupt until which the ENTER key is not seen (ENTER_LOCK_FRAMES)
    enterLockUntil: 0,
    // data/global.json#transition, and the change of hold being shown: null when none
    transitionData: null,
    transition: null,
    // the water rising before a drowning is shown (drowningView): null when none
    drowning: null,
    hiScore: 0,
    // ★ the five actions of the original's DEFINE KEYS; what they are as
    // keys is read out of the memory ($5BEB-$5BEF) when a pass runs
    controls: {left: false, right: false, up: false, down: false, enter: false},
    outcome: 'pass',
    sounds: []
  };
} // reset

/** the key code ROM KEY-SCAN would give for the actions held */
function heldKey() {
  var m = logic.m;
  var codes = [];
  ['left', 'right', 'up', 'down', 'enter'].forEach((action, i) => {
    if (action === 'enter' && state.frame < state.enterLockUntil) {
      return;
    }
    if (state.controls[action]) {
      codes.push(m[0x5BEB+i]);
    }
  });
  return BootyLogic.keyScan(codes);
} // heldKey

/**
 * The frame the model draws: the screen as the game left it, the border,
 * the panel's numbers.
 * @param {boolean} withScreen - Whether the screen changed since the last one.
 * @returns {Object} The 'frame' message.
 */
function frame(withScreen) {
  var m = logic ? logic.m : null;
  var message = {
    id: 'frame',
    frame: state.frame,
    pass: state.pass,
    outcome: state.outcome,
    controls: state.controls,
    sounds: state.sounds.splice(0, state.sounds.length)
  };
  var shown = state.drowning ? drowningView() : (state.transition ? transitionView() : null);
  if (shown && !state.transition && withScreen) {
    // the change ended in the tick in which the next pass ran: the memory
    // is newer than the change's last view
    shown = null;
  }
  if (m) {
    message.rand = m[0xF343] | (m[0xF344] << 8);
    message.hold = m[0x5BD3];
    message.border = shown ? shown.border : logic.borderColour;
    message.panel = {
      lives: m[0x5BF1],
      booty: m[0x5BF4] | (m[0x5BF5] << 8),
      treasure: m[0x5BF2] | (m[0x5BF3] << 8),
      key: m[0xF241],
      // ★ the original keeps no score in points and has no hall of fame
      // (sources/docs/rules.md); the remake's hall of fame counts the booty
      // collected over the whole game (ZADANI chap. 6)
      score: m[0x5BF4] | (m[0x5BF5] << 8),
      hiScore: state.hiScore
    };
    message.jim = Array.from(m.subarray(0xF231, 0xF231+20));
    // ★ the continuous slots: $FFFF the creature (1 rat, 2 parrot), $FFFD
    // the explosion (1) and its splinters (2); 0 = off
    message.creature = m[0xFFFF];
    message.explosion = m[0xFFFD];
    if (shown) {
      message.screen = shown.screen.slice();
    } else if (withScreen) {
      message.screen = m.slice(0x4000, 0x5B00);
    }
  }
  return message;
} // frame

/** the water rising now (BootyLogic.drowningScreen); it ends when it is done */
function drowningView() {
  var dr = state.drowning;
  var view = BootyLogic.drowningScreen(dr.info, dr.w);
  if (dr.w >= dr.info.length) {
    state.drowning = null;
  }
  return view;
} // drowningView

/** what the screen shows of the change of hold now; it ends when it is done */
function transitionView() {
  var tr = state.transition;
  var t = transitionTime(tr.w, tr.times);
  var view = BootyLogic.transitionScreen(tr.info, tr.times, state.transitionData, t, tr.final);
  if (t >= tr.times.end) {
    state.transition = null;
  }
  return view;
} // transitionView

/** one pass of the main loop; false when the game is over */
function runPass() {
  var hold = logic.m[0x5BD3];
  var outcome = logic.pass({key: heldKey()});
  if (logic.m[0x5BD3] !== hold) {
    state.enterLockUntil = state.frame+ENTER_LOCK_FRAMES;
  }
  if (logic.drowning) {
    // ★ through the door into the sea: the water rises first, 4.5 s in which
    // the original does nothing else (the death's wipe comes after it)
    state.drowning = {info: logic.drowning, w: 0};
    var ticks = logic.drowning.length/REAL_T_PER_TICK;
    state.passT -= ticks*FRAME_T;
    state.enterLockUntil += Math.ceil(ticks);
  }
  if (logic.transition && logic.transition.shown && state.transitionData) {
    // the pass took the change of hold at once: show it the way the original
    // does, and let the next pass wait as long as it took (from ENTER ROOM,
    // which the pass reaches at its start)
    var times = BootyLogic.transitionTimes(logic.transition, state.transitionData);
    state.transition = {
      info: logic.transition, times: times, w: 0, final: logic.m.slice(0x4000, 0x5B00)
    };
    state.passT -= transitionLength(times);
    // the second without ENTER counts from when the new hold is there
    state.enterLockUntil += Math.ceil(transitionLength(times)/FRAME_T);
  }
  state.pass++;
  state.outcome = outcome;
  logic.events.forEach((event) => state.sounds.push(event));
  if (outcome === 'gameover') {
    state.over = true;
    state.running = false;
    stopClock();
    postMessage(frame(true));
    var m = logic.m;
    postMessage({id: 'gameOver', score: m[0x5BF4] | (m[0x5BF5] << 8)});
    return false;
  }
  return true;
} // runPass

/**
 * ★ The sound slots of the IM 2 handler `$FE69` (sources/docs/disasm_notes.md
 * §2, app/bootySound.js): what the handler plays on this interrupt, and the
 * slots it clears. The order is the original's and so is the rule that a
 * slot which plays — and `$FFFF` and `$FFFD` on every interrupt — leaves the
 * handler, so the ones behind wait: a one-shot set while a creature is on
 * plays when it is gone. The audio manager makes the sound; this only
 * decides it, as the handler does, and keeps the memory as it keeps it.
 */
function interrupt(push) {
  var m = logic.m;
  push = push || ((event) => state.sounds.push(event));
  // $F888: death after a fatal fall — both slots, then both cleared
  if (m[0xFFFB] && m[0xFFFC]) {
    push({id: 'death'});
    m[0xFFFB] = 0;
    m[0xFFFC] = 0;
    return true;
  }
  // $F80D, $F855: a creature, an explosion — continuous (frame.creature,
  // frame.explosion), and nothing behind them plays
  if (m[0xFFFF] || m[0xFFFD]) {
    return false;
  }
  // $F863: the one-shots 1-6, cleared once played; 7 and more play nothing
  var shot = m[0xFFFE];
  if (shot >= 1 && shot <= 6) {
    push({id: 'slot', value: shot});
    m[0xFFFE] = 0;
    return true;
  }
  return false;
} // interrupt

/**
 * The handler's turns inside a pass, before `$E058` clears the slots
 * (BootyLogic#silence): what it plays goes among the pass's own sounds, after
 * the BEEPER that came before it.
 * @returns {boolean} Whether it played something.
 */
function interruptInPass() {
  return interrupt((event) => logic.event(event.id, event));
} // interruptInPass

/**
 * One interrupt — one tick: FRAMES on by one, the handler's sound slots,
 * and a pass when the pass's T-states have gathered.
 */
function tick() {
  var m = logic.m;
  state.frame++;
  interrupt();
  var frames = (m[0x5C78] | (m[0x5C79] << 8) | (m[0x5C7A] << 16))+1;
  m[0x5C78] = frames & 0xFF;
  m[0x5C79] = (frames >> 8) & 0xFF;
  m[0x5C7A] = (frames >> 16) & 0xFF;
  state.passT += FRAME_T;
  if (state.drowning) {
    // the water first, in real time like its sound, then the change of hold
    // after the death
    state.drowning.w += REAL_T_PER_TICK;
  } else if (state.transition) {
    // real time; transitionTime makes the original's of it
    state.transition.w += FRAME_T;
  }
  var drawn = false;
  while (state.passT >= state.passTStates) {
    state.passT -= state.passTStates;
    if (!runPass()) {
      return;
    }
    drawn = true;
  }
  postMessage(frame(drawn));
} // tick

function schedule() {
  if (!state.running || state.paused || state.headless) {
    return;
  }
  timer = setTimeout(() => {
    // the message handler may have stopped the clock in the meantime
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
      state.headless = !!initData.headless;
      state.hiScore = initData.hiScore || 0;
      if (!initData.memory || !initData.romFont) {
        postMessage({id: 'error', message: 'game data missing (data/global.json#memory)'});
        return;
      }
      // without it a change of hold is seen at once
      state.transitionData = initData.transition || null;
      logic = new BootyLogic(BootyLogic.composeMemory(initData.memory, initData.romFont, base64));
      logic.interruptHook = interruptInPass;
      // ★ the seed is the state of the original's generator at $F343: $0000
      // after the tape has loaded, and it goes on from game to game
      var seed = (Number(initData.seed) || 0) & 0xFFFF;
      logic.m[0xF343] = seed & 0xFF;
      logic.m[0xF344] = seed >> 8;
      // ★ the demo is a new game with $5BF0 = 3 ($D602): Jim stands, any
      // key ends it, after 768 interrupts another hold (BootyLogic.demoPass)
      if (initData.demo) {
        logic.m[0x5BF0] = 3;
      }
      logic.newGame();
      // ? test only (GameModel.TEST_START_HOLD): another hold to start in,
      // entered the way a door enters it
      if (initData.startHold) {
        // Jim placed first, as tools/tracephysics.py `to_hold` does: his
        // place and the place he is remembered at (+13, +14)
        if (initData.startAt) {
          logic.m[0xF231] = logic.m[0xF23E] = initData.startAt[0] & 0xFF;
          logic.m[0xF232] = logic.m[0xF23F] = initData.startAt[1] & 0xFF;
        }
        logic.goToHold(initData.startHold & 0xFF);
      }
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

    case 'tick':
      if (state.headless && state.running) {
        tick();
      }
      break;

    case 'reset':
      reset();
      break;

  } // switch
}; // onmessage

reset();
