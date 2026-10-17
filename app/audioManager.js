const { AbstractAudioManager } = await import('./svision/js/audio/abstractAudioManager.js?ver='+window.srcVersion);
const { AudioWorkletHandler } = await import('./svision/js/audio/audioWorkletHandler.js?ver='+window.srcVersion);
const { AudioScriptProcessorHandler } = await import('./svision/js/audio/audioScriptProcessorHandler.js?ver='+window.srcVersion);
const { AudioSilentHandler } = await import('./svision/js/audio/audioSilentHandler.js?ver='+window.srcVersion);
const { Tool } = await import('./svision/js/tool.js?ver='+window.srcVersion);
const { ZXMachineSounds } = await import('./svision/js/platform/canvas2D/zxSpectrum/zxMachineSounds.js?ver='+window.srcVersion);
const { ZXVideoRAM } = await import('./svision/js/platform/canvas2D/zxSpectrum/zxVideoRAM.js?ver='+window.srcVersion);
const { BootySound } = await import('./bootySound.js?ver='+window.srcVersion);
// begin code

/**
 * Audio manager. The original has a one-bit beeper on bit 4 of port $FE and no
 * sound chip, so every sound is a stream of pulse lengths played by the svision
 * pulse handlers — the same way the machine makes sound, not sampled.
 *
 * ★ Booty plays a tune and sound effects **at once** — the tune out of the
 * table at $FA00 every fourth interrupt and four sound slots beside it, all
 * in the IM 2 handler (sources/docs/disasm_notes.md §2) — so the remake has
 * **three buses** over one AudioContext (MILNIKY M6) and **two volumes**
 * (the `volume` keys are the bus names, ZXVolumeEntity reads them so):
 *
 * - `music` — the tune of $FA00, its own volume,
 * - `sounds` — the one-off effects: explosion, door, key, booty, death …
 *   (`extra` is the siblings' side bus of effects and follows `sounds`),
 * - `animals` — the rats and the parrots; a bus of its own, so it can play
 *   beside the one-offs, but **the volume of `sounds`** (operator's
 *   decision 2026-10-07).
 *
 * ★ **Every sound is the original's, edge for edge** (M6): app/bootySound.js
 * runs the IM 2 handler `$FE69`, its routines and ROM `BEEPER` with the
 * T-states of every instruction out of data/global.json#sounds, and
 * tools/matchsound.mjs checks it against the original in a Z80 simulator —
 * every path of the handler, every OUT, and the tune on the title screen
 * interrupt for interrupt (the notes overrun interrupts, which are lost, and
 * that is the tune's rhythm). Here the edges become svision pulse data, as
 * manicminer makes its sounds:
 *
 * - `tune` (music): the table `$FA00` once round, played with `repeat`
 * - `creature1`, `creature2` (animals): `$FFFF` — the rat every 8th
 *   interrupt, the parrot every 16th — one round, with `repeat`
 * - `explosion1`, `explosion2` (extra): `$FFFD` — tone and noise, noise —
 *   128 and 64 interrupts with `repeat`; the noise is the ROM's bytes and its
 *   pointer goes on from one to the next as `$FE86` does
 * - `slot1`-`slot6`, `death` (sounds): `$FFFE` and `$FFFB`+`$FFFC`, once
 * - `beeper` (sounds): ROM `BEEPER` with the game's DE and HL
 * - `drown` (sounds): `$E361`, the rising water through the door into the
 *   sea, from the generator's state before it (4.5 s)
 *
 * ★ Who plays what and when is the handler's rule, kept by the worker
 * (gameWorker.js `interrupt`) and by `playFrame`: the one-shots follow one
 * another (on the machine the next waits for the handler or BEEPER before
 * it), and **the tune waits** while a creature or an explosion is on and
 * while a one-shot plays — the handler leaves before `$F6DB` then. The
 * split into buses is the remake's (on the machine it is all one bit of
 * $FE). ★ Muting the tune does not change the tempo (MILNIKY M6, decided
 * 2026-10-07), although the original's loop runs faster without it.
 *
 * ? Deviations: while a one-shot or BEEPER plays, the original's game
 * stands (both take the CPU, a death by a creature almost a second) and its
 * FRAMES stops; the remake's worker goes on. A continuous sound starts at
 * its own beginning, not at the phase `$FE88` happens to have.
 *
 * ★ **In M1 the only sounds here are the machine's and the tape's**: the key
 * click of the ROM (svision ZXMachineSounds) and the eight blocks of the tape
 * as data/global.json#tape has them — every block with its own pilot (★ the two
 * turbo blocks have **497 pulses** where the ROM writes 3223 or 8063, and
 * that is what is heard), its sync pulses, its bits and the bytes it really
 * carries. The SCREEN$ block is the picture itself (data/global.json#loading), so
 * the picture is not an animation of a load, it **is** the load.
 *
 */
