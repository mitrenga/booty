#!/usr/bin/env python3
"""Runs the original's random generator `$E349` in the Z80 simulator and prints what it yields.

    ./tools/tracerand.py [--count N] [--seed 0xABCD] [--out FILE]

Takes the **real code from the tape** (`tools/bootylib.py` `memory_image()`),
sets the state at `$F343` and calls `$E349` over and over, instruction by
instruction (SkoolKit `Simulator`). The output is binary: three bytes per
call – `A` (the returned number) and the new state of `$F343` (low, high byte).

For `tools/matchrand.mjs`, which makes the same number of calls with the
generator from `app/gameWorker.js` and compares them byte by byte.
"""
import argparse, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
sys.path.insert(0, B.SKOOLKIT)

from skoolkit.simulator import Simulator                         # noqa: E402

RAND = 0xE349           # ★ generator (disasm_notes.md §5)
STATE = 0xF343          # ★ its state, C at $F343, B at $F344
RETURN = 0x0000         # where RET returns to: an address the code never jumps to
A, PC, SP = 0, 24, 12   # SkoolKit register indices


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
