const { AbstractModel } = await import('./svision/js/abstractModel.js?ver='+window.srcVersion);
const { AbstractEntity } = await import('./svision/js/abstractEntity.js?ver='+window.srcVersion);
const { BorderEntity } = await import('./borderEntity.js?ver='+window.srcVersion);
const { TextEntity } = await import('./svision/js/platform/canvas2D/textEntity.js?ver='+window.srcVersion);
const { ButtonEntity } = await import('./svision/js/platform/canvas2D/buttonEntity.js?ver='+window.srcVersion);
const { MenuEntity } = await import('./svision/js/platform/canvas2D/menuEntity.js?ver='+window.srcVersion);
const { ZXWaitForAudioEventEntity } = await import('./svision/js/platform/canvas2D/zx/zxWaitForAudioEventEntity.js?ver='+window.srcVersion);
const { ZXColor } = await import('./svision/js/platform/canvas2D/zx/zxColor.js?ver='+window.srcVersion);
const { ZXDialogEntity } = await import('./svision/js/platform/canvas2D/zx/zxDialogEntity.js?ver='+window.srcVersion);
const { ZXVideoRAMEntity } = await import('./svision/js/platform/canvas2D/zx/zxVideoRAMEntity.js?ver='+window.srcVersion);
const { ZXVideoRAM } = await import('./svision/js/platform/canvas2D/zx/zxVideoRAM.js?ver='+window.srcVersion);
const { SubMenuModel } = await import('./subMenuModel.js?ver='+window.srcVersion);
await import('./svision/js/platform/canvas2D/zx/zxRomDraw.js?ver='+window.srcVersion);
await import('./goldfishLogic.js?ver='+window.srcVersion);
// begin code

/**
 * Main menu, the same structure as the other ZX remakes, over the hidden game
 * of the original (operator's decision 2026-10-08, MILNIKY M6).
 *
 * ★ The background is the original's CATCH 20 GOLDFISH (`$CF36`), the part
 * of the program nobody reaches without a POKE — its main loop over its
 * memory (goldfishLogic.js, data/global.json#goldfish; tools/matchgoldfish.mjs 0
 * differences), a pass every `passTStates` of data/global.json#goldfish by a plain
 * loop, as manicminer and jetsetwilly animate their menus. Only the ships
 * rolling by and the sand move: the diver, his bubbles and the fish are
 * left out (`diver: false`, `objects: false`; operator's decision
 * 2026-10-09) — the hidden game itself is the item SECRET SUB GAME
 * (subGameModel.js). The border is the hidden game's cyan (★ 5), and its
 * bottom band (FISH, AIR) says who made the remake and under which licence
 * instead. The items are in bright white straight over the sea, and the
 * version is in the sand, bottom right.
 *
 * The original's own menu (screen_layout.md) — `1 - KEYBOARD` … `0 - START
 * GAME` under its heading — is not shown any more; its heading stays on top
 * of HALL OF FAME, SOUNDS, MUSIC, SETTINGS and ABOUT GAME (subMenuModel.js).
 *
 * ★ What the original does **not** offer: a two-player game. There is no
 * `1 PLAYER GAME` / `2 PLAYER GAME`, so the remake has one player and asks
 * nothing. Its five controls and DEFINE KEYS live in SETTINGS.
 *
 * ? **HALL OF FAME** is here as in the sibling remakes, but whether the
 * original has one of its own is **not measured** (ZADANI chap. 9, question
 * 14). If it turns out to have one, this item is fidelity; if it does not, it
 * is a recorded deviation (ZADANI chap. 10).
 *
 * ★ The original's title picture with its moving sea comes after START
 * GAME (mainModel.js, M6), with the tune under it, and its demo after it.
 *
 * Two volumes: MUSIC, and SOUNDS for everything else (audioManager.js).
 *
 * The menu itself never touches the audio buses (R-024) — the hidden game's
 * BEEPERs and noise are left out with them; items that need sound go
 * through ZXWaitForAudioEventEntity first when the browser wants a user
 * gesture.
 */
export class MenuModel extends AbstractModel {

