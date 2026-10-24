#!/usr/bin/env python3
"""Extracts the sprite and block graphics from the program: `data/global.json#sprites`.

    ./tools/dumpsprites.py                # → data/global.json#sprites

★ Moving things are drawn by two routines (`sources/docs/sprites.md`):

- **`$EED7`** – sprite: an object pre-shifted by its fine position into a
  buffer and printed as characters. Jim, pirates, rat and parrot, platforms
- **`$EA93`** – block: a rectangle of consecutively numbered characters,
  without fine position. Portholes, explosion, explosion fragments, trapdoors

Both take the graphics from `CHARS` + 8 × code, where `CHARS` is set by the
caller. Every set goes into the file from character 32 as the game sees it –
**from the memory of the running game at the start** (frame 399, as in
`tools/mkglobal.py`), because one set lies in RAM the game overwrites at
start-up: `$9F6C` + 256 = `$A06C`, a block of 128 zeros (`$CD56`). For the
other sets the tool verifies that they are byte for byte the same in the
running game as on the tape.

| set | `CHARS` | who sets it | what |
|---|---|---|---|
| `jim` | `$8978` | `$ECC4` | ★ Jim, object `$F231` |
| `pirate` | `$8E28` | `$F007` | ★ `OPST` objects (pirates) |
| `creature` | `$934C` | `$E239` | ★ object `$F31C` from the timer `$E12A`: 4 × 1 (? rat) or 2 × 2 (? parrot) |
| `platform` | `$F17B` | `$E82D` | ★ `LIDAT` objects (? moving platforms) |
| `porthole` | `$914C` | `$F1FC` | ★ `PHDAT` blocks 2 × 2, code + 4 cyclically (? portholes) |
| `explosion` | `$924C` | `$E48C` | ★ explosion of booby-trapped loot, block 2 × 2 |
| `blank` | `$9F6C` | `$E593`, `$E637` | ★ trapdoors (`TDDAT`) and the place after loot – characters from the block of zeros |
| `icons` | `$F15B` | `$E064`, `$E3EA` | ★ panel icons (`$21`–`$23`) and explosion fragment (`$20`) |
"""
import argparse, base64, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
sys.path.insert(0, B.RETRO)
import playtrace                                                 # noqa: E402

FIRST = 32
# name: (CHARS, who sets it, how many characters from 32, from the run only)
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
            raise SystemExit('set %s differs in the run from the tape' % name)
        data['banks'][name] = {'chars': chars, 'codes': [FIRST, FIRST + count - 1],
                               'bytes': base64.b64encode(run_bytes).decode('ascii')}
    print('%s: %s' % (B.write_section('sprites', data), ', '.join('%s $%04X' % (n, b[0]) for n, b in BANKS.items())))


if __name__ == '__main__':
    main()
