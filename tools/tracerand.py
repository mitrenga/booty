#!/usr/bin/env python3
"""Pustí generátor náhody originálu `$E349` v simulátoru Z80 a vypíše, co dává.

    ./tools/tracerand.py [--count N] [--seed 0xABCD] [--out FILE]

Bere **skutečný kód z kazety** (`tools/bootylib.py` `memory_image()`), nastaví
stav na `$F343` a volá `$E349` pořád dokola instrukci po instrukci
(SkoolKit `Simulator`). Výstup je binární: za každé volání tři bajty – `A`
(vrácené číslo) a nový stav `$F343` (nižší, vyšší bajt).

Pro `tools/matchrand.mjs`, který tentýž počet volání udělá generátorem
z `app/gameWorker.js` a porovná je bajt po bajtu.
"""
import argparse, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
sys.path.insert(0, B.SKOOLKIT)

from skoolkit.simulator import Simulator                         # noqa: E402

RAND = 0xE349           # ★ generátor (disasm_notes.md §5)
STATE = 0xF343          # ★ jeho stav, C na $F343, B na $F344
RETURN = 0x0000         # kam se vrací RET: adresa, na kterou kód nikdy neskočí
A, PC, SP = 0, 24, 12   # indexy registrů SkoolKitu


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--count', type=int, default=65536)
    ap.add_argument('--seed', type=lambda v: int(v, 0), default=0)
    ap.add_argument('--out', default='-')
    args = ap.parse_args()

    memory = bytearray(0x4000) + bytearray(B.memory_image())
    memory[STATE] = args.seed & 0xFF
    memory[STATE + 1] = (args.seed >> 8) & 0xFF
    sim = Simulator(memory)
    out = bytearray()
    for _ in range(args.count):
        sim.registers[SP] = 0xFF00
        memory[0xFF00] = RETURN & 0xFF
        memory[0xFF01] = RETURN >> 8
        sim.run(RAND, RETURN)
        out += bytes([sim.registers[A], memory[STATE], memory[STATE + 1]])
    if args.out == '-':
        sys.stdout.buffer.write(out)
    else:
        open(args.out, 'wb').write(out)


if __name__ == '__main__':
    main()
