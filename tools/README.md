# tools/

The remake's tools. `../../STANDARDS.md` applies to them, as does the
`dump*` → `trace*` → `match*` methodology from `../../METHODOLOGY.md`:

- **`dump*` / `mk*`** pull data out of the original and store it in `../data/`
- **`trace*`** record the running original — the recording is what we measure against
- **`match*`** compare the remake with the original and **print the number of
  checks and the number of differences**. A milestone is done when the
  differences are zero.

The Python tools need **SkoolKit** vendored in svision (R-008), via the
`app/svision` symlink (`bootylib.SKOOLKIT`). The Node tools (`*.mjs`) build
**with the real code from `../app/`**, loaded through the shim
`app/svision/tools/nodeEnv.mjs` (R-001).

## Tape and memory image

| tool | what it does |
|---|---|
| `bootylib.py` | **the one place that says what is on the tape** and how the memory image is assembled from it: TZX with ID $10 and $11 blocks, `memory_image()` (including the 62 B at `$CD14`), `code_image()`. |
| `jsonformat.mjs` | the Node side of `bootylib.py`'s `write_json` / `read_section` / `write_section`: reads and writes the sections of `data/global.json` in the same shape (indent 2, arrays of numbers on one line), for the `*.mjs` tools. |
| `tapinfo.py` | takes the tape apart block by block; `--basic` lists both BASIC programs **with the actual binary values of the numbers**. The output is in `../sources/docs/tape_layout.md`. |
| `mksnapshot.sh` | tape → `build/booty.z80` + `build/booty.bin`, simulated loading up to `USR 52500` (`$CD14`). |
| `matchimage.py` | ★ **38 726 checks, 0 differences** — the memory image from `bootylib.py` against the simulator's memory. |
| `traceloading.py` | the same simulated loading, but **frame by frame**: whenever the picture changes it saves it (`build/loading/`) and prints the text on it (cells compared with the ROM characters at `$3D00`), with the attribute and a warning when ink = paper. This is where the LOAD TAPE captions come from (`Program: BOOTY` visibly, `Bytes: bs` / `Bytes: bc` invisibly). `--fast` only between blocks. |
| `mktape.py` | tape → `data/global.json#tape`: eight blocks with timing (for the turbo blocks from the TZX, **497 pilot pulses**), pauses and bytes as they come off the tape; of the code block only the first kilobyte. |

## Screen

| tool | what it does |
|---|---|
| `matchloading.py` | ★ **112 128 checks, 0 differences** — the SCREEN$ from the tape against `sources/media/screens/loading_screen.scr` (bytes), against `data/global.json#loading` (bytes) and against the simulator's screen **pixel by pixel** in both FLASH phases. |
| `mkscreen.py` | `.scr` → `data/global.json#loading` (the video memory as the machine holds it). |
| `playtrace.py` | runs the game in the simulator, simulates key presses, saves frames (`.png` + `.scr`), optionally a code coverage map (`--map`) and the whole RAM (`--dump`). |
| `mkhold.py` | from a run of the original (title → `SPACE` → menu → `0`): the **reference** game screen by majority vote over 431 frames (`build/ref/screen.scr`) and a frame of the original's menu (`build/ref/menu.scr`) |
| `matchscreen.mjs` | ★ **16 128 checks, 0 differences** — the game screen **composed from data** (hold, panel, Jim), the remake's menu heading and **the original's whole menu from the streams** against the original's video memory. |

## Holds, sprites, panel (M2)

