#!/usr/bin/env node
/**
 * Časy přechodu dveřmi pro remake: `build/transition/` → `data/global.json#transition`.
 *
 *   ./tools/tracetransition.py && ./tools/mktransition.mjs
 *
 * ★ Měření je z `tools/tracetransition.py`: originál bez melodie projde
 * dveřmi do každého podpalubí 1–20 a zaznamená T-stavy zastávek a průběh
 * mazání obrazovky. Odsud:
 *
 * - `toCls` – od ENTER ROOM (`$EE84`) do ROM CL-LINE (`$A8DA`): **model**
 *   `base + records × záznamy + bytes × bajty` tabulek, které `$AAF4`
 *   a `$AB44` zkopírují, nejmenší čtverce
 * - `cls` – mazání: délka (průměr, i s přerušeními) a 48 bloků (24
 *   pixelových řádků třetin po 256 B, 24 řádků atributů po 32 B) s T
 *   začátku a konce od `$A8DA`; začátek a konec bloku jsou z přímky
 *   proložené časy, kdy bajty bloku zmizely (LDIR maže stejným tempem),
 *   v profilu bez přerušení natažené na délku s nimi
 * - `draw` – jak dlouho je obraz černý (`$A8DD` → `$AA85`): **model**
 *   `base + glyph × znaky + clSet × CL-SET + rst10 × RST $10`, nejmenší
 *   čtverce; počty dává kreslení **remaku** (`BootyLogic#cost`) z paměti
 *   originálu ve chvíli `$EE84`. Chyba modelu se vypíše
 * - `attrCopy` (`$AA85` → `$AA90`) a `panel` (`$AA90` → `$EEA2`), průměr
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

// zastávky tools/tracetransition.py
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
    console.error(`chybí ${file} – spusť ./tools/tracetransition.py`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(file));
}

function mean(values) {
  return values.reduce((a, b) => a+b, 0)/values.length;
}

/** nejmenší čtverce: X (řádky) × c = y */
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
  // ★ bez přerušení; natažené na délku mazání i s nimi
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
      // vzorek po STEP: bajt zmizel někdy v předchozím kroku
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
  console.log(`  model do CL-LINE nejvýš ±${preWorst.toFixed(0)} T`);
  console.log(`${where}: ${holds.length} podpalubí; CL-LINE ${(out.cls.duration/FRAME).toFixed(2)} snímku, `+
              `černo ${(Math.min(...black)/FRAME).toFixed(2)}–${(Math.max(...black)/FRAME).toFixed(2)} snímku, `+
              `model černa nejvýš ±${worst.toFixed(0)} T (${(worst/FRAME).toFixed(3)} snímku)`);
  ['A900', 'E0AC'].forEach((name, i) => {
    const k = [A900, E0AC][i];
    const spread = diff(k-1, k);
    console.log(`  (kontrola: $${name} − předchozí zastávka ${Math.min(...spread)}–${Math.max(...spread)} T)`);
  });
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  main();
}
