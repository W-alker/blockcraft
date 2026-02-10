import {
  DeltaInsertText, DeltaOperation, EditableBlockComponent,
  InlineManager,
  STR_LINE_BREAK
} from "../../framework";
import { shikiService } from "./shiki-config";
import type { BundledLanguage, ThemedToken } from 'shiki'

/**
 * 将 Shiki 的 token 数组展平为 Delta 操作数组
 * 只使用 token 类型信息，不使用颜色（颜色由 CSS 主题控制）
 * 参考 Prism 的 flatPrismTokens 实现
 * @param lines - Shiki 返回的 token 数组（按行）
 * @param withLineBreak - 是否处理换行符
 */
/**
 * 将 Shiki 的 token 数组展平为 Delta 操作数组
 * 只使用 token 类型信息，不使用颜色（颜色由 CSS 主题控制）
 * 参考 Prism 的 flatPrismTokens 实现
 * @param lines - Shiki 返回的 token 数组（按行）
 * @param withLineBreak - 是否添加 d:lineBreak 属性（换行符本身始终保留）
 */
const flatShikiTokens = (lines: ThemedToken[][], withLineBreak = true): DeltaInsertText[] => {
  const res: DeltaInsertText[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    for (const token of line) {
      if (!token.content) continue

      const baseAttrs = token.color ? { 's:color': token.color } : undefined

      // 直接插入 token 内容（保留空格等格式）
      res.push({
        insert: token.content,
        attributes: baseAttrs
      })
    }

    // 行尾换行符（除了最后一行）
    // Shiki 的每一行就是一个完整的行，行与行之间需要换行符
    if (i < lines.length - 1) {
      // withLineBreak 控制是否添加 d:lineBreak 属性，但换行符本身始终保留
      res.push({
        insert: STR_LINE_BREAK,
        attributes: withLineBreak ? { 'd:lineBreak': true } : undefined
      })
    }
  }

  return res
}

interface IRenderOptions {
  lang: string;
  withLineBreak?: boolean;
}

/**
 * 基于 Shiki 的代码高亮内联管理服务
 *
 * 特性：
 * - 使用 VS Code 的 TextMate 语法引擎
 * - 更准确的语法高亮
 * - 只使用 token 类型信息，样式由 CSS 主题控制
 * - 差分更新，仅重新渲染变化的部分
 * - 保持光标位置
 */
export class CodeInlineManagerService extends InlineManager {

  constructor(
    doc: BlockCraft.Doc,
    protected block: EditableBlockComponent,
    protected options: IRenderOptions = {
      lang: 'text'
    }
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
   * 获取当前语言的 Shiki 标识符
   */
  private getShikiLanguage(): BundledLanguage {
    const lang = this.options.lang || 'text';

    // 如果语言不存在或就是 plaintext，直接返回
    if (!lang || lang === 'text') {
      return 'text' as BundledLanguage
    }

    return lang as BundledLanguage
  }

  /**
   * 差分高亮：根据 Delta 操作重新高亮代码
   * @param ops - Delta 操作数组
   */
  async diffHighLight(ops: DeltaOperation[]) {
    // 保存光标位置
    const isHere = this.doc.selection.value?.from.blockId === this.block.id;
    let pos = 0;

    if (isHere) {
      const sel = this.doc.selection.normalizeRange(document.getSelection()!.getRangeAt(0));
      pos = sel?.from.type === 'text' ? sel.from.index : 0;
    }

    try {
      // 获取高亮器
      const highlighter = await shikiService.getHighlighter();

      // 获取语言标识符
      const lang = this.getShikiLanguage();

      // 确保语言已加载
      await shikiService.ensureLanguageLoaded(lang);

      // 获取代码文本
      const text = this.block.textContent();

      // 使用 Shiki 进行语法高亮 - 获取 token 类型信息
      const result = highlighter.codeToTokens(text, {
        lang,
        theme: 'github-light',
      });

      // 转换为 Delta 格式
      const deltas = flatShikiTokens(result.tokens, this.options.withLineBreak);

      // 渲染到 DOM
      this.render(deltas, this.block.containerElement);

      // 恢复光标位置
      if (isHere) {
        this.block.setInlineRange(pos);
      }
    } catch (error) {
      console.error('[ShikiInlineManager] 高亮失败:', error);
      // 失败时降级为普通文本
      this.renderPlainText();
    }
  }

  /**
   * 完整重新渲染代码高亮
   */
  async renderCode() {
    try {
      const highlighter = await shikiService.getHighlighter();
      const lang = this.getShikiLanguage();

      // 确保语言已加载
      await shikiService.ensureLanguageLoaded(lang);

      const text = this.block.textContent();

      // 使用 Shiki 进行语法高亮 - 获取 token 类型信息
      const result = highlighter.codeToTokens(text, {
        lang,
        theme: 'github-light', // 需要指定主题，但我们只使用 token 类型
        includeExplanation: 'scopeName'
      });

      const deltas = flatShikiTokens(result.tokens, this.options.withLineBreak);
      this.render(deltas, this.block.containerElement);
    } catch (error) {
      console.error('[ShikiInlineManager] 渲染失败:', error);
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
