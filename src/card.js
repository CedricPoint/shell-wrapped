/**
 * The shareable card: one self-contained SVG, 1200×630 — the size every
 * social preview expects. No external fonts, no images, no network.
 */

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 64;

const THEMES = {
  dark: {
    background: '#0b1020',
    glow: '#1b2340',
    text: '#e6ebff',
    muted: '#8a93b2',
    accent: '#c084fc',
    bar: '#38bdf8',
    barTrack: '#1c2440',
  },
  light: {
    background: '#f7f8fc',
    glow: '#e8ebf7',
    text: '#141a2e',
    muted: '#5a6484',
    accent: '#7c3aed',
    bar: '#0284c7',
    barTrack: '#dfe4f2',
  },
};

const FONT = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'DejaVu Sans Mono', monospace";

/**
 * @param {object} report  the output of analyse()
 * @param {{ theme?: 'dark'|'light' }} [options]
 * @returns {string} a complete SVG document
 */
export function card(report, options = {}) {
  const theme = THEMES[options.theme] ?? THEMES.dark;
  const parts = [];

  // A soft corner glow rather than a shape: a hard circle edge cutting across
  // the chart is the first thing the eye lands on, and it should not be.
  //
  // The gradient id is namespaced because an id is global to the page once the
  // card is inlined: two cards on one page, or one page that already has a
  // "glow", and every one of them would paint with the first definition found.
  const glowId = `shell-wrapped-glow-${options.theme === 'light' ? 'light' : 'dark'}`;

  parts.push(
    '<defs>',
    `<radialGradient id="${glowId}" cx="0.82" cy="0.05" r="0.75">`,
    `<stop offset="0%" stop-color="${theme.glow}" stop-opacity="1"/>`,
    `<stop offset="100%" stop-color="${theme.glow}" stop-opacity="0"/>`,
    '</radialGradient>',
    '</defs>',
  );
  parts.push(`<rect width="${WIDTH}" height="${HEIGHT}" fill="${theme.background}"/>`);
  parts.push(`<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#${glowId})"/>`);

  parts.push(
    text('SHELL WRAPPED', PAD, 108, {
      size: 26,
      fill: theme.accent,
      weight: 700,
      spacing: 9,
    }),
  );

  const total = report.totals.commands.toLocaleString('en-US');
  parts.push(text(total, PAD, 248, { size: total.length > 6 ? 104 : 124, fill: theme.text, weight: 700 }));
  parts.push(text('commands in your shell history', PAD, 294, { size: 25, fill: theme.muted }));

  parts.push(text(subtitle(report), PAD, 344, { size: 21, fill: theme.muted }));

  parts.push(...topChart(report, theme));
  parts.push(...clock(report, theme));

  parts.push(text('shell-wrapped', PAD, HEIGHT - 42, { size: 19, fill: theme.muted }));
  parts.push(
    text('generated locally · nothing was uploaded', WIDTH - PAD, HEIGHT - 42, {
      size: 19,
      fill: theme.muted,
      anchor: 'end',
    }),
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="${FONT}">`,
    ...parts,
    '</svg>',
  ].join('\n');
}

/* ----------------------------------------------------------------- pieces */

function subtitle(report) {
  const bits = [`${report.totals.unique} different commands`];
  if (report.totals.perDay) bits.push(`${report.totals.perDay} a day`);
  if (report.span) bits.push(`${day(report.span.from)} → ${day(report.span.to)}`);
  return bits.join('  ·  ');
}

function topChart(report, theme) {
  const parts = [];
  const items = report.top.slice(0, 5);
  if (!items.length) return parts;

  const left = 640;
  const right = WIDTH - PAD;
  const scale = items[0].count;
  let y = 120;

  parts.push(text('most used', left, 92, { size: 20, fill: theme.muted, spacing: 3 }));

  for (const item of items) {
    parts.push(text(item.name, left, y, { size: 26, fill: theme.text, weight: 600 }));
    parts.push(
      text(item.count.toLocaleString('en-US'), right, y, { size: 24, fill: theme.muted, anchor: 'end' }),
    );

    const width = right - left;
    parts.push(`<rect x="${left}" y="${y + 12}" width="${width}" height="10" rx="5" fill="${theme.barTrack}"/>`);
    parts.push(
      `<rect x="${left}" y="${y + 12}" width="${Math.max(10, Math.round((item.count / scale) * width))}" height="10" rx="5" fill="${theme.bar}"/>`,
    );

    y += 62;
  }

  return parts;
}

function clock(report, theme) {
  if (!report.hours) return [];

  const parts = [];
  const top = 420;
  const height = 86;
  const width = WIDTH - PAD * 2;
  const step = width / 24;
  const peak = Math.max(...report.hours, 1);

  parts.push(
    text(
      `busiest at ${String(report.busiestHour).padStart(2, '0')}:00  ·  ${report.busiestWeekday}  ·  ${Math.round(report.nightShare * 100)}% after 22:00`,
      PAD,
      top - 14,
      { size: 20, fill: theme.muted },
    ),
  );

  report.hours.forEach((value, hour) => {
    const bar = Math.max(3, Math.round((value / peak) * height));
    const x = PAD + hour * step;
    parts.push(
      `<rect x="${round(x)}" y="${round(top + height - bar)}" width="${round(step - 6)}" height="${bar}" rx="4" fill="${hour === report.busiestHour ? theme.accent : theme.bar}" opacity="${hour === report.busiestHour ? 1 : 0.55}"/>`,
    );
  });

  for (const hour of [0, 6, 12, 18]) {
    parts.push(
      text(`${String(hour).padStart(2, '0')}h`, round(PAD + hour * step), top + height + 28, {
        size: 17,
        fill: theme.muted,
      }),
    );
  }

  return parts;
}

function text(value, x, y, { size = 20, fill = '#fff', weight = 400, anchor = 'start', spacing = 0 } = {}) {
  const attributes = [
    `x="${x}"`,
    `y="${y}"`,
    `font-size="${size}"`,
    `fill="${fill}"`,
    `font-weight="${weight}"`,
    anchor === 'start' ? '' : `text-anchor="${anchor}"`,
    spacing ? `letter-spacing="${spacing}"` : '',
  ].filter(Boolean);

  return `<text ${attributes.join(' ')}>${escape(value)}</text>`;
}

function escape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function day(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

export const internals = { WIDTH, HEIGHT, THEMES };
