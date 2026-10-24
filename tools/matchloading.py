#!/usr/bin/env python3
"""Verifies that the loading screen is **really what the tape loads** – and
what is visible after loading.

    ./tools/matchloading.py

1. the SCREEN$ block `bs` from the tape (`tools/bootylib.py`) against
   `sources/media/screens/loading_screen.scr` – byte by byte
2. against `data/global.json#loading`, if it exists already (M1) – byte by byte
3. against the **simulator's memory** at the moment of `RANDOMIZE USR 52500`
   (`build/booty.bin`) – **by pixels, with colours resolved** (49 152 pixels,
   FLASH in both phases). Byte-wise it may differ here and does: BASIC prints
   the ROM report `Bytes: bc` on row 20, but into cells with attribute `$00`,
   so nobody sees it (`sources/docs/tape_layout.md`). What is checked is
   therefore what the machine shows, not what it has in memory

Acceptance criterion: zero differences in all comparisons.
"""
import base64, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B   # noqa: E402

SCR = os.path.join(B.ROOT, 'sources', 'media', 'screens', 'loading_screen.scr')
JSON = B.DATA


def pixels(scr, phase):
    """256×192 colour indices (0–15) as the ULA shows them."""
    out = []
    for y in range(192):
        o = ((y >> 6) << 11) | ((y & 7) << 8) | (((y >> 3) & 7) << 5)
        for cx in range(32):
            a = scr[6144 + (y >> 3) * 32 + cx]
            ink, paper = (a & 7) | ((a >> 3) & 8), ((a >> 3) & 7) | ((a >> 3) & 8)
            if a & 0x80 and phase:
                ink, paper = paper, ink
            b = scr[o + cx]
            out.extend(ink if b & (0x80 >> k) else paper for k in range(8))
    return out


def main():
    tape = B.loading_screen()
    total = bad = 0

    for name, path in (('sources/.../loading_screen.scr', SCR), ('data/global.json#loading', JSON)):
        if not os.path.exists(path):
            print('%-34s is not here – skipped' % name)
            continue
        buf = (base64.b64decode(B.read_section('loading')['videoRAM'])
               if path.endswith('.json') else open(path, 'rb').read())
        d = 6912 if len(buf) != 6912 else sum(1 for a, b in zip(tape, buf) if a != b)
        print('%-34s %6d checks, %d differences (bytes)' % (name, 6912, d))
        total += 6912
        bad += d

    snap = os.path.join(B.ROOT, 'build', 'booty.bin')
    if not os.path.exists(snap):
        raise SystemExit('%s is missing – run ./tools/mksnapshot.sh' % snap)
    mem = open(snap, 'rb').read()[:6912]
    raw = sum(1 for a, b in zip(tape, mem) if a != b)
    for phase in (0, 1):
        d = sum(1 for a, b in zip(pixels(tape, phase), pixels(mem, phase)) if a != b)
        print('%-34s %6d checks, %d differences (pixels, FLASH phase %d)'
              % ('simulator after loading', 49152, d, phase))
        total += 49152
        bad += d
    print('   (byte-wise the memory differs in %d B – the invisible `Bytes: bc`)' % raw)
    print('total %d checks, **%d differences**' % (total, bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
