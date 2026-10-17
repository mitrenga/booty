#!/usr/bin/env python3
"""Záznam průchodů hlavní smyčkou originálu pro `tools/matchphysics.mjs`.

    ./tools/tracephysics.py [--script NAME] [--list]

Hra se spustí v simulátoru jako v `playtrace.py` (titulka → `SPACE` →
menu → `0`) a hraje se podle skriptu kláves (`SCRIPTS` níž, po snímcích).
Na začátku **každého průchodu hlavní smyčkou** (`$DF13`) se uloží:

- **paměť** v oblastech `REGIONS` – obrazovka, proměnné hry, systémové
  proměnné tisku, buffery (mapa znaků, buffer spritu), pracovní oblast
  podpalubí, objekty a proměnné od `$F231`. Na první zastávce se navíc
  uloží celých 64 KB (`init.bin`) – z toho remake začíná
- **vstupy průchodu** – to, co do průchodu přijde zvenku a z paměti se
  dopočítat nedá:
  - `K` = co vrátil ROM `KEY-SCAN` (registr E) v `$ED35`; jaká klávesa je
    v té chvíli dole, záleží na tom, kdy přesně se klávesnice čte
  - `F` = hodnota `FRAMES` (`$5C78`), kterou přečetl časovač `$E12A`
    (`$E133`, `$E11F`); `FRAMES` zvyšuje přerušení, ne hra

★ **Jak se vstupy chytají.** V simulátoru se na tři místa kódu vloží
odbočka do krátkého podprogramu v nepoužité RAM (`$6400`): `CALL $028E`
na `$ED35` a `LD HL,($5C78)` na `$E133` a `$E11F` se nahradí `CALL` na
podprogram, který udělá totéž (i příznaky zůstanou, na `$E136` je
`SBC HL,DE` s přenosem) a výsledek zapíše do záznamu. Průchod se tím
prodlouží o několik desítek T-stavů – přerušení tedy padnou o kousek jinak
než v nedotčeném originálu – ale záznam je **jeden konzistentní běh**
originálu a remake dostane přesně ty vstupy, které ten běh dostal.

Výstup do `build/trace/<skript>/`: `start.bin` (celá paměť ve chvíli, kdy
menu spouští hru, `$DEA8`), `init.bin`, `passes.xor.gz` (oblasti po
každém průchodu za sebou, každý průchod jako XOR s předchozím, gzip),
`inputs.json` (i `outcomes`: `gameover` u průchodu, po kterém hra skončila,
a `tstates`: čítač T-stavů simulátoru na konci každého průchodu – délka
průchodu i s přerušeními),
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

PASS = 0xDF13            # ★ začátek průchodu hlavní smyčkou
NEW_GAME = 0xDEA8        # ★ nová hra (CALL z menu, $D09E)
GAME_OVER = 0xD0A1       # ★ kam se vrací CALL $DEA8 (menu), když hra skončí
DEMO_OVER = 0xD60B       # ★ kam se vrací CALL $DEA8 ukázky ($D602), když skončí
PARK = 0x6440            # tam se běh po konci hry zaparkuje: značka a JR $
PARKED = 0x643F          # značka zaparkování (přerušení běží dál, PC nestačí)
STUBS = 0x6400           # podprogramy záznamu (RAM pod RAMTOP, hra ji nepoužívá)
LOG = 0x6500             # záznam vstupů jednoho průchodu
LOG_PTR = 0x64FE

# (od, do, jméno) – oblasti, které se po každém průchodu porovnávají
REGIONS = [
    (0x4000, 0x5B00, 'obrazovka'),
    (0x5BCC, 0x5C00, 'proměnné hry $5BCC'),
    (0x5C36, 0x5C38, 'CHARS'),
    (0x5C84, 0x5C92, 'tisk ROM (DF-CC … P-FLAG)'),
    (0xA06C, 0xA804, 'buffery (sprite, mapa znaků a atributů)'),
    # ukazatele, buffer podpalubí $BAD7 a pracovní kopie všech 21 podpalubí
    # od $BCCB (3786 B, podpalubí 1 je na konci)
    (0xBAA0, 0xCB96, 'pracovní oblast podpalubí'),
    (0xE46F, 0xE47A, 'výbuch'),
    (0xE820, 0xE821, 'plošina pod Jimem'),
    (0xF231, 0xF346, 'objekty a proměnné $F231'),
]

GAME = [(200, 210, 'SPACE'), (300, 310, '0')]
# ★ výchozí klávesy originálu: 5 vlevo, 8 vpravo, 7 nahoru, 6 dolů, A dveře
KEYSET = ['5', '8', '7', '6', 'A', None]


def fuzz(seed, frames, weights=(3, 3, 2, 2, 2, 1)):
    """Náhodné hraní se semínkem: klávesa (nebo nic) držená 4–60 snímků."""
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


# jméno: (skript kláves, zápisy do paměti před prvním průchodem)
# ★ Zápisy mění výchozí stav **originálu** v simulátoru – remake začíná
# z téže paměti (init.bin), takže se porovnává pořád jeden a týž běh:
# `$5BF1` životy (víc životů = delší hra), `$5BF2` zbývající kořist (1 →
# první sebraná spustí odpočet zlatého klíče), `$5BF4` sebraná kořist
# (≥ 100 → časovač tvorů po 850 snímcích).
SCRIPTS = {
    # chůze po palubě sem a tam, k okraji, nahoru a dolů po žebříku
    'walk': (GAME + [(330, 420, '8'), (430, 560, '5'), (570, 620, '8'),
                     (630, 700, '7'), (710, 760, '6'), (770, 900, '5'),
                     (910, 1000, '8'), (1010, 1100, '7'), (1110, 1300, '5')], {}),
    'fuzz1': (fuzz(1, 6000), {0x5BF1: 9}),
    'fuzz2': (fuzz(2, 6000), {0x5BF1: 9}),
    'fuzz3': (fuzz(3, 6000, (2, 2, 3, 3, 4, 1)), {0x5BF1: 9}),
    'fuzz4': (fuzz(4, 6000, (2, 2, 3, 3, 4, 1)), {0x5BF1: 9, 0x5BF4: 100}),
    # zlatý klíč: zbývá jeden kus kořisti
    'gold': (fuzz(5, 6000, (3, 3, 2, 2, 1, 1)), {0x5BF1: 9, 0x5BF2: 1}),
    # bez přidaných životů až do konce hry
    'gameover': (fuzz(6, 9000, (3, 3, 2, 2, 3, 1)), {}),
    # nedotčená hra až do konce: všechny čtyři smrti (M4, matchrules.mjs
    # ji pouští workerem od nové hry)
    'lastlife': (fuzz(6, 60000, (3, 3, 2, 2, 3, 1)), {}),
    # ★ ukázka: bez kláves ji titulka po 1024 přerušeních spustí sama
    # ($D602, `$5BF0` = 3) – podpalubí 1, po 768 přerušeních losované,
    # po dalších 768 konec ($ED8F) a zpátky na titulku
    'demo': ([], {'until': 5000}),
    # … a klávesa uprostřed ukázky ji ukončí ($ED35 v režimu 3 → $ED8F)
    'demokey': ([(1700, 1710, 'SPACE')], {}),
}


def to_hold(number, which=0):
    """Zápisy, po kterých `A` v prvním průchodu pošle Jima do podpalubí
    `number`: velké dveře `which` podpalubí 1 (EODAT v bufferu, ukazatel
    `$5BD6`) dostanou cíl `number` a Jim se postaví před ně (C, B − 1;
    i jeho zapamatovaná poloha +13/+14). Kreslí pak originál sám."""
    def apply(memory):
        door = (memory[0x5BD6] | (memory[0x5BD7] << 8)) + 4 * which
        memory[door + 3] = number
        c, b = memory[door], (memory[door + 1] - 1) & 0xFF
        for at, value in ((0xF231, c), (0xF232, b), (0xF23E, c), (0xF23F, b)):
            memory[at] = value
    return apply


def on_treasure(gold_at=None):
    """Jim na první kořisti podpalubí 1 (TDAT v bufferu, `$5BE0`): Jimovo
    B = B předmětu + 1, C = C předmětu – `$E5F4` ji v prvním průchodu
    sebere. S `$5BF2` = 1 tím začne odpočet zlatého klíče. `gold_at` =
    (C, B) zlatého klíče (`$5BFD`, `$5BFE`; `$5BFC` = 1 – podpalubí 1)."""
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


# ★ cílené případy, na které náhodné hraní nenarazí
SCRIPTS.update({
    # melodie vypnutá (`M`, `$FFF8` = 0): tempo bez not v přerušení
    'quietwalk': (SCRIPTS['walk'][0], {0xFFF8: 0}),
    'quiet1': (fuzz(1, 6000), {0x5BF1: 9, 0xFFF8: 0}),
    'quiet2': (fuzz(2, 6000), {0x5BF1: 9, 0xFFF8: 0}),
    # poslední kus kořisti: odpočet 45 sekund až do konce hry
    'goldtime': (GAME + [(330, 3500, '5')], {0x5BF1: 9, 0x5BF2: 1, 'apply': on_treasure(),
                                            'until': 6000}),
    # poslední kus kořisti a zlatý klíč o kus vlevo na téže palubě: nové kolo
    'goldfound': (GAME + [(330, 900, '5')], {0x5BF1: 9, 0x5BF2: 1,
                                            'apply': on_treasure(gold_at=None)}),
    # dveře do moře (cíl 21): utonutí
    'drown': (GAME + [(312, 330, 'A')] + fuzz(7, 2000)[2:], {0x5BF1: 9, 'apply': to_hold(21)}),
    # poslední život a moře: konec hry
    'drownover': (GAME + [(312, 330, 'A')], {0x5BF1: 0, 'apply': to_hold(21), 'until': 3000}),
})


def gold_left_of_jim(memory):
    """zlatý klíč o dva sloupce vlevo od Jima, na jeho řádku (`$E041`)"""
    memory[0x5BFC] = 1
    memory[0x5BFD] = (memory[0xF231] + 2) & 0xFF
    memory[0x5BFE] = memory[0xF232]


SCRIPTS['goldfound'] = (SCRIPTS['goldfound'][0],
                        {0x5BF1: 9, 0x5BF2: 1, 'apply': chain(on_treasure(), gold_left_of_jim)})

# kus kořisti navíc: záznamů je 129, počítadlo začíná na 125 (`$DEC3`),
# takže po nule zbudou 4. Tady je `TREASURE` už 0 (odpočet běží, 45 s,
# `$5BFF`/`$5BFA` jako po `$E6A7`, zlatý klíč v jiném podpalubí) a Jim
# stojí na kořisti – `$E621` sníží 0 na `$FFFF` a vytiskne 65535 od
# sloupce 28, pátá číslice za sloupec 31
SCRIPTS['goldextra'] = (list(GAME),
                        {0x5BF1: 9, 0x5BF2: 0, 0x5BF3: 0, 0x5BFF: 45, 0x5BFA: 20, 0x5BFB: 0,
                         0x5BFC: 2, 'apply': on_treasure(), 'until': 1500})


# ★ nepřátelé (M5, tools/matchentities.mjs) – dotyky, na které náhodné
# hraní nenarazí:
# - tvor z časovače: Jim stojí v podpalubí, kde tvor smí na jeho palubu
#   (žádné zavřené číslované dveře na ní, `$E12A`), a čeká. Kořist 100 →
#   časovač po 850 snímcích, `FRAMES` 800 → první pokus hned
#   (11: paluba B = 8, celá – i krysa; 13, 14, 17: B = 18, jen papoušek)
for _n, _door in ((11, 2), (13, 0), (14, 0), (17, 0)):
    SCRIPTS['creature%02d' % _n] = (GAME + [(312, 330, 'A')],
                                    {0x5BF1: 9, 0x5BF4: 100, 0x5C78: 0x20, 0x5C79: 0x03,
                                     'apply': to_hold(_n, _door), 'until': 20000})
# jiná semínka generátoru `$F343` (krysa / papoušek, strana a paluba se
# losují): v podpalubí 11 – jediné, kde Jim stojí na celé palubě a krysa
# k němu může – a ve 14
for _n, _door, _seeds in ((11, 2, (0x1234, 0x5A5A, 0xBEEF, 0x7777, 0xC0DE)),
                          (14, 0, (0x1234, 0x5A5A))):
    for _seed in _seeds:
        SCRIPTS['creature%02d_%04x' % (_n, _seed)] = (
            GAME + [(312, 330, 'A')],
            {0x5BF1: 9, 0x5BF4: 100, 0x5C78: 0x20, 0x5C79: 0x03, 0xF343: _seed & 0xFF,
             0xF344: _seed >> 8, 'apply': to_hold(_n, _door), 'until': 20000})


def on_ladder(memory):
    """Jim v podpalubí 1 dole u žebříku (16, 8): C = 16, B = 6 – nahoru
    k palubě B = 8, po které chodí pirát (10, 11). Ten chodí mezi
    číslovanými dveřmi C = 12 a C = 24, žebřík je mezi nimi: dveře C = 12
    (číslo na B = 13) se otevřou příznakem `SDDAT` +5 ← 0 jako v `$EB8D`
    (zůstanou nakreslené), a pirát pak chodí 4–23, přes žebřík"""
    for at, value in ((0xF231, 16), (0xF232, 6), (0xF23E, 16), (0xF23F, 6)):
        memory[at] = value
    record = memory[0x5BDA] | (memory[0x5BDB] << 8)
    while memory[record] != 0xFF:
        if memory[record] == 12 and memory[record + 1] == 13:
            memory[record + 5] = 0
        record += 6


# - pirát: Jim leze po žebříku nahoru a dolů pod palubou s pirátem – dotyk
#   zespodu (Jim pod pirátem), který chůze po palubě nedá. Jedna smrt na
#   záznam (pak je Jim nahoře v podpalubí 1), proto víc fází a period
for _k, (_delay, _up, _down) in enumerate(((0, 40, 40), (37, 30, 20), (74, 24, 24), (111, 50, 30),
                                          (20, 36, 16), (90, 28, 28), (150, 44, 22), (200, 32, 32))):
    _keys, _frame = [], 330 + _delay
    while _frame < 6000:
        _keys += [(_frame, _frame + _up, '7'), (_frame + _up, _frame + _up + _down, '6')]
        _frame += _up + _down
    SCRIPTS['ladder%d' % (_k + 1)] = (GAME + _keys, {0x5BF1: 9, 'apply': on_ladder})


# do každého podpalubí 2–20 a pak náhodně, s nastavenými životy; tři série
# s jinými semínky a váhami (b, c: delší, víc žebříků a dveří)
for _n in range(2, 21):
    for _suffix, _seed, _frames, _weights in (('', 100, 5000, (3, 3, 3, 3, 1, 1)),
                                              ('b', 200, 9000, (2, 2, 4, 4, 1, 1)),
                                              ('c', 300, 9000, (4, 4, 2, 2, 2, 1))):
        SCRIPTS['hold%02d%s' % (_n, _suffix)] = (
            GAME + [(312, 330, 'A')] + [(f, t, k) for f, t, k
                                        in fuzz(_seed + _n, _frames, _weights) if f >= 330],
            {0x5BF1: 9, 'apply': to_hold(_n)})
    # tiché (melodie vypnutá) – pro model tempa (tools/fitcadence.mjs)
    SCRIPTS['quiet%02d' % _n] = (
        GAME + [(312, 330, 'A')] + [(f, t, k) for f, t, k
                                    in fuzz(400 + _n, 5000, (3, 3, 3, 3, 1, 1)) if f >= 330],
        {0x5BF1: 9, 0xFFF8: 0, 'apply': to_hold(_n)})


def stub_code():
    """Tři podprogramy záznamu, každý zachová registry i příznaky."""
    k = [0xCD, 0x8E, 0x02,             # CALL $028E (KEY-SCAN)
         0xF5, 0xE5,                   # PUSH AF / PUSH HL
         0x2A, LOG_PTR & 0xFF, LOG_PTR >> 8,   # LD HL,(ptr)
         0x36, ord('K'), 0x23,         # LD (HL),'K' / INC HL
         0x73, 0x23,                   # LD (HL),E / INC HL
         0x22, LOG_PTR & 0xFF, LOG_PTR >> 8,   # LD (ptr),HL
         0xE1, 0xF1, 0xC9]             # POP HL / POP AF / RET
    # $DF92 LD A,($5C79): konec průchodu ukázky čte FRAMES
    d = [0xD5, 0xE5,                   # PUSH DE / PUSH HL
         0xED, 0x5B, 0x78, 0x5C,       # LD DE,($5C78)
         0x2A, LOG_PTR & 0xFF, LOG_PTR >> 8,   # LD HL,(ptr)
         0x36, ord('F'), 0x23,         # LD (HL),'F' / INC HL
         0x73, 0x23, 0x72, 0x23,       # LD (HL),E / INC HL / LD (HL),D / INC HL
         0x22, LOG_PTR & 0xFF, LOG_PTR >> 8,   # LD (ptr),HL
         0x7A,                         # LD A,D – A = ($5C79), jako originál
         0xE1, 0xD1, 0xC9]             # POP HL / POP DE / RET
    f = [0xF5, 0xD5,                   # PUSH AF / PUSH DE
         0xED, 0x5B, 0x78, 0x5C,       # LD DE,($5C78)
         0x2A, LOG_PTR & 0xFF, LOG_PTR >> 8,   # LD HL,(ptr)
         0x36, ord('F'), 0x23,         # LD (HL),'F' / INC HL
         0x73, 0x23, 0x72, 0x23,       # LD (HL),E / INC HL / LD (HL),D / INC HL
         0x22, LOG_PTR & 0xFF, LOG_PTR >> 8,   # LD (ptr),HL
         0xEB,                         # EX DE,HL – HL = FRAMES, jako originál
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
            raise SystemExit('na $%04X není, co čekám' % address)
        memory[address:address + 3] = [0xCD, target & 0xFF, target >> 8]
    # konec hry: návrat do menu se přesměruje na JR $, ať paměť zůstane, jak
    # ji hra po konci nechala
    memory[GAME_OVER:GAME_OVER + 3] = [0xC3, PARK & 0xFF, PARK >> 8]
    # … a stejně konec ukázky ($D60B JP $CD86 → titulka)
    if list(memory[DEMO_OVER:DEMO_OVER + 3]) != [0xC3, 0x86, 0xCD]:
        raise SystemExit('na $%04X není JP $CD86' % DEMO_OVER)
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
            raise SystemExit('rozbitý záznam vstupů na $%04X' % a)
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

    # paměť ve chvíli, kdy menu spouští hru: z ní skládá výchozí paměť
    # tools/mkmemory.py
    if not run_to(NEW_GAME):
        raise SystemExit('hra na $%04X nedošla' % NEW_GAME)
    open(os.path.join(out, 'start.bin'), 'wb').write(bytes(sim.memory[:0x10000]))
    if not run_to(PASS):
        raise SystemExit('hra na $%04X nedošla' % PASS)
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
    # ★ uloženo jako rozdíl XOR proti předchozímu průchodu a gzip: paměť se
    # mezi průchody mění málo, takže to zabere zlomek místa
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
    print('%s: %d průchodů od snímku %d do %d' % (out, len(inputs), first_frame, frames[-1] if frames else 0))


if __name__ == '__main__':
    main()
