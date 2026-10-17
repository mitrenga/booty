// begin code

/**
 * Booty's game logic: one pass of the original's main loop (`$DF13`), and
 * the routines it calls, carried over to JavaScript **over a memory laid out
 * as the original's** — 64 KB, the hold tables at `$ABD6`, the objects at
 * `$F231`, the char map at `$A1C4`, the screen at `$4000`, the ROM's system
 * variables at `$5C00` (sources/docs/physics.md).
 *
 * Why memory and not objects: the game decides where Jim stands **by the
 * pixels on the screen** (`$EC23`: the bottom line of Jim's sprite ANDed
 * with the screen under his feet), the lifts by the screen too (`$E884`),
 * the pirates by the char map (`$F074`). What is drawn is therefore part of
 * the rules, and the only way to have the same rules is to have the same
 * memory. tools/matchphysics.mjs runs this code pass by pass against
 * recordings of the original (tools/tracephysics.py) and compares the
 * memory after every pass — the screen, the game's variables, the buffers,
 * the objects — byte for byte.
 *
 * It is a port, not an emulator: every routine is written out with what it
 * does, at the addresses it does it, and the ROM routines the game calls
 * (CL-SET, RST $10, OUT-NUM, CL-LINE, BORDER) are written out for exactly
 * the use the game makes of them. The routines are named by their address;
 * the author's own names (MRI, MLE, MUP, MDO, PUTSQ) are kept where they are
 * known (sources/docs/source_remnant.md).
 *
 * Inputs a pass takes from outside, and only these: the key ROM KEY-SCAN
 * returns (`E`, `$ED35`) and FRAMES when the timer reads it (`$E133`,
 * `$E11F`). Everything else — the randomness too (`$E349`) — comes out of
 * the memory.
 *
 * A classic script (no import/export): the worker loads it with
 * importScripts(), the tools with svision/tools/classicScript.cjs.
 */
class BootyLogic {

  /**
   * @param {Uint8Array} memory - 65536 bytes: the machine.
   */
  constructor(memory) {
    if (!(memory instanceof Uint8Array) || memory.length !== 65536) {
      throw new Error('BootyLogic needs 64 KB of memory');
    }
    this.m = memory;
    this.input = [];
    this.events = [];
    this.outcome = 'pass';
    // what the remake cannot see in memory: the border and the sounds
    this.borderColour = 0;
    // live only: a change of hold through a door, for the worker to show the
    // way the original redraws (BootyLogic.transitionScreen); null otherwise
    this.transition = null;
    // live only: the water rising before a drowning ($E361), for the worker
    // to show (BootyLogic.drowningScreen); null otherwise
    this.drowning = null;
    // live only: the work the hold's drawing does, counted (the transition)
    this.cost = null;
    // live only: the IM 2 handler's sound slots (gameWorker.js `interrupt`),
    // run before `$E058` clears them — see silence()
    this.interruptHook = null;
  } // constructor

  // ------------------------------------------------------------ memory

  rd16(a) { return this.m[a & 0xFFFF] | (this.m[(a+1) & 0xFFFF] << 8); }
  wr16(a, v) { this.m[a & 0xFFFF] = v & 0xFF; this.m[(a+1) & 0xFFFF] = (v >> 8) & 0xFF; }
  /** a write the way the Z80 does it: the ROM ignores it */
  poke(a, v) { a &= 0xFFFF; if (a >= 0x4000) { this.m[a] = v & 0xFF; } }

  // ------------------------------------------------------------ inputs

  /**
   * One pass of the main loop.
   * @param {Array} input - The pass's inputs in the order they are read:
   *        ['K', e] (KEY-SCAN) and ['F', frames] (the timer's read).
   * @returns {string} 'pass', 'restart' (a life lost, the game goes on),
   *          'gameover' or 'round' (the gold key found).
   */
  pass(input) {
    // live: the worker's own keys and FRAMES, nothing recorded to check
    this.live = !Array.isArray(input);
    this.liveKey = this.live ? input.key : 0xFF;
    this.input = this.live ? [] : input.slice();
    this.events = [];
    this.outcome = 'pass';
    this.transition = null;
    this.drowning = null;
    this.cost = null;
    try {
      this.mainLoopPass();
    } catch (signal) {
      if (!(signal instanceof BootyLogic.Jump)) {
        throw signal;
      }
      this.outcome = signal.outcome;
    }
    if (this.input.length) {
      throw new Error('pass left inputs unread: '+JSON.stringify(this.input));
    }
    return this.outcome;
  } // pass

  /** ROM KEY-SCAN: the key the original saw, from the recording */
  keyScan() {
    if (this.live) {
      return this.liveKey;
    }
    var next = this.input.shift();
    if (!next || next[0] !== 'K') {
      throw new Error('KEY-SCAN read, the recording has '+JSON.stringify(next));
    }
    return next[1];
  } // keyScan

  /** FRAMES as the timer reads it, from the recording */
  readFrames() {
    if (this.live) {
      return this.rd16(0x5C78);
    }
    var next = this.input.shift();
    if (!next || next[0] !== 'F') {
      throw new Error('FRAMES read, the recording has '+JSON.stringify(next));
    }
    this.wr16(0x5C78, next[1]);
    return next[1];
  } // readFrames

  /** a sound slot, a beep, … — for the audio manager (M6) */
  event(id, data) {
    this.events.push(Object.assign({id: id}, data || {}));
  } // event

  // ------------------------------------------------------------ the ROM

  /** CL-ADDR ($0E9B): the address of the first byte of print line 24 − B */
  clAddr(b) {
    var d = (0x18-b) & 0xFF;
    var l = ((d >> 3) | (d << 5)) & 0xE0;
    var h = (d & 0x18) | 0x40;
    return (h << 8) | l;
  } // clAddr

  /** CL-SET ($0DD9) for the upper screen, and PO-STORE */
  clSet(b, c) {
    if (this.cost) {
      this.cost.clSet++;
    }
    var hl = (this.clAddr(b)+((0x21-c) & 0xFF)) & 0xFFFF;
    this.m[0x5C88] = c & 0xFF;
    this.m[0x5C89] = b & 0xFF;
    this.wr16(0x5C84, hl);
    return hl;
  } // clSet

  /**
   * RST $10 on channel S: the control codes the game sends (INK 16 and
   * PAPER 17, each with its colour) and printable characters 32-127.
   */
  rst10(a) {
    if (this.cost) {
      this.cost.rst10++;
    }
    if (this.pending !== undefined && this.pending !== null) {
      var code = this.pending;
      this.pending = null;
      var at = this.m[0x5C8F], mask = this.m[0x5C90];
      if (code === 0x10) {
        this.m[0x5C8F] = (at & 0xF8) | (a & 7);
        this.m[0x5C90] = mask & 0xF8;
      } else if (code === 0x11) {
        this.m[0x5C8F] = (at & 0xC7) | ((a & 7) << 3);
        this.m[0x5C90] = mask & 0xC7;
      } else {
        throw new Error('RST $10: control '+code+' is not used by the game');
      }
      return;
    }
    if (a === 0x10 || a === 0x11) {
      this.pending = a;
      return;
    }
    if (a < 0x20 || a > 0x7F) {
      throw new Error('RST $10: code '+a+' is not used by the game');
    }
    var c = this.m[0x5C88], b = this.m[0x5C89];
    if (c === 1) {
      throw new Error('RST $10: printing past column 31 is not used by the game');
    }
    var hl = this.rd16(0x5C84);
    var glyph = (this.rd16(0x5C36)+8*a) & 0xFFFF;
    for (var line = 0; line < 8; line++) {
      this.poke(hl+256*line, this.m[(glyph+line) & 0xFFFF]);
    }
    // PO-ATTR: the attribute of the cell, ATTR-T through MASK-T
    var attr = 0x5800 | ((hl >> 3) & 0x0300) | (hl & 0xFF);
    var mask = this.m[0x5C90];
    this.poke(attr, (this.m[0x5C8F] & ~mask) | (this.m[attr] & mask));
    this.m[0x5C88] = (c-1) & 0xFF;
    this.wr16(0x5C84, hl+1);
  } // rst10

  /**
   * OUT-NUM-1 ($1A1B): BC in decimal, no leading zeros — as the ROM does it,
   * for line numbers. ★ With bit 7 of B set (32768 and more) it prints just
   * `0` (`BIT 7,B` / `JR NZ,OUT-NUM-4` with A = 0): TREASURE taken below 0
   * by a piece of the 4 extra ones (65535) shows `0` (tools/tracephysics.py
   * `goldextra`). The thousands are counted, not limited: 10000 and more
   * would print a character past `9`, as OUT-CODE adds `0` to the count.
   */
  outNum(bc) {
    bc &= 0xFFFF;
    if (bc & 0x8000) {
      this.rst10(0x30);
      return;
    }
    var hl = bc, e = 0xFF;
    [1000, 100, 10].forEach((step) => {
      // OUT-SP-NO ($192A): how many times the step goes into HL
      var n = 0;
      while (hl >= step) {
        hl -= step;
        n++;
      }
      if (n !== 0) {
        // OUT-CODE ($15EF): from here on zeros are printed (E = '0')
        e = 0x30;
        this.rst10(0x30+n);
      } else if (e !== 0xFF) {
        // OUT-SP-2: a zero after the first digit
        this.rst10(e);
      }
    });
    this.rst10(0x30+hl);
  } // outNum

  /** CL-LINE ($0E44) with B = 24: the whole upper screen to 0 and ATTR-P */
  clLine24() {
    this.m.fill(0, 0x4000, 0x5800);
    this.m.fill(this.m[0x5C8D], 0x5800, 0x5B00);
  } // clLine24

  /** BORDER ($229B) */
  border(a) {
    this.borderColour = a & 7;
    var v = ((a << 3) | (a >> 5)) & 0xFF;
    if (!(v & 0x20)) {
      v ^= 7;
    }
    this.m[0x5C48] = v;
  } // border

