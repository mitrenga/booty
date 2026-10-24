#!/usr/bin/env node
/**
 * The enemies and everything else that moves in a hold (M5): the entity table
 * after every pass, the remake against the original, and the paths, turns,
 * pace, animation and touch envelopes verified **on the original's data**.
 *
 *   ./tools/matchentities.mjs [--base build/trace] [--script hold12] [--verbose]
 *
 * Without `--base` it goes over both kinds of recordings: `build/trace/`
 * (tracephysics.py) and `build/rules/` (whole games from RZX, tracerules.py).
 *
 * **The entity table** (`sources/docs/enemies.md`) – what moves in a hold on
 * its own, split into the records the original's code reads:
 *
 * - pirates: `OPST` in the hold buffer (pointer `$5BDE`, 16 B)
 * - the creature from the timer: `$F31C` (16 B)
 * - lifts: `LIDAT` (pointer `$5BE4`, 16 B)
 * - portholes: `PHDAT` (pointer `$5BDC`, 3 B)
 * - the explosion of booby-trapped booty: `$E46F`–`$E479` and phase `$F341`
 * - the splinters of the explosion: `$F2DB`, 5 × 6 B
 * - Jim: `$F231` (20 B) – the other side of the collisions
 *
 * After every pass the remake's table (`BootyLogic.pass`, the code that goes
 * into the browser) is compared with the original's – the number of records,
 * every byte and **the image of every entity on the screen** (the bitmap and
 * attributes of the cells it covers). A difference = the end, as in
 * `matchphysics.mjs`.
 *
 * **On the original's data** (the memory before the pass and after it, nothing
 * of the remake) the rules of `enemies.md` are verified as well; every
 * violation is a difference:
 *
 * - a pirate moves every other pass (`$F334` ≠ 0) by one fine position
 *   (2 px), frame + 6 cyclically; **it turns exactly when** the next step is
 *   beyond the edge, in a closed numbered door, or over a gap in the char
 *   map – Jim plays no part in it
 * - the creature moves every pass by a fine position, along its deck, until it
 *   vanishes beyond the edge
 * - a lift moves every other pass (`$F334` = 0) and turns at the limits
 *   +10/+11 and +12/+13
 *
 * And from the remake (whose memory equals the original's) the relative
 * position of Jim and the pirate / creature is recorded at the moment of the
 * touch test: the **touch envelope** of `enemies.md` must split all cases
 * into death and no death without exception.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require = createRequire(import.meta.url);
const loadClassicScript = require(path.join(ROOT, 'app/svision/tools/classicScript.cjs'));
const BootyLogic = loadClassicScript(path.join(ROOT, 'app/bootyLogic.js'));

function hex(v, n = 4) { return '$'+v.toString(16).toUpperCase().padStart(n, '0'); }

// ★ the 8-bit tests of the original (sources/docs/enemies.md, "Dotyk")
const ENVELOPE = {
  // $F0A4: (4(jC−1) + jE + 7 − (4(pC−1) + pE)) < 16, (jB + 2 − pB) < 6
  pirate: (j, e) => (((4*((j.c-1) & 0xFF)+j.e+7-((4*((e.c-1) & 0xFF)+e.e) & 0xFF)) & 0xFF) < 16)
    && (((j.b+2-e.b) & 0xFF) < 6),
  // $E2C3: (jB − 1 + h − cB) < h + 3, (4(jC + w) + jE − 1 − (4cC + cE)) < 4(w + 2)
  creature: (j, e) => (((j.b-1+e.h-e.b) & 0xFF) < ((e.h+3) & 0xFF))
    && ((((4*(j.c+e.w)+j.e-1) & 0xFF)-((4*e.c+e.e) & 0xFF) & 0xFF) < (((e.w+2) << 2) & 0xFF)),
};

// ------------------------------------------------------------ the entity table

/** the entity table out of a memory read by `rd(address)` */
function entities(rd) {
  const rd16 = (a) => rd(a) | (rd(a+1) << 8);
  const out = [];
  const list = (kind, pointer, size) => {
    for (let a = rd16(pointer), k = 0; rd(a) !== 0xFF; a += size, k++) {
      if (k > 32) { throw new Error(`${kind}: table without an end`); }
      out.push({kind, at: a, size});
    }
  };
  list('pirate', 0x5BDE, 16);
  list('lift', 0x5BE4, 16);
  list('porthole', 0x5BDC, 3);
  out.push({kind: 'creature', at: 0xF31C, size: 16});
  out.push({kind: 'explosion', at: 0xE46F, size: 11});
  out.push({kind: 'explosion phase', at: 0xF341, size: 1});
  for (let k = 0; k < 5; k++) { out.push({kind: 'splinter', at: 0xF2DB+6*k, size: 6}); }
  out.push({kind: 'Jim', at: 0xF231, size: 20});
  for (const e of out) {
    e.bytes = [];
    for (let a = e.at; a < e.at+e.size; a++) { e.bytes.push(rd(a)); }
    e.box = box(e);
  }
  return out;
}

