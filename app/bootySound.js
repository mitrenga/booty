// begin code

/**
 * The sound of the original, edge by edge in T-states, out of
 * data/global.json#sounds (tools/mksounds.py).
 *
 * ★ Booty has no sound chip: every sound is bit 4 of port $FE switched by
 * the CPU in delay loops. All of it plays in the IM 2 handler `$FE69`
 * (sources/docs/disasm_notes.md §2) and in three calls of ROM `BEEPER` from
 * the main loop. This is the handler and the routines it calls, with the
 * T-states of every instruction, so the edges come out where the machine
 * makes them — tools/matchsound.mjs checks every path against the original
 * run in a Z80 simulator, edge for edge, and the tune on the title screen
 * interrupt for interrupt.
 *
 * - `$FE69`: `$FE88` + 1, then the slots in a fixed order — `$F888`
 *   (`$FFFB` and `$FFFC`: death), `$F80D` (`$FFFF`: a creature), `$F855`
 *   (`$FFFD`: explosion and splinters), `$F863` (`$FFFE`: one-shots 1-6)
 *   — and last the tune `$F6DB`. ★ A slot that plays **leaves the whole
 *   handler** (`POP AF`, `POP AF`, …, `RET`), so the ones behind it and the
 *   tune wait; `$FFFF` and `$FFFD` leave it on every interrupt, playing or
 *   not, so the tune is silent while a creature or an explosion is on.
 * - the tune: every `mask + 1`-th handler one entry of `$FA00` — `DE`
 *   half-wave pairs of `$F648` with the delay `BC` —, `$FF` = back to the
 *   start. A note takes longer than a frame, so the interrupts it overruns
 *   are lost (the ULA holds INT for 32 T) and that is the tune's rhythm.
 * - the routines: `$F648` a steady tone, `$F66C` falling (BC + 1 each
 *   wave), `$F6B5` rising (BC − 1, ends at 0), `$F618` noise — the
 *   half-wave is a byte of the ROM ($0000-$1FFF, pointer `$FE86`) AND B in a
 *   `DJNZ`.
 *
 * Times are T-states of the 3.5 MHz Z80 without contended memory; an edge
 * is the start of its `OUT`. ★ ROM `$0038` (FRAMES and the keyboard) is the
 * measured length without a key pressed.
 *
 * No DOM and no imports: the audio manager plays it, the tools check it.
 */
export class BootySound {

  /** T-states of a frame of the 48K and how long the ULA holds INT */
  static get FRAME() { return 69888; }
  static get INT_ACTIVE() { return 32; }
  /** IM 2 acceptance (19) and `JP $FE69` at the vector $FEFE (10) */
  static get ACCEPT() { return 29; }
  static get CLOCK() { return 3500000; }

  /**
   * @param {Object} data - data/global.json#sounds.
   * @param {function(string): Uint8Array} [decode] - base64 → bytes.
   */
  constructor(data, decode) {
    this.data = data;
    this.tune = data.tune;
    this.mask = data.tuneMask;
    this.slots = data.slots;
    this.rom = data.romInterrupt;
    this.low = (data.border >> 4) & 1;
    this.noise = (decode || BootySound.decodeBase64)(data.noise);
    this.state = this.newState();
  } // constructor

  static decodeBase64(text) {
    var binary = (typeof atob === 'function') ? atob(text) : Buffer.from(text, 'base64').toString('binary');
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } // decodeBase64

  /** the memory the handler keeps: as on the title screen (tracesound.py) */
  newState() {
    return {fe88: 0, tuneOn: this.data.tuneOn, tune: 0, fe86: this.data.noisePointer,
            fffb: 0, fffc: 0, fffd: 0, fffe: 0, ffff: 0};
  } // newState

  // ------------------------------------------------------------ routines
  // Each starts at its CALL (17 T) and returns its length up to and with
  // its RET; the OUTs go into `outs` as [T, bit 4].

  /** `$F8C0` with BC = n, from its CALL: 26 T a loop, the last JR 5 less */
  static delay(n) {
    return 26*(n || 65536)+22;
  } // delay

  /** `$F648`: DE times low, wait BC, high, wait BC */
  r648(t, bc, de, outs) {
    var n = bc || 65536, wave = 52*n+210, count = de || 65536;
    var s = t+17;
    for (var i = 0; i < count; i++, s += wave) {
      outs.push([s+34, this.low]);
      outs.push([s+26*n+119, 1]);
    }
    return 17+count*wave-5+10;
  } // r648

