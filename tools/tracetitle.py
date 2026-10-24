#!/usr/bin/env python3
"""The original's title in the simulator: the sea pass by pass.

    ./tools/tracetitle.py [--frames N] [--out DIR]

★ The title is `$CD86` (`sources/docs/disasm_notes.md` §1): `BORDER 3`,
`LDIR` of the picture from `$6978` to `$4000` and the loop `$CDAF`, which in
every pass calls `$D0AC` – **the sea** – and ROM `KEY-SCAN`. `$D0AC` walks
the bitmap `$4000`–`$57FF` and every byte whose copy at `$6978` equals `$05`
it overwrites with a number from the generator `$D8D4` (state `$D86F`,
`A ← 5·A + 1`): below `$80` it writes it, otherwise it writes 0. It does not
wait for the frame; after 1024 frames (`FRAMES` = `$0400`) it leaves for the
demo `$D602` – when, is measured in both runs (`demoTStates`; with the tune
interrupts get lost under the notes and `FRAMES` runs slower).

The tool runs the snapshot from `./tools/mksnapshot.sh` (PC `$CD14`) without
keys and on every entry into `$CDAF` writes the T-state, the video memory
`$4000`–`$5AFF` and the state of `$D86F`. Two runs, both with contended
memory (`--cmio` from `tracecadence.py`):

- `tune/` – as the original runs, with the tune in the interrupt (`$FFF8` = 3)
- `quiet/` – tune off (`$FFF8` = 0, as `M`): `tools/mktitle.py` takes the
  remake's cadence from it, just like `PASS_TSTATES` for the game

Output `DIR/<run>/passes.bin`: per pass 4 B of T-state (LE), 1 B of `$D86F`
and 6912 B of video memory; `DIR/<run>/info.json` summary. For
`tools/matchtitle.mjs` and `tools/mktitle.py`.
"""
import argparse, json, os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                            # noqa: E402
import playtrace as P                                           # noqa: E402
from skoolkit.snapshot import Snapshot                          # noqa: E402
from skoolkit.simutils import from_snapshot                     # noqa: E402
from skoolkit.trace import Tracer                               # noqa: E402

FRAME = 69888
LOOP = 0xCDAF           # ★ title loop
SEED = 0xD86F           # ★ state of the sea generator $D8D4
TUNE = 0xFFF8           # ★ tune on (≠ 0), `M` toggles it


DEMO = 0xD602           # ★ title after 1024 interrupts: demo


def demo_start(tune):
    """T from the first entry into the loop $CDAF to the jump into the demo $D602."""
    from skoolkit import CCMIOSimulator as cls
    snap = Snapshot.get(os.path.join(B.ROOT, 'build', 'booty.z80'))
    sim = from_snapshot(cls, snap, {}, {'ay': [None] * 16},
                        {'fast_djnz': False, 'fast_ldir': False}, None)
    tracer = Tracer(sim, snap.border, snap.out7ffd, snap.outfffd, list(snap.ay),
                    snap.outfe, True)
    sim.set_tracer(tracer)
    keyboard = tracer.keyboard = [0] * 8

    def draw(scr, frame, border, kb):
        return frame < 3000

    regs = sim.registers
    sim.trace(snap.pc, LOOP, 0, 0, 1, draw, None, keyboard, None, None)
    if not tune:
        sim.memory[TUNE] = 0
    start = regs[25]
    sim.trace(regs[24], DEMO, 0, 0, 1, draw, None, keyboard, None, None)
    if regs[24] != DEMO:
        raise SystemExit('demo $%04X did not start' % DEMO)
    return regs[25] - start


def run(frames, tune):
    from skoolkit import CCMIOSimulator as cls
    snap = Snapshot.get(os.path.join(B.ROOT, 'build', 'booty.z80'))
    sim = from_snapshot(cls, snap, {}, {'ay': [None] * 16},
                        {'fast_djnz': False, 'fast_ldir': False}, None)
    tracer = Tracer(sim, snap.border, snap.out7ffd, snap.outfffd, list(snap.ay),
                    snap.outfe, True)
    sim.set_tracer(tracer)
    keyboard = tracer.keyboard = [0] * 8

    def draw(scr, frame, border, kb):
        return frame < frames

    regs = sim.registers
    pc = snap.pc
    passes = []
    while True:
        sim.trace(pc, LOOP, 0, 0, 1, draw, None, keyboard, None, None)
        pc = regs[24]
        if pc != LOOP:
            break
        if not tune:
            # $CD14 writes 3 before the loop is reached; switching off as `M`
            sim.memory[TUNE] = 0
        passes.append((regs[25], sim.memory[SEED], bytes(sim.memory[0x4000:0x5B00])))
        sim.trace(pc, -1, 1, 0, 1, draw, None, keyboard, None, None)
        pc = regs[24]
    return passes


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    # before the demo: FRAMES reaches $0400 after 1024 frames
    ap.add_argument('--frames', type=int, default=1000)
    ap.add_argument('--out', default=os.path.join(B.ROOT, 'build', 'title'))
    args = ap.parse_args()
    for name, tune in (('tune', True), ('quiet', False)):
        passes = run(args.frames, tune)
        if len(passes) < 3:
            raise SystemExit('loop $%04X was not executed within %d frames' % (LOOP, args.frames))
        out = os.path.join(args.out, name)
        os.makedirs(out, exist_ok=True)
        with open(os.path.join(out, 'passes.bin'), 'wb') as f:
            for t, seed, screen in passes:
                f.write(struct.pack('<IB', t, seed) + screen)
        # the first pass (picture after LDIR) does not count towards the
        # cadence: before it is initialisation, not the loop's work
        durations = [b[0] - a[0] for a, b in zip(passes[1:], passes[2:])]
        info = {
            'tune': tune,
            'frames': args.frames,
            'passes': len(passes),
            'firstT': passes[0][0],
            'passTStates': round(sum(durations) / len(durations)),
            'minTStates': min(durations),
            'maxTStates': max(durations),
            # ★ when the title leaves for the demo (FRAMES = $0400)
            'demoTStates': demo_start(tune),
        }
        json.dump(info, open(os.path.join(out, 'info.json'), 'w'), indent=1)
        print('%-5s %d passes, a pass on average %d T = %.3f frames (%d–%d T), demo after %.2f s'
              % (name, len(passes), info['passTStates'], info['passTStates'] / FRAME,
                 info['minTStates'], info['maxTStates'], info['demoTStates'] / 3500000))


if __name__ == '__main__':
    main()
