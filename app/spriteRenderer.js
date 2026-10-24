const { ZXVideoRAM } = await import('./svision/js/platform/canvas2D/zx/zxVideoRAM.js?ver='+window.srcVersion);
// begin code

/**
 * Draws a sprite the way the original does: `$EED7`, step for step
 * (sources/docs/sprites.md) — Jim, the pirates, the creature of the timer
 * and the platforms go through it — and a block the way `$EA93` does
 * (`drawBlock`: the portholes, the explosion, the trapdoors).
 *
 * ★ An object is the original's own record (Jim's at `$F231`, the pirates'
 * copied out of the hold's OPST): +0 C and +1 B of the top left cell in the
 * ROM's print coordinates (column = 33 − C, row = 24 − B), +2 and +3 the
 * fine horizontal and vertical position 0-3, +6 the first character of the
 * frame, +7 its width and +8 its height in characters, +9 the ink.
 *
 * What the routine does with it:
 *
 * 1. clears the 128 byte buffer at `$A0EC` (it copies the zeros at `$A06C`
 *    over it)
 * 2. shifts the frame — read from CHARS + 8 × code, the characters row by
 *    row — left by 2 × (+2 + 1) bits into columns of (height + 1)
 *    characters from `$A0F4`: what is shifted out goes ORed into the column,
 *    what is left goes into the next one. At +2 = 3 that is 8 bits, the
 *    frame lands whole in its own columns; at 0 it sits 6 pixels further
 *    right
 * 3. prints the buffer as characters $20, $21 … (down a column, then the
 *    next column, (height + 1) apart) with CHARS = `$9FEC` + 2 × (+3 + 1):
 *    moving CHARS by two bytes moves the picture two pixel lines, so +3 = 3
 *    is the frame on its cells and 0 is 6 lines lower. One more column is
 *    printed when +2 is not 3, one more row when +3 is not 3
 * 4. each character goes through `$E6DC`, which **overwrites** the eight
 *    bytes of the cell (no OR, no mask: the sprite carries its paper with
 *    it) and writes ATTR-T to the cell's attribute — ink +9 over the paper
 *    the main loop has set (`$DF13`: PAPER of the hold)
 * 5. columns left of the screen (C ≥ $22) are skipped — a row with nothing
 *    left on the screen ends the whole sprite there — and at the right edge
 *    (C = 2) the rest of the row is dropped
 *
 * Checked against the original's routine by tools/matchsprites.mjs. Free of
 * DOM dependencies (R-001).
 */
export class SpriteRenderer {

  /**
   * @param {Object} data - The parsed data/global.json#sprites.
   */
  constructor(data) {
    if (!data || !data.banks) {
      throw new Error('game data missing (data/global.json#sprites)');
    }
    this.firstCode = data.firstCode;
    this.banks = {};
    Object.keys(data.banks).forEach((name) => {
      this.banks[name] = {chars: data.banks[name].chars,
                          bytes: ZXVideoRAM.decode(data.banks[name].bytes)};
    });
    // $9FEC-$A16B: CHARS of the printing pass and the buffer behind it
    this.buffer = new Uint8Array(0x180);
  } // constructor

  /**
   * One byte of a bank's character set, as CHARS + offset would read it.
   * @param {Object} bank - The bank.
   * @param {number} address - The address in the original's memory.
   * @returns {number} The byte.
   */
  bankByte(bank, address) {
    var index = address-(bank.chars+8*this.firstCode);
    if (index < 0 || index >= bank.bytes.length) {
      throw new Error('sprite data outside the bank: $'+address.toString(16));
    }
    return bank.bytes[index];
  } // bankByte

  /**
   * Draws one object.
   * @param {ZXVideoRAM} videoRAM - The video memory to draw into.
   * @param {number[]} object - The object's bytes (+0 … +9 used).
   * @param {string} bankName - Which character set CHARS points at.
   * @param {number} paper - The paper of ATTR-T (the hold's).
   */
  draw(videoRAM, object, bankName, paper) {
    var bank = this.banks[bankName];
    if (!bank) {
      throw new Error('there is no sprite bank '+bankName);
    }
    var buffer = this.buffer;
    var BASE = 0x9FEC;
    var width = object[7], height = object[8];

    // 1. $A0EC-$A16B cleared
    buffer.fill(0, 0xA0EC-BASE, 0xA16C-BASE);

    // 2. the frame shifted into the buffer
    var shift = 2*(object[2]+1);
    var column = (height+1)*8;
    var source = bank.chars+8*object[6];
    var ix = 0xA0F4-BASE, iy = ix+column;
    for (var col = 0; col < width; col++) {
      var hl = source+col*8;
      for (var row = 0; row < height; row++) {
        for (var line = 0; line < 8; line++) {
          var value = this.bankByte(bank, hl+row*width*8+line) << shift;
          buffer[iy] = value & 0xFF;
          buffer[ix] |= (value >> 8) & 0xFF;
          ix++;
          iy++;
        }
      }
      ix += 8;
      iy += 8;
    }

    // 3.-5. printed as characters
    var chars = BASE+2*(object[3]+1);
    var cols = width+(object[2] != 3 ? 1 : 0);
    var stride = height+1;
    var rows = stride-(object[3] == 3 ? 1 : 0);
    var attr = ((paper << 3) | (object[9] & 7)) & 0xFF;
    var b = object[1];
    for (var r = 0; r < rows; r++) {
      var code = 0x20+r;
      var c = object[0];
      var left = cols;
      // columns off the left edge
      while (c >= 0x22) {
        code += stride;
        left--;
        if (left == 0) {
          return;
        }
        c--;
      }
      var dfcc = ZXVideoRAM.lineOffset((24-b)*8)+(33-c);
      for (;;) {
        this.cell(videoRAM, dfcc++, chars+8*code, 33-c, 24-b, attr);
        if (c == 2) {
          // the right edge: the rest of the row is dropped
          break;
        }
        c--;
        code += stride;
        left--;
        if (left == 0) {
          break;
        }
      }
      b--;
    }
  } // draw

