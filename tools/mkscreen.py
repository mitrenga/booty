#!/usr/bin/env python3
"""Converts a ZX `.scr` (6912 B) into a data file of the remake.

    ./tools/mkscreen.py <input.scr>   # → data/global.json#loading

Stores the screen **as it lies in the machine's memory** – 6912 B from `$4000`
to `$5AFF`, i.e. 6144 B of bitmap in the non-linear ULA addressing and 768 B
of attributes after it, base64. Exactly what is in the `.scr`, and exactly
what goes over the tape: reshuffling the pixel rows into linear order would
mean shuffling them back again in the browser, because `ZXVideoRAM` keeps the
memory in machine order and `ZXMachineSounds` sends the bytes of a data block
in address order.

Used on the loading screen of the original:

- `data/global.json#loading` from `sources/media/screens/loading_screen.scr` –
  the loading screen from the tape (SCREEN$ block `bs`, 6912 B at `$4000`; see
  `sources/docs/tape_layout.md`). `tapeLoadingModel` loads it – for real, byte
  by byte, as the data block plays them.

★ Cutting pieces of scenery out of this picture makes no sense and the tool
deliberately cannot do it: the game graphics come from the program (M2), not
from the pixels of the title screen. A cut-out carries whatever the original
happened to print over it and does not know where one piece ends and the next
begins.
"""
import argparse, base64, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bootylib as B                                             # noqa: E402

SCREEN_BYTES = 6912


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src')
    args = ap.parse_args()

    scr = open(args.src, 'rb').read()
    if len(scr) != SCREEN_BYTES:
        raise SystemExit('expected a %d B .scr, got %d' % (SCREEN_BYTES, len(scr)))

    data = {
        'width': 256, 'height': 192,
        'videoRAM': base64.b64encode(scr).decode('ascii')
    }

    print('%s -> %s' % (args.src, B.write_section('loading', data)))


if __name__ == '__main__':
    main()
