const { Version } = await import('./version.js?ver='+window.srcVersion);
const { AbstractApp } = await import('./svision/js/abstractApp.js?ver='+window.srcVersion);
const { AudioManager } = await import('./audioManager.js?ver='+window.srcVersion);
const { ZXFonts8x8 } = await import('./svision/js/platform/canvas2D/zxSpectrum/zxFonts8x8.js?ver='+window.srcVersion);
const { Fonts5x5 } = await import('./svision/js/platform/canvas2D/fonts5x5.js?ver='+window.srcVersion);
const { Fonts3x3 } = await import('./svision/js/platform/canvas2D/fonts3x3.js?ver='+window.srcVersion);
const { ZXResetModel } = await import('./svision/js/platform/canvas2D/zxSpectrum/zxResetModel.js?ver='+window.srcVersion);
const { MenuModel } = await import('./menuModel.js?ver='+window.srcVersion);
const { MainModel } = await import('./mainModel.js?ver='+window.srcVersion);
const { SubMenuModel } = await import('./subMenuModel.js?ver='+window.srcVersion);
const { GameModel } = await import('./gameModel.js?ver='+window.srcVersion);
const { SubGameModel } = await import('./subGameModel.js?ver='+window.srcVersion);
const { GameOverModel } = await import('./gameOverModel.js?ver='+window.srcVersion);
const { TapeLoadingModel } = await import('./tapeLoadingModel.js?ver='+window.srcVersion);
const { ZXErrorEntity } = await import('./svision/js/platform/canvas2D/zxSpectrum/zxErrorEntity.js?ver='+window.srcVersion);
const { Tool } = await import('./svision/js/tool.js?ver='+window.srcVersion);
const { ZXColor } = await import('./svision/js/platform/canvas2D/zxSpectrum/zxColor.js?ver='+window.srcVersion);
// begin code

/**
 * Booty application shell (M1 skeleton, built on the Booty and Jetpac
 * ones — a ZX game on ZXSpectrumPlatform with a worker).
 * LoadingModel -> MenuModel -> GameModel (the game) -> GameOverModel, plus
 * SubGameModel (the original's hidden CATCH 20 GOLDFISH, SECRET SUB GAME),
 * TapeLoadingModel and SubMenuModel (HALL OF FAME, SOUNDS, MUSIC, SETTINGS,
 * ABOUT GAME) off the menu.
 *
 * ★ **LOAD TAPE is one of the ways to start**, not a decoration: the tape
 * carries a SCREEN$ block (`bs`, 6912 bytes at $4000) and the remake loads
 * that picture for real, byte by byte, because the sound *is* those bytes —
 * and the two turbo blocks with their short pilot are played as the tape has
 * them (tapeLoadingModel.js, data/global.json#tape, data/global.json#loading).
 *
 * What the original's own menu offers is ★ measured, read off the running
 * original (tools/playtrace.py, frame 290; sources/docs/screen_layout.md):
 *
 * - `1 - KEYBOARD`, `2 - INTERFACE 2 JOYSTICK`, `3 - CURSOR JOYSTICK`,
 *   `4 - KEMPSTON JOYSTICK`, `5 - DEFINE KEYS`, `0 - START GAME`
 * - DEFINE KEYS: `5 - LEFT`, `8 - RIGHT`, `7 - UP`, `6 - DOWN`,
 *   `A - ENTER ROOM`
 *
 * So **there is no two-player game** (the remake offers none either) and the
 * game is played with **five keys, none of them a jump**. Two more are fixed
 * in the program and cannot be redefined: `M` turns the tune on and off and
 * `P` pauses (disasm_notes.md §8). The remake keeps `M`; its pause is Escape
 * and the X in the border, so `P` is not among its keys.
 *
 * The remake's defaults are the arrows and SPACE, as in the sibling remakes,
 * and **every key comes from SETTINGS** — nothing is accepted beside the
 * configured keys, so the remap dialog always tells the truth.
 *
 * ★ The original plays a tune and sound effects **at once** — the tune in
 * the IM 2 handler, four sound slots beside it (disasm_notes.md §2) — which
 * is the condition R-024 reopens on. Until M6 decides, there is one bus and
 * one volume.
 *
 * ? Whether the original has a hall of fame of its own is **not measured**
 * (ZADANI chap. 9, question 14), and it has no score in points on its panel
 * (chap. 6). The remake keeps the table the siblings have; what it ranks by
 * is M4, and if the original has none it is a deviation (ZADANI chap. 10).
 */
