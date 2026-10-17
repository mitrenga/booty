#!/usr/bin/env python3
"""Vytáhne z programu popis všech podpalubí: `data/global.json#holds`.

    ./tools/dumpholds.py                # → data/global.json#holds

★ Formát je přečtený z kódu, který podpalubí kreslí (`$A804`, `$AA97`,
`$AB44`, `$A900`; `sources/docs/holds.md`), a jména tabulek jsou autorova
ze zbytku jeho zdrojáku (`sources/docs/source_remnant.md`):

- `tools/bootylib.py` `holds()` projde data od `$ABD6` tak, jak je prochází
  `$AA97`: 21 podpalubí po jedenácti tabulkách s pevnou délkou záznamu,
  každá zakončená `$FF`
- glyfy, kterými se kulisa tiskne: 2048 B od `$8378` (`CHARS` pro paluby,
  žebříky, dveře, klíče a kořist; znak *c* je na `$8378 + 8c`). Bedny se
  tisknou s `CHARS` = `$8678`, tedy z téže oblasti o 96 znaků dál – soubor
  nese jednu souvislou oblast a obě báze

Nic se tu nepřepočítává ani nepojmenovává jinak, než jak to dělá program:
souřadnice zůstávají v soustavě ROM `CL-SET` (sloupec = 33 − C, řádek =
24 − B), jak je mají tabulky. Převádí je až `app/screenComposer.js`, stejně
jako je převádí `$A86E`.

Kontrola na místě: tabulky se ze záznamů složí zpátky do bajtů a musí
dát přesně `$ABD6`–`$BAA0` z kazety.
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

    # kontrola: záznamy složené zpátky = bajty z kazety
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
        raise SystemExit('tabulky nesedí s kazetou')

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
    print('%s: %d podpalubí, %d B tabulek ($%04X-$%04X, shoda s kazetou), %d B glyfů'
          % (where, B.HOLD_COUNT, len(rebuilt), B.HOLD_DATA, end - 1, GLYPHS_LEN))


if __name__ == '__main__':
    main()
