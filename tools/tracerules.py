#!/usr/bin/env python3
"""Záznam celé partie originálu z nahrávky RZX pro `tools/matchrules.mjs`.

    ./tools/tracerules.py [--rzx build/rzx/booty1goldkey.rzx] [--name gold1]

Nahrávky RZX z RZX Archive (`sources/docs/provenance.md`; do projektu
nepatří, leží v `build/rzx/`) jsou **celé partie, které hrál člověk**:
Mousey sebere všech 125 kusů kořisti a najde zlatý klíč (`booty1goldkey`),
nebo dvakrát (`booty2goldkeys`). RZX nese výchozí snapshot (★ kód je náš
z kazety, liší se jen buffery, tabulkou IM 2 a proměnnými – je pořízený
v menu po nahrání) a **vstupy po snímcích**: kolik instrukcí do přerušení
a co vrátil každý `IN`. Přehraje se SkoolKitem (`CSimulator.exec_frame`
jako `rzxplay.py`) – originál tedy běží přesně, jak běžel tomu, kdo hrál.

Na rozdíl od `tracephysics.py` se kód **nesmí upravit**: RZX odpočítává
snímky po instrukcích, takže odbočka by posunula přerušení. Vstupy se
chytají **pozorováním**: SkoolKit volá na každé instrukci funkci se
zastávkou a ta se dívá na `PC`:

- `$DF13` – začátek průchodu hlavní smyčkou: uloží se oblasti paměti
  (`tracephysics.REGIONS`) a vstupy předchozího průchodu
- `$ED38` – hned po `CALL $028E`: `E` = co vrátil ROM `KEY-SCAN` → `K`
- `$E122` a `$E136` – hned po `LD HL,($5C78)` časovače: `HL` = `FRAMES`,
  jak je časovač přečetl → `F`
- `$DEA8` – menu spouští hru (`start.bin`); `$D0A1` – hra skončila

Výstup do `build/rules/<jméno>/` ve tvaru `tracephysics.py`, takže ho
přehraje i `matchphysics.mjs --base build/rules`: `start.bin`,
`init.bin`, `passes.xor.gz`, `inputs.json` (i `frames`: snímek RZX na
konci průchodu, `outcomes`), `regions.json`. Když nahrávka obsahuje víc
her, každá má vlastní adresář (`<jméno>-2` …).
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

KEY_SCANNED = 0xED38     # ★ za CALL $028E v $ED35: E = klávesa
FRAMES_READ = (0xE122, 0xE136)   # ★ za LD HL,($5C78) v $E11F a $E133

RZX = {'gold1': 'booty1goldkey.rzx', 'gold2': 'booty2goldkeys.rzx'}


class Game:
    """Jedna hra z nahrávky: zapisuje se průběžně, průchod po průchodu."""

    def __init__(self, out, rzx, start):
        self.out, self.rzx, self.start = out, rzx, start
        self.inputs, self.frames, self.outcomes = [], [], []
        self.first_frame = None
        self.file = None
        self.previous = None

    def begin(self, memory, frame):
        """první průchod: z téhle paměti remake začíná"""
        os.makedirs(self.out, exist_ok=True)
        open(os.path.join(self.out, 'start.bin'), 'wb').write(self.start)
        open(os.path.join(self.out, 'init.bin'), 'wb').write(bytes(memory[:0x10000]))
        self.first_frame = frame
        self.file = gzip.open(os.path.join(self.out, 'passes.xor.gz'), 'wb', compresslevel=6)

    def add(self, memory, inputs, frame, outcome):
        row = b''.join(bytes(memory[lo:hi]) for lo, hi, n in REGIONS)
        # ★ jako tracephysics.py: rozdíl XOR proti předchozímu průchodu
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
        print('%s: %d průchodů, snímky %d–%d, %s' % (
            self.out, len(self.inputs), self.first_frame, self.frames[-1] if self.frames else 0,
            self.outcomes[-1] if self.outcomes else '-'))


def trace(rzx, name, out_base):
    blocks = [b.obj for b in parse_rzx(rzx)]
    snapshot, recordings = blocks[0], blocks[1:]
    if not recordings or any(not hasattr(r, 'frames') for r in recordings):
        raise SystemExit('%s: čekám snapshot a za ním záznamy vstupů' % rzx)
    context = RZXContext(None)
    context.snapshot = snapshot
    # 'int_active': 0 jako rzxplay.py – přerušení přijímá jen hranice snímku
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
                # vstupy, které přišly před prvním průchodem (nová hra), nikdo nečte
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
            # ★ CALL $DEA8 se vrátil: průchod, ve kterém hra skončila, se
            # uloží jako u tracephysics.py (outcome 'gameover')
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
            # přerušení na hranici snímku, jako rzxplay.py (příznaky 0)
            if registers[IFF]:
                if memory[pc] == 0x76:
                    registers[PC] = (registers[PC] + 1) % 65536
                sim.accept_interrupt(registers, memory, 0)
            state['frame'] += 1
    # hra, kterou nahrávka utnula: průchody až po poslední celý
    if state['game'] and state['game'].file:
        state['game'].close()


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--rzx', help='nahrávka RZX (výchozí: všechny z RZX v build/rzx/)')
    ap.add_argument('--name', help='jméno záznamu (s --rzx)')
    ap.add_argument('--out', default=os.path.join(B.ROOT, 'build', 'rules'))
    args = ap.parse_args()
    if args.rzx:
        trace(args.rzx, args.name or os.path.splitext(os.path.basename(args.rzx))[0], args.out)
        return
    for name, fname in sorted(RZX.items()):
        path = os.path.join(B.ROOT, 'build', 'rzx', fname)
        if not os.path.exists(path):
            raise SystemExit('%s chybí – RZX Archive booty.zip (sources/docs/provenance.md)' % path)
        trace(path, name, args.out)


if __name__ == '__main__':
    main()
