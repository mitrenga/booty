#!/usr/bin/env node
/**
 * Compares the screens the remake composes with the original's video RAM.
 *
 *   ./tools/matchscreen.mjs [--verbose]
 *
 * It builds them with **the real code that goes into the browser** —
 * `app/screenComposer.js` fed with a frame from `app/gameWorker.js` — and
 * compares them byte by byte with the video RAM snapshots of the running
 * original saved by `tools/mkhold.py`:
 *
 * 1. **the game screen** — all 6912 bytes (6144 bitmap, 768 attributes)
 *    against `build/ref/screen.scr`: the hold the game starts in, panel
 *    included
 * 2. **the menu header** — character rows 0–7 (2048 B bitmap, 256 attributes)
 *    as the remake prints them above its menu, against `build/ref/menu.scr`
 * 3. **the original's whole menu** — all 6912 bytes: the streams from
 *    `data/global.json#texts` printed as the ROM does (`ZXRomPrint` in svision),
 *    with the highlighted item `1 - KEYBOARD` (`$5BEA` = `$24`), against the
 *    same snapshot. The remake does not show this menu – it is a check of the
 *    streams and the printing
 *
 * ★ **Since M2 the game screen is composed from data**: the hold from the
 * program's tables (`app/holdRenderer.js`, `data/global.json#holds`), the panel
 * from the code's operands (`app/panelRenderer.js`, `data/global.json#panel`)
 * and Jim by a port of the sprite routine (`app/spriteRenderer.js`,
 * `data/global.json#sprites`) at the position from the original's run
 * (`data/global.json#global`). The reference is still a majority vote over
 * the running original (`tools/mkhold.py`), which assumes nothing about the
 * format – so zero says that composing from data gives exactly the
 * original's screen.
 *
 * Since M2 the menu header is no captured image either: it is printed from
 * the original's stream (`data/global.json#texts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { readSection } from './jsonformat.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const REF_SCREEN = path.join(ROOT, 'build/ref/screen.scr');
const REF_MENU = path.join(ROOT, 'build/ref/menu.scr');
const MENU_ROWS = 8;

function loadDataFile(name) {
  return readSection(name);
}

function offsetOf(y, col) {
  const third = y >> 6, charRow = (y >> 3) & 7, pix = y & 7;
  return (third << 11) | (pix << 8) | (charRow << 5) | col;
}

/**
 * Compares the character rows [0, rows) of two images.
 * @returns {{bitmap: number, attrs: number, bitmapChecks: number, attrChecks: number, perRow: number[]}}
 */
function compare(bytes, reference, rows) {
  const out = {bitmap: 0, attrs: 0, bitmapChecks: 0, attrChecks: 0, perRow: []};
  for (let row = 0; row < rows; row++) {
    let rowDiffs = 0;
    for (let line = 0; line < 8; line++) {
      for (let col = 0; col < 32; col++) {
        const at = offsetOf(row*8 + line, col);
        out.bitmapChecks++;
        if (bytes[at] !== reference[at]) { out.bitmap++; rowDiffs++; }
      }
    }
    for (let col = 0; col < 32; col++) {
      const at = 6144 + row*32 + col;
      out.attrChecks++;
      if (bytes[at] !== reference[at]) { out.attrs++; rowDiffs++; }
    }
    out.perRow.push(rowDiffs);
  }
  return out;
}

function report(name, result, verbose) {
  if (verbose) {
    result.perRow.forEach((diffs, row) => {
      console.log(`  row ${String(row).padStart(2)}: ${diffs} differences`);
    });
  }
  const checks = result.bitmapChecks + result.attrChecks;
  const diffs = result.bitmap + result.attrs;
  console.log(`${name.padEnd(16)} bitmap ${String(result.bitmapChecks).padStart(4)} / ${result.bitmap}, `
              + `attributes ${String(result.attrChecks).padStart(3)} / ${result.attrs}  → ${checks} checks, ${diffs} differences`);
  return {checks, diffs};
}

async function main() {
  const verbose = process.argv.includes('--verbose');
  for (const ref of [REF_SCREEN, REF_MENU]) {
    if (!fs.existsSync(ref)) {
      console.error(`${ref} is missing – run ./tools/mksnapshot.sh and ./tools/mkhold.py`);
      process.exit(2);
    }
  }
  global.atob = (data) => Buffer.from(data, 'base64').toString('binary');
  await import(url.pathToFileURL(path.join(ROOT, 'app/svision/tools/nodeEnv.mjs')).href);
  const { ScreenComposer } = await import(
    url.pathToFileURL(path.join(ROOT, 'app/screenComposer.js')).href);
  const { ZXVideoRAM } = await import(
    url.pathToFileURL(path.join(ROOT, 'app/svision/js/platform/canvas2D/zx/zxVideoRAM.js')).href);

  const data = {};
  ['holds', 'sprites', 'panel', 'global', 'texts'].forEach((name) => { data[name] = loadDataFile(name); });
  const render = new ScreenComposer(data);

  const game = new ZXVideoRAM();
  // the start of a game as M2 composes it: the hold, the panel and Jim where
  // he lands (data/global.json#global) — the worker's live screen has the pirates on
  // it, which the majority vote of the reference has voted out
  render.composeInto(game, render.startState());
  const menu = new ZXVideoRAM();
  render.composeMenu(menu);
  const original = new ZXVideoRAM();
  // ★ $5BEA = $24 (KEYBOARD) after the first start, $CD6F
  render.composeOriginalMenu(original, 0x24);

  const a = report('game screen', compare(game.bytes, fs.readFileSync(REF_SCREEN), 24), verbose);
  const b = report('menu header', compare(menu.bytes, fs.readFileSync(REF_MENU), MENU_ROWS), verbose);
  const c = report('original menu', compare(original.bytes, fs.readFileSync(REF_MENU), 24), verbose);
  const checks = a.checks + b.checks + c.checks, diffs = a.diffs + b.diffs + c.diffs;
  console.log(`total ${checks} checks, **${diffs} differences**`);
  process.exit(diffs ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
