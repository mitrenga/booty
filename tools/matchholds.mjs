#!/usr/bin/env node
/**
 * Porovná všechna podpalubí, jak je nakreslí remake, s tím, jak je nakreslí
 * originál.
 *
 *   ./tools/matchholds.mjs [--verbose] [--hold N]
 *
 * Remake kreslí **skutečným kódem z prohlížeče** – `app/holdRenderer.js`
 * nad `data/global.json#holds` (`tools/dumpholds.py`). Referenci kreslí **kód
 * originálu** – `$AB44` + `$A900` puštěné v simulátoru Z80 ze stavu hry
 * ve chvíli, kdy sama kreslí první podpalubí (`tools/traceholds.py`,
 * `build/ref/holds/`).
 *
 * Pro každé z 21 podpalubí se porovná:
 *
 * - **videopaměť**, všech 6912 bajtů (6144 bitmapy, 768 atributů)
 * - **mapa znaků** `$A1C4`, 800 bajtů (25 řádků po 32) – tu hra čte,
 *   když řeší, kde Jim stojí (M3); obrazovka je jen to, co je vidět
 * - **border**, který podpalubí nastaví
 *
 * 21 × (6912 + 800 + 1) = **161 973 kontrol**.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { readSection } from './jsonformat.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const REF = path.join(ROOT, 'build/ref/holds');

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const only = args.includes('--hold') ? Number(args[args.indexOf('--hold')+1]) : null;
  if (!fs.existsSync(path.join(REF, 'global.json#holds'))) {
    console.error(`chybí ${REF} – spusť ./tools/mksnapshot.sh a ./tools/traceholds.py`);
    process.exit(2);
  }
  global.atob = (data) => Buffer.from(data, 'base64').toString('binary');
  await import(url.pathToFileURL(path.join(ROOT, 'app/svision/tools/nodeEnv.mjs')).href);
  const { HoldRenderer } = await import(url.pathToFileURL(path.join(ROOT, 'app/holdRenderer.js')).href);
  const { ZXVideoRAM } = await import(
    url.pathToFileURL(path.join(ROOT, 'app/svision/js/platform/canvas2D/zxSpectrum/zxVideoRAM.js')).href);

  const renderer = new HoldRenderer(readSection('holds'));
  const borders = JSON.parse(fs.readFileSync(path.join(REF, 'global.json#holds'), 'utf8'));
  let checks = 0, diffs = 0;
  for (const number of renderer.holdNumbers()) {
    if (only !== null && number !== only) { continue; }
    const name = String(number).padStart(2, '0');
    const scr = fs.readFileSync(path.join(REF, `hold${name}.scr`));
    const map = fs.readFileSync(path.join(REF, `hold${name}.map`));
    const videoRAM = new ZXVideoRAM();
    const drawn = renderer.draw(videoRAM, number);
    let bitmap = 0, attrs = 0, chars = 0;
    const cells = new Set();
    for (let i = 0; i < 6912; i++) {
      if (videoRAM.bytes[i] !== scr[i]) {
        if (i < 6144) {
          bitmap++;
          const y = ((i >> 11) << 6) | (((i >> 5) & 7) << 3) | ((i >> 8) & 7);
          cells.add(`${y >> 3}:${i & 31}`);
        } else {
          attrs++;
          cells.add(`${(i-6144) >> 5}:${(i-6144) & 31}a`);
        }
      }
    }
    for (let i = 0; i < 800; i++) {
      if (drawn.chars[i] !== map[i]) { chars++; }
    }
    const border = drawn.border === borders[number].border ? 0 : 1;
    const holdDiffs = bitmap+attrs+chars+border;
    checks += 6912+800+1;
    diffs += holdDiffs;
    console.log(`podpalubí ${String(number).padStart(2)}: obraz ${bitmap}+${attrs}, mapa ${chars}, border ${border}`
                + (holdDiffs ? '  ← ROZDÍL' : ''));
    if (verbose && cells.size) {
      console.log('    buňky: '+[...cells].slice(0, 40).join(' '));
    }
  }
  console.log(`celkem ${checks} kontrol, **${diffs} rozdílů**`);
  process.exit(diffs ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
