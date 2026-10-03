import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { analyse } from '../src/stats.js';
import { card, internals } from '../src/card.js';
import { render, sparkline } from '../src/terminal.js';
import { synthetic, writers } from './synthetic.js';

const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'shell-wrapped.js');
const workspace = mkdtempSync(join(tmpdir(), 'shell-wrapped-'));

after(() => rmSync(workspace, { recursive: true, force: true, maxRetries: 3 }));

const entries = synthetic();
const historyFile = join(workspace, '.zsh_history');
writeFileSync(historyFile, writers.zsh(entries), 'utf8');

function run(args = []) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: workspace,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

test('it reads a history file and reports on it', () => {
  const { code, stdout } = run(['--file', historyFile]);

  assert.equal(code, 0);
  assert.match(stdout, /shell wrapped/);
  assert.match(stdout, /your top commands/);
  assert.match(stdout, /\bgit\b/);
  assert.match(stdout, /when you work/);
});

test('the terminal report keeps your arguments to itself', () => {
  const { stdout } = run(['--file', historyFile]);

  for (const secret of ['tok_live_51H8sEcReT', 'api.internal.example', 'deploy@server', 'feature/thing']) {
    assert.ok(!stdout.includes(secret), `the report printed ${secret}`);
  }
});

test('--json is the whole report', () => {
  const report = JSON.parse(run(['--file', historyFile, '--json']).stdout);

  assert.equal(report.top[0].name, 'git');
  assert.ok(report.totals.commands > 2000);
  assert.equal(report.hours.length, 24);
  assert.ok(report.busiestWeekday);
});

test('--year narrows it down, and an empty slice is not an error page', () => {
  const inYear = JSON.parse(run(['--file', historyFile, '--year', '2026', '--json']).stdout);
  const empty = run(['--file', historyFile, '--year', '1999', '--json']);

  assert.ok(inYear.totals.commands > 0);
  assert.equal(JSON.parse(empty.stdout).totals.commands, 0);
  assert.equal(empty.code, 1);
});

test('--svg writes a card', () => {
  const target = join(workspace, 'card.svg');
  const { code } = run(['--file', historyFile, '--svg', target]);
  const svg = readFileSync(target, 'utf8');

  assert.equal(code, 0);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /width="1200" height="630"/);
  assert.match(svg, /<\/svg>\s*$/);
  assert.equal((svg.match(/<text /g) ?? []).length > 8, true);
});

test('the card is valid, self-contained and discreet', () => {
  const report = analyse(entries);
  const svg = card(report);

  assert.ok(!/<script/i.test(svg), 'no script');
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(svg), 'nothing is fetched from the network');
  assert.ok(!svg.includes('tok_live_51H8sEcReT'), 'no secrets');
  assert.ok(svg.includes(report.totals.commands.toLocaleString('en-US')), 'the headline number is there');
  assert.equal(balanced(svg), true, 'every tag is closed');
});

test('both themes render, and differ only in colour', () => {
  const report = analyse(entries);
  const dark = card(report, { theme: 'dark' });
  const light = card(report, { theme: 'light' });

  assert.ok(dark.includes(internals.THEMES.dark.background));
  assert.ok(light.includes(internals.THEMES.light.background));
  assert.equal(dark.match(/<text /g).length, light.match(/<text /g).length);
});

test('two cards on one page do not fight over the gradient id', () => {
  const report = analyse(entries);
  const both = card(report) + card(report, { theme: 'light' });
  const ids = [...both.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(new Set(ids).size, ids.length, 'the ids are unique');
  assert.ok(ids.every((id) => id.startsWith('shell-wrapped-')), 'and namespaced');
});

test('text going into the card is escaped', () => {
  const svg = card(analyse([{ command: '<b>&amp --flag', time: null }]));

  assert.ok(!svg.includes('<b>'), 'the markup is not reproduced');
  assert.ok(svg.includes('&lt;b&gt;&amp;amp'), 'it is escaped instead');
});

test('--list says where it looked', () => {
  const { stdout } = run(['--list']);

  assert.match(stdout, /zsh/);
  assert.match(stdout, /bash/);
  assert.match(stdout, /fish/);
  assert.match(stdout, /powershell/);
});

test('every shell format leads to the same report', () => {
  const reports = Object.entries(writers).map(([shell, write]) => {
    const file = join(workspace, `history-${shell}`);
    writeFileSync(file, write(entries), 'utf8');
    return JSON.parse(run(['--file', file, '--shell', shell, '--json']).stdout);
  });

  const [zsh, bash, fish, powershell] = reports;

  assert.equal(zsh.totals.commands, entries.length);
  assert.deepEqual(bash.top, zsh.top);
  assert.deepEqual(fish.top, zsh.top);
  assert.deepEqual(powershell.top, zsh.top, 'the leaderboard does not need timestamps');
  assert.equal(powershell.hours, null, 'but the clock does');
});

test('the sparkline follows the shape of the data', () => {
  assert.equal(sparkline([0, 1, 2, 3, 4, 5, 6, 7]).length, 8);
  assert.equal(sparkline([0, 100])[0], '▁');
  assert.equal(sparkline([0, 100])[1], '█');
});

test('an empty report says so instead of printing nothing', () => {
  const output = render(analyse([]));

  assert.match(output, /nothing in your history/);
});

test('bad input is a clear message, not a stack trace', () => {
  assert.equal(run(['--nonsense']).code, 2);
  assert.match(run(['--nonsense']).stderr, /unknown option/);
  assert.match(run(['--file', historyFile, '--theme', 'neon']).stderr, /unknown theme/);
  assert.match(run(['--file', join(workspace, 'nope.txt'), '--shell', 'zsh']).stderr, /shell-wrapped:/);
});

test('help and version', () => {
  assert.match(run(['--help']).stdout, /Usage/);
  assert.match(run(['--version']).stdout, /^\d+\.\d+\.\d+/);
});

/**
 * Well-formedness, checked with a tag stack rather than by counting: every
 * element has to be closed, in the right order, or the card is not an SVG.
 */
function balanced(svg) {
  const stack = [];

  for (const [, closing, name, body] of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    if (closing) {
      if (stack.pop() !== name) return false;
    } else if (!body.trimEnd().endsWith('/')) {
      stack.push(name);
    }
  }

  return stack.length === 0;
}
