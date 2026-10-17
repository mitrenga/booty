#!/usr/bin/env python3
"""Rozebere kazetu (TZX) blok po bloku a vypíše, co na ní je.

    ./tools/tapinfo.py [--basic]

Výstup téhle věci je zapsaný v `sources/docs/tape_layout.md`.

`--basic` vypíše oba programy v BASICu – ten z kazety a ten, který z něj
udělá první turbo blok – a **u každého čísla i jeho binární hodnotu**:
zavaděč Booty ukazuje v textu jiná čísla, než jaká ZX BASIC opravdu počítá
(`140` je ve skutečnosti `116`, `PEEK 5` je `PEEK 23627`).
"""
import argparse, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as L   # noqa: E402

# tokeny ZX BASICu od $A5 výš
TOKENS = ('RND INKEY$ PI FN POINT SCREEN$ ATTR AT TAB VAL$ CODE VAL LEN SIN COS TAN '
          'ASN ACS ATN LN EXP INT SQR SGN ABS PEEK IN USR STR$ CHR$ NOT BIN OR AND '
          '<= >= <> LINE THEN TO STEP DEF-FN CAT FORMAT MOVE ERASE OPEN# CLOSE# MERGE '
          'VERIFY BEEP CIRCLE INK PAPER FLASH BRIGHT INVERSE OVER OUT LPRINT LLIST '
          'STOP READ DATA RESTORE NEW BORDER CONTINUE DIM REM FOR GO-TO GO-SUB INPUT '
          'LOAD LIST LET PAUSE NEXT POKE PRINT PLOT RUN SAVE RANDOMIZE IF CLS DRAW '
          'CLEAR RETURN COPY').split()


def number(b):
    """Pětibajtové číslo ZX BASICu (jen celá čísla v krátkém tvaru)."""
    if b[0] == 0:
        v = b[2] | (b[3] << 8)
        return -((v ^ 0xFFFF) + 1) if b[1] == 0xFF else v
    return '<float %s>' % b.hex()


def basic_listing(data):
    """Řádky programu; za každým číslem v `{}` jeho binární hodnota, liší-li se."""
    out, i = [], 0
    while i + 4 <= len(data):
        line = (data[i] << 8) | data[i + 1]
        ln = data[i + 2] | (data[i + 3] << 8)
        i += 4
        body, i = data[i:i + ln], i + ln
        text, j, digits = [], 0, ''
        while j < len(body):
            c = body[j]
            if c == 0x0E:          # binární podoba čísla
                v = number(body[j + 1:j + 6])
                if digits and str(v) != digits:
                    text.append('{=%s}' % v)
                digits = ''
                j += 6
                continue
            if c == 0x0D:
                break
            if chr(c) in '0123456789.' and c < 127:
                digits += chr(c)
            else:
                digits = ''
            if c >= 0xA5:
                text.append(' %s ' % TOKENS[c - 0xA5].replace('-', ' '))
            elif c == 0x10:
                text.append('<INK %d>' % body[j + 1]); j += 1
            elif c == 0x11:
                text.append('<PAPER %d>' % body[j + 1]); j += 1
            elif c == 0x12:
                text.append('<FLASH %d>' % body[j + 1]); j += 1
            elif c == 0x13:
                text.append('<BRIGHT %d>' % body[j + 1]); j += 1
            elif 32 <= c < 127:
                text.append(chr(c))
            else:
                text.append('[%02X]' % c)
            j += 1
        out.append('%5d %s' % (line, ''.join(text)))
        if line >= 0x4000:          # za řádkem nad 16383 už BASIC nic nečte
            break
    return out


def rewritten_program(path=L.TAPE):
    """Program po prvním turbo bloku: jeho 62 B přes začátek starého programu."""
    old = L.basic_program(path)
    new = L.turbo_blocks(path)[0][:L.LOADER_COPY]
    return new + old[L.LOADER_COPY:]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--basic', action='store_true', help='vypsat i zavaděč v BASICu')
    ap.add_argument('tape', nargs='?', default=L.TAPE)
    args = ap.parse_args()

    blocks = L.tzx_blocks(args.tape)
    print('%s: TZX %d.%d, %d bloků'
          % (os.path.basename(args.tape), *L.tzx_version(args.tape), len(blocks)))
    for n, b in enumerate(blocks, 1):
        kind = 'hlavička' if b['flag'] == 0 else 'data    '
        line = '  %d. ID $%02X %s %5d B  součet %s  pauza %4d ms' % (
            n, b['id'], kind, len(b['data']), 'OK' if b['ok'] else 'CHYBA', b['pause'])
        hdr = b['header']
        if hdr:
            line += "   %-8s '%s'  %5d B  -> $%04X" % (
                hdr['typeName'], hdr['name'], hdr['length'], hdr['param1'])
            if hdr['type'] == 0:
                line += '  (autostart %d, program %d B)' % (hdr['param1'], hdr['param2'])
        t = b['timing']
        if t:
            line += ('   TURBO pilot %d×%d T, sync %d/%d, 0=%d 1=%d'
                     % (t['pilotPulses'], t['pilot'], t['sync1'], t['sync2'],
                        t['zero'], t['one']))
        print(line)
    print('kopie druhého turbo bloku jde na $%04X' % L.patch_target(args.tape))
    if args.basic:
        print('\nzavaděč v BASICu, jak je na kazetě:')
        for l in basic_listing(L.basic_program(args.tape)):
            print('  ' + l)
        print('\nprogram po prvním turbo bloku (dál je jen strojový kód zavaděče):')
        for l in basic_listing(rewritten_program(args.tape))[:1]:
            print('  ' + l)


if __name__ == '__main__':
    main()
