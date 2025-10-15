// import 'prismjs/components/prism-javascript';
// import 'prismjs/components/prism-typescript';
// import 'prismjs/components/prism-css';
// import 'prismjs/components/prism-markup';
// import 'prismjs/components/prism-php';
// import 'prismjs/components/prism-python';
// import 'prismjs/components/prism-sql';
// import 'prismjs/components/prism-java';
// import 'prismjs/components/prism-go';
// import 'prismjs/components/prism-c';
// import 'prismjs/components/prism-cpp';
// import 'prismjs/components/prism-csharp';
// import 'prismjs/components/prism-rust';
// import 'prismjs/components/prism-json';
// import 'prismjs/components/prism-bash';
// import 'prismjs/components/prism-git';
// import 'prismjs/components/prism-kotlin';
// import 'prismjs/components/prism-ruby';
// import 'prismjs/components/prism-swift';
// import 'prismjs/components/prism-scala';
// import 'prismjs/components/prism-dart';
// import 'prismjs/components/prism-mongodb';
// import 'prismjs/components/prism-nginx';
// import 'prismjs/components/prism-markdown';

import 'prismjs/components/prism-basic';
import 'prismjs/components/prism-http';
import 'prismjs/components/prism-jq';
import 'prismjs/components/prism-jsonp';
import 'prismjs/components/prism-julia';
import 'prismjs/components/prism-latex';
import 'prismjs/components/prism-less';
import 'prismjs/components/prism-sass';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-livescript';
import 'prismjs/components/prism-n4js';
import 'prismjs/components/prism-objectivec';
import 'prismjs/components/prism-plant-uml';
import 'prismjs/components/prism-powershell';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-tcl';
import 'prismjs/components/prism-vim';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-zig';

export const LANGUAGE_LIST = [
  'BASIC',  'HTTP',
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

export function isLanguageSupported(lang: string) {
  if (lang === 'PlainText') return true
  return (window as any).Prism?.languages?.[lang]
}

export async function loadPrismLangComponent(lang: CodeBlockLanguage) {
  if (lang === 'PlainText' || isLanguageSupported(PRISM_LANGUAGE_MAP[lang])) return
  await import(`prismjs/components/prism-${PRISM_LANGUAGE_IMPORT_MAP[lang]}.js`);
}
