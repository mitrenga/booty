#!/usr/bin/env python3
"""Recording of a whole game of the original from an RZX recording for `tools/matchrules.mjs`.

    ./tools/tracerules.py [--rzx build/rzx/booty1goldkey.rzx] [--name gold1]

The RZX recordings from the RZX Archive (`sources/docs/provenance.md`; they do
not belong to the project, they lie in `build/rzx/`) are **whole games played
by a human**: Mousey collects all 125 pieces of loot and finds the gold key
(`booty1goldkey`), or twice (`booty2goldkeys`). The RZX carries the initial
snapshot (★ the code is ours from the tape, only the buffers, the IM 2 table
and the variables differ – it was taken in the menu after loading) and the
**inputs by frames**: how many instructions until the interrupt and what every
`IN` returned. It is replayed with SkoolKit (`CSimulator.exec_frame` as in
`rzxplay.py`) – so the original runs exactly as it ran for the player.

Unlike `tracephysics.py` the code **must not be modified**: RZX counts frames
by instructions, so a detour would shift the interrupts. The inputs are caught
**by observation**: SkoolKit calls a stop function on every instruction and
that one looks at `PC`:

- `$DF13` – start of a main-loop pass: the memory areas are saved
  (`tracephysics.REGIONS`) along with the inputs of the previous pass
- `$ED38` – right after `CALL $028E`: `E` = what ROM `KEY-SCAN` returned → `K`
- `$E122` and `$E136` – right after the timer's `LD HL,($5C78)`: `HL` =
  `FRAMES` as the timer read it → `F`
- `$DEA8` – the menu starts the game (`start.bin`); `$D0A1` – the game ended

Output to `build/rules/<name>/` in the shape of `tracephysics.py`, so
`matchphysics.mjs --base build/rules` replays it too: `start.bin`,
`init.bin`, `passes.xor.gz`, `inputs.json` (also `frames`: the RZX frame at
the end of the pass, `outcomes`), `regions.json`. When the recording holds
more games, each has its own directory (`<name>-2` …).
"""
import argparse, gzip, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
sys.path.insert(0, B.SKOOLKIT)

from tracephysics import REGIONS, PASS, NEW_GAME, GAME_OVER      # noqa: E402
from skoolkit import CSimulator                                  # noqa: E402
from skoolkit.rzxplay import parse_rzx, RZXTracer, RZXContext    # noqa: E402
from skoolkit.simulator import Simulator                         # noqa: E402
from skoolkit.simutils import from_snapshot, E, H, L, PC, T, IFF  # noqa: E402

KEY_SCANNED = 0xED38     # ★ after CALL $028E in $ED35: E = key
FRAMES_READ = (0xE122, 0xE136)   # ★ after LD HL,($5C78) in $E11F and $E133

RZX = {'gold1': 'booty1goldkey.rzx', 'gold2': 'booty2goldkeys.rzx'}


class Game:
    """One game from the recording: written incrementally, pass by pass."""

    def __init__(self, out, rzx, start):
        self.out, self.rzx, self.start = out, rzx, start
        self.inputs, self.frames, self.outcomes = [], [], []
        self.first_frame = None
        self.file = None
        self.previous = None

    def begin(self, memory, frame):
        """first pass: the remake starts from this memory"""
        os.makedirs(self.out, exist_ok=True)
        open(os.path.join(self.out, 'start.bin'), 'wb').write(self.start)
        open(os.path.join(self.out, 'init.bin'), 'wb').write(bytes(memory[:0x10000]))
        self.first_frame = frame
        self.file = gzip.open(os.path.join(self.out, 'passes.xor.gz'), 'wb', compresslevel=6)

    def add(self, memory, inputs, frame, outcome):
        row = b''.join(bytes(memory[lo:hi]) for lo, hi, n in REGIONS)
        # ★ as tracephysics.py: XOR difference against the previous pass
        if self.previous is None:
            self.file.write(row)
        else:
            x = int.from_bytes(row, 'big') ^ int.from_bytes(self.previous, 'big')
            self.file.write(x.to_bytes(len(row), 'big'))
        self.previous = row
        self.inputs.append(inputs)
        self.frames.append(frame)
        self.outcomes.append(outcome)

    def close(self):
        self.file.close()
        with open(os.path.join(self.out, 'inputs.json'), 'w') as f:
            json.dump({'rzx': self.rzx, 'firstFrame': self.first_frame, 'frames': self.frames,
                       'inputs': self.inputs, 'outcomes': self.outcomes}, f)
        with open(os.path.join(self.out, 'regions.json'), 'w') as f:
            json.dump([[lo, hi, name] for lo, hi, name in REGIONS], f, ensure_ascii=False)
        print('%s: %d passes, frames %d–%d, %s' % (
            self.out, len(self.inputs), self.first_frame, self.frames[-1] if self.frames else 0,
            self.outcomes[-1] if self.outcomes else '-'))


