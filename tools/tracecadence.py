#!/usr/bin/env python3
"""Změří kadenci hlavní smyčky Booty: kolik T-stavů (a snímků) trvá průchod.

    ./tools/tracecadence.py [--frames N] [--script "..."] [--loop ADDR] [--csv FILE]

Hlavní smyčka hry je `$DF13`–`$DF8F` (`sources/docs/disasm_notes.md` §3)
a **na snímek nečeká** – nemá `HALT` a nečte čítač přerušení `$FE88`.
Kadence tedy není vlastnost kódu, ale **toho, kolik práce průchod udělá**,
a dá se jen změřit: simulátor se zastaví na každém vstupu do `ADDR`,
zapíše T-stav, a z rozdílů vyjde délka průchodu. Snímek ZX 48K má
69 888 T-stavů.

Skript kláves je jako u `playtrace.py` (`od:do:klavesa`, snímky od začátku
běhu). Výchozí: klávesa, `0` = START GAME, pak chůze po palubě.
Přerušení se počítají (obsluha IM 2 hraje zvuk a volá ROM `$0038`), takže
změřený čas je **včetně** času, který stroj stráví v přerušení – tak jako
na skutečném Spectru. Sporná paměť se počítá jen s `--cmio`; bez něj je
měření o zdržení ULA rychlejší než skutečný stroj (`hw_notes.md`).
"""
import argparse, os, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                            # noqa: E402
import playtrace as P                                           # noqa: E402
from skoolkit.snapshot import Snapshot                          # noqa: E402
from skoolkit.simutils import from_snapshot                     # noqa: E402
from skoolkit.trace import Tracer                               # noqa: E402

FRAME = 69888
SCRIPT = '200:210:SPACE,300:310:0,400:700:8,700:1000:5,1000:1300:8,1300:1600:5'


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('snapshot', nargs='?', default=os.path.join(B.ROOT, 'build', 'booty.z80'))
    ap.add_argument('--frames', type=int, default=1600)
    ap.add_argument('--script', default=SCRIPT)
    ap.add_argument('--loop', default='$DF13')
    ap.add_argument('--csv')
    ap.add_argument('--cmio', action='store_true',
                    help='simulovat spornou paměť a I/O (pomalejší, blíž skutečnému stroji)')
    args = ap.parse_args()
    loop = int(args.loop.lstrip('$'), 16)
    script = P.parse_script(args.script)
    if args.cmio:
        from skoolkit import CCMIOSimulator as cls
    else:
        cls = P.CSimulator
    if cls is None or not hasattr(cls, 'trace'):
        raise SystemExit('potrebuju C simulator (skoolkit.csimulator / ccmiosimulator)')

    snap = Snapshot.get(args.snapshot)
    sim = from_snapshot(cls, snap, {}, {'ay': [None] * 16},
                        {'fast_djnz': False, 'fast_ldir': False}, None)
    tracer = Tracer(sim, snap.border, snap.out7ffd, snap.outfffd, list(snap.ay),
                    snap.outfe, True)
    sim.set_tracer(tracer)
    keyboard = tracer.keyboard = [0] * 8     # porty čte tracer, ne náš seznam
    state = {'frame': 0}

    def draw(scr, frame, border, kb):
        for i in range(8):
            kb[i] = 0
        for start, end, key in script:
            if start <= frame < end:
                row, bit = P.KEYS[key]
                kb[P.ROWS[row]] |= 1 << bit
        state['frame'] = frame
        return frame < args.frames

    regs = sim.registers
    pc = snap.pc
    stamps = []
    while True:
        cond, _ = sim.trace(pc, loop, 0, 0, 1, draw, None, keyboard, None, None)
        pc = regs[24]
        if pc != loop:
            break                                   # konec běhu (draw vrátil False)
        stamps.append((state['frame'], regs[25]))
        # o jednu instrukci dál, ať se příště nezastaví hned
        cond, _ = sim.trace(pc, -1, 1, 0, 1, draw, None, keyboard, None, None)
        pc = regs[24]

    if len(stamps) < 2:
        raise SystemExit('smycka $%04X se za %d snimku nevykonala' % (loop, args.frames))
    rows = [(f0, t1 - t0) for (f0, t0), (_, t1) in zip(stamps, stamps[1:])]
    if args.csv:
        with open(args.csv, 'w') as f:
            f.write('frame,tstates\n')
            for fr, dt in rows:
                f.write('%d,%d\n' % (fr, dt))
    print('smyčka $%04X: %d průchodů, první na snímku %d'
          % (loop, len(stamps), stamps[0][0]))
    hist = Counter(round(dt / FRAME, 1) for _, dt in rows)
    print('průchod ve snímcích (zaokrouhleno na 0,1) : počet')
    for k in sorted(hist):
        print('  %4.1f : %d' % (k, hist[k]))
    dts = sorted(dt for _, dt in rows)
    print('T-stavy: min %d, medián %d, max %d (snímek %d)'
          % (dts[0], dts[len(dts) // 2], dts[-1], FRAME))


if __name__ == '__main__':
    main()