export class GameApp extends AbstractApp {

  /**
   * ★ The original's menu has no two-player game — the remake has one player
   * and nothing to choose (tools/playtrace.py, frame 290).
   */
  static get PLAYERS() { return [1]; }

  constructor(platform, importPath, wsURL, devModeName, appIconSprite) {
    super(platform, 'bodyApp', importPath, wsURL);

    this.worker = new Worker(this.importPath+'/gameWorker.js?ver='+window.srcVersion);
    this.worker.onmessage = (event) => {
      if (this.model) {
        this.model.handleWorkerMessage(event);
      }
    };
    // the hidden game's own (subGameModel.js); each worker stands while the
    // other one plays, so both go to the model of the moment
    this.subGameWorker = new Worker(this.importPath+'/subGameWorker.js?ver='+window.srcVersion);
    this.subGameWorker.onmessage = (event) => {
      if (this.model) {
        this.model.handleWorkerMessage(event);
      }
    };

    this.version = Version;
    this.copyright = 'REMAKE BY LIBOR MITRENGA, CC BY-NC-SA 4.0';
    this.devModeName = devModeName;
    this.appIconSprite = appIconSprite;

    this.audioManager = new AudioManager(this);
    // two switches over the three buses (audioManager.js): `music` mutes the
    // tune, `sounds` the effects and the creatures with them (mutedBuses)
    this.muted = {music: false, sounds: false};

    // These are the **remake's** fonts — menus, dialogs, settings — and
    // they are svision's, ZX ROM font and all. ★ The game prints its own
    // texts — the panel, its menu, DEFINE KEYS — in the **ROM font** too:
    // every lettered cell matches the ROM's characters at $3D00 byte for byte
    // (sources/docs/screen_layout.md). So the remake's menu in zxFonts8x8 is
    // the very font the original's menu is in.
    this.fonts = {
      zxFonts8x8Mono: new ZXFonts8x8(this, false),
      zxFonts8x8: new ZXFonts8x8(this, true),
      zxFonts8x8Keys: new ZXFonts8x8(this, false),
      zxFonts8x8Title: new ZXFonts8x8(this, true),
      fonts5x5: new Fonts5x5(this),
      fonts3x3: new Fonts3x3(this)
    };
    // the title font (GameInfoEntity.gameTitle) the sibling remakes share:
    // the font of Cimmerjan (1993, Sindicato del Software),
    // svision/fonts/cimmerjan.ch8.hex.txt
    this.fonts.zxFonts8x8Title.setFontsData('0000000000000000181818181800180000363624000000000000000000000000000000000000000000626408102646000038603762623C000018306000000000000C181818180C000030181818183000000000000000000000000000000000000000000000181830000000007E00000000000000000030300000000000000000003C6E6E76763C000018381818183C00003C660E3C707E00003C660C06663C00000C1C2C4C7E0C00007C607C06663C00003C607C66663C00007E060C0C181800003C663C66663C00003C66663E063C00000018180018180000001818001818300000000000000000000000047E0400000000000000000000003C660C1800180000000000000000005C7666667E667600DC76667C6676DC000E3240C0C2E67C00E070686C6666FC00FE60FC60607AC600C67A6060FC6060000E3060C6CEF66E00C0606C7E7666C2003818181818183C007618189898D87000E66870786C64F6007030303030323E0044EEFED6D6D64400CCD6D6E6C4C8DE001C3666C6C67C3800F86C66766C60F0003E6CCCDC6C0C1E00EE72666C786CE6003C66603C86C67C00EE3C7060666C3800F62646CED6D66600E6646868707060003462C2CADA7E2400C66C3838386CC600CCCE4E3606CC78007E460C1830627E000018001818181818DFCCD3E3C6C8D6000018001830663C00000000000000000000000000000000FF0000000000000000003E6646464E3600006E76647C667C00003E626060623E00780C3E6666663C00003C666C7E603E00006E726060F86060003A6E663E26663C00606C7666646E000C00381818181C00003E0606664E3C0000666468786C66003030303030303C00005A756D696A6B00005C766262646E0000003E6363633E00006C7666667C606000366E666E3E0606006C76666C786E00003C603C06663C000030FE6060623C0000662666466E36000076366262663C0000EB6BCBDBD36D0000663C18183C660000666426361C7800007E060C18307E00309F3FFF00FFFFFF3E5C766262646E0066006626466E360000000000000000003C429DB1B19D423C');
    // the keycap font of the on-screen keyboard (ZXPlayerNameEntity), the same
    // glyphs as in the other games
    this.fonts.zxFonts8x8Keys.setFontsData('00000000000000000010101010001000002424000000000014147E28FC505000107C507C14547C1042A44810244A8400001028102A443A00000810000000000000182020202018000030080808083000000014083E081400000008083E0808000000000000080810000000003E00000000000000001818000204081020408000007C4C5454647C000018280808083E00007C440438407C00007C441804447C00001828487E081C00007C407C04447C00007C407C44447C00007C440810101000007C443844447C00007C44447C047C000000001000001000000010000010102000000408100804000000003E003E00000000100804081000007C441C100010003C42BD85BDA5BE78003C42427E42E70000FC427C4242FC00007E424040427E0000FE42424242FE0000FE42784042FE0000FE42784040E000007E42404E427E0000E7427E4242E700007C101010107C00007E08080848780000E648705844E60000E040404242FE0000C3665A4242E70000C762524A46E700007E424242427E0000FE42427E40E000007E424242527E0800FE42427E44E700007E407E02427E0000FE92101010380000CE444444447E0000E742424224180000D7929292926C0000EE44382844EE0000EE442810103800007E440810227E001C10101010101C0000004020100804003808080808083800001038541010100000000000000000FF003C247020207C0000007C047C447E00C0407C4444447C0000007C4440407C000C047C4444447E0000007C447C407C003C2470202020700000007C44447C047CC0407C444444E6001000701010107C000800380808084878C0404C506058CC007010101010107C000000FC545454D6000000FC444444E60000007C4444447C0000007E22223E207000007C44447C040600007C242020700000007C407C04FC0000207820202038000000CC4444447E000000CE44442838000000D65454547E000000C6281028C6000000CC44447C047C00007E4418227E00000E083008080E0000080808080808000070100C1010700000142800000000003C4299A1A199423C');
    // Extra glyphs + hard/short spaces live in the game (svision core fonts are ASCII + normal space).
    this.fonts.fonts5x5.addGlyphs({
      'Ⓥ': {width: 3, data: [[0,2,1,1], [0,3,1,1], [1,4,1,1], [2,3,1,1], [2,2,1,1]]},
      '←': {width: 6, data: [[0,2,6,1], [1,1,1,3], [2,0,1,5]]},
      '↓': {width: 5, data: [[2,0,1,5], [1,3,3,1], [0,2,5,1]]},
      '↑': {width: 5, data: [[2,0,1,5], [1,1,3,1], [0,2,5,1]]},
      '→': {width: 6, data: [[0,2,6,1], [4,1,1,3], [3,0,1,5]]},
      // blinking cursor for the key-remap screen
      '█': {width: 4, data: [[0,0,4,5]]},
      // devModeName banner decoration
      '◢': {width: 4, data: [[4,0,1,1], [3,1,2,1], [2,2,3,1], [1,3,4,1], [0,4,5,1]]},
      '◤': {width: 4, data: [[0,0,5,1], [0,1,4,1], [0,2,3,1], [0,3,2,1], [0,4,1,1]]}
    });
    this.fonts.fonts5x5.addSpace('␣', {width: 2, breaking: false, stretch: true});

    this.fonts.zxFonts8x8.addGlyphs('‗⋅', '000000000000F8F80000000030000000');
    // the 16 x 16 close cross of the panel button (GameInfoEntity.pauseButton):
    // a bold X, symmetric about both axes, in four 8 x 8 quarters — top left,
    // top right, bottom left, bottom right — set as two lines of two glyphs
    this.fonts.zxFonts8x8Mono.addGlyphs('◰◳◱◲', '3078FC7E3F1F0F070C1E3F7EFCF8F0E0070F1F3F7EFC7830E0F0F8FC7E3F1E0C');
    this.fonts.zxFonts8x8.addSpace('␣', {width: 3, breaking: false, stretch: false});
    this.fonts.zxFonts8x8.addSpace('▭', {width: 4, breaking: false, stretch: false});

    // ★ The original offers KEYBOARD, INTERFACE 2, CURSOR and KEMPSTON
    // JOYSTICK and DEFINE KEYS for five actions: LEFT, RIGHT, UP, DOWN and
    // ENTER ROOM (its own DEFINE KEYS screen). The labels are its words.
    // `M` is fixed in the program (disasm_notes.md §8) and is remappable
    // here only because a browser keyboard is not a Spectrum's. The
    // original's `P` (pause) is not a key of the remake: Escape and the X in
    // the border open the pause panel (gameModel.js).
    this.controlsOptions = {
      keyboard: {
        device: 'keyboard',
        keys: [
          {action: 'left', label: 'LEFT'},
          {action: 'right', label: 'RIGHT'},
          {action: 'up', label: 'UP'},
          {action: 'down', label: 'DOWN'},
          {action: 'enter', label: 'ENTER ROOM'},
          {action: 'music', label: 'MUTE MUSIC'},
          {action: 'sounds', label: 'MUTE SOUNDS'}
        ]
      },
      gamepads: {
        device: 'gamepads',
        keys: [
          {action: 'left', label: 'LEFT', eventKey: 'GamepadLeft'},
          {action: 'right', label: 'RIGHT', eventKey: 'GamepadRight'},
          {action: 'up', label: 'UP', eventKey: 'GamepadUp'},
          {action: 'down', label: 'DOWN', eventKey: 'GamepadDown'},
          {action: 'enter', label: 'ENTER ROOM', eventKey: 'GamepadFire'},
          // the buttons of the menu, the dialogs and the tape loading listen
          // to GamepadOK (like manicminer, jetsetwilly)
          {action: 'ok', label: 'OK', eventKey: 'GamepadOK'},
          {action: 'exit', label: 'EXIT', eventKey: 'GamepadExit'}
        ]
      },
      // ★ Touch controls are part of M1, not of a later milestone. That is the
      // lesson of Underwurlde, where they were put off and left a hole (M5b),
      // confirmed by Sabre Wulf and Jetpac.
      //
      // One half of the screen is a **stick** — left and right to walk, up
      // and down to climb — the other the **ENTER ROOM** button. Not a jump
      // button: ★ the original has no jump key (its DEFINE KEYS), which is
      // also why ZADANI chap. 8's "stick + jump" does not apply here. Which
      // half is which is the left-handed / right-handed choice in SETTINGS.
      touchscreen: {
        device: 'touchscreen',
        types: {
          // default is ENTER on the left and the stick on the right; the
          // first key is also the fallback for a broken cookie
          keys: [
            'leftEnter',
            'rightEnter'
          ],
          rightEnter: {
            left: {half: 'stick', sprite: 'stick'},
            right: {half: 'enter', sprite: 'enter'}
          },
          leftEnter: {
            left: {half: 'enter', sprite: 'enter'},
            right: {half: 'stick', sprite: 'stick'}
          }
        },
        // What each half does. `rect` is a fraction of that half
        // ([x, y, width, height]), so the layout does not depend on how big
        // the half happens to be — a phone gets the same thing upright and on
        // its side.
        halves: {
          // both axes, one direction at a time (gameModel.touchMove): ROM
          // KEY-SCAN, which the original reads its keys through, returns one
          // key (disasm_notes.md §8)
          stick: {
            icon: 'stick',
            zones: [
              {rect: [0, 0, 1, 1], type: 'joystick', control: 'both',
               actions: {left: 'left', right: 'right', up: 'up', down: 'down'}}
            ]
          },
          enter: {
            icon: 'enter',
            zones: [
              {rect: [0, 0, 1, 1], type: 'button', action: 'enter', tap: true}
            ]
          }
        },
        // A short tap has to be seen by the game: the original reads the keys
        // once per pass of its main loop, and a pass takes up to 3.85 frames
        // (disasm_notes.md §4) — 77 ms; the tap is held longer than that.
        tapHoldTime: 120,
        // how far the finger has to move before the stick changes direction
        joystickStep: 10,
        icons: {
          // the four arrows for the stick are a control glyph of the svision
          // family (the same one the sibling remakes use)
          stick: {
            compressedSpriteData: 'lP101300N0E2P0111030Z051012320B0P020N0601234561718191AB9BCDB1BDCB9BA19181716543210'
          },
          enter: {
            // ? **A plain button, on purpose.** Sabre Wulf puts its own sword
            // here and Lunar Jetman its own Jetman, because both had their
            // sprites out of the program by then. Booty's are M2 — the door
            // of a hold would be the natural picture, and it will come out of
            // the program's own set at $934C, not be drawn here. Until then a
            // disc, the remake's own furniture like the stick glyph, on the
            // same 39x23 canvas so both icons take the same room.
            width: 39, height: 23, frames: 1, directions: 1,
            sprite: [[
              '---------------------------------------',
              '------------------####-----------------',
              '----------------##----##---------------',
              '---------------#--------#--------------',
              '--------------#----------#-------------',
              '--------------#----------#-------------',
              '-------------#------------#------------',
              '-------------#------------#------------',
              '-------------#------------#------------',
              '-------------#------------#------------',
              '-------------#---##-------#------------',
              '-------------#--####------#------------',
              '-------------#--####------#------------',
              '-------------#---##-------#------------',
              '-------------#------------#------------',
              '-------------#------------#------------',
              '-------------#------------#------------',
              '-------------#------------#------------',
              '-------------#------------#------------',
              '-------------#------------#------------',
              '-------------##############------------',
              '---------------------------------------',
              '---------------------------------------'
            ]]
          }
        }
      }
    };

    this.controls = {
      keyboard: this.getControls('keyboard'),
      touchscreen: this.getControls('touchscreen'),
      gamepads: this.getControls('gamepads')
    };

    this.players = GameApp.PLAYERS[0];
    // ★ three lives: $DEB0 writes 3 to $5BF1 when a game starts
    // (disasm_notes.md §8); the worker carries them, the panel is drawn out
    // of the original's own bytes in M1
    this.lives = 3;
    this.score = 0;
    this.score2 = 0;
    this.hiScore = 0;
    this.player = 1;
    this.level = 0;
    // ★ the seed of the game's randomness is the state of the original's
    // generator at $F343 (disasm_notes.md §5): $0000 after the tape has
    // loaded, and **not** reset between games — the game model carries it
    // over from one game to the next, as the machine does. Tools and the
    // regression pass their own.
    this.gameSeed = 0x0000;
    // the ships and the sand of the hidden game (GoldfishLogic#scenery), as
    // the menu or SECRET SUB GAME left them, so the other goes on from there;
    // null until one of them has run
    this.goldfishScenery = null;
    // ★ the state of the title's sea generator $D8D4 at $D86F (titleSea.js):
    // data/global.json#title's at the first visit, then on from the last one;
    // undefined = take it from the data
    this.titleSeed = undefined;
    // the title's tune is already playing (back from the demo): not again
    this.keepTune = false;
    this.playerName = Tool.readCookie('playerName', '');
    this.globalData = false;
    this.id = 'GameApp';
    this.fetchDataId = '';
    this.setModel('LoadingModel');
    this.loadAppData();
  } // constructor

