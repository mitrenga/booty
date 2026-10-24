# Booty – remake (zadání)

Věrný remake hry **Booty** (Firebird Software, 1984, ZX Spectrum 48K,
★ autor John F. Cain — loading screen i menu, ? řada Firebird Silver) pro webový prohlížeč,
JavaScript, vlastní knihovna **svision**. Běží na `ZXPlatform`
s rozvržením `ZXLayout` (`zxLayout`) — stejná větev jako
sabrewulf / manicminer / jetsetwilly / jetpac / lunarjetman / aticatac, ne
arkádová `ArcadePlatform`.

**Vzory tohohle projektu jsou `manicminer` a `jetsetwilly` pro žánr
a `sabrewulf` / `aticatac` pro metodiku.** Booty je plošinovka s přepínáním
obrazovek, takže je žánrově nejblíž Jet Set Willymu (svět z místností,
žebříky, sbírání předmětů, životy), ale je to **jiná firma a jiný autor** —
nic se od Matthewa Smithe neopisuje. Disciplína je tatáž jako u sourozenců:
*nic se nedokresluje*. Co nejde vytáhnout z originálu, je otevřená otázka,
ne odhad. Rozvržení milníků, tvar `sources/`, pojmenování nástrojů (`dump*`
→ `trace*` → `match*`) i význam „hotovo" (= `match*` hlásí nulu rozdílů)
jsou převzaté beze změny.

Čím se Booty od sourozenců liší (všechno ?, dokud to nedoloží kazeta a kód):

- **Svět je loď.** ? Pirátská loď o **20 podpalubích** (holds), každé
  podpalubí je ? jedna obrazovka. Proti Jet Set Willymu (~60 místností) je
  svět menší, ale místnosti jsou **propojené dveřmi s čísly**, ne jen okraji
  obrazovky.
- **Klíče a dveře s čísly.** ? Hráč (plavčík Jim) nese ? **nejvýš jeden klíč**
  a ten otevře jen dveře se stejným číslem. Svět je tedy **hádanka s pořadím**,
  ne jen sběr — a to je vlastní měřená struktura (graf klíčů a dveří), kterou
  sourozenci nemají.
- **Pastě v kořisti.** ? Část předmětů je **nastražená** a vybuchne. Které,
  a jestli je to pevné nebo losované, je otázka M4 — rozhodne, **kde v remaku
  sedí PRNG**.
- **Firebird, ne Ultimate.** Zavaděč, ochrana a tvar kazety **se nedají
  předpokládat** z jetpac / lunarjetman / aticatac. Nic z jejich nálezů
  (`RRD`, `FRAMES`, ROM font, kadence) se sem nepřebírá bez měření.

Podklady patří do `sources/` (index v `sources/README.md`). Primární autority
pro pravidla: originální instrukce a inlay
(`sources/docs/instructions_transcript.md`) a **disassembly originálního
programu**. Všechno ostatní – wiki, dobové recenze, tipy, longplaye, mapy
z fanouškovských stránek – je zdroj z druhé ruky a slouží jako hypotéza,
kterou disassembly potvrdí nebo vyvrátí.

**Značky v tomhle dokumentu:**
★ = změřeno na běžícím originálu nebo odečteno z jeho kódu (autorita)
? = hypotéza z druhé ruky, **neověřená** – do kódu se nesmí dostat jako číslo

**Stav 2026-10-07: M5 je hotová.** Nepřátelé – piráti, tvor z časovače
(? krysa, ? papoušek), úlomky výbuchu – a co se v podpalubí hýbe dál
(plošiny, okénka) jsou odečtení z kódu a ověření **na datech originálu**:
dráhy, tempo, snímky, otáčení a kolizní obálky bez výjimky, tabulka entit
remaku = originálu po každém průchodu – `matchentities.mjs` **611 302
průchodů / 0 rozdílů** (`sources/docs/enemies.md`). Na Jima nereaguje
nikdo. Další je **M6** (zvuk).

**M4 je hotová (2026-10-07).** Pravidla lodi jsou odečtená z kódu
a doložená **celými partiemi originálu přehranými proti workeru**: dvě
nahrávky RZX, ve kterých člověk sebere všechnu kořist a najde zlatý klíč,
a hra až do konce – `matchrules.mjs` **204 043 průchodů / 0 rozdílů**
(`sources/docs/rules.md`). Originál body nepočítá; po zlatém klíči hra jde
dokola.

**M3 je hotová (2026-10-06).** Hlavní smyčka originálu je přepsaná do
JS nad pamětí rozloženou jako u originálu (`app/bootyLogic.js`) a ve workeru
hraje: `matchphysics.mjs` **296 155 průchodů / 0 rozdílů**, start z dat
`matchstart.mjs` 0 rozdílů. Pohyb, kolize, piráti, plošiny, kořist, klíče,
dveře, smrt i zlatý klíč jsou originálu (`sources/docs/physics.md`). Tempo je
konstantní (§10). Další je **M4**.

**M2 je hotová.** Podpalubí (21, `matchholds.mjs`
161 973 / 0), sprity a bloky (osm sad, `matchsprites.mjs` 23 611 392 / 0),
panel (`matchpanel.mjs` 870 912 / 0) a texty jsou z programu; herní
obrazovka i hlavička menu se skládají z dat (`matchscreen.mjs`
16 128 / 0). Další je **M3 – pohyb Jima**.