/** the cells the entity covers on the screen: [column, row, width, height] */
function box(e) {
  const [c, b, fe, fd] = e.bytes;
  switch (e.kind) {
    case 'pirate': case 'lift': case 'Jim':
      return [33-c, 24-b, e.bytes[7]+(fe !== 3), e.bytes[8]+(fd !== 3)];
    case 'creature':
      return c ? [33-c, 24-b, e.bytes[7]+(fe !== 3), e.bytes[8]+(fd !== 3)] : null;
    case 'porthole': case 'explosion':
      return [33-c, 24-b, 2, 2];
    case 'splinter':
      return c ? [33-c, 24-b, 1, 1] : null;
    default:
      return null;
  }
}

/** the bitmap and attribute bytes under the box, clipped to the screen */
function* boxBytes(bx) {
  if (!bx) { return; }
  const [x0, y0, w, h] = bx;
  for (let y = Math.max(0, y0); y < Math.min(24, y0+h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(32, x0+w); x++) {
      for (let line = 0; line < 8; line++) {
        yield 0x4000 | ((y & 0x18) << 8) | (line << 8) | ((y & 7) << 5) | x;
      }
      yield 0x5800+32*y+x;
    }
  }
}

// ------------------------------------------------------------ records

function load(dir) {
  const regions = JSON.parse(fs.readFileSync(path.join(dir, 'regions.json'), 'utf8'));
  const { inputs } = JSON.parse(fs.readFileSync(path.join(dir, 'inputs.json'), 'utf8'));
  const size = regions.reduce((sum, [lo, hi]) => sum+hi-lo, 0);
  const passes = zlib.gunzipSync(fs.readFileSync(path.join(dir, 'passes.xor.gz')), {maxOutputLength: 2**31-1});
  for (let i = size; i < passes.length; i++) { passes[i] ^= passes[i-size]; }
  const offset = new Int32Array(65536).fill(-1);
  let at = 0;
  for (const [lo, hi] of regions) {
    for (let a = lo; a < hi; a++) { offset[a] = at++; }
  }
  const init = new Uint8Array(fs.readFileSync(path.join(dir, 'init.bin')));
  // the original's memory after pass i (-1: before the first)
  const after = (i) => i < 0 ? (a) => init[a] : (a) => {
    if (offset[a] < 0) { throw new Error(`${hex(a)} is not in the recording`); }
    return passes[i*size+offset[a]];
  };
  return {inputs, init, after};
}

// ------------------------------------------------------------ the original's rules

/** `$EEA6` on a record read by rd */
function newPlace(rd, ix) {
  let c = rd(ix), b = rd(ix+1);
  let e = (rd(ix+4)+rd(ix+2)) & 0xFF, d = (rd(ix+5)+rd(ix+3)) & 0xFF;
  if (e >= 0x80) { c = (c-1) & 0xFF; e &= 3; } else if (e >= 4) { c = (c+1) & 0xFF; e &= 3; }
  if (d >= 0x80) { b = (b-1) & 0xFF; d &= 3; } else if (d >= 4) { b = (b+1) & 0xFF; d &= 3; }
  return {c, b, e, d};
}

