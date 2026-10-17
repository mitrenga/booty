#!/usr/bin/env node
/**
 * Celá partie originálu přehraná proti **workeru** – pravidla lodi (M4).
 *
 *   ./tools/matchrules.mjs [--name gold1] [--verbose] [--no-lock] [--base DIR]
 *
 * Záznam je celá hra, kterou hrál člověk: nahrávka RZX z RZX Archive
 * (Mousey sebere všech 125 kusů kořisti a najde zlatý klíč), přehraná
 * v simulátoru `tools/tracerules.py` → `build/rules/<jméno>/`: paměť
 * originálu na začátku hry a po každém průchodu, a vstupy průchodu.
 *
 * Proti `matchphysics.mjs` (který pouští samotný `BootyLogic.pass`) tu hraje
 * **worker tak, jak běží v prohlížeči** (`app/gameWorker.js` v atrapě
 * prostředí, `tools/workersandbox.mjs`):
 *
 * - **start**: `init` s daty modelu (`data/global.json#memory`, ROM font) a se
 *   semínkem = `$F343` originálu ve chvíli, kdy menu spouští hru; worker
 *   složí paměť a začne novou hru sám. Jediné, co se do jeho paměti
 *   zapíše, je **volba ovládání a kódy kláves** `$5BEA`–`$5BEF` ze
 *   záznamu (Mousey hraje na Interface 2: `6 7 9 8 0`), protože ovládání
 *   a předefinování kláves dělá v remaku model. Pak se porovnají všechny oblasti s originálem na
 *   začátku prvního průchodu
 * - **klávesy**: co vrátil `KEY-SCAN` originálu, se přeloží zpátky na akce
 *   (vlevo, vpravo, nahoru, dolů, ENTER ROOM) a pošle se workeru zprávou
 *   `controls`; průchod dostane, co z nich udělá worker (`heldKey`).
 *   Kontroluje se, že to je **tentýž kód**. `M` (hudba) a `P` (pauza)
 *   obsluhuje v remaku model – průchod je dostane jako „nic“
 * - **tiky**: worker se tiká zprávou `tick`, dokud průchod neproběhne –
 *   s konstantním tempem, s čekáním na přechod dveřmi, s koncem hry
 * - ★ **`FRAMES`**: originál běží 1,5–3,4 snímku na průchod, remake
 *   konstantně (`ZADANI.md` §10) a tiká po 30 ms – počet přerušení mezi
 *   průchody je **vědomá odchylka**. Hodnotu, kterou časovač tvorů
 *   (`$E12A`) v průchodu přečte, proto dodá záznam: zapíše se na `$5C78`
 *   těsně před průchodem. Nic jiného se nepodstrkuje
 * - ★ **ENTER ROOM po přechodu**: worker 25 přerušení po změně podpalubí
 *   klávesu vstupu nepředá (`ENTER_LOCK_FRAMES`, odchylka §10); originál
 *   ano. Worker hraje s ní, jak hraje v prohlížeči, a nástroj **vypíše,
 *   kolikrát v partii zasáhla** (pak by se partie rozešla); `--no-lock`
 *   ji vypne
 *
 * Navíc tři záznamy `tools/tracephysics.py`, které začínají **nedotčenou
 * novou hrou** (`walk`, `gameover`, a `lastlife` až do konce hry – smrti,
 * které Mousey neudělal); ostatní si před prvním průchodem přepisují čísla
 * v paměti, a worker začíná jen novou hrou.
 *
 * Po každém průchodu se porovnají všechny oblasti paměti (obrazovka,
 * proměnné hry, buffery, všechna podpalubí, objekty) a konec hry; a zpráva
 * `frame`, kterou dostane model (panel, podpalubí, výsledek), s pamětí.
 * Navíc se spočítá, **co se v partii stalo** – kořist, výbuchy, klíče,
 * dveře, smrti podle příčiny, hrany grafu lodi, odpočet a zlatý klíč – to
 * je doklad pravidel v `sources/docs/rules.md`.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, initData, startWorker } from './workersandbox.mjs';

const ACTIONS = ['left', 'right', 'up', 'down', 'enter'];
// ★ tools/tracephysics.py: a new game from the menu with no numbers written
// into it – `lastlife` plays to the end of the game (four deaths)
const NEW_GAME_TRACES = ['walk', 'gameover', 'lastlife'];

function hex(v, n = 4) { return '$'+v.toString(16).toUpperCase().padStart(n, '0'); }

function load(dir) {
  const regions = JSON.parse(fs.readFileSync(path.join(dir, 'regions.json'), 'utf8'));
  const record = JSON.parse(fs.readFileSync(path.join(dir, 'inputs.json'), 'utf8'));
  const size = regions.reduce((sum, [lo, hi]) => sum+hi-lo, 0);
  const passes = zlib.gunzipSync(fs.readFileSync(path.join(dir, 'passes.xor.gz')), {maxOutputLength: 2**31-1});
  for (let i = size; i < passes.length; i++) { passes[i] ^= passes[i-size]; }
  return {
    regions, size, passes, inputs: record.inputs, outcomes: record.outcomes,
    start: new Uint8Array(fs.readFileSync(path.join(dir, 'start.bin'))),
    init: new Uint8Array(fs.readFileSync(path.join(dir, 'init.bin'))),
  };
}

/** what happened in the game: the rules at work (the remake = the original) */
function instrument(logic, events) {
  const wrap = (name, fn) => {
    const original = logic[name].bind(logic);
    logic[name] = function(...args) { return fn(original, ...args); };
  };
  // which routine Jim died in
  const stack = [];
  ['creature', 'splinters', 'pirates', 'jim', 'enter', 'goldKey'].forEach((name) => {
    wrap(name, (original, ...args) => {
      stack.push(name);
      try {
        return original(...args);
      } finally {
        stack.pop();
      }
    });
  });
  const count = (key) => { events[key] = (events[key] || 0)+1; };
  wrap('death', (original) => {
    count('smrt: '+({creature: 'tvor', splinters: 'úlomek výbuchu', pirates: 'pirát',
                     jim: 'pád', enter: 'moře', goldKey: 'došel čas zlatého klíče'}[stack[stack.length-1]] || '?'));
    return original();
  });
  wrap('collect', (original, ix, c, b) => {
    const m = logic.m;
    const before = m[0xE479];
    original(ix, c, b);
    count('kořist');
    if (!before && m[0xE479]) { count('kořist vybuchla'); }
    if (logic.rd16(0x5BF2) === 0) { count('odpočet zlatého klíče'); }
    events.treasures.add(`${m[0x5BD3]}:${c},${b}`);
  });
  wrap('pickKey', (original, c, b) => {
    const m = logic.m;
    const had = m[0xF241];
    original(c, b);
    if (m[0xF241] !== had) {
      count('klíč sebrán');
      if (had) { count('klíč vyměněn (starý zpátky na místo)'); }
    }
  });
  wrap('openDoor', (original, record) => {
    count('číslované dveře otevřeny');
    events.doors.add(`${logic.m[0x5BD3]}/${logic.m[record+4]}`);
    return original(record);
  });
  wrap('goToHold', (original, to) => {
    const from = logic.m[0x5BD3];
    if (logic.m[0xF241]) { count('klíč ztracen průchodem dveřmi'); }
    events.edges.add(`${from}→${to}`);
    count('přechod podpalubí');
    return original(to);
  });
}

