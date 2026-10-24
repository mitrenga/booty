#!/usr/bin/env python3
"""Recording of the original's main-loop passes for `tools/matchphysics.mjs`.

    ./tools/tracephysics.py [--script NAME] [--list]

The game is started in the simulator as in `playtrace.py` (title → `SPACE` →
menu → `0`) and played by a key script (`SCRIPTS` below, by frames).
At the start of **every pass through the main loop** (`$DF13`) it saves:

- **memory** in the `REGIONS` areas – screen, game variables, system
  variables of printing, buffers (character map, sprite buffer), the hold
  working area, objects and variables from `$F231`. At the first stop the
  whole 64 KB is saved as well (`init.bin`) – the remake starts from it
- **inputs of the pass** – what enters the pass from outside and cannot be
  derived from memory:
  - `K` = what ROM `KEY-SCAN` returned (register E) in `$ED35`; which key is
    down at that moment depends on exactly when the keyboard is read
  - `F` = the value of `FRAMES` (`$5C78`) read by the timer `$E12A`
    (`$E133`, `$E11F`); `FRAMES` is incremented by the interrupt, not the game

★ **How the inputs are caught.** In the simulator a detour to a short
subroutine in unused RAM (`$6400`) is inserted at three places of the code:
`CALL $028E` at `$ED35` and `LD HL,($5C78)` at `$E133` and `$E11F` are
replaced by a `CALL` to a subroutine that does the same (flags are kept too,
`$E136` is `SBC HL,DE` with carry) and writes the result into the log. The
pass gets longer by a few dozen T-states – so interrupts land slightly
differently than in the untouched original – but the log is **one consistent
run** of the original and the remake gets exactly the inputs that run got.

Output to `build/trace/<script>/`: `start.bin` (whole memory at the moment
the menu starts the game, `$DEA8`), `init.bin`, `passes.xor.gz` (the areas
after every pass one after another, each pass as XOR with the previous one,
gzip), `inputs.json` (also `outcomes`: `gameover` at the pass after which the
game ended, and `tstates`: the simulator's T-state counter at the end of
every pass – the pass length including interrupts),
`regions.json`.
"""
import argparse, gzip, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
sys.path.insert(0, B.SKOOLKIT)
sys.path.insert(0, B.RETRO)

from playtrace import KEYS, ROWS                                 # noqa: E402
from skoolkit.snapshot import Snapshot                           # noqa: E402
from skoolkit.simulator import Simulator                         # noqa: E402
from skoolkit.simutils import from_snapshot                      # noqa: E402
from skoolkit.trace import Tracer                                # noqa: E402
try:
    from skoolkit.csimulator import CSimulator
except ImportError:                                              # pragma: no cover
    CSimulator = None

PASS = 0xDF13            # ★ start of a main-loop pass
NEW_GAME = 0xDEA8        # ★ new game (CALL from the menu, $D09E)
GAME_OVER = 0xD0A1       # ★ where CALL $DEA8 (menu) returns when the game ends
DEMO_OVER = 0xD60B       # ★ where CALL $DEA8 of the demo ($D602) returns when it ends
PARK = 0x6440            # where the run is parked after game over: a flag and JR $
PARKED = 0x643F          # parked flag (interrupts keep running, PC is not enough)
STUBS = 0x6400           # logging subroutines (RAM below RAMTOP, unused by the game)
LOG = 0x6500             # log of the inputs of one pass
LOG_PTR = 0x64FE

# (from, to, name) – the areas compared after every pass
REGIONS = [
    (0x4000, 0x5B00, 'screen'),
    (0x5BCC, 0x5C00, 'game variables $5BCC'),
    (0x5C36, 0x5C38, 'CHARS'),
    (0x5C84, 0x5C92, 'ROM printing (DF-CC … P-FLAG)'),
    (0xA06C, 0xA804, 'buffers (sprite, character and attribute map)'),
    # pointers, hold buffer $BAD7 and the working copy of all 21 holds
    # from $BCCB (3786 B, hold 1 is at the end)
    (0xBAA0, 0xCB96, 'hold working area'),
    (0xE46F, 0xE47A, 'explosion'),
    (0xE820, 0xE821, 'platform under Jim'),
    (0xF231, 0xF346, 'objects and variables $F231'),
]

