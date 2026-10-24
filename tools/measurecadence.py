#!/usr/bin/env python3
"""The remake's cadence: how long a pass through the original's main loop takes on average.

    ./tools/measurecadence.py

★ The original's main loop does not wait for the frame: a pass takes the
fixed delay `$E9D9` plus the work it does plus interrupts – 1.5 to 3.4 frames
depending on the hold (`sources/docs/physics.md`). And with the tune it is a
third longer, because the notes are played by the interrupt handler on the
beeper and take time from the main loop.

**The remake does not simulate this** (operator's decision 2026-10-06): a
pass runs at a constant cadence and the sound in its own thread does not slow
the game down. The constant is **the original's average pass length without
the tune** – measured on the `tools/tracephysics.py` recordings with the
sound off (`quiet*`), by the simulator's T-state counter including
interrupts. The remake keeps it as `PASS_TSTATES` in `app/gameWorker.js`; the
tool measures it again and verifies that the constant holds (otherwise it
exits with an error and prints the value to write there).
"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FRAME = 69888


def main():
    total = n = 0
    music_total = music_n = 0
    for path in sorted(glob.glob(os.path.join(ROOT, 'build', 'trace', '*', 'inputs.json'))):
        data = json.load(open(path))
        t = [data['firstT']] + data['tstates']
        durations = [t[i + 1] - t[i] for i in range(len(t) - 1) if data['outcomes'][i] != 'gameover']
        if os.path.basename(os.path.dirname(path)).startswith('quiet'):
            total += sum(durations)
            n += len(durations)
        else:
            music_total += sum(durations)
            music_n += len(durations)
    if not n:
        raise SystemExit('quiet* recordings are missing – run ./tools/tracephysics.py')
    pass_t = total / n
    music = music_total / music_n / FRAME if music_n else 0
    print('pass %.2f T = %.3f frames = %.2f passes/s (%d passes without the tune); '
          'with the tune %.4f frames (%d passes)' % (pass_t, pass_t / FRAME, 3500000 / pass_t, n,
                                                   music, music_n))
    worker = open(os.path.join(ROOT, 'app', 'gameWorker.js'), encoding='utf8').read()
    found = re.search(r'^var PASS_TSTATES = (\d+);', worker, re.M)
    if not found:
        raise SystemExit('var PASS_TSTATES is missing in app/gameWorker.js')
    if int(found.group(1)) != round(pass_t):
        print('DIFFERENCE: app/gameWorker.js has PASS_TSTATES = %s, measured %d'
              % (found.group(1), round(pass_t)))
        sys.exit(1)
    print('PASS_TSTATES = %d in app/gameWorker.js holds' % round(pass_t))


if __name__ == '__main__':
    main()