| tool | what it does |
|---|---|
| `dumpholds.py` | the tables of the 21 holds (`bootylib.holds()`) and the scenery glyphs → `data/global.json#holds`; reassembling them must give the bytes from the tape |
| `traceholds.py` | **the original's code** (`$AA97`, `$AB44`, `$A900`) in the simulator draws every hold from the game state at `$E0A9` → `build/ref/holds/` (picture, character map, border) |
| `matchholds.mjs` | ★ **161 973 checks, 0 differences** — `app/holdRenderer.js` against the reference |
| `dumpsprites.py` | the graphics of the eight sprite and block sets from the running game's memory → `data/global.json#sprites` |
| `tracesprites.py` | **the original's routines** `$EED7` (sprite) and `$EA93` (block) draw everything they ever draw: 3416 cases, 16 fine positions, both edges → `build/ref/sprites/` |
| `matchsprites.mjs` | ★ **23 611 392 checks, 0 differences** — `app/spriteRenderer.js` against the reference |
| `dumppanel.py` | the panel from the code's operands (checking the instructions at the addresses) → `data/global.json#panel` |
| `tracepanel.py` | **the original's code** (`$E0AC`… and the main-loop section `$DF5B`) prints the panel in 21 holds × 6 states → `build/ref/panel/` |
| `matchpanel.mjs` | ★ **870 912 checks, 0 differences** — `app/panelRenderer.js` against the reference |
| `dumptexts.py` | the streams for ROM printing (menu, `DEFINE KEYS`, the hidden game …) → `data/global.json#texts` |
| `mkglobal.py` | the initial game state from a run of the original (frame 399) → `data/global.json#global` |

## Main loop (M3)

