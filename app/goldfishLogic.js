// classic script (importScripts): no import, no export — R-001, R-048
// begin code

/**
 * The hidden game of the original, CATCH 20 GOLDFISH — the remake's SECRET
 * SUB GAME (subGameModel.js, subGameWorker.js) and, without the diver and
 * the fish, the background of its menu (menuModel.js; operator's decisions
 * 2026-10-08 and 2026-10-09).
 *
 * ★ The original has it on the tape (`$CE41`, main loop `$CF36`) and never
 * reaches it without a POKE (sources/docs/secondary_findings.md §7). This is
 * its main loop rewritten over the memory laid out as the original's, the way
 * bootyLogic.js is: one `pass()` is one round of `$CF36`, and
 * tools/matchgoldfish.mjs checks it pass by pass against the original run in
 * a Z80 simulator (tools/tracegoldfish.py) — with no key pressed, and with
 * the diver's keys held at random.
 *
 * What a pass does, in the original's order:
 *
 * - `$D2F2` every 16th pass: the air ($D33E) one less and its bar printed
 *   (`$D2F8`); with none left `$D550` takes the catch to 0
 * - `$D8E2`: the 32 glyphs of the sand printed on row 20 and rotated by a bit
 * - `$D92A`: the diver's next frame (`animateDiver`)
 * - every 4th pass `$D5CB`: the diver lifted by the water
 * - `$D778` ×2 (the second time for 1-8 objects only): the fish, octopuses,
 *   eels and the big fish of `$DB46` move, leave and are drawn anew from the
 *   templates `$D93E` by the generator `$D8D4` (the title's sea's, state
 *   `$D86F`)
 * - `$D4CC`: the diver; `$D260`: five bubbles by ROM PLOT (wiped with
 *   INVERSE 1, drawn anew)
 * - `$D579`: the keys of the diver
 * - `$D8A2` every 2nd pass: the top third (the ships) rotated a pixel left
 * - `$CF7E`: the diver touching a goldfish catches it, the big fish takes
 *   them all — a ROM BEEPER each (`events`)
 * - `$CFA8`: the catch printed after FISH (ROM OUT-NUM-1)
 * - at the surface under open sky the air is filled up (`$D05B`)
 *
 * ? Left out: the noise of the air filling up (`$D063`, OUTs to $FE in
 * delay loops of the generator — only its calls of the generator stay).
 *
 * **The ink plane** (`inkPlane`, R-036, DESIGN-inkplane.md as in jetpac): a
 * byte per pixel beside the memory, in the format of svision's
 * `ZXVideoRAM.encodeInk` (bit 7 owned, bit 4 FLASH, bit 3 BRIGHT, bits 0-2
 * ink), kept by the very writes that draw the screen (poke) with the pen
 * ATTR-T (`$5C8F`) — the attribute the ROM and the game colour the cell with
 * as they write it. ★ A bubble is ROM PLOT, which sets ATTR-T to its whole
 * cell (PO-ATTR) with the diver's INK still in it: on the machine a bubble
 * rising through a fish turns the fish's cell the diver's colour. With the
 * plane the fish's pixels keep theirs. The memory is the original's either
 * way (tools/matchgoldfish.mjs --ink).
 *
 * No DOM; `ZXRomDraw` (svision, a classic script, R-048) is the ROM's PLOT.
 * **A classic script**, because the sub game runs it in its worker
 * (importScripts) and the menu in the main thread: the menu's header loads
 * it for its side effect and the name is the global one, Node tools load it
 * with tools/classicScript.cjs.
 */
class GoldfishLogic {

