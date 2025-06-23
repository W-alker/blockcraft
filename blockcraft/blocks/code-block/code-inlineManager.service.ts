import {
  DeltaInsertText,
  InlineManager,
  STR_LINE_BREAK
} from "../../framework";
import {PRISM_LANGUAGE_MAP} from "./const";
import * as Prism from "prismjs";
import {performanceTest} from "../../global";

export class CodeInlineManagerService extends InlineManager {

  constructor(doc: BlockCraft.Doc, protected codeBlock: BlockCraft.IBlockComponents['code']) {
    super(doc)
  }

  private _flatTokens(tokens: Array<string | Prism.Token>, res: DeltaInsertText[] = [], parentType?: string): DeltaInsertText[] {
    for (const token of tokens) {
      if (typeof token === 'string') {
        const baseAttrs = parentType ? {'a:type': parentType} : undefined
        if (token.includes(STR_LINE_BREAK)) {
          let start = 0
          while (true) {
            const idx = token.indexOf(STR_LINE_BREAK, start)
            if (idx === -1) break

            if (idx > start) {
              res.push({insert: token.slice(start, idx), attributes: baseAttrs})
            }
            res.push({
              insert: STR_LINE_BREAK,
              attributes: baseAttrs ? {...baseAttrs, 'd:lineBreak': true} : {'d:lineBreak': true}
            })
            start = idx + 1
          }
          if (start < token.length) {
            res.push({insert: token.slice(start), attributes: baseAttrs})
          }
        } else {
          res.push({insert: token, attributes: baseAttrs})
        }
        continue
      }

      const type = token.type || parentType || 'text'
      const attrs = {'a:type': type}

      if (typeof token.content === 'string') {
        res.push({insert: token.content, attributes: attrs})
      } else {
        this._flatTokens(Array.isArray(token.content) ? token.content : [token.content], res, type)
      }
    }

    return res
  }

  // @performanceTest()
  diffHighLight() {
    const tokens = Prism.tokenize(this.codeBlock.textContent(), Prism.languages[PRISM_LANGUAGE_MAP[this.codeBlock.props.lang]])
    const deltas = this._flatTokens(tokens)
    // 比对deltas，找到不同的deltas
    this.render(deltas, this.codeBlock.containerElement)
  }

  renderCode() {
    const text = this.codeBlock.textContent()
    const tokens = Prism.tokenize(text, Prism.languages[PRISM_LANGUAGE_MAP[this.codeBlock.props.lang]])
    const deltas = this._flatTokens(tokens)
    this.render(deltas, this.codeBlock.containerElement)
  }
}