/**
 * The pirates of one pass in the original: why each one turned or stepped,
 * out of the memory before the pass (pre) and after it (post). Returns the
 * number of violations.
 */
function checkPirates(pre, post, cov, where, verbose) {
  let bad = 0;
  const rd16 = (a) => pre(a) | (pre(a+1) << 8);
  const doors = [];
  for (let a = rd16(0x5BDA); pre(a) !== 0xFF; a += 6) {
    doors.push({c: pre(a), b: pre(a+1), closed: pre(a+5) !== 0});
  }
  const hold = pre(0x5BD3);
  for (let ix = rd16(0x5BDE); pre(ix) !== 0xFF; ix += 16) {
    const p = newPlace(pre, ix);
    const right = pre(ix+4) === 0xFF;
    let reason = null;
    if (p.c === 0x22 || p.c === 3) {
      reason = 'edge';
    } else {
      const cc = right ? (p.c-2) & 0xFF : p.c;
      const door = doors.find((d) => d.c === cc && ((d.b-2) & 0xFF) === p.b);
      if (door && door.closed) {
        reason = 'closed door';
      } else {
        // ★ $F074: the char map under the next step ((24 − (B − 3)) × 32 + 33 − C)
        const place = (((24-((p.b-3) & 0xFF)) << 5)+33-cc) & 0xFFFF;
        if (pre((0xA1C4+place) & 0xFFFF) < 0x21) {
          reason = 'end of deck';
        } else if (door) {
          count(cov, 'pirate: step through an open door');
        }
      }
    }
    let frame = (pre(ix+6)+6) & 0xFF;
    if (frame === 0x4A) { frame = 0x20; }
    if (frame === 0x80) { frame = 0x50; }
    let want;
    if (reason) {
      const dir = p.c === 0x22 ? 0xFF : p.c === 3 ? 1 : right ? 1 : 0xFF;
      want = {c: pre(ix), b: pre(ix+1), e: pre(ix+2), d: pre(ix+3), dir, frame: dir === 0xFF ? 0x20 : 0x50};
      count(cov, `pirate: turn – ${reason}`);
    } else {
      want = Object.assign({}, p, {dir: pre(ix+4), frame});
      count(cov, 'pirate: step');
    }
    const got = {c: post(ix), b: post(ix+1), e: post(ix+2), d: post(ix+3), dir: post(ix+4), frame: post(ix+6)};
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      bad++;
      if (verbose || bad === 1) {
        console.log(`  ${where}, hold ${hold}, pirate ${hex(ix)}: original ${JSON.stringify(got)}, `
                    +`rule ${JSON.stringify(want)} (${reason || 'step'})`);
      }
    }
    cov.pirateHolds.add(hold);
  }
  return bad;
}

/** the creature in the original: one fine step a pass along its deck */
function checkCreature(pre, post, cov, where, verbose) {
  const ix = 0xF31C;
  if (pre(ix) === 0) {
    if (post(ix) !== 0) {
      const rat = post(ix+7) === 4;
      const deck = (post(ix+1)-(rat ? 1 : 3)) & 0xFF;
      const from = post(ix) === 2 ? 'from the right' : 'from the left';
      count(cov, `creature: ${rat ? 'rat' : 'parrot'} ${from}`);
      cov.creatureDecks.add(deck);
      const ok = [3, 8, 13, 18].includes(deck)
        && (post(ix) === 2 ? post(ix+4) === 1 : post(ix) === 0x25 && post(ix+4) === 0xFF);
      if (!ok) {
        console.log(`  ${where}: creature released against the rule: ${JSON.stringify(Array.from({length: 16}, (_, k) => post(ix+k)))}`);
        return 1;
      }
    }
    return 0;
  }
  const p = newPlace(pre, ix);
  if (p.c === 0x26 || p.c === 1) {
    count(cov, 'creature: left beyond the edge');
    if (post(ix) !== 0) {
      console.log(`  ${where}: the creature should have left, the original has it at ${hex(post(ix), 2)}`);
      return 1;
    }
    return 0;
  }
  let f = pre(ix+6);
  if (f >= 0x25) { f = (f+8) & 0xFF; if (f >= 0x47) { f = (f-0x20) & 0xFF; } }
  const want = [p.c, p.b, p.e, p.d, f];
  const got = [post(ix), post(ix+1), post(ix+2), post(ix+3), post(ix+6)];
  count(cov, 'creature: step');
  if (want.join() !== got.join()) {
    if (verbose) { console.log(`  ${where}: creature ${got} instead of ${want}`); }
    console.log(`  ${where}: the original's creature ${got}, rule ${want}`);
    return 1;
  }
  return 0;
}

