/**
 * Prism 语言懒加载模块
 *
 * 特性：
 * - 按需加载语言高亮模块
 * - 自动处理依赖关系
 * - 缓存已加载的语言
 * - 支持 PlainText 无需加载
 */

// ⚠️ 注意：不要在这里全量导入 Prism 语言模块
// 所有语言模块都应该按需动态导入

export const LANGUAGE_LIST = [
  'BASIC', 'HTTP',
  // 'JavaDoc', 'JSDoc', 'Objective-C', 'Scala', 'VB.Net',
  'JQ',
  'JSONP', 'Julia',
  'LaTeX', 'Less', 'Sass', 'SCSS', 'LiveScript', 'N4JS',
  'PlantUML', 'PowerShell', 'R', 'Tcl', 'vim',
  // 'Perl', 'EJS', 'Visual Basic', 'WebAssembly',
  'YAML', 'Zig',
  'PlainText',
  'Java', 'JavaScript', 'TypeScript', 'CSS', 'HTML', 'PHP', 'Python', 'Go',
  'C', 'C#', 'C++', 'Rust', 'JSON', 'SQL', 'XML', 'Bash', 'Kotlin', 'Swift',
  'Ruby', 'Dart', 'Git', 'MongoDB', 'nginx', 'Markdown'
].sort((item1, item2) => item1.localeCompare(item2)) as CodeBlockLanguage[]

export type CodeBlockLanguage = keyof typeof PRISM_LANGUAGE_MAP

export const PRISM_LANGUAGE_MAP = {
  BASIC: 'basic',
  EJS: 'ejs',
  HTTP: 'http',
  // JavaDoc: 'javadoc',
  JQ: 'jq',
  // JSDoc: 'jsdoc',
  JSONP: 'jsonp',
  Julia: 'julia',
  LaTeX: 'latex',
  Less: 'less',
  Sass: 'sass',
  SCSS: 'scss',
  LiveScript: 'livescript',
  N4JS: 'n4js',
  // 'Objective-C': 'objectivec',
  // Perl: 'perl',
  PlantUML: 'plant-uml',
  PowerShell: 'powershell',
  R: 'r',
  Tcl: 'tcl',
  // 'VB.Net': 'vbnet',
  'vim': 'vim',
  'Visual Basic': 'visual-basic',
  WebAssembly: 'wasm',
  YAML: 'yaml',
  Zig: 'zig',
  PlainText: 'plaintext',
  Java: 'java',
  JavaScript: 'javascript',
  TypeScript: 'typescript',
  CSS: 'css',
  HTML: 'html',
  PHP: 'php',
  Python: 'python',
  Go: 'go',
  C: 'c',
  CSharp: 'csharp',
  CPlusPlus: 'cpp',
  Rust: 'rust',
  JSON: 'json',
  'C++': 'cpp',
  'C#': 'csharp',
  SQL: 'sql',
  XML: 'xml',
  Bash: 'bash',
  Kotlin: 'kotlin',
  Swift: 'swift',
  Ruby: 'ruby',
  Scala: 'scala',
  Dart: 'dart',
  Git: 'git',
  MongoDB: 'mongodb',
  nginx: 'nginx',
  Markdown: 'markdown',
}

export const PRISM_LANGUAGE_IMPORT_MAP = {
  BASIC: 'basic',
  EJS: 'ejs',
  HTTP: 'http',
  JavaDoc: 'javadoc',
  JQ: 'jq',
  JSDoc: 'jsdoc',
  JSONP: 'jsonp',
  Julia: 'julia',
  LaTeX: 'latex',
  Less: 'less',
  Sass: 'sass',
  SCSS: 'scss',
  LiveScript: 'livescript',
  N4JS: 'n4js',
  'Objective-C': 'objectivec',
  Perl: 'perl',
  PlantUML: 'plant-uml',
  PowerShell: 'powershell',
  R: 'r',
  Tcl: 'tcl',
  'VB.Net': 'vbnet',
  'vim': 'vim',
  'Visual Basic': 'visual-basic',
  WebAssembly: 'wasm',
  YAML: 'yaml',
  Zig: 'zig',
  PlainText: 'plaintext',
  Java: 'java',
  JavaScript: 'javascript',
  TypeScript: 'typescript',
  CSS: 'css',
  HTML: 'markup',
  PHP: 'php',
  Python: 'python',
  Go: 'go',
  C: 'c',
  CSharp: 'csharp',
  CPlusPlus: 'cpp',
  Rust: 'rust',
  JSON: 'json',
  'C++': 'cpp',
  'C#': 'csharp',
  SQL: 'sql',
  XML: 'xml',
  Bash: 'bash',
  Kotlin: 'kotlin',
  Swift: 'swift',
  Ruby: 'ruby',
  Scala: 'scala',
  Dart: 'dart',
  Git: 'git',
  MongoDB: 'mongodb',
  nginx: 'nginx',
  Markdown: 'markdown',
}