  /** `$F66C`: wait BC, low, wait BC, high; BC + 1 each time */
  r66C(t, bc, de, outs) {
    var count = de || 65536;
    var s = t+17;
    for (var i = 0; i < count; i++) {
      var n = bc || 65536;
      outs.push([s+26*n+67, this.low]);
      outs.push([s+52*n+141, 1]);
      s += 52*n+195;
      bc = (bc+1) & 0xFFFF;
    }
    return s-t-5+10;
  } // r66C

  /** `$F6B5`: as `$F66C`, but BC − 1 and it ends when BC gets to 0 */
  r6B5(t, bc, de, outs) {
    var s = t+17;
    while (true) {
      var n = bc || 65536;
      outs.push([s+26*n+67, this.low]);
      outs.push([s+52*n+141, 1]);
      bc = (bc-1) & 0xFFFF;
      if (bc == 0) {
        return s+52*n+188-t;
      }
      de = (de-1) & 0xFFFF;
      if (de == 0) {
        return s+52*n+213-t;
      }
      s += 52*n+208;
    }
  } // r6B5

  /** `$F63A`: a byte of the ROM ($F8AF, pointer $FE86) AND B, as a DJNZ */
  f63A(b) {
    var p = (this.state.fe86+1) & 0xFFFF;
    var wrap = (p >> 8) == 0x20;
    if (wrap) {
      p = 0;
    }
    this.state.fe86 = p;
    var v = (p < this.noise.length ? this.noise[p] : 0) & b;
    return 28+(wrap ? 100 : 95)+15+(v == 0 ? 12 : 13*v+2)+20;
  } // f63A

  /** `$F618`: noise — wait, low, wait, high, DE times */
  r618(t, b, de, outs) {
    var count = de || 65536;
    var s = t+17;
    for (var i = 0; i < count; i++) {
      var x1 = this.f63A(b);
      outs.push([s+45+x1, this.low]);
      var x2 = this.f63A(b);
      outs.push([s+97+x1+x2, 1]);
      s += 145+x1+x2;
    }
    return s-t-5+10;
  } // r618

  /** a call of data/global.json#sounds's `slots` */
  call(t, c, outs) {
    switch (c.routine) {
      case 'F648': return this.r648(t, c.bc, c.de, outs);
      case 'F66C': return this.r66C(t, c.bc, c.de, outs);
      case 'F6B5': return this.r6B5(t, c.bc, c.de, outs);
    }
    throw new Error('BootySound: no routine '+c.routine);
  } // call

  /**
   * ROM `BEEPER` ($03B5) with DE and HL, as the game calls it from the main
   * loop (with the interrupts off). Stepped instruction by instruction.
   * @param {number} t - Start of the routine.
   * @param {number} de - Count.
   * @param {number} hl - Pitch.
   * @param {Array} outs - The OUTs.
   * @param {number} [bordcr] - BORDCR ($5C48); only bit 4 of what is
   *        written matters here.
   * @returns {number} Its length to its RET.
   */
  romBeeper(t, de, hl, outs, bordcr) {
    var h = (hl >> 8) & 0xFF, l = hl & 0xFF;
    var c0 = (~l) & 3;
    l = l >> 2;
    var a = ((((bordcr || 0) & 0x38) >> 3) | 8) & 0xFF;
    var b = 0, c = c0;
    // DI … OR $08
    var time = t+114;
    var nops = 3;
    while (true) {
      time += 4*nops+8;              // NOP(s), INC B, INC C
      b = (b+1) & 0xFF;
      c = (c+1) & 0xFF;
      while (true) {
        // DEC C / JR NZ
        c = (c-1) & 0xFF;
        if (c != 0) { time += 16; continue; }
        time += 11;
        time += 7;                   // LD C,$3F
        c = 0x3F;
        b = (b-1) & 0xFF;
        time += 4+10;                // DEC B, JP NZ
        if (b != 0) { continue; }
        break;
      }
      a ^= 0x10;
      time += 7;                     // XOR $10
      outs.push([time, (a >> 4) & 1]);
      time += 11+4+4+8;              // OUT, LD B,H, LD C,A, BIT 4,A
      b = h;
      if (a & 0x10) {
        time += 12+4+4+8;            // JR NZ, LD C,L, INC C, JP (IX)
        c = (l+1) & 0xFF;
      } else {
        time += 7+4+4;               // JR NZ, LD A,D, OR E
        if (de == 0) {
          time += 12+4+10;           // JR Z, EI, RET
          return time-t;
        }
        time += 7+4+4+6+8;           // JR Z, LD A,C, LD C,L, DEC DE, JP (IX)
        c = l;
        de = (de-1) & 0xFFFF;
      }
      nops = 3-c0;
    }
  } // romBeeper

