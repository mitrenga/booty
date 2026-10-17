/**
 * `data/global.json` z nástrojů v Node – tentýž tvar a tytéž sekce jako
 * `write_json` / `read_section` / `write_section` v `bootylib.py`:
 * odsazení 2, pole čísel na jeden řádek (dlouhá zalomená do `JSON_WIDTH`),
 * objekty rozbalené.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

export const DATA = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'data', 'global.json');
export const DATA_SECTIONS = ['global', 'holds', 'sprites', 'panel', 'texts', 'memory', 'transition',
                              'loading', 'tape', 'title', 'sounds', 'goldfish'];

export const JSON_WIDTH = 100;

function flat(value) {
  return value === null || typeof value !== 'object';
}

function format(value, indent) {
  const pad = '  '.repeat(indent);
  const inner = '  '.repeat(indent+1);
  if (Array.isArray(value)) {
    if (!value.length) { return '[]'; }
    if (value.every(flat)) {
      const parts = value.map((v) => JSON.stringify(v));
      const one = '['+parts.join(', ')+']';
      if (pad.length+one.length <= JSON_WIDTH) { return one; }
      // a long array of numbers: in lines up to JSON_WIDTH
      const lines = [];
      let line = '';
      parts.forEach((part) => {
        if (line && inner.length+line.length+part.length+2 > JSON_WIDTH) {
          lines.push(inner+line+',');
          line = '';
        }
        line += (line ? ', ' : '')+part;
      });
      lines.push(inner+line);
      return '[\n'+lines.join('\n')+'\n'+pad+']';
    }
    return '[\n'+value.map((v) => inner+format(v, indent+1)).join(',\n')+'\n'+pad+']';
  }
  if (!flat(value)) {
    const keys = Object.keys(value);
    if (!keys.length) { return '{}'; }
    return '{\n'+keys.map((k) => inner+JSON.stringify(k)+': '+format(value[k], indent+1)).join(',\n')+'\n'+pad+'}';
  }
  return JSON.stringify(value);
}

/** writes `data` to `file` the way bootylib.write_json does */
export function writeJson(file, data) {
  fs.writeFileSync(file, format(data, 0)+'\n');
}

/** section `name` of data/global.json, null when it is not there */
export function readSection(name) {
  if (!fs.existsSync(DATA)) { return null; }
  const value = JSON.parse(fs.readFileSync(DATA, 'utf8'))[name];
  return value === undefined ? null : value;
}

/** writes section `name` of data/global.json, the others stay */
export function writeSection(name, data) {
  if (!DATA_SECTIONS.includes(name)) { throw new Error('neznámá sekce '+name); }
  const sections = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, 'utf8')) : {};
  sections[name] = data;
  const ordered = {};
  DATA_SECTIONS.forEach((k) => { if (k in sections) { ordered[k] = sections[k]; } });
  writeJson(DATA, ordered);
  return 'data/global.json#'+name;
}
