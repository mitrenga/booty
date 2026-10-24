#!/usr/bin/env python3
"""Takes the tape (TZX) apart block by block and prints what is on it.

    ./tools/tapinfo.py [--basic]

The output of this is written down in `sources/docs/tape_layout.md`.

`--basic` prints both BASIC programs – the one from the tape and the one the
first turbo block makes of it – and **for every number also its binary
value**: the Booty loader shows different numbers in its text from those ZX
BASIC really computes (`140` is in fact `116`, `PEEK 5` is `PEEK 23627`).
"""
import argparse, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bootylib as L   # noqa: E402

# ZX BASIC tokens from $A5 upwards
TOKENS = ('RND INKEY$ PI FN POINT SCREEN$ ATTR AT TAB VAL$ CODE VAL LEN SIN COS TAN '
          'ASN ACS ATN LN EXP INT SQR SGN ABS PEEK IN USR STR$ CHR$ NOT BIN OR AND '
          '<= >= <> LINE THEN TO STEP DEF-FN CAT FORMAT MOVE ERASE OPEN# CLOSE# MERGE '
          'VERIFY BEEP CIRCLE INK PAPER FLASH BRIGHT INVERSE OVER OUT LPRINT LLIST '
          'STOP READ DATA RESTORE NEW BORDER CONTINUE DIM REM FOR GO-TO GO-SUB INPUT '
          'LOAD LIST LET PAUSE NEXT POKE PRINT PLOT RUN SAVE RANDOMIZE IF CLS DRAW '
          'CLEAR RETURN COPY').split()


def number(b):
    """Five-byte ZX BASIC number (integers in the short form only)."""
    if b[0] == 0:
        v = b[2] | (b[3] << 8)
        return -((v ^ 0xFFFF) + 1) if b[1] == 0xFF else v
    return '<float %s>' % b.hex()


def basic_listing(data):
    """Program lines; after every number its binary value in `{}`, if it differs."""
    out, i = [], 0
    while i + 4 <= len(data):
        line = (data[i] << 8) | data[i + 1]
        ln = data[i + 2] | (data[i + 3] << 8)
        i += 4
        body, i = data[i:i + ln], i + ln
        text, j, digits = [], 0, ''
        while j < len(body):
            c = body[j]
            if c == 0x0E:          # binary form of a number
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
        if line >= 0x4000:          # BASIC reads nothing after a line above 16383
            break
    return out


def rewritten_program(path=L.TAPE):
    """The program after the first turbo block: its 62 B over the start of the old program."""
    old = L.basic_program(path)
    new = L.turbo_blocks(path)[0][:L.LOADER_COPY]
    return new + old[L.LOADER_COPY:]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--basic', action='store_true', help='also print the BASIC loader')
    ap.add_argument('tape', nargs='?', default=L.TAPE)
    args = ap.parse_args()

    blocks = L.tzx_blocks(args.tape)
    print('%s: TZX %d.%d, %d blocks'
          % (os.path.basename(args.tape), *L.tzx_version(args.tape), len(blocks)))
    for n, b in enumerate(blocks, 1):
        kind = 'header  ' if b['flag'] == 0 else 'data    '
        line = '  %d. ID $%02X %s %5d B  checksum %s  pause %4d ms' % (
            n, b['id'], kind, len(b['data']), 'OK' if b['ok'] else 'ERROR', b['pause'])
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
    print('the copy of the second turbo block goes to $%04X' % L.patch_target(args.tape))
    if args.basic:
        print('\nBASIC loader as it is on the tape:')
        for l in basic_listing(L.basic_program(args.tape)):
            print('  ' + l)
        print('\nprogram after the first turbo block (beyond it is only the machine code of the loader):')
        for l in basic_listing(rewritten_program(args.tape))[:1]:
            print('  ' + l)


if __name__ == '__main__':
    main()