  /**
   * The buses a mute switch silences: `music` the tune, `sounds` the effects
   * together with the creatures (audioManager.js).
   * @param {string} what - 'music' or 'sounds', a key of `muted`.
   * @returns {string[]} The bus names.
   */
  mutedBuses(what) {
    if (what == 'music') {
      return ['music'];
    }
    return ['sounds', 'extra', 'animals'];
  } // mutedBuses

  /**
   * Flips a mute switch and mutes or unmutes its buses (mutedBuses).
   * @param {string} what - 'music' or 'sounds'.
   */
  toggleMuted(what) {
    this.muted[what] = !this.muted[what];
    this.mutedBuses(what).forEach((bus) => {
      this.model.sendEvent(0, {id: 'muteAudioBus', bus: bus, muted: this.muted[what]});
    });
  } // toggleMuted

  /**
   * Opens the buses of a screen that plays (audioManager.js), each muted by
   * its switch. A bus that is already open — the tune coming from the title
   * into the game — goes on playing.
   */
  openAudioBuses() {
    ['music', 'sounds'].forEach((what) => {
      this.mutedBuses(what).forEach((bus) => {
        this.model.sendEvent(0, {id: 'openAudioBus', bus: bus, options: {muted: this.muted[what]}});
      });
    });
  } // openAudioBuses

