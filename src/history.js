/**
 * Reading shell history files.
 *
 * Four shells, four formats, one shape coming out: { command, time }. The time
 * is null whenever the shell did not record one, which is the normal case for
 * bash without HISTTIMEFORMAT and always the case for PowerShell.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Histories this size are a sign something is wrong; refuse rather than hang. */
export const MAX_BYTES = 200 * 1024 * 1024;

/**
 * zsh, with EXTENDED_HISTORY on, writes
 *
 *     : 1690000000:0;git status
 *
 * and without it, the bare command. A command containing newlines is stored on
 * several lines, each but the last ending in a backslash.
 */
export function parseZsh(text) {
  const entries = [];
  let current = null;

  for (const line of lines(text)) {
    const extended = /^: (\d+):\d*;([\s\S]*)$/.exec(line);

    if (extended) {
      if (current) entries.push(current);
      current = { command: extended[2], time: Number(extended[1]) };
    } else if (current && current.command.endsWith('\\')) {
      current.command = `${current.command.slice(0, -1)}\n${line}`;
    } else {
      if (current) entries.push(current);
      current = line.trim() ? { command: line, time: null } : null;
    }
  }

  if (current) entries.push(current);
  return entries.filter((entry) => entry.command.trim());
}

/**
 * bash writes one command per line. With HISTTIMEFORMAT set it puts a
 * `#<epoch>` line in front of each one.
 */
export function parseBash(text) {
  const entries = [];
  let pending = null;

  for (const line of lines(text)) {
    const stamp = /^#(\d{9,})\s*$/.exec(line);
    if (stamp) {
      pending = Number(stamp[1]);
      continue;
    }
    if (!line.trim()) continue;

    entries.push({ command: line, time: pending });
    pending = null;
  }

  return entries;
}

/**
 * fish writes a YAML-ish block per command:
 *
 *     - cmd: git status
 *       when: 1690000000
 *       paths:
 *         - src/index.js
 */
export function parseFish(text) {
  const entries = [];
  let current = null;

  for (const line of lines(text)) {
    const command = /^- cmd: ([\s\S]*)$/.exec(line);
    if (command) {
      if (current) entries.push(current);
      current = { command: unescapeFish(command[1]), time: null };
      continue;
    }

    const when = /^\s+when:\s*(\d+)/.exec(line);
    if (when && current) current.time = Number(when[1]);
  }

  if (current) entries.push(current);
  return entries.filter((entry) => entry.command.trim());
}

/**
 * PSReadLine writes plain lines with no timestamps. A command spanning several
 * lines ends each one with a backtick.
 */
export function parsePowerShell(text) {
  const entries = [];
  let buffer = null;

  for (const line of lines(text)) {
    const continued = line.endsWith('`');
    const piece = continued ? line.slice(0, -1) : line;

    buffer = buffer === null ? piece : `${buffer}\n${piece}`;
    if (continued) continue;

    if (buffer.trim()) entries.push({ command: buffer, time: null });
    buffer = null;
  }

  if (buffer !== null && buffer.trim()) entries.push({ command: buffer, time: null });
  return entries;
}

export const PARSERS = {
  zsh: parseZsh,
  bash: parseBash,
  fish: parseFish,
  powershell: parsePowerShell,
};

/**
 * Where each shell keeps its history on this machine.
 *
 * @returns {{ shell: string, file: string }[]} every candidate, existing or not
 */
export function candidates({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  const data = env.XDG_DATA_HOME || join(home, '.local', 'share');
  const found = [
    { shell: 'zsh', file: env.HISTFILE && env.SHELL?.includes('zsh') ? env.HISTFILE : join(home, '.zsh_history') },
    { shell: 'bash', file: join(home, '.bash_history') },
    { shell: 'fish', file: join(data, 'fish', 'fish_history') },
  ];

  if (platform === 'win32' && env.APPDATA) {
    found.push({
      shell: 'powershell',
      file: join(env.APPDATA, 'Microsoft', 'Windows', 'PowerShell', 'PSReadLine', 'ConsoleHost_history.txt'),
    });
  } else {
    found.push({ shell: 'powershell', file: join(data, 'powershell', 'PSReadLine', 'ConsoleHost_history.txt') });
  }

  return found;
}

/** The candidates that actually exist and hold something. */
export function available(options) {
  return candidates(options).filter((candidate) => {
    try {
      return existsSync(candidate.file) && statSync(candidate.file).size > 0;
    } catch {
      return false;
    }
  });
}

/**
 * Read and parse one history file.
 *
 * @param {{ shell: string, file: string }} source
 */
export function read(source) {
  const size = statSync(source.file).size;
  if (size > MAX_BYTES) {
    throw new Error(`${source.file} is ${Math.round(size / 1024 / 1024)} MB, which is too big to be a history file.`);
  }

  // Histories collect whatever bytes the terminal sent; latin1 never throws
  // and utf8 is what modern shells write, so try the strict one and fall back.
  const raw = readFileSync(source.file);
  const text = raw.toString('utf8').replace(/^﻿/, '');

  return PARSERS[source.shell](text).map((entry) => ({ ...entry, shell: source.shell }));
}

function lines(text) {
  return text.split(/\r?\n/);
}

function unescapeFish(value) {
  return value.replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
}
