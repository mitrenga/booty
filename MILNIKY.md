# Booty – milníky

Rozvržení je převzaté ze **sabrewulf** a **aticatac** a ze stejného důvodu:
u ZX hry je **extrakce dat z originálu** tak velká část práce, že má vlastní
milník *před* fyzikou a nepřáteli. Nic se nedokresluje – co nejde vytáhnout
z originálu, je otevřená otázka, ne odhad.

**Akceptační kritérium každého milníku je běh nástroje `match*` s nulou
rozdílů**, ne dojem z obrazovky. Číslo kontrol patří sem, do tohohle souboru.

Co se proti sourozencům dělá jinak:

- **Žánrově je to Manic Miner / Jet Set Willy, ne Ultimate.** Fyzika
  plošinovky (skok, žebříky, pád) je dražší než chůze Sabremana a dostává
  vlastní milník M3 se stejnou přísností jako Jetman.
- **Graf klíčů a dveří** je vlastní struktura světa, kterou žádný sourozenec
  nemá. Vytahuje se v M2 z tabulek v kódu a dokládá v M4 průchodem.
- **Firebird, ne Ultimate**: zavaděč, ochrana a kadence se **měří od nuly**.
  Nic z nálezů jetpac / lunarjetman / aticatac se nepřebírá bez měření.
- Jestli se M0 uzavře (úplná disassembly jako Jetpac), nebo zůstane otevřená
  (jako Sabre Wulf a Atic Atac), rozhodne **velikost kódu** změřená na kazetě.

Dotykové ovládání je **součást M1**, ne dodatečný milník (poučení z M5b
underwurlde, potvrzené Sabre Wulfem a Jetpacem).

---

## M0 – Analýza a podklady (**hotovo**, 2026-10-06)

Výstup: doplněné `ZADANI.md` (★ místo ? u co největšího počtu otázek §9)
a `sources/` s doloženou proveniencí.

- [x] Získat **kazetový obraz TZX**: ★ `Booty.tzx`, 46 106 B,
      SHA1 `1a325b309ccae2dd4e2b54b48fc082574ca852ad`, vydání Firebird 1984
      (loading screen `FIREBIRD`, `© 1984 J F Cain`). ? Odkud je, doplnit
- [x] **Rozebrat kazetu blok po bloku** → `sources/docs/tape_layout.md`:
      ★ osm bloků, z toho **dva turbo bloky (ID $11)** po 71 B s krátkým
      pilotem (497 pulzů) a synchronizací 875/525 T. `tools/tapinfo.py --basic`
- [x] **Blok SCREEN$** — ★ **je** (`bs`, 6912 B na `$4000`), platí větev
      **A**. Vytažený do `sources/media/screens/loading_screen.scr`;
      `tools/matchloading.py` — **105 216 kontrol, 0 rozdílů**
- [x] **Zamíchání a ochrana** — ★ kód zamíchaný **není**, ochrana je ve
      skládání: podvržená čísla v BASICu (`140` je `116`), strojový zavaděč
      v řádku 65295, `LOAD "" CODE 26880` přebíjí hlavičku (`$6518` →
      `$6900`), druhý turbo blok dá 62 B na `$CD14`, kde je v kódu podvrh
      `JP $6900`. `tools/bootylib.py` `memory_image()` +
      `tools/matchimage.py` — **38 726 kontrol, 0 rozdílů** proti simulátoru
- [x] **Velikost kódu** — ★ **38 655 B** (`$6900`–`$FFFE`), z toho 6912 B
      je titulní obrázek na `$6978`. Úplná disassembly **není** cílem M0;
      M0 zůstane otevřená jako u Sabre Wulfa a Atic Ataku
