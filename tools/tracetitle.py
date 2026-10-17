#!/usr/bin/env python3
"""Titulka originálu v simulátoru: moře průchod po průchodu.

    ./tools/tracetitle.py [--frames N] [--out DIR]

★ Titulka je `$CD86` (`sources/docs/disasm_notes.md` §1): `BORDER 3`,
`LDIR` obrázku z `$6978` na `$4000` a smyčka `$CDAF`, která v každém
průchodu zavolá `$D0AC` – **moře** – a ROM `KEY-SCAN`. `$D0AC` projde
bitmapu `$4000`–`$57FF` a bajt, který má kopie na `$6978` rovný `$05`,
přepíše číslem z generátoru `$D8D4` (stav `$D86F`, `A ← 5·A + 1`):
pod `$80` ho zapíše, jinak zapíše 0. Na snímek nečeká; po 1024 snímcích
(`FRAMES` = `$0400`) odejde do ukázky `$D602` – kdy, se změří v obou
během (`demoTStates`; s melodií se přerušení pod notami ztrácejí
a `FRAMES` jde pomaleji).

Nástroj pustí snapshot z `./tools/mksnapshot.sh` (PC `$CD14`) bez kláves
a na každém vstupu do `$CDAF` zapíše T-stav, videopaměť `$4000`–`$5AFF`
a stav `$D86F`. Dva běhy, oba se spornou pamětí (`--cmio` z
`tracecadence.py`):

- `tune/` – jak originál běží, s melodií v přerušení (`$FFF8` = 3)
- `quiet/` – melodie vypnutá (`$FFF8` = 0, jako `M`): z něj bere
  `tools/mktitle.py` tempo remaku, stejně jako `PASS_TSTATES` u hry

Výstup `DIR/<běh>/passes.bin`: za každý průchod 4 B T-stavu (LE), 1 B
`$D86F` a 6912 B videopaměti; `DIR/<běh>/info.json` souhrn. Pro
`tools/matchtitle.mjs` a `tools/mktitle.py`.
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
LOOP = 0xCDAF           # ★ smyčka titulky
SEED = 0xD86F           # ★ stav generátoru moře $D8D4
TUNE = 0xFFF8           # ★ melodie zapnutá (≠ 0), `M` ji přepíná


DEMO = 0xD602           # ★ titulka po 1024 přerušeních: ukázka


def demo_start(tune):
    """T od prvního vstupu do smyčky $CDAF po skok do ukázky $D602."""
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
        raise SystemExit('ukázka $%04X nezačala' % DEMO)
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
            # $CD14 zapíše 3 dřív, než se do smyčky dojde; vypnutí jako `M`
            sim.memory[TUNE] = 0
        passes.append((regs[25], sim.memory[SEED], bytes(sim.memory[0x4000:0x5B00])))
        sim.trace(pc, -1, 1, 0, 1, draw, None, keyboard, None, None)
        pc = regs[24]
    return passes


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    # před ukázkou: FRAMES dojde na $0400 po 1024 snímcích
    ap.add_argument('--frames', type=int, default=1000)
    ap.add_argument('--out', default=os.path.join(B.ROOT, 'build', 'title'))
    args = ap.parse_args()
    for name, tune in (('tune', True), ('quiet', False)):
        passes = run(args.frames, tune)
        if len(passes) < 3:
            raise SystemExit('smyčka $%04X se za %d snímků nevykonala' % (LOOP, args.frames))
        out = os.path.join(args.out, name)
        os.makedirs(out, exist_ok=True)
        with open(os.path.join(out, 'passes.bin'), 'wb') as f:
            for t, seed, screen in passes:
                f.write(struct.pack('<IB', t, seed) + screen)
        # první průchod (obrázek po LDIR) se do tempa nepočítá: před ním
        # je inicializace, ne práce smyčky
        durations = [b[0] - a[0] for a, b in zip(passes[1:], passes[2:])]
        info = {
            'tune': tune,
            'frames': args.frames,
            'passes': len(passes),
            'firstT': passes[0][0],
            'passTStates': round(sum(durations) / len(durations)),
            'minTStates': min(durations),
            'maxTStates': max(durations),
            # ★ kdy titulka odejde do ukázky (FRAMES = $0400)
            'demoTStates': demo_start(tune),
        }
        json.dump(info, open(os.path.join(out, 'info.json'), 'w'), indent=1)
        print('%-5s %d průchodů, průchod průměrně %d T = %.3f snímku (%d–%d T), ukázka po %.2f s'
              % (name, len(passes), info['passTStates'], info['passTStates'] / FRAME,
                 info['minTStates'], info['maxTStates'], info['demoTStates'] / 3500000))


if __name__ == '__main__':
    main()