  /**
   * Draws a block the way `$EA93` does: `width` × `height` characters
   * numbered on from `code`, row by row downwards from (C, B), each through
   * `$E6DC` (the eight bytes overwrite the cell, ATTR-T goes to its
   * attribute). The portholes, the explosion, its splinters and the
   * trapdoors are drawn so.
   *
   * ★ The edges as the routine has them: a row that starts right of the
   * screen (C < 2) ends the whole block; a block left of the screen
   * (C ≥ $22) is never drawn by the game (see below). At the right edge
   * (C = 2) the rest of the row is dropped — and the counter of the codes
   * runs on by **one more** than the columns dropped
   * (`$EACF` counts the column it was called for again), so in a block
   * clipped there the next row starts one code later. That is the
   * original's arithmetic and it is kept.
   * @param {ZXVideoRAM} videoRAM - The video memory to draw into.
   * @param {string} bankName - Which character set CHARS points at.
   * @param {number} code - A, the first code.
   * @param {number} width - E.
   * @param {number} height - D.
   * @param {number} c - C of the top left cell.
   * @param {number} b - B of the top left cell.
   * @param {number} attr - ATTR-T.
   */
  drawBlock(videoRAM, bankName, code, width, height, c, b, attr) {
    var bank = this.banks[bankName];
    if (!bank) {
      throw new Error('there is no sprite bank '+bankName);
    }
    var n = (code-1) & 0xFF;
    for (var row = 0; row < height; row++, b--) {
      if (c < 2) {
        return;
      }
      var e = width;
      var cc = c;
      if (cc >= 0x22) {
        // ★ $EADE has its test the wrong way round (JR NC,$EAAC): it would
        // print off the left edge and skip on the screen. No caller ever
        // gets there — the splinters check C < $22 themselves ($E426), the
        // portholes and trapdoors stand still on the screen — so it is not
        // imitated: a block reaching it is a fault of the remake.
        throw new Error('drawBlock: C = '+cc+' is left of the screen ($EADE)');
      }
      var dfcc = ZXVideoRAM.lineOffset((24-b)*8)+(33-cc);
      for (;;) {
        n = (n+1) & 0xFF;
        this.blockCell(videoRAM, bank, dfcc++, n, 33-cc, 24-b, attr);
        if (cc == 2) {
          // $EACF: the counter runs on over the rest of the row and once more
          for (;;) {
            n = (n+1) & 0xFF;
            if (e == 1) {
              break;
            }
            e--;
          }
          break;
        }
        cc--;
        e--;
        if (e == 0) {
          break;
        }
      }
    }
  } // drawBlock

  /** `$E6DC` with the glyph straight out of a bank. */
  blockCell(videoRAM, bank, dfcc, code, col, row, attr) {
    var bytes = videoRAM.bytes;
    var from = bank.chars+8*code;
    for (var line = 0; line < 8; line++) {
      var at = dfcc+line*256;
      if (at < ZXVideoRAM.BITMAP_BYTES) {
        bytes[at] = this.bankByte(bank, from+line);
      }
    }
    if (row >= 0 && row < 24 && col >= 0 && col < 32) {
      bytes[ZXVideoRAM.ATTRIBUTES_OFFSET+row*32+col] = attr;
    }
  } // blockCell

  /**
   * `$E6DC`: eight bytes from CHARS + 8 × code to the cell, ATTR-T to its
   * attribute.
   */
  cell(videoRAM, dfcc, address, col, row, attr) {
    var bytes = videoRAM.bytes;
    for (var line = 0; line < 8; line++) {
      var at = dfcc+line*256;
      if (at < ZXVideoRAM.BITMAP_BYTES) {
        bytes[at] = this.buffer[address+line-0x9FEC];
      }
    }
    if (row >= 0 && row < 24 && col >= 0 && col < 32) {
      bytes[ZXVideoRAM.ATTRIBUTES_OFFSET+row*32+col] = attr;
    }
  } // cell

} // SpriteRenderer
