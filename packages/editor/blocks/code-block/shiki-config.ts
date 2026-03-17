import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
  type BundledTheme,
  type LanguageInput
} from 'shiki'

/**
 * Shiki 高亮器单例
 * 使用懒加载模式，只在首次使用时初始化
 */
class ShikiHighlighterService {
  private highlighter: Highlighter | null = null
  private initPromise: Promise<Highlighter> | null = null

  /**
   * 获取或创建 Shiki 高亮器实例
   */
  async getHighlighter(): Promise<Highlighter> {
    if (this.highlighter) {
      return this.highlighter
    }

    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this.createHighlighter()
    this.highlighter = await this.initPromise
    this.initPromise = null

    return this.highlighter
  }

  /**
   * 创建高亮器实例
   * 配置默认主题和常用语言
   */
  private async createHighlighter(): Promise<Highlighter> {
    console.log('[Shiki] 正在初始化高亮器...')

    const highlighter = await createHighlighter({
      themes: [
        'github-light',      // 浅色主题
        'github-dark',       // 深色主题
      ],
      langs: [
        // 预加载常用语言，其他语言按需加载
        'javascript',
        'typescript',
        'html',
        'css',
        'json',
        'mermaid'
      ]
    })

    console.log('[Shiki] 高亮器初始化完成')
    return highlighter
  }

  /**
   * 确保语言已加载
   * @param lang - 语言标识符
   */
  async ensureLanguageLoaded(lang: BundledLanguage): Promise<void> {
    // @ts-ignore
    if(lang === 'text') {
      return Promise.resolve()
    }

    const highlighter = await this.getHighlighter()
    const loadedLangs = highlighter.getLoadedLanguages()

    if (!loadedLangs.includes(lang)) {
      console.log(`[Shiki] 加载语言: ${lang}`)
      try {
        await highlighter.loadLanguage(lang)
      } catch (error) {
        console.warn(`[Shiki] 语言 ${lang} 加载失败，将使用 plaintext`, error)
      }
    }
  }

  /**
   * 检查语言是否支持
   */
  isLanguageSupported(lang: string): boolean {
    // Shiki 支持所有 VS Code 支持的语言
    return true
  }
}

// 导出单例
export const shikiService = new ShikiHighlighterService()

/**
 * 语言映射表
 * 将展示名称映射到 Shiki 的 BundledLanguage 标识符
 * 所有值都是 Shiki 内置支持的语言
 */
