import {
  DeltaInsertText, DeltaOperation, EditableBlockComponent,
  INLINE_ELEMENT_TAG, INLINE_END_BREAK_CLASS,
  InlineManagerConfig,
  InlineManager,
  STR_LINE_BREAK
} from "../../framework";
import { shikiService } from "./shiki-config";
import type { BundledLanguage, ThemedToken } from 'shiki'
import {performanceTest} from "../../global";

// ─── Token 工具 ───

const MERMAID_LANG_SET = new Set<BundledLanguage>(['mermaid', 'mmd'])

const isMermaidLang = (lang: BundledLanguage) => MERMAID_LANG_SET.has(lang)

const hasMultipleTokenColors = (lines: ThemedToken[][]): boolean => {
  const colors = new Set<string>()
  for (const line of lines) {
    for (const token of line) {
      if (!token.color) continue
      colors.add(token.color)
      if (colors.size > 1) return true
    }
  }
  return false
}

const wrapMermaidForShiki = (text: string): string => {
  const body = text.endsWith('\n') ? text : `${text}\n`
  return `\`\`\`mermaid\n${body}\`\`\``
}

const stripMermaidFenceLines = (lines: ThemedToken[][]): ThemedToken[][] => {
  if (lines.length <= 2) return []
  return lines.slice(1, -1)
}

const flatShikiTokens = (lines: ThemedToken[][], withLineBreak = true): DeltaInsertText[] => {
  const res: DeltaInsertText[] = []
  for (let i = 0; i < lines.length; i++) {
    for (const token of lines[i]) {
      if (!token.content) continue
      res.push({
        insert: token.content,
        attributes: token.color ? { 's:color': token.color } : undefined
      })
    }
    if (i < lines.length - 1) {
      res.push({
        insert: STR_LINE_BREAK,
        attributes: withLineBreak ? { 'd:lineBreak': true } : undefined
      })
    }
  }
  return res
}

// ─── 行级 Diff ───

interface TokenLine {
  deltas: DeltaInsertText[]
  /** 指纹：每个 token 的文本+颜色拼接，用于快速判等 */
  fp: string
}

/** 按 \n delta 分行，同时计算每行指纹 */
function groupTokenLines(deltas: DeltaInsertText[]): TokenLine[] {
  const lines: TokenLine[] = []
  let cur: DeltaInsertText[] = []
  let fp = ''

  for (const d of deltas) {
    cur.push(d)
    // 指纹 = 每个 token 的 "文本内容\0颜色\0" 拼接
    fp += d.insert + '\0' + (d.attributes?.['s:color'] || '') + '\0'
    if (d.insert === STR_LINE_BREAK && d.attributes?.['d:lineBreak']) {
      lines.push({ deltas: cur, fp })
      cur = []
      fp = ''
    }
  }
  if (cur.length) lines.push({ deltas: cur, fp })
  return lines
}

/**
 * 从 DOM 容器按 lineBreak 元素分行，返回每行包含的 c-element 列表。
 * 仅用于定位要移除/插入的 DOM 节点，不参与指纹比较。
 */
function readDOMLineElements(container: HTMLElement): HTMLElement[][] {
  const all = Array.from(
    container.querySelectorAll(INLINE_ELEMENT_TAG)
  ) as HTMLElement[]

  const lines: HTMLElement[][] = []
  let cur: HTMLElement[] = []

  for (const ele of all) {
    if (ele.classList.contains(INLINE_END_BREAK_CLASS)) continue
    cur.push(ele)
    if (ele.textContent === STR_LINE_BREAK && ele.dataset['lineBreak']) {
      lines.push(cur)
      cur = []
    }
  }
  if (cur.length) lines.push(cur)
  return lines
}

/** DOM 行的纯文本 */
function domLineText(elements: HTMLElement[]): string {
  let s = ''
  for (const ele of elements) s += ele.textContent || ''
  return s
}

/** Token 行的纯文本 */
function tokenLineText(line: TokenLine): string {
  let s = ''
  for (const d of line.deltas) s += d.insert
  return s
}

