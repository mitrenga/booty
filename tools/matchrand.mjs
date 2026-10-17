#!/usr/bin/env node
/**
 * Porovná generátor náhody workeru s generátorem originálu — na celé periodě.
 *
 *   ./tools/matchrand.mjs [--seed 0xABCD]
 *
 * ★ Originál má jediný generátor, `$E349`, se šestnáctibitovým stavem na
 * `$F343` (`sources/docs/disasm_notes.md` §5), a `app/gameWorker.js` ho
 * přenáší instrukci po instrukci (`originalRand`). Tenhle nástroj to dokládá:
 *
 * - `tools/tracerand.py` pustí **skutečný kód z kazety** v simulátoru Z80
 *   (SkoolKit) a zavolá `$E349` 65 536krát – celá perioda – od semínka
 * - tentýž počet volání udělá `originalRand` z `app/gameWorker.js`, spuštěný
 *   tak, jak ho spouští prohlížeč (atrapa workeru)
 * - po každém volání se porovná vrácené číslo **i nový stav `$F343`**:
 *   3 × 65 536 = 196 608 kontrol
 *
 * Bez `--seed` se začíná od `$0000`, tedy od stavu originálu čerstvě po
 * nahrání. Protože je perioda plná, projde se tím každý stav právě jednou
 * a na semínku pak nezáleží – kontroluje se i to.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const COUNT = 65536;

function worker() {
  const sandbox = {
    console, setTimeout: () => 0, clearTimeout: () => {},
    postMessage: () => {}, importScripts() {},
  };
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'app/gameWorker.js'), 'utf8'),
                  context, {filename: 'gameWorker.js'});
  return context;
}

function main() {
  const args = process.argv.slice(2);
  const seed = args.includes('--seed') ? Number(args[args.indexOf('--seed')+1]) & 0xFFFF : 0;

  const z80 = execFileSync(path.join(HERE, 'tracerand.py'),
                           ['--count', String(COUNT), '--seed', '0x'+seed.toString(16)],
                           {maxBuffer: 16*1024*1024});
  if (z80.length !== 3*COUNT) {
    console.error(`tracerand.py vrátil ${z80.length} B místo ${3*COUNT}`);
    process.exit(2);
  }

  const context = worker();
  vm.runInContext(`seedRand(${seed});`, context);
  let checks = 0, diffs = 0, first = null;
  const seen = new Uint8Array(65536);
  for (let i = 0; i < COUNT; i++) {
    const value = vm.runInContext('randSource()', context);
    const state = vm.runInContext('rand', context);
    const expect = [z80[3*i], z80[3*i+1], z80[3*i+2]];
    const got = [value, state & 0xFF, state >> 8];
    for (let k = 0; k < 3; k++) {
      checks++;
      if (got[k] !== expect[k]) {
        diffs++;
        if (first === null) {
          first = `volání ${i+1}: worker ${got.map((v) => v.toString(16))}, `
                  + `Z80 ${expect.map((v) => v.toString(16))}`;
        }
      }
    }
    seen[state] = 1;
  }
  const states = seen.reduce((sum, v) => sum+v, 0);
  console.log(`semínko $${seed.toString(16).toUpperCase().padStart(4, '0')}, ${COUNT} volání $E349`);
  console.log(`vrácené číslo a stav $F343: ${checks} kontrol, ${diffs} rozdílů`);
  console.log(`různých stavů za periodu: ${states} z 65536`);
  if (first) { console.log('  první rozdíl: '+first); }
  if (states !== 65536) { diffs++; }
  console.log(`celkem ${checks} kontrol, **${diffs} rozdílů**`);
  process.exit(diffs ? 1 : 0);
}

main();
