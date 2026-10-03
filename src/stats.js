/**
 * Turning a pile of history entries into the report.
 *
 * One rule governs this whole file: nothing that leaves here contains an
 * argument. Command names, subcommand names, counts and times — never the rest
 * of the line. Your history is full of hostnames, tokens and passwords typed by
 * accident, and the output of this tool is meant to be shareable.
 */

/** Tools whose second word is a verb worth counting on its own. */
const MULTIPLEXERS = new Set([
  'git', 'npm', 'pnpm', 'yarn', 'bun', 'deno', 'docker', 'podman', 'kubectl', 'helm', 'cargo', 'go',
  'gh', 'glab', 'brew', 'apt', 'apt-get', 'dnf', 'pacman', 'systemctl', 'terraform', 'pulumi', 'pm2',
  'aws', 'gcloud', 'az', 'composer', 'pip', 'pip3', 'poetry', 'uv', 'rustup', 'nvm', 'flutter', 'adb',
]);

/** Stripped from the front of a line before the command name is read. */
const WRAPPERS = new Set(['sudo', 'doas', 'time', 'nohup', 'command', 'builtin', 'exec', 'env', 'nice']);

const NIGHT_HOURS = new Set([22, 23, 0, 1, 2, 3, 4]);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const HABITS = [
  { id: 'sudo', label: 'asked nicely with sudo', test: /^\s*sudo\b/ },
  { id: 'rmrf', label: 'recursive deletions', test: /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r|\brm\s+-r\s+-f|\brm\s+-f\s+-r/ },
  { id: 'forcePush', label: 'force pushes', test: /\bgit\s+push\b[^|;&]*(--force\b|\s-f(\s|$))/ },
  { id: 'amend', label: 'amended commits', test: /\bgit\s+commit\b[^|;&]*--amend/ },
  { id: 'clear', label: 'fresh starts (clear)', test: /^\s*(clear|cls)\s*$/ },
  { id: 'back', label: 'steps backwards (cd ..)', test: /^\s*cd\s+\.\.\s*$/ },
  { id: 'vim', label: 'times you typed :q at a shell', test: /^\s*:(q|wq|x)!?\s*$/ },
  { id: 'again', label: 'reruns with !!', test: /(^|\s)(sudo\s+)?!!/ },
];

/**
 * @param {{ command: string, time: number|null, shell?: string }[]} entries
 * @param {{ now?: number }} [options]
 */
export function analyse(entries, options = {}) {
  const now = options.now ?? Date.now();
  const names = [];
  const counts = new Map();
  const subcommands = new Map();
  const hours = new Array(24).fill(0);
  const weekdays = new Array(7).fill(0);
  const days = new Map();
  const shells = new Map();
  const habits = Object.fromEntries(HABITS.map((habit) => [habit.id, 0]));

  let timed = 0;
  let night = 0;
  let totalLength = 0;
  let first = null;
  let last = null;

  for (const entry of entries) {
    const line = entry.command;
    const name = commandName(line);
    if (!name) continue;

    names.push(name);
    counts.set(name, (counts.get(name) ?? 0) + 1);
    totalLength += line.length;

    if (MULTIPLEXERS.has(name)) {
      const sub = subcommand(line, name);
      if (sub) {
        if (!subcommands.has(name)) subcommands.set(name, new Map());
        const tool = subcommands.get(name);
        tool.set(sub, (tool.get(sub) ?? 0) + 1);
      }
    }

    for (const habit of HABITS) if (habit.test.test(line)) habits[habit.id] += 1;

    if (entry.shell) shells.set(entry.shell, (shells.get(entry.shell) ?? 0) + 1);

    if (entry.time) {
      const date = new Date(entry.time * 1000);
      if (Number.isNaN(date.getTime())) continue;

      timed += 1;
      hours[date.getHours()] += 1;
      weekdays[date.getDay()] += 1;
      if (NIGHT_HOURS.has(date.getHours())) night += 1;

      // Local, like the hour above: a command at 23:30 belongs to that evening,
      // not to the next day in UTC.
      const day = localDay(date);
      days.set(day, (days.get(day) ?? 0) + 1);

      if (first === null || entry.time < first) first = entry.time;
      if (last === null || entry.time > last) last = entry.time;
    }
  }

  const total = names.length;
  const top = rank(counts).map((item) => ({ ...item, share: total ? item.count / total : 0 }));

  return {
    generatedAt: now,
    totals: {
      commands: total,
      unique: counts.size,
      days: days.size || null,
      perDay: days.size ? Math.round((total / days.size) * 10) / 10 : null,
      averageLength: total ? Math.round(totalLength / total) : 0,
      timed,
    },
    span: first && last ? { from: first, to: last } : null,
    shells: rank(shells),
    top,
    subcommands: topSubcommands(subcommands, counts),
    hours: timed ? hours : null,
    weekdays: timed ? weekdays : null,
    busiestHour: timed ? indexOfMax(hours) : null,
    busiestWeekday: timed ? WEEKDAYS[indexOfMax(weekdays)] : null,
    busiestDay: busiestDay(days),
    nightShare: timed ? night / timed : null,
    streak: longestStreak(names),
    typos: findTypos(counts),
    habits: HABITS.map((habit) => ({ id: habit.id, label: habit.label, count: habits[habit.id] })).filter(
      (habit) => habit.count > 0,
    ),
  };
}

