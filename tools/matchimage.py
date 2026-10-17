#!/usr/bin/env python3
"""Ověří, že `tools/bootylib.py` složí obraz paměti **přesně tak, jak ho
složí stroj**.

    ./tools/matchimage.py

Kód Booty na kazetě zamíchaný není, ale do paměti se dostává čtyřmi cestami
(`sources/docs/tape_layout.md`): `LOAD "" CODE 26880` přebije adresu
z hlavičky, druhý turbo blok leží v bufferu tiskárny a 62 B z něj se
zkopíruje **přes** nahraný kód na `$CD14`. Kdo to složí od oka, dostane na
`$CD14` `JP $6900` – podvrh, který hru vrátí do zavaděče.

Porovnává se proti **paměti simulátoru** v okamžiku `RANDOMIZE USR 52500`
(`build/booty.bin` z `./tools/mksnapshot.sh`), po oblastech:

- `$5B01`–`$5B47` buffer s druhým turbo blokem
- `$6900`–`$FFFE` kód a data hry, včetně 62 B na `$CD14`
- `$4000`–`$5AFF` obrazovka – **jen informativně**: BASIC na ni mezi
  nahráním SCREEN$ a skokem do hry tiskne (`PRINT AT 19,0;`, hlášení
  `Bytes: bc`), takže rozdíl je nález, ne chyba. Loading screen kontroluje
  `matchloading.py`

Akceptační kritérium M0: 38 726 kontrol (71 + 38 655), nula rozdílů.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B   # noqa: E402

AREAS = (('buffer tiskárny (2. turbo blok)', B.LOADER_BUF, 71, True),
         ('kód hry $6900-$FFFE', B.CODE_LOAD, B.CODE_LEN, True),
         ('obrazovka (informativně)', 0x4000, 6912, False))


def main():
    snap = os.path.join(B.ROOT, 'build', 'booty.bin')
    if not os.path.exists(snap):
        raise SystemExit('chybi %s – spust ./tools/mksnapshot.sh' % snap)
    ram = open(snap, 'rb').read()
    mine = B.memory_image()
    checks = bad = 0
    for name, start, n, counts in AREAS:
        lo = start - 0x4000
        diffs = [start + i for i in range(n) if ram[lo + i] != mine[lo + i]]
        print('%-34s $%04X-$%04X: %6d kontrol, %s%d rozdílů'
              % (name, start, start + n - 1, n, '' if counts else '(', len(diffs))
              + ('' if counts else ')'))
        for a in diffs[:8]:
            print('   $%04X: simulátor $%02X, bootylib $%02X'
                  % (a, ram[a - 0x4000], mine[a - 0x4000]))
        if len(diffs) > 8:
            print('   … a dalších %d' % (len(diffs) - 8))
        if counts:
            checks += n
            bad += len(diffs)
    p = B.patch_target() - 0x4000
    print('na $%04X je %s' % (B.ENTRY, mine[p:p + 3].hex(' ')))
    print('celkem %d kontrol, **%d rozdílů**' % (checks, bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