  /** BEEPER ($03B5): no trace in memory; a sound for the audio manager */
  beeper(de, hl) {
    this.event('beeper', {de: de, hl: hl});
  } // beeper

  // ------------------------------------------------------------ randomness

  /** $E349: B += C; C += $CD (carry); B += $AB + carry; returns B */
  rand() {
    var c = this.m[0xF343], b = this.m[0xF344];
    b = (b+c) & 0xFF;
    var sum = c+0xCD;
    c = sum & 0xFF;
    b = (0xAB+b+(sum > 0xFF ? 1 : 0)) & 0xFF;
    this.m[0xF343] = c;
    this.m[0xF344] = b;
    return b;
  } // rand

  // ------------------------------------------------------------ the main loop

  /** `$DF13`-`$DF8F`: one pass */
  mainLoopPass() {
    var m = this.m;
    this.rst10(0x11);
    this.rst10(m[0x5BD1]);
    this.creature();          // $E22D
    this.portholes();         // $F1FC
    this.explosion();         // $E47A
    this.splinters();         // $E3E0
    this.pirates();           // $F001
    // $E9D9: a fixed delay
    this.lifts();             // $E821
    if (m[0x5BF0] !== 3) {
      this.jim();             // $EBD8
    }
    this.liftBars();          // $E4F1
    if (m[0xE820] !== 0) {
      m[0xE820]--;
    }
    if (m[0x5BEA] === 0x0C) {
      throw new Error('Kempston ($E30B) is not ported: the remake reads keys');
    }
    this.keyboard();          // $ED35
    this.treasure();          // $E5F4
    this.trapdoors();         // $E581
    // the number of the key carried
    this.rst10(0x10); this.rst10(6);
    this.rst10(0x11); this.rst10(m[0x5BD0]);
    this.clSet(0x01, 0x1B);
    this.wr16(0x5C36, 0x3C00);
    this.printChar(m[0xF241]+0x30);          // $E6DC, IX+$10 of $F231
    if (this.rd16(0x5BF2) === 0) {
      this.goldKey();         // $DFD3
    }
    if (m[0x5BF0] === 3) {
      this.demoPass();        // $DF8A-$DFB8
    }
  } // mainLoopPass

  /**
   * ★ `$DF8A`-`$DFB8`: the end of a pass of the demo (`$5BF0` = 3, started
   * by the title after 1024 interrupts, `$D602`). When the high byte of
   * FRAMES gets to 3 (768 interrupts in the hold): the second time the demo
   * ends (`$ED8F`, back to the title), the first time it goes to a hold
   * drawn by the generator, 2-17 (`$E349` AND $0F + 2, `$EE84`), and FRAMES
   * starts again from 0.
   */
  demoPass() {
    var m = this.m;
    if (((this.readFrames() >> 8) & 0xFF) !== 3) {
      return;
    }
    m[0xF340] = (m[0xF340]+1) & 0xFF;
    if (m[0xF340] === 2) {
      this.demoOver();
    }
    this.goToHold(((this.rand() & 0x0F)+2) & 0xFF);
    m[0x5C78] = 0;
    m[0x5C79] = 0;
  } // demoPass

  /**
   * ★ `$ED8F`: out of the game — the return address is dropped and the RET
   * leaves `$DEA8` (to the title after the demo, `$D60B`); CHARS back to the
   * ROM, the sound slots silenced. The rest of the pass does not run.
   */
  demoOver() {
    this.setChars(0x3C00);
    this.silence();
    this.outcome = 'gameover';
    throw new BootyLogic.Jump('gameover');
  } // demoOver

  // ------------------------------------------------------------ printing

