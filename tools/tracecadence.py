#!/usr/bin/env python3
"""Measures the cadence of Booty's main loop: how many T-states (and frames) a pass takes.

    ./tools/tracecadence.py [--frames N] [--script "..."] [--loop ADDR] [--csv FILE]

The game's main loop is `$DF13`–`$DF8F` (`sources/docs/disasm_notes.md` §3)
and **does not wait for the frame** – it has no `HALT` and does not read the
interrupt counter `$FE88`. The cadence is therefore not a property of the
code but of **how much work a pass does**, and can only be measured: the
simulator stops at every entry into `ADDR`, records the T-state, and the pass
length comes out of the differences. A ZX 48K frame has 69 888 T-states.

The key script is as in `playtrace.py` (`from:to:key`, frames from the start
of the run). Default: a key, `0` = START GAME, then walking the deck.
Interrupts are counted (the IM 2 handler plays sound and calls ROM `$0038`),
so the measured time is **including** the time the machine spends in the
interrupt – as on a real Spectrum. Contended memory is counted only with
`--cmio`; without it the measurement is faster than the real machine by the
ULA delay (`hw_notes.md`).
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
                    help='simulate contended memory and I/O (slower, closer to the real machine)')
    args = ap.parse_args()
    loop = int(args.loop.lstrip('$'), 16)
    script = P.parse_script(args.script)
    if args.cmio:
        from skoolkit import CCMIOSimulator as cls
    else:
        cls = P.CSimulator
    if cls is None or not hasattr(cls, 'trace'):
        raise SystemExit('the C simulator is needed (skoolkit.csimulator / ccmiosimulator)')

    snap = Snapshot.get(args.snapshot)
    sim = from_snapshot(cls, snap, {}, {'ay': [None] * 16},
                        {'fast_djnz': False, 'fast_ldir': False}, None)
    tracer = Tracer(sim, snap.border, snap.out7ffd, snap.outfffd, list(snap.ay),
                    snap.outfe, True)
    sim.set_tracer(tracer)
    keyboard = tracer.keyboard = [0] * 8     # the tracer reads the ports, not our list
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
            break                                   # end of the run (draw returned False)
        stamps.append((state['frame'], regs[25]))
        # one instruction further, so that it does not stop right away next time
        cond, _ = sim.trace(pc, -1, 1, 0, 1, draw, None, keyboard, None, None)
        pc = regs[24]

    if len(stamps) < 2:
        raise SystemExit('loop $%04X was not executed within %d frames' % (loop, args.frames))
    rows = [(f0, t1 - t0) for (f0, t0), (_, t1) in zip(stamps, stamps[1:])]
    if args.csv:
        with open(args.csv, 'w') as f:
            f.write('frame,tstates\n')
            for fr, dt in rows:
                f.write('%d,%d\n' % (fr, dt))
    print('loop $%04X: %d passes, the first on frame %d'
          % (loop, len(stamps), stamps[0][0]))
    hist = Counter(round(dt / FRAME, 1) for _, dt in rows)
    print('pass in frames (rounded to 0.1) : count')
    for k in sorted(hist):
        print('  %4.1f : %d' % (k, hist[k]))
    dts = sorted(dt for _, dt in rows)
    print('T-states: min %d, median %d, max %d (frame %d)'
          % (dts[0], dts[len(dts) // 2], dts[-1], FRAME))


if __name__ == '__main__':
    main()
