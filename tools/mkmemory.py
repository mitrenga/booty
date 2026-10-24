#!/usr/bin/env python3
"""Initial memory of the remake: `data/global.json#memory`.

    ./tools/mkmemory.py

`app/bootyLogic.js` works over 64 KB of memory laid out as in the original.
At the start of the game it must contain what the original **reads as data**
at that moment: hold tables, scenery and sprite glyphs, object templates,
texts, variables. **The code is not in it** – that is rewritten in
`bootyLogic.js` – and the tool guards that: every area is checked against
`sources/asm/booty.ctl` that it does not reach into any code block (`c`).

It is taken from the original's memory at the moment the menu starts the game
(`CALL $DEA8`, `build/trace/walk/start.bin` from `tools/tracephysics.py`).
The ROM font (`$3D00`–`$3FFF`) is not in the file: svision supplies it
(`ZXFonts8x8`).

Proof that it suffices: `tools/matchstart.mjs` starts a new game from that
memory (`BootyLogic.newGame`) and whole recordings of the original –
**0 differences**.
"""
import base64, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
ROOT = os.path.dirname(HERE)

SEGMENTS = [
    (0x5BCC, 0x5C00, 'game variables (hold colours, keys $5BEB, mode $5BF0, lives, loot)'),
    (0x5C00, 0x5CC0, 'ROM system variables (CHARS, ATTR, DF-CC, S-POSN …)'),
    (0x8378, 0xA06C, 'scenery glyphs ($8378, $8678) and sprite sets ($8978, $8E28, $914C, $924C, $934C, $9F6C)'),
    (0xA06C, 0xA1C4, 'block of zeros $A06C (for the sprite) and sprite buffer'),
    (0xABD6, 0xBAA1, 'tables of the 21 holds'),
    (0xBAA1, 0xBCCB, 'hold drawing variables, pointers, buffer $BAD7 (what the game does not overwrite stays from the tape)'),
    (0xCB95, 0xCB96, 'byte after the working copy of the holds (leftover from the tape, is compared)'),
    (0xDFBB, 0xDFCB, 'gold key glyph (CHARS $DEBB)'),
    (0xE46F, 0xE47A, 'explosion variables'),
    (0xE6BC, 0xE6DC, 'text FIND THE GOLD KEY IN    SECONDS!'),
    (0xE820, 0xE821, 'platform under Jim'),
    (0xF231, 0xF346, "Jim's object and template, fragment templates, floors, panel, icons, platforms, generator state"),
    (0xFFF7, 0x10000, 'sound: cadence, tune on, slots'),
]


def code_ranges():
    lines = [l for l in open(os.path.join(ROOT, 'sources', 'asm', 'booty.ctl'))
             if l[:2] in ('c ', 'b ', 't ', 's ', 'u ', 'w ')]
    entries = sorted((int(l.split()[1][1:], 16), l[0]) for l in lines)
    out = []
    for i, (a, kind) in enumerate(entries):
        if kind == 'c':
            out.append((a, entries[i + 1][0] if i + 1 < len(entries) else 0x10000))
    return out


def main():
    start = open(os.path.join(ROOT, 'build', 'trace', 'walk', 'start.bin'), 'rb').read()
    code = code_ranges()
    data = {'segments': []}
    for lo, hi, what in SEGMENTS:
        clash = [(a, b) for a, b in code if a < hi and b > lo]
        if clash:
            raise SystemExit('$%04X-$%04X reaches into code: %s'
                             % (lo, hi - 1, ', '.join('$%04X' % a for a, b in clash)))
        data['segments'].append({'address': lo, 'length': hi - lo,
                                 'bytes': base64.b64encode(start[lo:hi]).decode('ascii')})
    print('%s: %d areas, %d B' % (B.write_section('memory', data), len(SEGMENTS), sum(hi - lo for lo, hi, w in SEGMENTS)))


if __name__ == '__main__':
    main()
