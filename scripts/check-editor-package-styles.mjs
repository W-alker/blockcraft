#!/usr/bin/env node

import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 使用 ng-packagr 自身的 Sass 编译器，保持与包构建版本一致。
const require = createRequire(import.meta.url);
const packagrRequire = createRequire(require.resolve('ng-packagr/package.json'));
const sass = packagrRequire('sass');
const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const packageRoot = path.resolve(workspaceRoot, process.argv[2] ?? 'dist/editor');
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'blockcraft-package-styles-'));

try {
  // 只复制统一发布的 themes 目录；主题不得反向依赖组件私有源码。
  const isolatedPackage = path.join(temporaryRoot, 'package');
  await cp(path.join(packageRoot, 'themes'), path.join(isolatedPackage, 'themes'), { recursive: true });
  for (const theme of ['base', 'light', 'dark']) {
    const result = sass.compile(path.join(isolatedPackage, 'themes', theme + '.scss'), {
      logger: sass.Logger.silent,
    });
    assert.ok(result.css.length > 0, theme + ' 主题应生成 CSS');
    if (theme === 'base') {
      assert.ok(
        result.css.includes('.bc-snapshot-viewer .audio-block .audio-player'),
        '发布包应保留 Snapshot Viewer 的音频播放器样式',
      );
    }
    console.log('PASS: 发布包 themes/' + theme + '.scss 独立编译');
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
