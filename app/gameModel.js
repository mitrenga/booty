const { AbstractModel } = await import('./svision/js/abstractModel.js?ver='+window.srcVersion);
const { BorderEntity } = await import('./borderEntity.js?ver='+window.srcVersion);
const { TextEntity } = await import('./svision/js/platform/canvas2D/textEntity.js?ver='+window.srcVersion);
const { PauseGameEntity } = await import('./pauseGameEntity.js?ver='+window.srcVersion);
const { ZXColor } = await import('./svision/js/platform/canvas2D/zxSpectrum/zxColor.js?ver='+window.srcVersion);
const { ScreenComposer } = await import('./screenComposer.js?ver='+window.srcVersion);
const { GameAreaEntity } = await import('./gameAreaEntity.js?ver='+window.srcVersion);
// begin code

/**
 * The game screen — one hold of the Black Galleon and the panel along the
 * bottom (sources/docs/screen_layout.md).
 *
 * The whole 256x192 picture is one {@link GameAreaEntity}, panel and all,
 * because that is how the machine holds it. ScreenComposer builds those 6912
 * bytes and tools/matchscreen.mjs checks the result against the original's
 * own video memory byte for byte.
 *
 * The worker (gameWorker.js, WORKER-PROTOCOL.md) keeps the state and ticks;
 * this model routes the controls into it and draws what comes back.
 *
 * ★ **The picture is drawn on the worker's message** (R-037): a `frame`
 * message composes the screen and draws it, and `loopModel` draws only when
 * no message has come since its last pass, so the picture keeps step with
 * the world and still keeps going while the worker stands (the pause panel).
 * How well that works is measured, not looked at: `drawn/messages/ticks FPS`
 * in the border in dev mode (R-045), healthy at 60/50/50.
 *
 * ★ **M1 shows the hold a game starts in, nothing moves yet, and the picture
 * is one captured off the original** (data/screen.json, tools/mkhold.py).
 * That is deliberate on both counts: how a hold is described in the program
 * is M2 and how Jim moves is M3, and drawing either before it is measured
 * would mean making it up. Every byte on the screen is still a byte the
 * original drew.
 */
export class GameModel extends AbstractModel {

  /**
   * ? TEST ONLY: the hold a new game starts in instead of 1 — the worker goes
   * there the way a door does ($EE84). null = the original's start (keep it
   * so; used 2026-10-08 with 10 to test the drowning).
   */
  static get TEST_START_HOLD() { return null; }

  /**
   * ? TEST ONLY: where Jim stands in TEST_START_HOLD, ROM CL-SET [C, B]
   * (C = 33 − column, B = 24 − row); null = where he is. For the drowning it
   * was [19, 6]: the bottom deck of hold 10, a little left of the door into
   * the sea (EODAT [17, 7]).
   */
  static get TEST_START_AT() { return null; }

  /**
   * @param {Object} app - The app.
   * @param {boolean} [demo] - ★ The demo of the title (`$D602`, `$5BF0` = 3):
   *        the same game, Jim stands and the holds change by themselves
   *        (BootyLogic.demoPass). Any key, click, touch or gamepad button —
   *        and the end of the demo — go back to the title (mainModel.js),
   *        as in the original; the tune goes on under it.
   */
  constructor(app, demo) {
    super(app);
    this.id = 'GameModel';
    this.demo = !!demo;

    this.gameOver = false;
    // ★ the five controls of the original's DEFINE KEYS: LEFT, RIGHT, UP,
    // DOWN and ENTER ROOM (disasm_notes.md §8). There is no jump key.
    this.controlsState = {left: false, right: false, up: false, down: false,
                          enter: false};
    this.worker = null;
    this.render = null;
    this.gameAreaEntity = null;
    this.inputEntity = null;
    // R-045: drawn / worker messages / world ticks a second
    this.fps = {frames: 0, workerFrames: 0, ticks: 0, since: false, lastFrame: false};
    this.fpsEnabled = false;
    // R-037: true until a worker message has drawn the picture
    this.needDraw = true;
    // a touch that is shorter than one tick of the worker has to be held
    this.heldTaps = {};
  } // constructor

