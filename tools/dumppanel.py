#!/usr/bin/env python3
"""Extracts the panel from the program: `data/global.json#panel`.

    ./tools/dumppanel.py                # → data/global.json#panel

★ The panel is printed by `$E0A9` right after the hold and by `$E064` (lives
and key), the number of the carried key then by the main loop in every pass
(`$DF5B`). Everything the file carries is read **from instruction operands**
at the stated addresses, and the tool first checks that the instruction it
expects is really at that address – if it were not, it fails instead of
silently taking another byte:

| what | from where |
|---|---|
| panel ink 6, paper = hold border (`$5BD0`) | `$E0B5` `LD A,$06`, `$E0BB` `LD A,($5BD0)` |
| row 23 template, 32 characters in the ROM font | `$E0C8` `LD DE,$F2BB` |
| collected loot, column 14 (C = $13), ROM `OUT-NUM-1` | `$E0D2`, `$E0D9` |
| remaining loot, column 28 (C = 5) | `$E0E0`, `$E0E7` |
| lives from column 0 (C = $21), character `$21` of set `$F15B`, then a space in the ROM font | `$E064`–`$E088` |
| key icon in column 4 (C = $1D), characters `$22 $23` of set `$F15B` | `$E08B`–`$E09F` |
| number of the carried key, column 6 (C = $1B), `'0'` + `($F241)` | `$DF68`, `$DF7C` |
| at game start: 3 lives, 0 collected, 125 remaining, key 0 | `$DEB2`, `$DEB8`, `$DEC3`, `$F255` (Jim's object template +$10) |
| text when 0 remain: `FIND THE GOLD KEY IN    SECONDS!` on row 22 | `$E10D` `LD DE,$E6BC` |

The ROM font itself is not in the file: it is in svision (`ZXFonts8x8`), and
★ the panel texts match it byte for byte (`sources/docs/screen_layout.md`).
"""
import argparse, base64, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    args = ap.parse_args()
    mem = B.memory_image()

    def at(address, n=1):
        return mem[address - 0x4000:address - 0x4000 + n]

    def expect(address, opcode):
        got = bytes(at(address, len(opcode)))
        if got != bytes(opcode):
            raise SystemExit('at $%04X expected %s, found %s' % (address, bytes(opcode).hex(), got.hex()))

    def ld_a(address):            # LD A,n
        expect(address, [0x3E])
        return at(address + 1)[0]

    def ld_word(address, opcode):  # LD rr,nn
        expect(address, opcode)
        b = at(address + len(opcode), 2)
        return b[0] | (b[1] << 8)

    def ld_c(address):            # LD C,n
        expect(address, [0x0E])
        return at(address + 1)[0]

    def ld_b(address):            # LD B,n
        expect(address, [0x06])
        return at(address + 1)[0]

    template = ld_word(0xE0C8, [0x11])
    gold = ld_word(0xE10D, [0x11])
    icons = ld_word(0xE064, [0x21])
    expect(0xE0BB, [0x3A, 0xD0, 0x5B])

    data = {
        'row': 1,
        'ink': ld_a(0xE0B5),
        'template': {'address': template, 'c': ld_c(0xE0BF),
                     'text': bytes(at(template, 32)).decode('latin1')},
        'booty': {'c': ld_c(0xE0D2), 'start': ld_word(0xDEB5, [0x01])},
        'treasure': {'c': ld_c(0xE0E0), 'start': ld_word(0xDEC0, [0x01])},
        'lives': {'c': ld_c(0xE06A), 'code': ld_a(0xE079), 'start': ld_a(0xDEB0)},
        'keyIcon': {'c': ld_c(0xE08B), 'codes': [ld_a(0xE098), ld_a(0xE09D)]},
        'keyNumber': {'c': ld_c(0xDF68), 'start': at(0xF255)[0]},
        'icons': {'chars': icons,
                  'bytes': base64.b64encode(bytes(at(icons + 8 * 0x21, 24))).decode('ascii')},
        'goldKey': {'address': gold, 'text': bytes(at(gold, 32)).decode('latin1'),
                    'ink': ld_a(0xE0FA), 'b': ld_b(0xE104), 'c': ld_c(0xE106)},
    }
    where = B.write_section('panel', data)
    print('%s: template %r, lives %d, loot %d/%d, key %d'
          % (where, data['template']['text'], data['lives']['start'],
             data['booty']['start'], data['treasure']['start'], data['keyNumber']['start']))


if __name__ == '__main__':
    main()