GAME = [(200, 210, 'SPACE'), (300, 310, '0')]
# ★ default keys of the original: 5 left, 8 right, 7 up, 6 down, A door
KEYSET = ['5', '8', '7', '6', 'A', None]


def fuzz(seed, frames, weights=(3, 3, 2, 2, 2, 1)):
    """Seeded random play: a key (or nothing) held for 4–60 frames."""
    import random
    rnd = random.Random(seed)
    out, frame = list(GAME), 330
    while frame < 330 + frames:
        length = rnd.randint(4, 60)
        key = rnd.choices(KEYSET, weights=weights)[0]
        if key:
            out.append((frame, frame + length, key))
        frame += length
    return out


# name: (key script, memory writes before the first pass)
# ★ The writes change the initial state of the **original** in the simulator –
# the remake starts from the same memory (init.bin), so it is always one and
# the same run that is compared: `$5BF1` lives (more lives = longer game),
# `$5BF2` remaining loot (1 → the first piece collected starts the gold key
# countdown), `$5BF4` collected loot (≥ 100 → creature timer after 850 frames).
SCRIPTS = {
    # walking the deck back and forth, to the edge, up and down a ladder
    'walk': (GAME + [(330, 420, '8'), (430, 560, '5'), (570, 620, '8'),
                     (630, 700, '7'), (710, 760, '6'), (770, 900, '5'),
                     (910, 1000, '8'), (1010, 1100, '7'), (1110, 1300, '5')], {}),
    'fuzz1': (fuzz(1, 6000), {0x5BF1: 9}),
    'fuzz2': (fuzz(2, 6000), {0x5BF1: 9}),
    'fuzz3': (fuzz(3, 6000, (2, 2, 3, 3, 4, 1)), {0x5BF1: 9}),
    'fuzz4': (fuzz(4, 6000, (2, 2, 3, 3, 4, 1)), {0x5BF1: 9, 0x5BF4: 100}),
    # gold key: one piece of loot remains
    'gold': (fuzz(5, 6000, (3, 3, 2, 2, 1, 1)), {0x5BF1: 9, 0x5BF2: 1}),
    # without added lives until game over
    'gameover': (fuzz(6, 9000, (3, 3, 2, 2, 3, 1)), {}),
    # untouched game to the end: all four deaths (M4, matchrules.mjs
    # runs it through the worker from a new game)
    'lastlife': (fuzz(6, 60000, (3, 3, 2, 2, 3, 1)), {}),
    # ★ demo: without keys the title starts it by itself after 1024 interrupts
    # ($D602, `$5BF0` = 3) – hold 1, after 768 interrupts a random one,
    # after another 768 the end ($ED8F) and back to the title
    'demo': ([], {'until': 5000}),
    # … and a key in the middle of the demo ends it ($ED35 in mode 3 → $ED8F)
    'demokey': ([(1700, 1710, 'SPACE')], {}),
}


def to_hold(number, which=0):
    """Writes after which `A` in the first pass sends Jim to hold `number`:
    big door `which` of hold 1 (EODAT in the buffer, pointer `$5BD6`) gets
    the target `number` and Jim is placed in front of it (C, B − 1; also his
    remembered position +13/+14). The original then draws it itself."""
    def apply(memory):
        door = (memory[0x5BD6] | (memory[0x5BD7] << 8)) + 4 * which
        memory[door + 3] = number
        c, b = memory[door], (memory[door + 1] - 1) & 0xFF
        for at, value in ((0xF231, c), (0xF232, b), (0xF23E, c), (0xF23F, b)):
            memory[at] = value
    return apply


def on_treasure(gold_at=None):
    """Jim on the first loot of hold 1 (TDAT in the buffer, `$5BE0`): Jim's
    B = item's B + 1, C = item's C – `$E5F4` collects it in the first pass.
    With `$5BF2` = 1 this starts the gold key countdown. `gold_at` = (C, B)
    of the gold key (`$5BFD`, `$5BFE`; `$5BFC` = 1 – hold 1)."""
    def apply(memory):
        item = memory[0x5BE0] | (memory[0x5BE1] << 8)
        c, b = memory[item], (memory[item + 1] + 1) & 0xFF
        for at, value in ((0xF231, c), (0xF232, b), (0xF23E, c), (0xF23F, b)):
            memory[at] = value
        if gold_at:
            memory[0x5BFC] = 1
            memory[0x5BFD], memory[0x5BFE] = gold_at
    return apply


