#!/usr/bin/env python3
"""Zvuk originálu jako data → `data/global.json#sounds`.

    ./tools/mksounds.py

★ Všechno z kódu na kazetě (`tools/bootylib.py` `memory_image()`), z ROM
a z měření `tools/tracesound.py` (`build/sound/paths.json`):

- `tune` – melodie: tabulka na `$FA00`, čtveřice `E D C B` až po `$FF`,
  tedy `[DE, BC]` pro `$F648` (DE půlvln po dvou, BC zpoždění); `[0, 0]`
  je pauza. `tuneMask` je `$FFF7` (nota každé `mask + 1` obsluze) a
  `tuneOn` `$FFF8` – oboje nastaví `$CD14` za běhu, bere se z titulky
- `slots` – parametry rutin slotů z operandů (`LD BC,nn` / `LD DE,nn` /
  `LD B,n`, s kontrolou opcodu), tak jak je obsluha `$FE69` volá:
  `$FFFB`+`$FFFC` smrt, `$FFFF` 1/2 tvor, `$FFFD` 1/2 výbuch a úlomky,
  `$FFFE` 1–6 jednorázové
- `beeper` – ★ `(DE, HL)` volání ROM `BEEPER` ve hře
- `noise` – ROM `$0000`–`$1FFF` (base64): šum `$F618` bere délku půlvlny
  z bajtů ROM přes ukazatel `$FE86` (`$F8AF`) a AND B; `noisePointer`
  je stav `$FE86` na titulce
- `romInterrupt` – ★ změřená délka ROM `$0038` bez stisknuté klávesy (T)
- `border` – `$5BD0` na titulce: bit 4 je úroveň „nízké“ hrany

Kontrolu dělá `tools/matchsound.mjs`.
"""
import base64, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                            # noqa: E402

ROM = os.path.join(B.SKOOLKIT, 'skoolkit', 'resources', '48.rom')


def main():
    image = B.memory_image()

    def peek(addr):
        return image[addr - 0x4000]

    def word(addr, opcode):
        if peek(addr) != opcode:
            raise SystemExit('na $%04X čekám opcode $%02X, je tam $%02X' % (addr, opcode, peek(addr)))
        return peek(addr + 1) | (peek(addr + 2) << 8)

    def byte(addr, opcode):
        if peek(addr) != opcode:
            raise SystemExit('na $%04X čekám opcode $%02X, je tam $%02X' % (addr, opcode, peek(addr)))
        return peek(addr + 1)

    BC, DE, LDB = 0x01, 0x11, 0x06
    tune = []
    a = 0xFA00
    while peek(a) != 0xFF:
        tune.append([peek(a) | (peek(a + 1) << 8), peek(a + 2) | (peek(a + 3) << 8)])
        a += 4

    def call(routine, bc_at, de_at):
        return {'routine': routine, 'bc': word(bc_at, BC), 'de': word(de_at, DE)}

    slots = {
        # $F888: obě nenulové → $F66C, oba sloty vynuluje
        'death': [call('F66C', 0xF899, 0xF896)],
        # $F80D: 1 – každá obsluha s ($FE88) AND 7 = 0; 2 – AND $0F = 0
        'creature': {
            '1': {'mask': byte(0xF81B, 0xE6), 'calls': [call('F648', 0xF822, 0xF825)]},
            '2': {'mask': byte(0xF83A, 0xE6), 'calls': [call('F648', 0xF844, 0xF841)]},
        },
        # $F855: 1 – $F7D8: AND 7 = 0 tón $F7C2, jinak šum; 2 – $F7F6 šum
        'explosion': {
            '1': {'mask': byte(0xF7DD, 0xE6),
                  'tone': [call('F648', 0xF7C2, 0xF7C5)],
                  'noise': {'b': byte(0xF7E6, LDB), 'de': word(0xF7E3, DE)}},
            '2': {'noise': {'b': byte(0xF7F9, LDB), 'de': word(0xF7FB, DE)}},
        },
        # $F863: 1–6, po zahrání vynuluje; 7 a víc nic nehraje a zůstane
        'oneShot': {
            '1': {'repeat': byte(0xF7A6, LDB), 'calls': [call('F66C', 0xF7A9, 0xF7AC)]},
            '2': {'calls': [call('F6B5', 0xF755, 0xF758), call('F66C', 0xF761, 0xF75E)]},
            '3': {'calls': [call('F66C', 0xF779, 0xF776)]},
            '4': {'calls': [call('F6B5', 0xF78E, 0xF791)]},
            '5': {'calls': [call('F6B5', 0xF740, 0xF73D)]},
            '6': {'calls': [call('F66C', 0xF728, 0xF725)]},
        },
    }
    paths = os.path.join(B.ROOT, 'build', 'sound', 'paths.json')
    if not os.path.exists(paths):
        raise SystemExit('chybí %s – spusť ./tools/tracesound.py' % paths)
    measured = json.load(open(paths))
    state = measured['state']
    rom = open(ROM, 'rb').read()[:0x2000]
    out = {
        'tune': tune,
        'tuneMask': state['FFF7'],
        'tuneOn': state['FFF8'],
        'slots': slots,
        'beeper': [[v['de'], v['hl']] for v in measured['beeper'].values()],
        'noise': base64.b64encode(rom).decode('ascii'),
        'noisePointer': state['FE86'],
        'romInterrupt': measured['romInterrupt'],
        'border': state['5BD0'],
    }
    print('%s: melodie %d položek, maska %d, ROM $0038 %d T, šum od $%04X'
          % (B.write_section('sounds', out), len(tune), out['tuneMask'], out['romInterrupt'], out['noisePointer']))


if __name__ == '__main__':
    main()
