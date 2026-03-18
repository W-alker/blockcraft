#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
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
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function parseCliArgs(argv) {
  const normalizedArgv = argv[0] === '--' ? argv.slice(1) : argv;

  if (normalizedArgv.length === 0) {
    return { releaseType: null, exactVersion: null, publishArgs: [] };
  }

  const [firstArg, ...restArgs] = normalizedArgv;
  if (firstArg.startsWith('-')) {
    return { releaseType: null, exactVersion: null, publishArgs: normalizedArgv };
  }

  if (supportedReleaseTypes.has(firstArg)) {
    return {
      releaseType: firstArg,
      exactVersion: null,
      publishArgs: restArgs[0] === '--' ? restArgs.slice(1) : restArgs,
    };
  }

  if (exactVersionPattern.test(firstArg)) {
    return {
      releaseType: null,
      exactVersion: firstArg,
      publishArgs: restArgs[0] === '--' ? restArgs.slice(1) : restArgs,
    };
  }

  throw new Error(
    `Unsupported version selector "${firstArg}". Expected major/minor/patch or an exact version like 1.2.3.`
  );
}

function bumpVersion(version, releaseType) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    return version;
  }

  const [, majorPart, minorPart, patchPart] = match;
  const majorVersion = Number(majorPart);
  const minorVersion = Number(minorPart);
  const patchVersion = Number(patchPart);

  if (releaseType === 'major') {
    return `${majorVersion + 1}.0.0`;
  }

  if (releaseType === 'minor') {
    return `${majorVersion}.${minorVersion + 1}.0`;
  }

  return `${majorVersion}.${minorVersion}.${patchVersion + 1}`;
}

async function promptReleaseType(currentVersion) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const fallbackVersion = bumpVersion(currentVersion, 'patch');
    console.log(`Current version: ${currentVersion}`);
    console.log(`No interactive terminal detected, defaulting to 小版本 (patch) -> ${fallbackVersion}`);
    return {
      versionArg: 'patch',
      targetVersion: fallbackVersion,
      label: '小版本',
    };
  }

  const versionOptions = [
    { key: '1', label: '大版本', value: 'major' },
    { key: '2', label: '中版本', value: 'minor' },
    { key: '3', label: '小版本', value: 'patch' },
    { key: '4', label: '自定义版本', value: 'custom' },
  ];

  console.log(`Current version: ${currentVersion}`);
  console.log('请选择要发布的版本类型：');
  for (const option of versionOptions) {
    if (option.value === 'custom') {
      console.log(`  ${option.key}) ${option.label} -> 手动输入精确版本号`);
      continue;
    }

    console.log(`  ${option.key}) ${option.label} -> ${bumpVersion(currentVersion, option.value)}`);
  }

  const acceptedAnswers = new Map([
    ['', 'patch'],
    ['1', 'major'],
    ['major', 'major'],
    ['大', 'major'],
    ['大版本', 'major'],
    ['2', 'minor'],
    ['minor', 'minor'],
    ['中', 'minor'],
    ['中版本', 'minor'],
    ['3', 'patch'],
    ['patch', 'patch'],
    ['small', 'patch'],
    ['小', 'patch'],
    ['小版本', 'patch'],
    ['4', 'custom'],
    ['custom', 'custom'],
    ['自定义', 'custom'],
    ['自定义版本', 'custom'],
  ]);

  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const rawAnswer = (await terminal.question('请输入 1/2/3/4，或直接输入精确版本号（默认 3）: ')).trim();
      if (exactVersionPattern.test(rawAnswer)) {
        return {
          versionArg: rawAnswer,
          targetVersion: rawAnswer,
          label: '自定义版本',
        };
      }

      const answer = rawAnswer.toLowerCase();
      const releaseType = acceptedAnswers.get(answer);
      if (releaseType === 'custom') {
        const customVersion = (await terminal.question('请输入精确版本号，例如 1.2.3: ')).trim();
        if (!exactVersionPattern.test(customVersion)) {
          console.log('版本号格式无效，请输入类似 1.2.3 或 1.2.3-beta.1 的值。');
          continue;
        }

        return {
          versionArg: customVersion,
          targetVersion: customVersion,
          label: '自定义版本',
        };
      }

      if (releaseType) {
        return {
          versionArg: releaseType,
          targetVersion: bumpVersion(currentVersion, releaseType),
          label:
            releaseType === 'major'
              ? '大版本'
              : releaseType === 'minor'
                ? '中版本'
                : '小版本',
        };
      }

      console.log('无效选择，请输入 1 / 2 / 3 / 4，major / minor / patch，或直接输入精确版本号。');
    }
  } finally {
    terminal.close();
  }
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

    if (currentArg === '--') {
      continue;
    }

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
  const {
    releaseType: requestedReleaseType,
    exactVersion: requestedExactVersion,
    publishArgs,
  } = parseCliArgs(process.argv.slice(2));
  const normalizedPublishArgs = normalizePublishArgs(publishArgs);
  const dryRun = normalizedPublishArgs.includes('--dry-run');
  const originalEditorPackageText = await readFile(editorPackagePath, 'utf8');
  const originalDistPackageText = existsSync(distPackagePath)
    ? await readFile(distPackagePath, 'utf8')
    : null;
  const currentEditorPackage = await readJson(editorPackagePath);
  const releasePlan = requestedExactVersion
    ? {
        versionArg: requestedExactVersion,
        targetVersion: requestedExactVersion,
        label: '自定义版本',
      }
    : requestedReleaseType
      ? {
          versionArg: requestedReleaseType,
          targetVersion: bumpVersion(currentEditorPackage.version, requestedReleaseType),
          label:
            requestedReleaseType === 'major'
              ? '大版本'
              : requestedReleaseType === 'minor'
                ? '中版本'
                : '小版本',
        }
      : await promptReleaseType(currentEditorPackage.version);

  console.log(
    `Will publish ${currentEditorPackage.name} from ${currentEditorPackage.version} to ${releasePlan.targetVersion} (${releasePlan.label}).`
  );

  try {
    runCommand(
      npmCommand,
      ['version', releasePlan.versionArg, '--no-git-tag-version'],
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
