import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseBash, parseFish, parsePowerShell, parseZsh, candidates } from '../src/history.js';

test('zsh extended history', () => {
  const entries = parseZsh([': 1690000000:0;git status', ': 1690000060:12;npm run dev', ''].join('\n'));

  assert.deepEqual(entries, [
    { command: 'git status', time: 1690000000 },
    { command: 'npm run dev', time: 1690000060 },
  ]);
});

test('zsh without timestamps, and across several lines', () => {
  const entries = parseZsh(['git status', 'for f in *; do \\', '  echo $f; \\', 'done'].join('\n'));

  assert.equal(entries.length, 2);
  assert.equal(entries[0].command, 'git status');
  assert.equal(entries[0].time, null);
  assert.match(entries[1].command, /^for f in \*; do \n/);
  assert.match(entries[1].command, /done$/);
});

test('bash, with and without HISTTIMEFORMAT', () => {
  assert.deepEqual(parseBash(['ls -la', 'git push'].join('\n')), [
    { command: 'ls -la', time: null },
    { command: 'git push', time: null },
  ]);

  assert.deepEqual(parseBash(['#1690000000', 'ls -la', '#1690000030', 'git push'].join('\n')), [
    { command: 'ls -la', time: 1690000000 },
    { command: 'git push', time: 1690000030 },
  ]);
});

test('a comment in bash history is not mistaken for a timestamp', () => {
  const entries = parseBash(['# a note to self', 'ls'].join('\n'));

  assert.equal(entries.length, 2);
  assert.equal(entries[0].command, '# a note to self');
});

test('fish history, paths and escapes included', () => {
  const entries = parseFish(
    ['- cmd: git commit -m "two lines\\nhere"', '  when: 1690000000', '  paths:', '    - src/index.js', '- cmd: ls', '  when: 1690000100'].join('\n'),
  );

  assert.equal(entries.length, 2);
  assert.equal(entries[0].command, 'git commit -m "two lines\nhere"');
  assert.equal(entries[0].time, 1690000000);
  assert.equal(entries[1].command, 'ls');
});

test('powershell history, including a continued line', () => {
  const entries = parsePowerShell(['Get-ChildItem', 'Get-Process `', '  | Sort-Object CPU', 'cls'].join('\n'));

  assert.equal(entries.length, 3);
  assert.equal(entries[1].command, 'Get-Process \n  | Sort-Object CPU');
  assert.equal(entries[2].command, 'cls');
});

/** The tests run on every platform; path.join does not. */
const posix = (file) => file.split('\\').join('/');

test('the usual history locations are known for each platform', () => {
  const unix = candidates({ env: {}, platform: 'linux', home: '/home/me' });
  assert.deepEqual(
    unix.map((source) => source.shell),
    ['zsh', 'bash', 'fish', 'powershell'],
  );
  assert.equal(posix(unix[0].file), '/home/me/.zsh_history');
  assert.match(unix[2].file, /fish[\\/]fish_history$/);

  const windows = candidates({ env: { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, platform: 'win32', home: 'C:\\Users\\me' });
  assert.match(windows[3].file, /PSReadLine/);
});

test('XDG_DATA_HOME is respected', () => {
  const sources = candidates({ env: { XDG_DATA_HOME: '/data' }, platform: 'linux', home: '/home/me' });
  assert.match(sources[2].file, /^[\\/]data[\\/]fish/);
});
