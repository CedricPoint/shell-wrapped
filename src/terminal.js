/**
 * The report, as it appears in a terminal.
 */

const enabled =
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== 'dumb' &&
  (process.env.FORCE_COLOR !== undefined || Boolean(process.stdout.isTTY));

const wrap = (open, close) => (text) => (enabled ? `\u001b[${open}m${text}\u001b[${close}m` : String(text));

export const color = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  grey: wrap(90, 39),
};

const SPARKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export function render(report, { width = 72 } = {}) {
  const out = [];
  const line = (text = '') => out.push(text);

  line('');
  line(`  ${color.bold(color.magenta('shell wrapped'))}   ${color.grey(headline(report))}`);

  if (report.span) {
    line(`  ${color.grey(`${date(report.span.from)} → ${date(report.span.to)}`)}`);
  }

  if (!report.totals.commands) {
    line('');
    line('  There is nothing in your history yet.');
    line('');
    return out.join('\n');
  }

  line('');
  line(`  ${color.bold('your top commands')}`);
  line('');
  const longest = Math.max(...report.top.map((item) => item.name.length));
  const scale = report.top[0].count;

  for (const item of report.top) {
    const bar = color.cyan('█'.repeat(Math.max(1, Math.round((item.count / scale) * (width - longest - 22)))));
    const share = `${Math.round(item.share * 100)}%`.padStart(4);
    line(`  ${item.name.padEnd(longest)}  ${String(item.count).padStart(6)} ${color.grey(share)}  ${bar}`);
  }

  for (const tool of report.subcommands) {
    line('');
    line(`  ${color.bold(`you and ${tool.tool}`)}`);
    line(`  ${tool.items.map((item) => `${item.name} ${color.grey(item.count)}`).join(color.grey('  ·  '))}`);
  }

  if (report.hours) {
    line('');
    line(`  ${color.bold('when you work')}`);
    line(`  ${color.yellow(sparkline(report.hours))}`);
    line(`  ${color.grey('0h                       12h                      23h')}`);
    line(
      `  busiest at ${color.bold(`${String(report.busiestHour).padStart(2, '0')}:00`)}` +
        `${color.grey('  ·  ')}${color.bold(report.busiestWeekday)} is your day` +
        `${color.grey('  ·  ')}${color.bold(`${Math.round(report.nightShare * 100)}%`)} after 22:00`,
    );
    if (report.busiestDay) {
      line(
        `  ${color.grey(`your biggest day was ${report.busiestDay.day}, with ${report.busiestDay.count} commands`)}`,
      );
    }
  }

  if (report.habits.length) {
    line('');
    line(`  ${color.bold('habits')}`);
    for (const habit of report.habits) {
      line(`  ${String(habit.count).padStart(6)}  ${color.grey(habit.label)}`);
    }
  }

  if (report.typos.length) {
    line('');
    line(`  ${color.bold('near misses')}`);
    line(
      `  ${report.typos
        .map((typo) => `${color.yellow(typo.typed)} → ${typo.meant} ${color.grey(`(${typo.count})`)}`)
        .join(color.grey('  ·  '))}`,
    );
  }

  if (report.streak) {
    line('');
    line(
      `  ${color.bold('longest streak')}   ${report.streak.length} × ${color.green(report.streak.name)} ` +
        color.grey('in a row, without doing anything else'),
    );
  }

  line('');
  line(`  ${color.grey('nothing left this machine. no arguments were read into this report.')}`);
  line('');

  return out.join('\n');
}

function headline(report) {
  const parts = [`${report.totals.commands.toLocaleString('en-US')} commands`, `${report.totals.unique} unique`];
  if (report.totals.perDay) parts.push(`${report.totals.perDay} a day`);
  return parts.join(' · ');
}

export function sparkline(values) {
  const peak = Math.max(...values, 1);
  return values.map((value) => SPARKS[Math.min(SPARKS.length - 1, Math.round((value / peak) * (SPARKS.length - 1)))]).join('');
}

function date(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}
