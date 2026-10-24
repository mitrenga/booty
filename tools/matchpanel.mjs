#!/usr/bin/env node
/**
 * Compares the panel as the remake prints it with how the original prints it.
 *
 *   ./tools/matchpanel.mjs [--verbose]
 *
 * The remake: `app/holdRenderer.js` draws the hold and `app/panelRenderer.js`
 * over `data/global.json#panel` prints the panel. The original: `$A900`, the
 * rest of `$E0A9` and the stretch of the main loop that prints the key
 * number, in a Z80 simulator (`tools/tracepanel.py`, `build/ref/panel/`).
 *
 * All 21 holds (the panel's paper is the hold's border, so it differs)
 * × six states: lives 0–4, collected and remaining booty from the start down
 * to zero – and with zero the text `FIND THE GOLD KEY IN    SECONDS!` on row
 * 22 –, key numbers 0–9. The whole video RAM is compared.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { readSection } from './jsonformat.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const REF = path.join(ROOT, 'build/ref/panel');

async function main() {
  const verbose = process.argv.includes('--verbose');
  if (!fs.existsSync(path.join(REF, 'cases.json'))) {
    console.error(`${REF} is missing – run ./tools/tracepanel.py`);
    process.exit(2);
  }
  global.atob = (data) => Buffer.from(data, 'base64').toString('binary');
  await import(url.pathToFileURL(path.join(ROOT, 'app/svision/tools/nodeEnv.mjs')).href);
  const load = async (f) => import(url.pathToFileURL(path.join(ROOT, f)).href);
  const { HoldRenderer } = await load('app/holdRenderer.js');
  const { PanelRenderer } = await load('app/panelRenderer.js');
  const { ZXVideoRAM } = await load('app/svision/js/platform/canvas2D/zx/zxVideoRAM.js');
  const json = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

  const holds = new HoldRenderer(readSection('holds'));
  const panel = new PanelRenderer(readSection('panel'));
  const cases = json('build/ref/panel/cases.json');
  const reference = fs.readFileSync(path.join(REF, 'panel.scr'));
  let checks = 0, diffs = 0;
  cases.forEach((c, i) => {
    const videoRAM = new ZXVideoRAM();
    const drawn = holds.draw(videoRAM, c.hold);
    const paper = holds.hold(c.hold).COLDAT[5][0];
    panel.draw(videoRAM, c, drawn.border, paper);
    let d = 0;
    for (let k = 0; k < 6912; k++) {
      if (videoRAM.bytes[k] !== reference[i*6912+k]) { d++; }
    }
    checks += 6912;
    diffs += d;
    if (d && verbose) {
      console.log(`  hold ${c.hold} lives ${c.lives} booty ${c.booty}/${c.treasure} key ${c.key}: ${d} differences`);
    }
  });
  console.log(`${cases.length} cases (21 holds × ${cases.length/21} states)`);
  console.log(`total ${checks} checks, **${diffs} differences**`);
  process.exit(diffs ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
