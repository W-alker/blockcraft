#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(currentFilePath), '..');
const editorPackagePath = path.join(workspaceRoot, 'packages/editor/package.json');
const npmCachePath = path.join(workspaceRoot, '.npm-cache');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const publishRegistry = 'http://npm.runtongqiuben.com';

function parseCliArgs(argv) {
  const normalizedArgv = argv[0] === '--' ? argv.slice(1) : argv;
  const npmArgs = [];
  let targetVersion;

  for (let index = 0; index < normalizedArgv.length; index += 1) {
    const currentArg = normalizedArgv[index];

    if (currentArg === '--registry') {
      const nextArg = normalizedArgv[index + 1];
      if (nextArg && nextArg !== publishRegistry) {
        throw new Error(`Registry is fixed to ${publishRegistry}.`);
      }
      index += 1;
      continue;
    }

    if (currentArg.startsWith('--registry=')) {
      const providedRegistry = currentArg.slice('--registry='.length);
      if (providedRegistry !== publishRegistry) {
        throw new Error(`Registry is fixed to ${publishRegistry}.`);
      }
      continue;
    }

    if (currentArg === '--version') {
      const nextArg = normalizedArgv[index + 1];
      if (!nextArg) {
        throw new Error('Missing version after --version.');
      }
      targetVersion = nextArg;
      index += 1;
      continue;
    }

    if (!currentArg.startsWith('-') && !targetVersion) {
      targetVersion = currentArg;
      continue;
    }

    npmArgs.push(currentArg);
  }

  return {
    npmArgs,
    targetVersion,
  };
}

function runCommand(args, description) {
  const result = spawnSync(npmCommand, args, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      npm_config_registry: publishRegistry,
      npm_config_cache: npmCachePath,
    },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`${description} failed.`);
  }
}

async function main() {
  const { npmArgs, targetVersion } = parseCliArgs(process.argv.slice(2));
  const editorPackage = JSON.parse(await readFile(editorPackagePath, 'utf8'));
  const packageVersion = targetVersion ?? editorPackage.version;
  const packageSpecifier = `${editorPackage.name}@${packageVersion}`;

  runCommand(
    ['unpublish', packageSpecifier, '--registry', publishRegistry, ...npmArgs],
    `Unpublish ${packageSpecifier}`
  );

  console.log(`Unpublished ${packageSpecifier} from ${publishRegistry}.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