  /**
   * ★ `$E361`: drowning — through the door into the sea. Not the handler's:
   * the main loop itself, 21 rows of water from the bottom (`$29` into the
   * attributes), each with 200 steps: OUT high (border + $10), a wait of the
   * game's generator `$E349` × 13 T, OUT low, another. Up to `$E3A3`, where
   * the death begins (BEEPER and the rest is `beeper`).
   * ? The interrupts in between (the handler, the tune) are not in it.
   * @param {number} seed - The state of `$F343` before it.
   * @returns {{outs: Array, length: number, seed: number}}
   */
  drown(seed) {
    var outs = [];
    var state = seed & 0xFFFF;
    // $E349: B += C; C += $CD; B += $AB + carry; A = B — from CALL to RET
    var rand = function() {
      var c = state & 0xFF, b = state >> 8;
      b = (b+c) & 0xFF;
      var sum = c+0xCD;
      c = sum & 0xFF;
      b = (0xAB+b+(sum > 0xFF ? 1 : 0)) & 0xFF;
      state = (b << 8) | c;
      return b;
    };
    var t = 37;                       // LD A,7 … LD B,$15
    for (var row = 0; row < 0x15; row++) {
      t += 1087;                      // PUSH ×2, LD B,$20, the row's $29s, LD B,$C8
      for (var k = 0; k < 0xC8; k++) {
        outs.push([t+41, 1]);
        var v1 = rand() || 256;
        outs.push([t+213+13*v1, this.low]);
        var v2 = rand() || 256;
        t += 385+13*(v1+v2)-(k == 0xC7 ? 5 : 0);
      }
      t += 62-(row == 0x14 ? 5 : 0);  // POP ×2, LD DE, XOR A, SBC HL,DE, DJNZ
    }
    return {outs: outs, length: t, seed: state};
  } // drown

  // ------------------------------------------------------------ the handler

  /** POP AF, POP AF, CALL $0038, POP IY, EI, RET: leave through the ROM */
  leave() {
    return 20+17+this.rom+14+4+10;
  } // leave

