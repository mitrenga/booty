#!/usr/bin/env python3
"""Makes the LOAD TAPE script from the tape: `data/global.json#tape`.

    ./tools/mktape.py                # → data/global.json#tape

All eight blocks in tape order (`sources/docs/tape_layout.md`) and for each
**how it sounds**: length and number of pilot pulses, sync, bit lengths and
the bytes it carries – as they lie on the tape, including the flag and the
XOR checksum.

- **standard blocks (ID $10)** carry only data in the TZX; the pilot, sync
  and bits are those the ROM writes (`SA-BYTES`): pilot pulse 2168 T,
  8063 pulses before a header and 3223 before data, sync 667/735 T,
  bits 855/1710 T
- ★ **turbo blocks (ID $11)** carry their timing themselves, and the remake
  takes it from there: **497 pilot pulses** of 2165 T and bits 856/1712 T.
  That is why the pilot sounds shorter – the property of the tape that can
  be heard

Bytes are stored for everything short (headers, BASIC, both turbo blocks):
the remake then **plays them for real**, not random noise. The two long
blocks are different: SCREEN$ `bs` is in `data/global.json#loading`
(`tools/mkscreen.py`) and the code `bc` has 38 655 B, i.e. over three and a
half minutes of tape – the file carries only its first `CODE_CUT` bytes
(including the flag), the remake plays them and cuts the block short. This
is recorded as a deviation (`ZADANI.md` §10).

? **Sync of the turbo blocks** is 875/525 T in our dump, but a second
independent dump of the same tape has the ROM sync (667/735 T) with identical
data (`sources/docs/provenance.md`). It is a property of the dump, not of the
tape, and the file therefore carries both: `sync` is the ROM, `dumpSync` our
dump.

? **Pauses** between blocks are a property of the TZX container, not of the
tape (`tools/bootylib.py`). The file carries them, the remake relies on them
only as an order of magnitude.
"""
import argparse, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402

ROM = {'pilot': 2168, 'sync': [667, 735], 'zero': 855, 'one': 1710}
ROM_PILOT_PULSES = {0x00: 8063, 0xFF: 3223}   # by flag: header / data
LONG = {'bs': 'loading', 'bc': None}          # blocks without bytes: where they are, or nowhere
CODE_CUT = 1024                               # how many bytes of block `bc` are played (≈ 6 s)


def raw(block):
    """The block as it goes over the tape: flag, data and XOR checksum."""
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
            raise SystemExit('block %d: XOR checksum does not match' % n)
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
        # how long the block sounds: pilot, sync, bits, final pulse –
        # `durationMs` what the remake plays, `tapeMs` the whole block on the tape
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
        print('%d  %-5s %-8s %6d B  pilot %4d×%d T  %6d ms  pause %d ms%s'
              % (b['block'], b['kind'], (b.get('name') or '').strip() or '-', b['length'],
                 b['pilotPulses'], b['pilot'], b['tapeMs'], b['pauseMs'],
                 '  (bytes in %s)' % b['bytesIn'] if 'bytesIn' in b
                else '  (%d B played, %d ms)' % (len(b['bytes']) // 2, b['durationMs'])
                if b.get('cut') else ''))
    print('-> %s' % where)


if __name__ == '__main__':
    main()