/** the lifts in the original: every other pass, back at their two limits */
function checkLifts(pre, post, cov, where) {
  const rd16 = (a) => pre(a) | (pre(a+1) << 8);
  const hold = pre(0x5BD3);
  const moving = pre(0xF334) === 0;
  let bad = 0;
  for (let ix = rd16(0x5BE4); pre(ix) !== 0xFF; ix += 16) {
    const vertical = pre(ix+4) === 0;
    let want;
    if (!moving) {
      want = [pre(ix), pre(ix+1), pre(ix+2), pre(ix+3), pre(ix+4), pre(ix+5)];
    } else {
      const p = newPlace(pre, ix);
      let dx = pre(ix+4), dy = pre(ix+5);
      const [pos, fine, dir] = vertical ? [p.b, p.d, dy] : [p.c, p.e, dx];
      const [lim, limFine, next] = dir === 0xFF ? [pre(ix+12), pre(ix+13), 1] : [pre(ix+10), pre(ix+11), 0xFF];
      if (pos === lim && fine === limFine) {
        if (vertical) { dy = next; } else { dx = next; }
        count(cov, `lift: turn (${vertical ? 'vertical' : 'horizontal'})`);
      }
      count(cov, `lift: step (${vertical ? 'vertical' : 'horizontal'})`);
      want = [p.c, p.b, p.e, p.d, dx, dy];
      cov.liftHolds.add(hold);
    }
    const got = [post(ix), post(ix+1), post(ix+2), post(ix+3), post(ix+4), post(ix+5)];
    if (want.join() !== got.join()) {
      bad++;
      console.log(`  ${where}, hold ${hold}, lift ${hex(ix)}: original ${got}, rule ${want}`);
    }
  }
  // ★ $E821 sets $E820 to 2 and $DF13 takes one off in the same pass
  if (moving && post(0xE820) === 1) { count(cov, 'lift: carries Jim'); }
  return bad;
}

function count(cov, key, n = 1) { cov.counts[key] = (cov.counts[key] || 0)+n; }

// ------------------------------------------------------------ the remake's touch tests

/**
 * Where Jim and a pirate or the creature were when the original tested the
 * touch: remember() comes right before the test in both $F001 and $E22D,
 * and a death right after it is that test's.
 */
