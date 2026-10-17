#!/bin/sh
# Z kazety udělá snapshot a obraz RAM ve chvíli, kdy BASIC skočí na
# RANDOMIZE USR 52500 ($CD14) – tedy po nahrání všech osmi bloků, těsně před
# instalací IM 2 a vstupem do hry. Potřebuje sources/tape/Booty.tzx (mimo git,
# viz sources/tape/README.md) a SkoolKit ve svision (R-008).
#
# Kazeta má dva turbo bloky (ID $11) a zavaděč, který je čte přes rutiny ROM
# s vlastním hledáním pilotu (sources/docs/tape_layout.md). Simulované nahrání
# v tap2sna.py ho doopravdy provede, takže snapshot je nezávislá kontrola toho,
# co z kazety skládá tools/bootylib.py – porovná ho tools/matchimage.py.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SK=$(cd "$ROOT/tools" && python3 -c 'import bootylib; print(bootylib.SKOOLKIT)')
TAPE="$ROOT/sources/tape/Booty.tzx"
mkdir -p "$ROOT/build"
[ -f "$TAPE" ] || { echo "chybi $TAPE - viz sources/tape/README.md"; exit 1; }
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
