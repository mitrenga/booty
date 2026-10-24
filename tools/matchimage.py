#!/usr/bin/env python3
"""Verifies that `tools/bootylib.py` assembles the memory image **exactly as the
machine assembles it**.

    ./tools/matchimage.py

The Booty code on the tape is not scrambled, but it gets into memory by four
routes (`sources/docs/tape_layout.md`): `LOAD "" CODE 26880` overrides the
address from the header, the second turbo block lies in the printer buffer
and 62 B of it are copied **over** the loaded code at `$CD14`. Whoever
assembles it by eye gets `JP $6900` at `$CD14` – a decoy that sends the game
back into the loader.

It is compared against the **simulator's memory** at the moment of
`RANDOMIZE USR 52500` (`build/booty.bin` from `./tools/mksnapshot.sh`), by
areas:

- `$5B01`–`$5B47` buffer with the second turbo block
- `$6900`–`$FFFE` game code and data, including the 62 B at `$CD14`
- `$4000`–`$5AFF` screen – **informative only**: BASIC prints on it between
  loading the SCREEN$ and jumping into the game (`PRINT AT 19,0;`, the
  `Bytes: bc` report), so a difference is a finding, not an error. The loading
  screen is checked by `matchloading.py`

Acceptance criterion M0: 38 726 checks (71 + 38 655), zero differences.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B   # noqa: E402

AREAS = (('printer buffer (2nd turbo block)', B.LOADER_BUF, 71, True),
         ('game code $6900-$FFFE', B.CODE_LOAD, B.CODE_LEN, True),
         ('screen (informative)', 0x4000, 6912, False))


def main():
    snap = os.path.join(B.ROOT, 'build', 'booty.bin')
    if not os.path.exists(snap):
        raise SystemExit('%s is missing – run ./tools/mksnapshot.sh' % snap)
    ram = open(snap, 'rb').read()
    mine = B.memory_image()
    checks = bad = 0
    for name, start, n, counts in AREAS:
        lo = start - 0x4000
        diffs = [start + i for i in range(n) if ram[lo + i] != mine[lo + i]]
        print('%-34s $%04X-$%04X: %6d checks, %s%d differences'
              % (name, start, start + n - 1, n, '' if counts else '(', len(diffs))
              + ('' if counts else ')'))
        for a in diffs[:8]:
            print('   $%04X: simulator $%02X, bootylib $%02X'
                  % (a, ram[a - 0x4000], mine[a - 0x4000]))
        if len(diffs) > 8:
            print('   … and %d more' % (len(diffs) - 8))
        if counts:
            checks += n
            bad += len(diffs)
    p = B.patch_target() - 0x4000
    print('at $%04X there is %s' % (B.ENTRY, mine[p:p + 3].hex(' ')))
    print('total %d checks, **%d differences**' % (checks, bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
