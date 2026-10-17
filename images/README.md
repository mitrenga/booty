# images/

`poster.png` je plakát hry (1448 × 1086, dodal operátor 2026-10-09),
`cover.png` je jeho zmenšenina 800 × 600 (paletová PNG8) pro `/about`
(`../aboutPage.php`) — stejný tvar jako u sourozenců:

    convert poster.png -resize 800x600 -colors 256 -strip PNG8:cover.png

`app-icon.svg` (2026-10-09) je **pirát se šavlí vpřed z originálu**, ne
kresba: snímek `$44` sady piráta (`CHARS` `$8E28`, kreslí ho `$F007`;
2 × 3 znaky, 16 × 24 bodů, `data/global.json#sprites`, `../sources/docs/sprites.md`)
v barvách, v jakých chodí v podpalubí 1 – inkoust 7 na papíru 1 **bez
BRIGHT** (`OPST`, `COLDAT`; atributy `$08`–`$0F` na obrazovce originálu,
`build/ref/screen.scr`; `ZXColor.white` `#b8b8b8` na `ZXColor.blue`
`#1435b2`). Plátno 1024 × 1024 jako mřížka 32 × 32 bodů po 32 px, sprite na
(8, 4), jeden obdélník na vodorovný úsek bodů.

PNG sadu a favicon z něj udělají nástroje knihovny (ručně, jako build):

- `app/svision/tools/make-app-icons` — `app-icon.svg` → PNG sady
  (192, 256, 512, 1024, 1980), potřebuje `rsvg-convert`
- `app/svision/tools/make-favicon` — `favicon.ico`

`poster.png` a `cover.png` odkazuje `index.php` a `aboutPage.php`.

★ **Ikony jiné hry sem nekopírovat**: převzatý favicon sourozence by byl
obrázek cizí hry, což je horší než žádný.