  /**
   * @param {Uint8Array} memory - 64 KB as the original's at `$CF36`; for
   *        `panel` with the ROM font at `$3D00` (the digits of the catch).
   * @param {Object} [options] - `animateDiver`: the original's `$D92A`;
   *        `diver: false`: no diver at all (the menu) — he is wiped off the
   *        screen (removeDiver) and what is his is left out: his moves
   *        `$D5CB`/`$D4CC`, his bubbles `$D260` and the catches `$CF7E`;
   *        `objects: false`: no fish either (the menu, operator's decision
   *        2026-10-09) — `$D778` is left out, only the ships and the sand
   *        move; `panel`: rows 22-23 printed as the original prints them,
   *        the catch (`$CFA8`) and the AIR bar (`$D2F8`) — the menu writes
   *        its own line there instead; `input`: a function called with this
   *        logic where the original reads its keys (`$D579`), returning
   *        'left', 'right', 'up', 'down' or null — one key a pass, as ROM
   *        KEY-SCAN gives one (the sub game's player, subGameWorker.js);
   *        `inkPlane`: keep the ink plane (`this.ink`, 256 × 192 bytes,
   *        see the class) for a picture without attribute clash.
   */
  constructor(memory, options) {
    if (!(memory instanceof Uint8Array) || memory.length !== 65536) {
      throw new Error('GoldfishLogic needs 64 KB of memory');
    }
    this.m = memory;
    this.animateDiver = !!(options && options.animateDiver);
    this.withDiver = !(options && options.diver === false);
    this.withObjects = !(options && options.objects === false);
    this.panel = !!(options && options.panel);
    this.input = (options && options.input) || null;
    // the plane starts with no owners: the first screen is the cells' own
    this.ink = (options && options.inkPlane) ? new Uint8Array(256*192) : null;
    // ROM PLOT changes a bit of a byte, so only that bit is drawn (poke)
    this.rom = new ZXRomDraw({rd: (a) => this.m[a & 0xFFFF], wr: (a, v) => this.poke(a, v, true)});
    this.pending = null;
    // what the last pass played: {id: 'beeper', de, hl} for ROM BEEPER
    this.events = [];
    if (!this.withDiver) {
      this.removeDiver();
    }
  } // constructor

  /**
   * The diver wiped off the screen where he was last drawn (+13, +14 of
   * `$DC0E`), the way the original wipes a moving object (`$D33F`): blank
   * glyphs on the sea's paper (1).
   */
  removeDiver() {
    var m = this.m, ix = 0xDC0E;
    this.rst10(0x11); this.rst10(1);
    var e = m[ix+7], d = m[ix+8];
    if (m[ix+0x0B] !== 3) { e = (e+1) & 0xFF; }
    if (m[ix+0x0F] !== 3) { d = (d+1) & 0xFF; }
    this.blank(m[ix+0x0D], m[ix+0x0E], d, e);
  } // removeDiver

  // ------------------------------------------------------------ memory

  rd16(a) { return this.m[a & 0xFFFF] | (this.m[(a+1) & 0xFFFF] << 8); }
  wr16(a, v) { this.m[a & 0xFFFF] = v & 0xFF; this.m[(a+1) & 0xFFFF] = (v >> 8) & 0xFF; }
  /**
   * A write of the machine (ROM above $4000 does nothing). With the ink plane
   * a write into the bitmap keeps it, as ZXVideoRAM.markInk does: the bits it
   * drew take the pen ATTR-T, the bits it put out lose their owner.
   * @param {number} a - The address.
   * @param {number} v - The byte.
   * @param {boolean} [plot] - ROM PLOT: only the bits it lit are drawn, the
   *        rest of the byte is read and written back as it was; a print
   *        writes the whole byte and draws every bit it lights.
   */
  poke(a, v, plot) {
    a &= 0xFFFF;
    if (a < 0x4000) {
      return;
    }
    v &= 0xFF;
    if (this.ink && a < 0x5800) {
      var before = this.m[a];
      var drawn = plot ? v & ~before : v;
      if (before !== v || drawn) {
        var o = a-0x4000;
        var base = ((o & 0x1800) >> 5 | (o & 0x0700) >> 8 | (o & 0x00E0) >> 2)*256+(o & 0x1F)*8;
        var t = this.m[0x5C8F];
        var pen = 0x80 | (t & 0x07) | ((t & 0x40) ? 0x08 : 0) | ((t & 0x80) ? 0x10 : 0);
        for (var bit = 0; bit < 8; bit++) {
          var mask = 0x80 >> bit;
          if (!(v & mask)) {
            this.ink[base+bit] = 0;
          } else if (drawn & mask) {
            this.ink[base+bit] = pen;
          }
        }
      }
    }
    this.m[a] = v;
  } // poke
  setChars(v) { this.wr16(0x5C36, v); }

  /**
   * The ships and the sand as they are now, for the other screen that runs
   * the hidden game (the menu and SECRET SUB GAME hand them over, so they go
   * on rolling where the other one left them): the top third of the screen,
   * which only `$D8A2` writes (ships), the 32 glyphs of the sand `$D8E2`
   * rotates in place (sand), and bit 0 of the pass counter `$D93D`, which
   * decides whether the ships move this pass (phase).
   * @returns {{ships: Uint8Array, sand: Uint8Array, phase: number}}
   */
  scenery() {
    var m = this.m;
    return {ships: m.slice(0x4000, 0x4800), sand: m.slice(0xDC22, 0xDD22), phase: m[0xD93D] & 1};
  } // scenery

