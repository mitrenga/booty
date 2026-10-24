![](/images/app-icon-256x256.png)

BOOTY
=====================
The 1984 ZX Spectrum classic, reborn for modern web browsers.

## About
Originally written in 1984 by John F. Cain and published by Firebird Software
for the 48K ZX Spectrum. This is a faithful remake based on the original
ZX Spectrum version — not an emulator or a binary copy.

Jim the cabin boy is below decks on the Black Galleon, collecting the booty
strewn around its holds. The doors are numbered and so are the keys; trap
doors, ghost pirates, rats, parrots and booby-trapped treasure are in the way.
When the last piece is collected, Jim has 45 seconds to find the golden key —
and the next round begins.

The whole game is playable: all the holds, keys and doors, the enemies, the
booby traps, the golden key and the rounds after it, the original's tune and
sounds, LOAD TAPE with all eight blocks of the original cassette, the title
screen with its rolling sea and the hidden *CATCH 20 GOLDFISH* sub game.

Supported:
- keyboard (redefinable keys)
- gamepad
- touchscreen
- PWA application


## Play now
https://booty.remake.free


## Controls
| key | action |
|---|---|
| arrows | walk, climb ladders |
| space | enter a hold door |
| `M` | music on / off |
| `S` | sound effects on / off |
| Esc | pause |

All keys can be redefined in the menu, including the original's
`5 8 7 6 A`.



## Requirements
- PHP 8.1+
- nginx
- MySQL / MariaDB
- Node.js + terser, for building the bundle (`npm i -g terser`)
- es-check, for the ES2018 compatibility gate in `svtool verify` (`npm i -g es-check`)
- Python 3, only for the tools that extract and verify the data of the original


## Install
(`~/` below refers to the project root, not your home directory.)
- clone this repository
- clone library repository https://github.com/mitrenga/svision **next to it** —
  `~/app/svision` is a relative symlink to `../../svision`
- check symlink ~/app/svision
- configure nginx (example: ~/config/nginx.conf)
- create path ~/js with permissions 0777
- create database (script: ~/config/createDB.sql) — without it the menu does not open
- create configuration file ~/config/config.php (example: ~/config/config.php.sample)
- build the production bundle: ~/app/svision/tools/svtool build bundle


## Developer mode
Developer mode is switched in `~/config/config.php` (both settings are optional; without them the app runs in production mode):

```php
$devMode = true;
$devModeName = '.{\"penColor\":\"#000000\",\"bkColor\":\"#fefe00\",\"width\":185}◢◤ ◢◤ ◢◤ ◢◤  DEVELOPER MODE ◢◤ ◢◤ ◢◤ ◢◤';
```

`$devMode` values:
- `true` — development: JS sources are served directly instead of the bundle and the service worker is unregistered/bypassed
- `['serviceWorker' => true]` — development, but the service worker stays enabled (for testing SW behavior against a built `js/` deploy)
- `false` or not set — production: minified bundle + service worker

`$devModeName` is a label rendered in the top border of the game screen, so a development instance is recognizable at a glance. Set it to `false` (or leave it empty) to hide the label. The value is either plain text, or text prefixed with `.{...}` — a JSON object whose properties are applied to the label's TextEntity, typically:
- `penColor` — text color
- `bkColor` — background color
- `width` — label width in game pixels (the text is centered inside it)

The config is written into a double-quoted JavaScript string, so quotes inside the JSON prefix must be escaped as `\"` (see the example above).

In developer mode the frame rate and the state of the controls are shown in
the border, not over the game screen.


## Build & tooling
The `svtool` CLI (`~/app/svision/tools/svtool`) builds and checks the deploy. Run it from the project root:
- `svtool build bundle` — minified production bundle `js/bundle.<version>.min.js` (requires terser)
- `svtool build debug-bundle` — the same concatenation left unminified, `js/bundle.<version>.js`, for debugging on a device whose console cannot be opened
- `svtool verify` — check the `js/` deploy is complete, matches the current sources, and stays within ES2018 (authoritative via es-check if installed, otherwise a heuristic scan)
- `svtool info` — show the app version, deploy state and the most recent database records
- `svtool clean` — remove everything generated from `js/`

Optional — run `svtool` from anywhere and enable bash completion (adjust the path to your svision clone):
- `sudo ln -s /path/to/svision/tools/svtool /usr/bin/svtool`
- `sudo ln -s /path/to/svision/tools/svtool-completion.bash /etc/bash_completion.d/svtool`

Open a new shell afterwards, then run `svtool <command>` from any project root.

Production serves the bundle; in development, with no bundle built, the sources under `app/` are served and loaded one by one through dynamic `import()`.


## Game data
All the data of the game are in one file, `data/global.json`, in sections
(`holds`, `sprites`, `panel`, `texts`, `memory`, `sounds`, `title`, `tape`,
…) described in [data/README.md](data/README.md). The server sends them to
the application in a single request (`db/appData.php`). Each section is
written by one tool from `tools/`, never by hand, so the game runs from this
repository as it is.

Regenerating or verifying the data needs the original tape image, which is
copyrighted and **not part of this repository**. It goes to
`sources/tape/Booty.tzx`: the Firebird 1984 release as archived by World of
Spectrum / Spectrum Computing (`pub/sinclair/games/b/Booty.tzx.zip`),
46 106 bytes, SHA1 `1a325b309ccae2dd4e2b54b48fc082574ca852ad`. The tools need
Python 3 with the SkoolKit vendored in svision, and Node.js for the `*.mjs`
tools, which load the game's own code from `app/`.


## Repository layout
| path | contents |
|---|---|
| `app/` | the game — ES modules; the workers are classic scripts |
| `data/` | the data extracted from the original (`global.json`) |
| `tools/` | extraction (`dump*`, `mk*`), recording (`trace*`) and verification (`match*`) tools |
| `db/` | PHP endpoints: game data, hall of fame, statistics |
| `config/` | nginx, database, bundle configuration |
| `images/` | icons, poster, cover |


## Credits
- **Booty** © 1984 John F. Cain, published by Firebird Software. This is an
  unofficial fan remake, not affiliated with the rights holders.
- ZX Spectrum ROM © Amstrad plc, used unmodified for the original's noise
  generator; Amstrad permits its redistribution for non-commercial use.
- Built on the [svision](https://github.com/mitrenga/svision) library.


## License
The remake's source code is licensed under CC BY-NC-SA 4.0, see the
[LICENSE](LICENSE) file. The license does not cover the original game — its
graphics, texts, music and the data extracted from it belong to their
authors.
