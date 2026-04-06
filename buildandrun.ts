#! /usr/bin/env bun
/**
 * build file for this project
 */
import { $ } from 'bun';
import { PONOS_ANDREW_HOME_DIR } from './constants';

await Bun.build({
  entrypoints: [PONOS_ANDREW_HOME_DIR + "/ddepcheck.ts"],
  compile: {
    outfile: PONOS_ANDREW_HOME_DIR + "/bin/dinit-dependency-graph",
  },
  minify: true,
  sourcemap: "linked",
  bytecode: true,
});

const process = Bun.spawn([PONOS_ANDREW_HOME_DIR + "/bin/dinit-dependency-graph"], {
  stdio: ["inherit", "inherit", "inherit"],
});

await process.exited;