  /**
   * One run of the IM 2 handler from `$FE69`, on `this.state`.
   * @param {number} t - Its start (the first instruction at $FE69).
   * @param {Array} outs - The OUTs.
   * @returns {number} Its length, to the RET that ends it.
   */
  handler(t, outs) {
    var st = this.state;
    var time = 70;                   // PUSH IY … LD ($FE88),A
    st.fe88 = (st.fe88+1) & 0xFF;

    // $F888: death
    time += 17+13+7;
    if (st.fffb == 0) {
      time += 11;
    } else {
      time += 5+13+7;
      if (st.fffc == 0) {
        time += 11;
      } else {
        time += 5+22+20;
        var death = this.slots.death;
        for (var d = 0; d < death.length; d++) {
          time += this.call(t+time, death[d], outs);
        }
        st.fffb = 0;
        st.fffc = 0;
        // POP DE, POP BC, POP AF, LD A,0, LD ×2, POP AF, POP IY, EI, RET
        return time+20+10+7+26+10+14+4+10;
      }
    }

    // $F80D: a creature
    time += 17+13+7;
    if (st.ffff == 0) {
      time += 11;
    } else {
      time += 5+7+10+13+7;           // CP 2, JP Z, LD A,($FE88), AND
      var creature = this.slots.creature[st.ffff == 2 ? '2' : '1'];
      if (st.ffff == 2) {
        time += 10;                  // JP NZ
        if ((st.fe88 & creature.mask) == 0) {
          time += 22+20;             // PUSH ×2, LD DE, LD BC
          time += this.call(t+time, creature.calls[0], outs);
          time += 20;                // POP ×2
        }
      } else if (st.fe88 & creature.mask) {
        time += 12;                  // JR NZ
      } else {
        time += 7+33+20;             // JR NZ, PUSH ×3, LD BC, LD DE
        time += this.call(t+time, creature.calls[0], outs);
        time += 30;                  // POP ×3
      }
      return time+this.leave();
    }

    // $F855: explosion, splinters
    time += 17+13+7;
    if (st.fffd == 0) {
      time += 11;
    } else {
      time += 5+7+10;                // CP 1, JP Z
      var noise;
      if (st.fffd == 1) {
        var blast = this.slots.explosion['1'];
        time += 22+13+7+10;          // PUSH ×2, LD A, AND, JP Z
        if ((st.fe88 & blast.mask) == 0) {
          time += 20;                // $F7C2: LD BC, LD DE
          time += this.call(t+time, blast.tone[0], outs);
          return time+20+20+17+this.rom+14+10;
        }
        noise = blast.noise;
        time += 11+10+7;             // PUSH HL, LD DE, LD B
        time += this.r618(t+time, noise.b, noise.de, outs);
        return time+30+20+17+this.rom+14+10;
      }
      noise = this.slots.explosion['2'].noise;
      time += 10+33+7+10;            // JP $F7F6, PUSH ×3, LD B, LD DE
      time += this.r618(t+time, noise.b, noise.de, outs);
      return time+30+this.leave();
    }

    // $F863: one-shots
    time += 17+13+7;
    if (st.fffe == 0) {
      time += 11;
    } else if (st.fffe > 6) {
      time += 5+6*17+10;             // the six CP / JP Z, RET
    } else {
      var shot = this.slots.oneShot[String(st.fffe)];
      time += 5+st.fffe*17+22;       // CP / JP Z up to it, PUSH ×2
      if (shot.repeat) {
        time += 7;                   // LD B,n
        for (var r = 0; r < shot.repeat; r++) {
          time += 11+20;             // PUSH BC, LD BC, LD DE
          time += this.call(t+time, shot.calls[0], outs);
          time += 10+(r < shot.repeat-1 ? 13 : 8);   // POP BC, DJNZ
        }
      } else {
        for (var k = 0; k < shot.calls.length; k++) {
          time += 20;                // LD BC, LD DE
          time += this.call(t+time, shot.calls[k], outs);
        }
      }
      st.fffe = 0;
      // POP ×2, POP AF, LD A,0, LD ($FFFE),A, POP AF, POP IY, EI, RET
      return time+20+10+7+13+10+14+4+10;
    }

    // $F6DB: the tune
    time += 17+13+7;
    if (st.tuneOn == 0) {
      time += 12;
    } else {
      time += 7+11+13+4+13+4+10;     // JR Z, PUSH BC … POP BC
      if (st.fe88 & this.mask) {
        time += 12;
      } else {
        time += 7+33+16+7+7+10;      // JR NZ, PUSH ×3, LD HL,(nn), LD A,(HL), CP, JP Z
        if (st.tune >= this.tune.length) {
          time += 10+16+12;          // $FF: LD HL,$FA00, LD ($FFF9),HL, JR
          st.tune = 0;
        } else {
          var note = this.tune[st.tune];
          st.tune++;
          time += 61+16+4+4;         // the four bytes, LD ($FFF9),HL, LD A,E, OR D
          if (note[0] == 0) {
            time += 12;
          } else {
            time += 7;
            time += this.r648(t+time, note[1], note[0], outs);
          }
        }
        time += 30;                  // POP ×3
      }
    }
    return time+this.leave();
  } // handler

  // ------------------------------------------------------------ interrupts

  /**
   * The interrupts from `start` on: each is taken at its frame if the handler
   * before it has ended (or ends while INT is held), otherwise it is lost.
   * @param {number} start - The first handler's start ($FE69).
   * @param {function(number, number): boolean} next - Called before each
   *        handler with its start and index; false stops.
   * @param {Array} outs - The OUTs.
   * @returns {Array<number>} The starts of the handlers run.
   */
  run(start, next, outs) {
    var F = BootySound.FRAME;
    var starts = [];
    var t = start;
    for (var i = 0; next(t, i); i++) {
      starts.push(t);
      var end = t+this.handler(t, outs);
      // the frame of the next INT the handler has not reached the end of
      var k = Math.floor((end-BootySound.INT_ACTIVE)/F)+1;
      if (end >= k*F) {
        // it ends while INT is held: taken right after the RET
        t = end+BootySound.ACCEPT;
      } else {
        t = k*F+BootySound.ACCEPT;
      }
    }
    return starts;
  } // run

  // ------------------------------------------------------------ sounds

