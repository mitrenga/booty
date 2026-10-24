#!/usr/bin/env node
/**
 * Compares all holds as the remake draws them with how the original draws
 * them.
 *
 *   ./tools/matchholds.mjs [--verbose] [--hold N]
 *
 * The remake draws with **the real code from the browser** –
 * `app/holdRenderer.js` over `data/global.json#holds` (`tools/dumpholds.py`).
 * The reference is drawn by **the original's code** – `$AB44` + `$A900` run
 * in a Z80 simulator from the game's state at the moment it draws the first
 * hold itself (`tools/traceholds.py`, `build/ref/holds/`).
 *
 * For each of the 21 holds it compares:
 *
 * - **the video RAM**, all 6912 bytes (6144 bitmap, 768 attributes)
 * - **the char map** `$A1C4`, 800 bytes (25 rows of 32) – the game reads it
 *   when working out where Jim stands (M3); the screen is only what is visible
 * - **the border** the hold sets
 *
 * 21 × (6912 + 800 + 1) = **161,973 checks**.
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
    console.error(`${REF} is missing – run ./tools/mksnapshot.sh and ./tools/traceholds.py`);
    process.exit(2);
  }
  global.atob = (data) => Buffer.from(data, 'base64').toString('binary');
  await import(url.pathToFileURL(path.join(ROOT, 'app/svision/tools/nodeEnv.mjs')).href);
  const { HoldRenderer } = await import(url.pathToFileURL(path.join(ROOT, 'app/holdRenderer.js')).href);
  const { ZXVideoRAM } = await import(
    url.pathToFileURL(path.join(ROOT, 'app/svision/js/platform/canvas2D/zx/zxVideoRAM.js')).href);

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
    console.log(`hold ${String(number).padStart(2)}: picture ${bitmap}+${attrs}, map ${chars}, border ${border}`
                + (holdDiffs ? '  ← DIFFERENCE' : ''));
    if (verbose && cells.size) {
      console.log('    cells: '+[...cells].slice(0, 40).join(' '));
    }
  }
  console.log(`total ${checks} checks, **${diffs} differences**`);
  process.exit(diffs ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