def chain(*fns):
    def apply(memory):
        for fn in fns:
            fn(memory)
    return apply


# ★ targeted cases that random play does not hit
SCRIPTS.update({
    # tune off (`M`, `$FFF8` = 0): cadence without notes in the interrupt
    'quietwalk': (SCRIPTS['walk'][0], {0xFFF8: 0}),
    'quiet1': (fuzz(1, 6000), {0x5BF1: 9, 0xFFF8: 0}),
    'quiet2': (fuzz(2, 6000), {0x5BF1: 9, 0xFFF8: 0}),
    # last piece of loot: the 45-second countdown until game over
    'goldtime': (GAME + [(330, 3500, '5')], {0x5BF1: 9, 0x5BF2: 1, 'apply': on_treasure(),
                                            'until': 6000}),
    # last piece of loot and the gold key a bit to the left on the same deck: new round
    'goldfound': (GAME + [(330, 900, '5')], {0x5BF1: 9, 0x5BF2: 1,
                                            'apply': on_treasure(gold_at=None)}),
    # door into the sea (target 21): drowning
    'drown': (GAME + [(312, 330, 'A')] + fuzz(7, 2000)[2:], {0x5BF1: 9, 'apply': to_hold(21)}),
    # last life and the sea: game over
    'drownover': (GAME + [(312, 330, 'A')], {0x5BF1: 0, 'apply': to_hold(21), 'until': 3000}),
})


def gold_left_of_jim(memory):
    """gold key two columns to the left of Jim, on his row (`$E041`)"""
    memory[0x5BFC] = 1
    memory[0x5BFD] = (memory[0xF231] + 2) & 0xFF
    memory[0x5BFE] = memory[0xF232]


SCRIPTS['goldfound'] = (SCRIPTS['goldfound'][0],
                        {0x5BF1: 9, 0x5BF2: 1, 'apply': chain(on_treasure(), gold_left_of_jim)})

# an extra piece of loot: there are 129 records, the counter starts at 125
# (`$DEC3`), so 4 remain after zero. Here `TREASURE` is already 0 (the
# countdown runs, 45 s, `$5BFF`/`$5BFA` as after `$E6A7`, gold key in another
# hold) and Jim stands on loot – `$E621` decrements 0 to `$FFFF` and prints
# 65535 from column 28, the fifth digit past column 31
SCRIPTS['goldextra'] = (list(GAME),
                        {0x5BF1: 9, 0x5BF2: 0, 0x5BF3: 0, 0x5BFF: 45, 0x5BFA: 20, 0x5BFB: 0,
                         0x5BFC: 2, 'apply': on_treasure(), 'until': 1500})


# ★ enemies (M5, tools/matchentities.mjs) – contacts that random play does
# not hit:
# - creature from the timer: Jim stands in a hold where the creature may come
#   to his deck (no closed numbered door on it, `$E12A`) and waits. Loot 100 →
#   timer after 850 frames, `FRAMES` 800 → first attempt right away
#   (11: deck B = 8, whole – rat too; 13, 14, 17: B = 18, parrot only)
for _n, _door in ((11, 2), (13, 0), (14, 0), (17, 0)):
    SCRIPTS['creature%02d' % _n] = (GAME + [(312, 330, 'A')],
                                    {0x5BF1: 9, 0x5BF4: 100, 0x5C78: 0x20, 0x5C79: 0x03,
                                     'apply': to_hold(_n, _door), 'until': 20000})
