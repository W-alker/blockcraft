import type {Root} from 'mdast'
import remarkDirective from 'remark-directive'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import {unified} from 'unified'
import type {Processor} from 'unified'
import type {MarkdownAdapterProfile} from '../registry'
import {remarkGfm} from './gfm'
import type {Markdown} from './type'

let parseSequence = 0
const MAX_BLOCKCRAFT_YAML_LENGTH = 48 * 1024
const DIRECTIVE_OPEN = /^ {0,3}:{3,}[A-Za-z][^\r\n]*$/
const YAML_DELIMITER = /^[ \t]*---[ \t]*$/
const CODE_FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/

type BlockcraftYamlNode = {
  type: 'blockcraftYaml'
  value: string
}

type DirectiveNode = {
  type: 'containerDirective'
  name?: string
  children?: unknown[]
}

type MarkdownHandler = {
  (
    node: DirectiveNode,
    parent: unknown,
    state: unknown,
    info: unknown,
  ): string
  peek?: () => string
}

type ToMarkdownExtension = {
  handlers?: Record<string, MarkdownHandler>
}

function remarkBlockcraftYaml(this: Processor) {
  const data = this.data()
  const toMarkdownExtensions =
    data.toMarkdownExtensions || (data.toMarkdownExtensions = [])
  toMarkdownExtensions.push({
    handlers: {
      blockcraftYaml: (node: BlockcraftYamlNode) =>
        `---\n${node.value}\n---`,
    },
  } as never)
}

/**
 * Keep custom container syntax readable without post-processing the serialized
 * document. Wrapping the directive handler is important: a global replacement
 * could alter literal `:::` lines inside fenced code or other Markdown text.
 */
function remarkBlockcraftDirectiveSpacing(this: Processor) {
  const data = this.data()
  const extensions = (data.toMarkdownExtensions ?? []) as ToMarkdownExtension[]
  let directiveHandler: MarkdownHandler | undefined
  for (let index = extensions.length - 1; index >= 0; index -= 1) {
    directiveHandler = extensions[index].handlers?.['containerDirective']
    if (directiveHandler) break
  }
  if (!directiveHandler) {
    throw new Error('BlockCraft directive spacing requires remark-directive')
  }

  const spacedHandler: MarkdownHandler = (node, parent, state, info) => {
    const markdown = directiveHandler(node, parent, state, info)
    if (!node.children?.length) return markdown

    const openingEnd = markdown.indexOf('\n')
    const closingStart = markdown.lastIndexOf('\n')
    if (openingEnd < 0 || closingStart <= openingEnd) return markdown

    const body = markdown
      .slice(openingEnd + 1, closingStart)
      .replace(/^\n+|\n+$/g, '')
    if (!body) return markdown
    return `${markdown.slice(0, openingEnd + 1)}\n${body}\n\n${markdown.slice(closingStart + 1)}`
  }
  spacedHandler.peek = directiveHandler.peek
  extensions.push({handlers: {containerDirective: spacedHandler}})
}

function extractBlockcraftYaml(markdown: Markdown): {
  source: Markdown
  markers: Map<string, string>
} {
  const markers = new Map<string, string>()
  const sequence = parseSequence++
  const lines = markdown.split(/\r?\n/)
  const result: string[] = []
  let codeFence: {character: '`' | '~'; size: number} | undefined
  for (let index = 0; index < lines.length; index += 1) {
    const opening = lines[index]
    if (codeFence) {
      const activeFence = codeFence
      const candidate = opening.trim()
      if (
        candidate.length >= activeFence.size
        && [...candidate].every(character => character === activeFence.character)
      ) {
        codeFence = undefined
      }
      result.push(opening)
      continue
    }

    const fence = CODE_FENCE_OPEN.exec(opening)?.[1]
    if (fence) {
      codeFence = {
        character: fence[0] as '`' | '~',
        size: fence.length,
      }
      result.push(opening)
      continue
    }

    if (!DIRECTIVE_OPEN.test(opening)) {
      result.push(opening)
      continue
    }

    let yamlStart = index + 1
    while (yamlStart < lines.length && !lines[yamlStart].trim()) {
      yamlStart += 1
    }
    if (!YAML_DELIMITER.test(lines[yamlStart] ?? '')) {
      result.push(opening)
      continue
    }

    let closing = yamlStart + 1
    let length = 0
    while (closing < lines.length && !YAML_DELIMITER.test(lines[closing])) {
      length += lines[closing].length + 1
      if (length > MAX_BLOCKCRAFT_YAML_LENGTH) break
      closing += 1
    }
    if (
      length > MAX_BLOCKCRAFT_YAML_LENGTH
      || closing >= lines.length
    ) {
      result.push(opening)
      continue
    }

    const marker = `<!--__bc_props_${sequence}_${markers.size}__-->`
    markers.set(marker, lines.slice(yamlStart + 1, closing).join('\n'))
    result.push(opening, marker)
    index = closing
  }
  return {source: result.join('\n'), markers}
}