  /**
   * Takes over the ships and the sand of scenery(). Only bit 0 of `$D93D`:
   * the rest of the counter times the air (`$D2F2`, every 16th pass) and
   * stays the original's. The top third has no owners in the ink plane.
   * @param {Object} [scenery] - What scenery() gave; nothing changes without.
   */
  setScenery(scenery) {
    if (!scenery || !scenery.ships || !scenery.sand) {
      return;
    }
    var m = this.m;
    m.set(scenery.ships, 0x4000);
    m.set(scenery.sand, 0xDC22);
    m[0xD93D] = (m[0xD93D] & 0xFE) | (scenery.phase & 1);
  } // setScenery

  /** `$D8D4`: A ← 5·A + 1 over `$D86F` */
  rand() {
    var a = (5*this.m[0xD86F]+1) & 0xFF;
    this.m[0xD86F] = a;
    return a;
  } // rand

  // ------------------------------------------------------------ the ROM

  /**
   * RST $10 with the control codes the game sends: INK ($10), PAPER ($11) to
   * ATTR-T / MASK-T, INVERSE ($14) to P-FLAG bit 2 (the temporary one).
   */
  rst10(a) {
    var m = this.m;
    if (this.pending !== null) {
      var code = this.pending;
      this.pending = null;
      if (code === 0x10) {
        m[0x5C8F] = (m[0x5C8F] & 0xF8) | (a & 7);
        m[0x5C90] &= 0xF8;
      } else if (code === 0x11) {
        m[0x5C8F] = (m[0x5C8F] & 0xC7) | ((a & 7) << 3);
        m[0x5C90] &= 0xC7;
      } else {
        m[0x5C91] = (m[0x5C91] & 0xFB) | ((a & 1) << 2);
      }
      return;
    }
    if (a === 0x10 || a === 0x11 || a === 0x14) {
      this.pending = a;
      return;
    }
    if (a >= 0x20 && a < 0x80) {
      this.romPrint(a);
      return;
    }
    throw new Error('RST $10: code '+a+' is not used by the hidden game');
  } // rst10

  /**
   * The ROM's PO-CHAR / PR-ALL / PO-ATTR for a character of the upper screen
   * at DF-CC: its 8 bytes from CHARS (INVERSE and OVER of P-FLAG), the
   * attribute ATTR-T under MASK-T, then DF-CC one on and S-POSN's column one
   * less. The hidden game never prints past the end of a line, so the ROM's
   * line feed and scroll are not here.
   */
  romPrint(a) {
    var m = this.m;
    var glyph = (this.rd16(0x5C36)+8*a) & 0xFFFF;
    var df = this.rd16(0x5C84);
    var inverse = (m[0x5C91] & 4) ? 0xFF : 0;
    var over = m[0x5C91] & 1;
    for (var line = 0; line < 8; line++) {
      var at = (df+256*line) & 0xFFFF;
      var v = m[(glyph+line) & 0xFFFF] ^ inverse;
      this.poke(at, over ? v ^ m[at] : v);
    }
    var attr = (((df >> 8) >> 3) & 3) << 8 | 0x5800 | (df & 0xFF);
    var t = m[0x5C8F], mask = m[0x5C90];
    this.poke(attr, ((m[attr] ^ t) & mask) ^ t);
    this.wr16(0x5C84, df+1);
    m[0x5C88] = (m[0x5C88]-1) & 0xFF;
  } // romPrint

  /**
   * ROM OUT-NUM-1 (`$1A1B`): BC (under 10 000) in decimal through RST $10,
   * the leading zeros left out.
   */
  outNum(bc) {
    String(bc).split('').forEach((digit) => this.rst10(digit.charCodeAt(0)));
  } // outNum

  /** CL-SET ($0DD9): DF-CC and S-POSN for line 24 − B, column 33 − C */
  clSet(b, c) {
    var d = (0x18-b) & 0xFF;
    var hl = (0x4000+((d & 0x18) << 8)+((d & 7) << 5)+((0x21-c) & 0xFF)) & 0xFFFF;
    this.m[0x5C88] = c & 0xFF;
    this.m[0x5C89] = b & 0xFF;
    this.wr16(0x5C84, hl);
  } // clSet

