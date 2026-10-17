const { ZXVideoRAM } = await import('./svision/js/platform/canvas2D/zxSpectrum/zxVideoRAM.js?ver='+window.srcVersion);
const { ZXFonts8x8 } = await import('./svision/js/platform/canvas2D/zxSpectrum/zxFonts8x8.js?ver='+window.srcVersion);
// begin code

/**
 * Prints the panel the way the original does (data/global.json#panel,
 * tools/dumppanel.py; sources/docs/screen_layout.md):
 *
 * 1. `$E0A9`, right after the hold: INK 6 and PAPER = the hold's border
 *    colour (`$5BD0`) — which is why the panel is yellow on black in hold 1
 *    and on another paper elsewhere — then the template line from `$F2BB`
 *    across row 23 in the ROM font
 * 2. into it, with ROM `OUT-NUM-1` (no leading zeros or spaces): the booty
 *    collected in column 14 and the treasure left in column 28
 * 3. `$E064`: a little Jim for every life from column 0 (character $21 of
 *    the set at `$F15B`), a space in the ROM font after them, and the key
 *    ($22 $23 of the same set) in columns 4-5
 * 4. the main loop, every pass (`$DF5B`): the number of the key carried,
 *    '0' + `($F241)`, in column 6
 *
 * Every character goes through `$E6DC` (or the ROM's own printing, which
 * does the same for these): the eight bytes overwrite the cell and ATTR-T
 * goes to its attribute.
 *
 * 5. ★ when no treasure is left, `$E0F7` prints `FIND THE GOLD KEY IN
 *    SECONDS!` across row 22 in INK 7 on the hold's paper. ? The number of
 *    seconds that goes into the gap, and when, is M4 (`$5BFA`)
 *
 * Free of DOM dependencies (R-001); the ROM font is svision's.
 */
export class PanelRenderer {

  /**
   * @param {Object} data - The parsed data/global.json#panel.
   */
  constructor(data) {
    if (!data || !data.template) {
      throw new Error('game data missing (data/global.json#panel)');
    }
    this.data = data;
    this.icons = ZXVideoRAM.decode(data.icons.bytes);
    this.rom = new ZXFonts8x8({}, false);
  } // constructor

  /**
   * The panel's numbers at the start of a game, as the original sets them
   * ($DEB2, $DEB8, $DEC3, the template of Jim's object).
   * @returns {{lives: number, booty: number, treasure: number, key: number}}
   */
  startState() {
    return {lives: this.data.lives.start, booty: this.data.booty.start,
            treasure: this.data.treasure.start, key: this.data.keyNumber.start};
  } // startState

  /**
   * Prints the panel.
   * @param {ZXVideoRAM} videoRAM - The video memory to print into.
   * @param {Object} state - {lives, booty, treasure, key}.
   * @param {number} border - The hold's border colour, the panel's paper.
   * @param {number} paper - The hold's paper (the gold key line).
   */
  draw(videoRAM, state, border, paper) {
    var d = this.data;
    var attr = (((border & 7) << 3) | (d.ink & 7)) & 0xFF;
    var pos = {c: 0};
    var at = (c) => { pos.c = c; };
    var rom = (ch) => { this.cell(videoRAM, pos, d.row, this.rom.glyphBytes(ch), attr); };
    var icon = (code) => {
      this.cell(videoRAM, pos, d.row, this.icons.subarray((code-0x21)*8, (code-0x21)*8+8), attr);
    };

    at(d.template.c);
    for (var i = 0; i < d.template.text.length; i++) {
      rom(d.template.text[i]);
    }
    at(d.booty.c);
    String(state.booty).split('').forEach(rom);
    at(d.treasure.c);
    String(state.treasure).split('').forEach(rom);

    at(d.lives.c);
    for (var life = 0; life < state.lives; life++) {
      icon(d.lives.code);
    }
    rom(' ');
    at(d.keyIcon.c);
    d.keyIcon.codes.forEach(icon);

    if (state.treasure == 0) {
      var gold = (((paper & 7) << 3) | (d.goldKey.ink & 7)) & 0xFF;
      pos.c = d.goldKey.c;
      for (var g = 0; g < d.goldKey.text.length; g++) {
        this.cell(videoRAM, pos, d.goldKey.b, this.rom.glyphBytes(d.goldKey.text[g]), gold);
      }
    }

    at(d.keyNumber.c);
    rom(String.fromCharCode(0x30+state.key));
  } // draw

  /**
   * One character at the print position (C, B), the position moving on.
   * @param {ZXVideoRAM} videoRAM - The video memory.
   * @param {Object} pos - {c}: C of the print position, decremented.
   * @param {number} b - B, 24 - row.
   * @param {Uint8Array} glyph - Eight bytes.
   * @param {number} attr - ATTR-T.
   */
  cell(videoRAM, pos, b, glyph, attr) {
    var row = 24-b, col = 33-pos.c;
    if (col >= 0 && col < 32) {
      var dfcc = ZXVideoRAM.lineOffset(row*8)+col;
      for (var line = 0; line < 8; line++) {
        videoRAM.bytes[dfcc+line*256] = glyph[line];
      }
      videoRAM.bytes[ZXVideoRAM.ATTRIBUTES_OFFSET+row*32+col] = attr;
    }
    pos.c--;
  } // cell

} // PanelRenderer
