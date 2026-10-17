#!/usr/bin/env python3
"""Výchozí stav hry z běžícího originálu: `data/global.json#global`.

    ./tools/mkglobal.py                # → data/global.json#global

Hra se spustí v simulátoru jako v `playtrace.py` (titulka → `SPACE` → menu →
`0`) a na snímku `FRAME` se z paměti přečtou její vlastní proměnné:

| klíč | odkud | |
|---|---|---|
| `hold` | `$5BD3` | ★ podpalubí, ve kterém hra začíná |
| `jim` | `$F231`, 20 B | ★ Jimův objekt, jak leží v paměti |
| `lives` | `$5BF1` | ★ |
| `booty`, `treasure` | `$5BF4`, `$5BF2` | ★ sebraná a zbývající kořist |

★ **Proč `jim` a ne jen šablona.** Šablona má Jima o řádek výš (B = 22);
po startu hra Jima během ≈ 7 snímků spustí o řádek níž (B = 21, svislá
fáze 3 → 2 → 1 → 0 → 3) a tam stojí – tam ho ukazuje i obrazovka originálu.
Ten pád je fyzika a ta je **M3**. Do té doby remake kreslí Jima tam, kde ho
originál po dopadu změřeně má. Šablonu (`$F245`, 20 B, kterou `$DECE` do
`$F231` zkopíruje na začátku hry) nástroj jen ověří proti kazetě – do dat
nejde, od M3 ji má worker v paměti originálu (sekce `memory`).
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
        raise SystemExit('šablona Jima v běhu není táž jako na kazetě')
    where = B.write_section('global', data)
    print('%s: podpalubí %d, Jim %s, životy %d, kořist %d/%d'
          % (where, data['hold'], data['jim'][:4], data['lives'], data['booty'],
             data['treasure']))


if __name__ == '__main__':
    main()
