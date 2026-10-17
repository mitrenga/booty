#!/usr/bin/env python3
"""Vytáhne z programu texty: `data/global.json#texts`.

    ./tools/dumptexts.py                # → data/global.json#texts

★ Hra tiskne své texty dvojím způsobem (`sources/docs/texts.md`):

- **proudy pro ROM tisk** – znaky a řídicí kódy (`INK` 16, `PAPER` 17,
  `FLASH` 18, `BRIGHT` 19, `INVERSE` 20, `AT` 22) zakončené `$FF`, které
  rutina `$D60E` posílá po znaku do `RST $10`. Tak je napsané menu,
  `DEFINE KEYS`, `PRESS FIRE BUTTON` a úvod skryté hry
- **řádek po 32 znacích** vlastní rutinou `$E6DC` (šablona panelu `$F2BB`
  v `data/global.json#panel`, `FIND THE GOLD KEY …` na `$E6BC`)

Soubor nese proudy **tak, jak leží v paměti** (bajty), s adresou a s tím,
kdo je tiskne. Proud se čte od své adresy po `$FF`; kde volající tiskne
několik proudů za sebou (menu: `$D60E` sedmkrát, DE běží dál), jsou tu
jednotlivě v tom pořadí.

★ Menu (`$CDE3`–`$CE1B`): hlavička, pak šest položek; před položkou se
`INVERSE 1` vytiskne (`$D259`), když `$5BEA` je hodnota té položky – `$24`
KEYBOARD, `$1C` INTERFACE 2, `$14` CURSOR, `$0C` KEMPSTON. Každá položka
končí `INVERSE 0`.
"""
import argparse, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402

NAMES = {16: 'INK', 17: 'PAPER', 18: 'FLASH', 19: 'BRIGHT', 20: 'INVERSE', 21: 'OVER', 22: 'AT'}


def stream(mem, address):
    """Bajty proudu od adresy po $FF (včetně) a čitelný přepis."""
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
            raise SystemExit('neznámý kód %d v proudu $%04X' % (c, address))
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
            # ★ $CDE9-$CE0F: INVERSE 1 před položkou, když $5BEA = hodnota
            'select': [0x24, 0x1C, 0x14, 0x0C, None, None],
        },
        'pressFire': segments(0xD16F, 1, '$D10C')[0],
        'goldfish': segments(0xDD9A, 1, '$CE44 (skrytá hra za JP $D08A na $CE3E)')[0],
    }
    print('%s:' % B.write_section('texts', data))
    for address, printed_by, text in shown:
        print('  $%04X %-40s %s' % (address, printed_by, text))


if __name__ == '__main__':
    main()