  /** `$E6DC`: the glyph of A at DF-CC, ATTR-T to the attribute by S-POSN */
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
    // (24 − B) × 32 the way $E716-$E726 shifts it: four SLA E with nothing
    // carried into D, then two with — bits 5-7 of 24 − B are lost
    var e0 = (0x18-b) & 0xFF;
    var row = (((e0 >> 3) & 3) << 8) | ((e0 << 5) & 0xFF);
    var addr = (0x5800+((0x21-c) & 0xFF)+row) & 0xFFFF;
    this.poke(addr, m[0x5C8F]);
  } // printChar

  /** `$E762`: ($F330) = (24 − B) × 32 + 33 − C, the place in the maps */
  mapPlace(b, c) {
    var v = ((((0x18-b) & 0xFF) << 5)+((0x21-c) & 0xFF)) & 0xFFFF;
    this.wr16(0xF330, v);
  } // mapPlace

  /** `$E804`: A and ATTR-T into the maps at ($F330), which moves on */
  mapPut(a) {
    var place = this.rd16(0xF330);
    this.wr16(0xF330, place+1);
    this.poke(0xA1C4+place, a);
    this.poke(0xA1C4+place+0x320, this.m[0x5C8F]);
  } // mapPut

  /**
   * `$E72F`: an E × D block of codes from A into the maps (no printing),
   * counting on across the rows; the counter stops at $FF.
   */
  mapBlock(a, e, d, c, b) {
    this.m[0xF336] = (a-1) & 0xFF;
    this.m[0xF335] = e;
    for (;;) {
      this.mapPlace(b, c);
      for (var n = this.m[0xF335]; n > 0; n--) {
        // the counter stops at $FF, but A goes on to 0 and that is written
        var v = (this.m[0xF336]+1) & 0xFF;
        if (v !== 0) {
          this.m[0xF336] = v;
        }
        this.mapPut(v);
      }
      d = (d-1) & 0xFF;
      if (d === 0) {
        return;
      }
      b = (b-1) & 0xFF;
    }
  } // mapBlock

  /**
   * PUTSQ (`$E787`, the author's name): E × D cells from (C, B) put back the
   * way the hold has them — out of the char map with the scenery's CHARS
   * ($8678 for codes with bit 7), a space ($20 through $E6DC) where the map
   * is empty, and the attribute out of the attribute map where it is not 0.
   */
  putsq(c, b, e, d) {
    var m = this.m;
    var saved = this.rd16(0x5C36);
    this.wr16(0x5C36, 0x8378);
    m[0xF335] = e;
    for (;;) {
      this.mapPlace(b, c);
      this.clSet(b, c);
      for (var n = m[0xF335]; n > 0; n--) {
        var place = this.rd16(0xF330);
        this.wr16(0xF330, place+1);
        var code = m[(0xA1C4+place) & 0xFFFF];
        if (code === 0) {
          this.printChar(0x20);
        } else {
          if (code & 0x80) {
            this.wr16(0x5C36, 0x8678);
          }
          this.rst10(code & 0x7F);
          if (code & 0x80) {
            this.wr16(0x5C36, 0x8378);
          }
        }
        var attr = m[(0xA4E4+place) & 0xFFFF];
        if (attr !== 0) {
          this.poke(0x5800+place, attr);
        }
      }
      d = (d-1) & 0xFF;
      if (d === 0) {
        break;
      }
      b = (b-1) & 0xFF;
    }
    this.wr16(0x5C36, saved);
  } // putsq

  /**
   * `$EA93`: an E × D block of characters from A, through `$E6DC`, with the
   * original's clipping (sources/docs/sprites.md).
   */
  block(a, e, d, c, b) {
    var m = this.m;
    m[0xF336] = (a-1) & 0xFF;
    m[0xF335] = e;
    for (;;) {
      if (c < 2) {
        return;
      }
      var ee = m[0xF335];
      var cc = c;
      if (cc >= 0x22) {
        throw new Error('$EA93 left of the screen ($EADE) is never reached by the game');
      }
      this.clSet(b, cc);
      for (;;) {
        m[0xF336] = (m[0xF336]+1) & 0xFF;
        this.printChar(m[0xF336]);
        if (cc === 2) {
          for (;;) {
            m[0xF336] = (m[0xF336]+1) & 0xFF;
            if (ee === 1) {
              break;
            }
            ee--;
          }
        }
        cc = (cc-1) & 0xFF;
        ee--;
        if (ee === 0) {
          break;
        }
      }
      d = (d-1) & 0xFF;
      if (d === 0) {
        return;
      }
      b = (b-1) & 0xFF;
    }
  } // block

  // ------------------------------------------------------------ objects

  /**
   * `$EEA6`: the object's new place out of its motion: C, B, E (fine x),
   * D (fine y) — nothing is stored.
   */
  newPlace(ix) {
    var m = this.m;
    var c = m[ix], b = m[ix+1];
    var e = (m[ix+4]+m[ix+2]) & 0xFF;
    if (e < 0x80) {
      if (e >= 4) {
        c = (c+2) & 0xFF;
        c = (c-1) & 0xFF;
        e &= 3;
      }
    } else {
      c = (c-1) & 0xFF;
      e &= 3;
    }
    var d = (m[ix+5]+m[ix+3]) & 0xFF;
    if (d < 0x80) {
      if (d >= 4) {
        b = (b+1) & 0xFF;
        d &= 3;
      }
    } else {
      b = (b-1) & 0xFF;
      d &= 3;
    }
    return {c: c, b: b, e: e, d: d};
  } // newPlace

  /**
   * `$EED7`: the sprite of the object at IX with the current CHARS
   * (sources/docs/sprites.md).
   */
  sprite(ix) {
    var m = this.m;
    m.copyWithin(0xA0EC, 0xA06C, 0xA0EC);
    this.rst10(0x10);
    this.rst10(m[ix+9]);
    var chars = this.rd16(0x5C36);
    var hl = (chars+8*m[ix+6]) & 0xFFFF;
    var width = m[ix+7], height = m[ix+8];
    m[0xF332] = 0;
    m[0xF333] = (m[ix+2]+1) & 0xFF;
    var shift = 2*m[0xF333];
    this.wr16(0xF33C, (width*8) & 0xFF);
    var column = ((height+1)*8) & 0xFF;
    var px = 0xA0F4, py = 0xA0F4+column;
    for (var col = 0; col < width; col++) {
      var src = (hl+col*8) & 0xFFFF;
      for (var row = 0; row < height; row++) {
        for (var line = 0; line < 8; line++) {
          var value = m[(src+row*width*8+line) & 0xFFFF] << shift;
          m[py] = value & 0xFF;
          m[px] |= (value >> 8) & 0xFF;
          px++;
          py++;
        }
      }
      px += 8;
      py += 8;
    }
    this.wr16(0x5C36, (0x9FEC+2*((m[ix+3]+1) & 0xFF)) & 0xFFFF);
    var e = width, d = height;
    if (m[ix+2] !== 3) {
      e++;
    }
    d++;
    m[0xF33E] = d;
    if (m[ix+3] === 3) {
      d--;
    }
    var b = m[ix+1], c = m[ix];
    var code = 0x20;
    for (var r = 0; r < d; r++, b = (b-1) & 0xFF, code = (code+1) & 0xFF) {
      var cc = c, ee = e, dd = code;
      var skip = false;
      while (cc >= 0x22) {
        dd = (dd+m[0xF33E]) & 0xFF;
        ee--;
        if (ee === 0) {
          skip = true;
          break;
        }
        cc = (cc-1) & 0xFF;
      }
      if (skip) {
        break;
      }
      this.clSet(b, cc);
      for (;;) {
        this.printChar(dd);
        if (cc === 2) {
          // $EFDC: the rest of the row is dropped
          while (ee !== 1) {
            ee--;
            dd = (dd+m[0xF33E]) & 0xFF;
          }
        }
        cc = (cc-1) & 0xFF;
        dd = (dd+m[0xF33E]) & 0xFF;
        ee--;
        if (ee === 0) {
          break;
        }
      }
    }
    this.wr16(0x5C36, chars);
  } // sprite

  /** `$E9E2`: puts back what the object at IX has just left behind */
  eraseTrail(ix, c, b, e, d) {
    var m = this.m;
    var dx = (c-m[ix+0x0D]) & 0xFF;
    if (dx !== 0) {
      if (dx === 0xFF) {
        this.mri(ix);
      } else {
        this.mle(ix);
      }
    } else if (e !== m[ix+0x0B] && e === 3) {
      this.mle(ix);
    }
    var dy = (b-m[ix+0x0E]) & 0xFF;
    if (dy !== 0) {
      if (dy === 0xFF) {
        this.mdo(ix);
      } else {
        this.mup(ix);
      }
    } else if (d !== m[ix+0x0F] && d === 3) {
      this.mup(ix);
    }
  } // eraseTrail

  /** MRI (`$EA1D`): the column the object left on the left */
  mri(ix) {
    var m = this.m;
    var dd = m[ix+8];
    if (m[ix+0x0F] !== 3) {
      dd++;
    }
    this.putsq(m[ix+0x0D], m[ix+0x0E], 1, dd);
  } // mri

  /** MLE (`$EA38`): the column the object left on the right */
  mle(ix) {
    var m = this.m;
    var dd = m[ix+8];
    if (m[ix+3] !== 3) {
      dd++;
    }
    this.putsq((m[ix+0x0D]-m[ix+7]) & 0xFF, m[ix+0x0E], 1, dd);
  } // mle

  /** MUP (`$EA58`): the row the object left below */
  mup(ix) {
    var m = this.m;
    var ee = m[ix+7];
    if (m[ix+2] !== 3) {
      ee++;
    }
    this.putsq(m[ix+0x0D], (m[ix+0x0E]-m[ix+8]) & 0xFF, ee, 1);
  } // mup

  /** MDO (`$EA78`): the row the object left above */
  mdo(ix) {
    var m = this.m;
    var ee = m[ix+7];
    if (m[ix+0x0B] !== 3) {
      ee++;
    }
    this.putsq(m[ix+0x0D], m[ix+0x0E], ee, 1);
  } // mdo

  /** remembers where the object is drawn: +13, +14, +11, +15 */
  remember(ix) {
    var m = this.m;
    m[ix+0x0D] = m[ix];
    m[ix+0x0E] = m[ix+1];
    m[ix+0x0B] = m[ix+2];
    m[ix+0x0F] = m[ix+3];
  } // remember

  // ------------------------------------------------------------ helpers

  ink(n) { this.rst10(0x10); this.rst10(n); }
  paper(n) { this.rst10(0x11); this.rst10(n); }
  setChars(v) { this.wr16(0x5C36, v); }
  /** signed byte */
  sb(v) { return v & 0x80 ? v-256 : v; }

  /** death from inside a pass (`$E3A3` / `$E3A4`) */
  die() {
    this.death();
    throw new BootyLogic.Jump(this.outcome);
  } // die

  // ------------------------------------------------------------ the creature

  /** `$E22D`: the creature of the timer at $F31C (? rat, ? parrot) */
  creature() {
    var m = this.m, ix = 0xF31C;
    if (m[ix] === 0) {
      this.timer();
      return;
    }
    this.setChars(0x934C);
    var p = this.newPlace(ix);
    m[ix] = p.c; m[ix+1] = p.b; m[ix+2] = p.e; m[ix+3] = p.d;
    if (p.e === 3) {
      if (m[ix+4] !== 0xFF) {
        var a = (p.c-m[ix+7]) & 0xFF;
        if (a >= 2 && a < 0x22) {
          this.putsq(a, p.b, 1, m[ix+8]);
        }
      } else {
        var c1 = (p.c+1) & 0xFF;
        if (c1 < 0x22 && c1 >= 2) {
          this.putsq(c1, p.b, 1, m[ix+8]);
        }
      }
    }
    if (m[ix] === 0x26 || m[ix] === 0x01) {
      m[ix] = 0;
      this.m[0xFFFF] = 0;
      return;
    }
    var f = m[ix+6];
    if (f >= 0x25) {
      f = (f+8) & 0xFF;
      if (f >= 0x47) {
        f = (f-0x20) & 0xFF;
      }
    }
    m[ix+6] = f;
    this.sprite(ix);
    this.remember(ix);
    var c = (m[ix+8]+3) & 0xFF;
    var b = m[ix+1];
    var v = (m[0xF232]-1+m[ix+8]-b) & 0xFF;
    if (v >= c) {
      return;
    }
    var bb = (((m[ix+7]+2) << 2)) & 0xFF;
    var cc = ((m[ix] << 2)+m[ix+2]) & 0xFF;
    v = (((m[0xF231]+m[ix+7]) << 2)+m[0xF233]-1-cc) & 0xFF;
    if (v >= bb) {
      return;
    }
    this.m[0xFFFE] = 1;
    this.die();
  } // creature

  /** `$E12A`: every 1400 frames (850 with booty ≥ 100) a creature on a deck */
  timer() {
    var m = this.m;
    var booty = this.rd16(0x5BF4) & 0xFF;
    var frames = this.readFrames();
    if (booty >= 0x64) {
      if (frames < 0x352) {
        return;
      }
    } else if (frames < 0x579) {
      // $E136: SBC HL,DE with the carry of CP $64 still set
      return;
    }
    this.wr16(0x5C78, 0);
    var floor = 0xF317+(this.rand() & 3);
    var b = m[floor+1];
    for (var ix = this.rd16(0x5BDA); m[ix] !== 0xFF; ix += 6) {
      if (m[ix+1] === b && m[ix+5] !== 0) {
        m[0xF31C] = 0;
        return;
      }
    }
    ix = 0xF31C;
    if (this.rand() & 0x08) {
      m[ix] = 2; m[ix+2] = 1; m[ix+4] = 1; m[ix+5] = 0; m[ix+0x0B] = 1; m[ix+0x0D] = 2;
    } else {
      m[ix] = 0x25; m[ix+2] = 0; m[ix+4] = 0xFF; m[ix+5] = 0; m[ix+0x0B] = 0; m[ix+0x0D] = 0x24;
    }
    if (this.rand() & 0x20) {
      var line = this.clSet(m[floor], 0x21);
      for (var k = 0; k < 0x20; k++) {
        if (m[(line+k) & 0xFFFF] !== 0xFF) {
          m[0xF31C] = 0;
          return;
        }
      }
      var a = (m[floor]+1) & 0xFF;
      m[ix+1] = a; m[ix+0x0E] = a;
      m[ix+3] = 3; m[ix+0x0F] = 3;
      m[ix+6] = 0x20; m[ix+9] = 3; m[ix+7] = 4; m[ix+8] = 1;
      m[0xFFFF] = 1;
      if (m[ix+4] !== 1) {
        m[ix+6] = 0x24;
      }
    } else {
      var a2 = (m[floor]+3) & 0xFF;
      m[ix+1] = a2; m[ix+0x0E] = a2;
      m[ix+3] = 3;
      m[ix+6] = 0x28; m[ix+9] = 6; m[ix+7] = 2; m[ix+8] = 2;
      m[0xFFFF] = 2;
      if (m[ix+4] !== 0xFF) {
        m[ix+6] = 0x2C;
      }
    }
  } // timer

  // ------------------------------------------------------------ portholes, explosion

  /** `$F1FC`: PHDAT, every fourth pass the next frame (? portholes) */
  portholes() {
    var m = this.m;
    this.setChars(0x914C);
    this.ink(5);
    m[0xF259] = (m[0xF259]+1) & 3;
    if (m[0xF259] !== 0) {
      return;
    }
    for (var hl = this.rd16(0x5BDC); ; ) {
      var c = m[hl], b = m[hl+1];
      hl += 2;
      if (c === 0xFF) {
        return;
      }
      var a = (m[hl]+4) & 0xFF;
      if (a === 0x40) {
        a = 0x20;
      }
      m[hl] = a;
      hl++;
      this.block(a, 2, 2, c, b);
    }
  } // portholes

  /** `$E47A`: the explosion of booby-trapped treasure */
  explosion() {
    var m = this.m;
    if (m[0xE479] === 0) {
      return;
    }
    m[0xF341] = (m[0xF341]+1) & 1;
    if (m[0xF341] !== 0) {
      return;
    }
    this.setChars(0x924C);
    this.ink(6);
    var a = (m[0xE475]+4) & 0xFF;
    var c = m[0xE46F], b = m[0xE470];
    if (a !== 0x40) {
      m[0xE475] = a;
      this.block(a, 2, 2, c, b);
      return;
    }
    this.putsq(c, b, 2, 2);
    m[0xFFFD] = 0;
    m[0xE479] = 0;
    if (m[0xF2DB] !== 0) {
      return;
    }
    m.copyWithin(0xF2DB, 0xF2F9, 0xF2F9+0x1E);
    b = (b-1) & 0xFF;
    for (var k = 0, ix = 0xF2DB; k < 5; k++, ix += 6) {
      m[ix] = c;
      m[ix+1] = b;
    }
    m[0xFFFD] = 2;
  } // explosion

  /** `$E3E0`: the five splinters of an explosion */
  splinters() {
    var m = this.m;
    if (m[0xF2DB] === 0) {
      return;
    }
    this.setChars(0xF15B);
    this.ink(7);
    for (var k = 0, ix = 0xF2DB; k < 5; k++, ix += 6) {
      var b = m[ix+1], c = m[ix];
      if (c < 0x22 && c >= 2) {
        this.putsq(c, b, 1, 1);
      }
      b = (b+m[ix+3]) & 0xFF;
      c = (c+m[ix+2]) & 0xFF;
      m[ix+5] = (m[ix+5]+1) & 0xFF;
      if (m[ix+5] === 4) {
        m[ix] = 0;
        m[0xFFFD] = 0;
        continue;
      }
      if (c >= 0x22 || c < 2) {
        continue;
      }
      m[ix] = c;
      m[ix+1] = b;
      this.block(0x20, 1, 1, c, b);
      if (((m[0xF232]-m[ix+1]) & 0xFF) >= 2) {
        continue;
      }
      if (((m[0xF231]-m[ix]) & 0xFF) >= 2) {
        continue;
      }
      m[0xFFFE] = 3;
      this.die();
    }
  } // splinters

  // ------------------------------------------------------------ pirates

  /** `$F1AF`: a closed numbered door at (C, B + 2)? its number, else $FF */
  doorAt(c, b) {
    var m = this.m;
    for (var ix = this.rd16(0x5BDA); m[ix] !== 0xFF; ix += 6) {
      if (c === m[ix] && ((m[ix+1]-2) & 0xFF) === b) {
        if (m[ix+5] === 0) {
          return {a: 0xFF};
        }
        return {a: m[ix+4], record: ix};
      }
    }
    return {a: 0xFF};
  } // doorAt

  /** `$F001`: the pirates (OPST), every other pass */
  pirates() {
    var m = this.m;
    if (m[0xF334] === 0) {
      return;
    }
    this.setChars(0x8E28);
    for (var ix = this.rd16(0x5BDE); m[ix] !== 0xFF; ix += 16) {
      this.ink(m[ix+9]);
      var f = (m[ix+6]+6) & 0xFF;
      m[ix+6] = f;
      if (f === 0x4A) {
        m[ix+6] = 0x20;
      }
      if (f === 0x80) {
        m[ix+6] = 0x50;
      }
      var p = this.newPlace(ix);
      var turn = false;
      if (p.c === 0x22) {
        m[ix+4] = 0xFF; m[ix+6] = 0x20;
        turn = true;
      } else if (p.c === 3) {
        m[ix+4] = 1; m[ix+6] = 0x50;
        turn = true;
      } else {
        var cc = m[ix+4] === 0xFF ? (p.c-2) & 0xFF : p.c;
        var blocked = this.doorAt(cc, p.b).a !== 0xFF;
        if (!blocked) {
          var c2 = m[ix+4] === 0xFF ? (p.c-2) & 0xFF : p.c;
          var b2 = (p.b-3) & 0xFF;
          this.mapPlace(b2, c2);
          blocked = m[(0xA1C4+this.rd16(0xF330)) & 0xFFFF] < 0x21;
        }
        if (blocked) {
          if (m[ix+4] === 0xFF) {
            m[ix+4] = 1; m[ix+6] = 0x50;
          } else {
            m[ix+4] = 0xFF; m[ix+6] = 0x20;
          }
          turn = true;
        } else {
          m[ix] = p.c; m[ix+1] = p.b; m[ix+2] = p.e; m[ix+3] = p.d;
          this.eraseTrail(ix, p.c, p.b, p.e, p.d);
        }
      }
      this.sprite(ix);
      this.remember(ix);
      var c = ((((m[ix]-1) & 0xFF) << 2)+m[ix+2]) & 0xFF;
      var a = ((((m[0xF231]-1) & 0xFF) << 2)+m[0xF233]+7-c) & 0xFF;
      if (a >= 0x10) {
        continue;
      }
      a = (m[0xF232]+2-m[ix+1]) & 0xFF;
      if (a >= 6) {
        continue;
      }
      m[0xFFFE] = 2;
      this.die();
    }
  } // pirates

  // ------------------------------------------------------------ lifts

  /** `$E821`: LIDAT, every other pass; they carry Jim (? lifts) */
  lifts() {
    var m = this.m;
    m[0xF334] = (m[0xF334]+1) & 1;
    if (m[0xF334] !== 1) {
      return;
    }
    this.setChars(0xF17B);
    for (var ix = this.rd16(0x5BE4); m[ix] !== 0xFF; ix += 16) {
      var touching = false;
      if (m[ix+4] === 0) {
        touching = this.liftVertical(ix);
      } else if (m[0xF240] === 3 && ((m[0xF23F]-3) & 0xFF) === m[ix+1]) {
        var hl = this.clSet(m[ix+1], m[ix]);
        var de = this.clSet((m[ix+1]+1) & 0xFF, m[ix]);
        de = (de+0x700) & 0xFFFF;
        var n = m[ix+7];
        if (m[ix+2] < 2) {
          n = (n+1) & 0xFF;
        }
        touching = this.overlap(de, hl, n);
      }
      if (touching) {
        m[0xE820] = 2;
        if (m[ix+4] !== 0) {
          m[0xF235] = (m[0xF235]+(m[ix+4] === 0xFF ? -1 : 1)) & 0xFF;
        }
        if (m[ix+5] !== 0) {
          m[0xF236] = (m[0xF236]+(m[ix+5] === 0xFF ? -1 : 1)) & 0xFF;
        }
      }
      var p = this.newPlace(ix);
      if (m[ix+4] === 0) {
        if (m[ix+5] === 0xFF) {
          if (m[ix+0x0C] === p.b && m[ix+0x0D] === p.d) { m[ix+5] = 1; }
        } else if (m[ix+0x0A] === p.b && m[ix+0x0B] === p.d) {
          m[ix+5] = 0xFF;
        }
      } else if (m[ix+4] === 0xFF) {
        if (m[ix+0x0C] === p.c && m[ix+0x0D] === p.e) { m[ix+4] = 1; }
      } else if (m[ix+0x0A] === p.c && m[ix+0x0B] === p.e) {
        m[ix+4] = 0xFF;
      }
      m[ix] = p.c; m[ix+1] = p.b; m[ix+2] = p.e; m[ix+3] = p.d;
      this.sprite(ix);
    }
  } // lifts

  /** `$E884` and `$E98F`: any pixel of the lift under any of Jim's? */
  overlap(de, hl, n) {
    for (var k = 0; k < (n || 256); k++) {
      if (this.m[(de+k) & 0xFFFF] & this.m[(hl+k) & 0xFFFF]) {
        return true;
      }
    }
    return false;
  } // overlap

  /** `$E946`: a lift that goes up and down */
  liftVertical(ix) {
    var m = this.m;
    if ((((m[0xF240]+1) & 3)) !== m[ix+3]) {
      return false;
    }
    var a = m[ix+3] === 0 ? m[0xF23F] : (m[0xF23F]-1) & 0xFF;
    a = (a-2) & 0xFF;
    if (a !== m[ix+1]) {
      return false;
    }
    var c = m[ix], b = m[ix+1], hl, de, base;
    switch (m[ix+3]) {
      case 3:
        base = this.clSet(b, c);
        de = (base+0x100) & 0xFFFF; hl = (base+0x200) & 0xFFFF;
        break;
      case 2:
        base = this.clSet(b, c);
        de = (base+0x300) & 0xFFFF; hl = (base+0x400) & 0xFFFF;
        break;
      case 1:
        base = this.clSet(b, c);
        de = (base+0x500) & 0xFFFF; hl = (base+0x600) & 0xFFFF;
        break;
      default:
        de = (this.clSet(b, c)+0x700) & 0xFFFF;
        hl = this.clSet((b-1) & 0xFF, c);
        break;
    }
    return this.overlap(de, hl, m[ix+7]);
  } // liftVertical

  /** `$E4F1`: the solid bars of the lifts that go up and down */
  liftBars() {
    var m = this.m;
    var fill = (lines) => {
      for (var l = 0; l < lines; l++) {
        var hl = this.rd16(0x5C84);
        this.wr16(0x5C84, hl+0x100);
        for (var k = 0, n = this.m[ix+7] || 256; k < n; k++) {
          this.poke(hl+k, 0xFF);
        }
      }
    };
    for (var ix = this.rd16(0x5BE4); m[ix] !== 0xFF; ix += 16) {
      if (m[ix+5] === 0) {
        continue;
      }
      var c = m[ix], b = m[ix+1];
      switch (m[ix+3]) {
        case 3:
          this.clSet(b, c);
          this.wr16(0x5C84, this.rd16(0x5C84)+0x200);
          fill(4);
          break;
        case 2:
          this.clSet(b, c);
          this.wr16(0x5C84, this.rd16(0x5C84)+0x400);
          fill(4);
          break;
        case 1:
          this.clSet(b, c);
          this.wr16(0x5C84, this.rd16(0x5C84)+0x600);
          fill(2);
          this.clSet((b-1) & 0xFF, c);
          fill(2);
          break;
        default:
          this.clSet((b-1) & 0xFF, c);
          fill(4);
          break;
      }
    }
  } // liftBars

  // ------------------------------------------------------------ Jim

  /** `$EBD8`: Jim — gravity, the move, doors, the sprite, keys */
  jim() {
    var m = this.m, ix = 0xF231;
    this.ink(5);
    m[0xF32F] = 0;
    var falls = false;
    if (m[0xE820] === 0 && m[ix+0x11] !== 3 && m[ix+5] === 0) {
      falls = true;
      if (m[ix+3] === 3) {
        var b = m[ix+1];
        if (b === 0x1A || b === 0x15 || b === 0x10 || b === 0x0B || b === 0x06) {
          var hl = this.clSet((b-3) & 0xFF, m[ix]);
          if ((m[0xF32C] & m[hl]) || (m[0xF32D] & m[(hl+1) & 0xFFFF]) ||
              (m[0xF32E] & m[(hl+2) & 0xFFFF])) {
            falls = false;
          }
        }
      }
    }
    if (falls) {
      m[ix+5] = (m[ix+5]-1) & 0xFF;
      m[0xF33A] = (m[0xF33A]+1) & 0xFF;
    } else {
      m[0xFFFC] = m[0xF33F];
      if (m[0xF33F] !== 0) {
        this.die();
      }
      m[0xF33A] = 0;
    }
    var p = this.newPlace(ix);
    if (p.c === 0x22 || p.c === 3 || p.b === 0x18) {
      m[ix+4] = 0; m[ix+5] = 0;
      return;
    }
    if (p.b === 4) {
      this.die();
    }
    if (!(p.c === m[ix] && p.b === m[ix+1] && m[ix+3] === p.d)) {
      m[0xF32F] = 1;
      var cc = m[ix+0x11] === 0x13 ? (p.c-2) & 0xFF : p.c;
      var door = this.doorAt(cc, p.b);
      if (door.a !== 0xFF) {
        if (door.a !== m[ix+0x10]) {
          m[ix+4] = 0; m[ix+5] = 0;
          return;
        }
        this.openDoor(door.record);
      }
    }
    m[ix] = p.c; m[ix+1] = p.b; m[ix+2] = p.e; m[ix+3] = p.d;
    this.eraseTrail(ix, p.c, p.b, p.e, p.d);
    m[ix+2] = p.e; m[ix+3] = p.d;
    if (m[0xF33A] >= 8) {
      this.fatalFall();
    }
    this.setChars(0x8978);
    this.sprite(ix);
    m[0xF32C] = m[0xA10B];
    m[0xF32D] = m[0xA12B];
    m[0xF32E] = m[0xA14B];
    m[ix+0x0D] = m[ix];
    m[ix+0x0E] = m[ix+1];
    m[ix+0x0F] = m[ix+3];
    m[ix+0x0B] = m[ix+2];
    if (m[0xF32F] !== 0) {
      var c = m[ix+0x11] === 0x13 ? (m[ix]-2) & 0xFF : m[ix];
      this.pickKey(c, m[ix+1]);
    }
    m[ix+4] = 0; m[ix+5] = 0;
  } // jim

  /** `$ED19`: falling too far — the fall is fatal on landing */
  fatalFall() {
    var m = this.m, ix = 0xF231;
    m[0xF33F] = 1;
    m[ix+0x11] = 2;
    var a = m[ix+6];
    if (a < 0x9E) {
      a = 0x9E;
    } else {
      a = (a+6) & 0xFF;
      if (a === 0xB0) {
        a = 0x9E;
      }
    }
    m[ix+6] = a;
  } // fatalFall

  /** `$EB8D`: the key fits — the numbered door at `record` opens */
  openDoor(record) {
    var m = this.m;
    m[0xFFFE] = 5;
    var c = m[record], b = (m[record+1]-1) & 0xFF;
    m[record+5] = 0;
    this.beeper(0x32, 0xC8);
    var saved = this.rd16(0x5C36);
    this.setChars(0x9F6C);
    this.mapBlock(0, 1, 4, c, b);
    this.block(0x20, 1, 4, c, b);
    this.setChars(saved);
    m[0xF231+0x10] = 0;
  } // openDoor

  /** `$F107`: Jim on a key — he takes it and puts the one he had back */
  pickKey(c, b) {
    var m = this.m;
    var ix;
    for (ix = this.rd16(0x5BDA); ; ix += 6) {
      if (m[ix] === 0xFF) {
        return;
      }
      if ((m[ix+5] & 2) && m[ix+2] === c && m[ix+3] === b) {
        break;
      }
    }
    m[0xFFFE] = 6;
    m[ix+5] = 1;
    var kc = m[ix+2], kb = m[ix+3];
    this.mapBlock(0, 1, 2, kc, kb);
    var saved = this.rd16(0x5C36);
    this.setChars(0x9F6C);
    this.block(0x20, 1, 2, kc, kb);
    this.setChars(saved);
    var number = m[ix+4];
    var jim = 0xF231;
    if (m[jim+0x10] !== 0) {
      var old = m[jim+0x10];
      var kx;
      for (kx = this.rd16(0x5BDA); m[kx] !== 0xFF; kx += 6) {
        if (m[kx+4] === old) {
          break;
        }
      }
      saved = this.rd16(0x5C36);
      this.setChars(0x8378);
      this.ink(m[0x5BCC]);
      m[(kx+5) & 0xFFFF] = 3;
      var oc = m[(kx+2) & 0xFFFF], ob = m[(kx+3) & 0xFFFF];
      this.mapPlace(ob, oc);
      this.clSet(ob, oc);
      var key = (m[(kx+4) & 0xFFFF]+0x41) & 0xFF;
      this.mapPut(key);
      this.rst10(key);
      this.mapPlace((ob-1) & 0xFF, oc);
      this.clSet((ob-1) & 0xFF, oc);
      this.mapPut(0x4B);
      this.rst10(0x4B);
      this.setChars(saved);
    }
    m[jim+0x10] = number;
  } // pickKey

  // ------------------------------------------------------------ keys

  /** `$ED35`: the key ROM KEY-SCAN returns, and what it does */
  keyboard() {
    var m = this.m;
    var e = this.keyScan();
    // ★ the demo: any key ends it ($ED3F-$ED43 → $ED8F)
    if (m[0x5BF0] === 3) {
      if (e !== 0xFF) {
        this.demoOver();
      }
      return;
    }
    if (e === m[0x5BEB]) { this.left(); return; }
    if (e === m[0x5BEC]) { this.right(); return; }
    if (e === m[0x5BED]) { this.up(); return; }
    if (e === m[0x5BEE]) { this.down(); return; }
    if (e === m[0x5BEF]) { this.enter(); return; }
    if (e === 0x10) {
      m[0xFFF8] = m[0xFFF8] === 1 ? 0 : 1;
      return;
    }
    if (e === 0x22) {
      // P: the original stops right here (DI) until any key; the remake's
      // worker pauses instead
      this.event('pause');
    }
  } // keyboard

  /** `$EB05`: walk right */
  right() {
    var m = this.m, ix = 0xF231;
    var state = m[ix+0x11];
    if (state === 2) {
      return;
    }
    if (state === 3) {
      if (m[ix+3] !== 3) {
        return;
      }
      m[0xF32D] = 0xFF;
      if (m[ix+1] !== m[ix+0x12] && m[ix+1] !== m[ix+0x13]) {
        return;
      }
    }
    if (m[ix+0x11] !== 0x13) {
      m[ix+0x11] = 0x13;
      m[ix+6] = 0x1A;
    }
    m[ix+6] = (m[ix+6]+6) & 0xFF;
    if (m[ix+6] === 0x50) {
      m[ix+6] = 0x20;
    }
    m[ix+4] = (m[ix+4]-1) & 0xFF;
  } // right

  /** `$EB49`: walk left */
  left() {
    var m = this.m, ix = 0xF231;
    var state = m[ix+0x11];
    if (state === 2) {
      return;
    }
    if (state === 3) {
      if (m[ix+3] !== 3) {
        return;
      }
      m[0xF32D] = 0xFF;
      if (m[ix+1] !== m[ix+0x12] && m[ix+1] !== m[ix+0x13]) {
        return;
      }
    }
    if (m[ix+0x11] !== 4) {
      m[ix+0x11] = 4;
      m[ix+6] = 0x4A;
    }
    m[ix+6] = (m[ix+6]+6) & 0xFF;
    if (m[ix+6] === 0x80) {
      m[ix+6] = 0x50;
    }
    m[ix+4] = (m[ix+4]+1) & 0xFF;
  } // left

  /** `$EE08`: up a ladder */
  up() {
    var m = this.m, ix = 0xF231;
    if (m[ix+0x11] === 3) {
      if (m[ix+1] === m[ix+0x12] && m[ix+3] === 3) {
        return;
      }
      this.climbUp();
      return;
    }
    var c = m[ix], b = m[ix+1];
    for (var hl = this.rd16(0x5BD8); ; ) {
      var a = m[hl];
      if (a === 0xFF) {
        return;
      }
      hl++;
      if (a !== c) {
        hl++;
        continue;
      }
      var lb = (m[hl]-2) & 0xFF;
      hl++;
      if (lb !== b) {
        continue;
      }
      m[ix+0x13] = lb;
      m[ix+0x12] = (lb+5) & 0xFF;
      if (m[ix+0x11] !== 3) {
        m[ix+6] = 0x98;
        m[ix+0x11] = 3;
      }
      this.climbUp();
      return;
    }
  } // up

  /** `$EE42` */
  climbUp() {
    var m = this.m, ix = 0xF231;
    m[ix+6] = (m[ix+6]-6) & 0xFF;
    if (m[ix+6] === 0x7A) {
      m[ix+6] = 0x92;
    }
    m[ix+5] = 1;
    m[ix+2] = 3;
  } // climbUp

  /** `$ED9A`: down a ladder */
  down() {
    var m = this.m, ix = 0xF231;
    if (m[ix+0x11] === 3) {
      if (m[ix+1] === m[ix+0x13]) {
        return;
      }
      this.climbDown();
      return;
    }
    var c = m[ix], b = m[ix+1];
    for (var hl = this.rd16(0x5BD8); ; ) {
      var a = m[hl];
      if (a === 0xFF) {
        return;
      }
      hl++;
      if (a !== c) {
        hl++;
        continue;
      }
      var lb = (m[hl]-2) & 0xFF;
      m[ix+0x13] = lb;
      m[ix+0x12] = (lb+5) & 0xFF;
      hl++;
      if (((m[ix+0x12]-b) & 0xFF) >= 4) {
        continue;
      }
      if (m[ix+0x11] !== 3) {
        m[ix+6] = 0x7A;
        m[ix+0x11] = 3;
      }
      this.climbDown();
      return;
    }
  } // down

  /** `$EDD5` */
  climbDown() {
    var m = this.m, ix = 0xF231;
    m[ix+6] = (m[ix+6]+6) & 0xFF;
    if (m[ix+6] === 0x98) {
      m[ix+6] = 0x80;
    }
    m[ix+5] = (m[ix+5]-1) & 0xFF;
    m[ix+2] = 3;
  } // climbDown

  /** `$EE5B`: ENTER ROOM — through a big door into another hold */
  enter() {
    var m = this.m;
    var c = m[0xF231], b = m[0xF232];
    for (var ix = this.rd16(0x5BD6); m[ix] !== 0xFF; ix += 4) {
      if (((m[ix]-c) & 0xFF) < 2 && ((m[ix+1]-1) & 0xFF) === b) {
        var to = m[ix+3];
        if (to === 0x15) {
          this.drown();
        }
        this.goToHold(to);
        return;
      }
    }
  } // enter

  /** `$EE84` */
  goToHold(to) {
    var m = this.m;
    m[0x5BD3] = to;
    m[0xF241] = 0;
    m[0xF2DB] = 0;
    m[0xE479] = 0;
    m[0xF31C] = 0;
    m[0xF242] = 1;
    m[0xF237] = 0x98;
    this.startTransition();
    this.drawHoldAndPanel();
    this.silence();
  } // goToHold

  /**
   * Live only: the screen as it is before a hold is drawn anew — through a
   * door (`$EE84`) or after a death (`$DECE`) — so the worker can show the
   * original's wipe from here (BootyLogic.transitionScreen).
   */
  startTransition() {
    if (this.live) {
      this.transition = {
        old: this.m.slice(0x4000, 0x5B00), oldBorder: this.borderColour,
        records: 0, bytes: 0, glyph: 0, clSet: 0, rst10: 0, shown: null, border: 0
      };
    }
  } // startTransition

  // ------------------------------------------------------------ treasure, trapdoors

  /** `$E5F4`: Jim at a piece of treasure */
  treasure() {
    var m = this.m;
    for (var ix = this.rd16(0x5BE0); ; ix += 7) {
      var c = m[ix];
      if (c === 0xFF) {
        return;
      }
      var b = m[ix+1];
      if (m[ix+5] === 0 || ((m[0xF232]-1) & 0xFF) !== b) {
        continue;
      }
      var dx = (m[0xF231]-c) & 0xFF;
      if (dx !== 0 && dx !== 0xFF) {
        continue;
      }
      this.collect(ix, c, b);
      return;
    }
  } // treasure

  /** `$E621` */
  collect(ix, c, b) {
    var m = this.m;
    // $E3C2: booby-trapped?
    if (this.rand() < 0x40 && m[0xE479] === 0) {
      m[0xE475] = 0x20;
      m[0xE46F] = c;
      m[0xE470] = b;
      m[0xE479] = 1;
      m[0xFFFD] = 1;
    }
    m[0xFFFE] = 4;
    this.mapBlock(0, 2, 2, c, b);
    this.clSet(b, c);
    this.setChars(0x9F6C);
    this.block(0x20, 2, 2, c, b);
    m[ix+5] = 0;
    this.ink(6);
    this.paper(m[0x5BD0]);
    this.setChars(0x3C00);
    this.clSet(1, 0x13);
    var booty = (this.rd16(0x5BF4)+1) & 0xFFFF;
    this.wr16(0x5BF4, booty);
    this.outNum(booty);
    this.clSet(1, 5);
    var left = (this.rd16(0x5BF2)-1) & 0xFFFF;
    this.wr16(0x5BF2, left);
    if ((left >> 8) === 0 && (left & 0xFF) === 0x32) {
      m[0x5BFC] = m[0x5BD3];
      m[0x5BFD] = m[ix];
      m[0x5BFE] = (m[ix+1]+1) & 0xFF;
    }
    var low = left & 0xFF;
    if (low !== 0) {
      this.outNum(left);
    }
    this.printChar(0x20);
    if (low !== 0) {
      return;
    }
    m[0x5BFF] = 0x2D;
    this.wr16(0x5BFA, 0x14);
    this.setChars(0x3C00);
    this.goldMessage();
  } // collect

  /** `$E581`: TDDAT, the trapdoors */
  trapdoors() {
    var m = this.m;
    for (var ix = this.rd16(0x5BE6); m[ix] !== 0xFF; ix += 6) {
      var c = m[ix], b = m[ix+1];
      if (m[ix+2] & 0x80) {
        this.setChars(0x9F6C);
        m[ix+5] = (m[ix+5]+1) & 0xFF;
        if (m[ix+4] === m[ix+5]) {
          m[ix+2] &= 0x7F;
          m[ix+5] = 0;
        }
        this.block(0x20, m[ix+2] & 0x7F, 1, c, b);
      } else {
        var a = m[ix+3];
        m[ix+5] = (m[ix+5]+1) & 0xFF;
        if (a === m[ix+5]) {
          m[ix+2] |= 0x80;
          m[ix+5] = 0;
        }
        this.putsq(c, b, m[ix+2] & 0x7F, 1);
      }
    }
  } // trapdoors

  // ------------------------------------------------------------ the gold key

  /** `$DFD3`: no treasure left — the countdown and the gold key */
  goldKey() {
    var m = this.m;
    this.setChars(0x3C00);
    this.ink(7);
    this.paper(m[0x5BD1]);
    var t = (this.rd16(0x5BFA)-1) & 0xFFFF;
    this.wr16(0x5BFA, t);
    if (t === 0) {
      this.wr16(0x5BFA, 0x14);
      m[0x5BFF] = (m[0x5BFF]-1) & 0xFF;
      if (m[0x5BFF] === 0) {
        m[0x5BF1] = 0;
        this.die();
      }
    }
    this.clSet(2, 0x0C);
    this.outNum(m[0x5BFF]);
    this.printChar(0x20);
    if (m[0x5BD3] !== m[0x5BFC]) {
      return;
    }
    var c = m[0x5BFD], b = m[0x5BFE];
    this.setChars(0xDEBB);
    this.ink(6);
    this.block(0x20, 1, 2, c, b);
    if (m[0xF231] !== c || m[0xF232] !== b) {
      return;
    }
    this.beeper(0xC8, 0xC8);
    m[0x5BD3] = 0;
    this.wr16(0x5BF2, 0x7D);
    this.outcome = 'round';
    this.startHold();
    throw new BootyLogic.Jump('round');
  } // goldKey

  /** `$E0F7`: FIND THE GOLD KEY IN    SECONDS! on row 22 */
  goldMessage() {
    var m = this.m;
    this.ink(7);
    this.paper(m[0x5BD1]);
    this.clSet(2, 0x21);
    for (var k = 0; k < 0x20; k++) {
      this.printChar(m[0xE6BC+k]);
    }
  } // goldMessage

  // ------------------------------------------------------------ death, a new start

  /** `$E361`: through the door into the sea — the water rises, Jim drowns */
  drown() {
    var m = this.m;
    m[0xFFFE] = 7;
    // ★ the noise of the rising water is the main loop's own, its waits the
    // generator's numbers: the state before them is all the audio manager
    // needs (bootySound.js `drown`)
    this.event('drown', {seed: this.rd16(0xF343)});
    // live: the water rising is shown as the original shows it — the screen
    // before, and when each row goes under (T from $E361, the waits are the
    // generator's numbers; the same count as bootySound.js `drown`)
    var drowning = this.live
      ? {screen: m.slice(0x4000, 0x5B00), rows: [], length: 0, border: this.borderColour}
      : null;
    var t = 37;
    for (var row = 0, hl = 0x5AA0; row < 0x15; row++, hl -= 0x20) {
      if (drowning) {
        // the 32 attributes of the row go in from T + 29 to T + 1080
        drowning.rows.push({at: hl-0x4000, t: t+29});
      }
      for (var k = 0; k < 0x20; k++) {
        this.poke(hl+k, 0x29);
      }
      t += 1087;
      // two random delays per step (`LD B,A / DJNZ $`): time, and two calls
      // of the generator that the state remembers
      for (var n = 0; n < 0xC8; n++) {
        var v1 = this.rand() || 256;
        var v2 = this.rand() || 256;
        t += 385+13*(v1+v2)-(n == 0xC7 ? 5 : 0);
      }
      t += 62-(row == 0x14 ? 5 : 0);
    }
    if (drowning) {
      drowning.length = t;
      this.drowning = drowning;
    }
    this.die();
  } // drown

  /** `$E3A4`: a life lost — or the game */
  death() {
    var m = this.m;
    m[0xFFFB] = 1;
    this.beeper(0xC8, 0x64);
    m[0x5BF1] = (m[0x5BF1]-1) & 0xFF;
    if (m[0x5BF1] === 0xFF) {
      // $ED8F
      this.setChars(0x3C00);
      this.silence();
      this.outcome = 'gameover';
      return;
    }
    m[0x5BD3] = 1;
    // ★ the hold is drawn anew the way a door draws it: CL-LINE, black, the
    // attributes (? the times are the door's, data/global.json#transition; from a
    // death they are not measured)
    this.startTransition();
    this.startHold();
    this.outcome = 'restart';
  } // death

  /** `$DECE`: a life starts — Jim, the variables, the hold, the panel */
  startHold() {
    var m = this.m;
    m.copyWithin(0xF231, 0xF245, 0xF245+0x14);
    m[0xF33A] = 0;
    m[0xF33F] = 0;
    m[0xE479] = 0;
    m[0xF2DB] = 0;
    m[0xF31C] = 0;
    m[0x5C78] = 0;
    m[0x5C79] = 0;
    m[0xF340] = 0;
    this.drawHoldAndPanel();
    this.setChars(0x3C00);
    this.ink(6);
    this.paper(m[0x5BD0]);
    this.livesAndKey();
    this.silence();
  } // startHold

  /**
   * `$DEA8`: a new game, the way the menu starts it (`$D08A`: `$5BF0` ← 1
   * when the lives are 4, else 2). With 2 the lives and the booty stay as
   * they are (`JP Z,$DEBC`).
   */
  newGame() {
    var m = this.m;
    if (m[0x5BF0] !== 2) {
      m[0x5BF1] = 3;
      this.wr16(0x5BF4, 0);
    }
    m[0x5BD3] = 0;
    this.wr16(0x5BF2, 0x7D);
    this.startHold();
  } // newGame

  /**
   * `$E058`: the sound slots silenced ($A06C's zeros over $FFFB-$FFFF).
   * ★ It comes at the end of drawing a hold, which takes the original many
   * frames: the interrupts in between play what is waiting in the slots — the
   * death's `$FFFE` after the BEEPER, a key picked up at a door. A pass here
   * is done at once, so live the handler gets its turns first
   * (`interruptHook`, gameWorker.js) and only then the slots are cleared.
   */
  silence() {
    if (this.live && this.interruptHook) {
      // as many interrupts as there is something to play: death, then $FFFE
      for (var k = 0; k < 3 && this.interruptHook(); k++) {
      }
    }
    this.m.copyWithin(0xFFFB, 0xA06C, 0xA071);
  } // silence

  // ------------------------------------------------------------ the panel

  /** `$E0A9`: the hold, then the panel */
  drawHoldAndPanel() {
    var m = this.m;
    this.hold();
    this.setChars(0x3C00);
    this.ink(6);
    this.paper(m[0x5BD0]);
    this.clSet(1, 0x21);
    for (var k = 0; k < 0x20; k++) {
      this.printChar(m[0xF2BB+k]);
    }
    this.clSet(1, 0x13);
    this.outNum(this.rd16(0x5BF4));
    this.clSet(1, 5);
    this.outNum(this.rd16(0x5BF2));
    this.livesAndKey();
    if (m[0x5BF2] !== 0) {
      return;
    }
    this.goldMessage();
  } // drawHoldAndPanel

  /** `$E064`: the little Jims for the lives, and the key */
  livesAndKey() {
    var m = this.m;
    this.setChars(0xF15B);
    this.clSet(1, 0x21);
    for (var k = 0; k < m[0x5BF1]; k++) {
      this.printChar(0x21);
    }
    this.setChars(0x3C00);
    this.printChar(0x20);
    this.clSet(1, 0x1D);
    this.setChars(0xF15B);
    this.printChar(0x22);
    this.printChar(0x23);
    this.setChars(0x3C00);
  } // livesAndKey

  // ------------------------------------------------------------ the hold

  /** `$A804`: into the hold ($5BD3) */
  hold() {
    var m = this.m;
    if (m[0x5BD3] === 0) {
      this.buildHolds();
    } else {
      this.saveHold();
    }
    this.selectHold();
    this.drawHold();
  } // hold

  /** `$ABC2`: records of `size` bytes from hl to de up to $FF */
  copyTable(hl, de, size) {
    var m = this.m;
    for (;;) {
      var a = m[hl];
      if (a === 0xFF) {
        m[de] = a;
        return {hl: (hl+1) & 0xFFFF, de: (de+1) & 0xFFFF};
      }
      if (this.transition) {
        // the tables of the holds left and entered, before the wipe
        this.transition.records++;
        this.transition.bytes += size;
      }
      for (var k = 0; k < size; k++) {
        m[de] = m[hl];
        hl = (hl+1) & 0xFFFF;
        de = (de+1) & 0xFFFF;
      }
    }
  } // copyTable

  /** `$AA97`: the tables of all holds into the working area */
  buildHolds() {
    var m = this.m;
    var sizes = [1, 3, 4, 2, 6, 3, 16, 7, 4, 16, 6];
    this.wr16(0xBAA5, 0xBAAB);
    var de = 0xBCCB, hl = 0xABD6;
    for (;;) {
      var ptr = this.rd16(0xBAA5);
      this.wr16(ptr, de);
      this.wr16(0xBAA5, ptr+2);
      if (m[hl] === 0xFF) {
        m[0x5BD3] = 1;
        return;
      }
      for (var t = 0; t < sizes.length; t++) {
        var r = this.copyTable(hl, de, sizes[t]);
        hl = r.hl;
        de = r.de;
      }
    }
  } // buildHolds

  /** `$AAF4`: the hold being left goes back into the working area */
  saveHold() {
    var m = this.m;
    var e = ((0x16-m[0x5BD4]) << 1) & 0xFF;
    var de = (this.rd16((0xBAA9+e) & 0xFFFF)+8) & 0xFFFF;
    var hl = 0xBAD7;
    [3, 4, 2, 6, 3, 16, 7, 4, 16, 6].forEach((size) => {
      var r = this.copyTable(hl, de, size);
      hl = r.hl;
      de = r.de;
    });
  } // saveHold

  /** `$AB44`: the hold ($5BD3) into the buffer at $BAD7 */
  selectHold() {
    var m = this.m;
    m[0x5BD4] = m[0x5BD3];
    var e = ((0x16-m[0x5BD3]) << 1) & 0xFF;
    var hl = this.rd16((0xBAA9+e) & 0xFFFF);
    for (var k = 0; k < 7; k++) {
      m[0x5BCC+k] = m[(hl+k) & 0xFFFF];
    }
    hl = (hl+8) & 0xFFFF;
    var de = 0xBAD7;
    var pointers = [0x5BE8, 0x5BD6, 0x5BD8, 0x5BDA, 0x5BDC, 0x5BDE, 0x5BE0, 0x5BE2, 0x5BE4, 0x5BE6];
    var sizes = [3, 4, 2, 6, 3, 16, 7, 4, 16, 6];
    for (var t = 0; t < sizes.length; t++) {
      this.wr16(pointers[t], de);
      var r = this.copyTable(hl, de, sizes[t]);
      hl = r.hl;
      de = r.de;
    }
  } // selectHold

  /** `$A86E`: ($BAD5) = (24 − B) × 32 + 33 − C */
  holdPlace(b, c) {
    var v = ((((0x18-b) & 0xFF) << 5)+((0x21-c) & 0xFF)) & 0xFFFF;
    this.wr16(0xBAD5, v);
  } // holdPlace

  /** `$A893`: A and ATTR-T into the maps at ($BAD5), which moves on */
  holdPut(a) {
    var place = this.rd16(0xBAD5);
    this.wr16(0xBAD5, place+1);
    this.poke(0xA1C4+place, a);
    this.poke(0xA1C4+place+0x320, this.m[0x5C8F]);
  } // holdPut

  /** `$A817`: the glyph of A at DF-CC, DF-CC on by one (no attribute) */
  holdGlyph(a) {
    if (this.cost) {
      this.cost.glyph++;
    }
    var glyph = (this.rd16(0x5C36)+8*(a & 0xFF)) & 0xFFFF;
    var de = this.rd16(0x5C84);
    this.wr16(0x5C84, de+1);
    for (var line = 0; line < 8; line++) {
      this.poke(de+256*line, this.m[(glyph+line) & 0xFFFF]);
    }
  } // holdGlyph

  /** `$A83F` then `$A8AF`: an E × D block from A, into the maps and printed */
  holdBlock(a, e, d, c, b, printA) {
    var m = this.m;
    m[0xBAA2] = (a-1) & 0xFF;
    m[0xBAA3] = e;
    var bb = b;
    for (var dd = d; ; ) {
      this.holdPlace(bb, c);
      for (var k = m[0xBAA3]; k > 0; k--) {
        m[0xBAA2] = (m[0xBAA2]+1) & 0xFF;
        this.holdPut(m[0xBAA2]);
      }
      dd = (dd-1) & 0xFF;
      if (dd === 0) {
        break;
      }
      bb = (bb-1) & 0xFF;
    }
    var p = printA === undefined ? a : printA;
    m[0xBAA2] = (p-1) & 0xFF;
    m[0xBAA3] = e;
    bb = b;
    for (dd = d; ; ) {
      this.clSet(bb, c);
      for (k = m[0xBAA3]; k > 0; k--) {
        m[0xBAA2] = (m[0xBAA2]+1) & 0xFF;
        this.holdGlyph(m[0xBAA2]);
      }
      dd = (dd-1) & 0xFF;
      if (dd === 0) {
        break;
      }
      bb = (bb-1) & 0xFF;
    }
  } // holdBlock

  /** `$A900`: the hold drawn (sources/docs/holds.md) */
  drawHold() {
    var m = this.m;
    m[0x5C8D] = 0;
    // $A8D8
    this.clLine24();
    // the work from here to the attributes' copy takes the time the screen
    // stays black (data/global.json#transition)
    this.cost = this.transition;
    m.fill(0, 0xA1C4, 0xA1C4+0x320);
    m.fill((m[0x5BD1] << 3) & 0xFF, 0xA4E4, 0xA4E4+0x320);
    m[0x5C8D] = (m[0x5BD1] << 3) & 0xFF;
    this.paper(m[0x5BD1]);
    this.setChars(0x8378);
    this.ink(m[0x5BCF]);
    var hl, c, b;
    for (hl = this.rd16(0x5BE8); ; ) {
      c = m[hl]; b = m[hl+1]; hl += 2;
      if (c === 0xFF) {
        break;
      }
      this.holdPlace(b, c);
      this.clSet(b, c);
      for (var n = m[hl++]; n > 0; n--) {
        this.holdPut(0x21); this.holdGlyph(0x21);
        this.holdPut(0x22); this.holdGlyph(0x22);
      }
    }
    this.ink(m[0x5BD2]);
    for (hl = this.rd16(0x5BD8); m[hl] !== 0xFF; hl += 2) {
      this.holdBlock(0x2F, 2, 5, m[hl], m[hl+1]);
    }
    for (hl = this.rd16(0x5BD6); ; hl += 4) {
      c = m[hl]; b = m[hl+1];
      if (c === 0xFF) {
        break;
      }
      this.ink(m[hl+2]);
      this.holdBlock(0x23, 3, 4, c, b);
    }
    this.ink(m[0x5BCF]);
    var ix;
    for (ix = this.rd16(0x5BDA); m[ix] !== 0xFF; ix += 6) {
      if (m[ix+5] === 0) {
        continue;
      }
      m[ix+5] = 3;
      c = m[ix]; b = m[ix+1];
      this.holdPlace(b, c);
      this.clSet(b, c);
      this.ink(m[0x5BCF]);
      this.holdPut(m[ix+4]+0x38); this.holdGlyph(m[ix+4]+0x38);
      this.ink(m[0x5BCD]);
      this.holdBlock(0x4C, 1, 4, c, (b-1) & 0xFF);
      c = m[ix+2]; b = m[ix+3];
      this.holdPlace(b, c);
      this.clSet(b, c);
      this.ink(m[0x5BCC]);
      this.holdPut(m[ix+4]+0x41); this.holdGlyph(m[ix+4]+0x41);
      this.holdPlace((b-1) & 0xFF, c);
      this.clSet((b-1) & 0xFF, c);
      this.holdPut(0x4B); this.holdGlyph(0x4B);
    }
    for (ix = this.rd16(0x5BE0); m[ix] !== 0xFF; ix += 7) {
      if (m[ix+5] === 0) {
        continue;
      }
      this.ink(m[ix+4]);
      this.holdBlock(m[ix+6], 2, 2, m[ix], m[ix+1]);
    }
    this.setChars(0x8678);
    for (ix = this.rd16(0x5BE2); m[ix] !== 0xFF; ix += 4) {
      this.ink(m[ix+3]);
      var code = m[ix+2] | 0x80;
      this.holdBlock(code, 6, 4, m[ix], m[ix+1], code & 0x7F);
    }
    this.cost = null;
    m.copyWithin(0x5800, 0xA4E4, 0xA4E4+0x300);
    this.border(m[0x5BD0]);
    if (this.transition) {
      // the hold shown, the panel not printed yet
      this.transition.shown = m.slice(0x4000, 0x5B00);
      this.transition.border = this.borderColour;
    }
  } // drawHold

} // BootyLogic