  /**
   * The game's own border: the X in its corner is Escape — the pause panel —
   * as in manicminer, and on a touchscreen the two halves of the screen are
   * the controls, so the border carries them and their icons
   * (jetpac/app/gameModel.js).
   * Without it the model gets the plain AbstractEntity of AbstractModel and
   * the touch halves are not there at all.
   * @returns {BorderEntity}
   */
  newBorderEntity() {
    // the demo has no touch controls: a touch anywhere ends it
    return new BorderEntity(true, this.app.controls.touchscreen.supported && !this.demo);
  } // newBorderEntity

  init() {
    super.init();

    // ★ black until the first hold is drawn (BORDER 0 in the BASIC loader);
    // then the hold's own colour (updateBorder)
    this.borderEntity.bkColor = ZXColor.black;
    this.desktopEntity.bkColor = ZXColor.black;

    // the three buses of audioManager.js; the tune of the title
    // (mainModel.js) goes on playing on its open bus
    this.app.openAudioBuses();
    this.app.audioManager.resetGameSounds();

    if (!this.initScreen()) {
      this.desktopEntity.addEntity(new TextEntity(this.desktopEntity, this.app.fonts.zxFonts8x8, 0, 8*8, this.desktopWidth, 8, 'BOOTY', ZXColor.brightWhite, false, {align: 'center'}));
      this.desktopEntity.addEntity(new TextEntity(this.desktopEntity, this.app.fonts.fonts5x5, 8, 8*8+16, this.desktopWidth-16, 40,
        this.missingDataText(), ZXColor.brightGreen, false, {align: 'center', textWrap: true}));
      return;
    }

    if (typeof this.app.devModeName === 'string') {
      // the FPS goes into the border (borderEntity.setFps, R-045 point 5);
      // the held controls go into the border as well, top right, for the
      // same reason: nothing is written over a picture that is compared with
      // the original byte for byte
      this.fpsEnabled = true;
      this.inputEntity = new TextEntity(this.borderEntity, this.app.fonts.fonts3x3, 0, 1, 10*8, 4, '', ZXColor.brightCyan, false, {align: 'right'});
      this.borderEntity.addEntity(this.inputEntity);
    }

    if (!this.demo) {
      this.showTouchIcons();
    }

    this.worker = this.gameWorker();
    this.app.inputEventsManager.sendEventsActiveKeys('Press');
    this.sendWorkerMessage({id: 'init', initData: this.workerInitData()});
  } // init

  /** what the screen says when the data of the game are not there */
  missingDataText() {
    return 'GAME DATA MISSING (data/global.json: holds, sprites, panel, global). RUN tools/dumpholds.py, dumpsprites.py, dumppanel.py AND mkglobal.py.';
  } // missingDataText

  /** the worker that keeps the game (gameApp.js) */
  gameWorker() {
    return this.app.worker;
  } // gameWorker

  /**
   * What the worker starts the game from (WORKER-PROTOCOL.md, `initData`).
   * @returns {Object}
   */
  workerInitData() {
    return {
      headless: false,
      hiScore: this.app.hiScore,
      // ★ the state of the original's generator ($F343). It is 0 after the
      // tape has loaded and the original never resets it between games, so
      // the remake starts from 0 and carries it from one game to the next
      // (handleWorkerMessage) — exactly what the machine does
      // (disasm_notes.md §5)
      seed: this.app.gameSeed,
      demo: this.demo,
      startHold: this.demo ? null : GameModel.TEST_START_HOLD,
      startAt: this.demo ? null : GameModel.TEST_START_AT,
      // ★ the memory the game starts from: the original's data where the
      // original has it (data/global.json#memory) and the ROM font, which is
      // svision's (ZXFonts8x8 carries the ROM's 96 glyphs)
      memory: this.loadDataFile('memory'),
      romFont: this.romFont(),
      // the times of a change of hold through a door (data/global.json#transition)
      transition: this.loadDataFile('transition')
    };
  } // workerInitData

  shutdown() {
    super.shutdown();
    this.sendWorkerMessage({id: 'reset'});
    this.stopAudio();
  } // shutdown

