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

export const LANGUAGE_LIST = [
  'PlainText',
  'Java', 'JavaScript', 'TypeScript', 'CSS', 'HTML', 'PHP', 'Python', 'Go',
  'C', 'C#', 'C++', 'Rust', 'JSON', 'SQL', 'XML', 'Bash', 'Kotlin', 'Swift',
  'Ruby', 'Scala', 'Dart', 'Git', 'MongoDB', 'nginx', 'Markdown'
].sort((item1, item2) => item1.localeCompare(item2)) as CodeBlockLanguage[]

export type CodeBlockLanguage = keyof typeof PRISM_LANGUAGE_MAP

export const PRISM_LANGUAGE_MAP = {
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

const loadedLanguages = new Set<CodeBlockLanguage>()