**M1 je hotová** – aplikace běží na svision se statickou
herní obrazovkou z pixelů originálu, LOAD TAPE hraje všech osm bloků
kazety i s turbo bloky, worker tiká na 50,08 Hz a nese generátor náhody
originálu (`matchscreen.mjs` 9216 / 0, `runworker.mjs` 29 / 0,
`matchrand.mjs` 196 608 / 0). Nikdo se zatím nehýbe – to je M3.

**M0 je uzavřená.** Kazeta je rozebraná a doložená
(`matchimage.py` 38 726 / 0, `matchloading.py` 105 216 / 0, nezávislé dumpy
z archivu), kadence a generátor náhody změřené, návod z inlaye přepsaný,
podklady z druhé ruky sebrané. **Pravidla hry jsou pořád většinou `?`** –
potvrdí je kód v M2–M5. Autority: `sources/docs/disasm_notes.md`,
`tape_layout.md`, `screen_layout.md`, `hw_notes.md`, `source_remnant.md`.

---

## 1. Která edice a z čeho se čerpá

**Zdrojem je kazeta — TZX.** Není to jen volba edice, je to technická
podmínka: remake bude mít v menu **LOAD TAPE jako jednu z variant spuštění**
(vzor `sabrewulf` / `jetpac` / `aticatac`) a ta varianta **nahrává skutečná
data z kazety**, ne animaci, která nahrávání připomíná. K tomu je potřeba mít
ty bloky.

| položka | hodnota |
|---|---|
| název | `Booty.tzx` |
| velikost | 46 106 B |
| SHA1 | `1a325b309ccae2dd4e2b54b48fc082574ca852ad` |
| obal | TZX 1.0 (soubor z 1997) |
| zdroj | ★ World of Spectrum / Spectrum Computing `pub/sinclair/games/b/Booty.tzx.zip`, ZXDB „Original release"; totéž je TOSEC 2017 `Booty (1984)(Firebird)[a].tzx` (`sources/docs/provenance.md`) |

