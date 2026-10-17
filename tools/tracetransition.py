#!/usr/bin/env python3
"""Změří, jak originál při přechodu dveřmi překresluje obrazovku.

    ./tools/tracetransition.py [--holds 1-20] [--tune] [--shots DIR]

Hra se spustí v simulátoru se spornou pamětí (`CCMIOSimulator`, jako
`tracecadence.py --cmio`), v prvním průchodu se Jim postaví před první velké
dveře podpalubí 1 s cílem N (`tracephysics.to_hold`) a stiskne `A`. Na
cestě přechodem se zaznamená T-stav na zastávkách kódu:

- `$EE84` ENTER ROOM se rozhodl: nové podpalubí
- `$A900` kreslení podpalubí začíná
- `$A8DA` ROM CL-LINE (`$0E44`) maže 24 řádků; `$A8DD` obraz je černý
  (atributy 0), dál se kreslí neviditelně
- `$AA85` pixely podpalubí hotové (pod atributy 0, tedy neviditelné)
- `$AA90` atributy z `$A4E4` zkopírované na `$5800` (podpalubí vidět)
- `$E0AC` panel se začíná tisknout přes ROM
- `$EEA2` panel hotový
- `$DF13` další průchod

a k tomu obrazovka na konci každého snímku (co ULA ukázala).

**Průběh mazání** se měří zvlášť, jedním během navíc (CL-LINE dělá pořád
totéž): v `$A8DA` se obrazovka vyplní `$FF`, ať se změní každý bajt,
a mazání se pustí **bez přerušení** po `STEP` T-stavech – kdy který bajt
zmizel. Přerušení by do tempa LDIR vložila zastávky v té jediné fázi
vůči snímku, kterou běh náhodou má; jejich čas je v délce mazání
z ostatních běhů a remake ho rozloží rovnoměrně.

★ Melodie je vypnutá (`$FFF8` = 0), pokud se nezadá `--tune`: noty hraje
přerušení a jedna nota mazání obrazovky protáhne i o snímek. Remake tempo
melodie nesimuluje (konstantní tempo, ZADANI §10, `PASS_TSTATES` workeru je
také bez melodie), tak se i přechod měří bez ní. Výstup je
tabulka fází v T-stavech a ve snímcích pro každé N a souhrn; s `--shots`
se snímky přechodu uloží jako PNG. Do `build/transition/` jde
`global.json#transition` (zastávky, průběh mazání, obrazovky snímků) a paměť ve
chvíli `$EE84` pro každé N (`holdNN.bin`) – z nich `tools/mktransition.mjs`
dělá `data/global.json#transition` a `tools/matchtransition.mjs` porovnává.
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
STOPS = [(0xEE84, 'ENTER ROOM'), (0xA900, 'kreslení'), (0xA8DA, 'CLS'),
         (0xA8DD, 'CLS hotový'), (0xAA85, 'pixely'),
         (0xAA90, 'atributy'), (0xE0AC, 'panel'), (0xEEA2, 'panel hotový'),
         (PASS, 'další průchod')]


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
        """T od začátku CL-LINE, kdy který bajt obrazovky dostal konečnou
        hodnotu (s rozlišením STEP)"""
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
            raise SystemExit('podpalubí %d: $%04X nedosaženo' % (hold, address))
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
    """co je na obrazovce: shoda se starou a s novou (atributy, pixely)"""
    attrs = scr[0x1800:]
    black = sum(1 for a in attrs if a & 0x3F == 0)
    same_new = sum(1 for a, b in zip(scr, final) if a == b)
    same_old = sum(1 for a, b in zip(scr, old) if a == b)
    return '%5.1f %% nové, %5.1f %% staré, %3d/768 buněk černých' % (
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
    ap.add_argument('--tune', action='store_true', help='s melodií')
    ap.add_argument('--shots')
    ap.add_argument('--out', default=os.path.join(B.ROOT, 'build', 'transition'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    phases = []
    record = {'frame': FRAME, 'step': STEP, 'tune': args.tune,
              'stops': ['$%04X' % a for a, n in STOPS], 'holds': {}}
    # T od $A8DA bez přerušení, kdy který bajt obrazovky zmizel
    record['cls'] = measure(2, tune=args.tune, profile=True)
    for hold in parse_range(args.holds):
        times, screens, old, final, memory = measure(hold, args.shots, args.tune)
        # paměť ve chvíli $EE84 – z ní kreslí podpalubí remake (matchtransition)
        open(os.path.join(args.out, 'hold%02d.bin' % hold), 'wb').write(memory)
        b64 = lambda data: base64.b64encode(data).decode('ascii')
        record['holds'][hold] = {
            'tstates': [t - times[0] for t in times],
            # co ULA ukázala na konci snímků přechodu: [T od $EE84, obrazovka]
            'frames': [[t - times[0], b64(scr)] for frame, t, scr in screens],
            'final': b64(final)}
        t0 = times[0]
        print('podpalubí %2d' % hold)
        for (address, name), t in zip(STOPS, times):
            print('  $%04X %-14s %+9d T  %6.2f snímku' % (address, name, t - t0, (t - t0) / FRAME))
        for frame, t, scr in screens:
            print('  snímek %4d (%+6.2f): %s' % (frame, (t - t0) / FRAME, describe(scr, old, final)))
        phases.append([t - t0 for t in times])
    with open(os.path.join(args.out, 'global.json#transition'), 'w') as f:
        json.dump(record, f)
    if len(phases) > 1:
        print('souhrn (snímky): min / průměr / max od $EE84')
        for k, (address, name) in enumerate(STOPS):
            values = [p[k] / FRAME for p in phases]
            print('  $%04X %-14s %6.2f %6.2f %6.2f' % (address, name, min(values),
                  sum(values) / len(values), max(values)))


if __name__ == '__main__':
    main()
