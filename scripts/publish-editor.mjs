#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const supportedReleaseTypes = new Set([
  'patch',
  'minor',
  'major',
  'prepatch',
  'preminor',
  'premajor',
  'prerelease',
]);

const currentFilePath = fileURLToPath(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(currentFilePath), '..');
const editorPackagePath = path.join(workspaceRoot, 'packages/editor/package.json');
const distPackagePath = path.join(workspaceRoot, 'dist/editor/package.json');
const npmCachePath = path.join(workspaceRoot, '.npm-cache');
const editorPackageDir = path.join(workspaceRoot, 'packages/editor');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const publishRegistry = 'http://npm.runtongqiuben.com';

function parseCliArgs(argv) {
  const normalizedArgv = argv[0] === '--' ? argv.slice(1) : argv;

  if (normalizedArgv.length === 0) {
    return { releaseType: 'patch', publishArgs: [] };
  }

  const [firstArg, ...restArgs] = normalizedArgv;
  if (firstArg.startsWith('-')) {
    return { releaseType: 'patch', publishArgs: normalizedArgv };
  }

  if (!supportedReleaseTypes.has(firstArg)) {
    throw new Error(
      `Unsupported release type "${firstArg}". Expected one of: ${Array.from(supportedReleaseTypes).join(', ')}.`
    );
  }

  return { releaseType: firstArg, publishArgs: restArgs };
}

function runCommand(command, args, description, cwd = workspaceRoot, envExtra = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      ...envExtra,
    },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`${description} failed.`);
  }
}

function normalizePublishArgs(args) {
  const normalizedArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const currentArg = args[index];

    if (currentArg === '--registry') {
      const nextArg = args[index + 1];
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

    normalizedArgs.push(currentArg);
  }

  return normalizedArgs;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function restoreFile(filePath, contents) {
  if (contents === null) {
    return;
  }

  await writeFile(filePath, contents);
}

async function prepareDistPackage(packageName, version) {
  if (!existsSync(distPackagePath)) {
    throw new Error('Build succeeded but dist/editor/package.json was not generated.');
  }

  const distPackage = await readJson(distPackagePath);
  const nextDistPackage = {
    ...distPackage,
    name: packageName,
    version,
    publishConfig: {
      ...(distPackage.publishConfig ?? {}),
      registry: publishRegistry,
    },
  };

  if (nextDistPackage.scripts?.prepublishOnly) {
    const { prepublishOnly, ...restScripts } = nextDistPackage.scripts;
    void prepublishOnly;
    if (Object.keys(restScripts).length === 0) {
      delete nextDistPackage.scripts;
    } else {
      nextDistPackage.scripts = restScripts;
    }
  }

  await writeJson(distPackagePath, nextDistPackage);
}

async function main() {
  const { releaseType, publishArgs } = parseCliArgs(process.argv.slice(2));
  const normalizedPublishArgs = normalizePublishArgs(publishArgs);
  const dryRun = normalizedPublishArgs.includes('--dry-run');
  const originalEditorPackageText = await readFile(editorPackagePath, 'utf8');
  const originalDistPackageText = existsSync(distPackagePath)
    ? await readFile(distPackagePath, 'utf8')
    : null;

  try {
    runCommand(
      npmCommand,
      ['version', releaseType, '--no-git-tag-version'],
      'Bump editor version',
      editorPackageDir
    );

    const editorPackage = await readJson(editorPackagePath);

    runCommand(pnpmCommand, ['build:editor'], 'Build editor package');
    await prepareDistPackage(editorPackage.name, editorPackage.version);

    runCommand(
      npmCommand,
      ['publish', '--registry', publishRegistry, ...normalizedPublishArgs],
      dryRun ? 'Dry-run publish editor package' : 'Publish editor package',
      path.join(workspaceRoot, 'dist/editor'),
      {
        npm_config_registry: publishRegistry,
        npm_config_cache: npmCachePath,
      }
    );

    if (dryRun) {
      await restoreFile(editorPackagePath, originalEditorPackageText);
      await restoreFile(distPackagePath, originalDistPackageText);
      console.log(`Dry run complete. Next editor version would be ${editorPackage.version}.`);
      return;
    }

    console.log(`Published ${editorPackage.name} ${editorPackage.version} to ${publishRegistry}.`);
  } catch (error) {
    await restoreFile(editorPackagePath, originalEditorPackageText);
    await restoreFile(distPackagePath, originalDistPackageText);
    throw error;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