function instrument(logic, cov) {
  const m = logic.m;
  let testing = null, pending = null;
  const settle = (killed) => {
    if (!pending) { return; }
    const {kind, j, e} = pending;
    pending = null;
    const inside = ENVELOPE[kind === 'pirate' ? 'pirate' : 'creature'](j, e);
    const key = `${kind}${e.w ? ` ${e.w}×${e.h}` : ''}`;
    const t = cov.touch[key] = cov.touch[key] || {kills: 0, misses: 0, wrong: 0, d4: [99, -99], db: [99, -99], near: 0};
    const d4 = (4*j.c+j.e)-(4*e.c+e.e), db = j.b-e.b;
    if (killed) {
      t.kills++;
      t.d4 = [Math.min(t.d4[0], d4), Math.max(t.d4[1], d4)];
      t.db = [Math.min(t.db[0], db), Math.max(t.db[1], db)];
    } else {
      t.misses++;
      if (Math.abs(d4) <= 10 && Math.abs(db) <= 4) { t.near++; }
    }
    if (inside !== killed) {
      t.wrong++;
      if (t.wrong === 1) { console.log(`  envelope ${key}: Jim ${JSON.stringify(j)}, ${JSON.stringify(e)}, death ${killed}`); }
    }
  };
  const remember = logic.remember.bind(logic);
  logic.remember = (ix) => {
    remember(ix);
    if (!testing) { return; }
    settle(false);
    const e = {c: m[ix], b: m[ix+1], e: m[ix+2]};
    if (testing === 'creature') { e.w = m[ix+7]; e.h = m[ix+8]; }
    pending = {kind: testing, j: {c: m[0xF231], b: m[0xF232], e: m[0xF233]}, e};
  };
  const wrap = (name, kind) => {
    const fn = logic[name].bind(logic);
    logic[name] = () => {
      testing = kind;
      try {
        return fn();
      } finally {
        settle(false);
        testing = null;
      }
    };
  };
  wrap('pirates', 'pirate');
  wrap('creature', 'creature');
  const death = logic.death.bind(logic);
  logic.death = () => {
    const cause = {1: 'creature', 2: 'pirate', 3: 'splinter'}[m[0xFFFE]];
    if (testing && pending) {
      settle(true);
    } else if (cause === 'splinter') {
      // ★ $E448: the splinter on Jim's cell or one to his left / below
      const j = {c: m[0xF231], b: m[0xF232]};
      const hit = [0, 1, 2, 3, 4].map((k) => 0xF2DB+6*k)
        .filter((ix) => m[ix] && ((j.b-m[ix+1]) & 0xFF) < 2 && ((j.c-m[ix]) & 0xFF) < 2);
      count(cov, hit.length ? 'death: splinter (inside the envelope)' : 'death: splinter OUTSIDE THE ENVELOPE');
    }
    return death();
  };
  // the creature's timer: refused for a closed door on the deck (one call of
  // $E349) or a deck that is not whole (three)
  let rands = 0;
  const rand = logic.rand.bind(logic);
  logic.rand = () => { rands++; return rand(); };
  const timer = logic.timer.bind(logic);
  logic.timer = () => {
    rands = 0;
    const result = timer();
    if (rands && !m[0xF31C]) {
      count(cov, rands === 1 ? 'creature: not released – a closed door on the deck' : 'creature: not released – the deck is not whole');
    }
    return result;
  };
}

// ------------------------------------------------------------ one recording