  constructor(app, selectionItem) {
    super(app);
    this.id = 'MenuModel';

    this.menuItems = [
      {t1: 'START GAME', event: {id: 'startGame', players: 1}},
      {t1: 'SECRET SUB GAME', event: {id: 'startSubGame'}},
      {t1: 'PLAYER NAME', event: {id: 'setPlayerName'}},
      {t1: 'HALL OF FAME', event: {id: 'showHallOfFame'}},
      {t1: 'SOUNDS', event: {id: 'setSounds'}},
      {t1: 'MUSIC', event: {id: 'setMusic'}},
      {t1: 'SETTINGS', event: {id: 'setSettings'}},
      {t1: 'LOAD TAPE', event: {id: 'startTapeLoading'}},
      {t1: 'ABOUT GAME', event: {id: 'showAbout'}}
    ];
    // the items in bright white straight over the sea (no panel), the one
    // selected on jetsetwilly's dark half-transparent bar. Nine items of
    // 10 px in two columns by rows (MenuEntity `columns`), five rows 16 px
    // apart in the sea of the hidden game, rows 8-19 (MENU_Y), 11 px from its
    // top and bottom. The columns take the whole width, 122 px each: the
    // widest label, SECRET SUB GAME, is 117 px in the ROM font. No item has
    // a value of its own (getMenuData): the player's name and the volumes are
    // in the labels. The labels are centred in their columns
    this.menuOptions = {
      fonts: this.app.fonts.zxFonts8x8,
      leftMargin: 4,
      rightMargin: 4,
      topMargin: 0,
      columns: 2,
      columnGap: 4,
      itemHeight: 10,
      itemPitch: 16,
      t1LeftMargin: 3,
      t1Align: 'center',
      t1TopMargin: 1,
      t2Width: 122,
      t2RightMargin: 3,
      t2TopMargin: 1,
      textColor: ZXColor.brightWhite,
      selectionTextColor: '#ffffff',
      selectionBarColor: '#00000059',
      hoverColor: '#0000001a',
      selectionHoverColor: '#00000066',
      clickColor: '#0000002a',
      selectionClickColor: '#00000086',
      selection: selectionItem
    };
    // the gesture for audio looks like the panels of subMenuModel.js (its
    // `waitForAudioEvent`), centred over the sea
    this.dialogProperties = SubMenuModel.dialogProperties(50);

    this.titleEntity = null;
    this.subtitleEntity = null;
    this.versionEntity = null;
    this.menuEntity = null;
    this.newVersionAvailable = false;
    // the hidden game under the menu: its screen, its loop and its rate
    this.screenEntity = null;
    this.goldfish = null;
    this.passTime = 0;
    this.nextPass = false;
  } // constructor

  /** the sea of the hidden game: rows 8-19, where the items go */
  static get MENU_Y() { return 8*8+11; }

  newBorderEntity() {
    return new BorderEntity(false, false);
  } // newBorderEntity

  /**
   * The hidden game out of data/global.json#goldfish (tools/mkgoldfish.py), its
   * bottom band cleared for the remake's line, without the diver and the fish.
   * @returns {boolean} False without the data.
   */
  initGoldfish() {
    var data = this.loadDataFile('goldfish');
    if (!data || !data.segments) {
      return false;
    }
    var memory = new Uint8Array(65536);
    data.segments.forEach((segment) => {
      memory.set(ZXVideoRAM.decode(segment.bytes), segment.address);
    });
    // rows 22-23 — FISH, the catch, the AIR bar — cleared to the band's cyan
    // ($28); the loop never prints there (goldfishLogic.js)
    for (var line = 0; line < 8; line++) {
      memory.fill(0, 0x50C0+256*line, 0x5100+256*line);
    }
    memory.fill(0x28, 0x5AC0, 0x5B00);
    // only the ships and the sand (operator's decision 2026-10-09): no
    // diver, no bubbles, no fish — they are the sub game's
    this.goldfish = new GoldfishLogic(memory, {diver: false, objects: false});
    // the ships and the sand where SECRET SUB GAME or the last menu left them
    this.goldfish.setScenery(this.app.goldfishScenery);
    // ★ the memory is the original's before its first pass, and the sand is
    // printed by the pass ($D8E2): one pass now, so the first frame has it
    this.goldfish.pass();
    this.passTime = data.passTStates/3500;
    this.screenEntity = new ZXVideoRAMEntity(this.desktopEntity, 0, 0);
    this.screenEntity.restore(memory.subarray(0x4000, 0x5B00));
    this.desktopEntity.addEntity(this.screenEntity);
    return true;
  } // initGoldfish