export const SHIKI_LANGUAGE_MAP: Record<string, BundledLanguage> = {
  // @ts-ignore
  PlainText: 'text',

  // Web 基础语言
  HTML: 'html',
  CSS: 'css',
  JavaScript: 'javascript',
  TypeScript: 'typescript',
  JSON: 'json',
  XML: 'xml',
  SVG: 'xml',

  // Web 框架/库
  JSX: 'jsx',
  TSX: 'tsx',
  React: 'jsx',
  Vue: 'vue',

  // 样式预处理器
  Less: 'less',
  Sass: 'sass',
  SCSS: 'scss',
  Stylus: 'stylus',

  // 编译型语言 - C 系列
  C: 'c',
  'C++': 'cpp',
  'C#': 'csharp',
  'Objective-C': 'objective-c',

  // 编译型语言 - 其他
  Java: 'java',
  Go: 'go',
  Rust: 'rust',
  Swift: 'swift',
  Kotlin: 'kotlin',
  D: 'd',
  Nim: 'nim',

  // 脚本语言
  Python: 'python',
  Ruby: 'ruby',
  PHP: 'php',
  Perl: 'perl',
  Lua: 'lua',
  Tcl: 'tcl',

  // Shell 脚本
  Bash: 'bash',
  Shell: 'bash',
  PowerShell: 'powershell',
  Batch: 'batch',

  // 函数式语言
  Haskell: 'haskell',
  Scala: 'scala',
  Erlang: 'erlang',
  Elixir: 'elixir',
  'F#': 'fsharp',
  OCaml: 'ocaml',
  Elm: 'elm',
  Clojure: 'clojure',
  Racket: 'racket',
  Scheme: 'scheme',
  Lisp: 'lisp',

  // JVM 语言
  Groovy: 'groovy',
  Gradle: 'groovy',

  // .NET 语言
  'Visual Basic': 'vb',
  'VB.NET': 'vb',

  // 现代/新兴语言
  Dart: 'dart',
  Solidity: 'solidity',
  Zig: 'zig',
  V: 'v',
  Crystal: 'crystal',
  Reason: 'ocaml',

  // 数据库查询
  SQL: 'sql',
  'PL/SQL': 'plsql',
  MongoDB: 'javascript',
  GraphQL: 'graphql',
  SPARQL: 'sparql',

  // 标记语言
  Markdown: 'markdown',
  LaTeX: 'latex',
  AsciiDoc: 'asciidoc',
  Textile: 'html',
  Wiki: 'wikitext',

  // 配置/数据格式
  YAML: 'yaml',
  TOML: 'toml',
  INI: 'ini',
  Properties: 'properties',
  JSON5: 'json5',
  CSV: 'csv',

  // 构建工具 & DevOps
  Makefile: 'makefile',
  Dockerfile: 'dockerfile',
  CMake: 'cmake',

  // Web 服务器配置
  nginx: 'nginx',
  Apache: 'apache',

  // 模板引擎
  Pug: 'pug',
  Handlebars: 'handlebars',
  EJS: 'html',
  Twig: 'twig',
  Django: 'html',
  ERB: 'erb',
  Liquid: 'liquid',
  Smarty: 'html',
  Velocity: 'html',
  Mustache: 'handlebars',

  DOT: 'graphql',
  GraphViz: 'graphql',

  // 科学计算 & 工程
  R: 'r',
  Julia: 'julia',
  Matlab: 'matlab',
  Octave: 'matlab',
  Mathematica: 'wolfram',
  Fortran: 'fortran-free-form',
  SAS: 'sas',

  // 学术/历史语言
  Pascal: 'pascal',
  COBOL: 'cobol',
  BASIC: 'vb',
  Delphi: 'pascal',
  Ada: 'ada',

  // 函数式/逻辑编程
  Prolog: 'prolog',
  Mercury: 'prolog',

  // 硬件描述语言
  Verilog: 'verilog',
  VHDL: 'vhdl',

  // 着色器语言
  GLSL: 'glsl',
  HLSL: 'hlsl',

  // 游戏开发
  GDScript: 'gdscript',
  UnrealScript: 'cpp',

  // 嵌入式 & 物联网
  Arduino: 'cpp',
  Processing: 'java',

  // 汇编语言
  Assembly: 'asm',
  NASM: 'asm',
  MIPS: 'mips',
  'ARM Assembly': 'asm',

  // Web Assembly
  WebAssembly: 'wasm',
  WAT: 'wasm',

  // 脚本语言（特殊）
  AutoHotkey: 'javascript',
  AutoIt: 'javascript',
  'Vim Script': 'vim',

  // 标记 & 协议
  HTTP: 'http',
  RegEx: 'regex',
  Git: 'git-commit',
  Diff: 'diff',

  // 查询语言
  XQuery: 'xml',
  XPath: 'xml',

  // 其他脚本
  LiveScript: 'javascript',
  CoffeeScript: 'coffeescript',
  Moonscript: 'lua',

  // 数据科学
  'Jupyter Notebook': 'python',

  // 实用工具
  JQ: 'javascript',
  JSONP: 'javascript',
  Awk: 'awk',
  Sed: 'bash',

  // 领域特定语言 (DSL)
  Gherkin: 'gherkin',
  Protobuf: 'protobuf',
  Avro: 'json',

  // 其他
  N4JS: 'javascript',
  ActionScript: 'actionscript-3',
  Apex: 'apex',
  ColdFusion: 'html',
  CFML: 'html',
  Haxe: 'haxe',
  Nix: 'nix',
  Purescript: 'haskell',
  Rescript: 'javascript',
  WebIDL: 'typescript',
}

/**
 * 检查语言是否支持
 */
export function isLanguageSupported(lang: string): boolean {
  return shikiService.isLanguageSupported(lang)
}

/**
 * 加载语言（Shiki 会自动按需加载）
 */
export async function loadLanguage(lang: string): Promise<void> {
  const shikiLang = SHIKI_LANGUAGE_MAP[lang]
  if (shikiLang) {
    try {
      await shikiService.ensureLanguageLoaded(shikiLang)
    } catch (error) {
      console.warn(`[Shiki] 无法加载语言 ${lang}:`, error)
    }
  }
}