  /** `$D353`: the glyph of A at DF-CC (CHARS + 8·A), ATTR-T to its cell */
  printChar(a) {
    var m = this.m;
    var glyph = (this.rd16(0x5C36)+8*(a & 0xFF)) & 0xFFFF;
    var de = this.rd16(0x5C84);
    this.wr16(0x5C84, de+1);
    for (var line = 0; line < 8; line++) {
      this.poke(de+256*line, m[(glyph+line) & 0xFFFF]);
    }
    var c = m[0x5C88], b = m[0x5C89];
    m[0x5C88] = (c-1) & 0xFF;
    // (24 − B) × 32 the way it is shifted: four SLA E with nothing carried
    // into D, then two with — bits 5-7 of 24 − B are lost
    var e0 = (0x18-b) & 0xFF;
    var row = (((e0 >> 3) & 3) << 8) | ((e0 << 5) & 0xFF);
    this.poke((0x5800+((0x21-c) & 0xFF)+row) & 0xFFFF, m[0x5C8F]);
  } // printChar

  // ------------------------------------------------------------ the pass

  /**
   * `$CF36`: one round of the main loop.
   * @returns {string} 'pass', or 'won' when the goldfish caught reach their
   *        target (`$CF3E` → `$D08A`, the original starts Booty then, and
   *        so does the sub game).
   */
  pass() {
    var m = this.m;
    this.events = [];
    if (m[0xDB42] === m[0xDB44]) {
      return 'won';
    }
    // $D2F2: every 16th pass, the air
    if ((m[0xD93D] & 0x0F) === 0) {
      this.air();
    }
    this.sand();                        // $D8E2
    m[0xD93D] = (m[0xD93D]+1) & 0xFF;
    // $D92A: the diver's frame
    if (this.animateDiver) {
      var frame = (m[0xDC14]+2) & 0xFF;
      m[0xDC14] = frame === 0x30 ? 0x20 : frame;
    }
    // $D5CB every 4th pass: INC (IX+5) of the diver
    if (this.withDiver && (m[0xD93D] & 3) === 0) {
      m[0xDC13] = (m[0xDC13]+1) & 0xFF;
    }
    if (this.withObjects) {
      // LD BC,($DD98): B is ($DD99)
      this.objects(m[0xDD99]);          // $D778
      this.objects((this.rand() & 7)+1);// $D778
    }
    if (this.withDiver) {
      this.diver();                     // $D4CC
      this.bubbles();                   // $D260
    }
    // $D579, the keys: what the input presses, if anything
    if (this.withDiver && this.input) {
      this.key(this.input(this));
    }
    if (m[0xD93D] & 1) {
      this.ships();                     // $D8A2
    }
    if (this.withDiver && m[0xD33E] !== 0) {
      this.catches();                   // $CF7E
    }
    // $CFA8: the catch printed after FISH, black on cyan, and a space
    // behind it for the digit that is no more (20 → 0)
    if (this.panel) {
      this.rst10(0x10); this.rst10(0);
      this.rst10(0x11); this.rst10(5);
    }
    this.setChars(0x3C00);
    if (this.panel) {
      this.clSet(2, 0x1C);
      this.outNum(m[0xDB42]);
      this.printChar(0x20);
    }
    // $CFCF: at the surface, nothing above him — the air filled up
    if (m[0xDC0F] === 0x10 && m[0xDC11] === 3) {
      if (m[(0x47E0+((0x21-m[0xDC0E]) & 0xFF)) & 0xFFFF] === 0) {
        m[0xD33E] = 0x13;               // $D05B
        this.air();
        // $D063: ten bursts of noise, two numbers of the generator each
        for (var k = 0; k < 10; k++) {
          this.rand();
          this.rand();
        }
      }
    }
    return 'pass';
  } // pass

  /**
   * `$D579`: a key of the diver ($5BEB-$5BEE) — `$D4C8` INC +4 (left),
   * `$D4C4` DEC +4 (right), `$D5CB` INC +5 (up), `$D5C7` DEC +5 (down).
   * @param {string|null} key - 'left', 'right', 'up', 'down', or null.
   */
  key(key) {
    var m = this.m;
    switch (key) {
      case 'left': m[0xDC12] = (m[0xDC12]+1) & 0xFF; break;
      case 'right': m[0xDC12] = (m[0xDC12]-1) & 0xFF; break;
      case 'up': m[0xDC13] = (m[0xDC13]+1) & 0xFF; break;
      case 'down': m[0xDC13] = (m[0xDC13]-1) & 0xFF; break;
    }
  } // key