  /**
   * The whole tune once round, as it loops: from the handler that plays the
   * first note to the one that plays it again.
   * @returns {{outs: Array, length: number}} T from the loop's start.
   */
  tuneLoop() {
    var st = this.state;
    var saved = Object.assign({}, st);
    // $FE88 + 1 = 0: the first handler plays the first note
    Object.assign(st, {fe88: 0xFF, tune: 0, tuneOn: 1, fffb: 0, fffc: 0, fffd: 0, fffe: 0, ffff: 0});
    var outs = [];
    var length = 0;
    var self = this;
    var wrapped = false;
    this.run(BootySound.ACCEPT, function(t, i) {
      if (i > 0 && wrapped && st.tune == 0 && ((st.fe88+1) & self.mask) == 0) {
        length = t-BootySound.ACCEPT;
        return false;
      }
      if (st.tune >= self.tune.length) {
        wrapped = true;
      }
      return true;
    }, outs);
    Object.assign(st, saved);
    return {outs: outs.map((o) => [o[0]-BootySound.ACCEPT, o[1]]), length: length};
  } // tuneLoop

  /**
   * A continuous slot — the creature ($FFFF) or the explosion ($FFFD) —
   * for `count` handlers from the one that plays, alone (the tune is
   * silent under it).
   * @param {string} slot - 'ffff' or 'fffd'.
   * @param {number} value - Its value, 1 or 2.
   * @param {number} count - How many handlers.
   * @returns {{outs: Array, length: number}}
   */
  continuous(slot, value, count) {
    var st = this.state;
    var saved = Object.assign({}, st);
    Object.assign(st, {fe88: 0xFF, fffb: 0, fffc: 0, fffd: 0, fffe: 0, ffff: 0});
    st[slot] = value;
    var outs = [];
    var length = 0;
    this.run(BootySound.ACCEPT, function(t, i) {
      if (i == count) {
        length = t-BootySound.ACCEPT;
        return false;
      }
      return true;
    }, outs);
    // the noise pointer goes on, as on the machine
    var fe86 = st.fe86;
    Object.assign(st, saved);
    st.fe86 = fe86;
    return {outs: outs.map((o) => [o[0]-BootySound.ACCEPT, o[1]]), length: length};
  } // continuous

  /**
   * One handler that plays a slot once: `$FFFB`+`$FFFC` or `$FFFE` = n.
   * @param {Object} slots - E.g. {fffe: 4} or {fffb: 1, fffc: 1}.
   * @returns {{outs: Array, length: number}}
   */
  once(slots) {
    var st = this.state;
    var saved = Object.assign({}, st);
    Object.assign(st, {fffb: 0, fffc: 0, fffd: 0, fffe: 0, ffff: 0, tuneOn: 0}, slots);
    var outs = [];
    var length = this.handler(0, outs);
    var fe86 = st.fe86;
    Object.assign(st, saved);
    st.fe86 = fe86;
    return {outs: outs, length: length};
  } // once

  /**
   * ROM BEEPER as the game calls it.
   * @returns {{outs: Array, length: number}}
   */
  beeper(de, hl) {
    var outs = [];
    var length = this.romBeeper(0, de, hl, outs);
    return {outs: outs, length: length};
  } // beeper

  /**
   * Edges in T → svision pulse data: the time between two changes of the
   * level, in samples (rounded on the running total, so nothing drifts).
   * The level before the sound is high (bit 4 = 1), where every routine of
   * the game leaves the speaker — that is silence.
   * @param {Array} outs - [T, bit 4].
   * @param {number} sampleRate - Samples a second.
   * @param {number} [loopLength] - T of a loop: the gap to the loop's end
   *        is added, so a repeat goes on seamlessly.
   * @returns {{fragments: Array<number>, pulses: Uint16Array}}
   */
  static pulses(outs, sampleRate, loopLength) {
    var k = sampleRate/BootySound.CLOCK;
    var level = 1;
    var last = 0;
    var lengths = [];
    for (var i = 0; i < outs.length; i++) {
      if (outs[i][1] == level) {
        continue;
      }
      level = outs[i][1];
      var at = Math.round(outs[i][0]*k);
      lengths.push(at-last);
      last = at;
    }
    if (loopLength !== undefined) {
      // back to silence at the end, and an even count, so the next round
      // starts at the same level
      lengths.push(Math.round(loopLength*k)-last);
      if (lengths.length % 2) {
        lengths.push(0);
      }
    }
    var fragments = [], keys = {};
    var pulses = new Uint16Array(lengths.length);
    for (var j = 0; j < lengths.length; j++) {
      var len = lengths[j];
      if (!(len in keys)) {
        keys[len] = fragments.length;
        fragments.push(len);
      }
      pulses[j] = keys[len];
    }
    return {fragments: fragments, pulses: pulses};
  } // pulses

} // BootySound