export class AudioManager extends AbstractAudioManager {

  constructor(app) {
    super(app);
    this.id = 'AudioManager';
    this.volume = {};
    this.volume.music = this.readVolume('audioBusMusicLevel', 2);
    this.volume.sounds = this.readVolume('audioBusSoundsLevel', 5);
    // the original's sound (bootySound.js), made when data/global.json#sounds is there
    this.bootySound = null;
    this.resetGameSounds();
  } // constructor

  /** the state of the game's sounds between frames (playFrame) */
  resetGameSounds() {
    this.creature = 0;
    this.explosion = 0;
    // when the one-shots queued so far end (app.now, ms)
    this.oneShotEnd = 0;
    this.musicHeld = false;
  } // resetGameSounds

  /**
   * The original's sound machine out of data/global.json#sounds; null without it.
   * @returns {BootySound|null}
   */
  sound() {
    if (this.bootySound === null) {
      var data = this.loadDataFile('sounds');
      if (data && data.tune) {
        this.bootySound = new BootySound(data);
      }
    }
    return this.bootySound;
  } // sound

  /**
   * The volume of a bus as the volume dialog stored it.
   * @param {string} cookie - The cookie name.
   * @param {number} defaultLevel - The level without a cookie, 0-10.
   * @returns {number} The level, 0-10.
   */
  readVolume(cookie, defaultLevel) {
    return Math.min(10, Math.max(0, Math.round(Number(Tool.readCookie(cookie, defaultLevel)))));
  } // readVolume

  /**
   * The volume of a bus.
   * @param {string} bus - The bus name.
   * @returns {number} The level, 0-10.
   */
  busVolume(bus) {
    switch (bus) {
      case 'music':
        return this.volume.music;
    }
    // sounds, extra, animals
    return this.volume.sounds;
  } // busVolume

  /**
   * Reads a data file delivered with appData; see {@link Tool.loadDataFile}.
   * @param {string} key - The data file name without its extension.
   * @returns {Object|null} The parsed content, or null.
   */
  loadDataFile(key) {
    return Tool.loadDataFile(key);
  } // loadDataFile

  /**
   * One block of the tape as it sounds: the pilot, the two sync pulses, every
   * bit of the bytes the block carries and the terminating pulse — in the
   * block's own timing out of data/global.json#tape (tools/mktape.py), played by
   * svision's ZXMachineSounds.tapeBlock.
   *
   * Three events come with it, and the tape loading lives off them rather
   * than off a timer, so the picture and the stripes cannot drift away from
   * the sound:
   *
   * - `tapePilotEnd` when the pilot is over — the stripes change,
   * - `tapeByte` after every byte of the SCREEN$ block, with its offset in
   *   the video memory (`at`) and its value — the byte goes into the picture,
   * - `tapeBlockEnd` when the block is over — the tape moves on.
   *
   * ★ The SCREEN$ block is the 6912 bytes of data/global.json#loading between the
   * flag $FF and the XOR checksum, all three on the tape as the ROM wrote
   * them. Nothing is sped up: 6912 bytes take thirty-three seconds, as they
   * do on the machine. The code block is the one exception: it would take
   * three minutes and a half, and data/global.json#tape carries only its first
   * kilobyte, which ends it (ZADANI chap. 10).
   *
   * ? The sync pulses are the ROM's, 667/735 T, also for the turbo blocks:
   * our dump has 875/525, a second dump of the same tape 667/735 at
   * identical data, so it is a property of the dump, not of the tape
   * (tape_layout.md). The loader does not measure them closely either.
   *
   * @param {number} sampleRate - The audio context sample rate.
   * @param {number} level - Bus volume level.
   * @param {number} number - The block, 1-8 in the order of the tape.
   * @returns {Object|boolean} svision pulse data, or false with no data file.
   */
  tapeBlockSound(sampleRate, level, number) {
    var tape = this.loadDataFile('tape');
    if (!tape || !tape.blocks || !tape.blocks[number-1]) {
      return false;
    }
    var block = tape.blocks[number-1];
    var bytes = null;
    var picture = false;
    if (block.bytesIn) {
      var loading = this.loadDataFile(block.bytesIn);
      if (!loading) {
        return false;
      }
      var screen = ZXVideoRAM.decode(loading.videoRAM);
      bytes = new Uint8Array(screen.length+2);
      bytes[0] = block.flag;
      var check = block.flag;
      for (var i = 0; i < screen.length; i++) {
        bytes[i+1] = screen[i];
        check ^= screen[i];
      }
      bytes[bytes.length-1] = check;
      picture = true;
    } else {
      bytes = ZXMachineSounds.dataBytes(block.bytes);
    }

    var options = {pilotEndEvent: 'tapePilotEnd', endEvent: 'tapeBlockEnd',
                   eventData: {block: number}};
    if (picture) {
      // the flag and the checksum are on the tape, not in the picture
      Object.assign(options, {byteEvent: 'tapeByte', firstEventByte: 1,
                              lastEventByte: bytes.length-2});
    }
    return ZXMachineSounds.tapeBlock(sampleRate, level, block, bytes, options);
  } // tapeBlockSound

