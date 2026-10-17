# Protokol mezi `gameModel.js` a `gameWorker.js`

Worker drží hru – **paměť originálu, 64 KB rozložených jako na stroji** –
a pouští její hlavní smyčku přepisem v `bootyLogic.js`
(`../sources/docs/physics.md`). Model do něj posílá jen ovládání a kreslí
obrazovku, kterou dostane zpátky (R-037: kreslí se na zprávu `frame`,
smyčka modelu je záloha).

★ Hra je originálu průchod po průchodu: `tools/matchphysics.mjs` (přepis
proti záznamům originálu, 0 rozdílů), `tools/matchstart.mjs` (start z dat,
která dostane worker, 0 rozdílů), `tools/runworker.mjs` (tenhle protokol)
a `tools/matchrules.mjs` – **celé partie originálu přehrané tímhle
protokolem** (`init`, `controls`, `tick`), po každém průchodu celá paměť
a zpráva `frame`, 0 rozdílů.

## Dvoje hodiny

| hodiny | frekvence | co |
|---|---|---|
| **snímek** | 50,08 Hz (69 888 T) | rekurzivní `setTimeout` s konstantou **30 ms** (volba operátora od oka 2026-10-07, změří se; originál 19,968 ms), jeden tik na volání, **bez akumulátoru** (operátor 2026-10-07, R-046 „Co zbývá“) – co prohlížeč ke zpoždění přidá, hru o kousek zpomalí; každý tik zvýší `FRAMES` (`$5C78`) v paměti, jako přerušení – podle něj jde časovač tvorů (`$E12A`) |
| **průchod** | **konstantní**: jednou za `passTStates` T-stavů snímků | `PASS_TSTATES` v `gameWorker.js` (`tools/measurecadence.py`): průměr originálu bez melodie, 114 057 T = 1,632 snímku = 30,69 průchodu/s; v remaku se tiky počítají po 30 ms. Originál tempo mění s prací a s melodií; **remake ne** (rozhodnutí operátora 2026-10-06, `ZADANI.md` §10) – zvuk hraje ve vlastním vlákně |

## Model → worker

| zpráva | pole | význam |
|---|---|---|
| `init` | `initData: {headless, seed, hiScore, memory, romFont, transition}` | nová hra. `headless: true` tiká jen na zprávu `tick` (nástroje). |
| `controls` | `left`, `right`, `up`, `down`, `enter` (boolean) | úplný stav akcí; posílá se při každé změně a celý. |
| `pause` / `continue` | – | zastaví / rozjede hodiny; `continue` bez `pause` nic neudělá. |
| `tick` | – | jeden snímek v režimu `headless`. |
| `reset` | – | zahodí stav a zastaví hodiny. |

### `initData`

| klíč | obsah |
|---|---|
| `memory` | `data/global.json#memory` – datové oblasti paměti originálu ve chvíli, kdy menu spouští hru (`tools/mkmemory.py`); **kód v nich není** |
| `romFont` | 768 B, znaky 32–127 ROM fontu na `$3D00` – ze svision (`ZXFonts8x8`) |
| `transition` | `data/global.json#transition` – časy přechodu dveřmi; bez něj se nové podpalubí ukáže naráz |
| `seed` | ★ počáteční stav generátoru `$F343`; `0` = originál po nahrání. Model ho přenáší z hry do hry jako originál |
| `hiScore` | nejvyšší skóre ze serveru |

Worker z nich složí paměť (`BootyLogic.composeMemory`) a spustí novou hru
(`BootyLogic.newGame` – přepis `$DEA8` … `$DF13`).

### ★ Ovládání

Akce jsou klávesy originálu: worker vezme kódy, které hra má v paměti na
`$5BEB`–`$5BEF` (vlevo, vpravo, nahoru, dolů, ENTER ROOM; výchozí `5 8 7
6 A`), a napodobí ROM `KEY-SCAN` (`BootyLogic.keyScan`) – průchod dostane
jeden kód, jako v originálu. Skok není. `M` a `P` obsluhuje model.

Odchylka remaku (ZADANI §10, 2026-10-07): po změně podpalubí (`$5BD3`)
worker 25 přerušení (≈ 0,5 s) od konce přechodu akci `enter` do `KEY-SCAN`
nepředá, aby držená klávesa nepřehazovala Jima dveřmi tam a zpátky.

### ★ Přechod dveřmi

Průchod, ve kterém ENTER ROOM změní podpalubí, nechá v `BootyLogic#transition`
obrazovku před přechodem, obrazovku s novými atributy a práci kreslení.
Worker pak každý snímek posílá **obrazovku a border podle času od přechodu**
(`BootyLogic.transitionScreen`): mazání ROM CL-LINE, černo, atributy,
panel – jako originál bez melodie (`sources/docs/physics.md`). Další
průchod počká o celou délku přechodu (`passT` se o ni sníží).

