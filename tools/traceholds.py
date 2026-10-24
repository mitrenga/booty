#!/usr/bin/env python3
"""Lets the **original's code** draw every hold and saves what it drew.

    ./tools/traceholds.py [--out build/ref/holds]

Reference screens for `tools/matchholds.mjs`. Nothing is redrawn here:

1. the game is started in the simulator as in `playtrace.py` (title → `SPACE`
   → menu → `0`) and stopped the moment it first reaches `$E0A9`
   (`CALL $A804`) – the only place the holds are drawn from. The ROM system
   variables (channel, `TV-FLAG`, `DF-CC`) that printing depends on are thus
   exactly the ones the game draws with
2. for every hold n = 1 … 21 a copy of that RAM is made, `$AA97` is called
   (copies the tables into the working area, as `$A804` does on first entry),
   n is written into `$5BD3` and the original's code is run from `$A811`:
   `CALL $AB44` (selects the hold and unpacks its tables into `$BAD7`) and
   `JP $A900` (draws it through the ROM and sets the border), up to its `RET`
3. the video memory `$4000`–`$5AFF` is saved (`holdNN.scr`), the character
   map `$A1C4` (`holdNN.map`, 800 B: character code per cell, 25 rows of 32)
   and the border colour the code set (`global.json#holds`)

★ `$AAF4` (saving the state of the previous hold back into the working area,
called by `$A804` when `$5BD3` ≠ 0) is skipped on purpose: every hold is drawn
from the untouched state at the start of the game. What the game changes in a
hold (collected loot, opened doors) is M4.

Addresses and their meaning: `sources/docs/holds.md`.
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
sys.path.insert(0, B.SKOOLKIT)
sys.path.insert(0, B.RETRO)

import playtrace                                                 # noqa: E402
from skoolkit import ROM48, read_bin_file                       # noqa: E402
from skoolkit.simulator import Simulator                         # noqa: E402
from skoolkit.simutils import from_snapshot                      # noqa: E402
from skoolkit.snapshot import Snapshot                           # noqa: E402
from skoolkit.trace import Tracer                                # noqa: E402
try:
    from skoolkit.csimulator import CSimulator
except ImportError:                                              # pragma: no cover
    CSimulator = None

SCRIPT = [(200, 210, 'SPACE'), (300, 310, '0')]
GAME_START = 0xE0A9      # ★ CALL $A804 – the only place the holds are drawn from
BUILD = 0xAA97           # ★ copies the tables into the working area, $5BD3 ← 1
SENTINEL = 0x0001        # return address the code never jumps to
STACK = 0x68F0           # below RAMTOP from `CLEAR 26870` ($68F6)
PC, SP, IY, IFF = 24, 12, 11, 26


def game_ram(snapshot_path):
    """RAM $4000–$FFFF at the moment the game first calls `$E0A9` – game
    start, just before it draws the first hold. The system variables
    (channel, `TV-FLAG`, `DF-CC`) are thus exactly the ones it draws with."""
    snapshot = Snapshot.get(snapshot_path)
    sim = from_snapshot(CSimulator or Simulator, snapshot, {}, {'ay': [None] * 16},
                        {'fast_djnz': False, 'fast_ldir': False}, None)
    tracer = Tracer(sim, snapshot.border, snapshot.out7ffd, snapshot.outfffd,
                    list(snapshot.ay), snapshot.outfe, True)
    sim.set_tracer(tracer)

    def draw(scr, frame, border, keyboard):
        for i in range(8):
            keyboard[i] = 0
        for start, end, key in SCRIPT:
            if start <= frame < end:
                row, bit = playtrace.KEYS[key]
                keyboard[playtrace.ROWS[row]] |= 1 << bit
        return frame < 2000

    tracer.run(snapshot.pc, GAME_START, 0, 0, True, draw, None, None, None, '$', '04X', '04X')
    if sim.registers[PC] != GAME_START:
        raise SystemExit('the game did not reach $%04X – check SCRIPT' % GAME_START)
    return bytes(sim.memory[0x4000:0x10000]), dict(enumerate(sim.registers))


class BorderTracer:
    """Catches OUT to port $FE – the border the hold sets (`$229B`)."""
    def __init__(self):
        self.border = None

    def write_port(self, registers, port, value, *rest):
        if port & 1 == 0:
            self.border = value & 7

    def read_port(self, registers, port, *rest):
        return 0xFF



def call(memory, registers, address):
    """Calls the original's routine and lets it run up to its RET."""
    memory[STACK] = SENTINEL & 0xFF
    memory[STACK + 1] = SENTINEL >> 8
    sim = Simulator(memory, {'IY': registers[IY - 1] * 256 + registers[IY], 'SP': STACK})
    sim.registers[IFF] = 0
    tracer = BorderTracer()
    sim.set_tracer(tracer)
    sim.run(address, SENTINEL)
    return tracer.border


def draw_hold(ram, registers, number):
    memory = list(read_bin_file(ROM48, 16384)) + list(ram)
    call(memory, registers, BUILD)
    memory[B.HOLD_CURRENT] = number
    border = call(memory, registers, B.HOLD_DRAW)
    return (bytes(memory[0x4000:0x5B00]), bytes(memory[B.CHAR_MAP:B.CHAR_MAP + 800]),
            border)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(B.ROOT, 'build', 'ref', 'holds'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    ram, registers = game_ram(os.path.join(B.ROOT, 'build', 'booty.z80'))

    summary = {}
    for number in range(1, B.HOLD_COUNT + 1):
        scr, charmap, border = draw_hold(ram, registers, number)
        open(os.path.join(args.out, 'hold%02d.scr' % number), 'wb').write(scr)
        open(os.path.join(args.out, 'hold%02d.map' % number), 'wb').write(charmap)
        playtrace.write_png(os.path.join(args.out, 'hold%02d.png' % number),
                            playtrace.scr_to_rgb(scr), 256, 2)
        summary[number] = {'border': border}
        print('hold %2d: border %s' % (number, border))
    with open(os.path.join(args.out, 'global.json#holds'), 'w') as f:
        json.dump(summary, f, indent=1)
    print('%d holds in %s' % (B.HOLD_COUNT, args.out))


if __name__ == '__main__':
    main()
