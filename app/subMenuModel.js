const { AbstractModel } = await import('./svision/js/abstractModel.js?ver='+window.srcVersion);
const { AbstractEntity } = await import('./svision/js/abstractEntity.js?ver='+window.srcVersion);
const { BorderEntity } = await import('./borderEntity.js?ver='+window.srcVersion);
const { TextEntity } = await import('./svision/js/platform/canvas2D/textEntity.js?ver='+window.srcVersion);
const { ButtonEntity } = await import('./svision/js/platform/canvas2D/buttonEntity.js?ver='+window.srcVersion);
const { SlidingTextEntity } = await import('./svision/js/platform/canvas2D/slidingTextEntity.js?ver='+window.srcVersion);
const { ZXPlayerNameEntity } = await import('./svision/js/platform/canvas2D/zx/zxPlayerNameEntity.js?ver='+window.srcVersion);
const { ZXWaitForAudioEventEntity } = await import('./svision/js/platform/canvas2D/zx/zxWaitForAudioEventEntity.js?ver='+window.srcVersion);
const { ZXVolumeEntity } = await import('./svision/js/platform/canvas2D/zx/zxVolumeEntity.js?ver='+window.srcVersion);
const { ZXSettingsEntity } = await import('./svision/js/platform/canvas2D/zx/zxSettingsEntity.js?ver='+window.srcVersion);
const { ZXDialogEntity } = await import('./svision/js/platform/canvas2D/zx/zxDialogEntity.js?ver='+window.srcVersion);
const { ZXDialogProperties } = await import('./svision/js/platform/canvas2D/zx/zxDialogProperties.js?ver='+window.srcVersion);
const { ZXColor } = await import('./svision/js/platform/canvas2D/zx/zxColor.js?ver='+window.srcVersion);
// begin code

/**
 * The screens off the menu that are not the game — PLAYER NAME, HALL OF
 * FAME, SOUNDS, MUSIC, SETTINGS and ABOUT GAME — as one model with a
 * variant: the same
 * black screen with the heading of the original's own menu on top (`BOOTY`,
 * `BY JOHN F. CAIN.`, `© 1984 JOHN F. CAIN.`, data/global.json#texts — here in the
 * 5x5 font on the original's cyan bars cut to the text), and one panel under
 * it whose title bar is always in the same place: cells 4-27, from y 46 down
 * to 172, the title in bright red 9 px high.
 *
 * - `about`: the about text, MORE INFO (Enter, GamepadOK) opens the about
 *   page. The title bar keeps the dialog's counter: five clicks on it show
 *   the game statistics from the server, five more the system information,
 *   five more the text again.
 * - `hallOfFame`: the table. ? **Whether the original has a hall of fame of
 *   its own is not measured** (ZADANI chap. 9, question 14), and it shows no
 *   score in points on its panel (chap. 6): ten places as in manicminer,
 *   place, score (up to five digits — the score is BOOTY over the whole
 *   game) and name, scores
 *   off the server, and a name too long for its column ping-pongs
 *   (SlidingTextEntity). If the original has a table, its heading, its places
 *   and its default entries replace these; if it has none, this screen is a
 *   recorded deviation (ZADANI chap. 10).
 * - `sounds`, `music`: svision's ZXVolumeEntity — ★ the samples are the
 *   game's own, the explosion of a booby-trapped treasure (`$FFFD` 1 and 2,
 *   audioManager.js `explosionExample`) and the tune (`$FA00`, once round,
 *   `tuneExample`)
 * - `settings`: svision's ZXSettingsEntity — the five controls of the
 *   original and DEFINE KEYS
 * - `playerName`: svision's ZXPlayerNameEntity; `playerNameStart` is the
 *   same asked by START GAME while the player has no name, and saving it
 *   starts the game (the title first, mainModel.js, after the gesture for
 *   audio when the browser wants one)
 *
 * The player's name, the volumes and the settings are svision's dialogs (ZXDialogEntity) in the
 * panel's place; closing one goes back to the menu. CLOSE (and Escape,
 * GamepadExit) goes back to the menu from every variant, the menu's cursor on
 * the item the variant came from (gameApp.js setModel, `menuItem`).
 */
export class SubMenuModel extends AbstractModel {