  createAudioHandler(bus, options) {
    var audioHandler = false;

    var volume = this.volumeLevel(this.busVolume(bus));

    if (options.audioSilentHandler != 'disable' && volume == 0.0) {
      return new AudioSilentHandler(this.app);
    }

    if (this.unsupportedAudioBus == false) {
      this.unsupportedAudioBus = Tool.readCookie('unsupportedAudioBus', false);
    }

    switch (this.unsupportedAudioBus) {
      case false:
        audioHandler = new AudioWorkletHandler(this.app);
        break;
      case 'AudioWorkletHandler':
        Tool.writeCookie('unsupportedAudioBus', 'AudioWorkletHandler');
        audioHandler = new AudioScriptProcessorHandler(this.app);
        break;
      case 'AudioScriptProcessorHandler':
        Tool.writeCookie('unsupportedAudioBus', 'AudioScriptProcessorHandler');
        audioHandler = new AudioSilentHandler(this.app);
        break;
    }

    if (bus in this.restartSounds) {
      this.app.model.sendEvent(1, {id: 'playSound', bus: bus, sound: this.restartSounds[bus].sound, options: this.restartSounds[bus].options});
    }

    return audioHandler;
  } // createAudioHandler

  audioData(bus, sound, options) {
    var data = super.audioData(bus, sound, options);
    if (data !== false) {
      return data;
    }

    var sampleRate = this.getSampleRate();
    var level = this.volumeLevel(this.busVolume(bus));
    var tapeBlock = /^tapeBlock(\d+)$/.exec(sound);
    if (tapeBlock) {
      return this.tapeBlockSound(sampleRate, level, Number(tapeBlock[1]));
    }
    switch (sound) {
      case 'keyboardSound': return ZXMachineSounds.keyClick(sampleRate, level);
    }
    var made = this.gameSound(sound, options);
    if (!made) {
      return false;
    }
    var data = BootySound.pulses(made.outs, sampleRate, made.loop ? made.length : undefined);
    data.volume = level;
    if (made.cache) {
      this.audioDataCache[bus][sound] = data;
    }
    return data;
  } // audioData

  /**
   * A sound of the game as the original makes it (bootySound.js), in T.
   * @param {string} sound - The name (see the class comment).
   * @param {Object} [options] - `de`, `hl` for 'beeper'; `list` for
   *        'sequence' (one-shots one after another).
   * @returns {{outs: Array, length: number, loop: boolean, cache: boolean}|false}
   */
  gameSound(sound, options) {
    var bs = this.sound();
    if (!bs) {
      return false;
    }
    var made = null;
    var slot = /^slot([1-6])$/.exec(sound);
    if (slot) {
      return Object.assign(bs.once({fffe: Number(slot[1])}), {cache: true});
    }
    switch (sound) {
      case 'tune':
        return Object.assign(bs.tuneLoop(), {loop: true, cache: true});
      case 'tuneExample':
        // the MUSIC dialog's sample: the whole tune once round, to its end
        // ($FF), without the repeat
        return Object.assign(bs.tuneLoop(), {cache: true});
      case 'creature1':
      case 'creature2':
        var kind = sound.slice(-1);
        return Object.assign(bs.continuous('ffff', Number(kind), bs.slots.creature[kind].mask+1),
                             {loop: true, cache: true});
      case 'explosion1':
        return Object.assign(bs.continuous('fffd', 1, 128), {loop: true});
      case 'explosion2':
        return Object.assign(bs.continuous('fffd', 2, 64), {loop: true});
      case 'explosionExample':
        // the SOUNDS dialog's sample: the whole explosion, once — the fuse
        // ($FFFD = 1) shortened to 48 interrupts (in the game it burns some
        // 16 passes) and the blast itself ($FFFD = 2), 16 interrupts. ? The
        // lengths are the remake's choice for a sample, not measured
        var fuse = bs.continuous('fffd', 1, 48);
        var blast = bs.continuous('fffd', 2, 16);
        return {outs: fuse.outs.concat(blast.outs.map((o) => [o[0]+fuse.length, o[1]])),
                length: fuse.length+blast.length};
      case 'death':
        return Object.assign(bs.once({fffb: 1, fffc: 1}), {cache: true});
      case 'beeper':
        return bs.beeper(options.de, options.hl);
      case 'drown':
        return bs.drown(options.seed);
      case 'sequence':
        // one-shots one after another, as the machine plays them
        var outs = [], length = 0;
        (options.list || []).forEach((item) => {
          var one = this.gameSound(item.sound, item);
          if (one) {
            one.outs.forEach((o) => outs.push([o[0]+length, o[1]]));
            length += one.length;
          }
        });
        return {outs: outs, length: length};
    }
    return false;
  } // gameSound