  /**
   * `$D2F8`: the air one less and its bar printed at row 22, column 12 — one
   * glyph `$20` of CHARS `$D22E` (a red bar on cyan) for each unit left
   * before the decrement, and `$21` (blank) after them; with none left
   * `$D550` takes the diver's steps and the catch to 0 and only the blank is
   * printed. Without `panel` nothing is printed.
   */
  air() {
    var m = this.m;
    this.setChars(0xD22E);
    if (this.panel) {
      this.clSet(2, 0x15);
      this.rst10(0x10); this.rst10(2);
      this.rst10(0x11); this.rst10(5);
    }
    if (m[0xD33E] === 0) {
      // $D550
      m[0xDC12] = 0; m[0xDC13] = 0;
      m[0xDB42] = 0; m[0xDB43] = 0;
    } else {
      var a = (m[0xD33E]-1) & 0xFF;
      m[0xD33E] = a;
      if (this.panel) {
        for (var b = a+1; b > 0; b--) {
          this.rst10(0x20);
        }
      }
    }
    if (this.panel) {
      this.rst10(0x21);
    }
  } // air

  /** `$D8E2`: the sand — 32 glyphs on row 20, then rotated right by a bit */
  sand() {
    var m = this.m;
    this.rst10(0x11); this.rst10(1);
    this.setChars(0xDB22);
    this.rst10(0x10); this.rst10(6);
    this.clSet(4, 0x21);
    for (var a = 0x20; a < 0x40; a++) {
      this.printChar(a);
    }
    for (var line = 0; line < 8; line++) {
      var base = 0xDC22+line;
      var carry = m[base+0xF8] & 1;
      for (var g = 0; g < 32; g++) {
        var at = base+8*g;
        var v = m[at];
        m[at] = (v >> 1) | (carry << 7);
        carry = v & 1;
      }
    }
  } // sand

  /**
   * `$D8A2`: the top 8 rows (the ships) rotated left by a pixel — straight in
   * the memory, as the original does, so not through poke: the ink plane has
   * no owners there (nothing with a pen reaches the top third — the objects
   * and the diver keep to rows 8-19, the bubbles under line 64).
   */
  ships() {
    var m = this.m;
    for (var line = 0; line < 8; line++) {
      for (var row = 0; row < 8; row++) {
        var de = 0x4000+(line << 8)+(row << 5);
        var carry = m[de] >> 7;
        for (var k = 31; k >= 0; k--) {
          var v = m[de+k];
          m[de+k] = ((v << 1) | carry) & 0xFF;
          carry = v >> 7;
        }
      }
    }
  } // ships

  // ------------------------------------------------------------ the objects

  /**
   * `$D616`: the place an object moves to — the fine steps +4/+5 added to
   * +2/+3, a carry over 3 moves it a cell. Returns {c, b, e, d}.
   */
  step(ix) {
    var m = this.m;
    var c = m[ix], b = m[ix+1], e, d;
    var a = (m[ix+4]+m[ix+2]) & 0xFF;
    if (a >= 0x80) {
      c = (c-1) & 0xFF; a &= 3;
    } else if (a >= 4) {
      c = (c+1) & 0xFF; a &= 3;
    }
    e = a;
    a = (m[ix+5]+m[ix+3]) & 0xFF;
    if (a >= 0x80) {
      b = (b-1) & 0xFF; a &= 3;
    } else if (a >= 4) {
      b = (b+1) & 0xFF; a &= 3;
    }
    d = a;
    return {c: c, b: b, e: e, d: d};
  } // step

  /** `$D33F`: a block D × E of the blank glyphs ($9F6C, codes from $20) */
  blank(c, b, d, e) {
    var chars = this.rd16(0x5C36);
    this.setChars(0x9F6C);
    this.block(0x20, c, b, d, e);
    this.setChars(chars);
  } // blank

  /**
   * `$D460`: D rows of E glyphs from code A, row by row, clipped at the
   * screen's sides (C < 2 on the right ends it, C ≥ $22 is left of it) —
   * literally, with the original's arithmetic of the codes.
   */
  block(a, c, b, d, e) {
    var m = this.m;
    m[0xDB3C] = (a-1) & 0xFF;
    m[0xDB3B] = e & 0xFF;
    while (true) {
      // $D469
      if (c < 2) {
        return;
      }
      e = m[0xDB3B];
      if (c >= 0x22) {
        // $D4AB: left of the screen, the codes counted on
        while (true) {
          m[0xDB3C] = (m[0xDB3C]+1) & 0xFF;
          e = (e-1) & 0xFF;
          if (e === 0) {
            return;                       // JP Z,$D49A
          }
          c = (c-1) & 0xFF;
          if (c >= 0x22) {
            break;                        // JR NC,$D479 (as the code has it)
          }
        }
      }
      // $D479: PUSH BC
      var bc = {b: b, c: c};
      this.clSet(b, c);
      while (true) {
        m[0xDB3C] = (m[0xDB3C]+1) & 0xFF;
        this.printChar(m[0xDB3C]);
        if (c === 2) {
          // $D49C: the rest of the row skipped
          while (true) {
            var z = ((e-1) & 0xFF) === 0;
            m[0xDB3C] = (m[0xDB3C]+1) & 0xFF;
            if (z) {
              break;
            }
            e = (e-1) & 0xFF;
          }
        }
        c = (c-1) & 0xFF;
        e = (e-1) & 0xFF;
        if (e === 0) {
          break;
        }
      }
      b = bc.b; c = bc.c;
      d = (d-1) & 0xFF;
      if (d === 0) {
        return;
      }
      b = (b-1) & 0xFF;
    }
  } // block