function restoreBlockcraftYaml(
  node: {type: string; value?: string; children?: unknown[]},
  markers: ReadonlyMap<string, string>,
): void {
  if (node.type === 'html' && node.value && markers.has(node.value)) {
    node.type = 'blockcraftYaml'
    node.value = markers.get(node.value)!
    return
  }
  for (const child of node.children ?? []) {
    if (child && typeof child === 'object' && 'type' in child) {
      restoreBlockcraftYaml(
        child as {type: string; value?: string; children?: unknown[]},
        markers,
      )
    }
  }
}

function createMarkdownParser(_profile: MarkdownAdapterProfile) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    // Parsing is deliberately a superset in every profile. This lets pasted or
    // imported BlockCraft Markdown recover lossless `:::` blocks through the
    // normal Markdown MIME adapter, while the profile continues to control
    // whether exports emit private directive syntax.
    .use(remarkDirective)
}

/**
 * `remark-directive` marks `:` unsafe in link resources because the same
 * character introduces directives. Restore only BlockCraft's standard-link
 * markers after serialization so hybrid exports stay readable and continue to
 * work in Markdown implementations that know nothing about directives.
 */
function restoreInteroperableLinkMarkers(markdown: string): string {
  return markdown
    .replace(
      /\((urn(?:\\:[^)\s"]+)+)(?=[\s)])/g,
      (_, destination: string) => `(${destination.replace(/\\:/g, ':')}`,
    )
    .replace(
      /"blockcraft\\:([a-z0-9-]+)"/gi,
      '"blockcraft:$1"',
    )
}

function createMarkdownStringifier(profile: MarkdownAdapterProfile) {
  const processor = unified()
    .use(remarkGfm)
    .use(remarkBlockcraftYaml)
    .use(remarkStringify, {resourceLink: true})
    .use(remarkMath)
  if (profile !== 'portable') {
    processor
      .use(remarkDirective)
      .use(remarkBlockcraftDirectiveSpacing)
  }
  return processor
}

const markdownParsers = new Map<
  MarkdownAdapterProfile,
  ReturnType<typeof createMarkdownParser>
>()
const markdownStringifiers = new Map<
  MarkdownAdapterProfile,
  ReturnType<typeof createMarkdownStringifier>
>()

/** Package-internal Remark grammar used by every MarkdownAdapter caller. */
export function parseMarkdownAst(
  markdown: Markdown,
  profile: MarkdownAdapterProfile,
): Root {
  const processor = markdownParsers.get(profile)
    ?? createMarkdownParser(profile)
  markdownParsers.set(profile, processor)
  const extracted = extractBlockcraftYaml(markdown)
  const ast = processor.parse(extracted.source)
  restoreBlockcraftYaml(ast, extracted.markers)
  return ast
}

/** Package-internal serializer paired with {@link parseMarkdownAst}. */
export function stringifyMarkdownAst(
  ast: Root,
  profile: MarkdownAdapterProfile,
): string {
  const processor = markdownStringifiers.get(profile)
    ?? createMarkdownStringifier(profile)
  markdownStringifiers.set(profile, processor)
  return restoreInteroperableLinkMarkers(
    processor.stringify(ast).replace(/&#x20;\n/g, ' \n'),
  )
}
