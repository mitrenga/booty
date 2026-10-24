#!/usr/bin/env python3
"""Measures how the original redraws the screen on a door transition.

    ./tools/tracetransition.py [--holds 1-20] [--tune] [--shots DIR]

The game is started in the simulator with contended memory (`CCMIOSimulator`,
as `tracecadence.py --cmio`), in the first pass Jim is placed in front of the
first big door of hold 1 with target N (`tracephysics.to_hold`) and `A` is
pressed. Along the transition the T-state is recorded at stops in the code:

- `$EE84` ENTER ROOM has decided: new hold
- `$A900` drawing of the hold begins
- `$A8DA` ROM CL-LINE (`$0E44`) clears 24 rows; `$A8DD` the image is black
  (attributes 0), drawing continues invisibly
- `$AA85` pixels of the hold done (under attributes 0, i.e. invisible)
- `$AA90` attributes copied from `$A4E4` to `$5800` (the hold is visible)
- `$E0AC` the panel begins to print through the ROM
- `$EEA2` panel done
- `$DF13` next pass

plus the screen at the end of every frame (what the ULA showed).

**The course of clearing** is measured separately, with one extra run
(CL-LINE always does the same): at `$A8DA` the screen is filled with `$FF`,
so that every byte changes, and clearing is run **without interrupts** in
steps of `STEP` T-states – when which byte disappeared. Interrupts would
insert stops into the LDIR tempo at the one phase relative to the frame the
run happens to have; their time is in the clearing length from the other
runs and the remake spreads it evenly.

★ The tune is off (`$FFF8` = 0) unless `--tune` is given: notes are played by
the interrupt and a single note stretches the screen clearing by up to a
frame. The remake does not simulate the tune's tempo (constant cadence,
ZADANI §10, the worker's `PASS_TSTATES` is without the tune too), so the
transition is measured without it as well. The output is a table of phases
in T-states and in frames for every N and a summary; with `--shots` the
transition frames are saved as PNG. `global.json#transition` (stops, course of
clearing, frame screens) and the memory at the moment of `$EE84` for every N
(`holdNN.bin`) go to `build/transition/` – `tools/mktransition.mjs` makes
`data/global.json#transition` from them and `tools/matchtransition.mjs`
compares.
"""
import argparse, base64, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                            # noqa: E402
import playtrace as P                                           # noqa: E402
from tracephysics import GAME, NEW_GAME, PASS, to_hold          # noqa: E402
from skoolkit.snapshot import Snapshot                          # noqa: E402
from skoolkit.simutils import from_snapshot                     # noqa: E402
from skoolkit.trace import Tracer                               # noqa: E402

FRAME = 69888
STEP = 32
STOPS = [(0xEE84, 'ENTER ROOM'), (0xA900, 'drawing'), (0xA8DA, 'CLS'),
         (0xA8DD, 'CLS done'), (0xAA85, 'pixels'),
         (0xAA90, 'attributes'), (0xE0AC, 'panel'), (0xEEA2, 'panel done'),
         (PASS, 'next pass')]


