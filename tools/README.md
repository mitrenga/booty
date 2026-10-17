# tools/

Nástroje remaku. Platí pro ně `../../STANDARDS.md` a metodika
`dump*` → `trace*` → `match*` z `../../METHODOLOGY.md`:

- **`dump*` / `mk*`** vytáhnou z originálu data a uloží je do `../data/`
- **`trace*`** nahrají z běžícího originálu záznam, proti kterému se měří
- **`match*`** porovnají remake s originálem a **vypíšou počet kontrol
  a počet rozdílů**. Milník je hotový, když je rozdílů nula.

Python nástroje potřebují **SkoolKit** vendorovaný ve svision (R-008), přes
symlink `app/svision` (`bootylib.SKOOLKIT`). Node nástroje (`*.mjs`) staví
**skutečným kódem z `../app/`**, načteným přes shim
`app/svision/tools/nodeEnv.mjs` (R-001).

## Kazeta a obraz paměti

| nástroj | co dělá |
|---|---|
| `bootylib.py` | **jediné místo, kde je napsané, co je na kazetě** a jak se z ní skládá obraz paměti: TZX s bloky ID $10 i $11, `memory_image()` (včetně 62 B na `$CD14`), `code_image()`. |
| `tapinfo.py` | rozebere kazetu blok po bloku; `--basic` vypíše oba programy v BASICu **i se skutečnými binárními hodnotami čísel**. Výstup je v `../sources/docs/tape_layout.md`. |
| `mksnapshot.sh` | kazeta → `build/booty.z80` + `build/booty.bin`, simulované nahrání až do `USR 52500` (`$CD14`). |
| `matchimage.py` | ★ **38 726 kontrol, 0 rozdílů** — obraz paměti z `bootylib.py` proti paměti simulátoru. |
| `traceloading.py` | totéž simulované nahrání, ale **snímek po snímku**: kdykoli se obraz změní, uloží ho (`build/loading/`) a vypíše text, který na něm je (buňky porovnané se znaky ROM na `$3D00`), s atributem a varováním, když je inkoust = papír. Odtud jsou nápisy LOAD TAPE (`Program: BOOTY` viditelně, `Bytes: bs` / `Bytes: bc` neviditelně). `--fast` jen mezi bloky. |
| `mktape.py` | kazeta → `data/global.json#tape`: osm bloků s časováním (u turbo bloků z TZX, **497 pulzů pilotu**), pauzami a bajty, jak jdou po pásce; z bloku kódu jen první kilobajt. |

## Obrazovka

| nástroj | co dělá |
|---|---|
| `matchloading.py` | ★ **112 128 kontrol, 0 rozdílů** — SCREEN$ z kazety proti `sources/media/screens/loading_screen.scr` (bajty), proti `data/global.json#loading` (bajty) a proti obrazovce simulátoru **po pixelech** v obou fázích FLASH. |
| `mkscreen.py` | `.scr` → `data/global.json#loading` (videopaměť tak, jak ji drží stroj). |
| `playtrace.py` | spustí hru v simulátoru, odsimuluje stisky kláves, uloží snímky (`.png` + `.scr`), volitelně mapu pokrytí kódu (`--map`) a celou RAM (`--dump`). |
| `mkhold.py` | z běhu originálu (titulka → `SPACE` → menu → `0`): **reference** herní obrazovky většinovým hlasem přes 431 snímků (`build/ref/screen.scr`) a snímek menu originálu (`build/ref/menu.scr`) |
| `matchscreen.mjs` | ★ **16 128 kontrol, 0 rozdílů** — herní obrazovka **složená z dat** (podpalubí, panel, Jim), hlavička menu remaku a **celé menu originálu z proudů** proti videopaměti originálu. |

## Podpalubí, sprity, panel (M2)

