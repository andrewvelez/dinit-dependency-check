#! /usr/bin/env bun
/**
 * build file for this project
 */

await Bun.build({
  entrypoints: ["./ddepcheck.ts"],
  compile: {
    outfile: "./bin/dinit-dependency-graph",
  },
  minify: true,
  sourcemap: "linked",
  bytecode: true,
});