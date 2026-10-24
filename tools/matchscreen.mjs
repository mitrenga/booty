#!/usr/bin/env node
/**
 * Porovná obrazovky, které remake složí, s videopamětí originálu.
 *
 *   ./tools/matchscreen.mjs [--verbose]
 *
 * Staví je **skutečným kódem, který jde do prohlížeče** —
 * `app/screenComposer.js` nakrmený snímkem z `app/gameWorker.js` — a
 * porovnává je bajt po bajtu se snímky videopaměti běžícího originálu, které
 * uložil `tools/mkhold.py`:
 *
 * 1. **herní obrazovka** — všech 6912 bajtů (6144 bitmapy, 768 atributů)
 *    proti `build/ref/screen.scr`: podpalubí, ve kterém hra začíná, i s
 *    panelem
 * 2. **hlavička menu** — znakové řádky 0–7 (2048 B bitmapy, 256 atributů)
 *    tak, jak je remake tiskne pod své menu, proti `build/ref/menu.scr`
 * 3. **menu originálu celé** — všech 6912 bajtů: proudy z `data/global.json#texts`
 *    vytištěné jako ROM (`ZXRomPrint` ve svision) i se zvýrazněnou položkou
 *    `1 - KEYBOARD` (`$5BEA` = `$24`), proti témuž snímku. Remake tohle menu
 *    neukazuje – je to kontrola proudů a tisku
 *
 * ★ **Od M2 se herní obrazovka skládá z dat**: podpalubí z tabulek
 * programu (`app/holdRenderer.js`, `data/global.json#holds`), panel z operandů kódu
 * (`app/panelRenderer.js`, `data/global.json#panel`) a Jim přepisem sprite rutiny
 * (`app/spriteRenderer.js`, `data/global.json#sprites`) v poloze z běhu originálu
 * (`data/global.json#global`). Reference je pořád většinový hlas nad běžícím
 * originálem (`tools/mkhold.py`), který o formátu nic nepředpokládá – nula
 * tedy říká, že složení z dat dá přesně obrazovku originálu.
 *
 * Od M2 už ani hlavička menu není zachycený obraz: tiskne se z proudu
 * originálu (`data/global.json#texts`).
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
 * Porovná znakové řádky [0, rows) dvou obrazů.
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
      console.log(`  řádek ${String(row).padStart(2)}: ${diffs} rozdílů`);
    });
  }
  const checks = result.bitmapChecks + result.attrChecks;
  const diffs = result.bitmap + result.attrs;
  console.log(`${name.padEnd(16)} bitmapa ${String(result.bitmapChecks).padStart(4)} / ${result.bitmap}, `
              + `atributy ${String(result.attrChecks).padStart(3)} / ${result.attrs}  → ${checks} kontrol, ${diffs} rozdílů`);
  return {checks, diffs};
}

async function main() {
  const verbose = process.argv.includes('--verbose');
  for (const ref of [REF_SCREEN, REF_MENU]) {
    if (!fs.existsSync(ref)) {
      console.error(`chybí ${ref} – spusť ./tools/mksnapshot.sh a ./tools/mkhold.py`);
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

  const a = report('herní obrazovka', compare(game.bytes, fs.readFileSync(REF_SCREEN), 24), verbose);
  const b = report('hlavička menu', compare(menu.bytes, fs.readFileSync(REF_MENU), MENU_ROWS), verbose);
  const c = report('menu originálu', compare(original.bytes, fs.readFileSync(REF_MENU), 24), verbose);
  const checks = a.checks + b.checks + c.checks, diffs = a.diffs + b.diffs + c.diffs;
  console.log(`celkem ${checks} kontrol, **${diffs} rozdílů**`);
  process.exit(diffs ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