  getControls(device) {
    var result = {};

    switch (device) {
      case 'keyboard':
        // The defaults of the remake: the arrows and SPACE, as in the sibling
        // remakes (ZADANI chap. 7). ★ The original's own are 5 8 7 6 and A
        // (disasm_notes.md §8) — whoever wants them sets them in SETTINGS.
        // ★ `M` is the original's: it turns the tune on and off
        // (disasm_notes.md §8). The original's M stops only the tune, not
        // the sound slots, and so does the remake's on the `music` bus; `S`
        // for the effects is the remake's own, as in manicminer. The
        // original's `P` is not here: the pause is Escape / the X in the
        // border (gameModel.js).
        result = {left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp',
                  down: 'ArrowDown', enter: ' ', music: 'M', sounds: 'S'};
        break;
      case 'touchscreen':
        result = {supported: false, type: 'leftEnter'};
        break;
      case 'gamepads':
        result = {supported: false, devices: {}};
        break;
    }

    switch (device) {
      case 'keyboard':
      case 'touchscreen':
        var cfgString = Tool.readCookie(device, false);
        if (cfgString !== false) {
          try {
            var cfg = JSON.parse(cfgString);
            Object.keys(cfg).forEach((item) => {
              result[item] = cfg[item];
              if (device == 'touchscreen' && !(result[item] in this.controlsOptions.touchscreen.types)) {
                result[item] = this.controlsOptions.touchscreen.types.keys[0];
              }
            });
          } catch (error) {
            console.error(error.message);
          }
          // a keyboard saved before the music had its own bus has
          // `sounds: 'M'`; M is the tune's now, the effects go back to S
          if (device == 'keyboard' && cfg && !('music' in cfg) && result.sounds == result.music) {
            result.sounds = 'S';
          }
          // a keyboard saved while the remake still had a pause key
          if (device == 'keyboard') {
            delete result.pause;
          }
        }
        break;
      case 'gamepads':
        var devicesString = Tool.readCookie('gamepads', false);
        if (devicesString !== false) {
          try {
            var devices = JSON.parse(devicesString);
          } catch (error) {
            console.error(error.message);
          } finally {
            if (Array.isArray(devices)) {
              devices.forEach((id) => {
                var deviceString = Tool.readCookie(id, false);
                if (deviceString !== false) {
                  try {
                    var device = JSON.parse(deviceString);
                  } catch (error) {
                    console.error(error.message);
                  } finally {
                    result.devices[id] = device;
                  }
                }
              });
            }
          }
        }
        break;
    }
    return result;
  } // getControls

