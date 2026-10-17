#!/usr/bin/env node
/**
 * Porovná sprity, jak je nakreslí remake, s tím, jak je nakreslí originál.
 *
 *   ./tools/matchsprites.mjs [--verbose]
 *
 * Remake kreslí **skutečným kódem z prohlížeče** – podpalubí 1
 * `app/holdRenderer.js` a přes ně objekt (`SpriteRenderer.draw`, přepis
 * `$EED7`) nebo blok (`SpriteRenderer.drawBlock`, přepis `$EA93`) nad
 * `data/global.json#sprites`. Referenci kreslí **kód originálu** v simulátoru Z80
 * (`tools/tracesprites.py`, `build/ref/sprites/`).
 *
 * Případy jsou v `build/ref/sprites/cases.json`: Jim, piráti, tvor
 * z časovače (krysa, papoušek) a plošiny ve všech snímcích, 16 jemných
 * poloh, uprostřed a u obou okrajů; okénka, výbuch, padací dveře, prázdné
 * místo a úlomek výbuchu uprostřed i u pravého okraje (ořez a posun čísel
 * znaků). Porovnává se celá videopaměť, 6912 bajtů na případ.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { readSection } from './jsonformat.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const REF = path.join(ROOT, 'build/ref/sprites');

async function main() {
  const verbose = process.argv.includes('--verbose');
  if (!fs.existsSync(path.join(REF, 'cases.json'))) {
    console.error(`chybí ${REF} – spusť ./tools/tracesprites.py`);
    process.exit(2);
  }
  global.atob = (data) => Buffer.from(data, 'base64').toString('binary');
  await import(url.pathToFileURL(path.join(ROOT, 'app/svision/tools/nodeEnv.mjs')).href);
  const load = async (f) => import(url.pathToFileURL(path.join(ROOT, f)).href);
  const { HoldRenderer } = await load('app/holdRenderer.js');
  const { SpriteRenderer } = await load('app/spriteRenderer.js');
  const { ZXVideoRAM } = await load('app/svision/js/platform/canvas2D/zxSpectrum/zxVideoRAM.js');
  const json = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

  const holds = new HoldRenderer(readSection('holds'));
  const sprites = new SpriteRenderer(readSection('sprites'));
  const { hold, paper, cases } = json('build/ref/sprites/cases.json');
  const reference = fs.readFileSync(path.join(REF, 'sprites.scr'));

  const background = new ZXVideoRAM();
  holds.draw(background, hold);
  let checks = 0, diffs = 0;
  const perGroup = {};
  cases.forEach((c, i) => {
    const videoRAM = new ZXVideoRAM();
    videoRAM.bytes.set(background.bytes);
    if (c.kind === 'object') {
      sprites.draw(videoRAM, c.object, c.bank, paper);
    } else {
      sprites.drawBlock(videoRAM, c.bank, c.code, c.width, c.height, c.c, c.b,
                        ((paper << 3) | c.ink) & 0xFF);
    }
    let d = 0;
    for (let k = 0; k < 6912; k++) {
      if (videoRAM.bytes[k] !== reference[i*6912+k]) { d++; }
    }
    checks += 6912;
    diffs += d;
    const key = `${c.kind === 'object' ? 'objekt' : 'blok'} ${c.bank} ${c.place}`;
    perGroup[key] = perGroup[key] || {cases: 0, diffs: 0};
    perGroup[key].cases++;
    perGroup[key].diffs += d;
    if (verbose && d) {
      console.log(c.kind === 'object'
        ? `  ${c.bank} snímek ${c.frame} ${c.object[7]}×${c.object[8]} ${c.place} fáze ${c.object[2]}/${c.object[3]}: ${d} rozdílů`
        : `  blok ${c.bank} kód ${c.code} ${c.width}×${c.height} ${c.place}: ${d} rozdílů`);
    }
  });
  Object.keys(perGroup).forEach((key) => {
    console.log(`${key.padEnd(26)} ${String(perGroup[key].cases).padStart(4)} případů, ${perGroup[key].diffs} rozdílů`);
  });
  console.log(`celkem ${checks} kontrol, **${diffs} rozdílů**`);
  process.exit(diffs ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
