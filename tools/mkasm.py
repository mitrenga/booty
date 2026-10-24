#!/usr/bin/env python3
"""Booty disassembly: memory image → SkoolKit `.ctl` → `.skool`.

    ./tools/mkasm.py                 # sources/asm/booty.skool from booty.ctl
    ./tools/mkasm.py --ctl-from-map build/cov/all.map [--force]

The input is **only** `bootylib.code_image()` – the `$6900`–`$FFFE` image
assembled from the tape (including the 62 B at `$CD14`), never the raw `bc`
block (`ZADANI.md` §1).

`sources/asm/booty.ctl` is a hand-maintained source (STANDARDS.md: the
disassembly is committed). Its first form is produced by `--ctl-from-map` from
SkoolKit `sna2ctl.py` and the coverage map from `playtrace.py --map`; what is
done by hand is added to the file and **is never regenerated** (without
`--force` the tool refuses). `booty.skool` is always made from the `.ctl` anew.
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

# What is known beforehand and does not follow from the coverage map – ★ documented in sources/docs
FIXED = [
    ('b', 0x6978, 'Title picture, 6912 B; $CD8A moves it to $4000 with LDIR '
                  '(disasm_notes.md §1)'),
    ('c', 0x8478, None),   # end of the picture = $6978 + 6912 = $8478
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
        raise SystemExit('%s already exists and is maintained by hand – --force overwrites it' % CTL)
    raw = run('sna2ctl.py', '-h', '-o', '0x6900', '-m', path, BIN).decode()
    lines = [l for l in raw.splitlines() if l.strip()]
    lo, hi = 0x6978, 0x6978 + 6912
    out = ['; Booty (Firebird 1984) - disassembly of the image $6900-$FFFE from tools/bootylib.py',
           '; First shape from the coverage map (tools/mkasm.py --ctl-from-map), then by hand.']
    for l in lines:
        parts = l.split()
        if len(parts) >= 2 and len(parts[0]) == 1 and parts[1].startswith('$'):
            a = int(parts[1][1:], 16)
            if lo <= a < hi:
                continue            # picture: no t/c inside
            if a == hi:
                continue
        out.append(l)
    # insert the fixed blocks at the right place by address
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
            # what was after the picture: type by the map (code, if it was executed)
            executed = any(int(x.strip()[1:], 16) == addr for x in open(path))
            kind = 'c' if executed else 'b'
        body.append('%s $%04X%s' % (kind, addr, (' ' + text) if text else ''))
    body.sort(key=lambda l: (key(l), 0 if l.startswith('@') else 1))
    open(CTL, 'w').write('\n'.join(head + body) + '\n')
    print('written %s (%d lines)' % (CTL, len(head + body)))


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
    print('written %s (%d lines)' % (SKOOL, n))


if __name__ == '__main__':
    main()
