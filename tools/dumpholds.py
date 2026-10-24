#!/usr/bin/env python3
"""Extracts the description of all holds from the program: `data/global.json#holds`.

    ./tools/dumpholds.py                # → data/global.json#holds

★ The format is read from the code that draws the holds (`$A804`, `$AA97`,
`$AB44`, `$A900`; `sources/docs/holds.md`), and the table names are the
author's, from the remnant of his source (`sources/docs/source_remnant.md`):

- `tools/bootylib.py` `holds()` walks the data from `$ABD6` the way `$AA97`
  walks it: 21 holds of eleven tables with a fixed record length, each
  terminated by `$FF`
- the glyphs the scenery is printed with: 2048 B from `$8378` (`CHARS` for
  decks, ladders, doors, keys and loot; character *c* is at `$8378 + 8c`).
  Crates are printed with `CHARS` = `$8678`, i.e. from the same area 96
  characters further on – the file carries one contiguous area and both bases

Nothing is recomputed or named differently from how the program does it:
coordinates stay in the ROM `CL-SET` system (column = 33 − C, row = 24 − B),
as the tables have them. `app/screenComposer.js` converts them, the same way
`$A86E` converts them.

Check in place: the tables are reassembled from the records back into bytes
and must give exactly `$ABD6`–`$BAA0` from the tape.
"""
import argparse, base64, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402

GLYPHS_FROM, GLYPHS_LEN = B.CHARS_SCENERY, 2048


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    args = ap.parse_args()

    mem = B.memory_image()
    holds = B.holds()

    # check: records reassembled = bytes from the tape
    rebuilt = bytearray()
    for number in range(B.HOLD_COUNT, 0, -1):
        for name, size in B.HOLD_TABLES:
            for record in holds[number][name]:
                rebuilt += bytes(record)
            rebuilt.append(0xFF)
    rebuilt.append(0xFF)
    end = B.HOLD_DATA + len(rebuilt)
    original = mem[B.HOLD_DATA - 0x4000:end - 0x4000]
    if bytes(rebuilt) != original:
        raise SystemExit('the tables do not match the tape')

    data = {
        'glyphs': {'address': GLYPHS_FROM,
                   'scenery': B.CHARS_SCENERY, 'crates': B.CHARS_CRATES,
                   'bytes': base64.b64encode(
                       mem[GLYPHS_FROM - 0x4000:GLYPHS_FROM - 0x4000 + GLYPHS_LEN]).decode('ascii')},
        'holds': {},
    }
    for number in range(1, B.HOLD_COUNT + 1):
        hold = holds[number]
        entry = {'address': hold['address']}
        for name, size in B.HOLD_TABLES:
            entry[name] = hold[name]
        data['holds'][str(number)] = entry

    where = B.write_section('holds', data)
    print('%s: %d holds, %d B of tables ($%04X-$%04X, matches the tape), %d B of glyphs'
          % (where, B.HOLD_COUNT, len(rebuilt), B.HOLD_DATA, end - 1, GLYPHS_LEN))


if __name__ == '__main__':
    main()
