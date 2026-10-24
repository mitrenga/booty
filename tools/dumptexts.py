#!/usr/bin/env python3
"""Extracts the texts from the program: `data/global.json#texts`.

    ./tools/dumptexts.py                # → data/global.json#texts

★ The game prints its texts in two ways (`sources/docs/texts.md`):

- **streams for ROM printing** – characters and control codes (`INK` 16,
  `PAPER` 17, `FLASH` 18, `BRIGHT` 19, `INVERSE` 20, `AT` 22) terminated by
  `$FF`, which the routine `$D60E` sends character by character to `RST $10`.
  The menu, `DEFINE KEYS`, `PRESS FIRE BUTTON` and the intro of the hidden
  game are written this way
- **a row of 32 characters** by its own routine `$E6DC` (panel template
  `$F2BB` in `data/global.json#panel`, `FIND THE GOLD KEY …` at `$E6BC`)

The file carries the streams **as they lie in memory** (bytes), with the
address and who prints them. A stream is read from its address up to `$FF`;
where the caller prints several streams in a row (menu: `$D60E` seven times,
DE runs on), they are here one by one in that order.

★ Menu (`$CDE3`–`$CE1B`): header, then six items; before an item `INVERSE 1`
is printed (`$D259`) when `$5BEA` is that item's value – `$24` KEYBOARD,
`$1C` INTERFACE 2, `$14` CURSOR, `$0C` KEMPSTON. Every item ends with
`INVERSE 0`.
"""
import argparse, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402

NAMES = {16: 'INK', 17: 'PAPER', 18: 'FLASH', 19: 'BRIGHT', 20: 'INVERSE', 21: 'OVER', 22: 'AT'}


def stream(mem, address):
    """Bytes of the stream from the address up to $FF (inclusive) and a readable transcript."""
    out, text, i = [], [], address - 0x4000
    while True:
        c = mem[i]
        out.append(c)
        i += 1
        if c == 0xFF:
            break
        if c in NAMES:
            n = 2 if c == 22 else 1
            args = list(mem[i:i + n])
            out.extend(args)
            i += n
            text.append('{%s %s}' % (NAMES[c], ','.join(map(str, args))))
        elif 0x20 <= c <= 0x7F:
            text.append('©' if c == 0x7F else chr(c))
        else:
            raise SystemExit('unknown code %d in stream $%04X' % (c, address))
    return out, ''.join(text), address + len(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    args = ap.parse_args()
    mem = B.memory_image()
    shown = []

    def segments(start, count, printed_by):
        out, a = [], start
        for _ in range(count):
            codes, text, nxt = stream(mem, a)
            out.append({'address': a, 'bytes': bytes(codes).hex()})
            shown.append((a, printed_by, text))
            a = nxt
        return out

    menu = segments(0xD9FD, 7, '$CDE3 / $D60E')
    data = {
        'menu': {
            'attrP': 0x00,
            'header': menu[0],
            'items': menu[1:],
            # ★ $CDE9-$CE0F: INVERSE 1 before an item when $5BEA = value
            'select': [0x24, 0x1C, 0x14, 0x0C, None, None],
        },
        'pressFire': segments(0xD16F, 1, '$D10C')[0],
        'goldfish': segments(0xDD9A, 1, '$CE44 (hidden game behind JP $D08A at $CE3E)')[0],
    }
    print('%s:' % B.write_section('texts', data))
    for address, printed_by, text in shown:
        print('  $%04X %-40s %s' % (address, printed_by, text))


if __name__ == '__main__':
    main()
