const { GameModel } = await import('./gameModel.js?ver='+window.srcVersion);
const { ZXColor } = await import('./svision/js/platform/canvas2D/zx/zxColor.js?ver='+window.srcVersion);
const { ZXVideoRAMEntity } = await import('./svision/js/platform/canvas2D/zx/zxVideoRAMEntity.js?ver='+window.srcVersion);
const { ScreenLayout } = await import('./screenLayout.js?ver='+window.srcVersion);
// begin code

/**
 * SECRET SUB GAME: the original's hidden CATCH 20 GOLDFISH, played
 * (operator's decision 2026-10-09; the menu shows only its ships and sand).
 *
 * ★ The original has it on the tape (`$CE41`, main loop `$CF36`) and never
 * reaches it without a POKE (sources/docs/secondary_findings.md §7): a diver
 * under the ships catches goldfish and keeps away from the bigger fish; the
 * big fish takes the catch, the air runs out under water and fills up at
 * the surface under open sky, and twenty goldfish start Booty (`$D08A`).
 * Row 22 is the original's own: FISH with the catch and the AIR bar.
 *
 * The sibling of the game (GameModel) with a worker of its own
 * (subGameWorker.js — goldfishLogic.js over the original's memory,
 * tools/matchgoldfish.mjs 0 differences): the controls, the pause, the touch
 * halves and the FPS are the game's, inherited; what differs is the screen
 * (the 6912 bytes of the hidden game, as the worker sends them), the worker
 * and the way out.
 *
 * ★ The diver's keys are the original's LEFT, RIGHT, UP and DOWN (`$D579`
 * reads them as the game does, one a pass) — here the remake's, from
 * SETTINGS; ENTER ROOM does nothing.
 *
 * The picture is painted through the ink plane (ScreenLayout.TRUE_COLOUR,
 * R-036, as jetpac): goldfishLogic.js keeps it beside the memory and the
 * worker sends it with the screen, so a bubble no longer turns a fish's cell
 * the diver's colour. The memory stays the original's.
 *
 * ★ Sound: the IM 2 handler stays installed, so the tune plays on under the
 * hidden game (tools/tracegoldfish.py turns it off to measure the rate), and
 * a touch plays ROM BEEPER — once for a goldfish, twice for a bigger fish
 * (`$CF7E`). ? The noise of the air filling up (`$D063`) is left out.
 */
export class SubGameModel extends GameModel {

  constructor(app) {
    super(app, false);
    this.id = 'SubGameModel';

    // ★ the four keys of the diver ($D579); ENTER ROOM is not one of them
    this.controlsState = {left: false, right: false, up: false, down: false};
    this.screenEntity = null;
    // twenty goldfish: Booty starts, its tune goes on (stopAudio)
    this.won = false;
  } // constructor

  init() {
    super.init();

    // ★ the hidden game's border: cyan (5, tools/tracegoldfish.py's run)
    this.borderEntity.bkColor = ZXColor.cyan;
    this.desktopEntity.bkColor = ZXColor.cyan;

    if (this.screenEntity && this.app.audioManager.hasSound('tune')) {
      this.sendEvent(0, {id: 'playSound', bus: 'music', sound: 'tune', options: {repeat: true}});
    }
  } // init

  /**
   * The screen of the hidden game as data/global.json#goldfish has it (the
   * original's at its first `$CF36`, FISH and AIR on row 22), until the
   * worker's first frame.
   * @returns {boolean} False without the data.
   */
  initScreen() {
    var data = this.loadDataFile('goldfish');
    if (!data || !data.segments) {
      return false;
    }
    this.screenEntity = new ZXVideoRAMEntity(this.desktopEntity, 0, 0);
    this.screenEntity.videoRAM.enableInkPlane(ScreenLayout.TRUE_COLOUR);
    this.desktopEntity.addEntity(this.screenEntity);
    return true;
  } // initScreen

  missingDataText() {
    return 'SUB GAME DATA MISSING (data/global.json#goldfish). RUN tools/tracegoldfish.py AND tools/mkgoldfish.py.';
  } // missingDataText

  gameWorker() {
    return this.app.subGameWorker;
  } // gameWorker

  workerInitData() {
    return {
      // the original's memory at its first `$CF36` and the rate of its
      // passes (data/global.json#goldfish), the ROM font for the digits of the catch
      memory: this.loadDataFile('goldfish'),
      romFont: this.romFont(),
      inkPlane: ScreenLayout.TRUE_COLOUR,
      // the ships and the sand as the menu left them (GoldfishLogic#scenery)
      scenery: this.app.goldfishScenery
    };
  } // workerInitData

  /** after twenty goldfish the tune goes on into Booty, as on the machine */
  stopAudio() {
    if (!this.won) {
      super.stopAudio();
      return;
    }
    ['sounds', 'extra', 'animals'].forEach((bus) => {
      this.sendEvent(0, {id: 'stopAudioBus', bus: bus});
    });
    if (this.app.audioManager.musicHeld) {
      this.app.audioManager.continueBus('music');
      this.app.audioManager.musicHeld = false;
    }
  } // stopAudio

  /** the border is the hidden game's and stays so */
  updateBorder() {
  } // updateBorder

  handleWorkerMessage(event) {
    var data = event.data;
    switch (data.id) {
      case 'frame':
        this.fps.workerFrames++;
        if (this.fps.lastFrame !== false && data.frame > this.fps.lastFrame) {
          this.fps.ticks += data.frame-this.fps.lastFrame;
        }
        this.fps.lastFrame = data.frame;
        if (this.inputEntity && data.controls) {
          var held = Object.keys(data.controls).filter((key) => data.controls[key]);
          this.inputEntity.setText(held.length ? held.join(' ').toUpperCase() : '-');
        }
        // the BEEPERs of a touch (sounds[]); the tune waits while they play
        if (this.app.audioManager) {
          this.app.audioManager.playFrame(data);
        }
        // R-037: the message draws, and the loop knows it does not have to
        // where the ships and the sand are, for the menu to go on from
        if (data.scenery) {
          this.app.goldfishScenery = data.scenery;
        }
        if (this.screenEntity && data.screen) {
          this.screenEntity.restore(data.screen);
          // restore() leaves the plane without owners; the worker's goes in
          if (data.ink && this.screenEntity.videoRAM.inkPlane) {
            this.screenEntity.videoRAM.inkPlane.set(data.ink);
          }
          this.drawModel();
          this.needDraw = false;
        }
        break;
      case 'won':
        if (!this.won) {
          // ★ twenty goldfish: `$CF3E` → `$D08A`, the original starts Booty
          this.won = true;
          this.gameOver = true;
          this.app.startGame();
        }
        break;
      case 'error':
        console.error(data.message);
        break;
    }
  } // handleWorkerMessage

} // SubGameModel