  /**
   * @param {Object} app - The application.
   * @param {string} variant - 'playerName', 'playerNameStart', 'hallOfFame',
   *        'sounds', 'music', 'settings' or 'about'.
   */
  constructor(app, variant) {
    super(app);
    this.id = 'SubMenuModel';
    this.variant = variant;
    // the item of the menu (menuModel.js menuItems) to come back to
    this.menuItem = SubMenuModel.MENU_ITEMS[variant];

    // the panel under the heading, the same place for every variant
    this.panelX = 32;
    this.panelY = 46;
    this.panelWidth = 192;
    this.panelHeight = 126;
    this.dialogProperties = SubMenuModel.dialogProperties(this.panelY);

    this.panelEntity = null;
    // the svision dialog of `playerName`, `sounds`, `music` and `settings`,
    // while it is open
    this.dialogEntity = null;

    // about
    this.aboutText = 'BOOTY IS A REMAKE OF THE 1984 FIREBIRD CLASSIC BY JOHN F. CAIN FOR THE 48K ZX SPECTRUM.\n' +
                    'JIM THE CABIN BOY IS ON BOARD THE BLACK GALLEON, AND ITS TWENTY HOLDS ARE FULL OF PIRATE ' +
                    'TREASURE. THE DOORS ARE NUMBERED AND SO ARE THE KEYS - FIND THE RIGHT ONE, MIND THE ' +
                    'PIRATES, THE PARROT AND THE RATS, AND DO NOT TRUST EVERY TREASURE.\n' +
                    'THE HIGH SCORES ARE KEPT IN THE HALL OF FAME ON THE SERVER.';
    this.statsText = 'error:\nstatistics data not available!';
    this.clickCounter = 0;

    // hall of fame: the rows drawn by showTable(), and the names, ticked from
    // loopModel(): a name too long for its column ping-pongs
    this.rowEntities = [];
    this.nameEntities = [];
    // ? the remake's ten places, as in manicminer, and the colours of the
    // rows from the top (operator's choice 2026-10-10)
    this.placesCount = 10;
    this.placeColors = [ZXColor.brightYellow, ZXColor.white, ZXColor.yellow,
                        ZXColor.brightCyan, ZXColor.brightCyan, ZXColor.brightGreen, ZXColor.brightGreen,
                        ZXColor.brightBlue, ZXColor.brightBlue, ZXColor.brightBlue];
  } // constructor

  /** the item of the menu each variant belongs to (menuModel.js menuItems) */
  static get MENU_ITEMS() {
    return {playerNameStart: 0, playerName: 2, hallOfFame: 3, sounds: 4, music: 5, settings: 6, about: 8};
  } // MENU_ITEMS

  /**
   * The look of the svision dialogs in Booty, the same as the panel of this
   * model: a black window without a frame, the title in bright red in the
   * 9 px title bar. The contents come from svision and are laid out for
   * 200 x 124 px; the window has no frame, only the title bar, so they get
   * 192 x 117 — the right edge of the volume panel (MAX, +) and of the
   * keyboard loses up to 6 px. What is not set here is the default of
   * ZXDialogProperties (the look of Manic Miner). The menu's gesture for
   * audio uses it too (menuModel.js).
   * @param {number} y - The top of the window.
   * @returns {Object} The dialog properties.
   */
  static dialogProperties(y) {
    return ZXDialogProperties.merge({
      x: 32,
      y: y,
      width: 192,
      height: 126,
      frameWidth: 0,
      titleColor: ZXColor.brightRed,
      bkColor: ZXColor.black,
      theme: {
        penColor: ZXColor.brightWhite,
        valueColor: ZXColor.brightCyan,
        selectionColor: ZXColor.white,
        selectionPenColor: ZXColor.black,
        hoverColor: '#333333ff',
        clickColor: '#444444ff',
        separatorColor: ZXColor.brightWhite,
        iconColor: ZXColor.brightCyan,
        sliderColor: ZXColor.brightWhite,
        keyboardButtonsBkColor: ZXColor.brightCyan,
        // the default keyboard is 194 px wide, the panel 192: the rows are shifted
        // by 7 instead of 9 and SPACE is 23 instead of 25, so the widest row is
        // exactly 192. `update` merges `buttons` key by key (the other keys stay)
        // and replaces `rows` whole
        keyboardLayout: {
          action: 'update',
          options: {
            rows: [{shiftX: 0}, {shiftX: 5}, {shiftX: 10}, {shiftX: 0}],
            buttons: {
              '⇧': {width: 19},
              ' ': {width: 21}
            }
          }
        }
      },
      // the remap dialog covers the whole settings window, its title bar
      // included: the contents start 9 px under the top of the window, so the
      // dialog sits at -9 and the contents must not clip it. It looks like the
      // settings window itself: no frame, black panel, the title in bright
      // red, the same colours inside
      clipsChildren: false,
      remapKeys: {
        x: 0,
        y: -9,
        width: 192,
        height: 126,
        frameWidth: 0,
        titleColor: ZXColor.brightRed,
        bkColor: ZXColor.black,
        theme: {
          penColor: ZXColor.brightWhite,
          valueColor: ZXColor.brightCyan,
          // the field awaiting the key: black cursor on cyan
          selectionColor: ZXColor.cyan,
          selectionPenColor: ZXColor.black
        }
      },
      // the gesture for audio: the popup of the about panel, black on yellow
      waitForAudioEvent: {frameColor: ZXColor.black, bkColor: ZXColor.brightYellow, theme: {penColor: ZXColor.black}}
    });
  } // dialogProperties