  /** the sound on the way out: all of it, but the tune after the demo */
  stopAudio() {
    if (this.demo) {
      // back to the title: its tune goes on, the game's sounds stop
      ['sounds', 'extra', 'animals'].forEach((bus) => {
        this.sendEvent(0, {id: 'stopAudioBus', bus: bus});
      });
      if (this.app.audioManager.musicHeld) {
        this.app.audioManager.continueBus('music');
        this.app.audioManager.musicHeld = false;
      }
      this.app.keepTune = true;
    } else {
      this.sendEvent(0, {id: 'stopAllAudioBuses'});
    }
  } // stopAudio

  /**
   * The demo: any key, click, touch or gamepad button ends it (★ the
   * original's: any key, `$ED35` in mode 3).
   * @param {Object} event - The event.
   * @returns {boolean} True when the event was the demo's.
   */
  demoEvent(event) {
    switch (event.id) {
      case 'keyPress':
        this.app.setModel('MainModel');
        return true;
      case 'blurWindow':
        // nothing to pause: the demo plays on
        return true;
    }
    return false;
  } // demoEvent

  /**
   * Builds the renderer and adds the screen.
   * @returns {boolean} True when the screen was created.
   */
  initScreen() {
    try {
      this.render = new ScreenComposer(ScreenComposer.dataOf(this));
    } catch (error) {
      console.error(error.message);
      return false;
    }
    this.gameAreaEntity = new GameAreaEntity(this.desktopEntity, 0, 0, this.render);
    this.desktopEntity.addEntity(this.gameAreaEntity);
    return true;
  } // initScreen

  /**
   * The ROM font as the machine has it at $3D00: characters 32-127, eight
   * bytes each, in the ROM's order (ZXFonts8x8.fontsChars).
   * @returns {Uint8Array} 768 bytes.
   */
  romFont() {
    var font = this.app.fonts.zxFonts8x8Mono;
    var bytes = new Uint8Array(768);
    for (var c = 0; c < 96; c++) {
      bytes.set(font.glyphBytes(font.fontsChars.charAt(c)), c*8);
    }
    return bytes;
  } // romFont

  sendWorkerMessage(event) {
    if (this.worker) {
      this.worker.postMessage(event);
    }
  } // sendWorkerMessage

  /**
   * Sets one control and sends the whole state over when it changed. The
   * whole state goes rather than the change, so that the worker never has to
   * guess what is still held.
   * @param {string} action - The control action.
   * @param {boolean} value - Pressed or released.
   */
  setControl(action, value) {
    if (!(action in this.controlsState) || this.controlsState[action] === value) {
      return;
    }
    this.controlsState[action] = value;
    this.sendWorkerMessage(Object.assign({id: 'controls'}, this.controlsState));
  } // setControl

  handleEvent(event) {
    if (super.handleEvent(event)) {
      return true;
    }

    if (this.demo && this.demoEvent(event)) {
      return true;
    }

    switch (event.id) {

      case 'exitGame':
        this.app.setModel('MenuModel');
        return true;

      case 'blurWindow':
        this.pauseGame();
        return true;

      case 'continueGame':
        this.sendWorkerMessage({id: 'continue'});
        this.sendEvent(0, {id: 'continueAllAudioBuses'});
        // that let the tune go too; the next frame holds it again if a
        // creature, an explosion or a one-shot is still on (playFrame)
        this.app.audioManager.musicHeld = false;
        return true;

      case 'releaseTouchAction':
        if (this.heldTaps[event.action]) {
          this.heldTaps[event.action]--;
        }
        this.releaseTouchAction(event.action);
        return true;

      case 'keyPress':
        var key = event.key;
        if (key.length == 1) {
          key = key.toUpperCase();
        }
        switch (key) {
          // ★ The original pauses on `P` (disasm_notes.md §8); the remake
          // pauses on Escape, the gamepad's exit, the X in the border and a
          // tab that loses focus, and has no pause key of its own. ? That
          // the remake's pause shows a panel and the original's shows nothing
          // is a recorded deviation (ZADANI chap. 10).
          case 'Escape':
          case 'GamepadExit':
            this.pauseGame();
            return true;
          case 'Touch':
            if (this.borderEntity.leftControlEntity && this.borderEntity.leftControlEntity.pointOnEntity(event)) {
              this.app.inputEventsManager.touchesMap[event.identifier] = this.borderEntity.leftControlEntity;
              this.touchStart(event, 'left', this.borderEntity.leftControlEntity);
              return true;
            }
            if (this.borderEntity.rightControlEntity && this.borderEntity.rightControlEntity.pointOnEntity(event)) {
              this.app.inputEventsManager.touchesMap[event.identifier] = this.borderEntity.rightControlEntity;
              this.touchStart(event, 'right', this.borderEntity.rightControlEntity);
              return true;
            }
            break;
          case 'RetryTouch':
            this.setControl(event.action, true);
            return true;
          case this.app.controls.keyboard.music:
            this.app.toggleMuted('music');
            return true;
          case this.app.controls.keyboard.sounds:
            this.app.toggleMuted('sounds');
            return true;
        }
        var action = this.controlAction(key);
        if (action !== false) {
          this.setControl(action, true);
          return true;
        }
        break;

      case 'keyRelease':
        var releasedKey = event.key;
        if (releasedKey.length == 1) {
          releasedKey = releasedKey.toUpperCase();
        }
        if (releasedKey == 'Touch') {
          this.touchEnd(event);
          return true;
        }
        var releasedAction = this.controlAction(releasedKey);
        if (releasedAction !== false) {
          this.setControl(releasedAction, false);
          return true;
        }
        break;

      case 'keyMove':
        if (event.key == 'Touch') {
          this.touchMove(event);
          return true;
        }
        break;

      case 'errorAudioBus':
        this.app.showErrorMessage(event.error, 'reopen');
        return true;
    }

    return false;
  } // handleEvent

