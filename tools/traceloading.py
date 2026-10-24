#!/usr/bin/env python3
"""Screenshots **during** tape loading – what the ROM and the loader really show.

    ./tools/traceloading.py [--out build/loading] [--fast]

Runs the same simulated load as `tools/mksnapshot.sh` (SkoolKit `tap2sna.py`,
48K ROM, all eight blocks including both turbo blocks) and looks at the video
memory in every ULA frame. Whenever the image changes it saves it
(`.scr` + `.png`) and prints **what is written on it in the ROM font** – every
character cell is compared byte by byte with the ROM characters at `$3D00`,
in both colour polarities. Next to the text it prints the border colour and
the attribute of the cells with text, so that what is **written but
invisible** (ink = paper) can be seen too.

This is what `MILNIKY.md` M1 asks for: the captions LOAD TAPE shows in the
remake (`Program: BOOTY`, `Bytes: …`) are not copied from the siblings but
**verified against the loading screenshots**. `app/tapeLoadingModel.js`
quotes the output of this tool.

Without `--fast` the load runs at tape speed (fast-load=0), so that the image
is captured in the middle of blocks too; it takes longer.
"""
import argparse, hashlib, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                             # noqa: E402
RETRO = B.RETRO
sys.path.insert(0, B.SKOOLKIT)
sys.path.insert(0, RETRO)

from scr2png import scr_to_rgb, write_png                        # noqa: E402
from skoolkit import tap2sna, ROM48, read_bin_file               # noqa: E402

ROM = read_bin_file(ROM48, 16384)
FONT = {bytes(ROM[0x3D00 + 8 * i:0x3D08 + 8 * i]): chr(32 + i) for i in range(96)}
FONT[bytes(ROM[0x3D60:0x3D68])] = '©'                       # $7F = ©


def offset(row, line, col):
    return ((row >> 3) << 11) | (line << 8) | ((row & 7) << 5) | col


def cell(scr, row, col):
    return bytes(scr[offset(row, line, col)] for line in range(8))


def read_text(scr):
    """[(row, column, text, attribute)] – contiguous runs of ROM-font characters."""
    out = []
    for row in range(24):
        line, start, attrs = '', None, set()
        for col in range(33):
            ch = None
            if col < 32:
                c = cell(scr, row, col)
                ch = FONT.get(c) or FONT.get(bytes(255 - b for b in c))
                if ch == ' ' and not line:
                    ch = None
            if ch is not None:
                if start is None:
                    start = col
                line += ch
                attrs.add(scr[6144 + row * 32 + col])
            elif line:
                text = line.rstrip()
                if text:
                    out.append((row, start, text, sorted(attrs)))
                line, start, attrs = '', None, set()
    return out


class Recorder:
    def __init__(self, out_dir):
        self.out_dir = out_dir
        self.last = None
        self.shots = []

    @staticmethod
    def colour(border):
        """Border colour at the end of the frame. SkoolKit passes either a
        number or a list of changes `(T-state, port $FE value)` during the frame."""
        if isinstance(border, list):
            return border[-1][1] & 7 if border else None
        return border

    def draw(self, scr, frame, border=None, *rest):
        digest = hashlib.sha1(bytes(scr)).digest()
        if digest != self.last:
            self.last = digest
            scr = bytes(scr)
            path = os.path.join(self.out_dir, 'load%05d' % frame)
            open(path + '.scr', 'wb').write(scr)
            write_png(path + '.png', scr_to_rgb(scr), 256, 2)
            self.shots.append((frame, self.colour(border), scr))
        return True


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(B.ROOT, 'build', 'loading'))
    ap.add_argument('--fast', action='store_true',
                    help='fast-load=1: blocks load at once, screenshots only between them')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    recorder = Recorder(args.out)

    class Screen:
        def draw(self, scr, frame, border=None, *rest):
            return recorder.draw(scr, frame, border)

    tap2sna.get_screen = lambda *a, **k: Screen()
    snap = os.path.join(args.out, 'booty_loaded.z80')
    argv = ['--screen', '--start', '0xCD14',
            '-c', 'fast-load=%d' % (1 if args.fast else 0), B.TAPE, snap]
    tap2sna.main(argv)

    # only frames where the text or the border changed: byte-by-byte changes
    # in the middle of the SCREEN$ block are thousands and the text does not change in them
    previous = None
    for frame, border, scr in recorder.shots:
        text = read_text(scr)
        key = (border, tuple((r, c, t) for r, c, t, a in text))
        if key == previous:
            continue
        previous = key
        print('frame %5d  (%.2f s)  border %s' % (frame, frame / 50.08, border))
        for row, col, t, attrs in text:
            visible = all((a & 7) != ((a >> 3) & 7) for a in attrs)
            print('    row %2d column %2d  %-32s attribute %s%s'
                  % (row, col, repr(t), ' '.join('$%02X' % a for a in attrs),
                     '' if visible else '  ← ink = paper, INVISIBLE'))
    print('%d frames with a different image in %s' % (len(recorder.shots), args.out))


if __name__ == '__main__':
    main()
