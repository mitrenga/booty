#!/usr/bin/env node
/**
 * Porovná panel, jak ho vytiskne remake, s tím, jak ho vytiskne originál.
 *
 *   ./tools/matchpanel.mjs [--verbose]
 *
 * Remake: `app/holdRenderer.js` nakreslí podpalubí a `app/panelRenderer.js`
 * nad `data/global.json#panel` vytiskne panel. Originál: `$A900`, zbytek `$E0A9`
 * a úsek hlavní smyčky, který tiskne číslo klíče, v simulátoru Z80
 * (`tools/tracepanel.py`, `build/ref/panel/`).
 *
 * Všech 21 podpalubí (papír panelu je border podpalubí, takže se liší)
 * × šest stavů: životy 0–4, sebraná a zbývající kořist od začátku po
 * nulu – a s nulou text `FIND THE GOLD KEY IN    SECONDS!` na řádku 22 –,
 * čísla klíče 0–9. Porovnává se celá videopaměť.
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
    console.error(`chybí ${REF} – spusť ./tools/tracepanel.py`);
    process.exit(2);
  }
  global.atob = (data) => Buffer.from(data, 'base64').toString('binary');
  await import(url.pathToFileURL(path.join(ROOT, 'app/svision/tools/nodeEnv.mjs')).href);
  const load = async (f) => import(url.pathToFileURL(path.join(ROOT, f)).href);
  const { HoldRenderer } = await load('app/holdRenderer.js');
  const { PanelRenderer } = await load('app/panelRenderer.js');
  const { ZXVideoRAM } = await load('app/svision/js/platform/canvas2D/zxSpectrum/zxVideoRAM.js');
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
      console.log(`  podpalubí ${c.hold} životy ${c.lives} kořist ${c.booty}/${c.treasure} klíč ${c.key}: ${d} rozdílů`);
    }
  });
  console.log(`${cases.length} případů (21 podpalubí × ${cases.length/21} stavů)`);
  console.log(`celkem ${checks} kontrol, **${diffs} rozdílů**`);
  process.exit(diffs ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