  /** pauses the worker and opens the pause menu */
  pauseGame() {
    if (this.desktopEntity.modalEntity || this.gameOver) {
      return;
    }
    this.sendWorkerMessage({id: 'pause'});
    this.sendEvent(0, {id: 'pauseAllAudioBuses'});
    this.desktopEntity.addModalEntity(new PauseGameEntity(this.desktopEntity, 52, 34, 153, 97, 'PAUSE GAME', 'MenuModel'));
  } // pauseGame

  handleWorkerMessage(event) {
    var data = event.data;
    switch (data.id) {
      case 'frame':
        this.fps.workerFrames++;
        // R-045: the third number is read off the counter the message
        // carries, not counted here
        if (this.fps.lastFrame !== false && data.frame > this.fps.lastFrame) {
          this.fps.ticks += data.frame-this.fps.lastFrame;
        }
        this.fps.lastFrame = data.frame;
        // ★ the generator's state goes on into the next game, as $F343 does
        // in the original (see init)
        if (typeof data.rand === 'number') {
          this.app.gameSeed = data.rand;
        }
        if (data.panel) {
          this.app.score = data.panel.score;
          this.app.hiScore = Math.max(this.app.hiScore || 0, data.panel.hiScore || 0);
          this.app.lives = data.panel.lives;
        }
        if (this.inputEntity && data.controls) {
          var held = Object.keys(data.controls).filter((key) => data.controls[key]);
          this.inputEntity.setText(held.length ? held.join(' ').toUpperCase() : '-');
        }
        // every frame: the one-shots, and the continuous slots on and off
        if (this.app.audioManager) {
          this.app.audioManager.playFrame(data);
        }
        // R-037: the message draws, and the loop knows it does not have to
        if (this.gameAreaEntity) {
          this.gameAreaEntity.setFrame(data);
          this.drawModel();
          this.needDraw = false;
          this.updateBorder();
        }
        break;
      case 'gameOver':
        if (!this.gameOver) {
          this.gameOver = true;
          if (this.demo) {
            // ★ the demo is over ($ED8F → $D60B JP $CD86): the title again
            this.app.setModel('MainModel');
            break;
          }
          this.app.score = data.score;
          this.app.setModel('GameOverModel');
        }
        break;
      case 'error':
        console.error(data.message);
        break;
    }
  } // handleWorkerMessage

  /**
   * ★ The border is the hold's: `$AA90` sets it to the fifth byte of COLDAT
   * (`$5BD0`) when the hold is drawn — black in hold 1, blue in 7, red in 8
   * (tools/matchholds.mjs checks it for all 21). The composer knows it once
   * it has drawn the hold.
   */
  updateBorder() {
    if (!this.render) {
      return;
    }
    var color = ZXColor[ZXColor.colorsNames[this.render.border & 7]];
    if (this.borderEntity.bkColor !== color) {
      this.borderEntity.bkColor = color;
      this.desktopEntity.bkColor = color;
      this.needDraw = true;
    }
  } // updateBorder