// ─── Service ───

interface IRenderOptions {
  lang: string;
  withLineBreak?: boolean;
  theme?: string;
}

/**
 * 基于 Shiki 的代码高亮内联管理服务
 *
 * 行级差分策略：
 * 1. Shiki tokenize 全文 → 按行分组 + 计算指纹
 * 2. 新旧指纹都来自 Shiki token（hex 颜色），格式天然一致
 * 3. 前后缀收缩找变化行区间
 * 4. 从 DOM 定位对应行的 c-element → 移除旧的 → 插入新的
 *
 * 关键：指纹比较不读 DOM（避免浏览器 hex→rgb 转换导致永远不匹配）
 */
export class CodeInlineManagerService extends InlineManager {

  /** 上次每行的指纹，用于行级 diff */
  private _lineFPs: string[] = []

  constructor(
    doc: BlockCraft.Doc | InlineManagerConfig,
    protected block: EditableBlockComponent,
    protected options: IRenderOptions = { lang: 'text' }
  ) {
    super(doc);
  }

  setLang(lang: string) {
    this.options.lang = lang;
    this._lineFPs = [];
  }

  setTheme(theme: string) {
    this.options.theme = theme;
    this._lineFPs = [];
  }

  private getShikiLanguage(): BundledLanguage {
    const lang = this.options.lang || 'text';
    if (!lang || lang === 'text') return 'text' as BundledLanguage
    return lang as BundledLanguage
  }

  private async _tokenize(text: string): Promise<DeltaInsertText[]> {
    const highlighter = await shikiService.getHighlighter();
    const lang = this.getShikiLanguage();
    await shikiService.ensureLanguageLoaded(lang);
    const baseTokens = highlighter.codeToTokens(text, {
      lang, theme: this.options.theme || 'github-light',
    });

    let tokenLines = baseTokens.tokens

    // Shiki 的 mermaid 语法是 markdown 注入语法，直接高亮纯 mermaid 文本时常会退化成单色。
    // 当检测到单色时，改为 fenced mermaid 方式分词，再剥离 fence 行。
    if (isMermaidLang(lang) && !hasMultipleTokenColors(tokenLines)) {
      const wrappedText = wrapMermaidForShiki(text)
      const wrappedTokens = highlighter.codeToTokens(wrappedText, {
        lang, theme: this.options.theme || 'github-light',
      })
      const strippedLines = stripMermaidFenceLines(wrappedTokens.tokens)
      if (hasMultipleTokenColors(strippedLines)) {
        tokenLines = strippedLines
      }
    }

    return flatShikiTokens(tokenLines, this.options.withLineBreak);
  }

  @performanceTest()
  async diffHighLight(_ops: DeltaOperation[]) {
    const doc = this.doc;
    const isHere = doc?.selection.value?.from.blockId === this.block.id;
    let pos = 0;
    if (isHere && doc) {
      const sel = doc.selection.normalizeRange(
        document.getSelection()!.getRangeAt(0)
      );
      pos = sel?.from.type === 'text' ? sel.from.index : 0;
    }

    try {
      const text = this.block.textContent();
      const newDeltas = await this._tokenize(text);
      const newLines = groupTokenLines(newDeltas);
      const newFPs = newLines.map(l => l.fp);
      const oldFPs = this._lineFPs;

      // 快速判等：指纹数组完全一致则跳过
      if (oldFPs.length === newFPs.length && oldFPs.every((fp, i) => fp === newFPs[i])) {
        return;
      }

      const container = this.block.containerElement;

      if (!oldFPs.length) {
        // 首次渲染
        this.render(newDeltas, container);
      } else {
        this._patchLines(container, newLines, newFPs);
      }

      this._lineFPs = newFPs;

      if (isHere) {
        this.block.setInlineRange(pos);
      }
    } catch (error) {
      console.error('[ShikiInlineManager] 高亮失败:', error);
      this._lineFPs = [];
      this.renderPlainText();
    }
  }

