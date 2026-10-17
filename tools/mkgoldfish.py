#!/usr/bin/env python3
"""Skrytá minihra pro pozadí menu → `data/global.json#goldfish`.

    ./tools/mkgoldfish.py

Z `build/goldfish/init.bin` (`tools/tracegoldfish.py`: paměť originálu při
prvním vstupu do `$CF36`) vezme **jen datové oblasti**, které hlavní smyčka
čte a píše (`app/goldfishLogic.js`), kód ne:

- `$4000`–`$5AFF` obrazovka – lodě, moře, písek, jak je minihra nakreslila
- `$5C00`–`$5CBF` systémové proměnné (CHARS, ATTR-T, MASK-T, P-FLAG, DF-CC,
  S-POSN, COORDS)
- `$9000`–`$A1FF` grafika objektů a potápěče, prázdné znaky, buffery spritů
- `$D22E`–`$D33F` znaky ukazatele vzduchu a vzduch `$D33E`
- `$D86F` stav generátoru `$D8D4`, `$D93D`–`$D9B5` čítač průchodů a šablony
- `$DB22`–`$DD9F` proměnné, objekty `$DB46`, potápěč `$DC0E`, znaky písku
  `$DC22`, bubliny `$DD2A`, počty `$DD98`

★ a tempo: **medián** délky průchodu bez melodie (`info.json`). Průměr by
zkreslily průchody, ve kterých originál hraje BEEPER (chycená ryba) nebo
šum doplňování vzduchu – menu je němé (R-024), takže jeho tempo je tempo
průchodu bez nich. `tools/matchgoldfish.mjs` pouští přepis z těchto dat.
"""
import base64, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                            # noqa: E402

FRAME = 69888
SEGMENTS = [
    (0x4000, 0x5B00, 'obrazovka'),
    (0x5C00, 0x5CC0, 'systémové proměnné'),
    (0x9000, 0xA200, 'grafika, prázdné znaky, buffery spritů'),
    (0xD22E, 0xD340, 'znaky vzduchu, vzduch $D33E'),
    (0xD86F, 0xD870, 'generátor $D8D4'),
    (0xD93D, 0xD9B6, 'čítač průchodů, šablony objektů $D93E'),
    (0xDB22, 0xDDA0, 'proměnné, objekty, potápěč, písek, bubliny'),
]


def main():
    base = os.path.join(B.ROOT, 'build', 'goldfish')
    if not os.path.exists(os.path.join(base, 'init.bin')):
        raise SystemExit('chybí build/goldfish – spusť ./tools/tracegoldfish.py')
    memory = open(os.path.join(base, 'init.bin'), 'rb').read()
    info = json.load(open(os.path.join(base, 'info.json')))
    t = info['tstates']
    durations = sorted(b - a for a, b in zip(t, t[1:]))
    median = durations[len(durations) // 2]
    out = {
        'segments': [{'address': lo, 'length': hi - lo,
                      'bytes': base64.b64encode(memory[lo:hi]).decode('ascii')}
                     for lo, hi, what in SEGMENTS],
        'passTStates': median,
        'passFrames': round(median / FRAME, 4),
    }
    print('%s: %d B v %d oblastech, průchod %d T = %.3f snímku (průměr i se zvuky %.3f)'
          % (B.write_section('goldfish', out), sum(hi - lo for lo, hi, w in SEGMENTS), len(SEGMENTS), median, median / FRAME,
             info['passTStates'] / FRAME))


if __name__ == '__main__':
    main()
