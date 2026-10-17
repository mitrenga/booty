#!/usr/bin/env python3
"""Nechá **kód originálu** vytisknout panel a uloží, co vytiskl.

    ./tools/tracepanel.py [--out build/ref/panel]

Referenční snímky pro `tools/matchpanel.mjs`. Ze stavu hry ve chvíli, kdy
sama kreslí první podpalubí (`tools/traceholds.py`), se pro každé
podpalubí 1 … 21 a každý stav z `STATES`:

1. nakreslí podpalubí kódem originálu (`$AA97`, `$A811`) – tím se nastaví
   i jeho barvy, a papír panelu je border podpalubí (`$5BD0`)
2. do proměnných se zapíše stav: životy `$5BF1`, sebraná kořist `$5BF4`,
   zbývající `$5BF2`, číslo klíče `$F241`
3. pustí se **zbytek `$E0A9` od `$E0AC`** – šablona, čísla, `$E064`
   (životy a klíč) a při nule zbývající kořisti text o zlatém klíči – až
   po jeho `RET`, a pak **úsek hlavní smyčky `$DF5B`–`$DF80`**, který
   tiskne číslo klíče
4. uloží se videopaměť
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
import traceholds as T                                           # noqa: E402
from skoolkit import ROM48, read_bin_file                       # noqa: E402

PANEL = 0xE0AC           # ★ zbytek $E0A9 po CALL $A804
KEY_FROM, KEY_TO = 0xDF5B, 0xDF81   # ★ číslo klíče v hlavní smyčce
# (životy, sebráno, zbývá, klíč): začátek hry, prázdné, plné, po padesáti,
# poslední kus, **nula** – tehdy přibude text o zlatém klíči
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
    print('%d případů v %s' % (len(cases), args.out))


if __name__ == '__main__':
    main()