/**
 * The memory a game starts from: 64 KB with the original's data where the
 * original has it (data/global.json#memory, tools/mkmemory.py) and the ROM font at
 * $3D00 (svision's ZXFonts8x8 carries the ROM's 96 glyphs).
 * @param {Object} memoryData - The parsed data/global.json#memory.
 * @param {Uint8Array} romFont - 768 bytes, characters 32-127.
 * @param {Function} decode - base64 → Uint8Array.
 * @returns {Uint8Array} The memory.
 */
BootyLogic.composeMemory = function(memoryData, romFont, decode) {
  var memory = new Uint8Array(65536);
  memory.set(romFont, 0x3D00);
  memoryData.segments.forEach((segment) => {
    memory.set(decode(segment.bytes), segment.address);
  });
  return memory;
};

/**
 * ROM KEY-SCAN ($028E): the key code E for a set of keys held, the way the
 * ROM scans the eight half-rows ($FEFE first) and decides — one key: its
 * code; two, one of them CAPS ($27) or SYMBOL ($18): the other one; two
 * others: the one found first; three or more: the second one found. No key:
 * $FF. A key's code is (47 − half-row) − 8 × (bit + 1): '5' is 4, '8' 19,
 * '7' 11, '6' 3, 'A' 38 — the codes the game keeps at $5BEB.
 * @param {number[]} codes - The codes of the keys held.
 * @returns {number} E.
 */
