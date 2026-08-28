import type {DeltaInsert, DeltaInsertEmbed} from '../../framework'
import type {
  HtmlASTToDeltaMatcher,
  InlineDeltaToHtmlAdapterMatcher,
} from '../html-adapter/delta-converter'

export interface InlineObjectHtmlAdapterOptions {
  readonly key: string
  readonly kind: string
  readonly read: (delta: DeltaInsertEmbed) => {
    readonly width?: number
    readonly height?: number
    readonly wrap?: boolean
    readonly x?: number
    readonly gap?: number
    readonly text: DeltaInsert[]
  }
  readonly displayText: (text: DeltaInsert[]) => string
  readonly fromPayload: (
    payload: string,
    attributes: DeltaInsertEmbed['attributes'],
  ) => DeltaInsertEmbed
}

/** Shared HTML envelope with concrete Embed ownership supplied by the caller. */
export function createInlineObjectHtmlMatchers(
  options: InlineObjectHtmlAdapterOptions,
): {
  deltaToAst: InlineDeltaToHtmlAdapterMatcher
  astToDelta: HtmlASTToDeltaMatcher
} {
  return {
    deltaToAst: {
      name: `inline-object:${options.key}`,
      match: delta => !!delta.insert
        && typeof delta.insert === 'object'
        && options.key in delta.insert,
      toAST: delta => {
        const embed = delta as DeltaInsertEmbed
        const data = options.read(embed)
        return {
          type: 'element',
          tagName: 'span',
          properties: {
            className: ['bc-inline-object', `bc-inline-${options.kind}`],
            dataBcInlineObject: options.kind,
            dataBcInlineObjectPayload: String(embed.insert[options.key] ?? ''),
            dataBcInlineObjectWidth: data.width,
            dataBcInlineObjectHeight: data.height,
            ...(data.wrap ? {
              dataBcWrap: 'square',
              dataBcWrapX: data.x,
              ...(data.gap === undefined ? {} : {dataBcWrapGap: data.gap}),
            } : {}),
          },
          children: [{type: 'text', value: options.displayText(data.text)}],
        }
      },
    },
    astToDelta: {
      name: `inline-object:${options.key}`,
      match: ast => ast.type === 'element'
        && ast.tagName === 'span'
        && ast.properties?.['dataBcInlineObject'] === options.kind,
      toDelta: ast => {
        if (ast.type !== 'element') return []
        const payload = ast.properties?.['dataBcInlineObjectPayload']
        if (typeof payload !== 'string') return []
        const width = Number(ast.properties?.['dataBcInlineObjectWidth'])
        const height = Number(ast.properties?.['dataBcInlineObjectHeight'])
        const side = ast.properties?.['dataBcWrapSide']
        const attributes: DeltaInsertEmbed['attributes'] = {
          ...(Number.isFinite(width) && width > 0 ? {width} : {}),
          ...(Number.isFinite(height) && height > 0 ? {height} : {}),
          ...(ast.properties?.['dataBcWrap'] === 'square' ? {
            wrap: true,
            ...(typeof side === 'string' ? {side} : {}),
            x: Number(ast.properties?.['dataBcWrapX']),
            gap: Number(ast.properties?.['dataBcWrapGap']),
          } : {}),
        }
        return [options.fromPayload(payload, attributes)]
      },
    },
  }
}
