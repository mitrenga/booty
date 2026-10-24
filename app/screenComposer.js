const { ZXVideoRAM } = await import('./svision/js/platform/canvas2D/zx/zxVideoRAM.js?ver='+window.srcVersion);
const { ScreenLayout } = await import('./screenLayout.js?ver='+window.srcVersion);
const { HoldRenderer } = await import('./holdRenderer.js?ver='+window.srcVersion);
const { SpriteRenderer } = await import('./spriteRenderer.js?ver='+window.srcVersion);
const { PanelRenderer } = await import('./panelRenderer.js?ver='+window.srcVersion);
const { ZXRomPrint } = await import('./svision/js/platform/canvas2D/zx/zxRomPrint.js?ver='+window.srcVersion);
// begin code

/**
 * Builds the Booty screen — all 6912 bytes of it — the way the original
 * builds it, out of data taken from the program.
 *
 * What the machine is (the video memory, the ULA's interleaved addressing,
 * turning bytes plus attributes into pixels) is svision's ZXVideoRAM
 * (R-003). What is left here is the game's own drawing, in the order the
 * game does it (sources/docs/holds.md, sprites.md):
 *
 * 1. **the hold** — `$A900` out of the hold's tables (HoldRenderer,
 *    data/global.json#holds), which also gives the border and the paper
 * 2. **the panel** — `$E0A9` / `$E064` (PanelRenderer, data/global.json#panel),
 *    on the hold's border colour
 * 3. **Jim** — the sprite routine `$EED7` (SpriteRenderer,
 *    data/global.json#sprites) over the hold's paper
 *
 * ★ Since M2 nothing here is a photograph any more: tools/matchscreen.mjs
 * compares this composition with the original's video memory and it is
 * still zero. The menu heading is the original's own print stream
 * (data/global.json#texts) printed the way the ROM prints it (svision ZXRomPrint).
 *
 * ? The pirates (OPST), the lifts (LIDAT) and the trapdoors (TDDAT) are not
 * drawn yet: they move from the first frame on, and how is M5. A pirate
 * standing still where no pirate ever stands still would be the remake's
 * invention.
 *
 * Free of DOM dependencies, so the offline tools render with this very code
 * (R-001).
 */
export class ScreenComposer {

  /**
   * @param {Object} data - The parsed data files: {holds, sprites, panel,
   *        global, texts}.
   */
  constructor(data) {
    if (!data || !data.holds || !data.sprites || !data.panel || !data.global || !data.texts) {
      throw new Error('game data missing (data/global.json: holds, sprites, panel, global, texts)');
    }
    this.holds = new HoldRenderer(data.holds);
    this.sprites = new SpriteRenderer(data.sprites);
    this.panel = new PanelRenderer(data.panel);
    this.global = data.global;
    this.border = 0;
    this.texts = data.texts;
  } // constructor

  /**
   * Loads the data files through a model (AbstractModel.loadDataFile).
   * @param {Object} model - Anything with loadDataFile(name).
   * @returns {Object} The data for the constructor.
   */
  static dataOf(model) {
    var data = {};
    ['holds', 'sprites', 'panel', 'global', 'texts'].forEach((name) => {
      data[name] = model.loadDataFile(name);
    });
    return data;
  } // dataOf

  /**
   * The state a game starts in, as the original has it (data/global.json#global,
   * data/global.json#panel): the hold, Jim's object and the panel's numbers.
   * @returns {Object} {hold, jim, panel}
   */
  startState() {
    return {
      hold: this.global.hold,
      jim: this.global.jim.slice(),
      panel: {lives: this.global.lives, booty: this.global.booty,
              treasure: this.global.treasure,
              key: this.panel.startState().key}
    };
  } // startState

  /**
   * The whole game screen.
   * @param {ZXVideoRAM} videoRAM - The video memory to draw into.
   * @param {Object} [state] - The 'frame' message of the worker; what it
   *        does not carry is the start of a game.
   * @returns {ZXVideoRAM} The video memory.
   */
  composeInto(videoRAM, state) {
    var s = state || {};
    // ★ since M3 the worker runs the game in the original's own memory and
    // sends its screen: that is the picture, byte for byte
    if (s.screen) {
      videoRAM.bytes.set(s.screen);
      this.border = s.border & 7;
      return videoRAM;
    }
    var start = this.startState();
    var hold = s.hold || start.hold;
    var drawn = this.holds.draw(videoRAM, hold);
    this.border = drawn.border;
    var paper = this.holds.hold(hold).COLDAT[5][0];
    this.panel.draw(videoRAM, s.panel && s.panel.treasure !== undefined ? s.panel : start.panel,
                    drawn.border, paper);
    this.sprites.draw(videoRAM, s.jim || start.jim, 'jim', paper);
    return videoRAM;
  } // composeInto

  /**
   * The heading of the original's own menu over black, as the ROM prints it
   * (tools/matchscreen.mjs; the remake shows its three lines in the 5x5
   * font on top of subMenuModel.js).
   *
   * ★ The way the original's menu starts (`$CDD1`-`$CDE6`): ATTR-P 0, ROM
   * `CL-LINE` over all 24 lines ($D4BE) — black, attribute $00 — and the
   * first print stream at `$D9FD` through `RST $10` ($D60E): PAPER 5, INK 0,
   * ` BOOTY ` at 1,12, ` BY JOHN F. CAIN. ` at 3,7, ` © 1984 JOHN F. CAIN. `
   * at 5,5. The original's items are not printed: the remake's menu has
   * items of its own and draws them where the original has its own.
   * @param {ZXVideoRAM} videoRAM - The video memory to draw into.
   * @returns {ZXRomPrint} The print position, for whatever follows.
   */
  composeMenu(videoRAM) {
    videoRAM.clear(0, this.texts.menu.attrP);
    var print = new ZXRomPrint(videoRAM, this.texts.menu.attrP);
    print.print(ZXVideoRAM.hexToBytes(this.texts.menu.header.bytes));
    return print;
  } // composeMenu

  /**
   * The original's whole menu screen — the heading and its six items, the
   * selected control in INVERSE (`$CDE9`-`$CE1B`). The remake does not show
   * it; tools/matchscreen.mjs prints it to check the streams and the ROM
   * printing against the running original.
   * @param {ZXVideoRAM} videoRAM - The video memory to draw into.
   * @param {number} selected - `$5BEA`: $24 keyboard, $1C Interface 2,
   *        $14 cursor, $0C Kempston.
   * @returns {ZXVideoRAM} The video memory.
   */
  composeOriginalMenu(videoRAM, selected) {
    var print = this.composeMenu(videoRAM);
    this.texts.menu.items.forEach((item, index) => {
      if (this.texts.menu.select[index] === selected) {
        print.print([20, 1]);
      }
      print.print(ZXVideoRAM.hexToBytes(item.bytes));
    });
    return videoRAM;
  } // composeOriginalMenu

} // ScreenComposer
