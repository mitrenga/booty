#!/usr/bin/env node
/**
 * The door-transition times for the remake: `build/transition/` → `data/global.json#transition`.
 *
 *   ./tools/tracetransition.py && ./tools/mktransition.mjs
 *
 * ★ The measurement is from `tools/tracetransition.py`: the original, without
 * the tune, goes through a door into each of the holds 1–20 and records the
 * T-states of the stops and the progress of clearing the screen. From that:
 *
 * - `toCls` – from ENTER ROOM (`$EE84`) to ROM CL-LINE (`$A8DA`): a **model**
 *   `base + records × records + bytes × bytes` of the tables `$AAF4` and
 *   `$AB44` copy, least squares
 * - `cls` – the clearing: the length (mean, interrupts included) and 48
 *   blocks (24 pixel lines of the thirds of 256 B, 24 attribute rows of 32 B)
 *   with the T of their start and end from `$A8DA`; a block's start and end
 *   come from a line fitted to the times its bytes vanished (LDIR clears at
 *   a constant rate), in the profile without interrupts stretched to the
 *   length with them
 * - `draw` – how long the picture is black (`$A8DD` → `$AA85`): a **model**
 *   `base + glyph × chars + clSet × CL-SET + rst10 × RST $10`, least squares;
 *   the counts come from the **remake's** drawing (`BootyLogic#cost`) out of
 *   the original's memory at the moment of `$EE84`. The model's error is
 *   printed
 * - `attrCopy` (`$AA85` → `$AA90`) and `panel` (`$AA90` → `$EEA2`), mean
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {createRequire} from 'node:module';
import { writeSection } from './jsonformat.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SRC = path.join(ROOT, 'build/transition');
const FRAME = 69888;
const require = createRequire(import.meta.url);
const loadClassicScript = require(path.join(ROOT, 'app/svision/tools/classicScript.cjs'));
const BootyLogic = loadClassicScript(path.join(ROOT, 'app/bootyLogic.js'));

// the stops of tools/tracetransition.py
const [EE84, A900, A8DA, A8DD, AA85, AA90, E0AC, EEA2] = [0, 1, 2, 3, 4, 5, 6, 7];

export function holdCost(hold) {
  const name = path.join(SRC, `hold${String(hold).padStart(2, '0')}.bin`);
  const logic = new BootyLogic(new Uint8Array(fs.readFileSync(name)));
  logic.live = true;
  logic.goToHold(Number(hold));
  return logic;
}

export function loadRecord() {
  const file = path.join(SRC, 'global.json#transition');
  if (!fs.existsSync(file)) {
    console.error(`${file} is missing – run ./tools/tracetransition.py`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(file));
}

function mean(values) {
  return values.reduce((a, b) => a+b, 0)/values.length;
}

/** least squares: X (rows) × c = y */
function lstsq(X, y) {
  const n = X[0].length;
  const M = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      row.push(X.reduce((s, x) => s+x[i]*x[j], 0));
    }
    row.push(X.reduce((s, x, k) => s+x[i]*y[k], 0));
    M.push(row);
  }
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i+1; r < n; r++) {
      if (Math.abs(M[r][i]) > Math.abs(M[p][i])) {
        p = r;
      }
    }
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = 0; r < n; r++) {
      if (r !== i) {
        const f = M[r][i]/M[i][i];
        M[r] = M[r].map((v, k) => v-f*M[i][k]);
      }
    }
  }
  return M.map((row, i) => row[n]/row[i]);
}

function clsBlocks(record, duration) {
  const profile = record.cls;
  // ★ without interrupts; stretched to the length of the clearing with them
  const scale = duration/Math.max(...profile);
  const blocks = [];
  for (let line = 0; line < 8; line++) {
    for (let third = 0; third < 3; third++) {
      blocks.push([0x4000+third*0x800+line*0x100, 256]);
    }
  }
  for (let row = 0; row < 24; row++) {
    blocks.push([0x5800+row*32, 32]);
  }
  return blocks.map(([address, length]) => {
    const X = [], y = [];
    for (let k = 0; k < length; k++) {
      X.push([1, k]);
      // sampled every STEP: the byte vanished somewhere in the previous step
      y.push(profile[address-0x4000+k]-record.step/2);
    }
    const [a, b] = lstsq(X, y);
    return [address, length, Math.round(a*scale), Math.round((a+b*length)*scale)];
  }).sort((p, q) => p[2]-q[2]);
}

function main() {
  const record = loadRecord();
  const holds = Object.keys(record.holds);
  const t = (k) => holds.map((h) => record.holds[h].tstates[k]);
  const diff = (a, b) => t(b).map((v, i) => v-t(a)[i]);

  const costs = holds.map((h) => holdCost(h).transition);
  const black = diff(A8DD, AA85);
  const X = costs.map((c) => [1, c.glyph, c.clSet, c.rst10]);
  const [base, glyph, clSet, rst10] = lstsq(X, black);
  const errors = X.map((x, i) => base*x[0]+glyph*x[1]+clSet*x[2]+rst10*x[3]-black[i]);
  const pre = t(A8DA);
  const P = costs.map((c) => [1, c.records, c.bytes]);
  const [preBase, preRecords, preBytes] = lstsq(P, pre);
  const preErrors = P.map((x, i) => preBase+preRecords*x[1]+preBytes*x[2]-pre[i]);

  const out = {
    holds: holds.length,
    toCls: {base: Math.round(preBase), records: +preRecords.toFixed(2), bytes: +preBytes.toFixed(2)},
    cls: {duration: Math.round(mean(diff(A8DA, A8DD))),
          blocks: clsBlocks(record, mean(diff(A8DA, A8DD)))},
    draw: {base: Math.round(base), glyph: +glyph.toFixed(2), clSet: +clSet.toFixed(2),
           rst10: +rst10.toFixed(2)},
    attrCopy: Math.round(mean(diff(AA85, AA90))),
    panel: Math.round(mean(diff(AA90, EEA2)))
  };
  const where = writeSection('transition', out);
  const worst = Math.max(...errors.map(Math.abs));
  const preWorst = Math.max(...preErrors.map(Math.abs));
  console.log(`  model up to CL-LINE at most ±${preWorst.toFixed(0)} T`);
  console.log(`${where}: ${holds.length} holds; CL-LINE ${(out.cls.duration/FRAME).toFixed(2)} frames, `+
              `black ${(Math.min(...black)/FRAME).toFixed(2)}–${(Math.max(...black)/FRAME).toFixed(2)} frames, `+
              `model of the black at most ±${worst.toFixed(0)} T (${(worst/FRAME).toFixed(3)} frames)`);
  ['A900', 'E0AC'].forEach((name, i) => {
    const k = [A900, E0AC][i];
    const spread = diff(k-1, k);
    console.log(`  (check: $${name} − previous stop ${Math.min(...spread)}–${Math.max(...spread)} T)`);
  });
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  main();
}
