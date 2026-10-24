#!/usr/bin/env python3
"""Shared reading of the Booty tape and memory image.

One place that states what is on the tape, how the memory image is assembled
from it and where things lie in it. The `dump*`, `trace*` and `match*` tools
take it from here so that knowledge is not repeated (and does not drift apart).

**Booty is not by Ultimate and the loader has nothing to do with `RRD`.** The
code on the tape is not scrambled, but the loader is layered
(`sources/docs/tape_layout.md`):

1. BASIC `BOOTY` jumps `RANDOMIZE USR (VARS-116)` into machine code hidden in
   line 65295 (the numbers visible in the text are fake)
2. that one finds a **short pilot** (turbo block, ID $11) through the ROM
   routines `LD-EDGE` / `LD-SYNC`, loads 71 B to `$5B01` and 62 B of them
   overwrite the start of the BASIC program – line 10 appears, continuing with
   the rest of the old line: `LOAD "" SCREEN$` / `LOAD "" CODE 26880` /
   `RANDOMIZE USR 26880` / `RANDOMIZE USR 52500`
3. `LOAD "" CODE 26880` **overrides the address from the header** (`$6518`):
   38 655 B lie at `$6900`–`$FFFE`
4. `USR 26880` is a copy of the same loader: it loads the second turbo block
   to `$5B01` and copies 62 B of it to an address it reads **from its own
   data** (`$5B3F` → `$CD14`) – into the middle of the game code
5. `USR 52500` (`$CD14`) sets IM 2 and falls through into the game
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAPE = os.path.join(ROOT, 'sources', 'tape', 'Booty.tzx')

# line width into which arrays of numbers are wrapped in data/*.json
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
            # long array of numbers: line by line up to JSON_WIDTH
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


# data/global.json: all game data in one file, sections in this order
# (db/appData.php sends them under the same keys); each section is written by one tool
DATA = os.path.join(ROOT, 'data', 'global.json')
DATA_SECTIONS = ('global', 'holds', 'sprites', 'panel', 'texts', 'memory', 'transition',
                 'loading', 'tape', 'title', 'sounds', 'goldfish')


def read_section(name):
    """Section `name` from data/global.json, None when it is not there."""
    if not os.path.exists(DATA):
        return None
    with open(DATA, encoding='utf8') as f:
        return json.load(f).get(name)


def write_section(name, data):
    """Writes section `name` into data/global.json, leaves the other sections alone."""
    if name not in DATA_SECTIONS:
        raise ValueError('unknown section %s' % name)
    sections = {}
    if os.path.exists(DATA):
        with open(DATA, encoding='utf8') as f:
            sections = json.load(f)
    sections[name] = data
    ordered = {k: sections[k] for k in DATA_SECTIONS if k in sections}
    write_json(DATA, ordered)
    return 'data/global.json#%s' % name


def write_json(path, data):
    """Writes data/*.json readably: indent 2, non-ASCII text unescaped,
    arrays of numbers on one line (long ones wrapped to JSON_WIDTH), objects
    expanded. Long strings (base64, hex) stay on one line.
    `jsonformat.mjs` produces the same shape for the Node tools."""
    with open(path, 'w', encoding='utf8') as f:
        f.write(_json_value(data, 0) + '\n')


def _skoolkit():
    """SkoolKit vendored in svision (R-008) – through the `app/svision` symlink,
    and while `app/` does not exist yet (M0), directly from the shared checkout
    next to the project."""
    for base in (os.path.join(ROOT, 'app', 'svision'),
                 os.path.join(ROOT, '..', 'svision')):
        p = os.path.join(base, 'sources', 'skoolkit')
        if os.path.isdir(p):
            return os.path.normpath(p)
    raise FileNotFoundError('SkoolKit is not in svision/sources/skoolkit '
                            '(svision/tools/retro/fetchsources.py downloads it)')


SKOOLKIT = _skoolkit()
# the shared offline tools of svision (scr2png, pngread …)
RETRO = os.path.normpath(os.path.join(SKOOLKIT, '..', '..', 'tools', 'retro'))

# --- tape -------------------------------------------------------------------

TYPES = {0: 'Program', 1: 'Number array', 2: 'Character array', 3: 'Bytes'}


def tzx_version(path=TAPE):
    """Version of the TZX container as (major, minor) – e.g. (1, 0)."""
    raw = open(path, 'rb').read(10)
    if raw[:8] != b'ZXTape!\x1a':
        raise ValueError('%s is not a TZX' % path)
    return raw[8], raw[9]


def tzx_blocks(path=TAPE):
    """TZX → list of blocks as dicts.

    Keys: `id` ($10 standard, $11 turbo), `flag`, `data` (without the flag
    and checksum), `ok` (XOR checksum matches), `header` (for ROM headers,
    otherwise None), `pause` (ms) and for a turbo block `timing` (pulse
    lengths in T-states).

    The Booty tape has only IDs $10 and $11; on anything else the tool
    deliberately fails, so that a block is never silently skipped.

    `pause` is the pause after the block as written in the TZX. **It is not a
    property of the game but of the container** (with Lunar Jetman two dumps
    of the same tape differed in the pauses with identical data) –
    `tapeLoadingModel` relies on it only as an order of magnitude.
    """
    raw = open(path, 'rb').read()
    if raw[:8] != b'ZXTape!\x1a':
        raise ValueError('%s is not a TZX' % path)
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
            raise NotImplementedError('block ID $%02X at offset %d' % (bid, i - 1))
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
    raise LookupError('block %r is not on the tape' % name)


def basic_program(path=TAPE):
    """The `BOOTY` loader as the ROM loads it (252 B at PROG)."""
    return _after_header('BOOTY', path)[1]


def turbo_blocks(path=TAPE):
    """The two headerless turbo blocks of 71 B of data each – in tape order."""
    return [b['data'] for b in tzx_blocks(path) if b['id'] == 0x11]


def loading_screen(path=TAPE):
    """6912 B of the SCREEN$ block `bs` – exactly what the tape loads to $4000."""
    hdr, data = _after_header('bs', path)
    assert hdr['param1'] == 0x4000 and len(data) == 6912, (hdr, len(data))
    return data


# --- memory image -----------------------------------------------------------

PROG = 23755            # start of the BASIC program (without Microdrive)
LOADER_BUF = 0x5B01     # where both turbo blocks load their 71 B
LOADER_COPY = 62        # how much of them the loader copies (LD BC,62 / LDIR)
LOADER_DEST = 0x5B3F    # word inside the buffer: where it is copied to (second block)

CODE_HEADER = 0x6518    # address in the `bc` header – BASIC overrides it
CODE_LOAD = 0x6900      # `LOAD "" CODE 26880`
CODE_LEN = 38655        # $6900–$FFFE
ENTRY = 0xCD14          # `RANDOMIZE USR 52500`


def patch_target(path=TAPE):
    """Where the loader at `$6900` copies the 62 B of the second turbo block."""
    data = turbo_blocks(path)[1]
    o = LOADER_DEST - LOADER_BUF
    return data[o] | (data[o + 1] << 8)


def memory_image(path=TAPE):
    """Image of RAM $4000–$FFFF at the moment BASIC jumps to `USR 52500`.

    Assembled **from the tape only, without a simulator**:

    - `$4000` SCREEN$ `bs`
    - `$5B01` second turbo block (71 B) – lies in the printer buffer, where the
      loader put it; the first turbo block is overwritten by it
    - `$6900` code `bc` (38 655 B)
    - `$CD14` 62 B of the second turbo block **over** the code from `bc`

    System variables and the BASIC program (`$5C00`–`$68FF`) are not here:
    they are not a property of the game but of the ROM and the loader, and
    `matchimage.py` therefore does not check them.
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
    """Game code and data only: $6900–$FFFE, including the 62 B at `$CD14`."""
    mem = memory_image(path)
    return mem[CODE_LOAD - 0x4000:CODE_LOAD - 0x4000 + CODE_LEN]


def peek(mem, addr, n=1):
    return mem[addr - 0x4000:addr - 0x4000 + n]


def word(mem, addr):
    b = peek(mem, addr, 2)
    return b[0] | (b[1] << 8)


# --- holds (sources/docs/holds.md) --------------------------------------------

HOLD_DATA = 0xABD6      # ★ tables of all holds as they lie on the tape
HOLD_COUNT = 21         # ★ $AA97 counts 21 of them (end: $FF instead of a table)
HOLD_CURRENT = 0x5BD3   # number of the hold that $A804 / $AB44 selects
HOLD_DRAW = 0xA811      # CALL $AB44 / JP $A900 – select and draw
CHAR_MAP = 0xA1C4       # character map 25 × 32, followed at +$320 by the attribute map
CHARS_SCENERY = 0x8378  # CHARS for decks, ladders, doors, keys, loot
CHARS_CRATES = 0x8678   # CHARS for crates (BDAT)

# ★ the eleven tables of each hold in the order $AA97 and $AB44 walk them,
# with the record length; each ends with $FF. The names are the author's, from
# the source remnant (sources/docs/source_remnant.md).
HOLD_TABLES = (('COLDAT', 1), ('DKDAT', 3), ('EODAT', 4), ('LDAT', 2),
               ('SDDAT', 6), ('PHDAT', 3), ('OPST', 16), ('TDAT', 7),
               ('BDAT', 4), ('LIDAT', 16), ('TDDAT', 6))


def holds(path=TAPE):
    """Hold tables from the tape: {number: {'address': …, name: [records]}}.

    ★ In memory they lie in descending order – the first from `$ABD6` is hold
    21, the last is hold 1: `$AB44` takes the pointer from `$BAA9 + 2·(22 − n)`
    and `$AA97` stores them from `$BAAB` in the order it walks the tables.
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
