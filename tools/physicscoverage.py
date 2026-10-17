#!/usr/bin/env python3
"""Co záznamy `tools/tracephysics.py` pokryly – aby nula `matchphysics.mjs`
něco znamenala.

    ./tools/physicscoverage.py

Z oblastí paměti po každém průchodu (`build/trace/*/passes.xor.gz`) spočítá,
kolikrát se stalo to, na čem pravidla stojí: navštívená podpalubí, smrti,
sebraná kořist, výbuchy, tvor z časovače, klíče, otevřené dveře, pád (a
smrtelný), žebřík, plošiny pod Jimem, padací dveře, odpočet zlatého klíče.
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
        c = {'průchodů': n}
        if 'gameover' in outcomes:
            c['konec hry'] = 1
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
                    inc('přechod podpalubí')
                if s['lives'] < prev['lives'] or (s['lives'] == 255 and prev['lives'] != 255):
                    inc('smrt')
                if s['hold'] == 1 and prev['left'] == 0 and s['left'] == 125 and i:
                    inc('nové kolo (zlatý klíč)')
                if s['booty'] > prev['booty']:
                    inc('kořist')
                if s['boom'] and not prev['boom']:
                    inc('výbuch')
                if s['creature'] and not prev['creature']:
                    inc('tvor z časovače')
                if s['splinter'] and not prev['splinter']:
                    inc('úlomky')
                if s['key'] != prev['key'] and s['key']:
                    inc('klíč sebrán')
                if prev['key'] and not s['key'] and s['hold'] == prev['hold']:
                    inc('dveře otevřeny')
                if s['state'] == 3 and prev['state'] != 3:
                    inc('na žebřík')
                if s['state'] == 2 and prev['state'] != 2:
                    inc('smrtelný pád')
                if s['lift'] and not prev['lift']:
                    inc('plošina pod Jimem')
                if s['left'] == 0 and prev['left'] != 0:
                    inc('odpočet zlatého klíče')
                if s['gold'] != prev['gold'] and s['left'] == 0:
                    inc('sekunda odpočtu')
            prev = s
        c['podpalubí'] = sorted(holds)
        holds_all |= holds
        print('%-10s %s' % (os.path.basename(d), json.dumps(c, ensure_ascii=False)))
        for k, v in c.items():
            if isinstance(v, int):
                total[k] = total.get(k, 0) + v
    print('celkem    ', json.dumps(total, ensure_ascii=False))
    print('podpalubí  %d z 21: %s' % (len(holds_all), sorted(holds_all)))


if __name__ == '__main__':
    main()