async function runGame(name, dir, INIT, options) {
  const rec = load(dir);
  const { regions, size, passes, inputs, outcomes, start, init } = rec;
  const messages = [];
  const worker = startWorker((message) => messages.push(message));
  const ctx = worker.context;
  const LOCK = ctx.ENTER_LOCK_FRAMES;
  if (!options.lock) { ctx.ENTER_LOCK_FRAMES = 0; }
  const seed = start[0xF343] | (start[0xF344] << 8);
  worker.send({id: 'init', initData: Object.assign({headless: true, seed}, INIT)});
  const logic = ctx.logic;
  const m = logic.m;
  // ★ the controls chosen in the original's menu ($5BEA) and the keys they
  // define ($5BEB-$5BEF); the remake's model maps keys to the five actions
  // itself, so the worker keeps the original's codes
  for (let a = 0x5BEA; a < 0x5BF0; a++) { m[a] = start[a]; }
  const codes = Array.from(m.subarray(0x5BEB, 0x5BF0));
  let checks = 0;

  // --- the start: the worker's new game = the original's at its first pass
  for (const [lo, hi, label] of regions) {
    for (let a = lo; a < hi; a++) {
      checks++;
      if (m[a] !== init[a]) {
        console.log(`  start, ${label}: ${hex(a)} remake ${hex(m[a], 2)}, originál ${hex(init[a], 2)}`);
        return {checks, diffs: 1, passes: 0};
      }
    }
  }

  const events = {treasures: new Set(), doors: new Set(), edges: new Set()};
  instrument(logic, events);
  // FRAMES as the original's timer read it, written just before the pass
  let pending = null;
  const pass = logic.pass.bind(logic);
  logic.pass = (input) => {
    const want = pending;
    pending = null;
    if (!want) { throw new Error('průchod, který nástroj nečekal'); }
    if (want.key !== null && input.key !== want.key) {
      throw new Error(`worker dal průchodu klávesu ${input.key}, originál ${want.key}`
                      +(want.locked ? ' (ENTER_LOCK_FRAMES)' : ''));
    }
    if (want.frames !== null) { logic.wr16(0x5C78, want.frames); }
    return pass(input);
  };

  let lockUntil = -1, lockHits = 0, ticks = 0, rounds = 0;
  for (let i = 0; i < inputs.length; i++) {
    const keys = inputs[i].filter(([tag]) => tag === 'K').map(([, v]) => v);
    const frames = inputs[i].filter(([tag]) => tag === 'F').map(([, v]) => v);
    // ★ no key when the pass ends before $ED35 (a death, the gold key)
    if (keys.length > 1 || frames.length > 1) {
      console.log(`  průchod ${i}: čekám nejvýš jednu klávesu a jedno čtení FRAMES, je ${JSON.stringify(inputs[i])}`);
      return {checks, diffs: 1, passes: i};
    }
    const action = keys.length ? codes.indexOf(keys[0]) : -1;
    const controls = {};
    ACTIONS.forEach((a, k) => { controls[a] = k === action; });
    worker.send(Object.assign({id: 'controls'}, controls));
    // a key that is not one of the five (M, P, any other) reaches the pass as none
    const key = !keys.length ? null : action >= 0 ? keys[0] : 0xFF;
    if (action === 4 && ctx.state.frame < lockUntil) { lockHits++; }
    pending = {key, frames: frames.length ? frames[0] : null, locked: options.lock && action === 4};
    const hold = m[0x5BD3];
    const before = ctx.state.pass;
    messages.length = 0;
    let guard = 0;
    while (ctx.state.pass === before) {
      try {
        worker.send({id: 'tick'});
      } catch (error) {
        console.log(`  průchod ${i}: ${error.message}`);
        if (options.verbose) { console.log(error.stack); }
        return {checks, diffs: 1, passes: i};
      }
      ticks++;
      if (++guard > 1000) {
        console.log(`  průchod ${i}: worker ho za 1000 tiků neudělal`);
        return {checks, diffs: 1, passes: i};
      }
    }
    if (pending) {
      console.log(`  průchod ${i}: worker neprošel hlídaným průchodem`);
      return {checks, diffs: 1, passes: i};
    }
    if (m[0x5BD3] !== hold) {
      // where the remake's lock would end (ENTER_LOCK_FRAMES = 25, from the
      // end of the change of hold)
      lockUntil = ctx.state.enterLockUntil+(options.lock ? 0 : LOCK);
    }
    const outcome = ctx.state.outcome;
    if (outcome === 'round') { rounds++; }
    checks++;
    if ((outcome === 'gameover') !== (outcomes[i] === 'gameover')) {
      console.log(`  průchod ${i}: remake ${outcome}, originál ${outcomes[i]}`);
      return {checks, diffs: 1, passes: i};
    }
    let at = i*size;
    for (const [lo, hi, label] of regions) {
      for (let a = lo; a < hi; a++, at++) {
        checks++;
        if (m[a] !== passes[at]) {
          let count = 0;
          for (let b = a, k = at; b < hi; b++, k++) { if (m[b] !== passes[k]) { count++; } }
          console.log(`  průchod ${i} (${outcome}), ${label}: ${hex(a)} remake ${hex(m[a], 2)}, originál ${hex(passes[at], 2)}`
                      +` – v oblasti ${count} rozdílů; vstupy ${JSON.stringify(inputs[i])}`);
          return {checks, diffs: count, passes: i};
        }
      }
    }
    // the frame the model gets: what it shows comes out of the same memory
    const frame = messages.filter((msg) => msg.id === 'frame').pop();
    if (outcome !== 'gameover') {
      const ok = frame && frame.pass === ctx.state.pass && frame.outcome === outcome && frame.hold === m[0x5BD3]
        && frame.panel.lives === m[0x5BF1] && frame.panel.booty === (m[0x5BF4] | (m[0x5BF5] << 8))
        && frame.panel.treasure === (m[0x5BF2] | (m[0x5BF3] << 8)) && frame.panel.key === m[0xF241]
        && frame.screen && frame.screen.every((v, k) => v === m[0x4000+k]);
      checks++;
      if (!ok && !ctx.state.transition) {
        console.log(`  průchod ${i}: zpráva frame neodpovídá paměti: `
                    +JSON.stringify(Object.assign({}, frame, {screen: frame && !!frame.screen, jim: undefined}))
                    +` pass ${ctx.state.pass}, hold ${m[0x5BD3]}, key ${m[0xF241]}`);
        return {checks, diffs: 1, passes: i};
      }
    } else {
      checks++;
      if (!messages.some((msg) => msg.id === 'gameOver')) {
        console.log(`  průchod ${i}: konec hry bez zprávy gameOver`);
        return {checks, diffs: 1, passes: i};
      }
      return {checks, diffs: 0, passes: i+1, events, lockHits, ticks, rounds};
    }
  }
  return {checks, diffs: 0, passes: inputs.length, events, lockHits, ticks, rounds};
}

