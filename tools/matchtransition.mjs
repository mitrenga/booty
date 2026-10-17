#!/usr/bin/env node
/**
 * Porovná, co je při přechodu dveřmi vidět v remaku a v originálu.
 *
 *   ./tools/tracetransition.py && ./tools/mktransition.mjs && ./tools/matchtransition.mjs [--verbose]
 *
 * Originál: obrazovky na konci snímků přechodu do podpalubí 1–20, bez
 * melodie (`tools/tracetransition.py`). Remake: `BootyLogic.goToHold`
 * z paměti originálu ve chvíli `$EE84` a `BootyLogic.transitionScreen`
 * s časy z `data/global.json#transition` – v týchž T-stavech od `$EE84` jako snímky
 * originálu. Porovnávají se bajty obrazovky, jen v černé fázi (atributy
 * všechny 0) stačí shoda atributů: originál pod nimi kreslí pixely, které
 * nejsou vidět.
 *
 * Měří se **čas**: pro každý snímek originálu se hledá nejbližší okamžik,
 * kdy remake ukáže přesně tentýž obraz (do ±`WINDOW` T po `STEP` T). Shoda
 * v pixelech v tomtéž T by vyžadovala přerušení na T-stav – fáze přechodu
 * vůči snímku je ale v remaku stejně libovolná (průchod v konstantním tempu).
 * Snímek, ke kterému remake takový obraz nemá vůbec, je **rozdíl**.
 *
 * Snímky po konci tisku panelu (`$EEA2`) se neporovnávají – zbytek průchodu
 * už je běžný průchod. ? Panel se v originálu tiskne asi půl snímku po
 * znacích, remake ho ukáže najednou: řádky 22–23 se během tisku nepočítají.
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
 * Je vidět totéž? Při atributech všech nulových je obraz černý, ať jsou
 * pixely jakékoli (originál pod nimi kreslí podpalubí); jinak se musí
 * shodovat každý bajt. `limit` – konec porovnávaných atributů: `$1AC0`
 * znamená bez panelu (i jeho pixelů).
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

/** pixelový bajt v řádcích 22–23 (panel) */
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
        // ? panel (řádky 22–23): v originálu se tiskne po znacích
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
        line.push(`${(t/69888).toFixed(2)}:ROZDÍL`);
      } else {
        worst = Math.max(worst, Math.abs(found));
        line.push(`${(t/69888).toFixed(2)}:${found > 0 ? '+' : ''}${found}`);
      }
    });
    if (verbose) {
      console.log(`podpalubí ${String(hold).padStart(2)}  ${line.join('  ')}`);
    }
  });
  console.log(`${frames} snímků v ${Object.keys(record.holds).length} přechodech, **${errors} rozdílů**; `+
              `obraz originálu remake ukáže nejvýš ${worst} T (${(worst/69888).toFixed(3)} snímku) vedle`);
  process.exit(errors ? 1 : 0);
}

main();
