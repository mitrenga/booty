#!/usr/bin/env python3
"""Sound of the original in the simulator: every speaker edge in T-states.

    ./tools/tracesound.py [--frames N] [--out DIR]

★ Booty plays only in the IM 2 interrupt handler `$FE69` (`disasm_notes.md` §2)
and three times ROM `BEEPER` from the main loop. The tool takes the **real
code** from the snapshot (`./tools/mksnapshot.sh`) in the state it has on the
title (`$CDAF`: `$FFF7`, `$FFF9`, `$FE86` and the vector `$FEFE` set by the
code at `$CD14`), and writes:

1. `paths.json` – **the interrupt handler by paths**: the simulator (SkoolKit,
   without contended memory) runs `$FE69` for each path separately – the tune
   on every note of the `$FA00` table and on `$FF`, slots `$FFFB`+`$FFFC`,
   `$FFFF` 1/2, `$FFFD` 1/2 (noise at several positions of the `$FE86`
   pointer, even past the end of the ROM), `$FFFE` 1–7, with `$FE88` in both
   phases – and records every `OUT` to port `$FE` (T from entry at `$FE69`,
   bit 4), the length up to the return and the memory state the handler
   changed. In addition ROM `BEEPER` with the parameters the game calls it with
   (`$EB8D`, `$E2xx`, `$E3A4`), and ROM `$0038` itself (length with no key
   pressed). And **drowning** `$E361` up to `$E3A3` for several states of the
   generator `$F343` (without interrupts).
2. `global.json#title` – **the tune on the title**: a run from `$CD14` without
   keys, every entry into the handler (T, `$FE88`, `$FFF9`, `$FE86`) and every
   change of bit 4 of port `$FE` (T, new level). From this `tools/matchsound.mjs`
   proves when the handler runs and when an interrupt is lost because a long
   note overran it.

For `tools/mksounds.py` (data) and `tools/matchsound.mjs` (check).
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                            # noqa: E402
import playtrace as P                                           # noqa: E402
from skoolkit.snapshot import Snapshot                          # noqa: E402
from skoolkit.simulator import Simulator                        # noqa: E402
from skoolkit.simutils import from_snapshot                     # noqa: E402
from skoolkit.trace import Tracer                               # noqa: E402

FRAME = 69888
TITLE = 0xCDAF          # ★ title loop – here the sound state is set
HANDLER = 0xFE69        # ★ IM 2 handler (after the JP at $FEFE)
SENTINEL = 0x0000       # return: an address the code never returns to
STACK = 0xFF40
T, PC, SP = 25, 24, 12
A, F, B_, C_, D_, E_, H_, L_ = 0, 1, 2, 3, 4, 5, 6, 7
IY = 10                 # SkoolKit: IXh 8, IXl 9, IYh 10, IYl 11
BEEPERS = [            # ★ (DE, HL) of the ROM BEEPER calls in the game (app/bootyLogic.js)
    (0x32, 0xC8),       # $EB8D door
    (0xC8, 0xC8),       # gold key
    (0xC8, 0x64),       # $E3A4 death
]


def title_state(frames=None, log=None):
    """C simulator from $CD14 to the first $CDAF; with `frames` it runs on and logs."""
    snap = Snapshot.get(os.path.join(B.ROOT, 'build', 'booty.z80'))
    sim = from_snapshot(P.CSimulator, snap, {}, {'ay': [None] * 16},
                        {'fast_djnz': False, 'fast_ldir': False}, None)
    tracer = Tracer(sim, snap.border, snap.out7ffd, snap.outfffd, list(snap.ay),
                    snap.outfe, True)
    edges = []
    level = [None]

    def write_port(registers, port, value, offset):
        if port % 2 == 0:
            bit = value & 0x10
            if bit != level[0]:
                level[0] = bit
                edges.append([registers[T], bit >> 4])
    tracer.write_port = write_port
    sim.set_tracer(tracer)
    keyboard = tracer.keyboard = [0] * 8
    limit = [frames or 10000]

    def draw(scr, frame, border, kb):
        return frame < limit[0]

    regs = sim.registers
    pc = snap.pc
    sim.trace(pc, TITLE, 0, 0, 1, draw, None, keyboard, None, None)
    if regs[PC] != TITLE:
        raise SystemExit('title $%04X was not executed' % TITLE)
    if frames is None:
        return sim
    entries = []
    pc = regs[PC]
    edges.clear()
    # the speaker's level when the log starts (None: nothing written yet)
    level0 = None if level[0] is None else level[0] >> 4
    while True:
        sim.trace(pc, HANDLER, 0, 0, 1, draw, None, keyboard, None, None)
        pc = regs[PC]
        if pc != HANDLER:
            break
        m = sim.memory
        entries.append([regs[T], m[0xFE88], m[0xFFF9] | (m[0xFFFA] << 8),
                        m[0xFE86] | (m[0xFE87] << 8)])
        sim.trace(pc, -1, 1, 0, 1, draw, None, keyboard, None, None)
        pc = regs[PC]
    return {'entries': entries, 'edges': edges, 'level': level0, 'frame': FRAME}


class Ports:
    def __init__(self):
        self.outs = []

    def write_port(self, registers, port, value, offset):
        if port % 2 == 0:
            self.outs.append([registers[T], (value >> 4) & 1])

    def read_port(self, registers, port):
        return 0xFF             # no key


def run(memory, start, regs=None, stop=SENTINEL):
    """Runs `start` until the return to SENTINEL (or until `stop`); returns the
    OUTs, the length and the memory."""
    mem = bytearray(memory)
    sim = Simulator(mem, config={'fast_djnz': False, 'fast_ldir': False})
    ports = Ports()
    sim.set_tracer(ports)
    r = sim.registers
    for k, v in (regs or {}).items():
        r[k] = v
    r[SP] = STACK - 2
    mem[STACK - 2] = SENTINEL & 0xFF
    mem[STACK - 1] = SENTINEL >> 8
    # the handler expects AF and IY on the stack too, pushed by the entry;
    # here the entry is at $FE69, so it does that itself
    r[T] = 0
    sim.run(start, stop)
    return [[t, b] for t, b in ports.outs], r[T], mem


def handler_case(base, setup, notes=None):
    mem = bytearray(base)
    for addr, value in setup.items():
        mem[addr] = value
    outs, t, after = run(mem, HANDLER, {IY: 0x5C})
    watch = {'FE88': after[0xFE88], 'FFF9': after[0xFFF9] | (after[0xFFFA] << 8),
             'FE86': after[0xFE86] | (after[0xFE87] << 8),
             'FFFB': after[0xFFFB], 'FFFC': after[0xFFFC], 'FFFD': after[0xFFFD],
             'FFFE': after[0xFFFE], 'FFFF': after[0xFFFF]}
    return {'setup': {'%04X' % a: v for a, v in setup.items()}, 'outs': outs,
            'tstates': t, 'after': watch}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--frames', type=int, default=1000)
    ap.add_argument('--out', default=os.path.join(B.ROOT, 'build', 'sound'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    sim = title_state()
    base = bytearray(sim.memory[:0x10000])
    for a in range(0xFFFB, 0x10000):
        base[a] = 0
    state = {'FFF7': base[0xFFF7], 'FFF8': base[0xFFF8],
             'FFF9': base[0xFFF9] | (base[0xFFFA] << 8),
             'FE86': base[0xFE86] | (base[0xFE87] << 8), 'FE88': base[0xFE88],
             '5BD0': base[0x5BD0], 'FEFE': list(base[0xFEFE:0xFF01])}
    mask = base[0xFFF7]
    play = (-1) & 0xFF          # FE88 that gives phase 0 after INC
    other = 0                   # … and phase 1

    cases = {}
    # tune: every table entry (including $FF) in the phase when it plays, and one outside it
    a = 0xFA00
    tune = []
    while True:
        tune.append(a)
        if base[a] == 0xFF:
            break
        a += 4
    for addr in tune:
        cases['tune %04X' % addr] = handler_case(
            base, {0xFFF8: 1, 0xFE88: play, 0xFFF9: addr & 0xFF, 0xFFFA: addr >> 8})
    cases['tune off-phase'] = handler_case(base, {0xFFF8: 1, 0xFE88: other})
    cases['tune off'] = handler_case(base, {0xFFF8: 0, 0xFE88: play})
    # slots
    for name, fe88 in (('0', play), ('1', other), ('7', 6), ('15', 14)):
        cases['FFFB+FFFC fe88+1=%s' % name] = handler_case(base, {0xFFFB: 1, 0xFFFC: 1, 0xFE88: fe88})
        cases['FFFB only fe88+1=%s' % name] = handler_case(base, {0xFFFB: 1, 0xFE88: fe88, 0xFFF8: 1})
        for v in (1, 2):
            cases['FFFF=%d fe88+1=%s' % (v, name)] = handler_case(base, {0xFFFF: v, 0xFE88: fe88})
            for ptr in (0x0000, 0x1234, 0x1FF0, 0x1FFF):
                cases['FFFD=%d fe88+1=%s ptr=%04X' % (v, name, ptr)] = handler_case(
                    base, {0xFFFD: v, 0xFE88: fe88, 0xFE86: ptr & 0xFF, 0xFE87: ptr >> 8})
        for v in range(1, 9):
            cases['FFFE=%d fe88+1=%s' % (v, name)] = handler_case(base, {0xFFFE: v, 0xFE88: fe88, 0xFFF8: 1})
    # ROM $0038 itself, without a key
    _, rom_t, _ = run(base, 0x0038, {IY: 0x5C, IY + 1: 0x3A})
    # ROM BEEPER from the main loop
    beepers = {}
    for de, hl in BEEPERS:
        outs, t, _ = run(base, 0x03B5, {D_: de >> 8, E_: de & 0xFF, H_: hl >> 8, L_: hl & 0xFF})
        beepers['%d,%d' % (de, hl)] = {'de': de, 'hl': hl, 'outs': outs, 'tstates': t}

    # ★ drowning $E361 (from the main loop): up to $E3A3, where death begins
    drown = {}
    for seed in (0x0000, 0x1234, 0xBEEF, 0xFFFF):
        mem = bytearray(base)
        mem[0xF343] = seed & 0xFF
        mem[0xF344] = seed >> 8
        outs, t, after = run(mem, 0xE361, stop=0xE3A3)
        drown['%04X' % seed] = {'seed': seed, 'outs': outs, 'tstates': t,
                                'after': after[0xF343] | (after[0xF344] << 8)}

    json.dump({'state': state, 'romInterrupt': rom_t, 'handler': cases, 'beeper': beepers,
               'drown': drown},
              open(os.path.join(args.out, 'paths.json'), 'w'))
    title = title_state(args.frames)
    json.dump(title, open(os.path.join(args.out, 'global.json#title'), 'w'))
    print('handler: %d paths, ROM $0038 %d T, BEEPER %d calls; title %d handler runs, %d edges'
          % (len(cases), rom_t, len(beepers), len(title['entries']), len(title['edges'])))
    print('state on the title: %s' % state)


if __name__ == '__main__':
    main()
