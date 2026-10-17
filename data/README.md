# data/

Data, která jdou do prohlížeče: **jediný soubor `global.json`**, v něm sekce
v pevném pořadí. Server je posílá pod týmiž klíči (`../db/appData.php`)
a aplikace si každou bere přes `loadDataFile('<sekce>')`.

**Každou sekci zapisuje nástroj z `../tools/` z originálu**
(`bootylib.write_section()`, v Node `jsonformat.mjs` `writeSection()`) a
ostatní sekce nechává být. Nic se needituje ručně a nic neobsahuje číslo,
které by někdo odhadl. V odkazech se sekce píše `data/global.json#holds`.

V datech jsou **jen hodnoty, které hra nebo nástroje čtou**, bez poznámek.
Odkud která hodnota je (adresy, kdo text tiskne, kdo nastavuje sadu
spritů, co je v které oblasti paměti), je v nástroji, který sekci
zapisuje, a v tabulce níž.

| sekce | co v ní je | dělá ji | doloženo |
|---|---|---|---|
| `global` | ★ výchozí stav hry z běhu originálu (snímek 399 po startu klávesou `0`): podpalubí, Jimův objekt (po dopadu), životy, kořist – pro statickou obrazovku z M2 | `tools/mkglobal.py` | `tools/matchscreen.mjs` |
| `holds` | ★ tabulky všech **21 podpalubí** od `$ABD6` do `$BAA0` (11 tabulek, jména autorova, souřadnice ROM `CL-SET`) a glyfy kulisy od `$8378` | `tools/dumpholds.py` | `tools/matchholds.mjs` — **161 973 kontrol, 0 rozdílů** proti kreslení originálu |
| `sprites` | ★ grafika spritů a bloků, osm sad (Jim, piráti, tvor z časovače, plošiny, okénka, výbuch, prázdné znaky, ikony a úlomek) z paměti běžící hry | `tools/dumpsprites.py` | `tools/matchsprites.mjs` — **23 611 392 kontrol, 0 rozdílů** |
| `panel` | ★ panel z operandů kódu: šablona `$F2BB`, polohy, inkoust, ikony `$F15B`, počáteční hodnoty, text o zlatém klíči | `tools/dumppanel.py` | `tools/matchpanel.mjs` — **870 912 kontrol, 0 rozdílů** |
| `texts` | ★ proudy pro ROM tisk (menu, `PRESS FIRE BUTTON`, úvod skryté hry), jak leží v paměti | `tools/dumptexts.py` | `tools/matchscreen.mjs` — celé menu originálu **6912 / 0** |
| `memory` | ★ **výchozí paměť hry** pro `app/bootyLogic.js` ve workeru: 13 datových oblastí paměti originálu při startu hry (12 688 B) – tabulky, glyfy, sprity, šablony, texty, proměnné; **kód v ní není** (ověřeno proti `booty.ctl`) | `tools/mkmemory.py` | `tools/matchstart.mjs` — **0 rozdílů** |
| `transition` | ★ přechod dveřmi bez melodie: T do mazání a délka černa jako model z práce kreslení, 48 bloků mazání ROM CL-LINE, kopie atributů, panel | `tools/tracetransition.py` → `tools/mktransition.mjs` | `tools/matchtransition.mjs` — **197 snímků, 0 rozdílů** (nejvýš 0,045 snímku vedle) |
| `loading` | loading screen z kazety: videopaměť `$4000–$5AFF` tak, jak leží v paměti stroje (6144 B bitmapy v nelineárním adresování ULA + 768 B atributů, base64) | `tools/mkscreen.py sources/media/screens/loading_screen.scr` | `tools/matchloading.py` — **112 128 kontrol, 0 rozdílů** |
| `tape` | scénář pro LOAD TAPE: osm bloků kazety v jejím pořadí, u každého pilot (délka a **počet pulzů** – turbo bloky 497), synchronizace, bity, pauza z TZX a bajty, jak jdou po pásce; SCREEN$ odkazuje na sekci `loading`, z bloku kódu jen první kilobajt | `tools/mktape.py` | z kazety přes `tools/bootylib.py`; časování sedí se simulovaným nahráním (`tools/traceloading.py`) |
| `title` | ★ titulka pro `MainModel`: obrázek z kopie na `$6978` (moře v něm je značka `$05`), prahy moře z operandů `$D0AC`, semínko `$D86F`, border z `$CD93` a tempo smyčky `$CDAF` bez melodie (483 501 T = 6,92 snímku) | `tools/tracetitle.py` → `tools/mktitle.py` | `tools/matchtitle.mjs` — **1 776 641 kontrol, 0 rozdílů** |
| `sounds` | ★ zvuk originálu: melodie `$FA00` (`[DE, BC]` pro `$F648`), maska `$FFF7`, parametry slotů obsluhy IM 2 z operandů kódu, volání ROM `BEEPER`, ROM `$0000`–`$1FFF` pro šum `$F618` a změřená délka ROM `$0038` | `tools/tracesound.py` → `tools/mksounds.py` | `tools/matchsound.mjs` — **122 448 kontrol, 0 rozdílů** |
| `goldfish` | ★ skrytá minihra `CATCH 20 GOLDFISH` pro SECRET SUB GAME a pozadí menu: datové oblasti paměti originálu při prvním vstupu do `$CF36` (obrazovka, grafika, objekty, potápěč, písek, bubliny), kód ne; tempo = medián průchodu bez melodie a zvuků | `tools/tracegoldfish.py` → `tools/mkgoldfish.py` | `tools/matchgoldfish.mjs` — **47 574 000 kontrol, 0 rozdílů** |

Tempo hry (průměrná délka průchodu) v datech není: je to jedno číslo,
`PASS_TSTATES` v `app/gameWorker.js`, a `tools/measurecadence.py` ověřuje,
že sedí.

## ★ Herní obrazovka se od M2 skládá z dat

`app/screenComposer.js` skládá herní obrazovku tak, jak ji staví originál:
podpalubí ze sekce `holds` (`$A900`), panel z `panel` (`$E0A9`),
Jima přes sprite rutinu (`$EED7`) ze `sprites` v poloze z
`global`. `tools/matchscreen.mjs` ji porovnává s **většinovým hlasem
nad běžícím originálem** (`build/ref/screen.scr`, `tools/mkhold.py`), který
o formátu nic nepředpokládá – a je to nula.
Hlavička menu se tiskne z proudu originálu (sekce `texts`) přes svision
`ZXRomPrint`. **Fotka v `data/` už není žádná** – `screen.json` z M1 je
zrušený.

## Co tu zatím není

Nic, co by čekalo na měření: od M6 je tu i zvuk (sekce `sounds`). Další
sekce **nevzniknou dřív, než bude co změřit**. Server chybějící sekce
posílá jako `null` a aplikace to musí přežít (`../db/appData.php`).