BootyLogic.keyScan = function(codes) {
  var held = {};
  codes.forEach((code) => { held[code] = true; });
  var d = 0xFF, e = 0xFF;
  for (var row = 0; row < 8; row++) {
    var l = 0x2F-row;
    for (var bit = 0; bit < 5; bit++) {
      var code = l-8*(bit+1);
      if (!held[code]) {
        continue;
      }
      if (d !== 0xFF) {
        return e;          // KEY-3KEYS: a third key, RET NZ with E as it is
      }
      d = e;
      e = code;
    }
  }
  if (d === 0xFF || d === 0x27 || d === 0x18) {
    return e;
  }
  return d;
};

/**
 * ★ What the screen shows `t` T-states into a drowning (`$E361`): the screen
 * before it, with the attribute rows the water has reached set to `$29`,
 * from the bottom (row 21) up.
 * @param {Object} dr - BootyLogic#drowning.
 * @param {number} t - T-states from `$E361`.
 * @returns {{screen: Uint8Array, border: number}}
 */
BootyLogic.drowningScreen = function(dr, t) {
  var screen = dr.screen.slice();
  for (var i = 0; i < dr.rows.length && dr.rows[i].t <= t; i++) {
    screen.fill(0x29, dr.rows[i].at, dr.rows[i].at+0x20);
  }
  return {screen: screen, border: dr.border};
};

