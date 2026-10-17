#!/usr/bin/env node
/**
 * Porovná titulku remaku s titulkou originálu — průchod po průchodu.
 *
 *   ./tools/matchtitle.mjs
 *
 * ★ Reference je `tools/tracetitle.py`: skutečný kód z kazety v simulátoru
 * Z80 a na každém vstupu do smyčky `$CDAF` videopaměť `$4000`–`$5AFF`
 * a stav generátoru moře `$D86F`, ve dvou bězích (s melodií a bez ní –
 * moře na melodii nezávisí, mění se jen tempo).
 *
 * Remake je **kód, který jde do prohlížeče**: `app/titleSea.js` nakrmený
 * `data/global.json#title` (`tools/mktitle.py`). Kontroluje se:
 *
 * 1. první průchod = obrázek z dat (po `LDIR` z `$6978`, před mořem),
 *    všech 6912 bajtů
 * 2. po každém dalším průchodu všech 6912 bajtů a stav `$D86F`
 *
 * Tempo se nekontroluje bajty, ale je ze stejného záznamu: `mktitle.py`
 * bere průměr běhu bez melodie.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { readSection } from './jsonformat.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const RECORD = 4+1+6912;

async function main() {
  await import(url.pathToFileURL(path.join(ROOT, 'app/svision/tools/nodeEnv.mjs')).href);
  const { TitleSea } = await import(url.pathToFileURL(path.join(ROOT, 'app/titleSea.js')).href);
  const title = readSection('title');

  let checks = 0, diffs = 0;
  for (const run of ['tune', 'quiet']) {
    const file = path.join(ROOT, 'build/title', run, 'passes.bin');
    if (!fs.existsSync(file)) {
      console.error(`chybí ${file} – spusť ./tools/tracetitle.py`);
      process.exit(2);
    }
    const data = fs.readFileSync(file);
    const passes = data.length/RECORD;
    const sea = new TitleSea(title);
    const screen = new Uint8Array(sea.picture);
    let runChecks = 0, runDiffs = 0, first = null;
    for (let i = 0; i < passes; i++) {
      if (i > 0) {
        sea.pass(screen);
      }
      const at = i*RECORD;
      const seed = data[at+4];
      const ref = data.subarray(at+5, at+RECORD);
      for (let k = 0; k < 6912; k++) {
        runChecks++;
        if (screen[k] !== ref[k]) {
          runDiffs++;
          if (first === null) { first = `průchod ${i}, bajt $${(0x4000+k).toString(16)}: ${screen[k]} ≠ ${ref[k]}`; }
        }
      }
      runChecks++;
      if (sea.seed !== seed) {
        runDiffs++;
        if (first === null) { first = `průchod ${i}, $D86F: ${sea.seed} ≠ ${seed}`; }
      }
    }
    console.log(`${run.padEnd(5)} ${passes} průchodů: ${runChecks} kontrol, ${runDiffs} rozdílů`);
    if (first) { console.log('  první rozdíl: '+first); }
    checks += runChecks;
    diffs += runDiffs;
  }
  console.log(`celkem ${checks} kontrol, **${diffs} rozdílů**`);
  process.exit(diffs ? 1 : 0);
}

main();
