const { ZXVideoRAM } = await import('./svision/js/platform/canvas2D/zxSpectrum/zxVideoRAM.js?ver='+window.srcVersion);
// begin code

/**
 * Draws a hold the way the original does: `$A900` (sources/docs/holds.md),
 * step for step, out of the tables in data/global.json#holds.
 *
 * ★ What the program does, and so what this does:
 *
 * 1. `$A8D8` clears the 24 lines of the screen (ROM `CL-LINE`), the **char
 *    map** at `$A1C4` (25 rows of 32 codes) to 0 and the **attribute map**
 *    at `$A4E4` (right behind it, +$320) to paper × 8 — paper is the sixth
 *    byte of COLDAT (`$5BD1`)
 * 2. it prints the hold with the ROM's print position (`CL-SET` takes B, C
 *    and sets `DF-CC`; the tables hold exactly those, so column = 33 − C and
 *    row = 24 − B, `$A86E`) and its own glyph routine `$A817`, which copies
 *    eight bytes from CHARS + 8 × code to `DF-CC` and moves `DF-CC` on by
 *    one. Every character printed is also written into the char map with
 *    the current attribute (`ATTR-T`, `$A893`) — the map is what the game
 *    tests Jim against, the screen is only what is seen
 * 3. in this order: the decks (DKDAT, ink `$5BCF`, the pair $21 $22 repeated
 *    `count` times), the ladders (LDAT, ink `$5BD2`, a 2 × 5 block from $2F),
 *    the big doors (EODAT, ink of their own, 3 × 4 from $23), the numbered
 *    doors with their keys (SDDAT: the number $38 + n in ink `$5BCF`, the
 *    door 1 × 4 from $4C under it in ink `$5BCD`, the key $41 + n and $4B
 *    under it in ink `$5BCC` — only while the record's flag is not 0), the
 *    treasure (TDAT, 2 × 2 from its own code in its own ink, while its flag
 *    is not 0) and the crates (BDAT, 6 × 4 from its own code, printed with
 *    CHARS = `$8678` and recorded in the map with bit 7 set)
 * 4. `$AA85` copies 768 bytes of the attribute map over the attributes on
 *    the screen, and `$AA90` sets the border to the fifth byte of COLDAT
 *
 * The blocks (`$A83F` + `$A8AF`) number their characters on and on across
 * the rows: a 3 × 4 door from $23 is $23 $24 $25 / $26 $27 $28 / …
 *
 * Checked against the original's own drawing of every hold, byte for byte,
 * by tools/matchholds.mjs. Free of DOM dependencies (R-001).
 */
export class HoldRenderer {

  /**
   * @param {Object} data - The parsed data/global.json#holds.
   */
  constructor(data) {
    if (!data || !data.holds || !data.glyphs) {
      throw new Error('game data missing (data/global.json#holds)');
    }
    this.holds = data.holds;
    this.glyphBase = data.glyphs.address;
    this.glyphs = ZXVideoRAM.decode(data.glyphs.bytes);
    this.scenery = data.glyphs.scenery;
    this.crates = data.glyphs.crates;
  } // constructor

  /** @returns {number[]} The numbers of the holds there are. */
  holdNumbers() {
    return Object.keys(this.holds).map(Number).sort((a, b) => a-b);
  } // holdNumbers

  /**
   * The hold's tables, as data/global.json#holds has them.
   * @param {number} number - The hold, 1-21.
   * @returns {Object} The tables.
   */
  hold(number) {
    var hold = this.holds[String(number)];
    if (!hold) {
      throw new Error('there is no hold '+number);
    }
    return hold;
  } // hold

