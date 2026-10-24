# data/

The data that goes to the browser: **a single file `global.json`** with its
sections in a fixed order. The server sends them under the same keys
(`../db/appData.php`) and the application takes each one via
`loadDataFile('<section>')`.

**Every section is written by a tool from `../tools/` out of the original**
(`bootylib.write_section()`, in Node `jsonformat.mjs` `writeSection()`) and
leaves the other sections alone. Nothing is edited by hand and nothing holds a
number somebody guessed. In references a section is written `data/global.json#holds`.

The data holds **only the values the game or the tools read**, no notes. Where
each value comes from (addresses, who prints the text, who selects the sprite
set, what is in which memory region) is in the tool that writes the section,
and in the table below.

| section | what is in it | made by | proven by |
|---|---|---|---|
| `global` | ★ the initial game state from a run of the original (frame 399 after starting with key `0`): hold, Jim's object (after landing), lives, booty – for the static screen of M2 | `tools/mkglobal.py` | `tools/matchscreen.mjs` |
| `holds` | ★ the tables of all **21 holds** from `$ABD6` to `$BAA0` (11 tables, the author's names, ROM `CL-SET` coordinates) and the scenery glyphs from `$8378` | `tools/dumpholds.py` | `tools/matchholds.mjs` — **161 973 checks, 0 differences** against the original's drawing |
| `sprites` | ★ the graphics of the sprites and blocks, eight sets (Jim, pirates, the timer creature, platforms, hatches, explosion, blank characters, icons and fragment) from the running game's memory | `tools/dumpsprites.py` | `tools/matchsprites.mjs` — **23 611 392 checks, 0 differences** |
| `panel` | ★ the panel from the code's operands: template `$F2BB`, positions, ink, icons `$F15B`, initial values, the golden key text | `tools/dumppanel.py` | `tools/matchpanel.mjs` — **870 912 checks, 0 differences** |
| `texts` | ★ the streams for ROM printing (menu, `PRESS FIRE BUTTON`, the hidden game's intro) as they lie in memory | `tools/dumptexts.py` | `tools/matchscreen.mjs` — the original's whole menu **6912 / 0** |
| `memory` | ★ **the initial game memory** for `app/bootyLogic.js` in the worker: 13 data regions of the original's memory at game start (12 688 B) – tables, glyphs, sprites, templates, texts, variables; **no code in it** (checked against `booty.ctl`) | `tools/mkmemory.py` | `tools/matchstart.mjs` — **0 differences** |
| `transition` | ★ the door transition without the tune: T to the clearing and the length of the blackout as a model from the drawing work, 48 ROM CL-LINE clearing blocks, attribute copy, panel | `tools/tracetransition.py` → `tools/mktransition.mjs` | `tools/matchtransition.mjs` — **197 frames, 0 differences** (at most 0.045 frame off) |
| `loading` | the loading screen from the tape: video memory `$4000–$5AFF` as it lies in the machine's memory (6144 B of bitmap in the ULA's non-linear addressing + 768 B of attributes, base64) | `tools/mkscreen.py sources/media/screens/loading_screen.scr` | `tools/matchloading.py` — **112 128 checks, 0 differences** |
| `tape` | the script for LOAD TAPE: the eight tape blocks in their order, for each the pilot (length and **pulse count** – turbo blocks 497), sync, bits, the pause from the TZX and the bytes as they come off the tape; the SCREEN$ refers to the `loading` section, of the code block only the first kilobyte | `tools/mktape.py` | from the tape via `tools/bootylib.py`; the timing agrees with the simulated loading (`tools/traceloading.py`) |
| `title` | ★ the title for `MainModel`: the picture from the copy at `$6978` (the sea in it is the marker `$05`), the sea thresholds from the operands of `$D0AC`, seed `$D86F`, border from `$CD93` and the rate of the loop `$CDAF` without the tune (483 501 T = 6.92 frames) | `tools/tracetitle.py` → `tools/mktitle.py` | `tools/matchtitle.mjs` — **1 776 641 checks, 0 differences** |
| `sounds` | ★ the original's sound: the tune `$FA00` (`[DE, BC]` for `$F648`), mask `$FFF7`, the IM 2 handler's slot parameters from the code's operands, ROM `BEEPER` calls, ROM `$0000`–`$1FFF` for the noise `$F618` and the measured length of ROM `$0038` | `tools/tracesound.py` → `tools/mksounds.py` | `tools/matchsound.mjs` — **122 448 checks, 0 differences** |
| `goldfish` | ★ the hidden sub game `CATCH 20 GOLDFISH` for SECRET SUB GAME and the menu background: the data regions of the original's memory on first entering `$CF36` (screen, graphics, objects, diver, sand, bubbles), no code; rate = the median pass without the tune and sounds | `tools/tracegoldfish.py` → `tools/mkgoldfish.py` | `tools/matchgoldfish.mjs` — **47 574 000 checks, 0 differences** |

The game's rate (average pass length) is not in the data: it is a single
number, `PASS_TSTATES` in `app/gameWorker.js`, and `tools/measurecadence.py`
checks that it agrees.

## ★ Since M2 the game screen is composed from data

`app/screenComposer.js` composes the game screen the way the original builds
it: the hold from the `holds` section (`$A900`), the panel from `panel`
(`$E0A9`), Jim through the sprite routine (`$EED7`) from `sprites` at the
position from `global`. `tools/matchscreen.mjs` compares it with a **majority
vote over the running original** (`build/ref/screen.scr`, `tools/mkhold.py`),
which assumes nothing about the format – and it is zero.
The menu heading is printed from the original's stream (section `texts`) via
svision `ZXRomPrint`. **There is no photo in `data/` any more** – the
`screen.json` of M1 is gone.

## What is not here yet

Nothing that would be waiting to be measured: since M6 the sound is here too
(section `sounds`). Further sections **are not created before there is
something to measure**. The server sends missing sections as `null` and the
application must survive that (`../db/appData.php`).
