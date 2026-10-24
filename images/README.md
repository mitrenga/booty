# images/

`poster.png` is the game's poster (1448 × 1086, supplied by the operator
2026-10-09), `cover.png` is its 800 × 600 reduction (palette PNG8) for
`/about` (`../aboutPage.php`) — the same shape as the siblings':

    convert poster.png -resize 800x600 -colors 256 -strip PNG8:cover.png

`app-icon.svg` (2026-10-09) is **the pirate with his sabre forward from the
original**, not a drawing: frame `$44` of the pirate set (`CHARS` `$8E28`,
drawn by `$F007`; 2 × 3 characters, 16 × 24 pixels, `data/global.json#sprites`,
`../sources/docs/sprites.md`) in the colours he walks in in hold 1 – ink 7 on
paper 1 **without BRIGHT** (`OPST`, `COLDAT`; attributes `$08`–`$0F` on the
original's screen, `build/ref/screen.scr`; `ZXColor.white` `#b8b8b8` on
`ZXColor.blue` `#1435b2`). The canvas is 1024 × 1024 as a 32 × 32 pixel grid
of 32 px each, the sprite at (8, 4), one rectangle per horizontal run of pixels.

The PNG set and the favicon are made from it by the library's tools (by hand,
like a build):

- `app/svision/tools/make-app-icons` — `app-icon.svg` → PNG set
  (192, 256, 512, 1024, 1980), needs `rsvg-convert`
- `app/svision/tools/make-favicon` — `favicon.ico`

`poster.png` and `cover.png` are referenced by `index.php` and `aboutPage.php`.

★ **Never copy another game's icons here**: a sibling's favicon taken over
would be a picture of a foreign game, which is worse than none.
