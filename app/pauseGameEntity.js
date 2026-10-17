const { AbstractEntity } = await import('./svision/js/abstractEntity.js?ver='+window.srcVersion);
const { TextEntity } = await import('./svision/js/platform/canvas2D/textEntity.js?ver='+window.srcVersion);
const { ButtonEntity } = await import('./svision/js/platform/canvas2D/buttonEntity.js?ver='+window.srcVersion);
const { MenuEntity } = await import('./svision/js/platform/canvas2D/menuEntity.js?ver='+window.srcVersion);
const { ZXColor } = await import('./svision/js/platform/canvas2D/zxSpectrum/zxColor.js?ver='+window.srcVersion);
// begin code

/**
 * The pause panel of the remake: RESUME GAME / SOUNDS / MUSIC / EXIT GAME.
 *
 * ★ The original pauses too, on `P` (sources/docs/disasm_notes.md §8): `$ED35`
 * does `DI` — which stops the tune in the IM 2 handler as well — and loops
 * through the fixed delay `$E9D9` and ROM `KEY-SCAN` until any key comes.
 * It shows nothing while it waits. The panel here is the remake's own, like
 * the main menu; Escape (and a tab that loses focus) opens it, because a
 * browser game has to stop somewhere when nobody presses `P`
 * (ZADANI chap. 10).
 *
 * ? Whether the remake's `P` will behave exactly like the original's — no
 * panel, any key resumes — is M3/M4 work: the worker moves nobody yet, so
 * there is nothing to freeze but the clock.
 */
export class PauseGameEntity extends AbstractEntity {

  constructor(parentEntity, x, y, width, height, title, exitModel) {
    super(parentEntity, x, y, width, height, false, false);
    this.id = 'PauseGameEntity';

    this.title = title;
    this.exitModel = exitModel;
    this.menuItems = [
      {t1: 'RESUME GAME', event: {id: 'closePauseGame'}},
      {t1: 'SOUNDS', event: {id: 'changeSoundsState'}},
      {t1: 'MUSIC', event: {id: 'changeMusicState'}},
      {t1: 'EXIT GAME', event: {id: 'exitGame'}}
    ];
    this.menuOptions = {
      fonts: this.app.fonts.zxFonts8x8,
      leftMargin: 9,
      rightMargin: 9,
      topMargin: 8,
      itemHeight: 12,
      t1LeftMargin: 3,
      t1TopMargin: 2, 
      t2Width: 114,
      t2RightMargin: 3,
      t2TopMargin: 2, 
      textColor: ZXColor.black,
      selectionTextColor: ZXColor.black,
      selectionBarColor: '#dbdbdbff',
      hoverColor: '#0000001e',
      selectionHoverColor: '#efefefff',
      clickColor: '#0000002e',
      selectionClickColor: '#ffffffff'
    }
  } // constructor

  init() {
    super.init();
    this.addEntity(new AbstractEntity(this, 0, 0, this.width, this.height, false, ZXColor.brightWhite));
    this.addEntity(new TextEntity(this, this.app.fonts.fonts5x5, 0, 0, this.width, 9, this.title, ZXColor.brightBlack, false, {align: 'center', margin: 2}));
    this.addEntity(new MenuEntity(this, 1, 8, this.width-2, this.height-9, ZXColor.yellow, this.menuOptions, this, this.getMenuData));
  } // init

  getMenuData(self, key, row) {
    switch (key) {
      
      case 'numberOfItems':
        return self.menuItems.length;

      case 't2':
        switch (row) {
          case 1:
            return self.app.muted.sounds ? 'MUTE' : 'ON';
          case 2:
            return self.app.muted.music ? 'MUTE' : 'ON';
        }
        break;

      default:
        if (key in self.menuItems[row]) {
          return self.menuItems[row][key];
        }
        break;

    }
    return '';
  } // getMenuData

  /**
   * Flips a mute switch, mutes or unmutes its buses and shows it.
   * @param {string} what - 'music' or 'sounds' (gameApp.mutedBuses).
   */
  toggleMuted(what) {
    this.app.toggleMuted(what);
    this.sendEvent(1, 0, {id: 'refreshMenu'});
  } // toggleMuted

  handleEvent(event) {
    if (super.handleEvent(event)) {
      return true;
    }

    switch (event.id) {

      case 'keyPress':
        switch (event.key) {
          case 'Escape':
            this.sendEvent(-1, 1, {id: 'continueGame'});
            this.destroy();
            return true;
        }
        break;

      case 'closePauseGame':
        this.sendEvent(-1, 1, {id: 'continueGame'});
        this.destroy();
        return true;
        
      case 'changeMusicState':
        this.toggleMuted('music');
        return true;

      case 'changeSoundsState':
        this.toggleMuted('sounds');
        return true;

      case 'exitGame':
        this.app.setModel(this.exitModel);
        return true;
    }

    return false;
  } // handleEvent

} // PauseGameEntity