# other seeds of the generator `$F343` (rat / parrot, side and deck are
# drawn at random): in hold 11 – the only one where Jim stands on a whole
# deck and the rat can reach him – and in 14
for _n, _door, _seeds in ((11, 2, (0x1234, 0x5A5A, 0xBEEF, 0x7777, 0xC0DE)),
                          (14, 0, (0x1234, 0x5A5A))):
    for _seed in _seeds:
        SCRIPTS['creature%02d_%04x' % (_n, _seed)] = (
            GAME + [(312, 330, 'A')],
            {0x5BF1: 9, 0x5BF4: 100, 0x5C78: 0x20, 0x5C79: 0x03, 0xF343: _seed & 0xFF,
             0xF344: _seed >> 8, 'apply': to_hold(_n, _door), 'until': 20000})


def on_ladder(memory):
    """Jim in hold 1 at the bottom of the ladder (16, 8): C = 16, B = 6 – up
    to deck B = 8, along which a pirate walks (10, 11). He walks between the
    numbered doors C = 12 and C = 24, the ladder is between them: door C = 12
    (number at B = 13) is opened with the flag `SDDAT` +5 ← 0 as in `$EB8D`
    (it stays drawn), and the pirate then walks 4–23, across the ladder"""
    for at, value in ((0xF231, 16), (0xF232, 6), (0xF23E, 16), (0xF23F, 6)):
        memory[at] = value
    record = memory[0x5BDA] | (memory[0x5BDB] << 8)
    while memory[record] != 0xFF:
        if memory[record] == 12 and memory[record + 1] == 13:
            memory[record + 5] = 0
        record += 6


# - pirate: Jim climbs the ladder up and down below the deck with the pirate –
#   a contact from below (Jim under the pirate), which walking the deck does
#   not give. One death per recording (then Jim is at the top in hold 1),
#   hence several phases and periods
for _k, (_delay, _up, _down) in enumerate(((0, 40, 40), (37, 30, 20), (74, 24, 24), (111, 50, 30),
                                          (20, 36, 16), (90, 28, 28), (150, 44, 22), (200, 32, 32))):
    _keys, _frame = [], 330 + _delay
    while _frame < 6000:
        _keys += [(_frame, _frame + _up, '7'), (_frame + _up, _frame + _up + _down, '6')]
        _frame += _up + _down
    SCRIPTS['ladder%d' % (_k + 1)] = (GAME + _keys, {0x5BF1: 9, 'apply': on_ladder})


# into every hold 2–20 and then at random, with lives set; three series
# with other seeds and weights (b, c: longer, more ladders and doors)
for _n in range(2, 21):
    for _suffix, _seed, _frames, _weights in (('', 100, 5000, (3, 3, 3, 3, 1, 1)),
                                              ('b', 200, 9000, (2, 2, 4, 4, 1, 1)),
                                              ('c', 300, 9000, (4, 4, 2, 2, 2, 1))):
        SCRIPTS['hold%02d%s' % (_n, _suffix)] = (
            GAME + [(312, 330, 'A')] + [(f, t, k) for f, t, k
                                        in fuzz(_seed + _n, _frames, _weights) if f >= 330],
            {0x5BF1: 9, 'apply': to_hold(_n)})
    # quiet (tune off) – for the cadence model (tools/fitcadence.mjs)
    SCRIPTS['quiet%02d' % _n] = (
        GAME + [(312, 330, 'A')] + [(f, t, k) for f, t, k
                                    in fuzz(400 + _n, 5000, (3, 3, 3, 3, 1, 1)) if f >= 330],
        {0x5BF1: 9, 0xFFF8: 0, 'apply': to_hold(_n)})