/* ----------------------------------------------------------------- pieces */

/**
 * The name of the command a line runs: wrappers and leading environment
 * assignments removed, path dropped, quotes stripped.
 */
export function commandName(line) {
  let tokens = tokenize(line);

  for (;;) {
    while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens = tokens.slice(1);
    if (!tokens.length) return null;

    const head = basename(tokens[0]);
    if (WRAPPERS.has(head) && tokens.length > 1) {
      tokens = tokens.slice(1);
      continue;
    }
    return head || null;
  }
}

/**
 * The verb after a multiplexer: `git commit -m …` -> `commit`.
 *
 * Flags and their values get in the way (`git -C /tmp status`), so anything
 * that looks like a path, a variable or an option is stepped over rather than
 * treated as the answer — but only for a few words, so `npm ./pkg.tgz` ends up
 * with no subcommand rather than a wrong one.
 */
export function subcommand(line, name) {
  const tokens = tokenize(line);
  const start = tokens.findIndex((token) => basename(token) === name);
  if (start === -1) return null;

  let looked = 0;
  for (const token of tokens.slice(start + 1)) {
    if (looked > 3) return null;
    if (token.startsWith('-')) continue;

    if (/[=/\\$'"`|;&<>*]/.test(token)) {
      looked += 1;
      continue;
    }

    return /^[a-z][a-z0-9:_-]*$/i.test(token) ? token.toLowerCase() : null;
  }

  return null;
}

/**
 * Split on whitespace, but keep a quoted first word in one piece — Windows
 * paths live in quotes and have spaces in them.
 */
function tokenize(line) {
  const tokens = [];
  const text = String(line).trim();
  let current = '';
  let quote = null;

  for (const character of text) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += character;
  }

  if (current) tokens.push(current);
  return tokens;
}

/** YYYY-MM-DD in the machine's own timezone. */
function localDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function basename(word) {
  const cleaned = String(word).replace(/^["']|["']$/g, '');
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] ?? cleaned;
}

function rank(map, limit = 10) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function topSubcommands(subcommands, counts, tools = 3) {
  return [...subcommands.entries()]
    .sort((a, b) => (counts.get(b[0]) ?? 0) - (counts.get(a[0]) ?? 0) || a[0].localeCompare(b[0]))
    .slice(0, tools)
    .map(([tool, items]) => ({ tool, items: rank(items, 5) }));
}

function indexOfMax(values) {
  let best = 0;
  for (let i = 1; i < values.length; i += 1) if (values[i] > values[best]) best = i;
  return best;
}

function busiestDay(days) {
  let best = null;
  for (const [day, count] of days) {
    if (!best || count > best.count || (count === best.count && day < best.day)) best = { day, count };
  }
  return best;
}

/** The longest run of the same command, back to back. */
export function longestStreak(names) {
  let best = { name: null, length: 0 };
  let current = { name: null, length: 0 };

  for (const name of names) {
    current = name === current.name ? { name, length: current.length + 1 } : { name, length: 1 };
    if (current.length > best.length) best = { ...current };
  }

  return best.length > 1 ? best : null;
}

/**
 * Near misses: a command you typed once or twice that is one keystroke away
 * from one you type all the time. That is a typo, with a very high hit rate
 * and no false accusations about commands you really do run.
 */
export function findTypos(counts, { rare = 3, common = 10, limit = 5 } = {}) {
  // Most used first: `sl` is one keystroke from both `ls` and `ll`, and the
  // one you actually type all day is the one you meant.
  const frequent = [...counts.entries()]
    .filter(([, count]) => count >= common)
    .sort((a, b) => b[1] - a[1]);

  if (!frequent.length) return [];

  const typos = [];

  for (const [typed, count] of counts) {
    if (count > rare || typed.length < 2) continue;

    for (const [meant, meantCount] of frequent) {
      if (typed === meant) continue;
      if (Math.abs(typed.length - meant.length) > 1) continue;
      if (distance(typed, meant) !== 1) continue;

      typos.push({ typed, meant, count, weight: meantCount });
      break;
    }
  }

  return typos
    .sort((a, b) => b.count - a.count || b.weight - a.weight || a.typed.localeCompare(b.typed))
    .slice(0, limit)
    .map(({ typed, meant, count }) => ({ typed, meant, count }));
}

/**
 * Edit distance counting a swap of two neighbours as one mistake, because that
 * is what a typo usually is: `gti`, `nmp`, `sl`. Plain Levenshtein scores all
 * three of those as 2 and would miss every one of them.
 */
export function distance(a, b) {
  if (a === b) return 0;

  const rows = [Array.from({ length: b.length + 1 }, (_, i) => i)];

  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(row[j - 1] + 1, rows[i - 1][j] + 1, rows[i - 1][j - 1] + cost);

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2][j - 2] + 1);
      }

      row[j] = best;
    }

    rows.push(row);
  }

  return rows[a.length][b.length];
}

export const internals = { MULTIPLEXERS, WRAPPERS, HABITS, WEEKDAYS };