  newBorderEntity() {
    // no X in the border: CLOSE and the ESC of the panel go back to the menu
    return new BorderEntity(false, false);
  } // newBorderEntity

  init() {
    super.init();

    this.borderEntity.bkColor = ZXColor.black;
    this.desktopEntity.bkColor = ZXColor.black;

    // the heading of the original's own menu (data/global.json#texts: rows 1, 3, 5,
    // PAPER 5, INK 0) in the 5x5 font: bars 7 px high, 10 px wider than the
    // text on each side, 5 px apart, centred
    var fonts = this.app.fonts.fonts5x5;
    var textWidth = (text) => text.split('').reduce((width, char, i) =>
      width+(i > 0 ? fonts.charsSpacing : 0)+fonts.getCharData(char, '1', 1).width, 0);
    ['BOOTY', 'BY JOHN F. CAIN.', '© 1984 JOHN F. CAIN.'].forEach((text, i) => {
      var width = textWidth(text)+20;
      this.desktopEntity.addEntity(new TextEntity(this.desktopEntity, fonts, Math.floor((this.desktopWidth-width)/2), 8+i*12, width, 7, text, ZXColor.black, ZXColor.cyan, {align: 'center', topMargin: 1}));
    });

    switch (this.variant) {
      case 'about':
        this.initAbout();
        break;
      case 'hallOfFame':
        this.initHallOfFame();
        break;
      case 'playerName':
      case 'playerNameStart':
        this.openDialog('PLAYER NAME', (dialog) => new ZXPlayerNameEntity(dialog, dialog.innerX, dialog.innerY, dialog.innerWidth, dialog.innerHeight, this.variant === 'playerNameStart', this.dialogProperties));
        break;
      case 'sounds':
        this.openDialog('SOUNDS', (dialog) => new ZXVolumeEntity(dialog, dialog.innerX, dialog.innerY, dialog.innerWidth, dialog.innerHeight, 'sounds', 'audioBusSoundsLevel', 'explosionExample', this.dialogProperties));
        break;
      case 'music':
        this.openDialog('MUSIC', (dialog) => new ZXVolumeEntity(dialog, dialog.innerX, dialog.innerY, dialog.innerWidth, dialog.innerHeight, 'music', 'audioBusMusicLevel', 'tuneExample', this.dialogProperties));
        break;
      case 'settings':
        this.openDialog('SETTINGS', (dialog) => new ZXSettingsEntity(dialog, dialog.innerX, dialog.innerY, dialog.innerWidth, dialog.innerHeight, this.app.controlsOptions, this.dialogProperties));
        break;
    }

    this.app.stack.flashState = false;
    this.sendEvent(330, {id: 'changeFlashState'});
  } // init

  /**
   * The black panel with its title bar in bright red, where every variant
   * has it.
   * @returns {AbstractEntity} The panel, added to the desktop.
   */
  newPanel() {
    this.panelEntity = new AbstractEntity(this.desktopEntity, this.panelX, this.panelY, this.panelWidth, this.panelHeight, false, ZXColor.black);
    this.desktopEntity.addEntity(this.panelEntity);
    return this.panelEntity;
  } // newPanel

  /**
   * A svision dialog (ZXDialogEntity) in the place of the panel, as the
   * modal of the desktop.
   * @param {string} title - The text of the title bar.
   * @param {Function} contentFactory - Called with the window, returns the contents entity.
   */
  openDialog(title, contentFactory) {
    var p = this.dialogProperties;
    this.dialogEntity = new ZXDialogEntity(this.desktopEntity, p.x, p.y, p.width, p.height, title, p, contentFactory);
    this.desktopEntity.addModalEntity(this.dialogEntity);
  } // openDialog

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

  // ------------------------------------------------------------ about

