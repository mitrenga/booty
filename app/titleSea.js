const { ZXVideoRAM } = await import('./svision/js/platform/canvas2D/zx/zxVideoRAM.js?ver='+window.srcVersion);
// begin code

/**
 * The sea of the original's title screen (sources/docs/screen_layout.md,
 * the intro screens section), out of data/global.json#title (tools/mktitle.py).
 *
 * ★ What the program does, and so what this does:
 *
 * 1. `$CD86` sets `BORDER 3` and `$CDA6` `LDIR`s the picture from its copy
 *    at `$6978` to the screen. In the copy the sea is a marker, `$05`.
 * 2. Every pass of the loop `$CDAF` calls `$D0AC`: it walks the bitmap
 *    `$4000`-`$57FF` and the copy beside it, and every byte whose copy is the
 *    marker gets the next number of the generator `$D8D4` — written when it
 *    is below `$80`, otherwise a 0. The attributes are not touched.
 * 3. `$D8D4`: `A ← 5·A + 1` over the state at `$D86F` (`SLA A`, `SLA A`,
 *    `ADD A,B` with B = A + 1). Nothing else of the normal game uses it — the
 *    only other caller is the hidden game at `$CE8C` — so the state is the
 *    title's own and goes on from one visit to the next.
 *
 * The loop does not wait for a frame: a pass takes 6.92 frames without the
 * tune and 8.92 with it (tools/tracetitle.py). ? The remake runs it at the
 * constant rate without the tune, like the game (PASS_TSTATES in gameWorker.js), and puts
 * the whole pass on the screen at once; the original's beam sees the sea
 * half rewritten for some frames of each pass.
 *
 * tools/matchtitle.mjs checks it pass by pass against the original.
 */
export class TitleSea {

  /**
   * @param {Object} title - data/global.json#title.
   * @param {number} [seed] - The state of $D86F; data/global.json#title's without it.
   */
  constructor(title, seed) {
    this.picture = ZXVideoRAM.decode(title.videoRAM);
    this.mark = title.seaMark;
    this.limit = title.seaLimit;
    this.seed = (seed === undefined ? title.seed : seed) & 0xFF;
    this.passFrames = title.passFrames;
    // the offsets of the sea, in the order $D0AC walks them
    this.sea = [];
    for (var offset = 0; offset < ZXVideoRAM.BITMAP_BYTES; offset++) {
      if (this.picture[offset] == this.mark) {
        this.sea.push(offset);
      }
    }
  } // constructor

  /** $D8D4: the next number of the generator */
  next() {
    this.seed = (5*this.seed+1) & 0xFF;
    return this.seed;
  } // next

  /**
   * One pass of $D0AC over the screen.
   * @param {Uint8Array} bytes - The 6912 bytes of the video memory.
   */
  pass(bytes) {
    for (var i = 0; i < this.sea.length; i++) {
      var value = this.next();
      bytes[this.sea[i]] = value < this.limit ? value : 0;
    }
  } // pass

} // TitleSea
