#! /usr/bin/env bun
/**
 * ddepcheck output bin command is dinit-dependency-graph
 * by:  Andrew Velez
 */
import { parseArgs } from "util";

async function getOptions() {

  const { values, positionals } = parseArgs({
    args: Bun.argv,
    options: {
      help: {
        type: "boolean",
        short: "h",
      },
      serviceDirectory: {
        type: "string",
        short: "d",
        default: ".",
      },
    },
    strict: true,
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Usage: dinit-dependency-graph [options] <directory>

Options:
  -h, --help     Show this help message
  --verbose      Enable verbose logging
  `);
    process.exit(0);
  }

  return { values, positionals }
}

async function main() {
  const options = getOptions();
}

main();