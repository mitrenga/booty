# Protocol between `gameModel.js` and `gameWorker.js`

The worker holds the game – **the original's memory, 64 KB laid out as on the
machine** – and runs its main loop as the rewrite in `bootyLogic.js`
(`../sources/docs/physics.md`). The model only sends it the controls and draws
the screen it gets back (R-037: drawing happens on the `frame` message, the
model's loop is a fallback).

★ The game is the original pass by pass: `tools/matchphysics.mjs` (the rewrite
against recordings of the original, 0 differences), `tools/matchstart.mjs`
(start from the data the worker gets, 0 differences), `tools/runworker.mjs`
(this protocol) and `tools/matchrules.mjs` – **whole games of the original
replayed through this protocol** (`init`, `controls`, `tick`), the whole
memory and the `frame` message after every pass, 0 differences.

## Two clocks

| clock | frequency | what |
|---|---|---|
| **frame** | 50.08 Hz (69 888 T) | recursive `setTimeout` with the constant **30 ms** (operator's choice by eye 2026-10-07, to be measured; the original 19.968 ms), one tick per call, **no accumulator** (operator 2026-10-07, R-046 "What remains") – whatever delay the browser adds slows the game down a little; every tick increments `FRAMES` (`$5C78`) in memory, like the interrupt – the creature timer (`$E12A`) runs off it |
| **pass** | **constant**: once every `passTStates` T-states of frames | `PASS_TSTATES` in `gameWorker.js` (`tools/measurecadence.py`): the original's average without the tune, 114 057 T = 1.632 frames = 30.69 passes/s; in the remake the ticks are counted in 30 ms steps. The original changes its rate with the work and with the tune; **the remake does not** (operator's decision 2026-10-06, `ZADANI.md` §10) – the sound plays in its own thread |

## Model → worker

| message | fields | meaning |
|---|---|---|
| `init` | `initData: {headless, seed, hiScore, memory, romFont, transition}` | new game. `headless: true` ticks only on the `tick` message (tools). |
| `controls` | `left`, `right`, `up`, `down`, `enter` (boolean) | the full state of the actions; sent on every change, and whole. |
| `pause` / `continue` | – | stops / restarts the clock; `continue` without `pause` does nothing. |
| `tick` | – | one frame in `headless` mode. |
| `reset` | – | drops the state and stops the clock. |

### `initData`

| key | contents |
|---|---|
| `memory` | `data/global.json#memory` – the data regions of the original's memory at the moment the menu starts the game (`tools/mkmemory.py`); **no code in them** |
| `romFont` | 768 B, characters 32–127 of the ROM font at `$3D00` – from svision (`ZXFonts8x8`) |
| `transition` | `data/global.json#transition` – the door transition timings; without it the new hold appears at once |
| `seed` | ★ the initial state of the generator `$F343`; `0` = the original after loading. The model carries it from game to game as the original does |
| `hiScore` | the high score from the server |

The worker assembles the memory from them (`BootyLogic.composeMemory`) and
starts a new game (`BootyLogic.newGame` – the rewrite of `$DEA8` … `$DF13`).

### ★ Controls

The actions are the original's keys: the worker takes the codes the game has
in memory at `$5BEB`–`$5BEF` (left, right, up, down, ENTER ROOM; default `5 8 7
6 A`) and mimics the ROM `KEY-SCAN` (`BootyLogic.keyScan`) – a pass gets one
code, as in the original. There is no jump. `M` and `P` are handled by the model.

Deviation of the remake (ZADANI §10, 2026-10-07): after a change of hold
(`$5BD3`) the worker withholds the `enter` action from `KEY-SCAN` for 25
interrupts (≈ 0.5 s) from the end of the transition, so that a held key does
not throw Jim back and forth through the door.

### ★ Door transition

The pass in which ENTER ROOM changes the hold leaves in `BootyLogic#transition`
the screen before the transition, the screen with the new attributes and the
drawing work. The worker then sends every frame **the screen and border by the
time since the transition** (`BootyLogic.transitionScreen`): the ROM CL-LINE
clearing, blackout, attributes, panel – as the original without the tune
(`sources/docs/physics.md`). The next pass waits the whole length of the
transition (`passT` is reduced by it).

★ Drowning (`$E361`, a door into the sea): the pass leaves in
`BootyLogic#drowning` the screen before it and the T at which the water floods
each row. The worker first shows the rising water (`BootyLogic.drowningScreen`)
**in real time**, so that it goes with the sound (`REAL_T_PER_TICK`), and only
after it the transition after death; the next pass waits for both. Deviation
of the remake: the clearing and the appearance of the hold run
`TRANSITION_SLOWDOWN` = 2× slower than in the original, the blackout lasts as
long as there (ZADANI §10).

## Worker → model

| message | fields | meaning |
|---|---|---|
| `frame` | `frame`, `pass`, `outcome`, `screen?`, `border`, `hold`, `panel`, `jim`, `rand`, `controls`, `sounds[]`, `creature`, `explosion` | after every tick and after `init`. `screen` (6912 B, `$4000`–`$5AFF`) only when a pass ran in the tick. |
| `gameOver` | `score` | game over (`$ED8F`). |
| `error` | `message` | missing data. |

### `frame`

| key | contents |
|---|---|
| `screen` | the screen from the game's memory – **this is the picture**, the model draws it as it is |
| `border` | the border colour as the hold set it (`$229B`) |
| `outcome` | the result of the last pass: `pass`, `restart` (a life lost), `round` (golden key – new round), `gameover` |
| `panel` | `{lives, booty, treasure, key, score, hiScore}` from memory. ★ The original has no score (`sources/docs/rules.md`); `score` is the booty `BOOTY` collected over the whole game |
| `jim` | the 20 B of the object `$F231` |
| `rand` | the state of `$F343` – the model passes it to the next game |
| `sounds[]` | the tick's sound events in the order the machine plays them: `{id: 'beeper', de, hl}` – ROM `BEEPER` from the pass; `{id: 'slot', value}` – a one-shot slot `$FFFE` 1–6 that the interrupt handler played and cleared on this tick – even inside a pass, where the original draws the hold over many frames and `$E058` clears the slots only at the end (death: BEEPER, then `$FFFE`; `BootyLogic#silence`); `{id: 'death'}` – `$FFFB`+`$FFFC`; `{id: 'drown', seed}` – drowning `$E361`, noise from the generator starting at the `$F343` state `seed` (`app/bootySound.js`) |
| `creature` | slot `$FFFF`: 0 nothing, 1 rat, 2 parrot – sounds continuously until it is 0 (bus `animals`) |
| `explosion` | slot `$FFFD`: 0 nothing, 1 explosion, 2 fragments – continuous (bus `extra`) |

## SECRET SUB GAME – `subGameWorker.js`

A second worker (`gameApp.subGameWorker`) for the hidden sub game `CATCH 20
GOLDFISH` (`subGameModel.js`). It holds the sub game's memory and runs `$CF36`
through `goldfishLogic.js` (`panel`, `input`) – ★ `tools/matchgoldfish.mjs`
47 574 000 checks / 0. Tick 20 ms (the original's interrupt), a pass once every
`passTStates` from `data/global.json#goldfish` (the original's median, 6.15 frames).

| direction | message | fields | meaning |
|---|---|---|---|
| model → worker | `init` | `initData: {memory, romFont, inkPlane, scenery}` | `memory` = `data/global.json#goldfish` (the memory at the first `$CF36` and `passTStates`), `romFont` at `$3D00` for the digits of the catch, `inkPlane` the ink plane (R-036), `scenery` the ships and the sea bed from the menu (`GoldfishLogic#scenery`, `null` = from the data); the worker then runs one pass right away |
| model → worker | `controls` | `left`, `right`, `up`, `down` | ★ the diver's keys; the worker turns them into the codes `5 8 7 6` and picks one via `BootyLogic.keyScan`, like the ROM `KEY-SCAN` in `$D579` |
| model → worker | `pause` / `continue` / `reset` | – | as in `gameWorker.js` |
| worker → model | `frame` | `frame`, `pass`, `screen?`, `ink?`, `scenery?`, `sounds[]`, `fish`, `air`, `controls` | after every tick with a pass and after `init`; `scenery` (with `screen`) = `{ships, sand, phase}` for the menu (`gameApp.goldfishScenery`); `sounds[]`: `{id: 'beeper', de, hl}` – ROM `BEEPER` on touching a fish (`$CF7E`) |
| worker → model | `won` | `fish` | ★ 20 goldfish (`$CF3E` → `$D08A`): the original starts Booty, so does the remake |
| worker → model | `error` | `message` | missing data |
