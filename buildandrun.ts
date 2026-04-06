#! /usr/bin/env bun
/**
 * build file for this project
 */
import { $ } from 'bun';

await Bun.build({
  entrypoints: ["/home/andrew/Code/dinit-dependency-graph/ddepcheck.ts"],
  compile: {
    outfile: "/home/andrew/Code/dinit-dependency-graph/bin/dinit-dependency-graph",
  },
  minify: true,
  sourcemap: "linked",
  bytecode: true,
});

await $`/home/andrew/Code/dinit-dependency-graph/bin/dinit-dependency-graph`;