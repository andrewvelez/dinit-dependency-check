#! /usr/bin/env bun
/**
 * ddepcheck output bin command is dinit-dependency-graph
 * by:  Andrew Velez
 */

import { readFile, access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DiGraph } from 'digraph-js';

// Define a strict type for our dependency object
interface ServiceDependencies {
  dependsOn: string[];
  dependsMs: string[];
  waitsFor: string[];
  dependsOnD: string[];
  dependsMsD: string[];
  waitsForD: string[];
  after: string[];
  before: string[];
  chainTo: string[];
}

/**
 * Parse a Dinit service file and extract dependency properties
 * Supports both 'property = value' and 'property: value' syntax
 */
function parseServiceFile(content: string): ServiceDependencies {
  const dependencies: ServiceDependencies = {
    dependsOn: [],
    dependsMs: [],
    waitsFor: [],
    dependsOnD: [],
    dependsMsD: [],
    waitsForD: [],
    after: [],
    before: [],
    chainTo: []
  };

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('#') || trimmedLine === '') continue;

    // Match both '=' and ':' separators
    let separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex === -1) {
      separatorIndex = trimmedLine.indexOf(':');
    }

    if (separatorIndex === -1) continue;

    const key = trimmedLine.substring(0, separatorIndex).trim();
    const value = trimmedLine.substring(separatorIndex + 1).trim();

    if (value === '') continue;

    switch (key) {
      case 'depends-on':
        dependencies.dependsOn = value.split(/\s+/).filter((s: string) => s);
        break;
      case 'depends-ms':
        dependencies.dependsMs = value.split(/\s+/).filter((s: string) => s);
        break;
      case 'waits-for':
        dependencies.waitsFor = value.split(/\s+/).filter((s: string) => s);
        break;
      case 'depends-on.d':
        dependencies.dependsOnD = value.split(/\s+/).filter((s: string) => s);
        break;
      case 'depends-ms.d':
        dependencies.dependsMsD = value.split(/\s+/).filter((s: string) => s);
        break;
      case 'waits-for.d':
        dependencies.waitsForD = value.split(/\s+/).filter((s: string) => s);
        break;
      case 'after':
        dependencies.after = value.split(/\s+/).filter((s: string) => s);
        break;
      case 'before':
        dependencies.before = value.split(/\s+/).filter((s: string) => s);
        break;
      case 'chain-to':
        dependencies.chainTo = value.split(/\s+/).filter((s: string) => s);
        break;
    }
  }

  return dependencies;
}

/**
 * Resolve a service file path
 */
function resolveServicePath(baseDirectory: string, serviceName: string): string {
  const cleanName = serviceName.replace(/\.service$/, '');
  return join(baseDirectory, `${cleanName}.service`);
}

/**
 * Parse dependencies from a .d directory
 */
async function parseDirectoryDependencies(baseDirectory: string, serviceName: string, depDirPath: string): Promise<string[]> {
  const dependencies: string[] = [];
  let fullDirPath: string | undefined;

  if (depDirPath.startsWith('/')) {
    fullDirPath = depDirPath;
  } else {
    const cleanServiceName = serviceName.replace(/\.service$/, '');
    const possiblePaths = [
      join(baseDirectory, depDirPath),
      join(baseDirectory, `${cleanServiceName}.d`, depDirPath),
      join(baseDirectory, '..', depDirPath),
      join(baseDirectory, `${cleanServiceName}.d`)
    ];

    for (const path of possiblePaths) {
      try {
        await access(path);
        fullDirPath = path;
        break;
      } catch {
        continue;
      }
    }
  }

  if (!fullDirPath) {
    return dependencies;
  }

  try {
    const files = await readdir(fullDirPath);
    for (const file of files) {
      if (!file.startsWith('.')) {
        dependencies.push(file.replace(/\.service$/, ''));
      }
    }
  } catch {
    // Silently ignore unreadable directories
  }

  return dependencies;
}

/**
 * Recursively discover all services starting from boot
 */
async function discoverServices(
  baseDirectory: string,
  serviceName: string,
  discovered = new Set<string>(),
  serviceCache = new Map<string, ServiceDependencies>()
): Promise<Set<string>> {
  const cleanName = serviceName.replace(/\.service$/, '');

  if (discovered.has(cleanName)) {
    return discovered;
  }

  const servicePath = resolveServicePath(baseDirectory, cleanName);
  let content: string;

  try {
    content = await readFile(servicePath, 'utf-8');
  } catch {
    console.warn(`Warning: Service file not found: ${servicePath}`);
    return discovered;
  }

  discovered.add(cleanName);
  const deps = parseServiceFile(content);
  serviceCache.set(cleanName, deps);

  const referencedServices = new Set<string>();

  const addReferenced = (services: string[]) => {
    services.forEach(service => {
      referencedServices.add(service.replace(/\.service$/, ''));
    });
  };

  addReferenced(deps.dependsOn);
  addReferenced(deps.dependsMs);
  addReferenced(deps.waitsFor);
  addReferenced(deps.after);
  addReferenced(deps.before);
  addReferenced(deps.chainTo);

  const mergeDirDependencies = async (depDirs: string[], targetArray: string[]) => {
    for (const depDir of depDirs) {
      const dirDeps = await parseDirectoryDependencies(baseDirectory, cleanName, depDir);
      targetArray.push(...dirDeps);
      addReferenced(dirDeps);
    }
  };

  await mergeDirDependencies(deps.dependsOnD, deps.dependsOn);
  await mergeDirDependencies(deps.dependsMsD, deps.dependsMs);
  await mergeDirDependencies(deps.waitsForD, deps.waitsFor);

  for (const referencedService of referencedServices) {
    if (!discovered.has(referencedService)) {
      await discoverServices(baseDirectory, referencedService, discovered, serviceCache);
    }
  }

  return discovered;
}

