#!/usr/bin/env python3
"""Lets the **original's code** draw sprites and blocks and saves what it drew.

    ./tools/tracesprites.py [--out build/ref/sprites]

Reference screens for `tools/matchsprites.mjs`. From the game state at the
moment it draws the first hold itself (`tools/traceholds.py`), for every
case:

1. hold 1 is drawn with the original's code (`$AA97`, `$A811`) – background
2. the graphics set is written into `CHARS` and the hold's paper into `ATTR-T`
   (the main loop does that at `$DF13`; for blocks also the ink set by the
   caller), and the original's routine is called:
   - **object**: the case's object is written to `$F231` (Jim's object)
     and **`$EED7`** is called
   - **block**: **`$EA93`** is called with registers A (code), E × D
     (width × height), C, B
3. the video memory is saved

Cases (`OBJECTS`, `BLOCKS` below): Jim, pirates, the creature from the timer
(rat, parrot) and platforms in every frame the game uses, in all 16
combinations of fine position, in the middle, one and two columns past the
left edge and at the right edge; portholes, explosion, trapdoor, blank space
and an explosion fragment in the middle, at the right edge and beyond it. The
list goes to `cases.json`, so that the remake draws exactly the same.
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
import traceholds as T                                           # noqa: E402
from skoolkit import ROM48, read_bin_file                       # noqa: E402

DRAW_SPRITE = 0xEED7     # ★ sprite routine (Jim $ECC4, pirates $F007)
OBJECT = 0xF231          # ★ Jim's object – the case's object is written here
CHARS, ATTR_T = 0x5C36, 0x5C8F

DRAW_BLOCK = 0xEA93      # ★ block: portholes, explosion, fragments, trapdoor

# Objects through $EED7: (set, CHARS, width, height, ink, codes). ★ The codes
# are the ones the game sends (pirates +6 cyclically in $20-$44 and $50-$7A,
# $F01E-$F032; creature from the timer $E12A: 4 × 1 $20/$24 and 2 × 2 from
# $28 by 8, $E290; platforms from LIDAT 33 and 36). ? For Jim the whole set
# is tried in steps of 6 characters – which codes he uses when walking is M3.
OBJECTS = [('jim', 0x8978, 2, 3, 5, list(range(32, 123, 6))),
           ('pirate', 0x8E28, 2, 3, 7, list(range(32, 69, 6)) + list(range(80, 123, 6))),
           ('pirate', 0x8E28, 2, 2, 5, [32, 38, 44, 50, 56, 62, 68]),
           ('creature', 0x934C, 4, 1, 3, [32, 36]),
           ('creature', 0x934C, 2, 2, 6, [40, 44, 48, 52, 56, 60, 64, 68]),
           ('platform', 0xF17B, 3, 1, 5, [33, 36]),
           ('platform', 0xF17B, 4, 1, 4, [33, 36])]
# in the middle, one and two columns past the left edge, at the right edge (C = 2)
PLACES = [('middle', 16, 21), ('left', 34, 13), ('far-left', 35, 18), ('right', 3, 8)]

# Blocks through $EA93: (set, CHARS, code, width, height, ink)
BLOCKS = ([('porthole', 0x914C, code, 2, 2, 5) for code in range(32, 61, 4)]
          + [('explosion', 0x924C, code, 2, 2, 6) for code in range(36, 61, 4)]
          + [('blank', 0x9F6C, 32, width, 1, 7) for width in range(1, 6)]
          + [('blank', 0x9F6C, 32, 2, 2, 6)]
          + [('icons', 0xF15B, 32, 1, 1, 7)])
# in the middle; starting in the next-to-last and in the last column (C = 3,
# C = 2: clipping and digit shift); beyond the right edge (C = 1, nothing)
BLOCK_PLACES = [('middle', 16, 13), ('right', 3, 8), ('edge', 2, 18), ('beyond', 1, 3)]


def cases():
    out = []
    for bank, chars, width, height, ink, frames in OBJECTS:
        for frame in frames:
            for place, c, b in PLACES:
                for px in range(4):
                    for py in range(4):
                        obj = [c, b, px, py, 0, 0, frame, width, height, ink,
                               1, 0, 0, c, b, py]
                        out.append({'kind': 'object', 'bank': bank, 'chars': chars,
                                    'frame': frame, 'place': place, 'object': obj})
    for bank, chars, code, width, height, ink in BLOCKS:
        for place, c, b in BLOCK_PLACES:
            out.append({'kind': 'block', 'bank': bank, 'chars': chars, 'code': code,
                        'width': width, 'height': height, 'ink': ink,
                        'place': place, 'c': c, 'b': b})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(B.ROOT, 'build', 'ref', 'sprites'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    ram, registers = T.game_ram(os.path.join(B.ROOT, 'build', 'booty.z80'))
    base = list(read_bin_file(ROM48, 16384)) + list(ram)
    T.call(base, registers, T.BUILD)
    base[B.HOLD_CURRENT] = 1
    T.call(base, registers, B.HOLD_DRAW)
    paper = base[0x5BD1]

    all_cases = cases()
    screens = bytearray()
    for case in all_cases:
        memory = list(base)
        memory[CHARS] = case['chars'] & 0xFF
        memory[CHARS + 1] = case['chars'] >> 8
        if case['kind'] == 'object':
            memory[OBJECT:OBJECT + 16] = case['object']
            memory[ATTR_T] = (paper << 3) & 0xFF
            call_routine(memory, DRAW_SPRITE, {'IX': OBJECT})
        else:
            memory[ATTR_T] = ((paper << 3) | case['ink']) & 0xFF
            call_routine(memory, DRAW_BLOCK, {
                'A': case['code'], 'BC': case['b'] * 256 + case['c'],
                'DE': case['height'] * 256 + case['width']})
        screens += bytes(memory[0x4000:0x5B00])
    open(os.path.join(args.out, 'sprites.scr'), 'wb').write(screens)
    open(os.path.join(args.out, 'background.scr'), 'wb').write(bytes(base[0x4000:0x5B00]))
    with open(os.path.join(args.out, 'cases.json'), 'w') as f:
        json.dump({'hold': 1, 'paper': paper, 'cases': all_cases}, f)
    print('%d cases in %s' % (len(all_cases), args.out))


def call_routine(memory, address, registers):
    """The original's routine with the given registers, up to its RET."""
    memory[T.STACK] = T.SENTINEL & 0xFF
    memory[T.STACK + 1] = T.SENTINEL >> 8
    sim = T.Simulator(memory, dict({'IY': 0x5C3A, 'SP': T.STACK}, **registers))
    sim.registers[T.IFF] = 0
    sim.set_tracer(T.BorderTracer())
    sim.run(address, T.SENTINEL)


if __name__ == '__main__':
    main()
