#!/usr/bin/env node
/**
 * Compares the remake's title screen with the original's — pass by pass.
 *
 *   ./tools/matchtitle.mjs
 *
 * ★ The reference is `tools/tracetitle.py`: the real code from the tape in a
 * Z80 simulator and at every entry into the loop `$CDAF` the video RAM
 * `$4000`–`$5AFF` and the state of the sea generator `$D86F`, in two runs
 * (with the tune and without it – the sea does not depend on the tune, only
 * the pace changes).
 *
 * The remake is **the code that goes into the browser**: `app/titleSea.js`
 * fed with `data/global.json#title` (`tools/mktitle.py`). Checked:
 *
 * 1. the first pass = the picture from the data (after the `LDIR` from
 *    `$6978`, before the sea), all 6912 bytes
 * 2. after every further pass all 6912 bytes and the state of `$D86F`
 *
 * The pace is not checked by bytes, but it comes from the same recording:
 * `mktitle.py` takes the mean of the run without the tune.
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
      console.error(`${file} is missing – run ./tools/tracetitle.py`);
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
          if (first === null) { first = `pass ${i}, byte $${(0x4000+k).toString(16)}: ${screen[k]} ≠ ${ref[k]}`; }
        }
      }
      runChecks++;
      if (sea.seed !== seed) {
        runDiffs++;
        if (first === null) { first = `pass ${i}, $D86F: ${sea.seed} ≠ ${seed}`; }
      }
    }
    console.log(`${run.padEnd(5)} ${passes} passes: ${runChecks} checks, ${runDiffs} differences`);
    if (first) { console.log('  first difference: '+first); }
    checks += runChecks;
    diffs += runDiffs;
  }
  console.log(`total ${checks} checks, **${diffs} differences**`);
  process.exit(diffs ? 1 : 0);
}

main();
