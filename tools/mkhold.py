#!/usr/bin/env python3
"""References from the running original: game screen and menu.

    ./tools/mkhold.py

The game is started in the simulator as in `playtrace.py`: a key moves from
the title into the menu, `0` starts the game and the whole video memory image
is saved at regular intervals. The output is **reference screens** against
which `tools/matchscreen.mjs` measures what the remake assembles from data:

- `build/ref/screen.scr` – **game screen** at the start of the game: the
  playfield (★ rows 0–22) by **majority vote** over 431 frames, so whatever
  moves (pirates) drops out of the vote; the panel (★ row 23) from a single
  frame, so that the numbers are ones that really stood on the screen at once.
  ★ Jim stands still (nothing is pressed), so he stays. Sampling happens
  before the game's first timed event (`$E12A` after 1400 `FRAMES` frames,
  `disasm_notes.md` §4)
- `build/ref/menu.scr` – **menu of the original** (frame 298); the tool
  checks that its header (rows 0–7) does not change over frames 230–298

★ The majority vote assumes nothing about the hold format – which is why it
is a good independent reference for assembly from data (`data/global.json#holds`,
`global.json#panel`, `global.json#sprites`, `global.json#global`,
`global.json#texts`). In M1 the photo for the browser was taken from it too;
from M2 on it is not.
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

# ★ Title → any key → menu (`1 - KEYBOARD` … `0 - START GAME`, measured with
# playtrace.py, frame 290) → `0`. The game is on the screen from frame
# ≈ 315, the whole panel from ≈ 330 (build/m1probe).
SCRIPT = [(200, 210, 'SPACE'),  # from the title into the menu
          (300, 310, '0')]      # 0 - START GAME
SAMPLE_FROM, SAMPLE_TO, SAMPLE_STEP = 360, 1650, 3
PANEL_FRAME = 1000              # the frame the panel is taken from
MENU_FROM, MENU_TO = 230, 298   # the original's menu is on the screen (build/m1probe)
MENU_ROWS = 8                   # ★ menu header: rows 0–7

PANEL_ROW = 23                  # ★ the panel is character row 23
ROWS_ALL = 24
COLS = 32


def screen_offset(y):
    """Offset of pixel row y (0–191) in the 6912 B image."""
    third, char_row, pix = y >> 6, (y >> 3) & 7, y & 7
    return (third << 11) | (pix << 8) | (char_row << 5)


def split(scr):
    """(playfield, panel) as pairs (bitmap by rows, attributes)."""
    play_b, panel_b = bytearray(), bytearray()
    for y in range(192):
        line = scr[screen_offset(y):screen_offset(y) + COLS]
        (panel_b if y >> 3 == PANEL_ROW else play_b).extend(line)
    attrs = scr[6144:6912]
    return ((bytes(play_b), bytes(attrs[:PANEL_ROW * COLS])),
            (bytes(panel_b), bytes(attrs[PANEL_ROW * COLS:])))


def menu_head(scr):
    """Rows 0–7 of the original's menu: (bitmap by pixel rows, attributes)."""
    bitmap = bytearray()
    for y in range(MENU_ROWS * 8):
        bitmap += scr[screen_offset(y):screen_offset(y) + COLS]
    return bytes(bitmap), bytes(scr[6144:6144 + MENU_ROWS * COLS])


def majority(samples):
    """Most frequent value per byte – whatever does not move wins."""
    out = bytearray(len(samples[0]))
    for i in range(len(out)):
        out[i] = Counter(s[i] for s in samples).most_common(1)[0][0]
    return bytes(out)


def to_scr(play, panel):
    """Back into a 6912 B image – for the preview and the reference."""
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
                    help='where to store the reference screen for tools/matchscreen.mjs')
    args = ap.parse_args()

    snapshot = Snapshot.get(args.snapshot)
    if snapshot is None:
        raise SystemExit('cannot load snapshot %s – run ./tools/mksnapshot.sh'
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
        raise SystemExit('too few samples (%d) – check SCRIPT' % len(samples))
    if PANEL_FRAME not in panel_scr:
        raise SystemExit('frame %d for the panel was not reached' % PANEL_FRAME)

    plays = [split(s)[0] for s in samples]
    bitmap = majority([p[0] for p in plays])
    attrs = majority([p[1] for p in plays])

    # ★ Check that no transition into another hold happened during sampling.
    # The hold number in memory is not known yet (M2), but a transition would
    # show: colours and scenery would change. The worst sample must be close
    # to the majority.
    worst = max(sum(1 for a, b in zip(p[0], bitmap) if a != b) for p in plays)
    worst_attr = max(sum(1 for a, b in zip(p[1], attrs) if a != b) for p in plays)
    limit = len(bitmap) // 4
    print('the worst sample differs from the majority in %d B of bitmap out of %d (limit %d) and in %d '
          'attributes out of %d' % (worst, len(bitmap), limit, worst_attr, len(attrs)))
    if worst > limit:
        raise SystemExit('the hold most likely changed during sampling – '
                         'check SCRIPT and SAMPLE_*')

    panel = split(panel_scr[PANEL_FRAME])[1]
    panels = set(split(s)[1] for s in samples)
    print('panel: %d distinct forms over %d samples%s'
          % (len(panels), len(samples),
             '' if len(panels) == 1 else ' – WARNING, the panel changed'))

    heads = [menu_head(m) for m in menus]
    print('menu header: %d distinct forms over %d frames%s'
          % (len(set(heads)), len(heads),
             '' if len(set(heads)) == 1 else ' – WARNING, the header changed'))

    # ★ From M2 on nothing is written for the browser from this tool: the game
    # screen is assembled from data (holds, panel, Jim) and the menu header is
    # printed from the original's stream (data/global.json#texts). What
    # remains are the references tools/matchscreen.mjs measures against.
    scr = to_scr((bitmap, attrs), panel)
    os.makedirs(os.path.dirname(os.path.abspath(args.png)), exist_ok=True)
    write_png(args.png, scr_to_rgb(scr), 256, 2)
    print('preview %s' % args.png)

    # reference screen for tools/matchscreen.mjs: the same image as the
    # original assembled it — app/screenComposer.js is measured against it
    os.makedirs(args.ref, exist_ok=True)
    ref = os.path.join(args.ref, 'screen.scr')
    open(ref, 'wb').write(scr)
    print('reference %s' % ref)
    # and the whole menu frame of the original: matchscreen compares the
    # remake's header and the whole menu printed from the original's streams
    ref = os.path.join(args.ref, 'menu.scr')
    open(ref, 'wb').write(menus[-1])
    print('reference %s' % ref)


if __name__ == '__main__':
    main()
