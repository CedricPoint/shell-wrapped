#!/usr/bin/env node
/**
 * shell-wrapped — what your shell history says about your year.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { available, candidates, read } from '../src/history.js';
import { analyse } from '../src/stats.js';
import { render, color } from '../src/terminal.js';
import { card } from '../src/card.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));

const EXIT = { ok: 0, empty: 1, error: 2 };

const HELP = `
  ${color.bold('shell-wrapped')} — what your shell history says about your year

  ${color.bold('Usage')}
    shell-wrapped                     Read every history found and report
    shell-wrapped --svg card.svg      Also write the shareable card
    shell-wrapped --year 2026         Only this year
    shell-wrapped --list              Show which history files were found

  ${color.bold('Options')}
        --shell <name>   bash | zsh | fish | powershell
        --file <path>    Read this file instead of the usual places
        --year <yyyy>    Only commands from that year
        --days <n>       Only the last n days
        --svg <path>     Write the 1200×630 card there
        --theme <name>   dark (default) or light
        --json           The whole report as JSON
    -h, --help           This text
    -v, --version        Print the version

  Everything happens on this machine, and the report never contains an
  argument from your history — only command names, counts and times.
`;

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`shell-wrapped: ${error.message}\n`);
    process.exitCode = EXIT.error;
  });

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    process.stdout.write(`${HELP}\n`);
    return EXIT.ok;
  }
  if (flags.version) {
    process.stdout.write(`${pkg.version}\n`);
    return EXIT.ok;
  }
  if (flags.list) return listCommand();

  const sources = chooseSources(flags);
  if (!sources.length) {
    process.stderr.write(
      'shell-wrapped: no history file found. Try --list to see where I looked, or pass --file.\n',
    );
    return EXIT.error;
  }

  const entries = [];
  for (const source of sources) {
    try {
      entries.push(...read(source));
    } catch (error) {
      process.stderr.write(`shell-wrapped: skipping ${source.file} (${error.message})\n`);
    }
  }

  const filtered = filterByTime(entries, flags);
  const report = analyse(filtered);

  if (flags.svg) {
    const path = resolve(flags.svg);
    writeFileSync(path, `${card(report, { theme: flags.theme })}\n`, 'utf8');
    if (!flags.json) process.stdout.write(`\n  ${color.grey('card written to')} ${path}\n`);
  }

  if (flags.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${render(report)}\n`);

  return report.totals.commands ? EXIT.ok : EXIT.empty;
}

function parseArgs(argv) {
  const flags = { theme: 'dark' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') flags.help = true;
    else if (arg === '-v' || arg === '--version') flags.version = true;
    else if (arg === '--list') flags.list = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--shell') flags.shell = argv[++i];
    else if (arg === '--file') flags.file = argv[++i];
    else if (arg === '--svg') flags.svg = argv[++i];
    else if (arg === '--theme') flags.theme = argv[++i];
    else if (arg === '--year') flags.year = Number(argv[++i]);
    else if (arg === '--days') flags.days = Number(argv[++i]);
    else throw new Error(`unknown option "${arg}". Try --help.`);
  }

  if (flags.theme !== 'dark' && flags.theme !== 'light') {
    throw new Error(`unknown theme "${flags.theme}". Use dark or light.`);
  }

  return flags;
}

function chooseSources(flags) {
  if (flags.file) {
    const shell = flags.shell ?? guessShell(flags.file);
    if (!shell) throw new Error('I cannot tell which shell wrote that file. Add --shell.');
    return [{ shell, file: resolve(flags.file) }];
  }

  const found = available();
  return flags.shell ? found.filter((source) => source.shell === flags.shell) : found;
}

function guessShell(file) {
  const name = file.toLowerCase();
  if (name.includes('zsh')) return 'zsh';
  if (name.includes('bash')) return 'bash';
  if (name.includes('fish')) return 'fish';
  if (name.includes('consolehost') || name.includes('psreadline')) return 'powershell';
  return null;
}

function filterByTime(entries, flags) {
  if (!flags.year && !flags.days) return entries;

  const from = flags.days ? Date.now() / 1000 - flags.days * 86400 : null;

  return entries.filter((entry) => {
    if (!entry.time) return false;
    if (from && entry.time < from) return false;
    if (flags.year && new Date(entry.time * 1000).getFullYear() !== flags.year) return false;
    return true;
  });
}

function listCommand() {
  const everywhere = candidates();
  const found = new Set(available().map((source) => source.file));

  process.stdout.write('\n');
  for (const source of everywhere) {
    const mark = found.has(source.file) ? color.green('found  ') : color.grey('missing');
    process.stdout.write(`  ${mark}  ${source.shell.padEnd(11)} ${color.grey(source.file)}\n`);
  }
  process.stdout.write('\n');

  return found.size ? EXIT.ok : EXIT.empty;
}
