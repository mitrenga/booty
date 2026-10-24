#!/usr/bin/env node
/**
 * Compares the sprites as the remake draws them with how the original draws them.
 *
 *   ./tools/matchsprites.mjs [--verbose]
 *
 * The remake draws with **the real code from the browser** – hold 1 by
 * `app/holdRenderer.js` and over it an object (`SpriteRenderer.draw`, a port
 * of `$EED7`) or a block (`SpriteRenderer.drawBlock`, a port of `$EA93`)
 * over `data/global.json#sprites`. The reference is drawn by **the original's
 * code** in a Z80 simulator (`tools/tracesprites.py`, `build/ref/sprites/`).
 *
 * The cases are in `build/ref/sprites/cases.json`: Jim, the pirates, the
 * creature from the timer (rat, parrot) and the lifts in all frames, 16 fine
 * positions, in the middle and at both edges; portholes, the explosion, the
 * trapdoor, an empty place and a splinter of the explosion in the middle and
 * at the right edge (clipping and the shift of char codes). The whole video
 * RAM is compared, 6912 bytes a case.
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
    console.error(`${REF} is missing – run ./tools/tracesprites.py`);
    process.exit(2);
  }
  global.atob = (data) => Buffer.from(data, 'base64').toString('binary');
  await import(url.pathToFileURL(path.join(ROOT, 'app/svision/tools/nodeEnv.mjs')).href);
  const load = async (f) => import(url.pathToFileURL(path.join(ROOT, f)).href);
  const { HoldRenderer } = await load('app/holdRenderer.js');
  const { SpriteRenderer } = await load('app/spriteRenderer.js');
  const { ZXVideoRAM } = await load('app/svision/js/platform/canvas2D/zx/zxVideoRAM.js');
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
    const key = `${c.kind === 'object' ? 'object' : 'block'} ${c.bank} ${c.place}`;
    perGroup[key] = perGroup[key] || {cases: 0, diffs: 0};
    perGroup[key].cases++;
    perGroup[key].diffs += d;
    if (verbose && d) {
      console.log(c.kind === 'object'
        ? `  ${c.bank} frame ${c.frame} ${c.object[7]}×${c.object[8]} ${c.place} phase ${c.object[2]}/${c.object[3]}: ${d} differences`
        : `  block ${c.bank} code ${c.code} ${c.width}×${c.height} ${c.place}: ${d} differences`);
    }
  });
  Object.keys(perGroup).forEach((key) => {
    console.log(`${key.padEnd(26)} ${String(perGroup[key].cases).padStart(4)} cases, ${perGroup[key].diffs} differences`);
  });
  console.log(`total ${checks} checks, **${diffs} differences**`);
  process.exit(diffs ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
