#!/usr/bin/env python3
"""Titulka originálu pro `MainModel` → `data/global.json#title`.

    ./tools/mktitle.py

★ Všechno se bere z kódu na kazetě (`tools/bootylib.py` `memory_image()`)
a z měření `tools/tracetitle.py`, nic z obrázku zachyceného za běhu:

- `videoRAM` – obrázek, jak ho `$CDA6` `LDIR` zkopíruje z `$6978` na `$4000`;
  moře v něm je ještě značka `$05`, kterou první průchod `$D0AC` přepíše
- `seaMark` – operand `CP $05` na `$D0B3`: bajt kopie, který je moře
- `seaLimit` – operand `CP $80` na `$D0BD`: číslo pod ním se zapíše, jinak 0
- `seed` – stav generátoru `$D8D4` na `$D86F` po nahrání
- `border` – operand `LD A,$03` na `$CD93` před ROM `BORDER` (`$229B`)
- `demoTStates` – za jak dlouho titulka odejde do ukázky (`$D602`,
  `FRAMES` = `$0400`), bez melodie; s melodií pro srovnání
- tempo: průměrná délka průchodu smyčkou `$CDAF` **bez melodie**
  (`build/title/quiet/info.json`) – remake jde v konstantním tempu a hudba
  ho nemění, stejně jako `PASS_TSTATES` u hry; s melodií pro srovnání

Kontrolu dělá `tools/matchtitle.mjs`.
"""
import base64, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B                                            # noqa: E402

FRAME = 69888
PICTURE = 0x6978        # ★ kopie titulky
SEED = 0xD86F           # ★ stav generátoru $D8D4


def main():
    image = B.memory_image()

    def peek(addr):
        return image[addr - 0x4000]

    # operandy: ověřit opcode, ať se nečte z jiného místa, než se myslí
    for at, opcode, what in ((0xD0B3, 0xFE, 'CP n'), (0xD0BD, 0xFE, 'CP n'),
                             (0xCD93, 0x3E, 'LD A,n')):
        if peek(at) != opcode:
            raise SystemExit('na $%04X čekám %s, je tam $%02X' % (at, what, peek(at)))
    info = {}
    for run in ('quiet', 'tune'):
        path = os.path.join(B.ROOT, 'build', 'title', run, 'info.json')
        if not os.path.exists(path):
            raise SystemExit('chybí %s – spusť ./tools/tracetitle.py' % path)
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
        # ★ titulka odejde do ukázky po 1024 přerušeních: bez melodie
        # (tempo remaku), s ní pro srovnání
        'demoTStates': info['quiet']['demoTStates'],
    }
    where = B.write_section('title', out)
    sea = sum(1 for b in image[PICTURE - 0x4000:PICTURE - 0x4000 + 6144] if b == out['seaMark'])
    print('%s: %d bajtů moře, semínko $%02X, border %d, průchod %.3f snímku '
          '(s melodií %.3f)' % (where, sea, out['seed'], out['border'], out['passFrames'],
                                info['tune']['passTStates'] / FRAME))


if __name__ == '__main__':
    main()