  /**
   * `$D3AF`: what an object leaves behind when it moves — a column or a row of
   * blank glyphs where it was (`$D3EA`, `$D405`, `$D425`, `$D445`).
   */
  erase(ix, p) {
    var m = this.m;
    var a = (p.c-m[ix+0x0D]) & 0xFF;
    if (a === 0) {
      if (p.e !== m[ix+0x0B] && p.e === 3) {
        this.eraseRight(ix);
      }
    } else if (a === 0xFF) {
      this.eraseLeft(ix);
    } else {
      this.eraseRight(ix);
    }
    a = (p.b-m[ix+0x0E]) & 0xFF;
    if (a === 0) {
      if (p.d !== m[ix+0x0F] && p.d === 3) {
        this.eraseBottom(ix);
      }
    } else if (a === 0xFF) {
      this.eraseTop(ix);
    } else {
      this.eraseBottom(ix);
    }
  } // erase

  /** `$D3EA` */
  eraseLeft(ix) {
    var m = this.m;
    var d = m[ix+8];
    if (m[ix+3] !== 3) { d = (d+1) & 0xFF; }
    this.blank(m[ix+0x0D], m[ix+0x0E], d, 1);
  } // eraseLeft

  /** `$D405` */
  eraseRight(ix) {
    var m = this.m;
    var d = m[ix+8];
    if (m[ix+3] !== 3) { d = (d+1) & 0xFF; }
    this.blank((m[ix+0x0D]-m[ix+7]) & 0xFF, m[ix+0x0E], d, 1);
  } // eraseRight

  /** `$D425` */
  eraseBottom(ix) {
    var m = this.m;
    var e = m[ix+7];
    if (m[ix+2] !== 3) { e = (e+1) & 0xFF; }
    this.blank(m[ix+0x0D], (m[ix+0x0E]-m[ix+8]) & 0xFF, 1, e);
  } // eraseBottom

  /** `$D445` */
  eraseTop(ix) {
    var m = this.m;
    var e = m[ix+7];
    if (m[ix+2] !== 3) { e = (e+1) & 0xFF; }
    this.blank(m[ix+0x0D], m[ix+0x0E], 1, e);
  } // eraseTop

  /**
   * `$D647`: an object drawn — its frame shifted by +2 into the buffer
   * `$A0F4` (2 pixels a step) and printed from it as glyphs ($9FEC + the fine
   * row), clipped at the sides.
   */
  draw(ix) {
    var m = this.m;
    m.copyWithin(0xA0EC, 0xA06C, 0xA06C+0x80);
    this.rst10(0x10); this.rst10(m[ix+9]);
    var chars = this.rd16(0x5C36);
    var hl = (chars+8*m[ix+6]) & 0xFFFF;
    var shift = (m[ix+2]+1) & 0xFF;
    m[0xDB38] = 0; m[0xDB39] = shift;
    var e = m[ix+7], d = m[ix+8];
    var iy = (0xA0F4+(((d+1) << 3) & 0xFF)) & 0xFFFF;
    var stride = (e << 3) & 0xFF;
    m[0xDB36] = stride; m[0xDB37] = 0;
    var bx = 0xA0F4;
    for (var col = e; col > 0; col = (col-1) & 0xFF) {
      var src = hl;
      for (var row = d; row > 0; row = (row-1) & 0xFF) {
        var p = src;
        for (var line = 0; line < 8; line++) {
          var a = m[p & 0xFFFF], c = 0;
          for (var s = shift || 256; s > 0; s--) {
            c = ((c << 2) | (a >> 6)) & 0xFF;
            a = (a << 2) & 0xFF;
          }
          m[iy & 0xFFFF] = a;
          m[bx & 0xFFFF] |= c;
          p++; bx++; iy++;
        }
        src = (src+stride) & 0xFFFF;
      }
      bx += 8; iy += 8;
      hl = (hl+8) & 0xFFFF;
    }
    // printing the buffer
    this.setChars((0x9FEC+((((m[ix+3]+1) << 1) & 0xFF))) & 0xFFFF);
    d = m[ix+8]; e = m[ix+7];
    if (m[ix+2] !== 3) { e = (e+1) & 0xFF; }
    d = (d+1) & 0xFF;
    m[0xDB38] = d;
    if (m[ix+3] === 3) { d = (d-1) & 0xFF; }
    var b = m[ix+1], cc = m[ix];
    var code = 0x20;
    this.drawRows(code, cc, b, d, e);
    this.setChars(chars);
  } // draw

