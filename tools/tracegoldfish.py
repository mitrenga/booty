#!/usr/bin/env python3
"""Skrytá minihra CATCH 20 GOLDFISH v simulátoru: průchod po průchodu.

    ./tools/tracegoldfish.py [--passes N] [--out DIR] [--keys SEED]

★ Minihra je v kódu na kazetě (`$CE41`, hlavní smyčka `$CF36`), ale hra se
k ní bez zásahu nedostane (`sources/docs/secondary_findings.md` §7). Nástroj
ji pustí, jak to dělá POKE z druhé ruky: `POKE 52798,58` (`JP $D08A` na
`$CE3E` → `LD A,($D08A)`), titulka → `SPACE` → menu → `0`. **Bez kláves**:
potápěč stojí u hladiny, vzduch se mu doplňuje (`$CFD7`) a srážka s rybou
nikoho nezabije, takže smyčka běží donekonečna – přesně to remake ukazuje
jako pozadí menu.

Výstup do `DIR` (výchozí `build/goldfish/`):

- `init.bin` – celá paměť při prvním vstupu do `$CF36` (z ní `mkgoldfish.py`)
- `passes.xor.gz` – oblasti `REGIONS` na začátku každého dalšího průchodu,
  XOR s předchozím a gzip (jako `tracephysics.py`)
- `info.json` – oblasti, počet průchodů, T-stavy, tempo bez melodie

Melodie se vypne (`$FFF8` = 0) jako u `measurecadence.py`: tempo remaku je
bez ní a paměti se netýká. Pro `tools/matchgoldfish.mjs`.

`--keys SEED` (výstup `build/goldfish-keys/`): místo klidu se drží náhodně
klávesy potápěče `5 8 7 6` (výchozí originálu, `$5BEB`–`$5BEE`), aby se
prošly i cesty, které bez kláves nikdy neproběhnou – pohyb a mazání
potápěče, chycení rybky, srážka s velkou rybou, bubliny odjinud. Co ROM
`KEY-SCAN` v `$D585` vrátila, se zaznamená podprogramem v nepoužité RAM
(`CALL $028E` → `CALL $6400`, jako `tracephysics.py`) do `keys.json`, po
průchodech; `matchgoldfish.mjs` to přehraje.
"""
import argparse, gzip, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                            # noqa: E402
import playtrace as P                                           # noqa: E402
from skoolkit.snapshot import Snapshot                          # noqa: E402
from skoolkit.simutils import from_snapshot                     # noqa: E402
from skoolkit.trace import Tracer                               # noqa: E402

FRAME = 69888
LOOP = 0xCF36           # ★ hlavní smyčka minihry
POKE = (52798, 58)      # ★ $CE3E JP $D08A → LD A,($D08A): menu `0` → minihra
SCRIPT = '200:210:SPACE,300:310:0'
KEY_SCAN = 0xD585       # ★ CALL $028E klávesnice minihry ($D579)
STUB = 0x6400
LOG_PTR = 0x64FE
LOG = 0x6500


def fuzz(seed, start, frames):
    """Klávesy potápěče (nebo nic) držené 4–40 snímků, se semínkem."""
    import random
    rnd = random.Random(seed)
    out, frame = [], start
    while frame < start + frames:
        length = rnd.randint(4, 40)
        key = rnd.choice(['5', '8', '7', '6', None, None])
        if key:
            out.append((frame, frame + length, key))
        frame += length
    return out


def patch(memory):
    """$D585 CALL $028E → CALL STUB: KEY-SCAN, E do záznamu, nic jiného."""
    if list(memory[KEY_SCAN:KEY_SCAN + 3]) != [0xCD, 0x8E, 0x02]:
        raise SystemExit('na $%04X není CALL $028E' % KEY_SCAN)
    memory[STUB:STUB + 19] = [0xCD, 0x8E, 0x02,             # CALL $028E
                              0xF5, 0xE5,                   # PUSH AF / PUSH HL
                              0x2A, LOG_PTR & 0xFF, LOG_PTR >> 8,   # LD HL,(ptr)
                              0x73, 0x23,                   # LD (HL),E / INC HL
                              0x22, LOG_PTR & 0xFF, LOG_PTR >> 8,   # LD (ptr),HL
                              0xE1, 0xF1, 0xC9,             # POP HL / POP AF / RET
                              0, 0, 0]
    memory[KEY_SCAN:KEY_SCAN + 3] = [0xCD, STUB & 0xFF, STUB >> 8]
    memory[LOG_PTR] = LOG & 0xFF
    memory[LOG_PTR + 1] = LOG >> 8


def read_log(memory):
    end = memory[LOG_PTR] | (memory[LOG_PTR + 1] << 8)
    out = list(memory[LOG:end])
    memory[LOG_PTR] = LOG & 0xFF
    memory[LOG_PTR + 1] = LOG >> 8
    return out