  /**
   * Whether a sound of the game can be played: data/global.json#sounds is there.
   * @param {string} sound - The sound name, e.g. 'tune'.
   * @returns {boolean}
   */
  hasSound(sound) {
    return this.sound() !== null;
  } // hasSound

  /**
   * How long a one-shot of a frame takes on the machine, in ms.
   * @param {Object} item - {sound, de?, hl?}.
   * @returns {number}
   */
  oneShotLength(item) {
    var bs = this.sound();
    if (!bs) {
      return 0;
    }
    var made;
    if (item.sound == 'beeper') {
      made = bs.beeper(item.de, item.hl);
    } else if (item.sound == 'drown') {
      made = bs.drown(item.seed);
    } else if (item.sound == 'death') {
      made = bs.once({fffb: 1, fffc: 1});
    } else {
      made = bs.once({fffe: Number(item.sound.slice(4))});
    }
    return made.length/(BootySound.CLOCK/1000);
  } // oneShotLength

  volumeLevel(volume) {
    var levels = [0, 0.005, 0.01, 0.02, 0.04, 0.07, 0.1, 0.14, 0.18, 0.23, 0.29];
    return levels[volume];
  } // volumeLevel

  /**
   * One worker frame: what the game did in it, as sound
   * (WORKER-PROTOCOL.md).
   *
   * - `sounds[]`: the one-shots — BEEPER, `$FFFE` 1-6, death — on `sounds`,
   *   ★ one after another: the next starts when the one before ends, as on
   *   the machine, where BEEPER keeps the interrupts off and the handler
   *   plays its slot to the end
   * - `creature`, `explosion`: the continuous slots, started when they come
   *   on and stopped when they go off (`animals`, `extra`)
   * - ★ the tune waits while either is on or a one-shot plays: the handler
   *   leaves before `$F6DB` then
   * @param {Object} frame - The 'frame' message from the worker.
   */
  playFrame(frame) {
    var model = this.app.model;
    if (!this.sound() || !model) {
      return;
    }
    var now = this.app.now;
    var list = [];
    (frame.sounds || []).forEach((event) => {
      switch (event.id) {
        case 'beeper':
          list.push({sound: 'beeper', de: event.de, hl: event.hl});
          break;
        case 'drown':
          list.push({sound: 'drown', seed: event.seed});
          break;
        case 'slot':
          list.push({sound: 'slot'+event.value});
          break;
        case 'death':
          list.push({sound: 'death'});
          break;
      }
    });
    if (list.length) {
      var start = Math.max(now, this.oneShotEnd);
      var length = list.reduce((sum, item) => sum+this.oneShotLength(item), 0);
      var play = (list.length == 1 && list[0].sound != 'beeper' && list[0].sound != 'drown')
        ? {id: 'playSound', bus: 'sounds', sound: list[0].sound, options: false}
        : {id: 'playSound', bus: 'sounds', sound: 'sequence', options: {list: list}};
      model.sendEvent(Math.max(0, Math.round(start-now)), play);
      this.oneShotEnd = start+length;
    }

    if ('creature' in frame && frame.creature !== this.creature) {
      this.creature = frame.creature;
      if (this.creature == 1 || this.creature == 2) {
        model.sendEvent(0, {id: 'playSound', bus: 'animals', sound: 'creature'+this.creature, options: {repeat: true}});
      } else {
        model.sendEvent(0, {id: 'stopAudioBus', bus: 'animals'});
      }
    }
    if ('explosion' in frame && frame.explosion !== this.explosion) {
      this.explosion = frame.explosion;
      if (this.explosion == 1 || this.explosion == 2) {
        model.sendEvent(0, {id: 'playSound', bus: 'extra', sound: 'explosion'+this.explosion, options: {repeat: true}});
      } else {
        model.sendEvent(0, {id: 'stopAudioBus', bus: 'extra'});
      }
    }

    var hold = this.creature != 0 || this.explosion != 0 || now < this.oneShotEnd;
    if (hold != this.musicHeld && 'music' in this.buses) {
      this.musicHeld = hold;
      if (hold) {
        this.pauseBus('music');
      } else {
        this.continueBus('music');
      }
    }
  } // playFrame

} // AudioManager