  initAbout() {
    var panel = this.newPanel();
    var w = this.panelWidth, h = this.panelHeight;
    panel.addEntity(new ButtonEntity(panel, this.app.fonts.fonts5x5, 0, 0, w, 9, 'ABOUT GAME', {id: 'clickLabel'}, [], ZXColor.brightRed, false, {align: 'center', topMargin: 2, member: 'titleBar', hoverColor: ZXColor.black, clickColor: ZXColor.black}));
    panel.addEntity(new TextEntity(panel, this.app.fonts.fonts5x5, 1, 9, w-2, h-25, this.aboutText, ZXColor.brightWhite, false, {align: 'justify', textWrap: true, margin: 2, member: 'aboutText'}));
    panel.addEntity(new ButtonEntity(panel, this.app.fonts.fonts5x5, 3, h-16, 54, 13, 'MORE INFO', {id: 'openAboutURL'}, ['Enter', 'GamepadOK'], ZXColor.brightWhite, ZXColor.green, {align: 'center', margin: 4}));
    panel.addEntity(new ButtonEntity(panel, this.app.fonts.fonts5x5, w-39, h-16, 36, 13, 'CLOSE', {id: 'closeSubMenu'}, ['Escape', 'GamepadExit'], ZXColor.brightWhite, ZXColor.blue, {align: 'center', margin: 4}));
    this.fetchData('stats.db', false, {});
  } // initAbout

  /**
   * Switches the panel between the about text, the statistics and the system
   * information, by the count of clicks on the title bar.
   */
  updateAbout() {
    switch (Math.floor(this.clickCounter/5)) {
      case 1:
        this.sendEvent(0, {id: 'updateEntity', member: 'titleBar', text: 'GAME STATS'});
        this.sendEvent(0, {id: 'updateEntity', member: 'aboutText', text: this.statsText});
        break;
      case 2:
        this.sendEvent(0, {id: 'updateEntity', member: 'titleBar', text: 'SYSTEM INFO'});
        var ipLabelSeparator = ' ';
        if (window.clientIP.indexOf(':') >= 0) {
          ipLabelSeparator = '\n';
        }
        var sysInfoText =
          'version: ' + this.app.version + '\n' +
          'element: ' + this.app.element.clientWidth + ' x ' + this.app.element.clientHeight + '\n' +
          'canvas: ' + this.app.element.width + ' x ' + this.app.element.height + '\n' +
          'ratio: ' + this.app.layout.ratio + '\n' +
          'ip:' + ipLabelSeparator + window.clientIP + '\n';
        this.sendEvent(0, {id: 'updateEntity', member: 'aboutText', text: sysInfoText});
        break;
      default:
        this.sendEvent(0, {id: 'updateEntity', member: 'titleBar', text: 'ABOUT GAME'});
        this.sendEvent(0, {id: 'updateEntity', member: 'aboutText', text: this.aboutText});
        break;
    }
  } // updateAbout

  // ------------------------------------------------------------ hall of fame

  initHallOfFame() {
    var panel = this.newPanel();
    var w = this.panelWidth, h = this.panelHeight;
    // the text of the title is the remake's, see the class
    panel.addEntity(new TextEntity(panel, this.app.fonts.fonts5x5, 0, 0, w, 9, 'HALL OF FAME', ZXColor.brightRed, false, {align: 'center', topMargin: 2}));
    panel.addEntity(new ButtonEntity(panel, this.app.fonts.fonts5x5, w-39, h-16, 36, 13, 'CLOSE', {id: 'closeSubMenu'}, ['Enter', 'Escape', ' ', 'GamepadOK', 'GamepadExit'], ZXColor.brightWhite, ZXColor.blue, {align: 'center', margin: 4}));
    if (navigator.onLine) {
      this.fetchData('hallOfFame.db', false, {});
    } else {
      this.showTable(this.defaultTable(), true);
    }
  } // initHallOfFame

  /**
   * ? The original's own table, if it turns out to have one — it would come
   * out of data/global.json#global (M2/M4). Until then this is empty on purpose:
   * an invented set of names and scores presented as the game's would be
   * exactly the kind of thing this project does not do.
   * @returns {Array} [{name, score}], empty while the question is open.
   */
  defaultTable() {
    var global = this.app.globalData;
    if (global && global.hallOfFame && global.hallOfFame.defaults) {
      return global.hallOfFame.defaults;
    }
    return [];
  } // defaultTable