  init() {
    super.init();

    // ★ the hidden game's border: cyan (5, tools/tracegoldfish.py's run)
    this.borderEntity.bkColor = ZXColor.cyan;
    this.desktopEntity.bkColor = ZXColor.blue;

    if (this.initGoldfish()) {
      // the hidden game's bottom band (row 22, where FISH is): the remake's
      // line in the 5x5 font, black on its cyan
      this.desktopEntity.addEntity(new TextEntity(this.desktopEntity, this.app.fonts.fonts5x5, 0, 23*8, this.desktopWidth, 6, this.app.copyright, ZXColor.black, false, {align: 'center'}));
    } else {
      this.desktopEntity.addEntity(new TextEntity(this.desktopEntity, this.app.fonts.fonts5x5, 8, 22*8, this.desktopWidth-16, 12,
        'MENU DATA MISSING (data/global.json#goldfish). RUN tools/tracegoldfish.py AND tools/mkgoldfish.py.', ZXColor.brightWhite, false, {align: 'center', textWrap: true}));
    }
    // the items over the sea, rows 8-19, without a panel of their own
    var rows = Math.ceil(this.menuItems.length/this.menuOptions.columns);
    this.menuEntity = new MenuEntity(this.desktopEntity, 0, MenuModel.MENU_Y, this.desktopWidth, (rows-1)*this.menuOptions.itemPitch+this.menuOptions.itemHeight, false, this.menuOptions, this, this.getMenuData);
    this.desktopEntity.addEntity(this.menuEntity);

    // the version in the sand (row 21), bottom right, in the 5×5 font; still a
    // button, because a newer version on the server turns it into UPGRADE !
    this.versionEntity = new ButtonEntity(this.desktopEntity, this.app.fonts.fonts5x5, 185, 21*8+2, 66, 5, 'Ⓥ'+this.app.version, {id: 'upgradeApp'}, [], ZXColor.black, false, {align: 'right'});
    this.desktopEntity.addEntity(this.versionEntity);
    // suppress the hover/click colors resolved in init(), so the button always
    // looks like plain text
    this.versionEntity.hoverColor = false;
    this.versionEntity.clickColor = false;
    this.checkServerVersion();


    // The menu is **silent**, on purpose: the browser lets sound through only
    // after a user gesture, and the menu is reached right after the page
    // loads, when there need not have been any gesture yet. So the buses are
    // closed and the sound starts one level down, behind the menu item the
    // player chose — by then the gesture has happened and
    // ZXWaitForAudioEventEntity can ask for it in handleEvent. ? The
    // original's tune is M6; until then ABOUT GAME and the hall of fame are
    // silent too.
    // the flash clock of the ZX attributes (app.stack.flashState, 330 ms like
    // the ROM's 16 frames): the blinking cursor of the remap dialog and of the
    // player name input reads it, so the menu has to keep it going like every
    // other model
    this.app.stack.flashState = false;
    this.sendEvent(330, {id: 'changeFlashState'});

    this.sendEvent(0, {id: 'closeAllAudioBuses'});
  } // init

  shutdown() {
    super.shutdown();
    // the ships and the sand go on where they are, in SECRET SUB GAME or the
    // next menu (initGoldfish)
    if (this.goldfish) {
      this.app.goldfishScenery = this.goldfish.scenery();
    }
  } // shutdown

  checkServerVersion() {
    var receiver = {
      id: this.id+'Version',
      fetchDataId: '',
      setData: (data) => {
        if (data.data.version && data.data.version !== 'unknown' && data.data.version !== this.app.version) {
          this.newVersionAvailable = true;
          this.showVersion();
        }
      },
      errorData: () => {}
    };
    receiver.fetchDataId = this.app.fetchData('version.db', false, {}, receiver);
  } // checkServerVersion

  getMenuData(self, key, row) {
    switch (key) {

      case 'numberOfItems':
        return self.menuItems.length;

      // no values of their own: the player's name and the volumes are part
      // of the label (PLAYER: JIM, SOUNDS: 50%); a name too long for
      // PLAYER: in its column stands alone
      case 't1':
        switch (row) {
          case 2:
            if (!self.app.playerName) {
              return self.menuItems[row].t1;
            }
            var label = 'PLAYER: '+self.app.playerName;
            return self.labelFits(label) ? label : self.app.playerName;
          case 4:
            return self.menuItems[row].t1+': '+self.volumeText(self.app.audioManager.volume.sounds);
          case 5:
            return self.menuItems[row].t1+': '+self.volumeText(self.app.audioManager.volume.music);
        }
        return self.menuItems[row].t1;

      default:
        if (key in self.menuItems[row]) {
          return self.menuItems[row][key];
        }
        break;

    }
    return '';
  } // getMenuData

  /**
   * Whether a label fits its column of the menu: its width in the menu's font,
   * counted as TextEntity.lineWidth() counts it, after the label's left margin.
   * @param {string} text - The label.
   * @returns {boolean}
   */
  labelFits(text) {
    var o = this.menuEntity.options, width = 0;
    for (var i = 0; i < text.length; i++) {
      if (i > 0) {
        width += o.fonts.charsSpacing;
      }
      width += o.fonts.getCharData(text[i], '1', 1).width;
    }
    return o.t1LeftMargin+width <= o.itemWidth;
  } // labelFits

  volumeText(volume) {
    switch (volume) {
      case 0:
        return 'OFF';
      case 10:
        return 'MAX';
    }
    return (volume*10)+'%';
  } // volumeText