  /**
   * Maps a key or gamepad event onto a control action.
   *
   * The keyboard keys are **only** the configured ones (`app.controls.keyboard`
   * — arrows and SPACE by default, remapped from SETTINGS); nothing is
   * accepted beside them, so a remapped key never keeps a hidden second
   * meaning. The gamepad keys are the fixed names the library gives its
   * buttons. The mouse is not a game control here — it serves the buttons and
   * the menu. ★ The original's own keys are `5` left, `8` right, `7` up, `6`
   * down and `A` to enter a hold (disasm_notes.md §8); whoever wants them
   * sets them in SETTINGS.
   * @param {string} key - The event key.
   * @returns {string|false} The action, or false.
   */
  controlAction(key) {
    var kb = this.app.controls.keyboard;
    switch (key) {
      case kb.left: case 'GamepadLeft': return 'left';
      case kb.right: case 'GamepadRight': return 'right';
      case kb.up: case 'GamepadUp': return 'up';
      case kb.down: case 'GamepadDown': return 'down';
      case kb.enter: case 'GamepadFire': case 'GamepadOK': return 'enter';
    }
    return false;
  } // controlAction

  /**
   * What this half of the screen does: the stick or ENTER
   * (controlsOptions.touchscreen.halves). Which half is which is the
   * left-handed / right-handed choice in SETTINGS.
   * @param {string} side - 'left' or 'right'.
   * @returns {Object} {icon, zones}
   */
  touchHalf(side) {
    var ts = this.app.controlsOptions.touchscreen;
    return ts.halves[ts.types[this.app.controls.touchscreen.type][side].half];
  } // touchHalf

  /**
   * Icons into the border: what each half of the screen does. The border draws
   * them only where there is room for them outside the play area.
   */
  showTouchIcons() {
    if (!this.app.controls.touchscreen.supported || !this.borderEntity.setGameControlIcons) {
      return;
    }
    var icons = this.app.controlsOptions.touchscreen.icons;
    this.borderEntity.setGameControlIcons(icons[this.touchHalf('left').icon],
                                          icons[this.touchHalf('right').icon]);
  } // showTouchIcons

  /**
   * The zone of the layout under the finger. `rect` is a fraction of the half,
   * so it is worked out from where on that half the finger is, not from pixels.
   * @param {Object} event - The touch event (x, y).
   * @param {string} side - 'left' or 'right'.
   * @param {Object} entity - The half of the screen (borderEntity).
   * @returns {Object|false} The zone, or false.
   */
  touchZone(event, side, entity) {
    var half = this.touchHalf(side);
    var width = Math.max(entity.width, 1), height = Math.max(entity.height, 1);
    var rx = (event.x-(entity.parentX+entity.x))/width;
    var ry = (event.y-(entity.parentY+entity.y))/height;
    for (var z = 0; z < half.zones.length; z++) {
      var r = half.zones[z].rect;
      if (rx >= r[0] && rx <= r[0]+r[2] && ry >= r[1] && ry <= r[1]+r[3]) {
        return half.zones[z];
      }
    }
    return false;
  } // touchZone

  /**
   * A new touch on a half of the screen. There can be several at once: each
   * keeps its own record in `touchesGameControls` and the control state is
   * their sum, so walking and entering a hold go together.
   * @param {Object} event - The touch event.
   * @param {string} side - 'left' or 'right'.
   * @param {Object} entity - The half of the screen.
   */
  touchStart(event, side, entity) {
    var zone = this.touchZone(event, side, entity);
    var control = {side: side, entity: entity, action: false,
                   type: zone === false ? 'none' : zone.type,
                   control: zone === false ? false : zone.control,
                   actions: zone === false ? false : zone.actions,
                   tap: zone !== false && zone.type == 'button' && !!zone.tap,
                   since: this.app.now,
                   origin: {x: event.x, y: event.y},
                   at: {x: event.x, y: event.y}};
    this.app.inputEventsManager.touchesGameControls[event.identifier] = control;
    // A button holds its action from the moment the finger lands; the stick
    // does nothing until the finger moves, so a tap on it sends nothing.
    if (zone !== false && zone.type == 'button') {
      control.action = zone.action;
      this.setControl(zone.action, true);
    }
  } // touchStart