- [x] **Nezávislé dumpy** (`sources/docs/provenance.md`): ★ náš soubor je
      bajt po bajtu `Booty.tzx` z archivu WoS / Spectrum Computing (ZXDB
      „Original release"). Druhý dump TZX (OmikroN 1997) má **totožná data
      všech osmi bloků**, jen jiné časování (synchronizace turbo bloků podle
      ROM); obě odjištěné TAP mají blok kódu **bajt po bajtu** shodný
      s `bootylib.code_image()`
- [x] **Vydání** — ★ uzavřeno: Firebird 1984 (£2.50) a pozdější inlay
      Silver 199 (£1.99, návod liší jedním slovem); veřejně existuje jen
      jeden obsah kazety, takže rozdíl v kódu není s čím hledat. ABC Soft
      (bez dumpu), Outlet #120 (jen obrazovka). ? Cartridge pro Interface 2
      není: ZXDB u vydání vede jen TAP, TZX a MDR (Microdrive)
      (`sources/docs/raw/zxinfo_633.txt`), takže `sources/rom/` nevznikne
- [x] **Trasovací emulátor**: SkoolKit 10.1 ze svision (R-008),
      `tools/mksnapshot.sh` (kazeta → snapshot na `$CD14` + surová RAM),
      `tools/playtrace.py` (běh se skriptovanými klávesami → snímky, mapa
      pokrytí, dumpy RAM)
- [x] ★ **Úvodní obrazovky originálu z běhu**: titulka s animovaným mořem
      → ukázka (podpalubí se střídají) → po klávese menu `1 KEYBOARD`,
      `2 INTERFACE 2 JOYSTICK`, `3 CURSOR JOYSTICK`, `4 KEMPSTON JOYSTICK`,
      `5 DEFINE KEYS`, `0 START GAME`. **Dva hráči nejsou.** Výchozí klávesy
      `5` vlevo, `8` vpravo, `7` nahoru, `6` dolů, `A` vstup do místnosti
- [x] Geometrie obrazovky a panelu **na třech podpalubích** →
      `sources/docs/screen_layout.md`: ★ hrací plocha řádky 0–22 přes celou
      šířku, pět palub (řádky 1, 6, 11, 16, 21), čtyři patra po 32 px;
      panel řádek 23 (`$06`); **texty ROM fontem**
- [x] HW detaily ZX **48K** → `sources/docs/hw_notes.md`: ★ IM 2 na `$F4`,
      obsluha volá ROM `$0038`, kreslení přes ROM `RST $10` (texty `CHARS`
      `$3C00`, kulisa vlastní sadou na `$934C`), klávesnice ROM `KEY-SCAN`,
      Kempston `IN A,($1F)`, beeper `OUT (C)`, mapa paměti hry
- [x] **Kadence** (`ZADANI.md` §9, otázka 4) — ★ hlavní smyčka `$DF13`
      **na snímek nečeká**: pevné zpoždění `$E9D9` (≈ 52 000 T) + proměnná
      práce. Průchod **0,9–3,85 snímku**, průměr ≈ 1,9 se spornou pamětí;
      časové události hry se řídí `FRAMES`. `tools/tracecadence.py --cmio`,
      `disasm_notes.md` §4, §9
- [x] **Náhoda** — ★ jediný generátor `$E349`, stav `$F343`, bez R registru
      a bez ROM, perioda 65 536; po nahrání `$0000`, mezi hrami se
      nenuluje. Semínko remaku = počáteční `$F343` (`disasm_notes.md` §5)
- [x] **Návod z obou inlayí** doslovně → `sources/docs/instructions_transcript.md`,
      skeny se SHA-256 v `sources/media/inlay/`. Cíl (20 podpalubí, kořist
      se sbírá sama), bronzový / stříbrný / zlatý klíč na 45 s, výčet smrtí,
      číslované kajuty a klíče, ENTER HOLD před dveřmi, `M` = hudba
- [x] **Sekundární podklady** → `sources/docs/secondary_findings.md`
      s konflikty (⚠ „150 holds" na obalu Silver 199, ⚠ konec hry,
      ⚠ cena), recenze (CRASH 93 % Smash …), **POKE s ověřenými původními
      bajty** – ★ životy `$5BF1` (`DEC A` na `$E3B6`), skrytá hra za
      `JP $D08A` na `$CE3E`; surové texty v `sources/docs/raw/`
- [x] **Disassembly programu** → `sources/asm/` (SkoolKit `booty.ctl` +
      `booty.skool` + `booty.ref` + `Makefile`, `tools/mkasm.py`), pokrytí
      z běhu `coverage.map` (2307 adres hry). 103 bloků kódu, doložené
      rutiny popsané. ★ **Nález: zbytek autorova zdrojového textu** na
      `$A06C`/`$A239` – tabulky podpalubí 5–8 leží bajt po bajtu na
      `$B5BD`–`$B742` a autorova jména `MRI`/`MLE`/`MUP`/`MDO`/`PUTSQ` jsou
      přiřazená k adresám (`sources/docs/source_remnant.md`). **Úplná
      disassembly zůstává otevřená** a poroste s milníky
- [x] `sources/SHA256SUMS` přes celý adresář (2026-10-06; obnovit s každým novým podkladem)

**Akceptace M0:** `matchimage.py` a `matchloading.py` — **0 rozdílů**;
`tape_layout.md`, `screen_layout.md`, `hw_notes.md`, kadence a náhoda s ★,
přepis instrukcí a rozbor sekundárních podkladů.

| nástroj | výsledek |
|---|---|
| `tools/matchimage.py` | **38 726 kontrol, 0 rozdílů** — obraz paměti z kazety proti simulátoru |
| `tools/matchloading.py` | **105 216 kontrol, 0 rozdílů** — SCREEN$ z kazety, `.scr` a obrazovka simulátoru po pixelech |

**M0 uzavřena 2026-10-06.** Kazeta rozebraná a doložená ze dvou stran
(simulátor, nezávislé dumpy), kadence a náhoda změřené, návod přepsaný,
podklady z druhé ruky sebrané. **Disassembly zůstává otevřená** jako
u Sabre Wulfa a Atic Ataku – poroste s milníky, `booty.ctl` je její
pracovní podoba.

## M1 – Kostra aplikace na svision (**hotovo**, 2026-10-06)

Výstup: **spustitelná aplikace se statickou herní obrazovkou**.

- [x] `app/` podle vzoru **aticatac** / **lunarjetman** / **jetpac**:
      `main.js` (beze změny, R-002), `gameApp.js`, `appPlatform.js`
      (`new ZXSpectrumPlatform()`), `version.js`, `menuModel.js`,
      `tapeLoadingModel.js`, `gameOverModel.js`, `gameModel.js`,
      `gameAreaEntity.js`, `borderEntity.js`, `pauseGameEntity.js`,
      `aboutModel.js`, `hallOfFameModel.js` (od 2026-10-10 jeden
      `subMenuModel.js` i s PLAYER NAME, SOUNDS, MUSIC a SETTINGS), `audioManager.js`,
      `gameWorker.js`, `WORKER-PROTOCOL.md`, symlink `app/svision`.
      `screenLayout.js` a `screenComposer.js` **bez DOM** (R-001) – všechny
      moduly se načtou v Node přes `nodeEnv.mjs`
- [x] Serverová část: `index.php` (prefix `bt`), `aboutPage.php`,
      `config/` (compile.json, config.php.sample, createDB.sql, infoDB.sql,
      nginx.conf), `db/`, `data/`, `images/` (jen README, ikony jsou M7),
      `package.json`. Tabulky `rg_bt_`, databáze `booty`
- [x] `ZXSpectrumPlatform` 256×192 + border, atributová mřížka 32×24;
      ★ hrací plocha řádky 0–22 přes celou šířku, panel řádek 23
      (`app/screenLayout.js` podle `sources/docs/screen_layout.md`)
- [x] **Statická herní obrazovka ze skutečných pixelů originálu**:
      `tools/mkhold.py` → `data/screen.json`, hrací plocha většinovým hlasem
      přes **431 vzorků** (snímky 360–1650, před první časovou událostí
      `$E12A`), panel z jednoho snímku – ★ za celé vzorkování **jediná
      podoba panelu**. Piráti a papoušek z hlasování vypadli, Jim stojí
      a zůstal. Je to **fotka, ne zdroj** – zmizí v M2, zapsáno v
      `ZADANI.md` §10
- [x] ★ Větev A: `data/global.json#loading` (`tools/mkscreen.py`) a LOAD TAPE
      s obrázkem nahrávaným bajt po bajtu – **všech osm bloků v pořadí
      kazety, oba turbo bloky s krátkým pilotem** (497 pulzů) a skutečnými
      bajty (`tools/mktape.py` → `data/global.json#tape`). Zvuk bloku je nová
      `ZXMachineSounds.tapeBlock` ve svision (blok ve vlastním časování,
      události na konci pilotu, po bajtu a na konci bloku; `checkzx` 133 / 0).
      ★ **Nápisy ověřené snímky z nahrávání** (`tools/traceloading.py`):
      `Program: BOOTY` na řádku 1 viditelně (`$38`); po prvním turbo bloku
      `CLEAR` zčerná obrazovku i border; `Bytes: bs` (řádek 1) a `Bytes: bc`
      (řádek 20) jdou **černě na černou**; a **bitmapa obrázku se nahrává
      neviditelně** (všechny buňky `$00`, jen řádky 22–23 `$07`), obrázek
      ukážou až atributy na konci bloku
- [x] Menu: `START GAME`, `PLAYER NAME`, `HALL OF FAME`, `SOUNDS`, `MUSIC` (od M6),
      `SETTINGS`, `LOAD TAPE`, `ABOUT GAME`. ★ **Dva hráči se nenabízejí**.
      ★ Menu sedí na **hlavičce menu originálu** (řádky 0–7 z běhu,
      `BOOTY` / `BY JOHN F. CAIN.` / `© 1984 JOHN F. CAIN.` černě na azurové
      `$28`), položky jsou tam, kde má originál svoje (řádek 8, 10 …,
      sloupec 7, `$07`, ROM font, pruh výběru přes jednu znakovou řádku).
      **Rozhodnuto: titulka a ukázka originálu se v M1 neukazují** – moře
      na titulce kreslí program a ukázka hraje hru, obojí potřebuje M2–M5;
      statická kopie pohyblivého obrázku by nebyla obrázek originálu
      (titulka s mořem i ukázka jsou od M6 v `MainModel`)
- [x] Ovládání přes `inputEventsManager`: klávesnice (remap v SETTINGS,
      jen nastavené klávesy platí; ★ pět akcí originálu LEFT, RIGHT, UP,
      DOWN, ENTER ROOM + `M` zvuk jako v originálu; pauza je `Escape` /
      křížek, klávesu pauzy remake od 2026-10-09 nemá), gamepad
      **a touch**: jedna polovina páčka (oběma osami, ale jedním směrem
      naráz – originál čte klávesy přes ROM `KEY-SCAN`, který vrací jednu),
      druhá **ENTER ROOM** (★ skok originál nemá). Okraj s dotykovými
      polovinami podle jetpacu (`newBorderEntity`)
- [x] Worker tiká na **50,08 Hz** rekurzivním `setTimeout` (R-046; od
      2026-10-07 bez akumulátoru, pokus operátora) a počítá snímky (`FRAMES`), model kreslí na jeho zprávu
      (R-037, `needDraw`), FPS ve tvaru `nakresleno/zpráv/tiků` **v rámečku**
      (R-045 bod 5). Worker **nikým nehýbe** – pohyb je M3.
      `runworker.mjs` při tom našel a opravil ztracený první tik po startu
      a po `continue`
- [x] **Seed a dosaditelný zdroj náhody v `init` workeru**: ★ generátor
      originálu `$E349` přenesený instrukci po instrukci, **semínko =
      počáteční stav `$F343`**, výchozí `$0000` jako po nahrání a mezi hrami
      se nenuluje (model ho přenáší do další hry). Šev pro nástroje je
      `randSource`. `tools/matchrand.mjs` – **celá perioda proti Z80 kódu**
- [x] Font: ★ **ROM** — panel, menu i `DEFINE KEYS` se bajt po bajtu
      shodují se znaky z `$3D00` (`sources/docs/screen_layout.md`)
- [ ] Zapojení do `svtool regress --all` – **regres ve svision ještě není**
      (R-008 otevřené); worker je na něj připravený (headless tik, `rand`
      ve zprávě pro otisk)
- [ ] `svtool build bundle` + `svtool verify` — **dělá člověk ručně**
- [ ] Ikony, favicon, `images/` (M7). Favicon sourozence se **nekopíroval**
- [x] **Vyzkoušeno v prohlížeči** operátorem (2026-10-06)

**Akceptace M1: splněno 2026-10-06.**

| nástroj | výsledek |
|---|---|
| `tools/matchscreen.mjs` | **9216 kontrol, 0 rozdílů** — herní obrazovka (6144 B bitmapy + 768 B atributů) a hlavička menu (2048 + 256) složené `app/screenComposer.js` proti videopaměti originálu |
| `tools/runworker.mjs` | **29 kontrol, 0 chyb** — celý protokol workeru bez prohlížeče, i hodiny s podstrčeným časem (50 tiků/s, jediný časovač, pauza, výpadek karty) |
| `tools/matchrand.mjs` | **196 608 kontrol, 0 rozdílů** — generátor workeru proti `$E349` v simulátoru Z80, celá perioda |
| `tools/matchloading.py` | **112 128 kontrol, 0 rozdílů** — loading screen z kazety, z `.scr`, z `data/global.json#loading` a z obrazovky simulátoru |

★ **Co ta nula u `matchscreen.mjs` dokazuje a co ne.** Dokazuje, že cesta
originál → `data/screen.json` → `ScreenComposer` → videopaměť **nic neztratí
ani nepřidá**. **Nedokazuje**, že remake umí nakreslit podpalubí — to se
zatím skládá ze zachyceného obrazu. Až M2 najde formát, nástroj i jeho
referenční snímky zůstanou a nula se nesmí pokazit. Nástroj umí rozdíl
najít: proti snímku `hold_a_start.scr` (hýbou se v něm nepřátelé) hlásí 126
rozdílů.

### Co M1 změřil navíc

- ★ **Zavaděč je scénář pro LOAD TAPE** a co je kdy vidět, je změřené
  snímek po snímku (`tools/traceloading.py`), viz výš a
  `sources/docs/tape_layout.md`
- ★ **V loading screenu je schovaný text** `Program: bop` a `FIREFLY` na
  řádku 19 s atributem `$00` – je přímo v bloku `bs`, ROM fontem, a není
  vidět. ? Odkud se tam vzal, nevíme (`sources/docs/screen_layout.md`)
- ★ **Hra je na obrazovce ≈ 15 snímků po `0`** v menu, panel celý po ≈ 30
- ★ Hlavička menu se za 69 snímků nezmění; položky menu originálu jsou
  `$07` na řádcích 8–18 sloupec 7, nadpisy `$28`

## M2 – Extrakce dat z originálu (**hotovo**, 2026-10-06)

Největší milník projektu. Výstup: `data/global.json#holds`, `data/global.json#sprites`,
`data/global.json#panel`, `data/global.json#texts`, `data/global.json#global`. Vlastní font hra
pro texty nemá (★ ROM, M0), takže `font.json` nevznikl; glyfy kulisy jsou
v `global.json#holds`.

- [x] **Jak je popsané podpalubí** → `sources/docs/holds.md`: ★ **21
      podpalubí** po 11 tabulkách (jména autorova), sestupně od `$ABD6`,
      souřadnice v soustavě ROM `CL-SET`; kreslí `$A900` přes ROM a vlastní
      tisk glyfu, souběžně mapa znaků `$A1C4` a mapa atributů `$A4E4`.
      `tools/dumpholds.py` → `data/global.json#holds`, `app/holdRenderer.js`
- [x] **Graf podpalubí** z `EODAT` (4. bajt = cíl, `$EE5B`): 56 hran
      obousměrných; ★ 10→21 jsou **dveře do moře** (utonutí), ? 21→1,
      9→18, 3→17 jednosměrné. ★ **Číslované dveře
      a jejich klíč leží v tomtéž podpalubí** (záznam `SDDAT`)
- [x] **Kořist**: ★ 129 záznamů `TDAT`, panel od **125** natvrdo (`$DEC3`);
      kód předměty nerozlišuje, takže 4 zůstanou navíc (? záměr). ★
      **Nastražená kořist se losuje**: při každém sebrání `$E349` < `$40`
      (25 %) → výbuch (`$E3C2`). Při 50 zbývajících si hra zapamatuje místo,
      při nule vypíše `FIND THE GOLD KEY …` (M4)
- [x] **Sprity a bloky** → `sources/docs/sprites.md`: ★ sprite `$EED7`
      (předsunutí do bufferu, jemný svislý posun přes `CHARS`) a blok
      `$EA93` (i s posunem číslování u pravého okraje; ★ obrácená podmínka
      u levého okraje je chyba originálu, do které hra nevkročí). Všech
      osm sad v `data/global.json#sprites`: **Jim**, **piráti** (`OPST`), **tvor
      z časovače** `$E12A` (4 × 1 po palubě – ? krysa; 2 × 2 výš – ?
      papoušek), **plošiny** (`LIDAT`), **okénka** (`PHDAT`), **výbuch**,
      **úlomky** a **padací dveře / místo po kořisti** (`TDDAT`)
- [x] Tabulky `OPST`, `LIDAT`, `TDDAT`, `PHDAT` popsané tak, jak je kód
      čte (`holds.md`); ? zbylé bajty (+10, +12 objektu) a co přesně
      dělají v pohybu je M3–M5
- [x] **Panel** → `data/global.json#panel` z operandů kódu, `app/panelRenderer.js`,
      i text o zlatém klíči; ★ papír panelu = border podpalubí
- [x] **Texty** → `sources/docs/texts.md`, `data/global.json#texts`: proudy pro ROM
      tisk (menu, `DEFINE KEYS`, `PRESS FIRE BUTTON`, úvod skryté hry).
      ★ `BUT DONT RUN OUT OF AIR` je ze **skryté hry `CATCH 20 GOLDFISH`**,
      ne z bonusového kola. Tisk ROM je ve svision (`ZXRomPrint`,
      `checkzx` 145 / 0)
- [x] **`data/screen.json` (fotka z M1) zrušen**: herní obrazovka se skládá
      z dat (podpalubí, panel, Jim v poloze z běhu originálu –
      `data/global.json#global`) a hlavička menu se tiskne z proudu originálu.
      **Nula `matchscreen.mjs` se nepokazila**
- [x] `matchholds.mjs`, `matchsprites.mjs`, `matchpanel.mjs` — **0 rozdílů**

**Akceptace M2: splněno 2026-10-06.**

| nástroj | výsledek |
|---|---|
| `tools/matchholds.mjs` | **161 973 kontrol, 0 rozdílů** — 21 podpalubí × (obraz 6912 + mapa znaků 800 + border) proti `$A900` originálu |
| `tools/matchsprites.mjs` | **23 611 392 kontrol, 0 rozdílů** — 3416 případů: osm sad, 16 jemných poloh, oba okraje, proti `$EED7` a `$EA93` originálu |
| `tools/matchpanel.mjs` | **870 912 kontrol, 0 rozdílů** — 21 podpalubí × 6 stavů (životy, kořist, nula s textem o zlatém klíči, klíče) proti `$E0A9` a hlavní smyčce |
| `tools/matchscreen.mjs` | **16 128 kontrol, 0 rozdílů** — herní obrazovka **z dat**, hlavička menu a **celé menu originálu z proudů** |
| `tools/runworker.mjs` | **33 kontrol, 0 chyb** |

### Co M2 změřil navíc

- ★ Zbytek autorova zdrojáku končí na `$A803`, ne `$A91D`: přežil
  v **pracovních bufferech** (mapa znaků a atributů `$A1C4`–`$A803`)
- ★ Jim na začátku hry **o řádek spadne** (šablona B = 22 → B = 21);
  potvrzeno i pozorováním operátora – pád je M3
- ★ Panel má papír podle borderu podpalubí
- ★ Smrt `$E3A4`: životy − 1, při −1 konec hry, jinak nový začátek
  `$DEC9`; `$E361` je **utonutí** (atributy `$29` odspodu) – spustí ho
  ENTER ROOM u dveří s cílem 21, tedy **dveře z podpalubí 10 do moře**
- ★ Průchodem dveřmi se **ztratí nesený klíč** (`$F241` ← 0)
- ★ Pirát a úlomek výbuchu zabíjejí dotykem (`$F0D8`, `$E458`), tvor
  z časovače taky (`$E2FE`)

## M3 – Pohyb Jima a kolize (**hotovo**, 2026-10-06)

Výstup: **hlavní smyčka originálu přepsaná do JS nad pamětí rozloženou jako
u originálu** (`app/bootyLogic.js`), ve workeru, ověřená průchod po průchodu
→ `sources/docs/physics.md`. Rozhodovalo se pixely na obrazovce (stání,
plošiny) a mapou znaků (piráti), takže přepis kreslí do téže paměti jako
originál a porovnává se celá.

- [x] **Chůze**: ★ 2 px za průchod, snímky vpravo `$20`–`$4A`, vlevo
      `$50`–`$7A`; okraje C = `$22` a 3
- [x] **Skok**: ★ **není** – ani klávesa (`DEFINE KEYS`), ani v kódu
- [x] **Žebříky**: ★ nahoru jen od spodu, dolů jen shora, 2 px za průchod,
      ze žebříku jen nahoře a dole na buňce
- [x] **Pád**: ★ 2 px za průchod; **8 průchodů pádu za sebou (16 px) =
      smrt po dopadu** (`$ED19`, `$EC49`); propadnutí pod spodní palubu
      (B = 4) = smrt hned
- [x] **Kolize**: ★ stání = spodní řádek spritu AND obrazovka pod nohama;
      zavřené číslované dveře zastaví, s jejich klíčem se otevřou; plošiny
      vezou Jima podle pixelů; piráti, úlomky a tvor zabíjejí dotykem
- [x] **Přechod podpalubí**: ★ ENTER ROOM u velkých dveří, **Jim se objeví
      na tomtéž místě**, nesený klíč se ztratí; dveře s cílem 21 = moře
- [x] Navíc přepsané a ověřené celé: piráti, tvor z časovače, plošiny,
      padací dveře, okénka, kořist a výbuchy, klíče, smrt a restart, konec
      hry, odpočet zlatého klíče a nové kolo (pravidla M4 a nepřátelé M5
      jsou tím **ve kódu** – M4/M5 je zdokumentují a doladí remake okolo)
- [x] `tools/tracephysics.py` + `tools/matchphysics.mjs` — **0 rozdílů na
      296 155 průchodech** (90 záznamů: všech 20 podpalubí, náhodné
      i cílené hraní)
- [x] **Tempo**: ★ změřené (`tools/measurecadence.py`): 1,632 snímku na
      průchod bez melodie, 2,175 s melodií (2026-10-17, 360 564 průchodů) (noty v přerušení berou čas),
      1,5–3,4 podle podpalubí. **Rozhodnuto (operátor 2026-10-06): remake
      tempo nesimuluje** – průchod konstantně 30,69× za sekundu, zvuk ve
      vlastním vlákně
- [x] Worker: paměť z `data/global.json#memory` (jen data, `tools/mkmemory.py`),
      ROM font ze svision, `KEY-SCAN` napodobený, `FRAMES` z tiků, obraz
      do modelu po každém průchodu; `tools/matchstart.mjs` (start z dat
      = start originálu) a `tools/runworker.mjs`

**Akceptace M3: splněno 2026-10-06.**

| nástroj | výsledek |
|---|---|
| `tools/matchphysics.mjs` | **296 155 průchodů, 4 014 677 180 kontrol, 0 rozdílů** — po každém průchodu obrazovka, proměnné hry, tisk ROM, buffery, pracovní kopie podpalubí, objekty |
| `tools/matchstart.mjs` | **263 319 430 kontrol, 0 rozdílů** — nová hra z `data/global.json#memory` = originál na začátku, a 8 záznamů z ní |
| `tools/runworker.mjs` | **35 kontrol, 0 chyb** — první obrazovka workeru = obrazovka originálu, tempo, klávesy, semínko, přechod dveřmi, hodiny |
| `tools/matchtransition.mjs` | **197 snímků, 0 rozdílů** — přechod dveřmi snímek po snímku jako originál bez melodie (nejvýš 0,045 snímku vedle) |
| `tools/physicscoverage.py` | pokrytí: 20 podpalubí, 180 přechodů, 39 smrtí, 2 konce hry, 111 klíčů, 12 dveří, 55 kořistí, 6 výbuchů, 12 tvorů, 17 smrtelných pádů, plošiny, zlatý klíč, moře |

### Co M3 změřil navíc

- ★ **S melodií je originál o třetinu pomalejší** – noty hraje obsluha
  přerušení na beeperu a čas bere hlavní smyčce
- ★ Klávesy se čtou **až po pohybu Jima** (průchod se řídí klávesou
  z předchozího)
- ★ Nesený klíč se ztratí průchodem dveřmi; sebráním jiného se starý
  vrátí na své místo
- ★ Herní data, která remake potřebuje, je **12 688 B** (`data/global.json#memory`)

## M4 – Pravidla lodi (**hotovo**, 2026-10-07)

Výstup: `sources/docs/rules.md` – pravidla odečtená z kódu (byla v přepisu
už od M3) a **doložená celými partiemi originálu přehranými proti
workeru**. Partie jsou dvě nahrávky RZX z RZX Archive, ve kterých člověk
(Mousey) sebere všechnu kořist a najde zlatý klíč – jednou a dvakrát.

- [x] **Kořist**: ★ sbírá se sama (Jimovo B − 1 = B, C týž nebo o 1
      menší), `BOOTY` + 1, `TREASURE` − 1; **125** k sebrání ze 129
      záznamů. **Konec po posbírání není**: odpočet zlatého klíče
      (45 × 20 průchodů), nalezení = **další kolo** (všechna podpalubí
      znovu z tabulek, životy a `BOOTY` zůstávají), a tak dokola. Bronzový
      a stříbrný klíč ani zrychlení kód nezná
- [x] **Klíče**: ★ nejvýš jeden; sebráním jiného se starý vrátí na místo;
      průchodem dveřmi a smrtí se ztratí a při dalším vstupu do podpalubí
      je zpátky
- [x] **Dveře**: ★ otevře je jen klíč s jejich číslem a spotřebuje se;
      **nezavírají se** (do dalšího kola). Padací dveře (`TDDAT`) se
      střídají podle časů v průchodech (tabulka v `rules.md`)
- [x] **Nastražená kořist**: ★ **losovaná** při každém sebrání (25 %,
      když nic nevybuchuje), počítá se i tak; zabíjejí úlomky
- [x] **Životy**: ★ 3 na panelu, hraje se i s nulou (4 pokusy), **bonusový
      život není**; smrt → podpalubí 1, stav lodi zůstává; konec času
      zlatého klíče = konec hry
- [x] **Bodování**: ★ originál **body nepočítá** a síň slávy nemá; remake
      řadí síň slávy podle `BOOTY` (sebraná kořist přes všechna kola)
- [x] `tools/tracerules.py` (RZX → záznam bez zásahu do kódu) +
      `tools/matchrules.mjs` (worker, jak běží v prohlížeči) – **0 rozdílů**

**Akceptace M4: splněno 2026-10-07.**

| nástroj | výsledek |
|---|---|
| `tools/matchrules.mjs` | **204 043 průchodů, 2 766 278 726 kontrol, 0 rozdílů** — worker od nové hry: `gold1` (62 363, zlatý klíč a nové kolo), `gold2` (121 527, dvakrát zlatý klíč), `lastlife` (15 513, čtyři smrti a konec hry), `walk`, `gameover`; po každém průchodu celá paměť, konec hry a zpráva `frame` |
| `tools/matchphysics.mjs --base build/rules` | **183 890 průchodů, 2 492 812 840 kontrol, 0 rozdílů** — tytéž partie samotným přepisem |
| `tools/matchphysics.mjs` | **311 668 průchodů, 4 224 971 408 kontrol, 0 rozdílů** (s novým `lastlife`) |
| `tools/runworker.mjs` | **35 kontrol, 0 chyb** |

### Co M4 změřil navíc

- ★ Prodleva ENTER ROOM remaku (§10) by v partiích **nezasáhla ani
  jednou** – člověk po průchodu dveřmi klávesu vstupu nedrží
- ★ Odpočet zlatého klíče je v průchodech: v originálu s melodií ≈ 38 s,
  bez ní ≈ 29 s, v remaku (tik 30 ms) ≈ 44 s
- ★ Časovač tvorů porovnává jen dolní bajt `BOOTY`, takže v dalších kolech
  se rychlé a pomalé období střídají po 256 kusech
- Oprava workeru: když přechod dveřmi skončil v tiku, ve kterém proběhl
  další průchod, poslal model poslední snímek přechodu místo obrazovky po
  průchodu – jeden průchod nebylo vidět (našel `matchrules.mjs`)
- ~~? Otevřené pro operátora: **skrytá hra** `CATCH 20 GOLDFISH`~~ –
  rozhodnuto 2026-10-08: pozadí menu (M6). Režim `$5BF0` = 2 (pokračování
  po ukázce, `rules.md`) – jen s rozhodnutím

## M5 – Nepřátelé (**hotovo**, 2026-10-07)

Výstup: `sources/docs/enemies.md` – nepřátelé a všechno, co se v podpalubí
hýbe, odečtené z kódu (v přepisu od M3) a **ověřené na datech originálu**:
dráhy, tempo, snímky, otáčení a kolizní obálky bez jediné výjimky.

- [x] **Druhy**: ★ piráti (`OPST`, 0–3 v podpalubí, pevně z tabulek), tvor
      z časovače (`$F31C`, nejvýš 1: ? krysa 4 × 1 po palubě, ? papoušek
      2 × 2 ve výšce hlavy), úlomky výbuchu nastražené kořisti (5); a co
      nezabíjí: plošiny (`LIDAT`, 0–4), okénka (`PHDAT`, 0–6), výbuch sám
- [x] **Dráhy a rychlosti**: ★ pirát tam a zpátky po palubě mezi
      zarážkami (okraj, zavřené dveře, konec paluby v mapě znaků), 2 px
      každý druhý průchod; tvor rovně přes obrazovku, 2 px každý průchod;
      plošiny mezi dvěma mezemi, 2 px každý druhý průchod **střídavě
      s piráty** (`$F334`); úlomky o buňku za průchod, tři průchody
- [x] **Animace**: ★ pirát 7 snímků vpravo, 8 vlevo (+ 6 za krok); krysa
      jeden snímek, papoušek 4; výbuch 7 snímků po dvou průchodech;
      okénka 8 snímků po čtyřech průchodech
- [x] **Spouštění**: ★ piráti jsou v podpalubí pořád (poloha se ukládá
      s podpalubím); tvor každých 1400 snímků (850 při kořisti ≥ 100) na
      losovanou palubu B = 3, 8, 13, 18 – **ne tam, kde stojí zavřené
      číslované dveře** (v podpalubích 1–5, 7, 8, 10, 15, 19 tedy nikdy,
      dokud se neotevřou), krysa jen na palubu přes celou obrazovku;
      úlomky po výbuchu
- [x] **Reakce na Jima**: ★ **žádná** – každou otočku piráta v záznamech
      vysvětlí okraj, dveře nebo mapa znaků; jen otevřené dveře mu
      prodlouží úsek
- [x] **Kolizní obálky**: ★ v souřadnicích originálu (jemné polohy
      vodorovně, řádky svisle): pirát d4 ∈ ⟨−7, 8⟩, dB ∈ ⟨−2, 3⟩; krysa
      ⟨−15, 8⟩ × ⟨0, 3⟩; papoušek ⟨−7, 8⟩ × ⟨−1, 3⟩; úlomek v horních
      dvou řádcích Jima. Nesouměrné – zleva zabije i dotek bez překryvu
- [x] `tools/matchentities.mjs` — celá tabulka entit po každém průchodu,
      **0 rozdílů**

**Akceptace M5: splněno 2026-10-07.**

| nástroj | výsledek |
|---|---|
| `tools/matchentities.mjs` | **611 302 průchodů, 216 988 343 kontrol, 0 rozdílů** (2026-10-17) — `build/trace` (113 záznamů) i `build/rules` (obě partie z RZX): tabulka entit remaku = originálu po každém průchodu (každý bajt piráta, tvora, plošiny, okénka, výbuchu, úlomků a Jima, a jejich obraz na obrazovce); na datech originálu 395 007 kroků (a 3 149 otevřenými dveřmi) a 12 985 otoček pirátů, 17 917 kroků tvora, 282 843 kroků a 6 100 otoček plošin podle pravidel; 426 145 testů dotyku na správné straně obálky |
| `tools/matchphysics.mjs` | **425 540 průchodů, 5 768 620 240 kontrol, 0 rozdílů** (s 19 novými záznamy `creature*`, `ladder*`) |
| `tools/matchrules.mjs` | **204 043 průchodů, 0 rozdílů** |
| `tools/runworker.mjs` | **35 kontrol, 0 chyb** |

### Co M5 změřil navíc

- ★ Tvor náhodné hraní skoro nepotká: na palubě se zavřenými dveřmi se
  neobjeví a ve většině podpalubí jsou dveře na každé dolní palubě.
  Smrti tvorem (11) a pirátem zespodu dodaly cílené záznamy
  `tracephysics.py` `creature*` (Jim čeká na palubě, kam tvor smí)
  a `ladder*` (Jim leze pod pirátem; dveře otevřené příznakem `SDDAT`)
- ★ Časovač tvora běží **ve snímcích** (`FRAMES`), ne v průchodech – je
  v reálném čase i v remaku, kde tempo průchodů je jiné (§10)
- ★ Test dotyku je před pohybem Jima a bez jeho svislé jemné polohy
- ? Z druhé ruky vyvrácené: papoušek nelétá jen po „druhé palubě“
  a plošiny nemají různé rychlosti (`enemies.md`)

## M6 – Zvuk (**rozpracováno**: zvuk originálu hraje, `matchsound` 122 448 / 0, menu hlasitostí hotové; otevřené jsou odchylky níž)

### Nutné předkroky (před vlastním převodem zvuku)

- [x] **Víc sběrnic místo jedné `sounds`** (hotovo 2026-10-07: `music`,
      `sounds` + `extra`, `animals` v `app/audioManager.js`; hlasitosti
      dvě – `music` a `sounds`, kterou berou i `extra` a `animals`
      (rozhodnuto 2026-10-07); `M` ztiší `music`, `S` efekty i tvory, pauza má SOUNDS
      i MUSIC; zatím nic nehrají, rutiny jsou převod zvuku níž) –
      ★ originál hraje melodii a efekty naráz (melodie z `$FA00` + čtyři sloty v IM 2), takže
      R-024 „jedna sběrnice“ tu neplatí. Sběrnice podle `manicminer`
      (`music` + `sounds`) a navíc vlastní pro **tvory** (krysy a další
      nepřátelé, jejich zvuky běží souvisle, dokud jsou v podpalubí);
      předloha pro víc herních sběrnic je `battlezone` (`engine`,
      `missile`). Rozdělení:
      - `music` – melodie `$FA00` (v menu jako ukázka hlasitosti)
      - `sounds` – jednorázové efekty: výbuch, otevření dveří, sebrání
        klíče a kořisti, smrt a podobně
      - `animals` – krysy, ptáci a další tvorové (ne `extra`: to už
        sourozenci i `audioManager.js` mají jako vedlejší sběrnici efektů
        s hlasitostí `sounds`); který slot originálu komu patří, se zjistí
        z rutin v M5/M6, ne podle sluchu
- [x] Rozdělení na sběrnice je zásah remaku: v originálu jde všechno
      přes jeden bit `$FE`. ★ Řešeno tak, že `matchsound.mjs` měří **každou
      cestu obsluhy přerušení zvlášť** (= každý slot, každou notu) hranu po
      hraně a melodii na titulce obsluhu po obsluze; které sloty v jakém
      pořadí obsluha zahraje, drží worker (`interrupt`) pravidlem originálu.
      Součet na jednom portu během hry se neměří – sběrnice ho rozdělují
      záměrně
- [x] **Menu `SOUNDS` + `MUSIC`** (hotovo 2026-10-07; tvorové a výbuch jdou
      s `SOUNDS`) přes `ZXVolumeEntity` jako `manicminer/app/menuModel.js`,
      cookies `audioBusSoundsLevel` a `audioBusMusicLevel`. Ukázka u SOUNDS
      je ★ výbuch nastražené kořisti – zkrácené doutnání (`$FFFD` = 1,
      48 přerušení) a samotný výbuch (`$FFFD` = 2, 16 přerušení), u MUSIC
      ★ melodie hry celá jednou, do konce tabulky, bez opakování
      (`tuneExample`, 12,78 s). MUSIC je
      osmá položka, na řádku 22 nad verzí
- [x] **Rozhodnuto (2026-10-07): vypnutí hudby na tempo nesahá.** ★ V originálu
      `M` vypne melodii a smyčka zrychlí (odpočet zlatého klíče ≈ 38 s
      s melodií, ≈ 29 s bez, M4). Remake má tempo konstantní a `M` ani
      hlasitost `music` = 0 ho nemění – jen ztiší sběrnici
- [x] **`MainModel`** (hotovo 2026-10-07, `app/mainModel.js`,
      `app/titleSea.js`, `data/global.json#title`; `tools/matchtitle.mjs`
      **1 776 641 kontrol / 0** – moře průchod po průchodu, s melodií
      i bez; tempo 6,92 snímku na průchod bez melodie; melodie se pustí,
      až bude převedená) podle `manicminer/app/mainModel.js`: úvodní obrázek
      originálu s **animovaným mořem** (titulka `title.scr`, kopie na
      `$6978`, `screen_layout.md`), pod kterým **už hraje melodie hry**;
      po stisku libovolné klávesy, kliku, dotyku nebo tlačítka gamepadu se
      spustí hra a **hudba hraje dál
      z `MainModel`**, nenavazuje se znovu. Menu `START GAME` → (R-024
      `needEventForAudio`) → `MainModel` → hra; menu dál zůstává němé.
      Animace moře se bere z kódu originálu (★), ne nakreslená – tím padá
      výhrada M1 „titulka se neukazuje“. Ukázka (demo) je samostatně až po M5
- [x] **Ukázka** (hotovo 2026-10-08) jako v manicminer / jetsetwilly:
      ★ titulka originálu po 1024 přerušeních (`FRAMES` = `$0400`) skočí na
      `$D602` – nová hra v režimu `$5BF0` = 3, Jim stojí (`$EBD8` se
      nevolá); po 768 přerušeních losované podpalubí 2–17 (`$E349` AND 15
      + 2, `$EE84`), po dalších 768 konec (`$ED8F`) a zpátky na titulku;
      klávesa ukončí ukázku hned (`$ED35`). Remake: `MainModel` po
      `demoTStates` z `data/global.json#title` (20,45 s bez melodie, tempo remaku;
      s melodií 24,66 s) → `DemoModel` (`gameModel.js` s `demo`) → konec
      nebo libovolná klávesa, klik, dotyk, tlačítko gamepadu → `MainModel`;
      melodie hraje dál. `bootyLogic.js` `demoPass`/`demoOver`, záznamy
      `tracephysics.py` `demo` (1082 průchodů) a `demokey` (264) –
      `matchphysics` **426 886 průchodů / 0**

- [x] **Menu přes skrytou minihru** (2026-10-08, rozhodnutí operátora):
      ★ `CATCH 20 GOLDFISH` (`$CE41`, smyčka `$CF36`, jinak jen přes POKE)
      převedená nad pamětí (`app/goldfishLogic.js`, data
      `data/global.json#goldfish` z `tools/tracegoldfish.py` + `mkgoldfish.py`):
      lodě, písek, ryby, chobotnice, úhoři, velká ryba, bubliny přes ROM
      `PLOT` (`ZXRomDraw`, doplněk R-048). `tools/matchgoldfish.mjs`
      **2 × 3000 průchodů (bez kláves i s nimi), 47 574 000 kontrol / 0**
      (od 2026-10-09 i s řádky 22–23: FISH a počet `$CFA8` přes ROM
      OUT-NUM-1, ukazatel AIR `$D2F8`). `MenuModel`: prostý loop jako
      manicminer / jetsetwilly, tempo 6,15 snímku na průchod, **od
      2026-10-09 jen lodě a písek** (`diver: false`, `objects: false` – bez
      potápěče, bublin a ryb; automat `goldfishPilot.js` zrušen),
      border azurový, dole `BOOTY  © 1984 JOHN F. CAIN.`, položky jasně
      bílé přímo přes moře bez panelu (řádky 8–19, 12 px), verze 5×5 v písku;
      menu dál bez zvuku (R-024). ? Dialogy menu se doladí později
- [x] **SECRET SUB GAME** (2026-10-09, rozhodnutí operátora): skrytá
      minihra jako hra k hraní, položka menu pod `START GAME` (9 položek
      po 10 px). `app/subGameModel.js` (potomek `GameModel` – ovládání,
      pauza, dotyk, FPS zděděné) + `app/subGameWorker.js` (vlastní worker,
      `goldfishLogic.js` s `panel` a `input`, `BootyLogic.keyScan`), řádek 22
      originálu FISH / AIR, klávesy LEFT RIGHT UP DOWN ze SETTINGS na
      `$D579`, ROM BEEPER při dotyku ryby, melodie pod tím; 20 rybek → hra
      Booty (★ `$D08A`). ? Šum doplňování vzduchu `$D063` vynechaný

### Převod zvuku

- [x] Melodie s tabulkou not, nebo jen efekty? — ★ **melodie**: tabulka
      na `$FA00`, hraje se v přerušení každé čtvrté přerušení, souběžně se
      čtyřmi zvukovými sloty (`disasm_notes.md` §2). **Na R-024 to sahá**
- [x] `tracesound.py` + `matchsound.mjs` — **pulz po pulzu v T-stavech**:
      **55 236 kontrol / 0** (2026-10-07). 215 cest obsluhy `$FE69` (melodie
      na každé položce `$FA00` i `$FF`, `$FFFB`+`$FFFC`, `$FFFF` 1/2,
      `$FFFD` 1/2 se šumem i přes konec ROM, `$FFFE` 1–8, různé fáze
      `$FE88`): každý `OUT`, délka a změněná paměť; ROM `BEEPER` se třemi
      voláními hry; melodie na titulce 827 obsluh – stav, hrany a snímek
      další obsluhy (169 přerušení ztracených pod dlouhými notami)
- [x] ★ **Zvuk hraje** (`app/bootySound.js` → `app/audioManager.js`, data
      `data/global.json#sounds` z `tools/mksounds.py`, jako manicminer generuje
      pulzy ze svých rutin): melodie na `music` (titulka i hra, smyčka
      12,78 s), krysa a papoušek na `animals` (od zapnutí `$FFFF` do
      vypnutí), výbuch a úlomky na `extra`, jednorázové `$FFFE` 1–6, smrt
      a ROM `BEEPER` na `sounds` – **jeden po druhém** jako na stroji;
      melodie **čeká**, dokud zní tvor, výbuch nebo jednorázový zvuk
      (obsluha před `$F6DB` odejde). Worker na každém tiku dělá, co obsluha:
      pořadí slotů a jejich nulování (`gameWorker.js` `interrupt`);
      `matchrules` dál 0
- [x] Oprava 2026-10-08: **smrt** – originál po BEEPERu kreslí podpalubí
      znovu přes mnoho snímků a obsluha přerušení mezitím zahraje čekající
      `$FFFE` (pirát 2, tvor 1, úlomek 3) nebo `$FFFB`+`$FFFC`; sloty
      vynuluje `$E058` až na konci. Worker teď obsluhu pustí před
      vynulováním (`BootyLogic#silence`, `interruptHook`) a překreslení po
      smrti ukáže **stejný přechod jako dveře** (CL-LINE, černo, atributy;
      ? časy jsou dveří, po smrti neměřené). `matchrules`, `runworker`,
      `matchtransition` dál 0
- [x] **Utonutí** (2026-10-08): ★ dveře z podpalubí 10 do moře spustí
      `$E361` – voda zaplaví obrazovku odspodu (21 řádků atributů `$29`)
      a pod tím hraje šum z hlavní smyčky s délkami z generátoru `$E349`,
      4,47 s; hra mezitím stojí, potom smrt (BEEPER, překreslení).
      `bootySound.js` `drown` – `matchsound` **122 448 kontrol / 0** (4 stavy
      generátoru); worker ukáže stoupající vodu v reálném čase se zvukem
      (`BootyLogic.drowningScreen`), další průchod počká, pak přechod po
      smrti. ? Přerušení mezi kroky (noty melodie) v modelu nejsou
- [ ] ? Odchylky ke zvážení: během jednorázového zvuku a BEEPERu originál
      **stojí** (obsluha i BEEPER drží procesor, smrt tvorem skoro 1 s)
      a `FRAMES` neběží – worker remaku jde dál; souvislý zvuk začíná od
      svého začátku, ne ve fázi `$FE88`

## M7 – Dotažení a vydání (**rozpracováno**: příprava repozitáře)

- [x] **Data jedním souborem** (2026-10-17): `data/global.json` se sekcemi
      místo 13 souborů, **bez poznámek** (v datech jen to, co hra nebo
      nástroje čtou); nástroje zapisují svou sekci (`bootylib.write_section`,
      `jsonformat.mjs`), `db/appData.php` posílá sekce pod týmiž klíči.
      Zapisovače znovu puštěné dají bajt po bajtu tentýž soubor; všechny
      `match*` po převodu 0 rozdílů
- [x] **Tempo jako konstanta** `PASS_TSTATES` = 114 057 v `app/gameWorker.js`
      místo `data/cadence.json`; `tools/measurecadence.py` ji ověřuje
      (průměr 114 056,95 T, dokumentace dřív uváděla useknutých 114 056)
- [x] **Repozitář na GitHubu**: `README.md` pro člověka zvenku, `.gitignore`
      (`sources/`, `CLAUDE.md` a `.claude/` mimo git), `aboutPage.php`
      na hratelnou hru, verze `2026.10.17`; hra na `https://booty.remake.free`
- [ ] `matchtrail.mjs` — celá videopaměť po každém průchodu (vzor Jetpac),
      pokud originál kreslí přírůstkově
- [ ] Rozpočet snímku v T-stavech, až bude kadence změřená
- [ ] Barevná rovina (R-036) — rozhodnout, jestli ano
- [ ] Ikony, favicon, poster, cover — **z grafiky originálu** (M2), ne odjinud
- [ ] Výkon na telefonu, `svtool regress --all`, vydání
