import {
  DeltaInsertText, DeltaOperation, EditableBlockComponent,
  InlineManager,
  STR_LINE_BREAK
} from "../../framework";
import * as Prism from "prismjs";

const flatPrismTokens = (tokens: Array<string | Prism.Token>, withLineBreak = true) => {
  const res: DeltaInsertText[] = []
  // 状态记录
  let parentType: string | undefined = undefined

  const flat = (tokens: Array<string | Prism.Token>) => {
    for (const token of tokens) {
      if (typeof token === 'string') {
        const baseAttrs = parentType ? {'a:type': parentType} : undefined
        if (withLineBreak && token.includes(STR_LINE_BREAK)) {
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
        flat(Array.isArray(token.content) ? token.content : [token.content])
      }
    }
  }
  flat(tokens)

  return res
}

interface IRenderOptions {
  lang: string
  withLineBreak?: boolean
}

export class CodeInlineManagerService extends InlineManager {

  constructor(doc: BlockCraft.Doc, protected block: EditableBlockComponent, protected options: IRenderOptions = {
    lang: 'plaintext',
  }) {
    super(doc)
  }

  setLang(lang: string) {
    this.options.lang = lang
  }

  // @performanceTest()
  diffHighLight(ops: DeltaOperation[]) {

    const isHere = this.doc.selection.value?.from.blockId === this.block.id
    let pos = 0
    if (isHere) {
      const sel = this.doc.selection.normalizeRange(document.getSelection()!.getRangeAt(0))
      pos = sel?.from.type === 'text' ? sel.from.index : 0
    }

    const tokens = Prism.tokenize(this.block.textContent(), Prism.languages[this.options.lang || 'plaintext'])
    const deltas = flatPrismTokens(tokens, this.options.withLineBreak)

    // 比对deltas，找到不同的deltas
    this.render(deltas, this.block.containerElement)

    isHere && this.block.setInlineRange(pos)
  }

  renderCode() {
    const text = this.block.textContent()
    const tokens = Prism.tokenize(text, Prism.languages[this.options.lang || 'plaintext'])
    const deltas = flatPrismTokens(tokens, this.options.withLineBreak)
    this.render(deltas, this.block.containerElement)
  }
}