def measure(hold, shots_dir=None, tune=False, profile=False):
    from skoolkit import CCMIOSimulator as cls
    snap = Snapshot.get(os.path.join(B.ROOT, 'build', 'booty.z80'))
    sim = from_snapshot(cls, snap, {}, {'ay': [None] * 16},
                        {'fast_djnz': False, 'fast_ldir': False}, None)
    tracer = Tracer(sim, snap.border, snap.out7ffd, snap.outfffd, list(snap.ay),
                    snap.outfe, True)
    sim.set_tracer(tracer)
    keyboard = tracer.keyboard = [0] * 8
    script = GAME + [(312, 330, 'A')]
    state = {'frame': 0, 'record': False, 'screens': []}

    def draw(scr, frame, border, kb):
        for i in range(8):
            kb[i] = 0
        for start, end, key in script:
            if start <= frame < end:
                row, bit = P.KEYS[key]
                kb[P.ROWS[row]] |= 1 << bit
        state['frame'] = frame
        if state['record']:
            state['screens'].append((frame, sim.registers[25], bytes(scr)))
        return frame < 2000

    regs = sim.registers
    pc = [snap.pc]

    def cls_profile():
        """T from the start of CL-LINE at which each screen byte got its final
        value (with STEP resolution)"""
        start = regs[25]
        shots = []
        while pc[0] != 0xA8DD:
            sim.trace(pc[0], 0xA8DD, 0, regs[25] + STEP, 0, draw, None, keyboard, None, None)
            pc[0] = regs[24]
            shots.append((regs[25] - start, bytes(sim.memory[0x4000:0x5B00])))
        last = shots[-1][1]
        when = []
        for k in range(len(last)):
            t = shots[-1][0]
            for dt, scr in reversed(shots):
                if scr[k] != last[k]:
                    break
                t = dt
            when.append(t)
        return when

    def run_to(address):
        if pc[0] == address:
            sim.trace(pc[0], -1, 1, 0, 1, draw, None, keyboard, None, None)
            pc[0] = regs[24]
        sim.trace(pc[0], address, 0, 0, 1, draw, None, keyboard, None, None)
        pc[0] = regs[24]
        if pc[0] != address:
            raise SystemExit('hold %d: $%04X not reached' % (hold, address))
        return regs[25]

    run_to(NEW_GAME)
    run_to(PASS)
    to_hold(hold)(sim.memory)
    if not tune:
        sim.memory[0xFFF8] = 0
    times = []
    for address, name in STOPS:
        times.append(run_to(address))
        if profile and address == 0xA8DA:
            sim.memory[0x4000:0x5B00] = [0xFF] * 0x1B00
            return cls_profile()
        if address == 0xEE84:
            state['record'] = True
            old = bytes(sim.memory[0x4000:0x5B00])
            memory = bytes(sim.memory[:0x10000])
    state['record'] = False
    final = bytes(sim.memory[0x4000:0x5B00])
    if shots_dir:
        os.makedirs(shots_dir, exist_ok=True)
        for frame, t, scr in state['screens']:
            P.write_png(os.path.join(shots_dir, 'hold%02d_%05d.png' % (hold, frame)),
                        P.scr_to_rgb(scr), 256, 2)
    return times, state['screens'], old, final, memory


def describe(scr, old, final):
    """what is on the screen: match with the old and with the new (attributes, pixels)"""
    attrs = scr[0x1800:]
    black = sum(1 for a in attrs if a & 0x3F == 0)
    same_new = sum(1 for a, b in zip(scr, final) if a == b)
    same_old = sum(1 for a, b in zip(scr, old) if a == b)
    return '%5.1f %% new, %5.1f %% old, %3d/768 cells black' % (
        100 * same_new / len(final), 100 * same_old / len(old), black)


def parse_range(text):
    out = []
    for part in text.split(','):
        a, _, b = part.partition('-')
        out += range(int(a), int(b or a) + 1)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--holds', default='1-20')
    ap.add_argument('--tune', action='store_true', help='with the tune')
    ap.add_argument('--shots')
    ap.add_argument('--out', default=os.path.join(B.ROOT, 'build', 'transition'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    phases = []
    record = {'frame': FRAME, 'step': STEP, 'tune': args.tune,
              'stops': ['$%04X' % a for a, n in STOPS], 'holds': {}}
    # T from $A8DA without interrupts, when which screen byte disappeared
    record['cls'] = measure(2, tune=args.tune, profile=True)
    for hold in parse_range(args.holds):
        times, screens, old, final, memory = measure(hold, args.shots, args.tune)
        # memory at the moment of $EE84 – the remake draws the hold from it (matchtransition)
        open(os.path.join(args.out, 'hold%02d.bin' % hold), 'wb').write(memory)
        b64 = lambda data: base64.b64encode(data).decode('ascii')
        record['holds'][hold] = {
            'tstates': [t - times[0] for t in times],
            # what the ULA showed at the end of the transition frames: [T from $EE84, screen]
            'frames': [[t - times[0], b64(scr)] for frame, t, scr in screens],
            'final': b64(final)}
        t0 = times[0]
        print('hold %2d' % hold)
        for (address, name), t in zip(STOPS, times):
            print('  $%04X %-14s %+9d T  %6.2f frames' % (address, name, t - t0, (t - t0) / FRAME))
        for frame, t, scr in screens:
            print('  frame %4d (%+6.2f): %s' % (frame, (t - t0) / FRAME, describe(scr, old, final)))
        phases.append([t - t0 for t in times])
    with open(os.path.join(args.out, 'global.json#transition'), 'w') as f:
        json.dump(record, f)
    if len(phases) > 1:
        print('summary (frames): min / mean / max from $EE84')
        for k, (address, name) in enumerate(STOPS):
            values = [p[k] / FRAME for p in phases]
            print('  $%04X %-14s %6.2f %6.2f %6.2f' % (address, name, min(values),
                  sum(values) / len(values), max(values)))


if __name__ == '__main__':
    main()
