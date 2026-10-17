#!/usr/bin/env python3
"""Ověří, že loading screen je **doopravdy to, co kazeta nahraje** – a co je
po nahrání vidět.

    ./tools/matchloading.py

1. blok SCREEN$ `bs` z kazety (`tools/bootylib.py`) proti
   `sources/media/screens/loading_screen.scr` – bajt po bajtu
2. proti `data/global.json#loading`, pokud už je (M1) – bajt po bajtu
3. proti **paměti simulátoru** v okamžiku `RANDOMIZE USR 52500`
   (`build/booty.bin`) – **po pixelech, s rozlišenými barvami** (49 152
   pixelů, FLASH v obou fázích). Bajtově se tu lišit smí a liší: BASIC
   natiskne na řádek 20 hlášení ROM `Bytes: bc`, ale do buněk s atributem
   `$00`, takže ho nikdo neuvidí (`sources/docs/tape_layout.md`). Kontroluje
   se tedy to, co stroj ukáže, ne co má v paměti

Akceptační kritérium: nula rozdílů ve všech porovnáních.
"""
import base64, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B   # noqa: E402

SCR = os.path.join(B.ROOT, 'sources', 'media', 'screens', 'loading_screen.scr')
JSON = B.DATA


def pixels(scr, phase):
    """256×192 indexů barev (0–15) tak, jak je ukáže ULA."""
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
            print('%-34s tu není – přeskočeno' % name)
            continue
        buf = (base64.b64decode(B.read_section('loading')['videoRAM'])
               if path.endswith('.json') else open(path, 'rb').read())
        d = 6912 if len(buf) != 6912 else sum(1 for a, b in zip(tape, buf) if a != b)
        print('%-34s %6d kontrol, %d rozdílů (bajty)' % (name, 6912, d))
        total += 6912
        bad += d

    snap = os.path.join(B.ROOT, 'build', 'booty.bin')
    if not os.path.exists(snap):
        raise SystemExit('chybi %s – spust ./tools/mksnapshot.sh' % snap)
    mem = open(snap, 'rb').read()[:6912]
    raw = sum(1 for a, b in zip(tape, mem) if a != b)
    for phase in (0, 1):
        d = sum(1 for a, b in zip(pixels(tape, phase), pixels(mem, phase)) if a != b)
        print('%-34s %6d kontrol, %d rozdílů (pixely, FLASH fáze %d)'
              % ('simulátor po nahrání', 49152, d, phase))
        total += 49152
        bad += d
    print('   (bajtově se paměť liší ve %d B – neviditelné `Bytes: bc`)' % raw)
    print('celkem %d kontrol, **%d rozdílů**' % (total, bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
