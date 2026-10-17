#!/usr/bin/env python3
"""Nechá **kód originálu** nakreslit sprity a bloky a uloží, co nakreslil.

    ./tools/tracesprites.py [--out build/ref/sprites]

Referenční snímky pro `tools/matchsprites.mjs`. Ze stavu hry ve chvíli,
kdy sama kreslí první podpalubí (`tools/traceholds.py`), se pro každý
případ:

1. nakreslí podpalubí 1 kódem originálu (`$AA97`, `$A811`) – pozadí
2. do `CHARS` se zapíše sada grafiky a do `ATTR-T` papír podpalubí (to
   dělá hlavní smyčka na `$DF13`; u bloků i inkoust, který jim nastaví
   volající), a zavolá se rutina originálu:
   - **objekt**: na `$F231` (Jimův objekt) se zapíše objekt případu
     a zavolá se **`$EED7`**
   - **blok**: s registry A (kód), E × D (šířka × výška), C, B se zavolá
     **`$EA93`**
3. uloží se videopaměť

Případy (`OBJECTS`, `BLOCKS` níž): Jim, piráti, tvor z časovače (krysa,
papoušek) a plošiny v každém snímku, který hra používá, ve všech 16
kombinacích jemné polohy, uprostřed, o jeden a o dva sloupce za levým
okrajem a u pravého okraje; okénka, výbuch, padací dveře, prázdné místo
a úlomek výbuchu uprostřed, u pravého okraje i za ním. Seznam jde do
`cases.json`, aby remake kreslil přesně totéž.
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
import traceholds as T                                           # noqa: E402
from skoolkit import ROM48, read_bin_file                       # noqa: E402

DRAW_SPRITE = 0xEED7     # ★ sprite rutina (Jim $ECC4, piráti $F007)
OBJECT = 0xF231          # ★ Jimův objekt – sem se zapíše objekt případu
CHARS, ATTR_T = 0x5C36, 0x5C8F

DRAW_BLOCK = 0xEA93      # ★ blok: okénka, výbuch, úlomky, padací dveře

# Objekty přes $EED7: (sada, CHARS, šířka, výška, inkoust, kódy). ★ Kódy jsou
# ty, které hra posílá (piráti +6 dokola v $20-$44 a $50-$7A, $F01E-$F032;
# tvor z časovače $E12A: 4 × 1 $20/$24 a 2 × 2 od $28 po 8, $E290; plošiny
# z LIDAT 33 a 36). ? U Jima se zkouší celá sada po 6 znacích – které kódy
# používá v chůzi, je M3.
OBJECTS = [('jim', 0x8978, 2, 3, 5, list(range(32, 123, 6))),
           ('pirate', 0x8E28, 2, 3, 7, list(range(32, 69, 6)) + list(range(80, 123, 6))),
           ('pirate', 0x8E28, 2, 2, 5, [32, 38, 44, 50, 56, 62, 68]),
           ('creature', 0x934C, 4, 1, 3, [32, 36]),
           ('creature', 0x934C, 2, 2, 6, [40, 44, 48, 52, 56, 60, 64, 68]),
           ('platform', 0xF17B, 3, 1, 5, [33, 36]),
           ('platform', 0xF17B, 4, 1, 4, [33, 36])]
# uprostřed, o sloupec a o dva mimo levý okraj, u pravého okraje (C = 2)
PLACES = [('middle', 16, 21), ('left', 34, 13), ('far-left', 35, 18), ('right', 3, 8)]

# Bloky přes $EA93: (sada, CHARS, kód, šířka, výška, inkoust)
BLOCKS = ([('porthole', 0x914C, code, 2, 2, 5) for code in range(32, 61, 4)]
          + [('explosion', 0x924C, code, 2, 2, 6) for code in range(36, 61, 4)]
          + [('blank', 0x9F6C, 32, width, 1, 7) for width in range(1, 6)]
          + [('blank', 0x9F6C, 32, 2, 2, 6)]
          + [('icons', 0xF15B, 32, 1, 1, 7)])
# uprostřed; začíná v předposledním a v posledním sloupci (C = 3, C = 2:
# ořez a posun čísel); za pravým okrajem (C = 1, nic)
BLOCK_PLACES = [('middle', 16, 13), ('right', 3, 8), ('edge', 2, 18), ('beyond', 1, 3)]


def cases():
    out = []
    for bank, chars, width, height, ink, frames in OBJECTS:
        for frame in frames:
            for place, c, b in PLACES:
                for px in range(4):
                    for py in range(4):
                        obj = [c, b, px, py, 0, 0, frame, width, height, ink,
                               1, 0, 0, c, b, py]
                        out.append({'kind': 'object', 'bank': bank, 'chars': chars,
                                    'frame': frame, 'place': place, 'object': obj})
    for bank, chars, code, width, height, ink in BLOCKS:
        for place, c, b in BLOCK_PLACES:
            out.append({'kind': 'block', 'bank': bank, 'chars': chars, 'code': code,
                        'width': width, 'height': height, 'ink': ink,
                        'place': place, 'c': c, 'b': b})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(B.ROOT, 'build', 'ref', 'sprites'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    ram, registers = T.game_ram(os.path.join(B.ROOT, 'build', 'booty.z80'))
    base = list(read_bin_file(ROM48, 16384)) + list(ram)
    T.call(base, registers, T.BUILD)
    base[B.HOLD_CURRENT] = 1
    T.call(base, registers, B.HOLD_DRAW)
    paper = base[0x5BD1]

    all_cases = cases()
    screens = bytearray()
    for case in all_cases:
        memory = list(base)
        memory[CHARS] = case['chars'] & 0xFF
        memory[CHARS + 1] = case['chars'] >> 8
        if case['kind'] == 'object':
            memory[OBJECT:OBJECT + 16] = case['object']
            memory[ATTR_T] = (paper << 3) & 0xFF
            call_routine(memory, DRAW_SPRITE, {'IX': OBJECT})
        else:
            memory[ATTR_T] = ((paper << 3) | case['ink']) & 0xFF
            call_routine(memory, DRAW_BLOCK, {
                'A': case['code'], 'BC': case['b'] * 256 + case['c'],
                'DE': case['height'] * 256 + case['width']})
        screens += bytes(memory[0x4000:0x5B00])
    open(os.path.join(args.out, 'sprites.scr'), 'wb').write(screens)
    open(os.path.join(args.out, 'background.scr'), 'wb').write(bytes(base[0x4000:0x5B00]))
    with open(os.path.join(args.out, 'cases.json'), 'w') as f:
        json.dump({'hold': 1, 'paper': paper, 'cases': all_cases}, f)
    print('%d případů v %s' % (len(all_cases), args.out))


def call_routine(memory, address, registers):
    """Rutina originálu s danými registry, až po její RET."""
    memory[T.STACK] = T.SENTINEL & 0xFF
    memory[T.STACK + 1] = T.SENTINEL >> 8
    sim = T.Simulator(memory, dict({'IY': 0x5C3A, 'SP': T.STACK}, **registers))
    sim.registers[T.IFF] = 0
    sim.set_tracer(T.BorderTracer())
    sim.run(address, T.SENTINEL)


if __name__ == '__main__':
    main()