function runScript(dir, cov, verbose) {
  const { inputs, init, after } = load(dir);
  const memory = new Uint8Array(init);
  const logic = new BootyLogic(memory);
  instrument(logic, cov);
  let checks = 0;
  for (let i = 0; i < inputs.length; i++) {
    let outcome;
    try {
      outcome = logic.pass(inputs[i]);
    } catch (error) {
      console.log(`  pass ${i}: ${error.message}`);
      if (verbose) { console.log(error.stack); }
      return {checks, diffs: 1, passes: i};
    }
    const pre = after(i-1), post = after(i);
    // --- the table: the remake's against the original's
    const mine = entities((a) => memory[a]);
    const theirs = entities(post);
    checks++;
    if (mine.length !== theirs.length || mine.some((e, k) => e.kind !== theirs[k].kind || e.at !== theirs[k].at)) {
      console.log(`  pass ${i}: the remake's entity table ${mine.map((e) => e.kind)}, the original's ${theirs.map((e) => e.kind)}`);
      return {checks, diffs: 1, passes: i};
    }
    for (let k = 0; k < mine.length; k++) {
      const a = mine[k], b = theirs[k];
      for (let n = 0; n < a.size; n++) {
        checks++;
        if (a.bytes[n] !== b.bytes[n]) {
          console.log(`  pass ${i} (${outcome}): ${a.kind} ${hex(a.at)} +${n}: remake ${hex(a.bytes[n], 2)}, original ${hex(b.bytes[n], 2)}`);
          return {checks, diffs: 1, passes: i};
        }
      }
      for (const addr of boxBytes(a.box)) {
        checks++;
        if (memory[addr] !== post(addr)) {
          console.log(`  pass ${i} (${outcome}): ${a.kind} ${hex(a.at)} on the screen ${hex(addr)}: `
                      +`remake ${hex(memory[addr], 2)}, original ${hex(post(addr), 2)}`);
          return {checks, diffs: 1, passes: i};
        }
      }
    }
    // --- the original's own rules, on the original's memory only. A pass
    // that left the hold (a door, a death, a new round) starts other tables
    if (outcome !== 'pass' || pre(0x5BD3) !== post(0x5BD3) || pre(0x5BDE) !== post(0x5BDE)) {
      continue;
    }
    const where = `pass ${i}`;
    let bad = 0;
    if (pre(0xF334) !== 0) { bad += checkPirates(pre, post, cov, where, verbose); }
    bad += checkCreature(pre, post, cov, where, verbose);
    bad += checkLifts(pre, post, cov, where);
    checks++;
    if (bad) {
      return {checks, diffs: bad, passes: i};
    }
    if (!pre(0xE479) && post(0xE479)) { count(cov, 'explosion'); }
    if (!pre(0xF2DB) && post(0xF2DB)) { count(cov, 'splinters flew'); }
  }
  return {checks, diffs: 0, passes: inputs.length};
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const bases = args.includes('--base') ? [path.resolve(ROOT, args[args.indexOf('--base')+1])]
    : ['build/trace', 'build/rules'].map((b) => path.join(ROOT, b));
  const cov = {counts: {}, touch: {}, pirateHolds: new Set(), liftHolds: new Set(), creatureDecks: new Set()};
  let checks = 0, diffs = 0, total = 0;
  for (const base of bases) {
    if (!fs.existsSync(base)) {
      console.log(`${path.relative(ROOT, base)}/ is missing`);
      process.exit(2);
    }
    const scripts = args.includes('--script') ? [args[args.indexOf('--script')+1]]
      : fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'inputs.json'))).sort();
    for (const name of scripts) {
      if (!fs.existsSync(path.join(base, name, 'inputs.json'))) { continue; }
      const r = runScript(path.join(base, name), cov, verbose);
      console.log(`${path.basename(base)}/${name.padEnd(10)} ${String(r.passes).padStart(6)} passes, ${r.checks} checks, ${r.diffs} differences`);
      checks += r.checks;
      diffs += r.diffs;
      total += r.passes;
      if (r.diffs) { break; }
    }
  }
  console.log('\ncoverage:');
  for (const key of Object.keys(cov.counts).sort()) {
    console.log(`  ${key.padEnd(46)} ${cov.counts[key]}`);
  }
  console.log(`  holds with pirates: ${[...cov.pirateHolds].sort((a, b) => a-b).join(' ')}`);
  console.log(`  holds with lifts: ${[...cov.liftHolds].sort((a, b) => a-b).join(' ')}`);
  console.log(`  the creature's decks (B): ${[...cov.creatureDecks].sort((a, b) => a-b).join(' ')}`);
  console.log('\ntouch (d4 = Jim − enemy in fine positions, 4C + E; dB = Jim − enemy in rows):');
  for (const [key, t] of Object.entries(cov.touch)) {
    if (t.wrong) { diffs += t.wrong; }
    console.log(`  ${key.padEnd(14)} deaths ${t.kills} (d4 ${t.d4[0]}…${t.d4[1]}, dB ${t.db[0]}…${t.db[1]}), `
                +`no death ${t.misses} (${t.near} of them close), outside the envelope ${t.wrong}`);
  }
  console.log(`\ntotal ${total} passes, ${checks} checks, **${diffs} differences**`);
  process.exit(diffs ? 1 : 0);
}

main();