  /**
   * Draws the ten places.
   * @param {Array} rows - [{name, score}] in descending order of score.
   * @param {boolean} original - True when these are the original's own entries.
   */
  showTable(rows, original) {
    this.rowEntities.forEach((entity) => entity.destroy());
    this.rowEntities = [];
    this.nameEntities = [];
    var panel = this.panelEntity;
    var w = this.panelWidth, h = this.panelHeight;
    // manicminer's table (hallOfFameEntity.js): rows 10 px apart from y 12
    // under the title bar, the place `1.` right-aligned in 18 px; then a
    // space (8 px), the score, up to five digits in the mono font
    // right-aligned in 40 px; a space again and the name in what is left of
    // the row — a name too long ping-pongs
    for (var i = 0; i < this.placesCount; i++) {
      var y = 12+i*10;
      var row = rows[i];
      var color = this.placeColors[i];
      var place = new TextEntity(panel, this.app.fonts.zxFonts8x8, 2, y, 18, 8, (i+1)+'.', color, false, {align: 'right'});
      panel.addEntity(place);
      this.rowEntities.push(place);
      var score = new TextEntity(panel, this.app.fonts.zxFonts8x8Mono, 28, y, 40, 8, row ? String(Math.min(Number(row.score), 99999)) : '', color, false, {align: 'right'});
      panel.addEntity(score);
      this.rowEntities.push(score);
      var name = new SlidingTextEntity(panel, this.app.fonts.zxFonts8x8, 76, y, w-76-4, 8, row ? String(row.name) : '', color, false, {animation: 'pingPong', speed: 30});
      panel.addEntity(name);
      this.rowEntities.push(name);
      this.nameEntities.push(name);
    }
    if (original) {
      var note = new TextEntity(panel, this.app.fonts.fonts5x5, 4, h-16, w-48, 12,
        navigator.onLine ? 'THE ORIGINAL TABLE - NOBODY HAS PLAYED YET' : 'SYSTEM OFFLINE - THE ORIGINAL TABLE',
        ZXColor.brightRed, false, {textWrap: true, margin: 1});
      panel.addEntity(note);
      this.rowEntities.push(note);
    }
  } // showTable

  // ------------------------------------------------------------ data

  setData(data) {
    if (this.variant === 'hallOfFame') {
      var rows = Object.keys(data.data).map((key) => data.data[key]);
      if (!rows.length) {
        // nobody has played yet: show the table the original ships with
        this.showTable(this.defaultTable(), true);
        return;
      }
      this.showTable(rows, false);
      if (rows[0]) {
        this.app.hiScore = Number(rows[0].score);
      }
      return;
    }
    // about: the statistics behind the title bar
    this.statsText = '';
    Object.entries(data.data).forEach(([periodKey, periodValue]) => {
      this.statsText += periodKey + ': [';
      Object.entries(periodValue).forEach(([key, value]) => {
        this.statsText += key + ':' + value + ', ';
      });
      this.statsText = this.statsText.slice(0, -2) + ']\n';
    });
  } // setData

  errorData(error) {
    if (this.variant === 'hallOfFame') {
      this.showTable(this.defaultTable(), true);
    }
  } // errorData

  handleEvent(event) {
    // the svision dialog closing (CLOSE, Escape): back to the menu, once the
    // desktop has removed it in super.handleEvent
    var dialogClosed = event.id == 'destroy' && this.dialogEntity !== null && event.entity === this.dialogEntity;
    if (dialogClosed) {
      this.dialogEntity = null;
      this.sendEvent(0, {id: 'closeSubMenu'});
    }
    if (super.handleEvent(event)) {
      return true;
    }

    switch (event.id) {
      case 'changeFlashState':
        this.app.stack.flashState = !this.app.stack.flashState;
        this.sendEvent(330, {id: 'changeFlashState'});
        return true;

      case 'closeSubMenu':
        this.app.setModel('MenuModel');
        return true;

      case 'startGame':
        // playerNameStart: the name is saved, the game starts as from the
        // menu — the title with the tune first, so the gesture for audio
        if (this.app.inputEventsManager.needEventForAudio()) {
          this.openWaitForAudioEvent('startGame2');
          return true;
        }
      case 'startGame2':
        this.app.setModel('MainModel');
        return true;

      case 'openAboutURL':
        window.location.href = 'about';
        return true;

      case 'clickLabel':
        if (this.clickCounter < 14) {
          this.clickCounter++;
        } else {
          this.clickCounter = 0;
        }
        if (this.clickCounter%5 == 0) {
          this.updateAbout();
        }
        return true;

      case 'resizeModel':
        if (this.variant === 'about' && this.clickCounter > 9) {
          this.updateAbout();
        }
        return false;
    }

    return false;
  } // handleEvent

  loopModel(timestamp) {
    super.loopModel(timestamp);

    if (this.desktopEntity.modalEntity) {
      this.desktopEntity.modalEntity.loopEntity(timestamp);
    } else {
      // entities are not ticked on their own: the long names of the hall of
      // fame ping-pong only when the model advances them
      this.nameEntities.forEach((entity) => entity.loopEntity(timestamp));
    }

    this.drawModel();
  } // loopModel

} // SubMenuModel