/**
 * The times of a change of hold, in T-states from ENTER ROOM (`$EE84`), the
 * way the original takes them without the tune (data/global.json#transition,
 * tools/mktransition.mjs):
 * - `cls`: ROM CL-LINE starts wiping the screen (`$A8DA`), after the
 *   tables of the holds have been copied (`$AAF4`, `$AB44`)
 * - `black`: it is done — pixels and attributes 0, the hold is drawn unseen
 * - `copy`: the hold is drawn; the attributes go from `$A4E4` to `$5800`
 * - `shown`: they are there (and the border), the panel is printed
 * - `end`: the panel is done
 * @param {Object} tr - BootyLogic#transition (the work counted).
 * @param {Object} data - data/global.json#transition.
 * @returns {Object} The times.
 */
BootyLogic.transitionTimes = function(tr, data) {
  var p = data.toCls;
  var cls = Math.round(p.base+p.records*tr.records+p.bytes*tr.bytes);
  var black = cls+data.cls.duration;
  var d = data.draw;
  var copy = black+Math.round(d.base+d.glyph*tr.glyph+d.clSet*tr.clSet+d.rst10*tr.rst10);
  var shown = copy+data.attrCopy;
  return {cls: cls, black: black, copy: copy, shown: shown, end: shown+data.panel};
};