export function isLanguageSupported(lang: string): boolean {
  if (lang === 'PlainText' || lang === 'plaintext') return true;
  return typeof (window as any).Prism?.languages?.[lang] !== 'undefined';
}

/**
 * 语言依赖关系映射
 * 某些语言需要先加载依赖语言才能正常工作
 */
const LANGUAGE_DEPENDENCIES: Record<string, string[]> = {
  // C++ 依赖 C
  'cpp': ['c'],
  // TypeScript 依赖 JavaScript
  'typescript': ['javascript'],
  // JSX 依赖 JavaScript
  'jsx': ['javascript'],
  // TSX 依赖 TypeScript 和 JavaScript
  'tsx': ['javascript', 'typescript'],
  // SCSS 依赖 CSS
  'scss': ['css'],
  // Less 依赖 CSS
  'less': ['css'],
  // PHP 依赖 markup (HTML)
  'php': ['markup'],
  // Markdown 依赖 markup
  'markdown': ['markup'],
};

/**
 * 已加载语言的缓存
 * 避免重复加载同一个语言模块
 */
const loadedLanguages = new Set<string>(['plaintext', 'PlainText']);

/**
 * 正在加载中的语言 Promise 缓存
 * 避免并发加载同一个语言模块
 */
const loadingPromises = new Map<string, Promise<void>>();

/**
 * 递归加载语言的依赖
 */
async function loadLanguageDependencies(lang: string): Promise<void> {
  const dependencies = LANGUAGE_DEPENDENCIES[lang] || [];

  for (const dep of dependencies) {
    if (!loadedLanguages.has(dep)) {
      await loadPrismLanguage(dep);
    }
  }
}

/**
 * 加载单个 Prism 语言模块
 * @param lang - Prism 语言标识符（小写）
 */
async function loadPrismLanguage(lang: string): Promise<void> {
  // 1. 检查是否已加载
  if (loadedLanguages.has(lang)) {
    return;
  }

  // 2. 检查是否正在加载中
  if (loadingPromises.has(lang)) {
    return loadingPromises.get(lang)!;
  }

  // 3. 开始加载
  const loadPromise = (async () => {
    try {
      // 3.1 先加载依赖
      await loadLanguageDependencies(lang);

      // 3.2 动态导入语言模块
      await import(`prismjs/components/prism-${lang}.js`);

      // 3.3 标记为已加载
      loadedLanguages.add(lang);

      console.log(`[Prism] 语言模块已加载: ${lang}`);
    } catch (error) {
      console.warn(`[Prism] 无法加载语言模块: ${lang}`, error);
      // 即使加载失败，也标记为已尝试，避免重复尝试
      loadedLanguages.add(lang);
    } finally {
      // 清除加载中的 Promise
      loadingPromises.delete(lang);
    }
  })();

  loadingPromises.set(lang, loadPromise);
  return loadPromise;
}

/**
 * 按需加载 Prism 语言组件
 * @param lang - CodeBlockLanguage 类型的语言名称
 */
export async function loadPrismLangComponent(lang: CodeBlockLanguage): Promise<void> {
  // PlainText 不需要加载
  if (lang === 'PlainText') {
    return;
  }

  // 获取 Prism 语言标识符
  const prismLang = PRISM_LANGUAGE_MAP[lang];
  if (!prismLang) {
    console.warn(`[Prism] 未知的语言: ${lang}`);
    return;
  }

  // 检查是否已支持
  if (isLanguageSupported(prismLang)) {
    return;
  }

  // 获取导入路径（可能与显示名称不同）
  const importLang = PRISM_LANGUAGE_IMPORT_MAP[lang] || prismLang;

  // 加载语言模块
  await loadPrismLanguage(importLang);
}

/**
 * 预加载常用语言
 * 可在应用启动时调用，提前加载高频使用的语言
 */
export async function preloadCommonLanguages(): Promise<void> {
  const commonLangs: CodeBlockLanguage[] = [
    'JavaScript',
    'TypeScript',
    'HTML',
    'CSS',
    'JSON'
  ];

  await Promise.all(
    commonLangs.map(lang => loadPrismLangComponent(lang))
  );

  console.log('[Prism] 常用语言预加载完成');
}

/**
 * 获取已加载的语言列表
 */
export function getLoadedLanguages(): string[] {
  return Array.from(loadedLanguages);
}

/**
 * 清除语言加载缓存（主要用于测试）
 */
export function clearLanguageCache(): void {
  loadedLanguages.clear();
  loadingPromises.clear();
  loadedLanguages.add('plaintext');
  loadedLanguages.add('PlainText');
}
