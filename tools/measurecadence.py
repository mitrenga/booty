#!/usr/bin/env python3
"""Tempo remaku: jak dlouho průměrně trvá průchod hlavní smyčkou originálu.

    ./tools/measurecadence.py

★ Hlavní smyčka originálu na snímek nečeká: průchod trvá pevné zpoždění
`$E9D9` plus práci, kterou udělá, plus přerušení – 1,5 až 3,4 snímku podle
podpalubí (`sources/docs/physics.md`). A s melodií je o třetinu delší, protože
noty hraje obsluha přerušení na beeperu a čas bere hlavní smyčce.

**Remake tohle nesimuluje** (rozhodnutí operátora 2026-10-06): průchod
běží v konstantním tempu a zvuk ve vlastním vlákně hru nezpomaluje.
Konstantou je **průměrná délka průchodu originálu bez melodie** – změřená
na záznamech `tools/tracephysics.py` se zvukem vypnutým (`quiet*`), čítačem
T-stavů simulátoru i s přerušeními. Remake ji drží jako `PASS_TSTATES`
v `app/gameWorker.js`; nástroj ji změří znovu a ověří, že konstanta sedí
(jinak skončí chybou a vypíše hodnotu, kterou tam zapsat).
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
        raise SystemExit('chybí záznamy quiet* – spusť ./tools/tracephysics.py')
    pass_t = total / n
    music = music_total / music_n / FRAME if music_n else 0
    print('průchod %.2f T = %.3f snímku = %.2f průchodu/s (%d průchodů bez melodie); '
          's melodií %.4f snímku (%d průchodů)' % (pass_t, pass_t / FRAME, 3500000 / pass_t, n,
                                                   music, music_n))
    worker = open(os.path.join(ROOT, 'app', 'gameWorker.js'), encoding='utf8').read()
    found = re.search(r'^var PASS_TSTATES = (\d+);', worker, re.M)
    if not found:
        raise SystemExit('v app/gameWorker.js chybí var PASS_TSTATES')
    if int(found.group(1)) != round(pass_t):
        print('ROZDÍL: app/gameWorker.js má PASS_TSTATES = %s, změřeno %d'
              % (found.group(1), round(pass_t)))
        sys.exit(1)
    print('PASS_TSTATES = %d v app/gameWorker.js sedí' % round(pass_t))


if __name__ == '__main__':
    main()
