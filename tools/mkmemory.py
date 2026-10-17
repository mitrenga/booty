#!/usr/bin/env python3
"""Výchozí paměť remaku: `data/global.json#memory`.

    ./tools/mkmemory.py

`app/bootyLogic.js` pracuje nad 64 KB paměti rozložené jako u originálu.
Na začátku hry v ní musí být to, co originál v té chvíli **čte jako data**:
tabulky podpalubí, glyfy kulisy a spritů, šablony objektů, texty, proměnné.
**Kód v ní není** – ten je přepsaný v `bootyLogic.js` – a nástroj to hlídá:
každá oblast se ověří proti `sources/asm/booty.ctl`, že nezasahuje do
žádného bloku kódu (`c`).

Bere se z paměti originálu ve chvíli, kdy menu spouští hru (`CALL $DEA8`,
`build/trace/walk/start.bin` z `tools/tracephysics.py`). ROM font
(`$3D00`–`$3FFF`) v souboru není: ten dodá svision (`ZXFonts8x8`).

Doklad, že to stačí: `tools/matchstart.mjs` z té paměti spustí novou hru
(`BootyLogic.newGame`) a celé záznamy originálu – **0 rozdílů**.
"""
import base64, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
ROOT = os.path.dirname(HERE)

SEGMENTS = [
    (0x5BCC, 0x5C00, 'proměnné hry (barvy podpalubí, klávesy $5BEB, mód $5BF0, životy, kořist)'),
    (0x5C00, 0x5CC0, 'systémové proměnné ROM (CHARS, ATTR, DF-CC, S-POSN …)'),
    (0x8378, 0xA06C, 'glyfy kulisy ($8378, $8678) a sady spritů ($8978, $8E28, $914C, $924C, $934C, $9F6C)'),
    (0xA06C, 0xA1C4, 'blok nul $A06C (pro sprite) a buffer spritu'),
    (0xABD6, 0xBAA1, 'tabulky 21 podpalubí'),
    (0xBAA1, 0xBCCB, 'proměnné kreslení podpalubí, ukazatele, buffer $BAD7 (co v něm hra nepřepíše, zůstane z kazety)'),
    (0xCB95, 0xCB96, 'bajt za pracovní kopií podpalubí (zbytek z kazety, porovnává se)'),
    (0xDFBB, 0xDFCB, 'glyf zlatého klíče (CHARS $DEBB)'),
    (0xE46F, 0xE47A, 'proměnné výbuchu'),
    (0xE6BC, 0xE6DC, 'text FIND THE GOLD KEY IN    SECONDS!'),
    (0xE820, 0xE821, 'plošina pod Jimem'),
    (0xF231, 0xF346, 'Jimův objekt a šablona, šablony úlomků, patra, panel, ikony, plošiny, stav generátoru'),
    (0xFFF7, 0x10000, 'zvuk: tempo, melodie zapnutá, sloty'),
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
            raise SystemExit('$%04X-$%04X zasahuje do kódu: %s'
                             % (lo, hi - 1, ', '.join('$%04X' % a for a, b in clash)))
        data['segments'].append({'address': lo, 'length': hi - lo,
                                 'bytes': base64.b64encode(start[lo:hi]).decode('ascii')})
    print('%s: %d oblastí, %d B' % (B.write_section('memory', data), len(SEGMENTS), sum(hi - lo for lo, hi, w in SEGMENTS)))


if __name__ == '__main__':
    main()