  /**
   * @param {string} model - The model's name.
   * @param {string} [variant] - SubMenuModel's: 'hallOfFame', 'sounds',
   *        'music', 'settings' or 'about'.
   */
  setModel(model, variant) {
    if (model == 'MenuModel' && this.globalData === false) {
      // the fetch may still be pending or has failed: as a last resort try the
      // data cached in localStorage before bothering the user
      if (!this.loadGlobalDataFromStorage()) {
        this.showErrorMessage('Game data could not be loaded.', 'retry');
        return;
      }
    }
    var needResizeApp = false;
    var selectionItem = 0;
    if (this.model) {
      // where to put the menu cursor on the way back (menuModel.menuItems)
      if (this.model.id == 'SubGameModel') {
        selectionItem = 1;
      } else if (this.model.id == 'TapeLoadingModel') {
        selectionItem = 7;
      } else if (this.model.id == 'SubMenuModel') {
        selectionItem = this.model.menuItem;
      }
      this.model.shutdown();
      needResizeApp = true;
    }
    switch (model) {
      case 'LoadingModel':
        this.model = new ZXResetModel(this);
        break;
      case 'MenuModel':
        this.model = new MenuModel(this, selectionItem);
        break;
      case 'MainModel':
        this.model = new MainModel(this);
        break;
      case 'SubMenuModel':
        this.model = new SubMenuModel(this, variant);
        break;
      case 'GameModel':
        this.model = new GameModel(this);
        break;
      case 'SubGameModel':
        this.model = new SubGameModel(this);
        break;
      case 'DemoModel':
        // the demo of the title: the game in the original's mode 3
        this.model = new GameModel(this, true);
        break;
      case 'GameOverModel':
      case 'GameExitModel':
        // the game is over either way: lost, or left through EXIT GAME; the
        // score is stored in both cases (R-049, as manicminer / jetsetwilly)
        this.model = new GameOverModel(this, 'MenuModel');
        break;
      case 'TapeLoadingModel':
        this.model = new TapeLoadingModel(this);
        break;
    } // switch
    this.model.init();
    if (needResizeApp) {
      this.resizeApp();
    }
  } // setModel

