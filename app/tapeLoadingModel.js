const { AbstractModel } = await import('./svision/js/abstractModel.js?ver='+window.srcVersion);
const { BorderEntity } = await import('./borderEntity.js?ver='+window.srcVersion);
const { ZXVideoRAMEntity } = await import('./svision/js/platform/canvas2D/zx/zxVideoRAMEntity.js?ver='+window.srcVersion);
const { TextEntity } = await import('./svision/js/platform/canvas2D/textEntity.js?ver='+window.srcVersion);
const { ZXColor } = await import('./svision/js/platform/canvas2D/zx/zxColor.js?ver='+window.srcVersion);
// begin code

/**
 * Loading from tape, the way the original does it: `LOAD ""` typed on the ZX
 * keyboard, then the eight blocks of the Booty tape in its own order, each
 * with its own pilot, and the loading screen — the real one off the original
 * tape (data/global.json#loading, checked byte for byte against the SCREEN$ block,
 * against the .scr taken out of it and against the screen of a simulator
 * that has just loaded the tape: tools/matchloading.py, 112 128 checks, zero
 * differences).
 *
 * Every block is played as it is on the tape (audioManager.tapeBlockSound,
 * data/global.json#tape): the pilot, the sync pulses and the bytes it really
 * carries. The sound says when the pilot is over and when the block is over,
 * and the loading lives off those events rather than off a timer, so the
 * picture, the stripes and the sound cannot drift apart.
 *
 * The picture is not revealed, it is **loaded**: the sound sends an event
 * after every byte of the SCREEN$ block and the model writes that byte into
 * the video memory, so the picture appears at the speed of the sound because
 * it *is* the sound.
 *
 * ★ **What the screen shows is measured, not borrowed from the siblings**
 * (tools/traceloading.py — the simulated load of tools/mksnapshot.sh, the
 * screen read frame by frame and its text matched against the ROM font):
 *
 * - `Program: BOOTY` on row 1, black on white ($38), when the first header
 *   has gone by (frame 255 of the load, 5.09 s)
 * - when the first turbo block is in (frame 508, 10.1 s) the screen and the
 *   border go **black**: the new BASIC line 10 runs `BORDER 0: PAPER 0:
 *   INK 0: CLEAR 26870`, and CLEAR clears the screen with attribute $00 —
 *   except the lower screen, rows 22-23, which BORDER 0 makes white on black
 *   ($07)
 * - `Bytes: bs` is printed on row 1 with attribute $00, black on black:
 *   **invisible**
 * - and so is the picture's bitmap while it loads: every cell is $00, so the
 *   pixels go into the video memory unseen, except on rows 22-23 where they
 *   come up white; the picture appears only when its 768 attributes arrive
 *   at the end of the block
 * - `Bytes: bc` is printed at row 20, columns 0-8, where the loading screen
 *   has attribute $00 — invisible again, which is what `PRINT AT 19,0;` in
 *   the BASIC is for (tape_layout.md). The remake does not print it: not a
 *   pixel of it can be seen (tools/matchloading.py)
 *
 * ★ The tape (sources/docs/tape_layout.md): a BASIC header `BOOTY` and its
 * program, the **first turbo block** (71 bytes, 497 pilot pulses) that the
 * machine code hidden in line 65295 loads past the ROM, the header `bs` and
 * the SCREEN$ block, the header `bc` and 38 655 bytes of the game, and the
 * **second turbo block**, whose 62 bytes end up at $CD14. The code block is
 * cut short after its first kilobyte: the whole of it is three minutes and a
 * half, and the picture is already on the screen (ZADANI chap. 10).
 */
export class TapeLoadingModel extends AbstractModel {

  constructor(app) {
    super(app);
    this.id = 'TapeLoadingModel';

    this.inputLineEntity = null;
    this.commandPhase = 0;
    this.command = ['K', 'LOAD L', 'LOAD "L', 'LOAD ""L', ''];
    this.programNameEntity = null;
    this.screenEntity = null;
    this.app.stack.flashState = false;
    this.tapeBreak = false;
    // the BASIC loader is in (block 2) and line 1 has jumped into machine
    // code: from here on BREAK resets the whole machine, as in jetsetwilly
    // and as the real game does (operator's observation 2026-10-09,
    // tape_layout.md); before it the ROM reports `D BREAK - CONT repeats, 0:1`
    this.basicDone = false;
    this.tapePhase = false;
    this.tape = null;
  } // constructor

