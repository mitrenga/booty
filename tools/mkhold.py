#!/usr/bin/env python3
"""Reference z běžícího originálu: herní obrazovka a menu.

    ./tools/mkhold.py

Hra se spustí v simulátoru jako v `playtrace.py`: z titulky se klávesou
přejde do menu, `0` spustí hru a v pravidelných rozestupech se ukládá celý
obraz videopaměti. Výstupem jsou **referenční snímky**, proti kterým
`tools/matchscreen.mjs` měří, co remake složí z dat:

- `build/ref/screen.scr` – **herní obrazovka** na začátku hry: hrací
  plocha (★ řádky 0–22) **většinovým hlasem** přes 431 snímků, takže co se
  hýbe (piráti), z hlasování vypadne; panel (★ řádek 23) z jednoho snímku,
  aby to byla čísla, která na obrazovce opravdu stála naráz. ★ Jim stojí
  (nestiskne se nic), takže zůstane. Vzorkuje se před první časovou
  událostí hry (`$E12A` po 1400 snímcích `FRAMES`, `disasm_notes.md` §4)
- `build/ref/menu.scr` – **menu originálu** (snímek 298); nástroj ověří,
  že se jeho hlavička (řádky 0–7) za snímky 230–298 nezmění

★ Většinový hlas o formátu podpalubí nic nepředpokládá – proto je to dobrá
nezávislá reference pro složení z dat (`data/global.json#holds`, `global.json#panel`,
`global.json#sprites`, `global.json#global`, `global.json#texts`). V M1 se z něj brala i fotka
pro prohlížeč; od M2 už ne.
"""
import argparse, base64, json, os, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
RETRO = B.RETRO
sys.path.insert(0, B.SKOOLKIT)
sys.path.insert(0, RETRO)

from scr2png import scr_to_rgb, write_png                        # noqa: E402
from playtrace import KEYS, ROWS                                 # noqa: E402
from skoolkit.snapshot import Snapshot                           # noqa: E402
from skoolkit.simulator import Simulator                         # noqa: E402
from skoolkit.simutils import from_snapshot                      # noqa: E402
from skoolkit.trace import Tracer                                # noqa: E402
try:
    from skoolkit.csimulator import CSimulator
except ImportError:                                              # pragma: no cover
    CSimulator = None

# ★ Titulka → libovolná klávesa → menu (`1 - KEYBOARD` … `0 - START GAME`,
# změřeno playtrace.py, snímek 290) → `0`. Hra je na obrazovce od snímku
# ≈ 315, panel celý od ≈ 330 (build/m1probe).
SCRIPT = [(200, 210, 'SPACE'),  # z titulky do menu
          (300, 310, '0')]      # 0 - START GAME
SAMPLE_FROM, SAMPLE_TO, SAMPLE_STEP = 360, 1650, 3
PANEL_FRAME = 1000              # ze kterého snímku se bere panel
MENU_FROM, MENU_TO = 230, 298   # menu originálu je na obrazovce (build/m1probe)
MENU_ROWS = 8                   # ★ hlavička menu: řádky 0–7

PANEL_ROW = 23                  # ★ panel je znakový řádek 23
ROWS_ALL = 24
COLS = 32


def screen_offset(y):
    """Offset pixelového řádku y (0–191) v 6912B obrazu."""
    third, char_row, pix = y >> 6, (y >> 3) & 7, y & 7
    return (third << 11) | (pix << 8) | (char_row << 5)


def split(scr):
    """(hrací plocha, panel) jako dvojice (bitmapa po řádcích, atributy)."""
    play_b, panel_b = bytearray(), bytearray()
    for y in range(192):
        line = scr[screen_offset(y):screen_offset(y) + COLS]
        (panel_b if y >> 3 == PANEL_ROW else play_b).extend(line)
    attrs = scr[6144:6912]
    return ((bytes(play_b), bytes(attrs[:PANEL_ROW * COLS])),
            (bytes(panel_b), bytes(attrs[PANEL_ROW * COLS:])))


def menu_head(scr):
    """Řádky 0–7 menu originálu: (bitmapa po pixelových řádcích, atributy)."""
    bitmap = bytearray()
    for y in range(MENU_ROWS * 8):
        bitmap += scr[screen_offset(y):screen_offset(y) + COLS]
    return bytes(bitmap), bytes(scr[6144:6144 + MENU_ROWS * COLS])


def majority(samples):
    """Po bajtech nejčastější hodnota – co se nehýbe, to vyhraje."""
    out = bytearray(len(samples[0]))
    for i in range(len(out)):
        out[i] = Counter(s[i] for s in samples).most_common(1)[0][0]
    return bytes(out)


