/**
 * A made-up but believable shell history.
 *
 * Used by the tests, and by the screenshots in the README — no real history
 * ever goes into this repository, which is rather the point of the tool.
 */

/** Deterministic pseudo-randomness, so every run produces the same history. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const POOL = [
  [38, ['git status', 'git diff', 'git add -A', 'git commit -m "wip"', 'git push', 'git pull --rebase', 'git log --oneline', 'git checkout -b feature/thing', 'git stash', 'git rebase main']],
  [16, ['npm run dev', 'npm test', 'npm install', 'npm run build', 'npm ci']],
  [10, ['ls -la', 'ls', 'll']],
  [9, ['cd ..', 'cd ~/code/project', 'cd -']],
  [7, ['docker compose up -d', 'docker compose logs -f api', 'docker ps', 'docker compose down']],
  [5, ['ssh deploy@server', 'scp build.tar.gz deploy@server:/tmp']],
  [4, ['vim src/index.js', 'code .', 'cat package.json']],
  [4, ['sudo systemctl restart nginx', 'sudo apt update', 'sudo journalctl -u api -f']],
  [3, ['clear', 'cls']],
  [2, ['rm -rf node_modules', 'rm -rf dist']],
  [1, ['curl -H "Authorization: Bearer tok_live_51H8sEcReT" https://api.internal.example/v1/billing']],
  [1, [':q', 'gti status', 'nmp run dev', 'sl', 'cd..', 'git push --force origin main']],
];

const FLAT = POOL.flatMap(([weight, commands]) => commands.flatMap((command) => Array(weight).fill(command)));

/**
 * @param {{ count?: number, seed?: number, year?: number }} [options]
 * @returns {{ command: string, time: number }[]} oldest first
 */
export function synthetic({ count = 2400, seed = 20261003, year = 2026 } = {}) {
  const next = random(seed);
  const entries = [];

  const start = Date.UTC(year, 0, 6) / 1000;
  const end = Date.UTC(year, 9, 1) / 1000;
  const span = end - start;

  for (let i = 0; i < count; i += 1) {
    const command = FLAT[Math.floor(next() * FLAT.length)];

    // Work clusters: pick a day, then an hour that looks like a working day
    // with a tail into the night.
    const day = Math.floor(next() * (span / 86400));
    const hour = next() < 0.17 ? Math.floor(next() * 7) + 22 : Math.floor(next() * 10) + 9;
    const time = start + day * 86400 + (hour % 24) * 3600 + Math.floor(next() * 3600);

    entries.push({ command, time: Math.round(time) });

    // People repeat themselves.
    if (next() < 0.12) entries.push({ command, time: Math.round(time + 20) });
  }

  return entries.sort((a, b) => a.time - b.time).slice(0, count);
}

/** The same history, written the way each shell would write it. */
export const writers = {
  zsh: (entries) => entries.map((entry) => `: ${entry.time}:0;${entry.command}`).join('\n'),
  bash: (entries) => entries.map((entry) => `#${entry.time}\n${entry.command}`).join('\n'),
  fish: (entries) =>
    entries.map((entry) => `- cmd: ${entry.command}\n  when: ${entry.time}`).join('\n'),
  powershell: (entries) => entries.map((entry) => entry.command).join('\n'),
};