/**
 * Build a dependency graph from discovered services
 */
function buildDependencyGraph(discoveredServices: Set<string>, serviceCache: Map<string, ServiceDependencies>): DiGraph<any> {
  const graph = new DiGraph<any>();

  for (const service of discoveredServices) {
    graph.addVertex({ id: service, adjacentTo: [], body: {} });
  }

  for (const [service, deps] of serviceCache) {
    const addDependencies = (dependencyList: string[], direction: 'forward' | 'reverse' = 'forward') => {
      for (const dep of dependencyList) {
        const depName = dep.replace(/\.service$/, '');
        if (discoveredServices.has(depName)) {
          try {
            if (direction === 'forward') {
              graph.addEdge({ from: service, to: depName });
            } else {
              graph.addEdge({ from: depName, to: service });
            }
          } catch {
            // Skip circular dependencies for now, will be caught later
          }
        }
      }
    };

    addDependencies(deps.dependsOn, 'forward');
    addDependencies(deps.dependsMs, 'forward');
    addDependencies(deps.waitsFor, 'forward');
    addDependencies(deps.after, 'forward');
    addDependencies(deps.chainTo, 'forward');
    addDependencies(deps.before, 'reverse');
  }

  return graph;
}

function topologicalSort(discoveredServices: Set<string>, serviceCache: Map<string, ServiceDependencies>): string[] {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const temp = new Set<string>();

  function visit(vertexId: string) {
    if (temp.has(vertexId)) {
      throw new Error(`Circular dependency detected involving ${vertexId}`);
    }
    if (!visited.has(vertexId)) {
      temp.add(vertexId);

      const deps = serviceCache.get(vertexId);
      if (deps) {
        const immediateChildren = [
          ...deps.dependsOn, ...deps.dependsMs, ...deps.waitsFor, ...deps.after, ...deps.chainTo
        ].map(d => d.replace(/\.service$/, ''));

        for (const child of immediateChildren) {
          if (discoveredServices.has(child)) {
            visit(child);
          }
        }
      }

      temp.delete(vertexId);
      visited.add(vertexId);
      sorted.push(vertexId);
    }
  }

  for (const vertex of discoveredServices) {
    if (!visited.has(vertex)) {
      visit(vertex);
    }
  }

  return sorted;
}

/**
 * Find the boot service file
 */
async function findBootService(directory: string): Promise<string> {
  const files = await readdir(directory);
  const bootFile = files.find(file => file === 'boot' || file === 'boot.service');

  if (!bootFile) {
    throw new Error('No boot service file found in directory');
  }

  return bootFile.replace(/\.service$/, '');
}

/**
 * Main function
 */
async function main(directory: string) {
  try {
    console.log(`Scanning directory: ${directory}`);

    const bootService = await findBootService(directory);
    console.log(`Boot service: ${bootService}\n`);

    console.log('Discovering services referenced by boot...');
    const serviceCache = new Map<string, ServiceDependencies>();
    const discoveredServices = await discoverServices(directory, bootService, new Set(), serviceCache);

    console.log(`Discovered ${discoveredServices.size} services:`);
    console.log([...discoveredServices].sort().map(s => `  - ${s}`).join('\n'));
    console.log();

    console.log('Building dependency graph...');
    const graph = buildDependencyGraph(discoveredServices, serviceCache);

    if (graph.hasCycles()) {
      const cycles = graph.findCycles();
      console.warn('⚠️  Warning: Circular dependencies detected!');
      // BUGFIX: cycles is already an array, not an object containing a .cycles property
      console.warn('Cycles found:', cycles);
      console.warn();
    } else {
      console.log('✓ Graph is acyclic\n');
    }

    console.log('Performing topological sort...');
    const sortedServices = topologicalSort(discoveredServices, serviceCache);

    console.log('\n=== Topologically Sorted Services ===');
    console.log('(dependencies first, most dependent last)\n');
    sortedServices.forEach((service, index) => {
      console.log(`${index + 1}. ${service}`);
    });

    console.log('\n=== Dependency Details ===\n');
    for (const service of sortedServices) {
      try {
        const children = [...graph.getDeepChildren(service)];
        const parents = [...graph.getDeepParents(service)];

        console.log(`${service}:`);
        if (children.length > 0) {
          console.log(`  Depends on: ${children.join(', ')}`);
        } else {
          console.log(`  Depends on: (none)`);
        }
        if (parents.length > 0) {
          console.log(`  Required by: ${parents.join(', ')}`);
        }
        console.log();
      } catch {
        console.log(`${service}: (Failed to calculate deep tree due to cycle)\n`);
      }
    }

  } catch (error) {
    if (error instanceof Error) {
      console.error('Error:', error.message);
    } else {
      console.error('Error:', error);
    }
    process.exit(1);
  }
}

const directory = process.argv[2] || '.';
main(directory);