  /**
   * How many players the game runs with. ★ The original offers only one, so
   * this is here for the shape the sibling remakes share rather than for a
   * choice anybody makes.
   * @param {number} [players] - 1.
   * @returns {number} The number of players in force.
   */
  setPlayers(players) {
    if (GameApp.PLAYERS.indexOf(players) >= 0) {
      this.players = players;
    }
    return this.players;
  } // setPlayers

  /**
   * Starts a new game.
   * @param {number} [players] - 1; without it the menu's choice stays.
   */
  startGame(players) {
    this.setPlayers(players);
    this.score = 0;
    this.score2 = 0;
    this.player = 1;
    this.level = 0;
    // ★ $DEB0: three lives at the start of every game
    this.lives = 3;
    // the seed is **not** renewed here: $F343 goes on from the last game,
    // as in the original (gameSeed in the constructor)
    this.setModel('GameModel');
  } // startGame

  applyGlobalData(global) {
    // data/global.json#global is the start of a game as the original has it
    // (tools/mkglobal.py): the hold, Jim's object, lives and the treasure
    // counters. The game screen reads it through ScreenComposer; here it
    // only has to be there. A missing file arrives as null and the menu and
    // LOAD TAPE have to come up even so.
    var data = global || {};
    this.globalData = data;
    // ? whether the original has a hall of fame of its own is not measured
    // (ZADANI chap. 9, question 14), so a preset HI out of the game's data
    // would be the remake's invention — there is none until then
    if (data.hiScore && !this.hiScore) {
      this.hiScore = data.hiScore;
    }
  } // applyGlobalData

