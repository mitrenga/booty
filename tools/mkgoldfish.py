#!/usr/bin/env python3
"""The hidden mini-game for the menu background → `data/global.json#goldfish`.

    ./tools/mkgoldfish.py

From `build/goldfish/init.bin` (`tools/tracegoldfish.py`: the original's
memory on the first entry into `$CF36`) it takes **only the data areas** the
main loop reads and writes (`app/goldfishLogic.js`), not the code:

- `$4000`–`$5AFF` screen – ships, sea, sand, as the mini-game drew them
- `$5C00`–`$5CBF` system variables (CHARS, ATTR-T, MASK-T, P-FLAG, DF-CC,
  S-POSN, COORDS)
- `$9000`–`$A1FF` graphics of the objects and the diver, blank characters, sprite buffers
- `$D22E`–`$D33F` characters of the air gauge and the air `$D33E`
- `$D86F` state of the generator `$D8D4`, `$D93D`–`$D9B5` pass counter and templates
- `$DB22`–`$DD9F` variables, objects `$DB46`, diver `$DC0E`, sand characters
  `$DC22`, bubbles `$DD2A`, counts `$DD98`

★ and the cadence: the **median** pass length without the tune (`info.json`).
The mean would be skewed by passes in which the original plays BEEPER (a
caught fish) or the noise of refilling air – the menu is silent (R-024), so
its cadence is the cadence of a pass without them. `tools/matchgoldfish.mjs`
runs the rewrite from this data.
"""
import base64, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                            # noqa: E402

FRAME = 69888
SEGMENTS = [
    (0x4000, 0x5B00, 'screen'),
    (0x5C00, 0x5CC0, 'system variables'),
    (0x9000, 0xA200, 'graphics, blank characters, sprite buffers'),
    (0xD22E, 0xD340, 'air characters, air $D33E'),
    (0xD86F, 0xD870, 'generator $D8D4'),
    (0xD93D, 0xD9B6, 'pass counter, object templates $D93E'),
    (0xDB22, 0xDDA0, 'variables, objects, diver, sand, bubbles'),
]


def main():
    base = os.path.join(B.ROOT, 'build', 'goldfish')
    if not os.path.exists(os.path.join(base, 'init.bin')):
        raise SystemExit('build/goldfish is missing – run ./tools/tracegoldfish.py')
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
    print('%s: %d B in %d areas, pass %d T = %.3f frames (mean including sounds %.3f)'
          % (B.write_section('goldfish', out), sum(hi - lo for lo, hi, w in SEGMENTS), len(SEGMENTS), median, median / FRAME,
             info['passTStates'] / FRAME))


if __name__ == '__main__':
    main()
