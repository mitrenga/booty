#!/usr/bin/env python3
"""Disassembly Booty: obraz paměti → SkoolKit `.ctl` → `.skool`.

    ./tools/mkasm.py                 # sources/asm/booty.skool z booty.ctl
    ./tools/mkasm.py --ctl-from-map build/cov/all.map [--force]

Vstupem je **jen** `bootylib.code_image()` – obraz `$6900`–`$FFFE` složený
z kazety (i s 62 B na `$CD14`), nikdy surový blok `bc` (`ZADANI.md` §1).

`sources/asm/booty.ctl` je ručně udržovaný podklad (STANDARDS.md: disassembly
se commituje). Jeho první podobu vyrobí `--ctl-from-map` ze SkoolKit
`sna2ctl.py` a mapy pokrytí z `playtrace.py --map`; co je ručně, se do
souboru dopisuje a **znovu se negeneruje** (bez `--force` to nástroj odmítne).
`booty.skool` se z `.ctl` dělá vždycky znovu.
"""
import argparse, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as B   # noqa: E402

ASM = os.path.join(B.ROOT, 'sources', 'asm')
CTL = os.path.join(ASM, 'booty.ctl')
SKOOL = os.path.join(ASM, 'booty.skool')
BIN = os.path.join(B.ROOT, 'build', 'booty_code.bin')
SCRIPTS = os.path.join(B.SKOOLKIT, 'skoolkit-10.1.data', 'scripts')

# Co se ví předem a z mapy pokrytí nevyplyne – ★ doložené v sources/docs
FIXED = [
    ('b', 0x6978, 'Titulní obrázek, 6912 B; $CD8A ho LDIR přesune na $4000 '
                  '(disasm_notes.md §1)'),
    ('c', 0x8478, None),   # konec obrázku = $6978 + 6912 = $8478
]


def run(script, *args, out=None):
    env = dict(os.environ, PYTHONPATH=B.SKOOLKIT)
    res = subprocess.run([sys.executable, os.path.join(SCRIPTS, script), *args],
                         env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                         check=True)
    if out:
        open(out, 'wb').write(res.stdout)
    return res.stdout


def ctl_from_map(path, force):
    if os.path.exists(CTL) and not force:
        raise SystemExit('%s uz existuje a je rucne udrzovany – --force ho prepise' % CTL)
    raw = run('sna2ctl.py', '-h', '-o', '0x6900', '-m', path, BIN).decode()
    lines = [l for l in raw.splitlines() if l.strip()]
    lo, hi = 0x6978, 0x6978 + 6912
    out = ['; Booty (Firebird 1984) – disassembly obrazu $6900-$FFFE z tools/bootylib.py',
           '; Prvni podoba z mapy pokryti (tools/mkasm.py --ctl-from-map), dal rucne.']
    for l in lines:
        parts = l.split()
        if len(parts) >= 2 and len(parts[0]) == 1 and parts[1].startswith('$'):
            a = int(parts[1][1:], 16)
            if lo <= a < hi:
                continue            # obrázek: žádné t/c uvnitř
            if a == hi:
                continue
        out.append(l)
    # vložit pevné bloky na správné místo podle adresy
    def key(l):
        p = l.split()
        if l.startswith(';'):
            return -1
        if len(p) >= 2 and p[1].startswith('$'):
            return int(p[1][1:], 16)
        return -1
    body = [l for l in out if not l.startswith(';')]
    head = [l for l in out if l.startswith(';')]
    for kind, addr, text in FIXED:
        if addr == hi:
            # co bylo za obrázkem: typ podle mapy (kód, pokud se vykonal)
            executed = any(int(x.strip()[1:], 16) == addr for x in open(path))
            kind = 'c' if executed else 'b'
        body.append('%s $%04X%s' % (kind, addr, (' ' + text) if text else ''))
    body.sort(key=lambda l: (key(l), 0 if l.startswith('@') else 1))
    open(CTL, 'w').write('\n'.join(head + body) + '\n')
    print('zapsano %s (%d radku)' % (CTL, len(head + body)))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--ctl-from-map', metavar='MAP')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()
    os.makedirs(os.path.dirname(BIN), exist_ok=True)
    os.makedirs(ASM, exist_ok=True)
    open(BIN, 'wb').write(B.code_image())
    if args.ctl_from_map:
        ctl_from_map(args.ctl_from_map, args.force)
    run('sna2skool.py', '-H', '-o', '0x6900', '-c', CTL, BIN, out=SKOOL)
    n = sum(1 for l in open(SKOOL) if l[:1] in 'cbtswu*' or l[:1] == ' ')
    print('zapsano %s (%d radku)' % (SKOOL, n))


if __name__ == '__main__':
    main()
