/**
 * Regenerates the images in docs/ from the made-up history in the tests.
 *
 *   npm run demo
 *
 * No real history is ever committed to this repository, which is rather the
 * point of the tool.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyse } from '../src/stats.js';
import { card } from '../src/card.js';
import { render } from '../src/terminal.js';
import { synthetic } from '../test/synthetic.js';

const docs = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const report = analyse(synthetic());

writeFileSync(join(docs, 'card-dark.svg'), `${card(report, { theme: 'dark' })}\n`, 'utf8');
writeFileSync(join(docs, 'card-light.svg'), `${card(report, { theme: 'light' })}\n`, 'utf8');

process.stdout.write(`${render(report)}\n\ncards written to docs/\n`);