  /**
   * The finger came up. A short tap has to be **held**: the original reads
   * the keys once per pass of its main loop, and a pass takes up to 3.85
   * frames (disasm_notes.md §4), so a tap shorter than that would never be
   * seen at all.
   * @param {Object} event - The touch event.
   */
  touchEnd(event) {
    var controls = this.app.inputEventsManager.touchesGameControls;
    var control = controls[event.identifier];
    if (control === undefined) {
      return;
    }
    delete controls[event.identifier];
    if (control.action === false) {
      return;
    }
    var rest = this.app.controlsOptions.touchscreen.tapHoldTime-(this.app.now-control.since);
    if (control.tap && rest > 0) {
      this.heldTaps[control.action] = (this.heldTaps[control.action] || 0)+1;
      this.sendEvent(rest, {id: 'releaseTouchAction', action: control.action});
      return;
    }
    [].concat(control.action).forEach((action) => this.releaseTouchAction(action));
  } // touchEnd

  /**
   * Releases an action, but only when no other finger is still holding it —
   * two fingers on the same action must not cancel each other.
   * @param {string} action - The control action.
   */
  releaseTouchAction(action) {
    if (this.heldTaps[action]) {
      return;
    }
    var controls = this.app.inputEventsManager.touchesGameControls;
    var held = Object.keys(controls).some((id) => controls[id].action !== false
                                                  && [].concat(controls[id].action).indexOf(action) !== -1);
    if (!held) {
      this.setControl(action, false);
    }
  } // releaseTouchAction

  /**
   * The finger moved. The stick is **absolute**: the direction is where the
   * finger has moved to from where it landed, with a dead zone of
   * `joystickStep` in the middle. Both axes, because Jim walks left and
   * right and climbs up and down; ? whether the original takes two
   * directions at once is M3 — ROM `KEY-SCAN` returns one key
   * (disasm_notes.md §8), so the stick holds the stronger of the two axes
   * and never sends a diagonal the keyboard of the original could not.
   * @param {Object} event - The touch event.
   */
  touchMove(event) {
    var controls = this.app.inputEventsManager.touchesGameControls;
    var control = controls[event.identifier];
    if (control === undefined || control.type != 'joystick') {
      return;
    }
    control.at = {x: event.x, y: event.y};
    var step = this.app.controlsOptions.touchscreen.joystickStep;
    var dx = event.x-control.origin.x, dy = event.y-control.origin.y;
    var next = false;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > step) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        next = dx < 0 ? control.actions.left : control.actions.right;
      } else {
        next = dy < 0 ? control.actions.up : control.actions.down;
      }
    }
    if (next === control.action) {
      return;
    }
    var previous = control.action;
    control.action = next;
    if (previous !== false) {
      this.releaseTouchAction(previous);
    }
    if (next !== false) {
      this.setControl(next, true);
    }
  } // touchMove

  updateFps(timestamp) {
    if (!this.fpsEnabled) {
      return;
    }
    this.fps.frames++;
    if (this.fps.since === false) {
      this.fps.since = timestamp;
      return;
    }
    var elapsed = timestamp-this.fps.since;
    if (elapsed >= 1000) {
      this.borderEntity.setFps(Math.round(this.fps.frames*1000/elapsed)+'/'+Math.round(this.fps.workerFrames*1000/elapsed)+'/'+Math.round(this.fps.ticks*1000/elapsed)+' FPS');
      this.fps.frames = 0;
      this.fps.workerFrames = 0;
      this.fps.ticks = 0;
      this.fps.since = timestamp;
    }
  } // updateFps

  loopModel(timestamp) {
    super.loopModel(timestamp);

    if (this.desktopEntity.modalEntity) {
      this.desktopEntity.modalEntity.loopEntity(timestamp);
    }

    // R-045: counted before the needDraw branch, so the first number is how
    // often the loop runs, and R-037: the loop draws only when no worker
    // message has drawn since its last pass
    this.updateFps(timestamp);
    if (this.needDraw) {
      this.drawModel();
    }
    this.needDraw = true;
  } // loopModel

} // GameModel
