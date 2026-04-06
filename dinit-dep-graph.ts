#! /usr/bin/env bun
/**
 * ddepcheck output bin command is dinit-dependency-graph
 * by:  Andrew Velez
 */
import { readFile, access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DiGraph } from 'digraph-js';


const directory = process.argv[2] || '.';
main(directory);