async function main() {
  const args = process.argv.slice(2);
  const options = {verbose: args.includes('--verbose'), lock: !args.includes('--no-lock')};
  // the recordings of tools/tracephysics.py that start with an untouched new
  // game go as well (the others write numbers into the memory first)
  let games;
  if (args.includes('--base')) {
    const base = path.resolve(ROOT, args[args.indexOf('--base')+1]);
    const names = args.includes('--name') ? [args[args.indexOf('--name')+1]]
      : fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'inputs.json'))).sort();
    games = names.map((name) => [name, path.join(base, name)]);
  } else {
    const rules = path.join(ROOT, 'build/rules');
    if (!fs.existsSync(rules)) {
      console.log('build/rules/ chybí – ./tools/tracerules.py');
      process.exit(2);
    }
    games = fs.readdirSync(rules).filter((d) => fs.existsSync(path.join(rules, d, 'inputs.json'))).sort()
      .map((name) => [name, path.join(rules, name)])
      .concat(NEW_GAME_TRACES.map((name) => [name, path.join(ROOT, 'build/trace', name)]));
    if (args.includes('--name')) {
      games = games.filter(([name]) => name === args[args.indexOf('--name')+1]);
    }
  }
  const INIT = await initData();
  let checks = 0, diffs = 0, total = 0;
  for (const [name, dir] of games) {
    const r = await runGame(name, dir, INIT, options);
    console.log(`${name.padEnd(8)} ${String(r.passes).padStart(6)} průchodů, ${r.checks} kontrol, ${r.diffs} rozdílů`);
    if (r.events) {
      const e = r.events;
      const counts = Object.keys(e).filter((k) => typeof e[k] === 'number').sort()
        .map((k) => `${k} ${e[k]}`).join(', ');
      console.log(`         ${counts}`);
      console.log(`         nové kolo (zlatý klíč) ${r.rounds}×; různých kusů kořisti ${e.treasures.size}, `
                  +`otevřených dveří ${e.doors.size}, hran lodi ${e.edges.size}`);
      if (options.verbose) {
        console.log(`         hrany: ${[...e.edges].sort((a, b) => parseInt(a)-parseInt(b) || a.localeCompare(b)).join(' ')}`);
        console.log(`         dveře (podpalubí/číslo): ${[...e.doors].sort((a, b) => parseInt(a)-parseInt(b)).join(' ')}`);
      }
      console.log(`         ENTER_LOCK_FRAMES by zasáhl ${r.lockHits}×; tiků workeru ${r.ticks}`);
    }
    checks += r.checks;
    diffs += r.diffs;
    total += r.passes;
  }
  console.log(`celkem ${total} průchodů, ${checks} kontrol, **${diffs} rozdílů**`);
  process.exit(diffs ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
