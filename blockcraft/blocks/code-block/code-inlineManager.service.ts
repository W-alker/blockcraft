import {DeltaInsertText, DeltaOperation, InlineManager, InlineModel, STR_LINE_BREAK} from "../../framework";
import {Token} from "prismjs";
import {CodeBlockLanguage, PRISM_LANGUAGE_MAP} from "./const";
import * as Prism from "prismjs";
import {performanceTest} from "../../global";

export class CodeInlineManagerService extends InlineManager {
  @performanceTest()
  private _flatTokens(tokens: Array<string | Token>, res: DeltaInsertText[] = [], parentType?: string) {
    for (const token of tokens) {
      // 处理纯字符串
      if (typeof token === 'string') {
        const baseAttrs = parentType ? { 'a:type': parentType } : undefined

        // 有换行符时特殊处理
        if (token.includes(STR_LINE_BREAK)) {
          let start = 0
          while (true) {
            const idx = token.indexOf(STR_LINE_BREAK, start)
            if (idx === -1) break

            if (idx > start) {
              res.push({ insert: token.slice(start, idx), attributes: baseAttrs })
            }
            res.push({ insert: STR_LINE_BREAK, attributes: baseAttrs ? { ...baseAttrs, 'd:lineBreak': true } : { 'd:lineBreak': true } })

            start = idx + 1
          }

          // 剩余部分
          if (start < token.length) {
            res.push({ insert: token.slice(start), attributes: baseAttrs })
          }
        } else {
          res.push({ insert: token, attributes: baseAttrs })
        }

        continue
      }

      // 处理 Token 对象
      const type = token.type || parentType || 'text'
      const attrs = { 'a:type': type }

      if (typeof token.content === 'string') {
        res.push({ insert: token.content, attributes: attrs })
      } else {
        this._flatTokens(Array.isArray(token.content) ? token.content : [token.content], res, type)
      }
    }

    return res
  }

  renderCode(container: HTMLElement, text: string, lang: CodeBlockLanguage = 'PlainText') {
    const tokens = Prism.tokenize(text, Prism.languages[PRISM_LANGUAGE_MAP[lang]])
    container.replaceChildren(...this.flatTokensToSpans(tokens))
    // this.render(this._flatTokens(tokens), container)
  }

  flatTokensToSpans(tokens: Array<string | Token>, parentType?: string): HTMLSpanElement[] {
    const spans: HTMLSpanElement[] = []

    for (const token of tokens) {
      // 如果是纯字符串
      if (typeof token === 'string') {
        spans.push(
          this.createInlineNode({
            insert: token,
            attributes: parentType ? { 'a:type': parentType } : undefined
          })
        )
        continue
      }

      const type = token.type || parentType || 'plain'

      // 如果内容是字符串
      if (typeof token.content === 'string') {
        spans.push(
          this.createInlineNode({
            insert: token.content,
            attributes: { 'a:type': type }
          })
        )
      } else {
        // 是嵌套的 token 数组
        const children = Array.isArray(token.content) ? token.content : [token.content]
        spans.push(...this.flatTokensToSpans(children, type))
      }
    }

    return spans
  }

  override applyDeltaToView(deltas: DeltaOperation[], container: HTMLElement) {
  }
}

