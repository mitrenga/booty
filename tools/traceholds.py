#!/usr/bin/env python3
"""Nechá **kód originálu** nakreslit každé podpalubí a uloží, co nakreslil.

    ./tools/traceholds.py [--out build/ref/holds]

Referenční snímky pro `tools/matchholds.mjs`. Nic se tu nekreslí znovu:

1. hra se spustí v simulátoru jako v `playtrace.py` (titulka → `SPACE` →
   menu → `0`) a zastaví se ve chvíli, kdy poprvé dojde na `$E0A9`
   (`CALL $A804`) – jediné místo, odkud se podpalubí kreslí. Systémové
   proměnné ROM (kanál, `TV-FLAG`, `DF-CC`), na kterých tisk závisí, jsou
   tak přesně ty, se kterými kreslí hra
2. pro každé podpalubí n = 1 … 21 se z té RAM udělá kopie, zavolá se
   `$AA97` (zkopíruje tabulky do pracovní oblasti, jako to `$A804` udělá
   při prvním vstupu), do `$5BD3` se zapíše n a od `$A811` se pustí kód
   originálu: `CALL $AB44` (vybere podpalubí a rozbalí jeho tabulky do
   `$BAD7`) a `JP $A900` (nakreslí ho přes ROM a nastaví border), až po
   jeho `RET`
3. uloží se videopaměť `$4000`–`$5AFF` (`holdNN.scr`), mapa znaků
   `$A1C4` (`holdNN.map`, 800 B: kód znaku na buňku, 25 řádků po 32)
   a barva borderu, kterou kód nastavil (`global.json#holds`)

★ `$AAF4` (uložení stavu předchozího podpalubí zpátky do pracovní oblasti,
volá ho `$A804`, když `$5BD3` ≠ 0) se přeskakuje schválně: každé podpalubí
se kreslí z nedotčeného stavu na začátku hry. Co hra v podpalubí změní
(sebraná kořist, otevřené dveře), je M4.

Adresy a jejich význam: `sources/docs/holds.md`.
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
sys.path.insert(0, B.SKOOLKIT)
sys.path.insert(0, B.RETRO)

import playtrace                                                 # noqa: E402
from skoolkit import ROM48, read_bin_file                       # noqa: E402
from skoolkit.simulator import Simulator                         # noqa: E402
from skoolkit.simutils import from_snapshot                      # noqa: E402
from skoolkit.snapshot import Snapshot                           # noqa: E402
from skoolkit.trace import Tracer                                # noqa: E402
try:
    from skoolkit.csimulator import CSimulator
except ImportError:                                              # pragma: no cover
    CSimulator = None

SCRIPT = [(200, 210, 'SPACE'), (300, 310, '0')]
GAME_START = 0xE0A9      # ★ CALL $A804 – jediné místo, odkud se podpalubí kreslí
BUILD = 0xAA97           # ★ zkopíruje tabulky do pracovní oblasti, $5BD3 ← 1
SENTINEL = 0x0001        # návratová adresa, na kterou kód nikdy neskočí
STACK = 0x68F0           # pod RAMTOP z `CLEAR 26870` ($68F6)
PC, SP, IY, IFF = 24, 12, 11, 26


def game_ram(snapshot_path):
    """RAM $4000–$FFFF ve chvíli, kdy hra poprvé zavolá `$E0A9` – start
    hry, těsně před tím, než nakreslí první podpalubí. Systémové proměnné
    (kanál, `TV-FLAG`, `DF-CC`) jsou tak přesně ty, se kterými kreslí ona."""
    snapshot = Snapshot.get(snapshot_path)
    sim = from_snapshot(CSimulator or Simulator, snapshot, {}, {'ay': [None] * 16},
                        {'fast_djnz': False, 'fast_ldir': False}, None)
    tracer = Tracer(sim, snapshot.border, snapshot.out7ffd, snapshot.outfffd,
                    list(snapshot.ay), snapshot.outfe, True)
    sim.set_tracer(tracer)

    def draw(scr, frame, border, keyboard):
        for i in range(8):
            keyboard[i] = 0
        for start, end, key in SCRIPT:
            if start <= frame < end:
                row, bit = playtrace.KEYS[key]
                keyboard[playtrace.ROWS[row]] |= 1 << bit
        return frame < 2000

    tracer.run(snapshot.pc, GAME_START, 0, 0, True, draw, None, None, None, '$', '04X', '04X')
    if sim.registers[PC] != GAME_START:
        raise SystemExit('hra na $%04X nedošla – zkontroluj SCRIPT' % GAME_START)
    return bytes(sim.memory[0x4000:0x10000]), dict(enumerate(sim.registers))


class BorderTracer:
    """Zachytí OUT na port $FE – border, který podpalubí nastaví (`$229B`)."""
    def __init__(self):
        self.border = None

    def write_port(self, registers, port, value, *rest):
        if port & 1 == 0:
            self.border = value & 7

    def read_port(self, registers, port, *rest):
        return 0xFF



def call(memory, registers, address):
    """Zavolá rutinu originálu a nechá ji doběhnout po její RET."""
    memory[STACK] = SENTINEL & 0xFF
    memory[STACK + 1] = SENTINEL >> 8
    sim = Simulator(memory, {'IY': registers[IY - 1] * 256 + registers[IY], 'SP': STACK})
    sim.registers[IFF] = 0
    tracer = BorderTracer()
    sim.set_tracer(tracer)
    sim.run(address, SENTINEL)
    return tracer.border


def draw_hold(ram, registers, number):
    memory = list(read_bin_file(ROM48, 16384)) + list(ram)
    call(memory, registers, BUILD)
    memory[B.HOLD_CURRENT] = number
    border = call(memory, registers, B.HOLD_DRAW)
    return (bytes(memory[0x4000:0x5B00]), bytes(memory[B.CHAR_MAP:B.CHAR_MAP + 800]),
            border)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(B.ROOT, 'build', 'ref', 'holds'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    ram, registers = game_ram(os.path.join(B.ROOT, 'build', 'booty.z80'))

    summary = {}
    for number in range(1, B.HOLD_COUNT + 1):
        scr, charmap, border = draw_hold(ram, registers, number)
        open(os.path.join(args.out, 'hold%02d.scr' % number), 'wb').write(scr)
        open(os.path.join(args.out, 'hold%02d.map' % number), 'wb').write(charmap)
        playtrace.write_png(os.path.join(args.out, 'hold%02d.png' % number),
                            playtrace.scr_to_rgb(scr), 256, 2)
        summary[number] = {'border': border}
        print('podpalubí %2d: border %s' % (number, border))
    with open(os.path.join(args.out, 'global.json#holds'), 'w') as f:
        json.dump(summary, f, indent=1)
    print('%d podpalubí v %s' % (B.HOLD_COUNT, args.out))


if __name__ == '__main__':
    main()