def stub_code():
    """Three logging subroutines, each preserves registers and flags."""
    k = [0xCD, 0x8E, 0x02,             # CALL $028E (KEY-SCAN)
         0xF5, 0xE5,                   # PUSH AF / PUSH HL
         0x2A, LOG_PTR & 0xFF, LOG_PTR >> 8,   # LD HL,(ptr)
         0x36, ord('K'), 0x23,         # LD (HL),'K' / INC HL
         0x73, 0x23,                   # LD (HL),E / INC HL
         0x22, LOG_PTR & 0xFF, LOG_PTR >> 8,   # LD (ptr),HL
         0xE1, 0xF1, 0xC9]             # POP HL / POP AF / RET
    # $DF92 LD A,($5C79): the end of a demo pass reads FRAMES
    d = [0xD5, 0xE5,                   # PUSH DE / PUSH HL
         0xED, 0x5B, 0x78, 0x5C,       # LD DE,($5C78)
         0x2A, LOG_PTR & 0xFF, LOG_PTR >> 8,   # LD HL,(ptr)
         0x36, ord('F'), 0x23,         # LD (HL),'F' / INC HL
         0x73, 0x23, 0x72, 0x23,       # LD (HL),E / INC HL / LD (HL),D / INC HL
         0x22, LOG_PTR & 0xFF, LOG_PTR >> 8,   # LD (ptr),HL
         0x7A,                         # LD A,D – A = ($5C79), like the original
         0xE1, 0xD1, 0xC9]             # POP HL / POP DE / RET
    f = [0xF5, 0xD5,                   # PUSH AF / PUSH DE
         0xED, 0x5B, 0x78, 0x5C,       # LD DE,($5C78)
         0x2A, LOG_PTR & 0xFF, LOG_PTR >> 8,   # LD HL,(ptr)
         0x36, ord('F'), 0x23,         # LD (HL),'F' / INC HL
         0x73, 0x23, 0x72, 0x23,       # LD (HL),E / INC HL / LD (HL),D / INC HL
         0x22, LOG_PTR & 0xFF, LOG_PTR >> 8,   # LD (ptr),HL
         0xEB,                         # EX DE,HL – HL = FRAMES, like the original
         0xD1, 0xF1, 0xC9]             # POP DE / POP AF / RET
    return k, f, d


def patch(memory):
    k, f, d = stub_code()
    memory[STUBS:STUBS + len(k)] = k
    memory[STUBS + 0x20:STUBS + 0x20 + len(f)] = f
    memory[STUBS + 0xC0:STUBS + 0xC0 + len(d)] = d
    for address, expect, target in ((0xED35, [0xCD, 0x8E, 0x02], STUBS),
                                    (0xE133, [0x2A, 0x78, 0x5C], STUBS + 0x20),
                                    (0xE11F, [0x2A, 0x78, 0x5C], STUBS + 0x20),
                                    (0xDF92, [0x3A, 0x79, 0x5C], STUBS + 0xC0)):
        if list(memory[address:address + 3]) != expect:
            raise SystemExit('$%04X does not hold what is expected' % address)
        memory[address:address + 3] = [0xCD, target & 0xFF, target >> 8]
    # game over: the return to the menu is redirected to JR $, so the memory
    # stays as the game left it after the end
    memory[GAME_OVER:GAME_OVER + 3] = [0xC3, PARK & 0xFF, PARK >> 8]
    # … and likewise the end of the demo ($D60B JP $CD86 → title)
    if list(memory[DEMO_OVER:DEMO_OVER + 3]) != [0xC3, 0x86, 0xCD]:
        raise SystemExit('no JP $CD86 at $%04X' % DEMO_OVER)
    memory[DEMO_OVER:DEMO_OVER + 3] = [0xC3, PARK & 0xFF, PARK >> 8]
    memory[PARK:PARK + 7] = [0x3E, 0x01, 0x32, PARKED & 0xFF, PARKED >> 8,   # LD A,1 / LD (PARKED),A
                             0x18, 0xFE]                                     # JR $
    memory[PARKED] = 0
    memory[LOG_PTR] = LOG & 0xFF
    memory[LOG_PTR + 1] = LOG >> 8


def read_log(memory):
    end = memory[LOG_PTR] | (memory[LOG_PTR + 1] << 8)
    out, a = [], LOG
    while a < end:
        tag = chr(memory[a])
        if tag == 'K':
            out.append(['K', memory[a + 1]])
            a += 2
        elif tag == 'F':
            out.append(['F', memory[a + 1] | (memory[a + 2] << 8)])
            a += 3
        else:
            raise SystemExit('broken input log at $%04X' % a)
    memory[LOG_PTR] = LOG & 0xFF
    memory[LOG_PTR + 1] = LOG >> 8
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--script', default='all', choices=sorted(SCRIPTS) + ['all'])
    ap.add_argument('--out', default=os.path.join(B.ROOT, 'build', 'trace'))
    args = ap.parse_args()
    for name in (sorted(SCRIPTS) if args.script == 'all' else [args.script]):
        trace(name, args.out)


