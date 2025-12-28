import {
  DeltaInsertText, DeltaOperation, EditableBlockComponent,
  InlineManager,
  STR_LINE_BREAK
} from "../../framework";
import * as Prism from "prismjs";

/**
 * 将 Prism token 数组展平为 Delta 操作数组
 * @param tokens - Prism 语法分析后的 token 数组
 * @param withLineBreak - 是否处理换行符
 */
const flatPrismTokens = (tokens: Array<string | Prism.Token>, withLineBreak = true) => {
  const res: DeltaInsertText[] = []
  // 状态记录
  let parentType: string | undefined = undefined

  const flat = (tokens: Array<string | Prism.Token>) => {
    for (const token of tokens) {
      if (typeof token === 'string') {
        const baseAttrs = parentType ? { 'a:type': parentType } : undefined
        if (withLineBreak && token.includes(STR_LINE_BREAK)) {
          let start = 0
          while (true) {
            const idx = token.indexOf(STR_LINE_BREAK, start)
            if (idx === -1) break

            if (idx > start) {
              res.push({ insert: token.slice(start, idx), attributes: baseAttrs })
            }
            res.push({
              insert: STR_LINE_BREAK,
              attributes: baseAttrs ? { ...baseAttrs, 'd:lineBreak': true } : { 'd:lineBreak': true }
            })
            start = idx + 1
          }
          if (start < token.length) {
            res.push({ insert: token.slice(start), attributes: baseAttrs })
          }
        } else {
          res.push({ insert: token, attributes: baseAttrs })
        }
        continue
      }

      const type = token.type || parentType || 'text'
      const attrs = { 'a:type': type }

      if (typeof token.content === 'string') {
        res.push({ insert: token.content, attributes: attrs })
      } else {
        flat(Array.isArray(token.content) ? token.content : [token.content])
      }
    }
  }
  flat(tokens)

  return res
}

interface IRenderOptions {
  lang: string;
  withLineBreak?: boolean;
}

/**
 * 代码高亮内联管理服务
 *
 * 特性：
 * - 基于 Prism.js 实现代码语法高亮
 * - 支持语言懒加载
 * - 差分更新，仅重新渲染变化的部分
 * - 保持光标位置
 */
export class CodeInlineManagerService extends InlineManager {

  constructor(
    doc: BlockCraft.Doc,
    protected block: EditableBlockComponent,
    protected options: IRenderOptions = { lang: 'plaintext' }
  ) {
    super(doc);
  }

  /**
   * 设置当前语言
   */
  setLang(lang: string) {
    this.options.lang = lang;
  }

  /**
   * 获取当前语言的 Prism 语法对象
   * 如果语言未加载，返回 plaintext
   */
  private getPrismLanguage(): Prism.Grammar {
    const lang = this.options.lang || 'plaintext';
    const grammar = Prism.languages[lang];

    if (!grammar) {
      console.warn(`[CodeInlineManager] 语言 "${lang}" 未加载，使用 plaintext`);
      return Prism.languages['plaintext'] || Prism.languages['plain'] || {};
    }

    return grammar;
  }

  /**
   * 差分高亮：根据 Delta 操作重新高亮代码
   * @param ops - Delta 操作数组
   */
  diffHighLight(ops: DeltaOperation[]) {
    // 保存光标位置
    const isHere = this.doc.selection.value?.from.blockId === this.block.id;
    let pos = 0;

    if (isHere) {
      const sel = this.doc.selection.normalizeRange(document.getSelection()!.getRangeAt(0));
      pos = sel?.from.type === 'text' ? sel.from.index : 0;
    }

    try {
      // 获取语法对象
      const grammar = this.getPrismLanguage();

      // 进行语法分析
      const text = this.block.textContent();
      const tokens = Prism.tokenize(text, grammar);

      // 转换为 Delta 格式
      const deltas = flatPrismTokens(tokens, this.options.withLineBreak);

      // 渲染到 DOM
      this.render(deltas, this.block.containerElement);

      // 恢复光标位置
      if (isHere) {
        this.block.setInlineRange(pos);
      }
    } catch (error) {
      console.error('[CodeInlineManager] 高亮失败:', error);
      // 失败时降级为普通文本
      this.renderPlainText();
    }
  }

  /**
   * 完整重新渲染代码高亮
   */
  renderCode() {
    try {
      const grammar = this.getPrismLanguage();
      const text = this.block.textContent();
      const tokens = Prism.tokenize(text, grammar);
      const deltas = flatPrismTokens(tokens, this.options.withLineBreak);

      this.render(deltas, this.block.containerElement);
    } catch (error) {
      console.error('[CodeInlineManager] 渲染失败:', error);
      this.renderPlainText();
    }
  }

  /**
   * 渲染为普通文本（备用方案）
   */
  private renderPlainText() {
    const text = this.block.textContent();
    const deltas: DeltaInsertText[] = [];

    if (this.options.withLineBreak && text.includes(STR_LINE_BREAK)) {
      let start = 0;
      while (true) {
        const idx = text.indexOf(STR_LINE_BREAK, start);
        if (idx === -1) break;

        if (idx > start) {
          deltas.push({ insert: text.slice(start, idx) });
        }
        deltas.push({ insert: STR_LINE_BREAK, attributes: { 'd:lineBreak': true } });
        start = idx + 1;
      }
      if (start < text.length) {
        deltas.push({ insert: text.slice(start) });
      }
    } else {
      deltas.push({ insert: text });
    }

    this.render(deltas, this.block.containerElement);
  }
}



