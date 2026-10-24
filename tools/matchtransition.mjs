#!/usr/bin/env node
/**
 * Compares what is visible during a door transition in the remake and in the original.
 *
 *   ./tools/tracetransition.py && ./tools/mktransition.mjs && ./tools/matchtransition.mjs [--verbose]
 *
 * The original: the screens at the end of the frames of the transition into
 * holds 1–20, without the tune (`tools/tracetransition.py`). The remake:
 * `BootyLogic.goToHold` from the original's memory at the moment of `$EE84`
 * and `BootyLogic.transitionScreen` with the times from
 * `data/global.json#transition` – at the same T-states from `$EE84` as the
 * original's frames. The screen bytes are compared; only in the black phase
 * (all attributes 0) matching attributes suffice: the original draws pixels
 * under them that are not visible.
 *
 * What is measured is **time**: for every frame of the original the nearest
 * moment is sought at which the remake shows exactly the same picture (within
 * ±`WINDOW` T in steps of `STEP` T). A pixel match at the same T would need
 * the interrupt placed to the T-state – but the phase of the transition
 * against the frame is arbitrary in the remake anyway (the pass runs at a
 * constant pace). A frame for which the remake has no such picture at all is
 * a **difference**.
 *
 * Frames after the end of printing the panel (`$EEA2`) are not compared – the
 * rest of the pass is an ordinary pass. ? The original prints the panel
 * character by character over about half a frame, the remake shows it at
 * once: rows 22–23 do not count during the printing.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {createRequire} from 'node:module';
import {holdCost, loadRecord} from './mktransition.mjs';
import { readSection } from './jsonformat.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require = createRequire(import.meta.url);
const loadClassicScript = require(path.join(ROOT, 'app/svision/tools/classicScript.cjs'));
const BootyLogic = loadClassicScript(path.join(ROOT, 'app/bootyLogic.js'));
const EEA2 = 7;
const WINDOW = 6000;
const STEP = 4;

/**
 * Is the same thing visible? With all attributes zero the picture is black
 * whatever the pixels are (the original draws the hold under them); otherwise
 * every byte must match. `limit` – the end of the compared attributes:
 * `$1AC0` means without the panel (its pixels included).
 */
function sameView(theirs, ours, limit) {
  let black = true;
  for (let k = 0x1800; k < limit; k++) {
    if (theirs[k] !== ours[k]) {
      return false;
    }
    if (theirs[k] & 0x3F) {
      black = false;
    }
  }
  if (black) {
    return true;
  }
  for (let k = 0; k < 0x1800; k++) {
    if (theirs[k] !== ours[k] && (limit === 0x1B00 || !inPanel(k))) {
      return false;
    }
  }
  return true;
}

/** a pixel byte in rows 22–23 (the panel) */
function inPanel(k) {
  return k >= 0x1000 && (k & 0xE0) >= 0xC0;
}

function main() {
  const verbose = process.argv.includes('--verbose');
  const record = loadRecord();
  const data = readSection('transition');
  let frames = 0, errors = 0, worst = 0;
  Object.keys(record.holds).forEach((hold) => {
    const ref = record.holds[hold];
    const logic = holdCost(hold);
    const tr = logic.transition;
    const times = BootyLogic.transitionTimes(tr, data);
    const final = logic.m.slice(0x4000, 0x5B00);
    const end = ref.tstates[EEA2];
    const line = [];
    ref.frames.forEach(([t, b64]) => {
      if (t >= end) {
        return;
      }
      const theirs = Buffer.from(b64, 'base64');
      const same = (when) => sameView(theirs,
        BootyLogic.transitionScreen(tr, times, data, when, final).screen,
        // ? the panel (rows 22–23): the original prints it character by character
        when >= times.shown ? 0x1AC0 : 0x1B00);
      frames++;
      let found = null;
      for (let d = 0; d <= WINDOW && found === null; d += STEP) {
        if (same(t-d)) {
          found = -d;
        } else if (d && same(t+d)) {
          found = d;
        }
      }
      if (found === null) {
        errors++;
        line.push(`${(t/69888).toFixed(2)}:DIFFERENCE`);
      } else {
        worst = Math.max(worst, Math.abs(found));
        line.push(`${(t/69888).toFixed(2)}:${found > 0 ? '+' : ''}${found}`);
      }
    });
    if (verbose) {
      console.log(`hold ${String(hold).padStart(2)}  ${line.join('  ')}`);
    }
  });
  console.log(`${frames} frames in ${Object.keys(record.holds).length} transitions, **${errors} differences**; `+
              `the remake shows the original's picture at most ${worst} T (${(worst/69888).toFixed(3)} frames) off`);
  process.exit(errors ? 1 : 0);
}

main();
