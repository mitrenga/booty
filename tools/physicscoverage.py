#!/usr/bin/env python3
"""What the `tools/tracephysics.py` recordings covered – so that the zero of
`matchphysics.mjs` means something.

    ./tools/physicscoverage.py

From the memory areas after every pass (`build/trace/*/passes.xor.gz`) it
counts how many times the things the rules rest on happened: holds visited,
deaths, loot collected, explosions, creature from the timer, keys, doors
opened, fall (and a fatal one), ladder, platforms under Jim, trapdoors, gold
key countdown.
"""
import glob, gzip, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def main():
    total = {}
    holds_all = set()
    for d in sorted(glob.glob(os.path.join(ROOT, 'build', 'trace', '*'))):
        if not os.path.exists(os.path.join(d, 'regions.json')):
            continue
        regions = json.load(open(os.path.join(d, 'regions.json')))
        size = sum(h - l for l, h, n in regions)
        delta = gzip.open(os.path.join(d, 'passes.xor.gz')).read()
        rows = [delta[k:k + size] for k in range(0, len(delta), size)]
        acc = int.from_bytes(rows[0], 'big') if rows else 0
        out = [rows[0]] if rows else []
        for row in rows[1:]:
            acc ^= int.from_bytes(row, 'big')
            out.append(acc.to_bytes(size, 'big'))
        data = b''.join(out)
        n = len(data) // size

        def peek(i, address):
            at = i * size
            for lo, hi, name in regions:
                if lo <= address < hi:
                    return data[at + address - lo]
                at += hi - lo
            raise KeyError(hex(address))

        init = open(os.path.join(d, 'init.bin'), 'rb').read()
        outcomes = json.load(open(os.path.join(d, 'inputs.json'))).get('outcomes', [])
        c = {'passes': n}
        if 'gameover' in outcomes:
            c['game over'] = 1
        holds = set()
        keys = (('hold', 0x5BD3), ('lives', 0x5BF1), ('booty', 0x5BF4), ('left', 0x5BF2),
                ('boom', 0xE479), ('creature', 0xF31C), ('splinter', 0xF2DB), ('key', 0xF241),
                ('state', 0xF242), ('fatal', 0xF33F), ('lift', 0xE820), ('gold', 0x5BFF))
        prev = {k: init[a] for k, a in keys}
        for i in range(n):
            s = {k: peek(i, a) for k, a in keys}
            holds.add(s['hold'])
            if prev:
                def inc(k):
                    c[k] = c.get(k, 0) + 1
                if s['hold'] != prev['hold']:
                    inc('hold transition')
                if s['lives'] < prev['lives'] or (s['lives'] == 255 and prev['lives'] != 255):
                    inc('death')
                if s['hold'] == 1 and prev['left'] == 0 and s['left'] == 125 and i:
                    inc('new round (gold key)')
                if s['booty'] > prev['booty']:
                    inc('loot')
                if s['boom'] and not prev['boom']:
                    inc('explosion')
                if s['creature'] and not prev['creature']:
                    inc('creature from the timer')
                if s['splinter'] and not prev['splinter']:
                    inc('fragments')
                if s['key'] != prev['key'] and s['key']:
                    inc('key collected')
                if prev['key'] and not s['key'] and s['hold'] == prev['hold']:
                    inc('door opened')
                if s['state'] == 3 and prev['state'] != 3:
                    inc('onto a ladder')
                if s['state'] == 2 and prev['state'] != 2:
                    inc('fatal fall')
                if s['lift'] and not prev['lift']:
                    inc('platform under Jim')
                if s['left'] == 0 and prev['left'] != 0:
                    inc('gold key countdown')
                if s['gold'] != prev['gold'] and s['left'] == 0:
                    inc('countdown second')
            prev = s
        c['holds'] = sorted(holds)
        holds_all |= holds
        print('%-10s %s' % (os.path.basename(d), json.dumps(c, ensure_ascii=False)))
        for k, v in c.items():
            if isinstance(v, int):
                total[k] = total.get(k, 0) + v
    print('total     ', json.dumps(total, ensure_ascii=False))
    print('holds      %d of 21: %s' % (len(holds_all), sorted(holds_all)))


if __name__ == '__main__':
    main()
