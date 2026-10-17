#!/usr/bin/env python3
"""Společné čtení kazety a obrazu paměti Booty.

Jedno místo, kde je napsané, co je na kazetě, jak se z ní skládá obraz paměti
a kde v něm co leží. Nástroje `dump*`, `trace*` a `match*` to berou odsud,
aby se ta znalost nemusela opakovat (a rozcházet).

**Booty není od Ultimate a zavaděč nemá nic společného s `RRD`.** Kód na
kazetě zamíchaný není, ale zavaděč je vrstvený (`sources/docs/tape_layout.md`):

1. BASIC `BOOTY` skočí `RANDOMIZE USR (VARS-116)` do strojového kódu
   schovaného v řádku 65295 (čísla viditelná v textu jsou podvržená)
2. ten najde **krátký pilot** (turbo blok, ID $11) přes rutiny ROM
   `LD-EDGE` / `LD-SYNC`, nahraje 71 B na `$5B01` a 62 B z nich přepíše
   začátek programu v BASICu – vznikne řádek 10, který pokračuje zbytkem
   starého řádku: `LOAD "" SCREEN$` / `LOAD "" CODE 26880` /
   `RANDOMIZE USR 26880` / `RANDOMIZE USR 52500`
3. `LOAD "" CODE 26880` **přebije adresu z hlavičky** (`$6518`): 38 655 B
   leží na `$6900`–`$FFFE`
4. `USR 26880` je kopie téhož zavaděče: nahraje druhý turbo blok na `$5B01`
   a 62 B z něj zkopíruje na adresu, kterou si přečte **z jeho vlastních
   dat** (`$5B3F` → `$CD14`) – doprostřed kódu hry
5. `USR 52500` (`$CD14`) nastaví IM 2 a propadne do hry
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAPE = os.path.join(ROOT, 'sources', 'tape', 'Booty.tzx')

# šířka řádku, do které se v data/*.json skládají pole čísel
JSON_WIDTH = 100


def _json_flat(value):
    return not isinstance(value, (dict, list))


def _json_value(value, indent):
    pad = '  ' * indent
    inner = '  ' * (indent + 1)
    if isinstance(value, dict):
        if not value:
            return '{}'
        items = ['%s%s: %s' % (inner, json.dumps(k, ensure_ascii=False), _json_value(v, indent + 1))
                 for k, v in value.items()]
        return '{\n' + ',\n'.join(items) + '\n' + pad + '}'
    if isinstance(value, list):
        if not value:
            return '[]'
        if all(_json_flat(v) for v in value):
            parts = [json.dumps(v, ensure_ascii=False) for v in value]
            one = '[' + ', '.join(parts) + ']'
            if len(pad) + len(one) <= JSON_WIDTH:
                return one
            # dlouhé pole čísel: po řádcích do JSON_WIDTH
            lines, line = [], ''
            for part in parts:
                if line and len(inner) + len(line) + len(part) + 2 > JSON_WIDTH:
                    lines.append(inner + line + ',')
                    line = ''
                line += (', ' if line else '') + part
            lines.append(inner + line)
            return '[\n' + '\n'.join(lines) + '\n' + pad + ']'
        return '[\n' + ',\n'.join(inner + _json_value(v, indent + 1) for v in value) + '\n' + pad + ']'
    return json.dumps(value, ensure_ascii=False)


# data/global.json: všechna data hry v jednom souboru, sekce v tomhle pořadí
# (posílá je db/appData.php pod týmiž klíči); každou sekci zapisuje jeden nástroj
DATA = os.path.join(ROOT, 'data', 'global.json')
DATA_SECTIONS = ('global', 'holds', 'sprites', 'panel', 'texts', 'memory', 'transition',
                 'loading', 'tape', 'title', 'sounds', 'goldfish')


def read_section(name):
    """Sekce `name` z data/global.json, None když tam není."""
    if not os.path.exists(DATA):
        return None
    with open(DATA, encoding='utf8') as f:
        return json.load(f).get(name)


def write_section(name, data):
    """Zapíše sekci `name` do data/global.json, ostatní sekce nechá být."""
    if name not in DATA_SECTIONS:
        raise ValueError('neznámá sekce %s' % name)
    sections = {}
    if os.path.exists(DATA):
        with open(DATA, encoding='utf8') as f:
            sections = json.load(f)
    sections[name] = data
    ordered = {k: sections[k] for k in DATA_SECTIONS if k in sections}
    write_json(DATA, ordered)
    return 'data/global.json#%s' % name


def write_json(path, data):
    """Zapíše data/*.json čitelně: odsazení 2, čeština bez escapování,
    pole čísel na jeden řádek (dlouhá zalomená do JSON_WIDTH), objekty
    rozbalené. Dlouhé řetězce (base64, hex) zůstávají na jednom řádku.
    Stejný tvar dělá `jsonformat.mjs` pro nástroje v Node."""
    with open(path, 'w', encoding='utf8') as f:
        f.write(_json_value(data, 0) + '\n')


def _skoolkit():
    """SkoolKit vendorovaný ve svision (R-008) – přes symlink `app/svision`,
    a dokud `app/` není (M0), přímo ze sdíleného checkoutu vedle projektu."""
    for base in (os.path.join(ROOT, 'app', 'svision'),
                 os.path.join(ROOT, '..', 'svision')):
        p = os.path.join(base, 'sources', 'skoolkit')
        if os.path.isdir(p):
            return os.path.normpath(p)
    raise FileNotFoundError('SkoolKit ve svision/sources/skoolkit neni '
                            '(stahne ho svision/tools/retro/fetchsources.py)')


SKOOLKIT = _skoolkit()
# the shared offline tools of svision (scr2png, pngread …)
RETRO = os.path.normpath(os.path.join(SKOOLKIT, '..', '..', 'tools', 'retro'))

# --- kazeta -----------------------------------------------------------------

TYPES = {0: 'Program', 1: 'Number array', 2: 'Character array', 3: 'Bytes'}


def tzx_version(path=TAPE):
    """Verze obalu TZX jako (major, minor) – např. (1, 0)."""
    raw = open(path, 'rb').read(10)
    if raw[:8] != b'ZXTape!\x1a':
        raise ValueError('%s neni TZX' % path)
    return raw[8], raw[9]


def tzx_blocks(path=TAPE):
    """TZX → seznam bloků jako slovníky.

    Klíče: `id` ($10 standardní, $11 turbo), `flag`, `data` (bez flagu
    a součtu), `ok` (součet XOR sedí), `header` (u hlaviček ROM, jinak None),
    `pause` (ms) a u turbo bloku `timing` (délky pulzů v T-stavech).

    Na kazetě Booty jsou jen ID $10 a $11; na cokoli jiného nástroj schválně
    spadne, aby se nestalo, že se blok tiše přeskočí.

    `pause` je pauza za blokem zapsaná v TZX. **Není to vlastnost hry, ale
    obalu** (u Lunar Jetmana se dva dumpy téže kazety v pauzách lišily při
    totožných datech) – `tapeLoadingModel` se o ni opře jen řádově.
    """
    raw = open(path, 'rb').read()
    if raw[:8] != b'ZXTape!\x1a':
        raise ValueError('%s neni TZX' % path)
    out, i = [], 10
    while i < len(raw):
        bid = raw[i]
        i += 1
        timing = None
        if bid == 0x10:
            pause = raw[i] | (raw[i + 1] << 8)
            length = raw[i + 2] | (raw[i + 3] << 8)
            i += 4
        elif bid == 0x11:
            h = raw[i:i + 18]
            w = lambda k: h[k] | (h[k + 1] << 8)   # noqa: E731
            timing = {'pilot': w(0), 'sync1': w(2), 'sync2': w(4), 'zero': w(6),
                      'one': w(8), 'pilotPulses': w(10), 'lastBits': h[12]}
            pause = w(13)
            length = h[15] | (h[16] << 8) | (h[17] << 16)
            i += 18
        else:
            raise NotImplementedError('blok ID $%02X na offsetu %d' % (bid, i - 1))
        blk = raw[i:i + length]
        i += length
        acc = 0
        for b in blk[:-1]:
            acc ^= b
        flag, body = blk[0], blk[1:-1]
        header = None
        if bid == 0x10 and flag == 0 and len(body) == 17:
            header = {
                'type': body[0],
                'typeName': TYPES.get(body[0], str(body[0])),
                'name': body[1:11].decode('latin1'),
                'length': body[11] | (body[12] << 8),
                'param1': body[13] | (body[14] << 8),
                'param2': body[15] | (body[16] << 8),
            }
        out.append({'id': bid, 'flag': flag, 'data': body, 'ok': acc == blk[-1],
                    'header': header, 'pause': pause, 'timing': timing})
    return out


def _after_header(name, path=TAPE):
    blocks = tzx_blocks(path)
    for i, b in enumerate(blocks):
        if b['header'] and b['header']['name'].strip() == name:
            return b['header'], blocks[i + 1]['data']
    raise LookupError('blok %r na kazete neni' % name)


def basic_program(path=TAPE):
    """Zavaděč `BOOTY`, tak jak ho nahraje ROM (252 B na PROG)."""
    return _after_header('BOOTY', path)[1]


def turbo_blocks(path=TAPE):
    """Dva bezhlavičkové turbo bloky po 71 B dat – v pořadí na kazetě."""
    return [b['data'] for b in tzx_blocks(path) if b['id'] == 0x11]


def loading_screen(path=TAPE):
    """6912 B bloku SCREEN$ `bs` – přesně to, co kazeta nahraje na $4000."""
    hdr, data = _after_header('bs', path)
    assert hdr['param1'] == 0x4000 and len(data) == 6912, (hdr, len(data))
    return data


# --- obraz paměti -----------------------------------------------------------

PROG = 23755            # začátek programu v BASICu (bez mikrodrivu)
LOADER_BUF = 0x5B01     # kam oba turbo bloky nahrají svých 71 B
LOADER_COPY = 62        # kolik z nich zavaděč kopíruje (LD BC,62 / LDIR)
LOADER_DEST = 0x5B3F    # slovo uvnitř bufferu: kam se kopíruje (druhý blok)

CODE_HEADER = 0x6518    # adresa v hlavičce `bc` – BASIC ji přebije
CODE_LOAD = 0x6900      # `LOAD "" CODE 26880`
CODE_LEN = 38655        # $6900–$FFFE
ENTRY = 0xCD14          # `RANDOMIZE USR 52500`


def patch_target(path=TAPE):
    """Kam zavaděč na `$6900` zkopíruje 62 B druhého turbo bloku."""
    data = turbo_blocks(path)[1]
    o = LOADER_DEST - LOADER_BUF
    return data[o] | (data[o + 1] << 8)


def memory_image(path=TAPE):
    """Obraz RAM $4000–$FFFF ve chvíli, kdy BASIC skočí na `USR 52500`.

    Složené **jen z kazety, bez simulátoru**:

    - `$4000` SCREEN$ `bs`
    - `$5B01` druhý turbo blok (71 B) – leží v bufferu tiskárny, kam ho
      nahrál zavaděč; první turbo blok je tím přepsaný
    - `$6900` kód `bc` (38 655 B)
    - `$CD14` 62 B druhého turbo bloku **přes** kód z `bc`

    Systémové proměnné a program v BASICu (`$5C00`–`$68FF`) tu nejsou:
    nejsou vlastností hry, ale ROM a zavaděče, a `matchimage.py` je proto
    nekontroluje.
    """
    mem = bytearray(0xC000)          # $4000–$FFFF
    mem[0:6912] = loading_screen(path)
    t2 = turbo_blocks(path)[1]
    mem[LOADER_BUF - 0x4000:LOADER_BUF - 0x4000 + len(t2)] = t2
    hdr, code = _after_header('bc', path)
    assert hdr['param1'] == CODE_HEADER and len(code) == CODE_LEN, hdr
    mem[CODE_LOAD - 0x4000:CODE_LOAD - 0x4000 + CODE_LEN] = code
    dest = patch_target(path)
    mem[dest - 0x4000:dest - 0x4000 + LOADER_COPY] = t2[:LOADER_COPY]
    return bytes(mem)


def code_image(path=TAPE):
    """Jen kód a data hry: $6900–$FFFE, i s 62 B na `$CD14`."""
    mem = memory_image(path)
    return mem[CODE_LOAD - 0x4000:CODE_LOAD - 0x4000 + CODE_LEN]


def peek(mem, addr, n=1):
    return mem[addr - 0x4000:addr - 0x4000 + n]


def word(mem, addr):
    b = peek(mem, addr, 2)
    return b[0] | (b[1] << 8)


# --- podpalubí (sources/docs/holds.md) ----------------------------------------

HOLD_DATA = 0xABD6      # ★ tabulky všech podpalubí, jak leží na kazetě
HOLD_COUNT = 21         # ★ $AA97 jich napočítá 21 (konec: $FF místo tabulky)
HOLD_CURRENT = 0x5BD3   # číslo podpalubí, které $A804 / $AB44 vybere
HOLD_DRAW = 0xA811      # CALL $AB44 / JP $A900 – vyber a nakresli
CHAR_MAP = 0xA1C4       # mapa znaků 25 × 32, za ní na +$320 mapa atributů
CHARS_SCENERY = 0x8378  # CHARS pro paluby, žebříky, dveře, klíče, kořist
CHARS_CRATES = 0x8678   # CHARS pro bedny (BDAT)

# ★ jedenáct tabulek každého podpalubí v pořadí, v jakém je prochází $AA97
# a $AB44, s délkou záznamu; každá končí $FF. Jména jsou autorova ze zbytku
# zdrojáku (sources/docs/source_remnant.md).
HOLD_TABLES = (('COLDAT', 1), ('DKDAT', 3), ('EODAT', 4), ('LDAT', 2),
               ('SDDAT', 6), ('PHDAT', 3), ('OPST', 16), ('TDAT', 7),
               ('BDAT', 4), ('LIDAT', 16), ('TDDAT', 6))


def holds(path=TAPE):
    """Tabulky podpalubí z kazety: {číslo: {'address': …, jméno: [záznamy]}}.

    ★ V paměti leží sestupně – první od `$ABD6` je podpalubí 21, poslední
    podpalubí 1: `$AB44` bere ukazatel z `$BAA9 + 2·(22 − n)` a `$AA97` je
    ukládá od `$BAAB` v pořadí, v jakém tabulky prochází.
    """
    mem = memory_image(path)
    a = HOLD_DATA
    out = {}
    index = 0
    while mem[a - 0x4000] != 0xFF:
        hold = {'address': a}
        for name, size in HOLD_TABLES:
            records = []
            while mem[a - 0x4000] != 0xFF:
                records.append(list(mem[a - 0x4000:a - 0x4000 + size]))
                a += size
            a += 1
            hold[name] = records
        out[HOLD_COUNT - index] = hold
        index += 1
    assert index == HOLD_COUNT, index
    return out