  /**
   * The tape as a script: the blocks in the order of the tape, the pauses
   * between them and what happens on the screen in between. The blocks come
   * out of data/global.json#tape, the pauses too — ? those are a property of the
   * TZX container rather than of the tape (tools/bootylib.py), so they are an
   * order of magnitude, not measured numbers.
   * @param {Object} tape - data/global.json#tape.
   * @returns {Object[]} The steps.
   */
  script(tape) {
    var b = tape.blocks;
    var pause = (n) => ({id: 'pause', duration: b[n-1].pauseMs});
    var block = (n, extra) => Object.assign({id: 'block', block: n, duration: b[n-1].durationMs}, extra || {});
    return [
      {id: 'pause', duration: 1000},
      // the ROM loads the BASIC: header, then the program
      block(1, {end: {id: 'setProgramName'}}),
      pause(1),
      block(2, {end: {id: 'runBasic'}}),
      // ★ line 1 jumps into the machine code of line 65295, which loads the
      // first turbo block straight after it (the TZX has no pause in between)
      block(3, {end: {id: 'runLine10'}}),
      pause(3),
      // LOAD "" SCREEN$
      block(4),
      pause(4),
      block(5),
      // PRINT AT 19,0;: LOAD "" CODE 26880
      pause(5),
      block(6),
      pause(6),
      block(7),
      // RANDOMIZE USR 26880: the same loader again, for the second turbo block
      block(8),
      // RANDOMIZE USR 52500: the game starts — the remake's menu takes over
      {id: 'pause', duration: 1000}
    ];
  } // script

  init() {
    super.init();

    this.borderEntity.bkColor = ZXColor.white;
    this.desktopEntity.bkColor = ZXColor.white;

    this.inputLineEntity = new TextEntity(this.desktopEntity, this.app.fonts.zxFonts8x8Mono, 0, 23*8, 32*8, 8, '© 1982 Sinclair Research Ltd', ZXColor.black, false, {align: 'left'});
    this.desktopEntity.addEntity(this.inputLineEntity);

    // ★ row 1, black on white ($38): tools/traceloading.py, frame 255
    this.programNameEntity = new TextEntity(this.desktopEntity, this.app.fonts.zxFonts8x8Mono, 0, 1*8, 32*8, 8, 'Program: BOOTY', ZXColor.black, false, {});
    this.programNameEntity.hide = true;
    this.desktopEntity.addEntity(this.programNameEntity);

    var tape = this.loadDataFile('tape');
    if (!tape || !this.loadDataFile('loading')) {
      this.inputLineEntity.setText('TAPE DATA MISSING (data/global.json#tape)');
      this.sendEvent(3000, {id: 'setMenuModel'});
      return;
    }
    this.tape = this.script(tape);

    this.sendEvent(0, {id: 'openAudioBus', bus: 'sounds', options: {}});
    this.sendEvent(1000, {id: 'updateCommand'});

    this.app.stack.flashState = false;
    this.sendEvent(330, {id: 'changeFlashState'});
  } // init

  newBorderEntity() {
    // no X in the border, like the other screens: a click or a touch anywhere
    // in the border is BREAK (handleEvent), a second one goes back to the menu,
    // and Escape or GamepadExit go back straight away
    return new BorderEntity(false, false);
  } // newBorderEntity

  shutdown() {
    super.shutdown();
    this.sendEvent(0, {id: 'closeAllAudioBuses'});
  } // shutdown

  /**
   * The next step of the tape.
   */
  nextStep() {
    if (this.tapeBreak) {
      return;
    }
    var step = this.tape[this.tapePhase];
    switch (step.id) {
      case 'block':
        this.sendEvent(0, {id: 'playSound', bus: 'sounds', sound: 'tapeBlock'+step.block, options: false});
        this.sendEvent(0, {id: 'setBorderAnimation', value: 'pilotTone'});
        // the block ends itself with `tapeBlockEnd`; this only catches a bus
        // that never got to play it
        this.sendEvent(step.duration+2000, {id: 'updateTape', fallback: true});
        return;
      case 'pause':
        this.sendEvent(0, {id: 'stopAudioBus', bus: 'sounds'});
        this.sendEvent(0, {id: 'setBorderAnimation', value: false});
        if (step.event) {
          this.sendEvent(0, step.event);
        }
        this.sendEvent(step.duration, {id: 'updateTape'});
        return;
    }
  } // nextStep

  /**
   * The step is over: what it leaves behind, and the step after it.
   */
  endStep() {
    this.cancelEvent('updateTape');
    var step = this.tape[this.tapePhase];
    if (step.end) {
      this.sendEvent(0, step.end);
    }
    this.tapePhase++;
    if (this.tapePhase < this.tape.length) {
      this.nextStep();
    } else {
      this.sendEvent(0, {id: 'setMenuModel'});
    }
  } // endStep

