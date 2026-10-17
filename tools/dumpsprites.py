#!/usr/bin/env python3
"""Vytáhne z programu grafiku spritů a bloků: `data/global.json#sprites`.

    ./tools/dumpsprites.py                # → data/global.json#sprites

★ Pohyblivé věci kreslí dvě rutiny (`sources/docs/sprites.md`):

- **`$EED7`** – sprite: objekt předsunutý o jemnou polohu do bufferu
  a vytištěný jako znaky. Jim, piráti, krysa a papoušek, plošiny
- **`$EA93`** – blok: obdélník znaků číslovaných dál, bez jemné polohy.
  Okénka, výbuch, úlomky výbuchu, padací dveře

Obě berou grafiku z `CHARS` + 8 × kód, kde `CHARS` nastaví volající.
Do souboru jde každá sada od znaku 32 tak, jak ji vidí hra – **z paměti
běžící hry na začátku** (snímek 399, jako `tools/mkglobal.py`), protože
jedna sada leží v RAM, kterou hra při startu přepíše: `$9F6C` + 256 =
`$A06C`, blok 128 nul (`$CD56`). U ostatních sad nástroj ověří, že jsou
v běžící hře bajt po bajtu stejné jako na kazetě.

| sada | `CHARS` | kdo ji nastaví | co |
|---|---|---|---|
| `jim` | `$8978` | `$ECC4` | ★ Jim, objekt `$F231` |
| `pirate` | `$8E28` | `$F007` | ★ objekty `OPST` (piráti) |
| `creature` | `$934C` | `$E239` | ★ objekt `$F31C` z časovače `$E12A`: 4 × 1 (? krysa) nebo 2 × 2 (? papoušek) |
| `platform` | `$F17B` | `$E82D` | ★ objekty `LIDAT` (? pohyblivé plošiny) |
| `porthole` | `$914C` | `$F1FC` | ★ bloky `PHDAT` 2 × 2, kód + 4 dokola (? okénka) |
| `explosion` | `$924C` | `$E48C` | ★ výbuch nastražené kořisti, blok 2 × 2 |
| `blank` | `$9F6C` | `$E593`, `$E637` | ★ padací dveře (`TDDAT`) a místo po kořisti – znaky z bloku nul |
| `icons` | `$F15B` | `$E064`, `$E3EA` | ★ ikony panelu (`$21`–`$23`) a úlomek výbuchu (`$20`) |
"""
import argparse, base64, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
sys.path.insert(0, B.RETRO)
import playtrace                                                 # noqa: E402

FIRST = 32
# jméno: (CHARS, kdo ji nastaví, kolik znaků od 32, jen z běhu)
BANKS = {
    'jim': (0x8978, '$ECC4', 96, False),
    'pirate': (0x8E28, '$F007', 96, False),
    'creature': (0x934C, '$E239', 96, False),
    'platform': (0xF17B, '$E82D', 16, False),
    'porthole': (0x914C, '$F1FC', 48, False),
    'explosion': (0x924C, '$E48C', 48, False),
    'blank': (0x9F6C, '$E593', 16, True),
    'icons': (0xF15B, '$E064', 4, False),
}
SCRIPT = [(200, 210, 'SPACE'), (300, 310, '0')]
FRAME = 399


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    args = ap.parse_args()
    work = os.path.join(B.ROOT, 'build', 'm2')
    path = os.path.join(work, 'ram%05d.bin' % FRAME)
    if not os.path.exists(path):
        os.makedirs(work, exist_ok=True)
        playtrace.run(os.path.join(B.ROOT, 'build', 'booty.z80'), FRAME + 1, work, None,
                      SCRIPT, (), {FRAME})
    ram = open(path, 'rb').read()
    tape = B.memory_image()

    data = {'firstCode': FIRST, 'banks': {}}
    for name, (chars, setter, count, runtime) in BANKS.items():
        start, end = chars + 8 * FIRST - 0x4000, chars + 8 * (FIRST + count) - 0x4000
        run_bytes = ram[start:end]
        if not runtime and run_bytes != tape[start:end]:
            raise SystemExit('sada %s se v běhu liší od kazety' % name)
        data['banks'][name] = {'chars': chars, 'codes': [FIRST, FIRST + count - 1],
                               'bytes': base64.b64encode(run_bytes).decode('ascii')}
    print('%s: %s' % (B.write_section('sprites', data), ', '.join('%s $%04X' % (n, b[0]) for n, b in BANKS.items())))


if __name__ == '__main__':
    main()
