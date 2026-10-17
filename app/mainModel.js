const { AbstractModel } = await import('./svision/js/abstractModel.js?ver='+window.srcVersion);
const { BorderEntity } = await import('./borderEntity.js?ver='+window.srcVersion);
const { ZXVideoRAMEntity } = await import('./svision/js/platform/canvas2D/zxSpectrum/zxVideoRAMEntity.js?ver='+window.srcVersion);
const { TextEntity } = await import('./svision/js/platform/canvas2D/textEntity.js?ver='+window.srcVersion);
const { PauseGameEntity } = await import('./pauseGameEntity.js?ver='+window.srcVersion);
const { TitleSea } = await import('./titleSea.js?ver='+window.srcVersion);
const { ZXColor } = await import('./svision/js/platform/canvas2D/zxSpectrum/zxColor.js?ver='+window.srcVersion);
// begin code

/**
 * The title screen in front of the game, as manicminer has it: START GAME of
 * the menu comes here, and any key, a click, a touch or any gamepad button
 * starts the game (Escape and the X in the border open the options, the mute
 * keys mute).
 *
 * ★ The picture and its sea are the original's title (`$CD86`): the picture
 * out of the copy at `$6978`, `BORDER 3`, and the sea of `$D0AC` pass by pass
 * (app/titleSea.js, data/global.json#title; tools/matchtitle.mjs, 0 differences).
 * ★ The original plays its tune under the title too (`$CD14` sets `$FFF8`
 * to 3 before it gets here), and so does this: the `music` bus is opened
 * here and the tune started, and **it goes on playing into the game** — the
 * shutdown keeps the buses open when the game comes next, and GameModel only
 * opens them again (an open bus is kept as it is). ? The tune itself is M6;
 * until it is read out of the program the bus is open and silent.
 *
 * ★ The rate is the original's loop `$CDAF` without the tune, constant, like
 * the game's (PASS_TSTATES in gameWorker.js): 6.92 frames a pass. Muting the tune does
 * not change it.
 *
 * ★ **The demo**: after 1024 interrupts (`FRAMES` = `$0400`, `$CDB4`) the
 * original's title goes to its demo (`$D602`) — the game in mode 3, Jim
 * standing, the holds changing by themselves — and back to the title when it
 * ends or a key is pressed. So does this: after `demoTStates` of
 * data/global.json#title (20.45 s, without the tune, the remake's rate; 24.66 s
 * with it, where the notes lose interrupts) the DemoModel (gameModel.js with
 * `demo`), and back here. The time stands while the options panel is open.
 * The tune goes on through the demo and back.
 *
 * ? The remake's own: the original goes on from the title by any key to its
 * menu. Here the menu is in front and the key starts the game.
 */
export class MainModel extends AbstractModel {

  /** keys that do not start the game: modifiers and the browser's own */
  static get IGNORED_KEYS() {
    return ['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'NumLock',
            'ScrollLock', 'Tab', 'ContextMenu', 'OS', 'Dead', 'Unidentified'];
  } // IGNORED_KEYS

  constructor(app) {
    super(app);
    this.id = 'MainModel';

    this.screenEntity = null;
    this.sea = null;
    // the length of a pass in ms (3.5 MHz) and the time the next one is due
    this.passTime = 0;
    this.nextPass = false;
    // the buses stay open when the game or the demo comes next (shutdown)
    this.startingGame = false;
    // how long the title waits for the demo (ms) and how long it has
    this.demoTime = 0;
    this.waited = 0;
    this.lastTime = false;
  } // constructor

  newBorderEntity() {
    // the X in the border is Escape: the options panel (as manicminer)
    return new BorderEntity(true, false);
  } // newBorderEntity