  handleEvent(event) {
    if (super.handleEvent(event)) {
      return true;
    }

    switch (event.id) {

      case 'changeFlashState':
        this.app.stack.flashState = !this.app.stack.flashState;
        this.sendEvent(330, {id: 'changeFlashState'});
        return true;

      case 'updateCommand':
        this.inputLineEntity.options.align = 'left';
        this.inputLineEntity.fonts = this.app.fonts.zxFonts8x8Mono;
        this.inputLineEntity.options.animationMode = 'flashReverseColors';
        this.inputLineEntity.setText(this.command[this.commandPhase]);
        this.inputLineEntity.options.flashMask = '';
        if (this.command[this.commandPhase].length > 0) {
          this.inputLineEntity.options.flashMask = this.inputLineEntity.options.flashMask.padStart(this.command[this.commandPhase].length-1, ' ')+'#';
        }
        this.commandPhase++;
        this.sendEvent(0, {id: 'playSound', bus: 'sounds', sound: 'keyboardSound', options: false});
        if (this.commandPhase < this.command.length) {
          this.sendEvent(800, {id: 'updateCommand'});
        } else {
          this.inputLineEntity.hide = true;
          this.tapePhase = 0;
          this.nextStep();
        }
        return true;

      case 'updateTape':
        if (!this.tapeBreak && this.tapePhase !== false) {
          this.endStep();
        }
        return true;

      case 'tapePilotEnd':
        if (!this.tapeBreak) {
          this.sendEvent(0, {id: 'setBorderAnimation', value: 'dataTone'});
        }
        return true;

      case 'tapeByte':
        // one byte off the tape, straight into the video memory; the entity
        // repaints itself on the next frame and nothing else is needed
        if (this.screenEntity && !this.tapeBreak) {
          this.screenEntity.pokeOffset(event.data.at, event.data.value);
        }
        return true;

      case 'tapeBlockEnd':
        var step = this.tapePhase === false ? null : this.tape[this.tapePhase];
        if (!this.tapeBreak && step && step.id == 'block' && step.block == event.data.block) {
          this.endStep();
        }
        return true;

      case 'setProgramName':
        this.programNameEntity.hide = false;
        return true;

      case 'runBasic':
        // ★ line 1 is `RANDOMIZE USR` into machine code: from here on BREAK
        // is not the ROM's to report — it resets (basicDone)
        this.basicDone = true;
        return true;

      case 'runLine10':
        // ★ BORDER 0: PAPER 0: INK 0: CLEAR 26870 — the screen and the border
        // go black (tools/traceloading.py, frame 508)
        if (this.programNameEntity) {
          this.programNameEntity.destroy();
          this.programNameEntity = null;
        }
        this.borderEntity.bkColor = ZXColor.black;
        this.desktopEntity.bkColor = ZXColor.black;
        // the video memory the picture loads into, as CLEAR left it: every
        // cell $00, black on black, except the lower screen (rows 22-23),
        // which BORDER 0 sets white on black ($07) — so the bitmap loads
        // unseen and only the attributes bring the picture up
        this.screenEntity = new ZXVideoRAMEntity(this.desktopEntity, 0, 0);
        this.screenEntity.clear(0, 0x00);
        this.screenEntity.videoRAM.fillAttributes({row: 22, col: 0, rows: 2, cols: 32}, 0x07);
        this.screenEntity.invalidate();
        this.desktopEntity.addEntity(this.screenEntity);
        return true;

      case 'setMenuModel':
        this.app.setModel('MenuModel');
        return true;

      case 'keyPress':
        switch (event.key) {
          case 'Escape':
          case 'GamepadExit':
            this.app.setModel('MenuModel');
            return true;
          case ' ':
          case 'Enter':
          case 'GamepadOK':
            if (this.break()) {
              return true;
            }
            break;
          case 'Mouse1':
          case 'Mouse2':
          case 'Mouse4':
            this.app.inputEventsManager.keysMap[event.key] = this.borderEntity;
            return true;
          case 'Touch':
            this.app.inputEventsManager.touchesMap[event.identifier] = this.borderEntity;
            return true;
        }
        break;

      case 'keyRelease':
        switch (event.key) {
          case 'Mouse1':
          case 'Mouse2':
          case 'Mouse4':
            if (this.app.inputEventsManager.keysMap[event.key] === this.borderEntity) {
              this.break();
            }
            return true;
          case 'Touch':
            if (this.app.inputEventsManager.touchesMap[event.identifier] === this.borderEntity) {
              this.break();
            }
            return true;
        }
        break;

      case 'errorAudioBus':
        this.app.showErrorMessage(event.error, 'reopen');
        return true;
    }

    return false;
  } // handleEvent

  /**
   * Stops the load the way BREAK does on the real machine, or leaves when the
   * tape is already stopped. Once the BASIC loader is in, it resets the whole
   * application, as the real game does (`basicDone`).
   * @returns {boolean} True when the event was consumed.
   */
  break() {
    if (this.tapeBreak) {
      this.app.setModel('MenuModel');
      return true;
    }

    if (this.tapePhase !== false) {
      if (this.basicDone) {
        this.app.setModel('LoadingModel');
        return true;
      }
      this.cancelEvent('updateTape');
      this.cancelEvent('setMenuModel');
      this.sendEvent(0, {id: 'stopAudioBus', bus: 'sounds'});
      this.tapeBreak = true;
      // whatever the tape has put into the video memory stays there; the
      // report is printed over it
      this.inputLineEntity.setText('D BREAK - CONT repeats, 0:1');
      this.inputLineEntity.hide = false;
      this.sendEvent(0, {id: 'setBorderAnimation', value: false});
      this.sendEvent(5000, {id: 'setMenuModel'});
      return true;
    }
    return false;
  } // break

  loopModel(timestamp) {
    super.loopModel(timestamp);

    this.drawModel();
  } // loopModel

} // TapeLoadingModel