def to_scr(play, panel):
    """Zpátky do 6912B obrazu – kvůli náhledu a referenci."""
    (pb, pa), (nb, na) = play, panel
    scr = bytearray(6912)
    for y in range(192):
        row = y >> 3
        if row == PANEL_ROW:
            src, i = nb, (y - PANEL_ROW * 8) * COLS
        else:
            src, i = pb, y * COLS
        scr[screen_offset(y):screen_offset(y) + COLS] = src[i:i + COLS]
    scr[6144:6144 + PANEL_ROW * COLS] = pa
    scr[6144 + PANEL_ROW * COLS:6912] = na
    return bytes(scr)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('snapshot', nargs='?',
                    default=os.path.join(B.ROOT, 'build', 'booty.z80'))
    ap.add_argument('--png', default=os.path.join(B.ROOT, 'build', 'screen.png'))
    ap.add_argument('--ref', default=os.path.join(B.ROOT, 'build', 'ref'),
                    help='kam uložit referenční snímek pro tools/matchscreen.mjs')
    args = ap.parse_args()

    snapshot = Snapshot.get(args.snapshot)
    if snapshot is None:
        raise SystemExit('nelze nacist snapshot %s – spust ./tools/mksnapshot.sh'
                         % args.snapshot)
    cls = CSimulator or Simulator
    simulator = from_snapshot(cls, snapshot, {}, {'ay': [None] * 16},
                              {'fast_djnz': False, 'fast_ldir': False}, None)
    tracer = Tracer(simulator, snapshot.border, snapshot.out7ffd, snapshot.outfffd,
                    list(snapshot.ay), snapshot.outfe, True)
    simulator.set_tracer(tracer)

    samples, panel_scr, menus = [], {}, []

    def draw(scr, frame, border, keyboard):
        for i in range(8):
            keyboard[i] = 0
        for start, end, key in SCRIPT:
            if start <= frame < end:
                row, bit = KEYS[key]
                keyboard[ROWS[row]] |= 1 << bit
        if SAMPLE_FROM <= frame <= SAMPLE_TO and (frame - SAMPLE_FROM) % SAMPLE_STEP == 0:
            samples.append(bytes(scr))
        if frame == PANEL_FRAME:
            panel_scr[frame] = bytes(scr)
        if MENU_FROM <= frame <= MENU_TO:
            menus.append(bytes(scr))
        return frame < SAMPLE_TO + 10

    tracer.run(snapshot.pc, -1, 0, 0, True, draw, None, None, None, '$', '04X', '04X')
    if len(samples) < 20:
        raise SystemExit('malo vzorku (%d) – zkontroluj SCRIPT' % len(samples))
    if PANEL_FRAME not in panel_scr:
        raise SystemExit('snimek %d pro panel nedobehl' % PANEL_FRAME)

    plays = [split(s)[0] for s in samples]
    bitmap = majority([p[0] for p in plays])
    attrs = majority([p[1] for p in plays])

    # ★ Kontrola, že se během vzorkování nepřešlo do jiného podpalubí.
    # Číslo podpalubí v paměti zatím neznáme (M2), ale přechod by byl vidět:
    # vyměnily by se barvy i kulisa. Nejhorší vzorek musí být blízko většině.
    worst = max(sum(1 for a, b in zip(p[0], bitmap) if a != b) for p in plays)
    worst_attr = max(sum(1 for a, b in zip(p[1], attrs) if a != b) for p in plays)
    limit = len(bitmap) // 4
    print('nejhorší vzorek se od většiny liší v %d B bitmapy z %d (mez %d) a v %d '
          'atributech z %d' % (worst, len(bitmap), limit, worst_attr, len(attrs)))
    if worst > limit:
        raise SystemExit('během vzorkování se nejspíš změnilo podpalubí – '
                         'zkontroluj SCRIPT a SAMPLE_*')

    panel = split(panel_scr[PANEL_FRAME])[1]
    panels = set(split(s)[1] for s in samples)
    print('panel: %d různých podob za %d vzorků%s'
          % (len(panels), len(samples),
             '' if len(panels) == 1 else ' – POZOR, panel se měnil'))

    heads = [menu_head(m) for m in menus]
    print('hlavička menu: %d různých podob za %d snímků%s'
          % (len(set(heads)), len(heads),
             '' if len(set(heads)) == 1 else ' – POZOR, hlavička se měnila'))

    # ★ Od M2 se do prohlížeče z tohohle nástroje nic nepíše: herní obrazovka
    # se skládá z dat (podpalubí, panel, Jim) a hlavička menu se tiskne
    # z proudu originálu (data/global.json#texts). Zůstávají reference, proti
    # kterým tools/matchscreen.mjs měří.
    scr = to_scr((bitmap, attrs), panel)
    os.makedirs(os.path.dirname(os.path.abspath(args.png)), exist_ok=True)
    write_png(args.png, scr_to_rgb(scr), 256, 2)
    print('náhled %s' % args.png)

    # referenční snímek pro tools/matchscreen.mjs: tentýž obraz, jak ho složil
    # originál — proti němu se poměřuje app/screenComposer.js
    os.makedirs(args.ref, exist_ok=True)
    ref = os.path.join(args.ref, 'screen.scr')
    open(ref, 'wb').write(scr)
    print('reference %s' % ref)
    # a celý snímek menu originálu: matchscreen z něj porovná hlavičku remaku
    # i celé menu vytištěné z proudů originálu
    ref = os.path.join(args.ref, 'menu.scr')
    open(ref, 'wb').write(menus[-1])
    print('reference %s' % ref)


if __name__ == '__main__':
    main()