| nástroj | co dělá |
|---|---|
| `dumpholds.py` | tabulky 21 podpalubí (`bootylib.holds()`) a glyfy kulisy → `data/global.json#holds`; zpětné složení musí dát bajty z kazety |
| `traceholds.py` | **kód originálu** (`$AA97`, `$AB44`, `$A900`) v simulátoru nakreslí každé podpalubí ze stavu hry na `$E0A9` → `build/ref/holds/` (obraz, mapa znaků, border) |
| `matchholds.mjs` | ★ **161 973 kontrol, 0 rozdílů** — `app/holdRenderer.js` proti referenci |
| `dumpsprites.py` | grafika osmi sad spritů a bloků z paměti běžící hry → `data/global.json#sprites` |
| `tracesprites.py` | **rutiny originálu** `$EED7` (sprite) a `$EA93` (blok) nakreslí všechno, co se jimi kreslí: 3416 případů, 16 jemných poloh, oba okraje → `build/ref/sprites/` |
| `matchsprites.mjs` | ★ **23 611 392 kontrol, 0 rozdílů** — `app/spriteRenderer.js` proti referenci |
| `dumppanel.py` | panel z operandů kódu (s kontrolou instrukcí na adresách) → `data/global.json#panel` |
| `tracepanel.py` | **kód originálu** (`$E0AC`… a úsek hlavní smyčky `$DF5B`) vytiskne panel ve 21 podpalubích × 6 stavech → `build/ref/panel/` |
| `matchpanel.mjs` | ★ **870 912 kontrol, 0 rozdílů** — `app/panelRenderer.js` proti referenci |
| `dumptexts.py` | proudy pro ROM tisk (menu, `DEFINE KEYS`, skrytá hra …) → `data/global.json#texts` |
| `mkglobal.py` | výchozí stav hry z běhu originálu (snímek 399) → `data/global.json#global` |

## Hlavní smyčka (M3)

| nástroj | co dělá |
|---|---|
| `tracephysics.py` | záznamy originálu: hra se hraje podle skriptu (ručního, náhodného se semínkem, do každého podpalubí, cílené: zlatý klíč, moře, konec hry) a na začátku každého průchodu `$DF13` se uloží paměť v oblastech a vstupy průchodu (klávesa z `KEY-SCAN`, `FRAMES` časovače, T-stavy). Vstupy se chytají odbočkou v simulátoru → `build/trace/<skript>/` |
| `matchphysics.mjs` | ★ **425 540 průchodů, 0 rozdílů** – `app/bootyLogic.js` z téže paměti s týmiž vstupy, po každém průchodu celé oblasti paměti; `--base build/rules` totéž nad partiemi z RZX (183 890 / 0) |
| `physicscoverage.py` | co záznamy pokryly: podpalubí, přechody, smrti, klíče, dveře, kořist, výbuchy, tvorové, pády, plošiny, zlatý klíč, konec hry |
| `measurecadence.py` | průměrná délka průchodu originálu bez melodie (konstantní tempo remaku) – ověří, že sedí s `PASS_TSTATES` v `app/gameWorker.js` |
| `tracetransition.py` | ★ přechod dveřmi do podpalubí 1–20 v simulátoru se spornou pamětí, bez melodie: T-stavy zastávek `$EE84` … `$DF13`, obrazovka na konci každého snímku, průběh mazání ROM CL-LINE bez přerušení → `build/transition/`; `--shots DIR` PNG snímků |
| `mktransition.mjs` | z `build/transition/` modely časů (tabulky, černo) a bloky mazání → `data/global.json#transition` |
| `matchtransition.mjs` | ★ **197 snímků, 0 rozdílů** — ke každému snímku přechodu originálu remake (`BootyLogic.transitionScreen`) ukáže tentýž obraz, nejvýš 0,045 snímku vedle |
| `mkmemory.py` | datové oblasti paměti originálu při startu hry (ověřené proti kódu v `booty.ctl`) → `data/global.json#memory` |
| `matchstart.mjs` | ★ nová hra z `data/global.json#memory` = originál na začátku, a 8 záznamů z ní – **0 rozdílů** |

## Pravidla lodi (M4)

| nástroj | co dělá |
|---|---|
| `tracerules.py` | nahrávky RZX z RZX Archive (`build/rzx/`, `sources/docs/provenance.md`) – **celé partie, které hrál člověk** – přehraje SkoolKitem a vstupy průchodů chytá **pozorováním** (`$ED38` klávesa, `$E122`/`$E136` `FRAMES`), bez zásahu do kódu, který by posunul snímky RZX → `build/rules/<jméno>/` ve tvaru `tracephysics.py` |
| `matchrules.mjs` | ★ **204 043 průchodů, 2 766 278 726 kontrol, 0 rozdílů** — **worker** (`app/gameWorker.js`, jak běží v prohlížeči) od nové hry: klávesy jako akce přes `controls`, tiky, přechody, konec hry; po každém průchodu celá paměť a zpráva `frame`. Podstrkuje se jen `FRAMES` časovače (tempo je odchylka). Partie `gold1`, `gold2` (zlatý klíč, další kolo) a `walk`, `gameover`, `lastlife` z `tracephysics.py`; vypíše, co se v partii stalo (kořist, výbuchy, klíče, dveře, smrti, hrany lodi) |
| `workersandbox.mjs` | atrapa prostředí workeru (`node:vm`, hodiny, `importScripts`) a data z `data/` pro `runworker.mjs` a `matchrules.mjs` |

## Nepřátelé (M5)

