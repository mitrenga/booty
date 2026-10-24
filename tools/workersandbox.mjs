/**
 * `app/gameWorker.js` bez prohlížeče – pro `runworker.mjs` a `matchrules.mjs`.
 *
 * Worker běží v atrapě prostředí workeru (`node:vm`): `postMessage`,
 * `setTimeout` a `Date` s hodinami, které posouvá nástroj, a
 * `importScripts`, které `bootyLogic.js` načte doopravdy. Data dostane
 * táž, která mu dává model: `data/global.json#memory`, ROM font ze svision,
 * `data/global.json#transition`.
 *
 * Globální proměnné workeru (`state`, `logic`, `TICK_MS`,
 * `ENTER_LOCK_FRAMES` …) jsou vidět jako vlastnosti `context`.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';
import { readSection } from './jsonformat.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
export const ROOT = path.join(HERE, '..');

/** what the model gives the worker in `init` (without `headless` and `seed`) */
export async function initData() {
  global.atob = (data) => Buffer.from(data, 'base64').toString('binary');
  await import(url.pathToFileURL(path.join(ROOT, 'app/svision/tools/nodeEnv.mjs')).href);
  const { ZXFonts8x8 } = await import(
    url.pathToFileURL(path.join(ROOT, 'app/svision/js/platform/canvas2D/zx/zxFonts8x8.js')).href);
  const font = new ZXFonts8x8({}, false);
  const romFont = new Uint8Array(768);
  for (let c = 0; c < 96; c++) { romFont.set(font.glyphBytes(font.fontsChars.charAt(c)), c*8); }
  return {memory: readSection('memory'), romFont, transition: readSection('transition')};
}

/** the worker in a sandbox, with a clock that the caller moves */
export function startWorker(onMessage) {
  const clock = {now: 1000000, timers: [], nextId: 1, maxPending: 0};
  const sandbox = {
    console, atob: global.atob, Uint8Array, Array, Math, Number, JSON, Object,
    Date: {now: () => clock.now},
    setTimeout: (fn, ms) => {
      const id = clock.nextId++;
      clock.timers.push({id, fn, at: clock.now+Math.max(0, ms)});
      clock.maxPending = Math.max(clock.maxPending, clock.timers.length);
      return id;
    },
    clearTimeout: (id) => { clock.timers = clock.timers.filter((t) => t.id !== id); },
    postMessage: onMessage,
  };
  sandbox.self = sandbox;
  sandbox.location = {search: ''};
  const context = vm.createContext(sandbox);
  sandbox.importScripts = (name) => {
    const file = name.split('?')[0];
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'app', file), 'utf8'), context, {filename: file});
  };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'app/gameWorker.js'), 'utf8'), context,
                  {filename: 'gameWorker.js'});
  return {
    send(message) { sandbox.onmessage({data: message}); },
    advance(ms, step = 1) {
      const end = clock.now+ms;
      while (clock.now < end) {
        clock.now = Math.min(end, clock.now+step);
        const due = clock.timers.filter((t) => t.at <= clock.now);
        clock.timers = clock.timers.filter((t) => t.at > clock.now);
        due.forEach((t) => t.fn());
      }
    },
    clock,
    context,
  };
}