  init() {
    super.init();

    this.borderEntity.bkColor = ZXColor.black;
    this.desktopEntity.bkColor = ZXColor.black;

    var title = this.loadDataFile('title');
    if (title) {
      // ★ the state of $D86F goes on from the last visit (titleSea.js)
      this.sea = new TitleSea(title, this.app.titleSeed);
      this.passTime = title.passTStates/3500;
      this.demoTime = (title.demoTStates || 0)/3500;
      this.borderEntity.bkColor = ZXColor.color(title.border);
      this.screenEntity = new ZXVideoRAMEntity(this.desktopEntity, 0, 0);
      this.screenEntity.restore(this.sea.picture);
      this.desktopEntity.addEntity(this.screenEntity);
    } else {
      this.desktopEntity.addEntity(new TextEntity(this.desktopEntity, this.app.fonts.zxFonts8x8, 0, 8*8, this.desktopWidth, 8, 'BOOTY', ZXColor.brightWhite, false, {align: 'center'}));
      this.desktopEntity.addEntity(new TextEntity(this.desktopEntity, this.app.fonts.fonts5x5, 8, 8*8+16, this.desktopWidth-16, 40,
        'TITLE DATA MISSING (data/global.json#title). RUN tools/tracetitle.py AND mktitle.py. PRESS ENTER TO START THE GAME.', ZXColor.brightGreen, false, {align: 'center', textWrap: true}));
    }

    this.app.openAudioBuses();
    // back from the demo the tune is playing already, and goes on
    if (this.app.audioManager.hasSound('tune') && !this.app.keepTune) {
      this.sendEvent(0, {id: 'playSound', bus: 'music', sound: 'tune', options: {repeat: true}});
    }
    this.app.keepTune = false;
  } // init

  shutdown() {
    super.shutdown();
    if (this.sea) {
      this.app.titleSeed = this.sea.seed;
    }
    if (!this.startingGame) {
      this.sendEvent(0, {id: 'stopAllAudioBuses'});
    }
  } // shutdown

  startGame() {
    this.startingGame = true;
    this.app.startGame();
  } // startGame

  /** ★ $D602: the demo, as the original's title goes to it */
  startDemo() {
    this.startingGame = true;
    this.app.setModel('DemoModel');
  } // startDemo

  handleEvent(event) {
    if (super.handleEvent(event)) {
      return true;
    }

    switch (event.id) {

      case 'continueGame':
        this.sendEvent(0, {id: 'continueAllAudioBuses'});
        return true;

      case 'exitGame':
        this.app.setModel('MenuModel');
        return true;

      case 'errorAudioBus':
        this.app.showErrorMessage(event.error, 'reopen');
        return true;

      case 'keyPress':
        if (this.desktopEntity.modalEntity) {
          break;
        }
        var key = event.key;
        if (key.length == 1) {
          key = key.toUpperCase();
        }
        switch (key) {
          // the options panel, as the pause of the game; the X in the border
          // sends it too, and a click on the X is the X's, not a start
          case 'Escape':
            this.sendEvent(0, {id: 'pauseAllAudioBuses'});
            this.desktopEntity.addModalEntity(new PauseGameEntity(this.desktopEntity, 52, 34, 153, 97, 'OPTIONS', 'MenuModel'));
            return true;
          case this.app.controls.keyboard.music:
            this.app.toggleMuted('music');
            return true;
          case this.app.controls.keyboard.sounds:
            this.app.toggleMuted('sounds');
            return true;
        }
        // ★ any key goes on from the title, as in the original ($CDC9 ROM
        // KEY-SCAN); here also a click, a touch and any gamepad button.
        // Not the keys a browser keeps for itself or that are only held
        // with another one (F5, F11, Shift …)
        if (!MainModel.IGNORED_KEYS.includes(key) && !/^F[0-9]+$/.test(key)) {
          this.startGame();
          return true;
        }
        break;
    }

    return false;
  } // handleEvent

  loopModel(timestamp) {
    super.loopModel(timestamp);

    var elapsed = this.lastTime === false ? 0 : timestamp-this.lastTime;
    this.lastTime = timestamp;
    if (this.desktopEntity.modalEntity) {
      // the options panel stops the sea and the wait for the demo, as a
      // pause does
      this.desktopEntity.modalEntity.loopEntity(timestamp);
      this.nextPass = false;
    } else if (this.demoTime > 0) {
      // a tab that slept does not count
      this.waited += Math.min(elapsed, 1000);
      if (this.waited >= this.demoTime) {
        this.startDemo();
        return;
      }
    }
    if (!this.desktopEntity.modalEntity && this.sea) {
      if (this.nextPass === false) {
        this.nextPass = timestamp+this.passTime;
      }
      // the passes due since the last frame, but never a backlog after the
      // tab slept: the sea is not a clock
      if (timestamp >= this.nextPass) {
        this.sea.pass(this.screenEntity.videoRAM.bytes);
        this.screenEntity.invalidate();
        this.nextPass += this.passTime;
        if (this.nextPass < timestamp) {
          this.nextPass = timestamp+this.passTime;
        }
      }
    }

    this.drawModel();
  } // loopModel

} // MainModel