  /** `$D71C`-`$D76E`: the rows of the buffer as glyphs */
  drawRows(a, c, b, d, e) {
    var m = this.m;
    while (true) {
      // $D71C: PUSH AF, DE, BC
      var saved = {a: a, d: d, e: e, b: b, c: c};
      var code = a;
      var left = c >= 0x22;
      if (left) {
        // $D759
        while (true) {
          code = (m[0xDB38]+code) & 0xFF;
          e = (e-1) & 0xFF;
          if (e === 0) {
            return;                        // $D76B → $D747
          }
          c = (c-1) & 0xFF;
          if (c < 0x22) {
            break;                         // JP $D725
          }
        }
      }
      // $D725: CL-SET, then POP BC / PUSH BC — C is the row's own again
      this.clSet(b, c);
      b = saved.b; c = saved.c;
      while (true) {
        this.printChar(code);
        if (c === 2) {
          // $D74C: the rest of the row skipped
          while (true) {
            var z = ((e-1) & 0xFF) === 0;
            if (z) {
              break;
            }
            e = (e-1) & 0xFF;
            code = (m[0xDB38]+code) & 0xFF;
          }
        }
        c = (c-1) & 0xFF;
        code = (m[0xDB38]+code) & 0xFF;
        e = (e-1) & 0xFF;
        if (e === 0) {
          break;
        }
      }
      // $D73F: POP BC, DE, AF
      b = saved.b; c = saved.c; d = saved.d; e = saved.e; a = saved.a;
      b = (b-1) & 0xFF;
      a = (a+1) & 0xFF;
      d = (d-1) & 0xFF;
      if (d === 0) {
        return;
      }
    }
  } // drawRows

  /** `$D778`: the first `count` objects of `$DB46` moved and drawn */
  objects(count) {
    var m = this.m;
    this.rst10(0x11); this.rst10(1);
    for (var k = 0, ix = 0xDB46; k < (count || 256); k++, ix += 0x18) {
      if (m[ix+0x0A] === 0) {
        this.spawn(ix);
        continue;
      }
      this.setChars(this.rd16(ix+0x10));
      this.rst10(0x10); this.rst10(m[ix+9]);
      var frame = (m[ix+6]+m[ix+0x12]) & 0xFF;
      if (frame === m[ix+0x13]) {
        frame = 0x20;
      }
      m[ix+6] = frame;
      var p = this.step(ix);
      m[ix] = p.c; m[ix+1] = p.b; m[ix+2] = p.e; m[ix+3] = p.d;
      this.erase(ix, p);
      if (p.c === 1) {
        m[ix+0x0A] = 0;                    // $D771: gone off the right
        continue;
      }
      this.draw(ix);
      m[ix+0x0D] = m[ix]; m[ix+0x0E] = m[ix+1];
      m[ix+0x0B] = m[ix+2]; m[ix+0x0F] = m[ix+3];
    }
  } // objects

  /** `$D7E7`: a new object from the templates, on a free row, off the left */
  spawn(ix) {
    var m = this.m;
    var a = ((this.rand() & 7)-2) & 0xFF;
    if (a >= 5) {
      a = 4;
    }
    m.copyWithin(ix, 0xD93E+24*a, 0xD93E+24*a+24);
    do {
      a = (this.rand() & 0x0F)+6;
    } while (a >= 0x11);
    a &= 0xFE;
    m[ix+1] = a; m[ix+0x0E] = a;
    // LD BC,($DD98): B is ($DD99)
    for (var k = 0, iy = 0xDB46; k < (m[0xDD99] || 256); k++, iy += 0x18) {
      if (m[iy+0x0A] !== 0 && m[iy+1] === a && m[iy] >= 0x0F) {
        return;                              // $D867: the row is taken
      }
    }
    m[ix+0x0A] = 1;
    var c = (0x22+m[ix+7]) & 0xFF;
    m[ix] = c; m[ix+0x0D] = c;
    m[ix+2] = 1; m[ix+0x0B] = 1;
  } // spawn