def trace(rzx, name, out_base):
    blocks = [b.obj for b in parse_rzx(rzx)]
    snapshot, recordings = blocks[0], blocks[1:]
    if not recordings or any(not hasattr(r, 'frames') for r in recordings):
        raise SystemExit('%s: expected a snapshot followed by input recordings' % rzx)
    context = RZXContext(None)
    context.snapshot = snapshot
    # 'int_active': 0 as in rzxplay.py – interrupts are accepted only at the frame boundary
    sim = from_snapshot(CSimulator or Simulator, snapshot, config={'int_active': 0})
    context.simulator = sim
    memory, registers = sim.memory, sim.registers
    state = {'frame': 0, 'game': None, 'log': [], 'count': 0}

    def stop(fetch_counter, pc):
        if pc == PASS:
            game = state['game']
            if game is None:
                return
            if game.file is None:
                # inputs that came before the first pass (new game) are read by nobody
                game.begin(memory, state['frame'])
            else:
                game.add(memory, state['log'], state['frame'], 'pass')
            state['log'] = []
        elif pc == KEY_SCANNED:
            state['log'].append(['K', registers[E]])
        elif pc in FRAMES_READ:
            state['log'].append(['F', registers[L] | (registers[H] << 8)])
        elif pc == NEW_GAME:
            state['count'] += 1
            k = state['count']
            out = os.path.join(out_base, name if k == 1 else '%s-%d' % (name, k))
            state['game'] = Game(out, os.path.basename(rzx), bytes(memory[:0x10000]))
            state['log'] = []
        elif pc == GAME_OVER:
            # ★ CALL $DEA8 returned: the pass in which the game ended is saved
            # as in tracephysics.py (outcome 'gameover')
            game = state['game']
            if game and game.file:
                game.add(memory, state['log'], state['frame'], 'gameover')
                game.close()
            state['game'] = None

    for recording in recordings:
        tracer = RZXTracer(context, recording)
        sim.set_tracer(tracer)
        fetch_counter = tracer.next_frame()
        while fetch_counter >= 0:
            pc = sim.exec_frame(fetch_counter, None, stop)
            registers[T] = 0
            fetch_counter = tracer.next_frame()
            # interrupt at the frame boundary, as in rzxplay.py (flags 0)
            if registers[IFF]:
                if memory[pc] == 0x76:
                    registers[PC] = (registers[PC] + 1) % 65536
                sim.accept_interrupt(registers, memory, 0)
            state['frame'] += 1
    # a game the recording cut off: passes up to the last complete one
    if state['game'] and state['game'].file:
        state['game'].close()


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--rzx', help='RZX recording (default: all from RZX in build/rzx/)')
    ap.add_argument('--name', help='name of the recording (with --rzx)')
    ap.add_argument('--out', default=os.path.join(B.ROOT, 'build', 'rules'))
    args = ap.parse_args()
    if args.rzx:
        trace(args.rzx, args.name or os.path.splitext(os.path.basename(args.rzx))[0], args.out)
        return
    for name, fname in sorted(RZX.items()):
        path = os.path.join(B.ROOT, 'build', 'rzx', fname)
        if not os.path.exists(path):
            raise SystemExit('%s is missing – RZX Archive booty.zip (sources/docs/provenance.md)' % path)
        trace(path, name, args.out)


if __name__ == '__main__':
    main()
