# Contributing

Two things are worth more than anything else here: a shell whose history format
is not read correctly, and a stat that would be fun to see.

## Getting started

```bash
git clone https://github.com/CedricPoint/shell-wrapped.git
cd shell-wrapped
npm test            # no install step: there are no dependencies
npm run demo        # regenerate the images in docs/ from the made-up history
node bin/shell-wrapped.js --list
```

## The rule that is not negotiable

**No argument from anybody's history may reach the output.** Command names,
subcommand names, counts and timestamps — nothing else. People's histories hold
tokens, passwords and hostnames, and the point of this tool is a report they
can post without reading it line by line first.

There is a test for it: `test/stats.test.js` plants secrets in a history and
fails if any of them turns up anywhere in the report. If you add a stat, make
sure it still passes, and never add the raw line to the report "just for
debugging".

For the same reason, no real history is ever committed here. `test/synthetic.js`
makes a believable one from a seeded generator, and that is what the tests and
the screenshots use.

## How it fits together

| file | what it does |
| --- | --- |
| `src/history.js` | finds and parses the history files. Four formats, one shape out. |
| `src/stats.js` | entries in, report out. Pure, no I/O. |
| `src/terminal.js` | the report, for a terminal. |
| `src/card.js` | the report, as a 1200×630 SVG. |
| `bin/shell-wrapped.js` | flags and exit codes. |

## Adding a shell

1. Add a parser to `src/history.js` returning `{ command, time }`, with `time`
   set to `null` when the shell does not record one.
2. Register it in `PARSERS` and add its location to `candidates()`.
3. Add a test with a **real snippet** of that format, including its awkward
   case — every one of these formats has one. zsh continues long commands with
   a backslash, fish escapes newlines, PowerShell uses a backtick, and bash
   writes `#1690000000` lines only sometimes.

## Adding a stat

`analyse()` in `src/stats.js` makes one pass over the entries and fills the
report. Add yours there, show it in `src/terminal.js`, and put it on the card
only if it still reads at a glance — the card is deliberately five numbers and
a chart, not everything.

## Style

Plain ESM, no dependencies, no build step. Somebody is going to point this at
the most sensitive file they own; they should be able to read the whole thing
first.