# (od, do, jméno) – co se po každém průchodu porovnává
REGIONS = [
    (0x4000, 0x5B00, 'obrazovka'),
    (0x5C36, 0x5C38, 'CHARS'),
    (0x5C7D, 0x5C7F, 'COORDS'),
    (0xA06C, 0xA1F4, 'buffery spritu'),
    (0xD33E, 0xD33F, 'vzduch'),
    (0xD86F, 0xD870, 'generátor $D8D4'),
    (0xD93D, 0xD93E, 'čítač průchodů'),
    (0xDB36, 0xDDA0, 'proměnné, objekty, potápěč, písek, bubliny'),
]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--passes', type=int, default=3000)
    ap.add_argument('--out')
    ap.add_argument('--keys', type=int, help='semínko náhodných kláves potápěče')
    args = ap.parse_args()
    if args.out is None:
        args.out = os.path.join(B.ROOT, 'build', 'goldfish' if args.keys is None else 'goldfish-keys')
    os.makedirs(args.out, exist_ok=True)

    from skoolkit import CCMIOSimulator as cls
    snap = Snapshot.get(os.path.join(B.ROOT, 'build', 'booty.z80'))
    sim = from_snapshot(cls, snap, {}, {'ay': [None] * 16},
                        {'fast_djnz': False, 'fast_ldir': False}, None)
    if list(sim.memory[0xCE3E:0xCE41]) != [0xC3, 0x8A, 0xD0]:
        raise SystemExit('na $CE3E není JP $D08A')
    sim.memory[POKE[0]] = POKE[1]
    if args.keys is not None:
        patch(sim.memory)
    tracer = Tracer(sim, snap.border, snap.out7ffd, snap.outfffd, list(snap.ay),
                    snap.outfe, True)
    sim.set_tracer(tracer)
    keyboard = tracer.keyboard = [0] * 8
    script = P.parse_script(SCRIPT)
    limit = [100000]

    state_frame = [0]

    def draw(scr, frame, border, kb):
        state_frame[0] = frame
        for i in range(8):
            kb[i] = 0
        for a, b, k in script:
            if a <= frame < b:
                row, bit = P.KEYS[k]
                kb[P.ROWS[row]] |= 1 << bit
        return frame < limit[0]

    regs = sim.registers
    sim.trace(snap.pc, LOOP, 0, 0, 1, draw, None, keyboard, None, None)
    if regs[24] != LOOP:
        raise SystemExit('minihra $%04X nezačala' % LOOP)
    sim.memory[0xFFF8] = 0
    if args.keys is not None:
        read_log(sim.memory)
        script.extend(fuzz(args.keys, state_frame[0] + 1, 40 * args.passes))
    open(os.path.join(args.out, 'init.bin'), 'wb').write(bytes(sim.memory[:0x10000]))
    keys = []
    tstates = [regs[25]]
    passes = bytearray()
    for _ in range(args.passes):
        sim.trace(regs[24], -1, 1, 0, 1, draw, None, keyboard, None, None)
        sim.trace(regs[24], LOOP, 0, 0, 1, draw, None, keyboard, None, None)
        if regs[24] != LOOP:
            raise SystemExit('smyčka $%04X se přerušila' % LOOP)
        tstates.append(regs[25])
        if args.keys is not None:
            keys.append(read_log(sim.memory))
        for lo, hi, name in REGIONS:
            passes += bytes(sim.memory[lo:hi])
    size = sum(hi - lo for lo, hi, name in REGIONS)
    delta = bytes(passes[:size])
    if len(passes) > size:
        tail = int.from_bytes(passes[size:], 'big') ^ int.from_bytes(passes[:-size], 'big')
        delta += tail.to_bytes(len(passes) - size, 'big')
    with gzip.open(os.path.join(args.out, 'passes.xor.gz'), 'wb', compresslevel=6) as f:
        f.write(delta)
    durations = [b - a for a, b in zip(tstates, tstates[1:])]
    info = {'passes': args.passes, 'regions': [[lo, hi, name] for lo, hi, name in REGIONS],
            'tstates': tstates,
            'passTStates': round(sum(durations) / len(durations)),
            'minTStates': min(durations), 'maxTStates': max(durations)}
    if args.keys is not None:
        info['keys'] = keys
    json.dump(info, open(os.path.join(args.out, 'info.json'), 'w'), ensure_ascii=False)
    print('%d průchodů, průchod průměrně %d T = %.3f snímku (%d–%d T)'
          % (args.passes, info['passTStates'], info['passTStates'] / FRAME,
             info['minTStates'], info['maxTStates']))


if __name__ == '__main__':
    main()
