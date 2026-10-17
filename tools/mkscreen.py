#!/usr/bin/env python3
"""Převede ZX `.scr` (6912 B) na datový soubor remaku.

    ./tools/mkscreen.py <vstup.scr>   # → data/global.json#loading

Uloží obrazovku **tak, jak leží v paměti stroje** – 6912 B od `$4000` do
`$5AFF`, tedy 6144 B bitmapy v nelineárním adresování ULA a 768 B atributů za
ní, base64. Přesně to, co je v `.scr`, a přesně to, co jde po kazetě: přehazovat
pixelové řádky do lineárního pořadí by znamenalo je v prohlížeči zase rozházet
zpátky, protože `ZXVideoRAM` drží paměť v pořadí stroje a `ZXMachineSounds`
posílá bajty datovým blokem v pořadí adres.

Použité na loading screen originálu:

- `data/global.json#loading` z `sources/media/screens/loading_screen.scr` – loading
  screen z kazety (blok SCREEN$ `bs`, 6912 B na `$4000`; viz
  `sources/docs/tape_layout.md`). Nahrává ho `tapeLoadingModel` – doopravdy,
  bajt po bajtu, jak je přehraje datový blok.

★ Vyřezávat z tohohle obrázku kusy kulisy nemá smysl a nástroj to schválně
neumí: grafika hry se bere z programu (M2), ne z pixelů
titulní obrazovky. Výřez nese, co přes něj originál zrovna natiskl, a neví,
kde končí jeden kus a začíná druhý.
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
        raise SystemExit('cekam %d B .scr, mam %d' % (SCREEN_BYTES, len(scr)))

    data = {
        'width': 256, 'height': 192,
        'videoRAM': base64.b64encode(scr).decode('ascii')
    }

    print('%s -> %s' % (args.src, B.write_section('loading', data)))


if __name__ == '__main__':
    main()