| nástroj | co dělá |
|---|---|
| `matchentities.mjs` | ★ **611 302 průchodů, 216 988 343 kontrol, 0 rozdílů** — nad `build/trace` i `build/rules`: **tabulka entit** (piráti `OPST`, tvor `$F31C`, plošiny `LIDAT`, okénka `PHDAT`, výbuch, úlomky, Jim) remaku = originálu po každém průchodu, bajty i obraz na obrazovce; **na datech originálu** pravidla z `sources/docs/enemies.md` (kroky, snímky a otočky pirátů s důvodem, let tvora, meze plošin); **kolizní obálky** piráta a tvora proti všem testům dotyku. Vypíše pokrytí (otočky podle důvodu, druhy a strany tvora, nevypuštění, smrti) |

Cílené záznamy pro M5 jsou v `tracephysics.py`: `creature*` (Jim čeká na
palubě, kam tvor smí; semínka `$F343`) a `ladder*` (Jim leze po žebříku
pod pirátem).

## Worker

| nástroj | co dělá |
|---|---|
| `runworker.mjs` | ★ **35 kontrol, 0 chyb** — `app/gameWorker.js` bez prohlížeče s daty z `data/`: první obrazovka = obrazovka originálu, konstantní tempo průchodů, klávesy přes `KEY-SCAN`, semínko, **přechod dveřmi** (mazání, černo v délce originálu, border, čekající průchod, půl vteřiny bez vstupu), **hodiny s podstrčeným časem** (konstantní `setTimeout`, bez akumulátoru). |
| `tracerand.py` | pustí generátor originálu `$E349` v simulátoru Z80 na skutečném kódu z kazety a vypíše čísla i stavy `$F343`. |
| `matchrand.mjs` | ★ **196 608 kontrol, 0 rozdílů** — generátor workeru proti `$E349` na **celé periodě** 65 536 volání (číslo i stav). |
| `tracegoldfish.py` | skrytá minihra v simulátoru Z80 přes POKE `52798,58`, bez kláves: paměť při vstupu do `$CF36` a oblasti po každém průchodu → `build/goldfish/`. |
| `mkgoldfish.py` | → `data/global.json#goldfish`: datové oblasti minihry a tempo (medián průchodu). |
| `matchgoldfish.mjs` | ★ **47 574 000 kontrol, 0 rozdílů** — `app/goldfishLogic.js` (SECRET SUB GAME) proti originálu, 2 × 3000 průchodů: bez kláves a s náhodnými klávesami potápěče (`tracegoldfish.py --keys 1`); i řádky 22–23 FISH/AIR. |
| `tracesound.py` | zvuk originálu v simulátoru Z80: obsluha IM 2 `$FE69` po cestách (každý `OUT` na `$FE`, délka, paměť), ROM `BEEPER`, ROM `$0038`, a melodie na titulce obsluhu po obsluze → `build/sound/`. |
| `mksounds.py` | → `data/global.json#sounds`: melodie `$FA00`, parametry slotů z operandů kódu, BEEPER, ROM pro šum, délka ROM `$0038`. |
| `matchsound.mjs` | ★ **122 448 kontrol, 0 rozdílů** — `app/bootySound.js` proti originálu hranu po hraně v T-stavech, i kdy se přerušení ztratí. |
| `tracetitle.py` | titulka originálu `$CD86` v simulátoru Z80 (sporná paměť): na každém vstupu do smyčky `$CDAF` videopaměť, stav `$D86F` a T-stav; běh s melodií a bez ní → `build/title/`. |
| `mktitle.py` | → `data/global.json#title`: obrázek z kopie `$6978`, prahy moře z operandů `$D0AC`, semínko, border a tempo bez melodie. |
| `matchtitle.mjs` | ★ **1 776 641 kontrol, 0 rozdílů** — moře `app/titleSea.js` proti originálu průchod po průchodu (celá videopaměť i `$D86F`). |

## Disassembly a měření

| nástroj | co dělá |
|---|---|
| `mkasm.py` | `bootylib.code_image()` → `../sources/asm/booty.skool` podle ručně udržovaného `booty.ctl`. První `.ctl` vyrobí `--ctl-from-map` z mapy pokrytí (`playtrace.py --map`) přes SkoolKit `sna2ctl.py`; pak už se jen ručně doplňuje. |
| `tracecadence.py` | ★ změří délku průchodu hlavní smyčkou `$DF13` v T-stavech (zastaví se na každém vstupu); `--cmio` se spornou pamětí, `--csv` surová data. Výsledek je v `../sources/docs/disasm_notes.md` §4. |

## Co přibude

`tracesound.py` +
`matchsound.mjs` (M6). **Žádný z nich nevznikne dřív, než bude co měřit.**