def trace(name, out_base):
    class args:
        script = name
        out = out_base
    script, pokes = SCRIPTS[args.script]
    last_frame = max(max((end for start, end, key in script), default=0) + 20, pokes.get('until', 0))
    out = os.path.join(args.out, args.script)
    os.makedirs(out, exist_ok=True)

    snapshot = Snapshot.get(os.path.join(B.ROOT, 'build', 'booty.z80'))
    sim = from_snapshot(CSimulator or Simulator, snapshot, {}, {'ay': [None] * 16},
                        {'fast_djnz': False, 'fast_ldir': False}, None)
    patch(sim.memory)
    tracer = Tracer(sim, snapshot.border, snapshot.out7ffd, snapshot.outfffd,
                    list(snapshot.ay), snapshot.outfe, True)
    sim.set_tracer(tracer)
    state = {'frame': 0}

    def draw(scr, frame, border, keyboard):
        state['frame'] = frame
        for i in range(8):
            keyboard[i] = 0
        for start, end, key in script:
            if start <= frame < end:
                row, bit = KEYS[key]
                keyboard[ROWS[row]] |= 1 << bit
        return frame < last_frame

    def run_to(address):
        pc = sim.registers[24]
        if pc == address:
            # one instruction away first, or run() would stop on the spot
            tracer.run(pc, pc + 2, 0, 0, True, draw, None, None, None, '$', '04X', '04X')
            pc = sim.registers[24]
        tracer.run(pc, address, 0, 0, True, draw, None, None, None, '$', '04X', '04X')
        return sim.registers[24] == address

    # memory at the moment the menu starts the game: tools/mkmemory.py
    # assembles the initial memory from it
    if not run_to(NEW_GAME):
        raise SystemExit('the game did not reach $%04X' % NEW_GAME)
    open(os.path.join(out, 'start.bin'), 'wb').write(bytes(sim.memory[:0x10000]))
    if not run_to(PASS):
        raise SystemExit('the game did not reach $%04X' % PASS)
    read_log(sim.memory)
    for address, value in pokes.items():
        if address == 'apply':
            value(sim.memory)
        elif address == 'until':
            continue
        else:
            sim.memory[address] = value
    open(os.path.join(out, 'init.bin'), 'wb').write(bytes(sim.memory[:0x10000]))
    first_frame = state['frame']
    first_t = sim.registers[25]

    passes, inputs, frames, outcomes, tstates = bytearray(), [], [], [], []
    while True:
        reached = run_to(PASS)
        if not reached and not sim.memory[PARKED]:
            break
        inputs.append(read_log(sim.memory))
        frames.append(state['frame'])
        tstates.append(sim.registers[25])
        outcomes.append('pass' if reached else 'gameover')
        for lo, hi, name in REGIONS:
            passes += bytes(sim.memory[lo:hi])
        if not reached:
            break
    # ★ stored as an XOR difference against the previous pass and gzipped: the
    # memory changes little between passes, so it takes a fraction of the space
    size = sum(hi - lo for lo, hi, name in REGIONS)
    delta = bytes(passes[:size])
    if len(passes) > size:
        tail = (int.from_bytes(passes[size:], 'big') ^ int.from_bytes(passes[:-size], 'big'))
        delta += tail.to_bytes(len(passes) - size, 'big')
    with gzip.open(os.path.join(out, 'passes.xor.gz'), 'wb', compresslevel=6) as f:
        f.write(bytes(delta))
    stale = os.path.join(out, 'passes.bin')
    if os.path.exists(stale):
        os.remove(stale)
    with open(os.path.join(out, 'inputs.json'), 'w') as f:
        json.dump({'script': args.script, 'firstFrame': first_frame, 'frames': frames,
                   'inputs': inputs, 'outcomes': outcomes, 'firstT': first_t,
                   'tstates': tstates}, f)
    with open(os.path.join(out, 'regions.json'), 'w') as f:
        json.dump([[lo, hi, name] for lo, hi, name in REGIONS], f, ensure_ascii=False)
    print('%s: %d passes from frame %d to %d' % (out, len(inputs), first_frame, frames[-1] if frames else 0))


if __name__ == '__main__':
    main()
