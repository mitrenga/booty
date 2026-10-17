#!/usr/bin/env python3
"""Z kazety udělá scénář pro LOAD TAPE: `data/global.json#tape`.

    ./tools/mktape.py                # → data/global.json#tape

Všech osm bloků v pořadí kazety (`sources/docs/tape_layout.md`) a u každého
**jak zní**: délka a počet pulzů pilotu, synchronizace, délky bitů a bajty,
které nese – tak, jak leží na pásce, i s flagem a součtem XOR.

- **standardní bloky (ID $10)** nesou v TZX jen data; pilot, synchronizace
  a bity jsou ty, které zapisuje ROM (`SA-BYTES`): pulz pilotu 2168 T,
  8063 pulzů před hlavičkou a 3223 před daty, synchronizace 667/735 T,
  bity 855/1710 T
- ★ **turbo bloky (ID $11)** nesou časování samy, a remake ho bere odtud:
  **497 pulzů pilotu** po 2165 T a bity 856/1712 T. Proto zní kratší
  pilot – to je ta vlastnost kazety, kterou je slyšet

Bajty se ukládají u všeho, co je krátké (hlavičky, BASIC, oba turbo bloky):
remake je pak **hraje doopravdy**, ne náhodný šum. Dva dlouhé bloky jsou
jinak: SCREEN$ `bs` je v `data/global.json#loading` (`tools/mkscreen.py`) a kód
`bc` má 38 655 B, tedy přes tři a půl minuty pásky – soubor z něj nese jen
prvních `CODE_CUT` bajtů (i s flagem), remake je zahraje a blok tím utne.
Zapisuje se to jako odchylka (`ZADANI.md` §10).

? **Synchronizace turbo bloků** je v našem dumpu 875/525 T, ale druhý
nezávislý dump téže kazety má synchronizaci podle ROM (667/735 T) při
totožných datech (`sources/docs/provenance.md`). Je to vlastnost dumpu, ne
kazety, a soubor proto nese obojí: `sync` je ROM, `dumpSync` náš dump.

? **Pauzy** mezi bloky jsou vlastnost obalu TZX, ne kazety
(`tools/bootylib.py`). Soubor je nese, remake se o ně opře jen řádově.
"""
import argparse, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402

ROM = {'pilot': 2168, 'sync': [667, 735], 'zero': 855, 'one': 1710}
ROM_PILOT_PULSES = {0x00: 8063, 0xFF: 3223}   # podle flagu: hlavička / data
LONG = {'bs': 'loading', 'bc': None}          # bloky bez bajtů: kde jsou, nebo nikde
CODE_CUT = 1024                               # kolik bajtů bloku `bc` se zahraje (≈ 6 s)


def raw(block):
    """Blok tak, jak jde po pásce: flag, data a součet XOR."""
    body = bytes([block['flag']]) + bytes(block['data'])
    acc = 0
    for b in body:
        acc ^= b
    return body + bytes([acc])


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    args = ap.parse_args()

    blocks, owner = [], None
    for n, blk in enumerate(B.tzx_blocks(), 1):
        if not blk['ok']:
            raise SystemExit('blok %d: nesedí součet XOR' % n)
        data = raw(blk)
        out = {'block': n, 'flag': blk['flag'], 'length': len(data),
               'pauseMs': blk['pause']}
        if blk['id'] == 0x10:
            out.update({'kind': 'rom', 'pilot': ROM['pilot'],
                        'pilotPulses': ROM_PILOT_PULSES[0x00 if blk['header'] else 0xFF],
                        'sync': ROM['sync'], 'zero': ROM['zero'], 'one': ROM['one']})
        else:
            t = blk['timing']
            out.update({'kind': 'turbo', 'pilot': t['pilot'], 'pilotPulses': t['pilotPulses'],
                        'sync': ROM['sync'], 'dumpSync': [t['sync1'], t['sync2']],
                        'zero': t['zero'], 'one': t['one']})
        if blk['header']:
            h = blk['header']
            owner = h['name'].strip()
            out.update({'header': True, 'type': h['typeName'], 'name': h['name'],
                        'dataLength': h['length'], 'param1': h['param1']})
            out['bytes'] = data.hex()
        elif blk['id'] == 0x10 and owner in LONG:
            if LONG[owner]:
                out['bytesIn'] = LONG[owner]
            else:
                out['bytes'] = data[:CODE_CUT].hex()
                out['cut'] = True
            owner = None
        else:
            out['bytes'] = data.hex()
            owner = None
        # jak dlouho blok zní: pilot, synchronizace, bity, koncový pulz –
        # `durationMs` to, co remake zahraje, `tapeMs` celý blok na pásce
        def sounds(payload):
            ones = sum(bin(b).count('1') for b in payload)
            tstates = (out['pilot'] * out['pilotPulses'] + sum(out['sync'])
                       + 2 * (ones * out['one'] + (8 * len(payload) - ones) * out['zero']) + 945)
            return round(tstates / 3500)
        out['tapeMs'] = sounds(data)
        out['durationMs'] = sounds(bytes.fromhex(out['bytes'])) if out.get('cut') else out['tapeMs']
        blocks.append(out)

    result = {
        'blocks': blocks,
    }
    where = B.write_section('tape', result)
    for b in blocks:
        print('%d  %-5s %-8s %6d B  pilot %4d×%d T  %6d ms  pauza %d ms%s'
              % (b['block'], b['kind'], (b.get('name') or '').strip() or '-', b['length'],
                 b['pilotPulses'], b['pilot'], b['tapeMs'], b['pauseMs'],
                 '  (bajty v %s)' % b['bytesIn'] if 'bytesIn' in b
                else '  (zahraje se %d B, %d ms)' % (len(b['bytes']) // 2, b['durationMs'])
                if b.get('cut') else ''))
    print('-> %s' % where)


if __name__ == '__main__':
    main()