  /**
   * Puts the version back on the bottom band: the version number, or UPGRADE !
   * in red when the server has a newer one.
   */
  showVersion() {
    if (this.newVersionAvailable) {
      this.versionEntity.setText('UPGRADE !');
      this.versionEntity.setPenColor(ZXColor.brightRed);
    } else {
      this.versionEntity.setText('Ⓥ'+this.app.version);
      this.versionEntity.setPenColor(ZXColor.black);
    }
  } // showVersion

  /**
   * Asks for the browser's gesture for audio before an action that plays
   * sound: ZXWaitForAudioEventEntity in a window without a title, centred on
   * the screen, coloured by the `waitForAudioEvent` dialog properties.
   * @param {string} continueEvent - The event sent when the gesture comes.
   */
  openWaitForAudioEvent(continueEvent) {
    var p = this.dialogProperties.waitForAudioEvent;
    this.desktopEntity.addModalEntity(new ZXDialogEntity(this.desktopEntity, 66, 77, 124, 41, false, p, (dialog) => new ZXWaitForAudioEventEntity(dialog, dialog.innerX, dialog.innerY, dialog.innerWidth, dialog.innerHeight, continueEvent, p)));
  } // openWaitForAudioEvent

  handleEvent(event) {
    if (super.handleEvent(event)) {
      return true;
    }

    switch (event.id) {
      case 'startGame':
        this.app.setPlayers(event.players);
        if (!this.app.playerName.length) {
          // the name first (subMenuModel.js), which then starts the game
          this.app.setModel('SubMenuModel', 'playerNameStart');
          return true;
        } else {
          if (this.app.inputEventsManager.needEventForAudio()) {
            this.openWaitForAudioEvent('startGame2');
            return true;
          }
        }
      case 'startGame2':
        // the title with the sea and the tune first (mainModel.js), as in
        // manicminer; Enter there starts the game. ★ The original's
        // `0 - START GAME` goes straight into the game (some 15 frames after
        // the key, tools/mkhold.py); its title is in front of its menu
        this.app.setModel('MainModel');
        return true;

      case 'startSubGame':
        // the hidden game with its BEEPERs and the tune under it
        // (subGameModel.js): the browser's gesture for audio first
        if (this.app.inputEventsManager.needEventForAudio()) {
          this.openWaitForAudioEvent('startSubGame2');
          return true;
        }
      case 'startSubGame2':
        this.app.setModel('SubGameModel');
        return true;

      case 'setPlayerName':
        this.app.setModel('SubMenuModel', 'playerName');
        return true;

      // the screens under the original's heading (subMenuModel.js); the
      // volumes ask for the gesture for audio themselves, when they play
      case 'showHallOfFame':
        this.app.setModel('SubMenuModel', 'hallOfFame');
        return true;

      case 'setSounds':
        this.app.setModel('SubMenuModel', 'sounds');
        return true;

      case 'setMusic':
        this.app.setModel('SubMenuModel', 'music');
        return true;

      case 'setSettings':
        this.app.setModel('SubMenuModel', 'settings');
        return true;

      case 'startTapeLoading':
        if (this.app.inputEventsManager.needEventForAudio()) {
          this.openWaitForAudioEvent('startTapeLoading2');
          return true;
        }
      case 'startTapeLoading2':
        this.app.setModel('TapeLoadingModel');
        return true;

      case 'showAbout':
        this.app.setModel('SubMenuModel', 'about');
        return true;

      case 'upgradeApp':
        if (this.newVersionAvailable) {
          this.app.upgradeApp();
        }
        return true;

      case 'changeFlashState':
        this.app.stack.flashState = !this.app.stack.flashState;
        this.sendEvent(330, {id: 'changeFlashState'});
        return true;
    }

    return false;
  } // handleEvent

  loopModel(timestamp) {
    super.loopModel(timestamp);

    // the hidden game: a pass when its time has come, never a backlog after
    // the tab slept — it is a picture, not a clock
    if (this.goldfish) {
      if (this.nextPass === false) {
        this.nextPass = timestamp+this.passTime;
      }
      if (timestamp >= this.nextPass) {
        // without the diver nothing is caught, so the hidden game is never won
        this.goldfish.pass();
        this.screenEntity.restore(this.goldfish.m.subarray(0x4000, 0x5B00));
        this.nextPass += this.passTime;
        if (this.nextPass < timestamp) {
          this.nextPass = timestamp+this.passTime;
        }
      }
    }

    if (this.desktopEntity.modalEntity) {
      this.desktopEntity.modalEntity.loopEntity(timestamp);
    } else if (this.menuEntity) {
      // a player's name too long for its column ping-pongs
      this.menuEntity.loopEntity(timestamp);
    }

    this.drawModel();
  } // loopModel

} // MenuModel