★ Utonutí (`$E361`, dveře do moře): průchod nechá v `BootyLogic#drowning`
obrazovku před ním a T, kdy voda zaplaví který řádek. Worker nejdřív ukáže
stoupající vodu (`BootyLogic.drowningScreen`) **v reálném čase**, aby šla se
zvukem (`REAL_T_PER_TICK`), a teprve po ní přechod po smrti; další průchod
počká o obojí. Odchylka
remaku: mazání a naskočení podpalubí běží `TRANSITION_SLOWDOWN` = 2×
pomaleji než v originálu, černo trvá jako v něm (ZADANI §10).

## Worker → model

| zpráva | pole | význam |
|---|---|---|
| `frame` | `frame`, `pass`, `outcome`, `screen?`, `border`, `hold`, `panel`, `jim`, `rand`, `controls`, `sounds[]`, `creature`, `explosion` | po každém tiku a po `init`. `screen` (6912 B, `$4000`–`$5AFF`) jen když v tiku proběhl průchod. |
| `gameOver` | `score` | konec hry (`$ED8F`). |
| `error` | `message` | chybějící data. |

### `frame`

| klíč | obsah |
|---|---|
| `screen` | obrazovka z paměti hry – **to je obraz**, model ji kreslí, jak je |
| `border` | barva borderu, jak ji nastavilo podpalubí (`$229B`) |
| `outcome` | výsledek posledního průchodu: `pass`, `restart` (ztracený život), `round` (zlatý klíč – nové kolo), `gameover` |
| `panel` | `{lives, booty, treasure, key, score, hiScore}` z paměti. ★ Body originál nemá (`sources/docs/rules.md`); `score` je sebraná kořist `BOOTY` za celou hru |
| `jim` | 20 B objektu `$F231` |
| `rand` | stav `$F343` – model ho dá do další hry |
| `sounds[]` | zvukové události tiku v pořadí, v jakém je stroj zahraje: `{id: 'beeper', de, hl}` – ROM `BEEPER` z průchodu; `{id: 'slot', value}` – jednorázový slot `$FFFE` 1–6, který obsluha přerušení na tomto tiku zahrála a vynulovala – i uvnitř průchodu, kde originál kreslí podpalubí přes mnoho snímků a `$E058` sloty vynuluje až na konci (smrt: BEEPER, pak `$FFFE`; `BootyLogic#silence`); `{id: 'death'}` – `$FFFB`+`$FFFC`; `{id: 'drown', seed}` – utonutí `$E361`, šum z generátoru od stavu `$F343` `seed` (`app/bootySound.js`) |
| `creature` | slot `$FFFF`: 0 nic, 1 krysa, 2 papoušek – zní souvisle, dokud není 0 (sběrnice `animals`) |
| `explosion` | slot `$FFFD`: 0 nic, 1 výbuch, 2 úlomky – souvisle (sběrnice `extra`) |

## SECRET SUB GAME – `subGameWorker.js`

Druhý worker (`gameApp.subGameWorker`) pro skrytou minihru `CATCH 20
GOLDFISH` (`subGameModel.js`). Drží paměť minihry a pouští `$CF36` přes
`goldfishLogic.js` (`panel`, `input`) – ★ `tools/matchgoldfish.mjs`
47 574 000 kontrol / 0. Tik 20 ms (přerušení originálu), průchod jednou za
`passTStates` z `data/global.json#goldfish` (medián originálu, 6,15 snímku).

| směr | zpráva | pole | význam |
|---|---|---|---|
| model → worker | `init` | `initData: {memory, romFont, inkPlane, scenery}` | `memory` = `data/global.json#goldfish` (paměť při prvním `$CF36` a `passTStates`), `romFont` na `$3D00` pro číslice úlovku, `inkPlane` barevná rovina (R-036), `scenery` lodě a dno z menu (`GoldfishLogic#scenery`, `null` = z dat); worker pak hned udělá jeden průchod |
| model → worker | `controls` | `left`, `right`, `up`, `down` | ★ klávesy potápěče; worker je převede na kódy `5 8 7 6` a přes `BootyLogic.keyScan` vybere jednu, jako ROM `KEY-SCAN` v `$D579` |
| model → worker | `pause` / `continue` / `reset` | – | jako u `gameWorker.js` |
| worker → model | `frame` | `frame`, `pass`, `screen?`, `ink?`, `scenery?`, `sounds[]`, `fish`, `air`, `controls` | po každém tiku s průchodem a po `init`; `scenery` (se `screen`) = `{ships, sand, phase}` pro menu (`gameApp.goldfishScenery`); `sounds[]`: `{id: 'beeper', de, hl}` – ROM `BEEPER` při dotyku ryby (`$CF7E`) |
| worker → model | `won` | `fish` | ★ 20 rybek (`$CF3E` → `$D08A`): originál spustí Booty, remake také |
| worker → model | `error` | `message` | chybějící data |