  /**
   * 行级 DOM patch
   *
   * 核心难点：框架的 applyDeltaToView 在本方法之前已修改了 DOM
   * （插入/删除用户输入的字符），导致 DOM 的 c-element 结构和
   * _lineFPs 缓存不一致。
   *
   * 解决：用 DOM 行的纯文本 vs token 行的纯文本做前后缀收缩。
   * 文本相同 + 指纹相同 → 该行不需要更新。
   * 其余行整行替换 DOM 节点。
   */
  private _patchLines(
    container: HTMLElement,
    newLines: TokenLine[],
    newFPs: string[]
  ) {
    const domLines = readDOMLineElements(container);
    const domLen = domLines.length;
    const newLen = newLines.length;
    const oldFPs = this._lineFPs;
    const oldLen = oldFPs.length;

    // 前缀收缩：DOM 行文本 === token 行文本 且 指纹没变
    // 需要同时约束 domLen、newLen、oldLen，避免 oldFPs[prefix] 越界
    const prefixMax = Math.min(domLen, newLen, oldLen);
    let prefix = 0;
    while (prefix < prefixMax) {
      if (domLineText(domLines[prefix]) !== tokenLineText(newLines[prefix])) break;
      if (oldFPs[prefix] !== newFPs[prefix]) break;
      prefix++;
    }

    // 后缀收缩（从各自末尾向前比较）
    // oldFPs 用 oldLen 索引，避免 domLen !== oldLen 时取到错误指纹
    const suffixMax = Math.min(domLen, newLen, oldLen) - prefix;
    let suffix = 0;
    while (suffix < suffixMax) {
      const di = domLen - 1 - suffix;
      const ni = newLen - 1 - suffix;
      const oi = oldLen - 1 - suffix;
      if (domLineText(domLines[di]) !== tokenLineText(newLines[ni])) break;
      if (oldFPs[oi] !== newFPs[ni]) break;
      suffix++;
    }

    // 全部一致
    if (prefix + suffix >= domLen && prefix + suffix >= newLen) return;

    // 找插入锚点
    const endBreak = container.querySelector('.' + INLINE_END_BREAK_CLASS)!;
    let insertBefore: Node = endBreak;
    if (suffix > 0) {
      insertBefore = domLines[domLen - suffix][0];
    }

    // 移除旧变化行
    for (let i = prefix; i < domLen - suffix; i++) {
      for (const ele of domLines[i]) ele.remove();
    }

    // 插入新变化行
    for (let i = prefix; i < newLen - suffix; i++) {
      for (const d of newLines[i].deltas) {
        container.insertBefore(this.createInlineNode(d), insertBefore);
      }
    }
  }

  async renderCode() {
    try {
      const text = this.block.textContent();
      const deltas = await this._tokenize(text);
      this.render(deltas, this.block.containerElement);
      const lines = groupTokenLines(deltas);
      this._lineFPs = lines.map(l => l.fp);
    } catch (error) {
      console.error('[ShikiInlineManager] 渲染失败:', error);
      this._lineFPs = [];
      this.renderPlainText();
    }
  }

  private renderPlainText() {
    const text = this.block.textContent();
    const deltas: DeltaInsertText[] = [];
    if (this.options.withLineBreak && text.includes(STR_LINE_BREAK)) {
      let start = 0;
      while (true) {
        const idx = text.indexOf(STR_LINE_BREAK, start);
        if (idx === -1) break;
        if (idx > start) deltas.push({ insert: text.slice(start, idx) });
        deltas.push({ insert: STR_LINE_BREAK, attributes: { 'd:lineBreak': true } });
        start = idx + 1;
      }
      if (start < text.length) deltas.push({ insert: text.slice(start) });
    } else {
      deltas.push({ insert: text });
    }
    this.render(deltas, this.block.containerElement);
    const lines = groupTokenLines(deltas);
    this._lineFPs = lines.map(l => l.fp);
  }
}
