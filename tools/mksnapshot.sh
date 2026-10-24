#!/bin/sh
# Makes a snapshot and a RAM image from the tape at the moment BASIC jumps to
# RANDOMIZE USR 52500 ($CD14) – i.e. after all eight blocks have loaded, just
# before IM 2 is installed and the game is entered. Needs sources/tape/Booty.tzx
# (outside git, see sources/tape/README.md) and SkoolKit in svision (R-008).
#
# The tape has two turbo blocks (ID $11) and a loader that reads them through
# the ROM routines with its own pilot search (sources/docs/tape_layout.md). The
# simulated load in tap2sna.py really executes it, so the snapshot is an
# independent check of what tools/bootylib.py assembles from the tape –
# tools/matchimage.py compares them.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SK=$(cd "$ROOT/tools" && python3 -c 'import bootylib; print(bootylib.SKOOLKIT)')
TAPE="$ROOT/sources/tape/Booty.tzx"
mkdir -p "$ROOT/build"
[ -f "$TAPE" ] || { echo "missing $TAPE - see sources/tape/README.md"; exit 1; }
PYTHONPATH="$SK" python3 "$SK/skoolkit-10.1.data/scripts/tap2sna.py" \
    --start 0xCD14 "$TAPE" "$ROOT/build/booty.z80"
PYTHONPATH="$SK" python3 - "$ROOT" <<'PY'
import sys
from skoolkit.snapshot import Snapshot
root = sys.argv[1]
ram = bytes(Snapshot.get(root + '/build/booty.z80').ram(-1))
open(root + '/build/booty.bin', 'wb').write(ram)
print('build/booty.bin: RAM $4000-$FFFF, %d B' % len(ram))
PY