  /**
   * Draws the hold into the video memory and returns its char map and
   * attribute map, as `$A900` leaves them at `$A1C4` and `$A4E4`.
   * @param {ZXVideoRAM} videoRAM - The video memory to draw into.
   * @param {number} number - The hold, 1-21.
   * @returns {{chars: Uint8Array, attributes: Uint8Array, border: number}} The maps (25 × 32 each) and the border colour.
   */
  draw(videoRAM, number) {
    var hold = this.hold(number);
    var colours = hold.COLDAT.map((record) => record[0]);
    // ★ COLDAT, copied to $5BCC-$5BD2 by $AB44
    var keyInk = colours[0], doorInk = colours[1], deckInk = colours[3];
    var border = colours[4], paper = colours[5], ladderInk = colours[6];

    var state = {
      bytes: videoRAM.bytes,
      chars: new Uint8Array(800),
      attributes: new Uint8Array(800).fill((paper << 3) & 0xFF),
      attr: (paper << 3) & 0xFF,
      chrs: this.scenery,
      map: 0,
      dfcc: 0
    };
    // $A8D8: CL-LINE over all 24 lines — every pixel to 0
    state.bytes.fill(0, 0, ZXVideoRAM.BITMAP_BYTES);

    var ink = (value) => { state.attr = (state.attr & 0xF8) | (value & 7); };

    // DKDAT: the decks
    ink(deckInk);
    hold.DKDAT.forEach((record) => {
      this.at(state, record[0], record[1]);
      for (var n = 0; n < record[2]; n++) {
        this.put(state, 0x21, true);
        this.put(state, 0x22, true);
      }
    });

    // LDAT: the ladders
    ink(ladderInk);
    hold.LDAT.forEach((record) => {
      this.block(state, 0x2F, 2, 5, record[0], record[1]);
    });

    // EODAT: the big doors, each in an ink of its own
    hold.EODAT.forEach((record) => {
      ink(record[2]);
      this.block(state, 0x23, 3, 4, record[0], record[1]);
    });

    // SDDAT: the numbered doors and their keys, while the flag says so
    ink(deckInk);
    hold.SDDAT.forEach((record) => {
      if (record[5] == 0) {
        return;
      }
      this.at(state, record[0], record[1]);
      ink(deckInk);
      this.put(state, record[4]+0x38, true);
      ink(doorInk);
      this.block(state, 0x4C, 1, 4, record[0], record[1]-1);
      this.at(state, record[2], record[3]);
      ink(keyInk);
      this.put(state, record[4]+0x41, true);
      this.at(state, record[2], record[3]-1);
      this.put(state, 0x4B, true);
    });

    // TDAT: the treasure, while the flag says so
    hold.TDAT.forEach((record) => {
      if (record[5] == 0) {
        return;
      }
      ink(record[4]);
      this.block(state, record[6], 2, 2, record[0], record[1]);
    });

    // BDAT: the crates, out of the second character set
    state.chrs = this.crates;
    hold.BDAT.forEach((record) => {
      ink(record[3]);
      this.block(state, record[2] | 0x80, 6, 4, record[0], record[1], 0x7F);
    });

    // $AA85: the attribute map over the screen's attributes
    state.bytes.set(state.attributes.subarray(0, ZXVideoRAM.ATTRIBUTES_BYTES),
                    ZXVideoRAM.ATTRIBUTES_OFFSET);
    return {chars: state.chars, attributes: state.attributes, border: border & 7};
  } // draw

  /**
   * ROM CL-SET for the upper screen, and `$A86E`: the print position and the
   * place in the maps for B (24 - row) and C (33 - column).
   * @param {Object} state - The drawing state.
   * @param {number} c - C, 33 - column.
   * @param {number} b - B, 24 - row.
   */
  at(state, c, b) {
    var row = 24-b, col = 33-c;
    state.map = (row*32+col) & 0xFFFF;
    state.dfcc = ZXVideoRAM.lineOffset(row*8)+col;
  } // at

  /**
   * One character: into the maps (`$A893`) and onto the screen (`$A817`),
   * both positions moving on by one.
   * @param {Object} state - The drawing state.
   * @param {number} code - The code to record in the map.
   * @param {boolean} print - Whether it is also printed.
   * @param {number} [printMask] - What of the code is printed (crates: $7F).
   */
  put(state, code, print, printMask) {
    this.record(state, code);
    if (print) {
      this.glyph(state, code & (printMask === undefined ? 0xFF : printMask));
    }
  } // put

  /** `$A893`: the code and ATTR-T into the maps, the position on by one. */
  record(state, code) {
    if (state.map < 800) {
      state.chars[state.map] = code & 0xFF;
      state.attributes[state.map] = state.attr;
    }
    state.map++;
  } // record

  /** `$A817`: eight bytes of the glyph to DF-CC, DF-CC on by one. */
  glyph(state, code) {
    var from = state.chrs+code*8-this.glyphBase;
    for (var line = 0; line < 8; line++) {
      var at = state.dfcc+line*256;
      if (at < ZXVideoRAM.BYTES) {
        state.bytes[at] = this.glyphs[from+line];
      }
    }
    state.dfcc++;
  } // glyph

  /**
   * `$A83F` then `$A8AF`: a block of `width` × `height` characters numbered
   * on from `code`, first recorded into the maps, then printed, row by row
   * downwards from (C, B).
   * @param {Object} state - The drawing state.
   * @param {number} code - The first code.
   * @param {number} width - E.
   * @param {number} height - D.
   * @param {number} c - C of the top left corner.
   * @param {number} b - B of the top left corner.
   * @param {number} [printMask] - What of the code is printed.
   */
  block(state, code, width, height, c, b, printMask) {
    var mask = printMask === undefined ? 0xFF : printMask;
    var next = code;
    for (var row = 0; row < height; row++) {
      this.at(state, c, b-row);
      for (var col = 0; col < width; col++) {
        this.record(state, next++);
      }
    }
    next = code;
    for (row = 0; row < height; row++) {
      this.at(state, c, b-row);
      for (col = 0; col < width; col++) {
        this.glyph(state, (next++) & mask);
      }
    }
  } // block

} // HoldRenderer