| tool | what it does |
|---|---|
| `tracephysics.py` | recordings of the original: the game is played by a script (manual, seeded random, into every hold, targeted: golden key, sea, game over) and at the start of every pass of `$DF13` the memory regions and the pass's inputs are saved (key from `KEY-SCAN`, the `FRAMES` timers, T-states). The inputs are caught by a detour in the simulator → `build/trace/<script>/` |
| `matchphysics.mjs` | ★ **425 540 passes, 0 differences** – `app/bootyLogic.js` from the same memory with the same inputs, whole memory regions after every pass; `--base build/rules` the same over the games from RZX (183 890 / 0) |
| `physicscoverage.py` | what the recordings covered: holds, transitions, deaths, keys, doors, booty, explosions, creatures, falls, platforms, golden key, game over |
| `measurecadence.py` | the average pass length of the original without the tune (the remake's constant rate) – checks that it agrees with `PASS_TSTATES` in `app/gameWorker.js` |
| `tracetransition.py` | ★ the door transition into holds 1–20 in the simulator with contended memory, without the tune: T-states of the stops `$EE84` … `$DF13`, the screen at the end of every frame, the progress of the ROM CL-LINE clearing without interrupts → `build/transition/`; `--shots DIR` PNG frames |
| `mktransition.mjs` | from `build/transition/` the timing models (tables, blackout) and the clearing blocks → `data/global.json#transition` |
| `matchtransition.mjs` | ★ **197 frames, 0 differences** — for every frame of the original's transition the remake (`BootyLogic.transitionScreen`) shows the same picture, at most 0.045 frame off |
| `mkmemory.py` | the data regions of the original's memory at game start (checked against the code in `booty.ctl`) → `data/global.json#memory` |
| `matchstart.mjs` | ★ a new game from `data/global.json#memory` = the original at its start, and 8 recordings from it – **0 differences** |

## Ship rules (M4)

| tool | what it does |
|---|---|
| `tracerules.py` | RZX recordings from the RZX Archive (`build/rzx/`, `sources/docs/provenance.md`) – **whole games played by a human** – replayed with SkoolKit, catching the passes' inputs **by observation** (`$ED38` key, `$E122`/`$E136` `FRAMES`), without touching the code, which would shift the RZX frames → `build/rules/<name>/` in the shape of `tracephysics.py` |
| `matchrules.mjs` | ★ **204 043 passes, 2 766 278 726 checks, 0 differences** — **the worker** (`app/gameWorker.js`, as it runs in the browser) from a new game: keys as actions via `controls`, ticks, transitions, game over; after every pass the whole memory and the `frame` message. Only the `FRAMES` timers are substituted (the rate is a deviation). The games `gold1`, `gold2` (golden key, next round) and `walk`, `gameover`, `lastlife` from `tracephysics.py`; prints what happened in the game (booty, explosions, keys, doors, deaths, ship edges) |
| `workersandbox.mjs` | a stand-in for the worker's environment (`node:vm`, clocks, `importScripts`) and the data from `data/` for `runworker.mjs` and `matchrules.mjs` |

## Enemies (M5)

| tool | what it does |
|---|---|
| `matchentities.mjs` | ★ **611 302 passes, 216 988 343 checks, 0 differences** — over `build/trace` and `build/rules`: the **entity table** (pirates `OPST`, creature `$F31C`, platforms `LIDAT`, hatches `PHDAT`, explosion, fragments, Jim) of the remake = the original's after every pass, bytes and picture on the screen alike; **on the original's data** the rules from `sources/docs/enemies.md` (pirates' steps, frames and turns with their reason, the creature's flight, platform limits); **collision envelopes** of the pirate and the creature against all touch tests. Prints the coverage (turns by reason, kinds and sides of the creature, non-releases, deaths) |

The targeted recordings for M5 are in `tracephysics.py`: `creature*` (Jim waits
on a deck the creature may enter; seeds `$F343`) and `ladder*` (Jim climbs a
ladder under a pirate).

## Worker

| tool | what it does |
|---|---|
| `runworker.mjs` | ★ **35 checks, 0 errors** — `app/gameWorker.js` without a browser with the data from `data/`: first screen = the original's screen, constant pass rate, keys via `KEY-SCAN`, seed, **door transition** (clearing, blackout as long as the original's, border, waiting pass, half a second without input), **clock with substituted time** (constant `setTimeout`, no accumulator). |
| `tracerand.py` | runs the original's generator `$E349` in the Z80 simulator on the real code from the tape and prints the numbers and the states of `$F343`. |
| `matchrand.mjs` | ★ **196 608 checks, 0 differences** — the worker's generator against `$E349` over **the whole period** of 65 536 calls (number and state). |
| `tracegoldfish.py` | the hidden sub game in the Z80 simulator via POKE `52798,58`, without keys: the memory on entering `$CF36` and the regions after every pass → `build/goldfish/`. |
| `mkgoldfish.py` | → `data/global.json#goldfish`: the sub game's data regions and rate (median pass). |
| `matchgoldfish.mjs` | ★ **47 574 000 checks, 0 differences** — `app/goldfishLogic.js` (SECRET SUB GAME) against the original, 2 × 3000 passes: without keys and with random diver keys (`tracegoldfish.py --keys 1`); rows 22–23 FISH/AIR included. |
| `tracesound.py` | the original's sound in the Z80 simulator: the IM 2 handler `$FE69` along its paths (every `OUT` to `$FE`, length, memory), ROM `BEEPER`, ROM `$0038`, and the tune on the title handler by handler → `build/sound/`. |
| `mksounds.py` | → `data/global.json#sounds`: the tune `$FA00`, slot parameters from the code's operands, BEEPER, ROM for the noise, length of ROM `$0038`. |
| `matchsound.mjs` | ★ **122 448 checks, 0 differences** — `app/bootySound.js` against the original edge by edge in T-states, including when an interrupt is lost. |
| `tracetitle.py` | the original's title `$CD86` in the Z80 simulator (contended memory): on every entry to the loop `$CDAF` the video memory, the state `$D86F` and the T-state; a run with the tune and one without → `build/title/`. |
| `mktitle.py` | → `data/global.json#title`: the picture from the copy at `$6978`, the sea thresholds from the operands of `$D0AC`, seed, border and rate without the tune. |
| `matchtitle.mjs` | ★ **1 776 641 checks, 0 differences** — the sea of `app/titleSea.js` against the original pass by pass (whole video memory and `$D86F`). |

## Disassembly and measurements

| tool | what it does |
|---|---|
| `mkasm.py` | `bootylib.code_image()` → `../sources/asm/booty.skool` according to the hand-maintained `booty.ctl`. The first `.ctl` is made by `--ctl-from-map` from the coverage map (`playtrace.py --map`) via SkoolKit `sna2ctl.py`; after that it is only filled in by hand. |
| `tracecadence.py` | ★ measures the length of a pass of the main loop `$DF13` in T-states (stops on every entry); `--cmio` with contended memory, `--csv` raw data. The result is in `../sources/docs/disasm_notes.md` §4. |

## What is to come

Nothing is waiting: the sound tools of M6 (`tracesound.py`, `mksounds.py`,
`matchsound.mjs`) are under *Worker* above. **A tool is not written before
there is something to measure.**
