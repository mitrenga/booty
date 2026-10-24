#!/usr/bin/env python3
"""Initial game state from the running original: `data/global.json#global`.

    ./tools/mkglobal.py                # → data/global.json#global

The game is started in the simulator as in `playtrace.py` (title → `SPACE` →
menu → `0`) and on frame `FRAME` its own variables are read from memory:

| key | from where | |
|---|---|---|
| `hold` | `$5BD3` | ★ the hold the game starts in |
| `jim` | `$F231`, 20 B | ★ Jim's object as it lies in memory |
| `lives` | `$5BF1` | ★ |
| `booty`, `treasure` | `$5BF4`, `$5BF2` | ★ collected and remaining loot |

★ **Why `jim` and not just the template.** The template has Jim one row
higher (B = 22); after the start the game drops Jim one row down within ≈ 7
frames (B = 21, vertical phase 3 → 2 → 1 → 0 → 3) and there he stands – that
is where the original's screen shows him too. That fall is physics and that is
**M3**. Until then the remake draws Jim where the original measurably has him
after landing. The template (`$F245`, 20 B, which `$DECE` copies to `$F231`
at game start) is only verified by the tool against the tape – it does not go
into the data, from M3 on the worker has it in the original's memory (section
`memory`).
"""
import argparse, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
sys.path.insert(0, B.RETRO)
import playtrace                                                 # noqa: E402

SCRIPT = [(200, 210, 'SPACE'), (300, 310, '0')]
FRAME = 399


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    args = ap.parse_args()
    work = os.path.join(B.ROOT, 'build', 'm2')
    os.makedirs(work, exist_ok=True)
    playtrace.run(os.path.join(B.ROOT, 'build', 'booty.z80'), FRAME + 1, work, None,
                  SCRIPT, (), {FRAME})
    ram = open(os.path.join(work, 'ram%05d.bin' % FRAME), 'rb').read()

    def peek(address, n=1):
        return list(ram[address - 0x4000:address - 0x4000 + n])

    def word(address):
        b = peek(address, 2)
        return b[0] | (b[1] << 8)

    data = {
        'hold': peek(B.HOLD_CURRENT)[0],
        'jim': peek(0xF231, 20),
        'lives': peek(0x5BF1)[0],
        'booty': word(0x5BF4),
        'treasure': word(0x5BF2),
    }
    if peek(0xF245, 20) != list(B.memory_image()[0xF245 - 0x4000:0xF245 - 0x4000 + 20]):
        raise SystemExit("Jim's template in the run is not the same as on the tape")
    where = B.write_section('global', data)
    print('%s: hold %d, Jim %s, lives %d, loot %d/%d'
          % (where, data['hold'], data['jim'][:4], data['lives'], data['booty'],
             data['treasure']))


if __name__ == '__main__':
    main()