  /** `$D4CC`: the diver ($DC0E) — moved by +4/+5 inside his limits, drawn */
  diver() {
    var m = this.m, ix = 0xDC0E;
    this.rst10(0x11); this.rst10(1);
    if (m[ix+5] !== 0) {
      m[ix+4] = 0;
    }
    var p = this.step(ix);
    if (p.c !== 0x19 && p.c !== 0x0D && p.b !== 0x11 && p.b !== 0x05) {
      m[ix] = p.c; m[ix+1] = p.b; m[ix+2] = p.e; m[ix+3] = p.d;
      this.erase(ix, p);
      m[ix+2] = p.e; m[ix+3] = p.d;
      this.setChars(0x9EEC);
      this.draw(ix);
      m[ix+0x0D] = m[ix]; m[ix+0x0E] = m[ix+1];
      m[ix+0x0F] = m[ix+3]; m[ix+0x0B] = m[ix+2];
    }
    m[ix+4] = 0;
    m[ix+5] = 0;
  } // diver

  /** `$D260`: five bubbles from the diver, ROM PLOT: INVERSE 1 wipes, 0 draws */
  bubbles() {
    var m = this.m;
    for (var k = 0, ix = 0xDD2A; k < 5; k++, ix += 0x0B) {
      if (m[ix+0x0A] !== 0) {
        this.rst10(0x14); this.rst10(1);
        this.rom.plotSub(m[ix+1], m[ix]);
        this.rst10(0x14); this.rst10(0);
        var c = (m[ix]+3) & 0xFF;
        var a = m[ix+5];
        m[ix+5] = (a+1) & 0xFF;
        var b = (a+m[ix+1]) & 0xFF;
        if (b >= 0x70) {
          m[ix+0x0A] = 0;
          continue;
        }
        m[ix] = c; m[ix+1] = b;
        this.rom.plotSub(b, c);
        continue;
      }
      // $D2B1: a new one, now and then, while he has air
      if (this.rand() < 3 || m[0xD33E] === 0) {
        continue;
      }
      var x = ((((0x21-m[0xDC0E]) & 0xFF) << 3)+6) & 0xFF;
      m[ix] = x;
      var y = (((m[0xDC0F]-2) & 0xFF) << 3) & 0xFF;
      if (y >= 0x70) {
        continue;
      }
      m[ix+1] = y;
      m[ix+0x0A] = 1;
      m[ix+5] = 1;
      this.rom.plotSub(y, x);
    }
  } // bubbles

  /**
   * `$CF7E`: the diver touching an object — ROM BEEPER (`$03B5`, DE 100, HL
   * 100), then a goldfish (+8 = 1) is caught and wiped out, anything bigger
   * takes the catch to 0 with another BEEPER (`$D047`, DE 50, HL 200).
   */
  catches() {
    var m = this.m;
    for (var k = 0, ix = 0xDB46; k < (m[0xDD98] || 256); k++, ix += 0x18) {
      if (m[ix+0x0A] === 0) {
        continue;
      }
      var a = ((m[0xDC0F]-1+m[ix+8]-m[ix+1]) & 0xFF);
      if (a >= ((m[ix+8]+1) & 0xFF)) {
        continue;
      }
      // $CFF6
      a = (m[ix]-m[ix+7]+1-m[0xDC0E]) & 0xFF;
      if (a >= 2) {
        continue;
      }
      this.events.push({id: 'beeper', de: 100, hl: 100});
      if (m[ix+8] !== 1) {
        m[0xDB42] = 0;                       // $D047
        this.events.push({id: 'beeper', de: 50, hl: 200});
        continue;
      }
      // $D01A: caught
      m[0xDB42] = (m[0xDB42]+1) & 0xFF;
      var e = m[ix+7];
      if (m[ix+2] !== 3) {
        e = (e+1) & 0xFF;
      }
      this.setChars(0x9F6C);
      this.block(0x20, m[ix], m[ix+1], m[ix+8], e);
      m[ix+0x0A] = 0;
    }
  } // catches

} // GoldfishLogic

if (typeof self !== 'undefined') { self.GoldfishLogic = GoldfishLogic; }
if (typeof module !== 'undefined' && module.exports) { module.exports = GoldfishLogic; }
