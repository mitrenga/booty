#!/usr/bin/env python3
"""Lets the **original's code** print the panel and saves what it printed.

    ./tools/tracepanel.py [--out build/ref/panel]

Reference screens for `tools/matchpanel.mjs`. From the game state at the
moment it draws the first hold itself (`tools/traceholds.py`), for every hold
1 … 21 and every state from `STATES`:

1. the hold is drawn with the original's code (`$AA97`, `$A811`) – this also
   sets its colours, and the panel paper is the hold border (`$5BD0`)
2. the state is written into the variables: lives `$5BF1`, collected loot
   `$5BF4`, remaining `$5BF2`, key number `$F241`
3. **the rest of `$E0A9` from `$E0AC`** is run – template, numbers, `$E064`
   (lives and key) and, with zero loot remaining, the gold key text – up to
   its `RET`, and then **the main-loop section `$DF5B`–`$DF80`**, which
   prints the key number
4. the video memory is saved
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
import traceholds as T                                           # noqa: E402
from skoolkit import ROM48, read_bin_file                       # noqa: E402

PANEL = 0xE0AC           # ★ the rest of $E0A9 after CALL $A804
KEY_FROM, KEY_TO = 0xDF5B, 0xDF81   # ★ key number in the main loop
# (lives, collected, remaining, key): game start, empty, full, after fifty,
# the last piece, **zero** – then the gold key text appears
STATES = [(3, 0, 125, 0), (0, 1, 124, 9), (4, 50, 75, 5), (2, 124, 1, 3),
          (1, 125, 0, 7), (3, 100, 25, 1)]


def run_until(memory, start, stop):
    sim = T.Simulator(memory, {'IY': 0x5C3A, 'SP': T.STACK})
    sim.registers[T.IFF] = 0
    sim.set_tracer(T.BorderTracer())
    sim.run(start, stop)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(B.ROOT, 'build', 'ref', 'panel'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    ram, registers = T.game_ram(os.path.join(B.ROOT, 'build', 'booty.z80'))
    base = list(read_bin_file(ROM48, 16384)) + list(ram)
    T.call(base, registers, T.BUILD)

    cases, screens = [], bytearray()
    for hold in range(1, B.HOLD_COUNT + 1):
        for lives, booty, treasure, key in STATES:
            memory = list(base)
            memory[B.HOLD_CURRENT] = hold
            T.call(memory, registers, B.HOLD_DRAW)
            memory[0x5BF1] = lives
            memory[0x5BF4], memory[0x5BF5] = booty & 0xFF, booty >> 8
            memory[0x5BF2], memory[0x5BF3] = treasure & 0xFF, treasure >> 8
            memory[0xF241] = key
            T.call(memory, registers, PANEL)
            memory[T.STACK] = T.SENTINEL & 0xFF
            memory[T.STACK + 1] = T.SENTINEL >> 8
            run_until(memory, KEY_FROM, KEY_TO)
            screens += bytes(memory[0x4000:0x5B00])
            cases.append({'hold': hold, 'lives': lives, 'booty': booty,
                          'treasure': treasure, 'key': key})
    open(os.path.join(args.out, 'panel.scr'), 'wb').write(screens)
    with open(os.path.join(args.out, 'cases.json'), 'w') as f:
        json.dump(cases, f)
    print('%d cases in %s' % (len(cases), args.out))


if __name__ == '__main__':
    main()
