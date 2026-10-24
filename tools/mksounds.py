#!/usr/bin/env python3
"""Sound of the original as data → `data/global.json#sounds`.

    ./tools/mksounds.py

★ Everything from the code on the tape (`tools/bootylib.py` `memory_image()`),
from the ROM and from the measurement of `tools/tracesound.py`
(`build/sound/paths.json`):

- `tune` – the tune: table at `$FA00`, quadruples `E D C B` up to `$FF`,
  i.e. `[DE, BC]` for `$F648` (DE half-waves in pairs, BC delay); `[0, 0]`
  is a rest. `tuneMask` is `$FFF7` (a note every `mask + 1` handler runs) and
  `tuneOn` `$FFF8` – both are set by `$CD14` at run time, taken from the title
- `slots` – parameters of the slot routines from operands (`LD BC,nn` /
  `LD DE,nn` / `LD B,n`, with an opcode check), as the handler `$FE69` calls
  them: `$FFFB`+`$FFFC` death, `$FFFF` 1/2 creature, `$FFFD` 1/2 explosion
  and fragments, `$FFFE` 1–6 one-shot
- `beeper` – ★ `(DE, HL)` of the ROM `BEEPER` calls in the game
- `noise` – ROM `$0000`–`$1FFF` (base64): the noise `$F618` takes the
  half-wave length from ROM bytes through the pointer `$FE86` (`$F8AF`) and
  AND B; `noisePointer` is the state of `$FE86` on the title
- `romInterrupt` – ★ measured length of ROM `$0038` with no key pressed (T)
- `border` – `$5BD0` on the title: bit 4 is the level of the "low" edge

The check is done by `tools/matchsound.mjs`.
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
            raise SystemExit('at $%04X expected opcode $%02X, found $%02X' % (addr, opcode, peek(addr)))
        return peek(addr + 1) | (peek(addr + 2) << 8)

    def byte(addr, opcode):
        if peek(addr) != opcode:
            raise SystemExit('at $%04X expected opcode $%02X, found $%02X' % (addr, opcode, peek(addr)))
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
        # $F888: both non-zero → $F66C, clears both slots
        'death': [call('F66C', 0xF899, 0xF896)],
        # $F80D: 1 – every handler run with ($FE88) AND 7 = 0; 2 – AND $0F = 0
        'creature': {
            '1': {'mask': byte(0xF81B, 0xE6), 'calls': [call('F648', 0xF822, 0xF825)]},
            '2': {'mask': byte(0xF83A, 0xE6), 'calls': [call('F648', 0xF844, 0xF841)]},
        },
        # $F855: 1 – $F7D8: AND 7 = 0 tone $F7C2, otherwise noise; 2 – $F7F6 noise
        'explosion': {
            '1': {'mask': byte(0xF7DD, 0xE6),
                  'tone': [call('F648', 0xF7C2, 0xF7C5)],
                  'noise': {'b': byte(0xF7E6, LDB), 'de': word(0xF7E3, DE)}},
            '2': {'noise': {'b': byte(0xF7F9, LDB), 'de': word(0xF7FB, DE)}},
        },
        # $F863: 1–6, cleared after playing; 7 and above plays nothing and stays
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
        raise SystemExit('%s is missing – run ./tools/tracesound.py' % paths)
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
    print('%s: tune %d entries, mask %d, ROM $0038 %d T, noise from $%04X'
          % (B.write_section('sounds', out), len(tune), out['tuneMask'], out['romInterrupt'], out['noisePointer']))


if __name__ == '__main__':
    main()
