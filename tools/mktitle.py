#!/usr/bin/env python3
"""The original's title for `MainModel` → `data/global.json#title`.

    ./tools/mktitle.py

★ Everything is taken from the code on the tape (`tools/bootylib.py`
`memory_image()`) and from the measurement of `tools/tracetitle.py`, nothing
from a picture captured at run time:

- `videoRAM` – the picture as `$CDA6` `LDIR` copies it from `$6978` to `$4000`;
  the sea in it is still the mark `$05`, which the first pass of `$D0AC` overwrites
- `seaMark` – operand of `CP $05` at `$D0B3`: the byte of the copy that is sea
- `seaLimit` – operand of `CP $80` at `$D0BD`: a number below it is written, otherwise 0
- `seed` – state of the generator `$D8D4` at `$D86F` after loading
- `border` – operand of `LD A,$03` at `$CD93` before ROM `BORDER` (`$229B`)
- `demoTStates` – how long until the title leaves for the demo (`$D602`,
  `FRAMES` = `$0400`), without the tune; with the tune for comparison
- cadence: average length of a pass through the loop `$CDAF` **without the
  tune** (`build/title/quiet/info.json`) – the remake runs at a constant
  cadence and the music does not change it, just like `PASS_TSTATES` for the
  game; with the tune for comparison

The check is done by `tools/matchtitle.mjs`.
"""
import base64, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                            # noqa: E402

FRAME = 69888
PICTURE = 0x6978        # ★ copy of the title picture
SEED = 0xD86F           # ★ state of the generator $D8D4


def main():
    image = B.memory_image()

    def peek(addr):
        return image[addr - 0x4000]

    # operands: verify the opcode, so that nothing is read from a place other than intended
    for at, opcode, what in ((0xD0B3, 0xFE, 'CP n'), (0xD0BD, 0xFE, 'CP n'),
                             (0xCD93, 0x3E, 'LD A,n')):
        if peek(at) != opcode:
            raise SystemExit('at $%04X expected %s, found $%02X' % (at, what, peek(at)))
    info = {}
    for run in ('quiet', 'tune'):
        path = os.path.join(B.ROOT, 'build', 'title', run, 'info.json')
        if not os.path.exists(path):
            raise SystemExit('%s is missing – run ./tools/tracetitle.py' % path)
        info[run] = json.load(open(path))

    quiet = info['quiet']['passTStates']
    out = {
        'videoRAM': base64.b64encode(bytes(image[PICTURE - 0x4000:PICTURE - 0x4000 + 6912]))
                    .decode('ascii'),
        'seaMark': peek(0xD0B4),
        'seaLimit': peek(0xD0BE),
        'seed': peek(SEED),
        'border': peek(0xCD94),
        'passTStates': quiet,
        'passFrames': round(quiet / FRAME, 4),
        # ★ the title leaves for the demo after 1024 interrupts: without the
        # tune (the remake's cadence), with it for comparison
        'demoTStates': info['quiet']['demoTStates'],
    }
    where = B.write_section('title', out)
    sea = sum(1 for b in image[PICTURE - 0x4000:PICTURE - 0x4000 + 6144] if b == out['seaMark'])
    print('%s: %d bytes of sea, seed $%02X, border %d, pass %.3f frames '
          '(with the tune %.3f)' % (where, sea, out['seed'], out['border'], out['passFrames'],
                                info['tune']['passTStates'] / FRAME))


if __name__ == '__main__':
    main()