  setGlobalData(data) {
    this.applyGlobalData(data.data.global);

    Object.keys(data.data).forEach((key) => {
      if (key == 'hiScore') {
        // the server's hall of fame wins over the game's preset one, but only
        // when somebody has actually beaten it
        this.hiScore = Math.max(this.hiScore || 0, data.data[key] || 0);
      } else if (key != 'global') {
        this.saveDataToStorage(key, data.data[key]);
      }
    });
    // save global last: its presence in storage marks the whole appData save
    // as complete, which the offline fallback relies on
    this.saveDataToStorage('global', data.data.global || {});
  } // setGlobalData

  // Load the application data: from the server when online (which also refreshes
  // localStorage), or rehydrate the global data from localStorage when offline.
  loadAppData() {
    if (navigator.onLine) {
      this.fetchDataId = this.fetchData('appData.db', false, {}, this, 2000);
    } else {
      this.loadGlobalDataFromStorage();
    }
  } // loadAppData

  loadGlobalDataFromStorage() {
    var stored = localStorage.getItem(window.appPrefix+'.global');
    if (stored !== null) {
      try {
        this.applyGlobalData(JSON.parse(stored));
        return true;
      } catch (error) {
        console.error(error.message);
      }
    }
    return false;
  } // loadGlobalDataFromStorage

  setData(data) {
    this.setGlobalData(data);
  } // setData

  errorData(error) {
    // The network request failed (offline, unreachable server, or the fetch
    // timeout). Fall back to the data cached in localStorage; if none exists,
    // log it and let the MenuModel guard surface the error to the user.
    if (!this.loadGlobalDataFromStorage()) {
      console.error(error.message ? error.message : error);
      return;
    }
    if (this.model && this.model.id == 'ZXResetModel'
        && !this.model.events.some((queued) => queued.id == 'setMenuModel')
        && !this.model.desktopEntity.modalEntity) {
      this.setModel('MenuModel');
    }
  } // errorData

  showErrorMessage(message, action) {
    var topModalEntity = this.model.desktopEntity.topModalEntity();
    topModalEntity.addModalEntity(
      new ZXErrorEntity(
        topModalEntity,
        -topModalEntity.absoluteX(),
        -topModalEntity.absoluteY(),
        this.fonts.zxFonts8x8,
        message,
        action,
        ZXColor.white,
        ZXColor.red
      )
    );
  } // showErrorMessage

} // GameApp