/**
 * What the screen shows `t` T-states after ENTER ROOM. ★ The order is the
 * original's (tools/tracetransition.py): the old screen wiped by ROM
 * CL-LINE one pixel line of a third after another, then its attributes;
 * black while the hold is drawn under attributes 0; the attributes copied
 * top to bottom; the panel. The wipe and the copy are LDIRs, so within a
 * block the bytes go at an even pace. ? The panel appears at once when it
 * is done, the original prints it in about half a frame.
 * @param {Object} tr - BootyLogic#transition.
 * @param {Object} times - BootyLogic.transitionTimes.
 * @param {Object} data - data/global.json#transition.
 * @param {number} t - T-states from ENTER ROOM.
 * @param {Uint8Array} final - The screen at the end of the pass.
 * @returns {Object} {screen: 6912 bytes, border}.
 */
BootyLogic.transitionScreen = function(tr, times, data, t, final) {
  var done = (from, to, length) => {
    if (t <= from) {
      return 0;
    }
    if (t >= to) {
      return length;
    }
    return Math.floor(length*(t-from)/(to-from));
  };
  if (t >= times.end) {
    return {screen: final, border: tr.border};
  }
  if (t >= times.shown) {
    return {screen: tr.shown, border: tr.border};
  }
  var screen;
  if (t >= times.copy) {
    // the pixels of the hold under attributes 0, the copy coming down
    screen = tr.shown.slice();
    var n = done(times.copy, times.shown, 0x300);
    screen.fill(0, 0x1800+n, 0x1B00);
    return {screen: screen, border: tr.oldBorder};
  }
  screen = tr.old.slice();
  data.cls.blocks.forEach((block) => {
    var at = block[0]-0x4000, length = block[1];
    var k = done(times.cls+block[2], times.cls+block[3], length);
    screen.fill(0, at, at+k);
  });
  return {screen: screen, border: tr.oldBorder};
};

/** a jump out of a pass: death, game over, a new round */
BootyLogic.Jump = class {
  constructor(outcome) { this.outcome = outcome; }
};

if (typeof self !== 'undefined') { self.BootyLogic = BootyLogic; }
if (typeof module !== 'undefined' && module.exports) { module.exports = BootyLogic; }
