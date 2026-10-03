import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analyse, commandName, distance, findTypos, longestStreak, subcommand } from '../src/stats.js';
import { synthetic } from './synthetic.js';

// Local time on purpose: "when do you work" is a question about your clock,
// not about UTC, so the fixtures are built in the same frame as the stats.
const at = (hour, command, day = 6) => ({
  command,
  time: Math.round(new Date(2026, 0, day, hour, 0, 0).getTime() / 1000),
});

test('the command name survives wrappers, paths and quotes', () => {
  assert.equal(commandName('git status'), 'git');
  assert.equal(commandName('  sudo   systemctl restart nginx'), 'systemctl');
  assert.equal(commandName('NODE_ENV=production npm run build'), 'npm');
  assert.equal(commandName('/usr/local/bin/python3 script.py'), 'python3');
  assert.equal(commandName('"C:\\Program Files\\Git\\bin\\git.exe" status'), 'git.exe');
  assert.equal(commandName('sudo'), 'sudo', 'a bare wrapper is still a command');
  assert.equal(commandName('   '), null);
});

test('subcommands are read, and only when they are really subcommands', () => {
  assert.equal(subcommand('git commit -m "hello"', 'git'), 'commit');
  assert.equal(subcommand('git -C /tmp status', 'git'), 'status');
  assert.equal(subcommand('npm run dev', 'npm'), 'run');
  assert.equal(subcommand('docker compose up -d', 'docker'), 'compose');
  assert.equal(subcommand('git', 'git'), null);
  assert.equal(subcommand('npm ./local-package.tgz', 'npm'), null, 'a path is not a verb');
  assert.equal(subcommand('git $BRANCH', 'git'), null, 'a variable is not a verb');
});

test('counts, shares and the leaderboard', () => {
  const report = analyse([
    { command: 'git status', time: null },
    { command: 'git push', time: null },
    { command: 'git commit -m x', time: null },
    { command: 'npm test', time: null },
  ]);

  assert.equal(report.totals.commands, 4);
  assert.equal(report.totals.unique, 2);
  assert.deepEqual(report.top[0], { name: 'git', count: 3, share: 0.75 });
  assert.deepEqual(report.subcommands[0].tool, 'git');
  assert.deepEqual(
    report.subcommands[0].items.map((item) => item.name),
    ['commit', 'push', 'status'],
  );
});

test('hours, weekday, night share and the biggest day', () => {
  const report = analyse([
    at(23, 'git status'),
    at(23, 'git push'),
    at(2, 'npm test'),
    at(14, 'ls'),
    at(14, 'ls', 7),
  ]);

  assert.equal(report.totals.timed, 5);
  assert.equal(report.hours[23], 2);
  assert.equal(report.nightShare, 3 / 5);
  assert.equal(report.busiestDay.count, 4);
  assert.equal(report.busiestDay.day, '2026-01-06');
  assert.equal(report.totals.days, 2);
  assert.equal(report.totals.perDay, 2.5);
});

test('entries without a timestamp still count, but not towards the clock', () => {
  const report = analyse([{ command: 'ls', time: null }]);

  assert.equal(report.totals.commands, 1);
  assert.equal(report.hours, null);
  assert.equal(report.nightShare, null);
  assert.equal(report.busiestHour, null);
});

test('habits are counted, including the ones you would rather forget', () => {
  const report = analyse([
    { command: 'sudo apt update', time: null },
    { command: 'rm -rf node_modules', time: null },
    { command: 'git push --force origin main', time: null },
    { command: 'git commit --amend --no-edit', time: null },
    { command: ':q', time: null },
    { command: 'cd ..', time: null },
  ]);

  const habits = Object.fromEntries(report.habits.map((habit) => [habit.id, habit.count]));

  assert.equal(habits.sudo, 1);
  assert.equal(habits.rmrf, 1);
  assert.equal(habits.forcePush, 1);
  assert.equal(habits.amend, 1);
  assert.equal(habits.vim, 1);
  assert.equal(habits.back, 1);
});

test('a near miss is a typo, a command you really use is not', () => {
  const counts = new Map([
    ['git', 120],
    ['npm', 40],
    ['gti', 3],
    ['nmp', 1],
    ['ls', 90],
    ['cd', 88],
  ]);

  const typos = findTypos(counts);

  assert.deepEqual(typos[0], { typed: 'gti', meant: 'git', count: 3 });
  assert.ok(typos.some((typo) => typo.typed === 'nmp' && typo.meant === 'npm'));
  assert.ok(!typos.some((typo) => typo.typed === 'cd'), 'a command used 88 times is not a typo');
});

test('distance stops caring once it is past 1', () => {
  assert.equal(distance('git', 'git'), 0);
  assert.equal(distance('gti', 'git'), 1);
  assert.equal(distance('ls', 'lsa'), 1);
  assert.ok(distance('docker', 'npm') > 1);
});

test('the longest streak is the same command, back to back', () => {
  assert.deepEqual(longestStreak(['ls', 'npm', 'npm', 'npm', 'git', 'npm']), { name: 'npm', length: 3 });
  assert.equal(longestStreak(['ls', 'git', 'npm']), null);
});

test('no argument from the history ever reaches the report', () => {
  const entries = [
    ...synthetic({ count: 400 }),
    { command: 'mysql -u root -phunter2 shop', time: 1767000000 },
    { command: 'export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI', time: 1767000100 },
  ];

  const serialized = JSON.stringify(analyse(entries));

  for (const secret of ['hunter2', 'wJalrXUtnFEMI', 'tok_live_51H8sEcReT', 'api.internal.example', 'deploy@server']) {
    assert.ok(!serialized.includes(secret), `the report leaked ${secret}`);
  }

  // What it does contain is the harmless part: names, counts, times.
  assert.ok(serialized.includes('"git"'));
  assert.ok(serialized.includes('"count"'));
});

test('an empty history is a report, not a crash', () => {
  const report = analyse([]);

  assert.equal(report.totals.commands, 0);
  assert.deepEqual(report.top, []);
  assert.equal(report.streak, null);
  assert.deepEqual(report.typos, []);
});