**Remake se měří proti původnímu vydání Firebird 1984**, a to je ★ ta
kazeta, kterou máme (ZXDB „Original release"). Další vydání podle ZXDB
(`sources/docs/secondary_findings.md` §10): pozdější inlay Firebird
**Silver 199 Range** (£1.99, týž čárový kód, návod liší jedním slovem) –
? zda s jinou páskou, nevíme; ABC Soft (Španělsko, bez dumpu); Outlet #120
(1997, jen obrazovka). ★ Veřejně existuje **jediný obsah originální
kazety**: druhý nezávislý dump TZX má ve všech osmi blocích **totožná
data** a obě odjištěné TAP mají blok kódu **bajt po bajtu** shodný
s `bootylib.code_image()` (`sources/docs/provenance.md`). Rozdíl v kódu
mezi vydáními tedy není s čím hledat a otázka je uzavřená.

Snapshot (`.z80`, `.sna`), pokud se k němu dostaneme, je **druhotný podklad,
ne zdroj**: hodí se jako nezávislá kontrola obrazu paměti, který z kazety
vyrobí náš nástroj, ale bloky, hlavičky ani pilotní tón v něm nejsou.

### ★ Struktura kazety je změřená (2026-10-06)

Podrobně `sources/docs/tape_layout.md`. Ve zkratce:

| # | blok | obsah |
|---|---|---|
| 1–2 | ROM, Program `BOOTY` | BASIC zavaděč s **podvrženými čísly** (`140` je `116`), skočí do strojového kódu v řádku 65295 |
| 3 | **turbo** 71 B | přepíše začátek BASICu: `BORDER 0: PAPER 0: INK 0: CLEAR 26870: LOAD "" SCREEN$ …` |
| 4–5 | ROM, Bytes `bs` | **SCREEN$**, 6912 B na `$4000` → platí větev **A** |
| 6–7 | ROM, Bytes `bc` | 38 655 B kódu; hlavička říká `$6518`, `LOAD "" CODE 26880` ho dá na **`$6900`–`$FFFE`** |
| 8 | **turbo** 71 B | 62 B z něj na **`$CD14`**, kde je v kódu podvrh `JP $6900`; instalace IM 2 a vstup do hry |

★ **Kód není zamíchaný ani zašifrovaný** — ochrana je jen ve skládání.
Obraz paměti skládá `tools/bootylib.py` z kazety bez simulátoru a
`tools/matchimage.py` ho doloží: **38 726 kontrol, 0 rozdílů**. Turbo bloky
mají standardní délky bitů a **krátký pilot (497 pulzů)**; ROM je sama
nenajde, najde je zavaděč z bloku 2. ? Synchronizace 875/525 T je **jen
v našem dumpu** – druhý dump téže kazety (OmikroN 1997) má synchronizaci
podle ROM (667/735 T) při totožných datech. Pro LOAD TAPE platí jen to, na
čem se oba dumpy shodují: **krátký pilot a standardní bity**.

### Co LOAD TAPE znamená technicky

Vzor je `sabrewulf/app/tapeLoadingModel.js` / `aticatac/app/tapeLoadingModel.js`
a **přebírá se beze změny**: obrázek se **neodkrývá, on se nahrává**. Zvuk po
každém přehraném bajtu pošle událost, model ten bajt zapíše do videopaměti,
takže obrázek naskakuje rychlostí zvuku, protože tím zvukem je. Pořadí, délky
bloků a jména z hlaviček se berou z `sources/docs/tape_layout.md`, ne od oka.
Nápisy, které tiskne BASIC zavaděč, se odečtou z něj.

★ **Co je během nahrávání vidět, je změřené** snímek po snímku
(`tools/traceloading.py`, `sources/docs/tape_layout.md`): `Program: BOOTY`
viditelně; po prvním turbo bloku `CLEAR` do černé; `Bytes: bs` a `Bytes: bc`
černě na černou; a **bitmapa obrázku se nahrává neviditelně** (atributy
`$00`), obrázek naskočí až s atributy na konci bloku. Remake to tak dělá
(`app/tapeLoadingModel.js`, `data/global.json#tape`).

★ Loading screen je v paměti simulátoru po nahrání **na pixel stejný**
jako blok `bs` (`tools/matchloading.py`). V bajtech se liší: hlášení ROM
`Bytes: bc` se natiskne na řádek 20 do buněk s atributem `$00`, takže není
vidět — proto má zavaděč `PAPER 0: INK 0` a `PRINT AT 19,0;`.

? Booty vyšel i pro **Commodore 64, Amstrad CPC a MSX**. **Je to mimo
rozsah** — remake se měří proti ZX verzi a proti ničemu jinému.

---

## 2. Původní hardware (co reprodukujeme)
> Podrobné odvození patří do `sources/docs/hw_notes.md` (M0).

- Z80 @ 3,5 MHz, **ZX Spectrum 48K**. Obraz **256×192 px** + border.
- **Snímková frekvence 50,08 Hz** (69 888 T-stavů na snímek), krok 1/50 s,
  **ne 1/60**.
  ★ **Hlavní smyčka (`$DF13`) na snímek nečeká** – žádný `HALT`, žádné
  čtení čítače přerušení. Průchod trvá **0,9–3,85 snímku**, střídají se
  krátké (≈ 0,9) a dlouhé (1,7–3,6), průměr **≈ 1,9 snímku** se spornou
  pamětí (`tools/tracecadence.py --cmio`, `sources/docs/disasm_notes.md`
  §4). Tempo hry je tedy **rozpočet v T-stavech**, jako u Jetpacu, ne
  pevná frekvence. Časové události (`$E12A`, 1400 snímků) se ale řídí
  `FRAMES`, tedy snímky.
- Barvy: 15 odstínů, **atributy 8×8**. *Attribute clash* se **reprodukuje,
  neodstraňuje**. Barevná rovina (R-036, `../DESIGN-inkplane.md`) je volba
  zobrazení navíc, ne náhrada věrného obrazu — jestli ji Booty dostane, se
  rozhodne až po M2.
- Grafika je bitmapová, sprity se kreslí softwarově do `$4000–$5AFF`.
  ? Jak (XOR, OR s maskou, vyrovnávací paměť obrazovky jako Manic Miner),
  je otázka M2 a určí, jak se bude stavět obraz v remaku.
- Zvuk: **1bitový beeper** (bit 4 portu `$FE`), bez AY.
  ★ Booty hraje **melodii v přerušení souběžně se zvuky** (níž). Rozhodnutí R-024 (jeden posuvník, jedna sběrnice, jeden
  `AudioContext`) platí, dokud se neukáže, že hra hraje hudbu a zvuk naráz.
- ★ **Ovládání originálu** (menu z běhu): `1 KEYBOARD`, `2 INTERFACE 2
  JOYSTICK`, `3 CURSOR JOYSTICK`, `4 KEMPSTON JOYSTICK`, `5 DEFINE KEYS`.
  ★ Výchozí klávesy jsou **kurzorové klávesy Spectra**: `5` vlevo, `8`
  vpravo, `7` nahoru, `6` dolů, a **`A` – ENTER ROOM** (vstup do dveří).
  Klávesa pro skok **není** — ? skáče se nahoru (`7`)?
- ★ **Přerušení IM 2 hraje zvuk**: melodie z tabulky na `$FA00` každé
  čtvrté přerušení a čtyři zvukové sloty, **souběžně s hlavní smyčkou**
  (`sources/docs/disasm_notes.md` §2). Hra tedy hraje **hudbu a zvuk
  naráz** — a to je přesně podmínka, za které se R-024 otevírá. Rozhodne
  se v M6.

## 3. Herní obrazovka
> Odměřené souřadnice patří do `sources/docs/screen_layout.md` (M0/M1).

- Hrací plocha je **jedno podpalubí naráz**, bez rolování; ? přechod mezi
  podpalubími je skokový, dveřmi (`A` – ENTER ROOM).
- ★ **Hrací plocha jsou řádky 0–22 přes celou šířku**, panel řádek 23.
  Podpalubí má **pět palub** (řádky 1, 6, 11, 16, 21) a mezi nimi **čtyři
  patra po 32 px** — stejně ve všech třech změřených podpalubích; liší se
  barvy, kulisa a přerušené paluby (`sources/docs/screen_layout.md`).
- ? Podpalubí je složené z **plošin, žebříků, dveří s čísly, kulatých
  okének** a předmětů. Jak je popsané (seznam kusů? znaková mřížka jako
  Manic Miner? bitmapa?), je **otázka číslo jedna pro M2**.
- ★ **Panel je řádek 23**, žlutá na černé (`$06`): tři ikony postavičky
  (? životy), ikona klíče a `0` (? číslo neseného klíče), `BOOTY 0`
  (? sebraná kořist), `TREASURE 125` (? zbývající kořist). **Skóre
  v bodech na panelu není.**
- ★ **Font je ROM** – panel, menu i `DEFINE KEYS` se bajt po bajtu
  shodují se znaky ROM na `$3D00`.

## 4. Pravidla (z instrukcí a inlay; všechno ? dokud to nepotvrdí kód)

Primární text je **doslovný přepis návodu Firebird**
(`sources/docs/instructions_transcript.md`); co říkají recenze, tipy
a mapy, je v `sources/docs/secondary_findings.md` i s konflikty. Obojí je
pořád **hypotéza pro kód**. ★ jen tam, kde to doložil kód nebo běh.

1. ★ **Cíl hry: posbírat 125 kusů kořisti** ze 20 podpalubí (záznamů je
   129, kód je nerozlišuje). Kořist se sbírá **sama, když u ní Jim stojí**
   (`sources/docs/rules.md`).
2. ★ **Po posbírání všeho** běží odpočet **45 „sekund“ po 20 průchodech**
   na nalezení **zlatého klíče**, který leží tam, kde byl sebraný kus,
   po kterém zbylo 50. Nalezení = **další kolo**: všechna podpalubí znovu
   z tabulek, `TREASURE 125`, životy a `BOOTY` zůstávají; **hra jde
   dokola**. Došlý čas = konec hry. Bronzový a stříbrný klíč ani
   zrychlení kód nezná (? návod) – `rules.md`.
3. ★ **Klíče s čísly**: Jim klíč sebere tím, že do něj vejde; dveře
   otevře jen klíč s jejich číslem a spotřebuje se, dveře se už
   nezavřou. **Nese jen jeden** – sebráním jiného se starý vrátí na
   místo; průchodem dveřmi se ztratí (`rules.md`). ★ Číslo neseného klíče
   je na panelu (`($F241)`, `disasm_notes.md` §3). Graf klíčů a dveří
   se vytáhne z tabulek v kódu (M2, `sources/docs/holds.md`).
4. ? **Přechod mezi podpalubími**: klávesa **ENTER HOLD** (nebo FIRE),
   když Jim stojí **přímo před dveřmi podpalubí**. ★ Výchozí klávesa `A`.
5. ? **Smrt** (výčet z návodu): propadnutí **padacími dveřmi**,
   **utonutí**, kousnutí **krysou**, klovnutí **kapitánovým papouškem**,
   **pirát-duch**, **výbuch nastražené kořisti**, a **vykročení dveřmi
   podpalubí do prázdna**. ★ V kódu je text `BUT DONT RUN OUT OF AIR`
   ★ M2: ten text je z **úvodu skryté hry `CATCH 20 GOLDFISH`**, ne
   z bonusového kola (`sources/docs/texts.md`). ★ Utonutí v hlavní hře je
   v kódu: **dveře z podpalubí 10 vedou do moře** (cíl 21) a ENTER ROOM
   u nich spustí `$E361` – voda odspodu, smrt (`sources/docs/holds.md`); smrt dotykem piráta, úlomku
   výbuchu a tvora z časovače taky. Tabulky `TDDAT` (★ padací dveře)
   a `LIDAT` (★ objekty, které vezou Jima – ? výtahy) jsou popsané
   v `sources/docs/holds.md`.
6. ★ **Tři životy**: počítadlo je **`$5BF1`**, nová hra do něj zapisuje 3
   (`$DEB0`), smrt ho snižuje (`DEC A` na `$E3B6` – tam míří i POKE na
   nekonečné životy `58294,0`); hraje se i s nulou, pokusy jsou čtyři.
   ★ **Bonusový život není.** ★ Po smrti se Jim vrací do podpalubí 1
   (`$E3BF` → `$DEC9`; POKE `58304,206` „don't return to start" míří na
   `$E3C0`), stav lodi zůstává (`rules.md`).
7. ? **Pohyb Jima**: návod zná jen LEFT, RIGHT, UP, DOWN a ENTER HOLD.
   **Skok nezmiňuje nikdo** – ani návod, ani recenze. Žebříky, výtahy
   a vodorovně jezdící plošiny ano (recenze). ? Pád: smrtelná výška se
   **musí změřit, ne převzít** z Manic Mineru.
8. ★ **Pauza je `P`** (`DI`, čeká na libovolnou klávesu; stojí i hudba)
   a ★ **`M` vypíná a zapíná hudbu** – to potvrzuje i návod („MUSIC ON/OFF
   = M"). Pauzu návod nezmiňuje. Obojí natvrdo, nedá se předefinovat
   (`sources/docs/disasm_notes.md` §8).
9. ★ **Dva hráči nejsou** — menu originálu nabízí jen ovládání,
   `DEFINE KEYS` a `START GAME`. Menu remaku dvojici nenabízí.
10. ? **Skrytá hra**: POKE `52798,58` (nebo `52796,24` + `52797,3`) obejde
    ★ `JP $D08A` na `$CE3E` a podle tipů pustí **skrytou část, kterou
    normálně spouští připojený Currah MicroSpeech**. ★ Hned za tím skokem
    tiskne `$CE44` její úvod: `CATCH 20 GOLDFISH / BUT DONT RUN OUT OF AIR
    / OR GET TOO CLOSE TO THE BIG FISH` (`sources/docs/texts.md`).
    ★ Její hlavní smyčka `$CF36` je převedená nad pamětí
    (`app/goldfishLogic.js`, `tools/matchgoldfish.mjs` 0 rozdílů i s řádky
    22–23 FISH/AIR). **Rozhodnuto 2026-10-09** (místo animovaného pozadí
    s automatem z 2026-10-08):
    - **SECRET SUB GAME** – položka menu, skrytá hra k hraní
      (`app/subGameModel.js`, `app/subGameWorker.js`): hráč vede potápěče
      klávesami LEFT/RIGHT/UP/DOWN ze SETTINGS, řádek 22 originálu (FISH,
      AIR), BEEPER při dotyku ryby, melodie; ★ 20 rybek spustí Booty jako
      originál (`$D08A`). Pauza jako ve hře (`Escape`, křížek).
    - **pozadí menu** jen lodě a pohyblivé dno (bez potápěče, bublin
      a ryb). Odchylky remaku (§10): border ★ azurový jako minihra, místo
      FISH/AIR text `BOOTY  © 1984 JOHN F. CAIN.`, menu jasně bílé přímo
      přes moře, verze v písku, menu bez zvuku (R-024).

★ **Body nejsou** (§6).

## 5. Pohyb postavy

Akceptace je stejná jako u Sabre Wulfa M3 a Jetpacu M3: **`matchphysics.mjs`
přehraje krok po kroku záznam z originálu proti `app/`, s nulou rozdílů** na
řádově tisících krocích. Ne „vypadá to dobře". Měří se:

- ? rychlost chůze v pixelech za krok (celá čísla, nebo 8.8 — pokud zlomky,
  **reprodukuje se bitově, ne přes `float`**)
- ? skok: tabulka výšek po krocích (Manic Miner ji má jako tabulku, tady
  **nepředpokládat**), délka, co se stane při nárazu hlavou
- ? žebříky: jak se na ně vstupuje, rychlost, jestli se z nich dá skočit
- ? pád: rychlost, výška, která zabíjí
- ? kolize: s plošinou, se zdí, se dveřmi, s nepřítelem — po pixelech, po
  buňkách atributů, nebo po obálkách?
- ? přechod podpalubí: kde je spouštěcí čára a kde se Jim objeví

## 6. Bodování

★ **Originál body nepočítá** – tiskne jen `BOOTY`, `TREASURE`, sekundy
odpočtu a číslo klíče, jiné počítadlo nemá, a **síň slávy nemá** (po konci
hry titulka). Síň slávy remaku (§10) řadí podle **`BOOTY`** – sebrané
kořisti za celou hru přes všechna kola (`sources/docs/rules.md`).

## 7. Nastavení – v remaku jako menu options

- ovládání: klávesnice (výchozí šipky + mezera jako v MM/JSW/SW; originální
  klávesy si hráč nastaví; remap přes `zxRemapKeysEntity`, **jen nastavené
  klávesy platí**, myš hru neovládá), touch, gamepad
- hlasitost a zvuky (`zxVolumeEntity`), jeden posuvník (R-024)
- pixel-perfect 256×192 s celočíselným škálováním; border podle originálu

## 8. Cíle remaku

- Rozlišení **256×192 + border**, celočíselné škálování,
  `ZXPlatform` + `ZXLayout`.
- Grafika **vytažená z originálního programu** (sprity Jima, nepřátel,
  předmětů, kusy podpalubí, atributy), ne dokreslená.
- Zvuky syntetizované jako 1bitový beeper podle rutin z disassembly,
  **v T-stavech Z80**, kontrolované pulz po pulzu (`tools/matchsound.mjs`;
  vzory Sabre Wulf 63 038 / 0, Jetpac 569 / 0).
- **Varianty spuštění v menu**: `START GAME` rovnou do hry, `LOAD TAPE`
  přes nahrávání z kazety. Varianta spuštění, ne spořič.
- Stavy aplikace: menu → tape loading → hra → game over → síň slávy.
- Ovládání: klávesnice, touch (páčka + **ENTER ROOM** – ★ skok originál
  nemá), gamepad. **Dotykové ovládání patří do M1**, ne na konec.
- Žádný `Math.random()` v herní logice. ★ Originál má **jediný generátor
  `$E349`** (16bitový stav `$F343`, `B+=C; C+=$CD; B+=$AB+CY`, perioda
  65 536), **bez R registru a bez ROM**. Stav je po nahrání `$0000`
  a mezi hrami se nenuluje (`sources/docs/disasm_notes.md` §5). V remaku
  je tedy **semínko = počáteční stav `$F343`**, výchozí `$0000` jako
  po nahrání, a generátor se přenese beze změny. Ve workeru **od M1**.
- Obraz se kreslí na zprávu z workeru, smyčka modelu je záloha (R-037),
  `setInterval` nikde (R-046), ukazatel FPS v rámečku (R-045).

## 9. Otevřené otázky (ověřit z disassembly / běhu)

Seřazené podle toho, na čem visí zbytek práce:

1. ~~**Struktura kazety**~~ – ★ **uzavřeno**: osm bloků, dva turbo,
   pětivrstvý zavaděč. §1
2. ~~**Má kazeta blok SCREEN$?**~~ – ★ **má** (`bs`), větev **A**. §1
3. ~~**Je kód zamíchaný?**~~ – ★ **není**; ochrana je ve skládání,
   doložená `matchimage.py` 38 726 / 0. §1
4. ~~**Kolik snímků má logický krok**~~ – ★ **na snímek nečeká**, průchod
   0,9–3,85 snímku, průměr ≈ 1,9. §2
5. ~~**Jak je popsané podpalubí**~~ – ★ **uzavřeno**: 21 podpalubí po 11
   tabulkách od `$ABD6`, kreslí `$A900` (`sources/docs/holds.md`,
   `matchholds.mjs` 161 973 / 0). (M2)
6. ~~**Graf klíčů a dveří**~~ – ★ **uzavřeno**: graf z `EODAT`, klíč ke
   každým dveřím v témže podpalubí, 4 jednosměrné hrany; partie z RZX
   prošly 43 hran a všech 20 podpalubí, klíč se nese jeden
   (`sources/docs/rules.md`). (M4)
7. ~~**Kde jsou sprity a v jakém formátu**~~ – ★ **uzavřeno**: sprite
   `$EED7` a blok `$EA93`, osm sad (`sources/docs/sprites.md`,
   `matchsprites.mjs` 23 611 392 / 0). ? Jména tvora z časovače (krysa,
   papoušek) jsou z návodu, kód je jen rozlišuje velikostí. (M2)
8. ~~**Vlastní font, nebo ROM?**~~ – ★ **ROM**. §3
9. ~~**Pohyb Jima**~~ – ★ **uzavřeno**: 2 px za průchod, skok není,
   smrtelný pád po 8 průchodech pádu (16 px) (`sources/docs/physics.md`). (M3)
10. ~~**Nastražená kořist** – pevná, nebo losovaná?~~ – ★ **losovaná**:
    při každém sebrání `$E349` < `$40` (25 %) → výbuch (`$E3C2`,
    `sources/docs/holds.md`). Generátor losuje taky patro a druh tvora
    z časovače (`$E12A`).
11. ~~**Nepřátelé**~~ – ★ **uzavřeno**: piráti tam a zpátky mezi
    zarážkami, tvor z časovače na losované palubě bez zavřených dveří,
    úlomky výbuchu; na Jima nereaguje nikdo; obálky dotyku
    (`sources/docs/enemies.md`, `matchentities.mjs` 611 302 / 0). (M5)
12. ~~**Bodování a životy**~~ – ★ **uzavřeno**: body nejsou, 3 životy
    (4 pokusy), bonusový život není (`rules.md`). (M4)
13. ~~**Zvuk** – melodie, nebo jen efekty?~~ – ★ **melodie** v přerušení
    souběžně se zvukovými sloty; R-024 se otevírá. §2 (M6)
14. ~~**Síň slávy**~~ – ★ **uzavřeno**: originál ji **nemá** ani po konci
    hry (`$D0A1` → titulka `$CD86`). ★ Pauza je `P`, dva hráči nejsou.
    Remake ji má jako přídavek (§10), řazenou podle `BOOTY`.
15. ~~**Vydání**~~ – ★ **uzavřeno**: existuje jediný obsah kazety (dva
    nezávislé dumpy TZX se stejnými daty, dvě TAP se stejným kódem). §1

## 10. Vědomé odchylky od originálu

Každá odchylka se sem zapisuje **s datem a důvodem**. Odchylka, která tu
není, je chyba, ne rozhodnutí.

- ~~**2026-10-06 (M1) – herní obrazovka je fotka.**~~ **Zrušeno v M2
  (2026-10-06)**: podpalubí, panel i Jim se skládají z dat programu
  (`matchscreen.mjs` dál 0). Fotkou zůstává jen **hlavička menu**, dokud
  se nepřečtou její texty.
- **2026-10-06 (M2) – Jim stojí, kde přistál.** Na začátku hry Jim o řádek
  spadne (šablona `$F245`, B = 22 → 21); remake ho kreslí rovnou tam, kde
  podle běhu originálu přistane (`data/global.json#global`). Pád dodá M3.
- **2026-10-06 (M1) – menu je remaku.** Menu originálu nabízí ovládání,
  `DEFINE KEYS` a `START GAME`; remake má navíc `PLAYER NAME`, `HALL OF
  FAME`, `SOUNDS`, `LOAD TAPE` a `ABOUT GAME` a ovládání s předefinováním
  kláves v `SETTINGS`. Sedí ale na hlavičce menu originálu, jeho fontem,
  barvami a rozestupem. **Titulka s pohyblivým mořem a ukázka se
  neukazují** – potřebují M2–M5. (Titulka je od M6 v `MainModel`, viz
  níž; ukázka také, od 2026-10-08.)
- **2026-10-07 (M6) – titulka před hrou.** `START GAME` v menu vede na
  titulku originálu s pohyblivým mořem (`MainModel`, jako manicminer);
  ★ obrázek i moře jsou originálu (`tools/matchtitle.mjs` 0 rozdílů),
  ★ melodie pod ní hraje jako v originálu a pokračuje do hry. Remake jde
  na titulku až z menu (originál ji má před menu), hru spustí libovolná
  klávesa, klik, dotyk nebo tlačítko gamepadu (originál libovolnou
  klávesou jde do menu; `Escape` a ztlumení `M`/`S` jsou výjimky).
  ★ Ukázka originálu po 1024 přerušeních se ukazuje (2026-10-08) – po
  20,45 s, jak to vychází v tempu remaku bez melodie (s melodií originál
  čeká 24,66 s, noty ztrácejí přerušení); ukončí ji i klik, dotyk
  a tlačítko gamepadu.
  Celá titulka se kreslí po průchodech, ne pod paprskem.
- **2026-10-07 (M6) – zvuk po sběrnicích.** ★ Každý zvuk je originálu hranu
  po hraně (`tools/matchsound.mjs` 0 rozdílů), ale hraje na sběrnici podle
  druhu – melodie `music`, tvorové `animals`, výbuch `extra`, ostatní
  `sounds` – s hlasitostí `music` a `sounds` (tu berou i tvorové
  a výbuch); na stroji je to jeden bit `$FE`.
  Pořadí a čekání jsou originálu (jednorázové jeden po druhém, melodie
  čeká pod ostatními; zvuk smrti hraje BEEPER a po něm slot, jako
  originál během překreslení). Překreslení po smrti má přechod jako dveře
  (? s časy dveří, po smrti neměřené). ? Odchylka: během jednorázového zvuku a BEEPERu
  originál stojí a remake ne; souvislý zvuk začíná od svého začátku.
- **2026-10-08 (M6) – menu přes skrytou minihru.** Hlavička menu originálu
  z menu zmizela (zůstává nahoře v PLAYER NAME, HALL OF FAME, SOUNDS, MUSIC, SETTINGS
  a ABOUT GAME – `subMenuModel.js`, od 2026-10-10 fontem 5×5 na azurových
  pruzích originálu zkrácených na text); pod položkami běží
  skrytá minihra originálu (§4 bod 10). Od 2026-10-09 v menu jen lodě
  a pohyblivé dno (bez potápěče, bublin a ryb), menu je němé. Tempo =
  medián průchodu bez melodie a zvuků (6,15 snímku).
- **2026-10-09 – SECRET SUB GAME.** Skrytá minihra je položka menu a hraje
  se (§4 bod 10). Odchylky: klávesy potápěče jsou klávesy remaku ze
  SETTINGS (originál čte `5 8 7 6` jako Booty), pauza panelem jako ve hře,
  ? šum doplňování vzduchu (`$D063`) nehraje; během BEEPERu originál stojí
  a remake ne (tempo stálé jako ve hře).
  **Bez attribute clashe** (2026-10-09, R-036 jako jetpac): obraz se
  kreslí přes barevnou rovinu (`ScreenLayout.TRUE_COLOUR`). ★ Bublina je
  ROM PLOT a ten dá celé buňce `ATTR-T` s inkoustem potápěče, takže na
  stroji bublina přebarví rybu, kterou prochází, na jeho barvu; v remaku si
  pixely ryby barvu nechají. Paměť je dál originálu
  (`tools/matchgoldfish.mjs --ink` 0 rozdílů); vypnutím se clash vrátí.
  **Lodě a dno plynule mezi menu a minihrou** (2026-10-10): menu i
  SECRET SUB GAME si předávají horní třetinu obrazovky (lodě, `$D8A2`),
  znaky dna `$DC22`–`$DD21` (`$D8E2`) a bit 0 počítadla `$D93D`
  (`GoldfishLogic#scenery`, `gameApp.goldfishScenery`), takže minihra
  nezačíná přesně z paměti originálu při prvním `$CF36`. Zbytek `$D93D`
  (doplňování vzduchu každý 16. průchod) zůstává originálu; obě strany
  navíc udělají při startu jeden průchod, aby bylo dno vidět hned.
- **2026-10-06 (M1) – síň slávy.** Originál ji nemá (★ M4); remake ji má
  jako sourozenci a řadí podle `BOOTY` – sebrané kořisti za celou hru
  (§6, M4 2026-10-07).
- **2026-10-06 (M1) – pauza s panelem.** ★ Originál pauzuje na `P` a nic
  neukáže, čeká na libovolnou klávesu. Remake na `Escape`, tlačítko EXIT
  gamepadu, křížek v rámečku i při ztrátě zaměření karty otevře panel
  (RESUME / SOUNDS / EXIT) – karta prohlížeče se musí umět zastavit sama.
  Od 2026-10-09 **klávesu pauzy remake nemá** (ani `P`, ani v SETTINGS):
  pauzu dělá vstup do panelu sám.
- ~~**2026-10-06 (M1) – `M` ztiší všechno.**~~ Neplatí od 2026-10-07
  (M6, tři sběrnice): ★ jako v originálu `M` vypíná jen melodii (`$FFF8`,
  sběrnice `music`), efekty a tvory ztiší `S` (vlastní klávesa remaku jako
  v manicminer). Pauza má SOUNDS i MUSIC. Ztlumení hudby **tempo nemění**,
  ač smyčka originálu bez melodie zrychlí.
- **2026-10-06 (M1) – výchozí klávesy jsou šipky a mezera**, jako
  u sourozenců (§7); klávesy originálu (`5 8 7 6 A`) si hráč nastaví.
- **2026-10-06 (M1) – blok kódu na kazetě se utne.** LOAD TAPE zahraje
  z bloku `bc` (38 655 B, přes 3,5 minuty) jen první kilobajt (≈ 7 s)
  a pokračuje druhým turbo blokem. Obrázek je v té chvíli celý. Všechny
  ostatní bloky zní celé a ve vlastním časování.
- **2026-10-07 (M3) – po přechodu do jiného podpalubí se 0,5 s nevstupuje
  dveřmi** (rozhodnutí operátora). ★ Originál vstoupí znovu hned další
  průchod, takže držená klávesa vstupu přehazuje Jima dveřmi tam a zpátky.
  Worker (`app/gameWorker.js`, `ENTER_LOCK_FRAMES`) 25 přerušení (≈ 0,5 s;
  původně 1 s, zkráceno týž den)
  od chvíle, kdy je nové podpalubí vidět, klávesu vstupu nepředá do
  KEY-SCAN; ostatní klávesy jdou dál. `bootyLogic.js` se nemění,
  `matchphysics` platí.
- **2026-10-07 (M3) – přechod dveřmi trvá a je vidět jako v originálu**
  (rozhodnutí operátora; zpřesnění konstantního tempa níž). ★ Průchod
  s přechodem trvá v originálu 9–12 snímků: obraz se smaže ROM CL-LINE,
  podpalubí se kreslí pod černými atributy a pak naskočí – střih.
  Remake udělá přechod v průchodu naráz, worker pak snímek po snímku
  ukáže, co originál, a další průchod počká (`sources/docs/physics.md`
  „Přechod dveřmi“, `data/global.json#transition`, `tools/matchtransition.mjs` –
  197 snímků, 0 rozdílů, nejvýš 0,045 snímku vedle). Časy jsou bez
  melodie, jako tempo. **Remake mazání a naskočení podpalubí ukazuje 2× pomaleji**,
  černo trvá jako v originálu (rozhodnutí operátora 2026-10-07,
  `TRANSITION_SLOWDOWN` v `app/gameWorker.js`; 1 = tempo originálu),
  tedy asi 15–17 snímků. ? Panel se ukáže naráz (originál ho tiskne
  ~0,6 snímku). Smrt a nový život kreslí podpalubí stejně, ale zatím
  naráz.
- **2026-10-06 (M1) – synchronizace turbo bloků podle ROM** (667/735 T).
  Náš dump má 875/525, druhý nezávislý dump 667/735 při týchž datech; je
  to vlastnost dumpu, ne kazety (§1).

- **2026-10-07 (M3) – tik workeru 30 ms** (volba operátora od oka,
  `TICK_MS` v `app/gameWorker.js`; ? změří se; originál 19,968 ms).
  Podle tiků jdou průchody i to, co se počítá ve snímcích (`FRAMES`
  a časovač tvorů, odpočet zlatého klíče, přechod dveřmi, prodleva
  vstupu); co z toho má držet čas originálu, se případně upraví zvlášť.
  Časování je jen konstanta `setTimeout`, bez akumulátoru (R-046, „Co
  zbývá“).

Místo, kde se odchylka **čeká** (rozhodne se, až budou čísla):

- **2026-10-06 (M3) – konstantní tempo** (rozhodnutí operátora). ★ Originál
  na snímek nečeká: průchod trvá 1,5–3,4 snímku podle podpalubí a s melodií
  o třetinu déle, protože noty hraje přerušení a bere čas hlavní smyčce.
  **Remake výkon Spectra nesimuluje**: průchod běží konstantně, jednou za
  114 057 T snímků (průměr originálu bez melodie, 30,69 průchodu/s,
  `PASS_TSTATES` v `app/gameWorker.js`), a zvuk hraje ve vlastním vlákně, takže hru
  nezpomaluje. Pravidla zůstávají průchodová – originálu je každý průchod,
  jen jejich rozestup je stálý.

## 11. Stav podkladů

**Všechno pro M0 je tu** (2026-10-06):

1. ★ **kazeta** `sources/tape/Booty.tzx`, 46 106 B, SHA1 `1a325b30…`,
   **mimo git** – soubor z archivu WoS / Spectrum Computing, ZXDB
   „Original release" (`sources/docs/provenance.md`)
2. ★ **návod z obou inlayí**, doslovně přepsaný
   (`sources/docs/instructions_transcript.md`), skeny v `sources/media/inlay/`
3. **sekundární podklady** – recenze (CRASH 93 % Smash, PCN, SU, PCG, YS,
   Sinclair Programs), POKE, mapa, jiné platformy, vydání, s konflikty
   v `sources/docs/secondary_findings.md`; surové texty v
   `sources/docs/raw/`

? Na později (M2+): **záznamy RZX** průchodu až ke zlatému klíči
(`provenance.md`) – hodí se jako nezávislý průchod pro `match*`.
