import type {Literal} from 'mdast'
import type {MarkdownAST} from '../markdown-adapter/type'
import {sanitizeAdapterProps} from './props-codec'

const MAX_MARKDOWN_PROPS_LENGTH = 48 * 1024
const YAML_ENTRY = /^([A-Za-z_][A-Za-z0-9_-]*|"(?:\\.|[^"\\])*"):\s*(.*)$/

export interface BlockcraftYamlNode extends Literal {
  type: 'blockcraftYaml'
  value: string
}

declare module 'mdast' {
  interface RootContentMap {
    blockcraftYaml: BlockcraftYamlNode
  }
}

function yamlKey(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)
    ? key
    : JSON.stringify(key)
}

function parseYamlKey(value: string): string | null {
  if (!value.startsWith('"')) return value
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return null
  }
}

function parseYamlValue(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    return JSON.parse(trimmed)
  } catch {
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return trimmed.slice(1, -1).replace(/''/g, "'")
    }
    // A plain YAML scalar is intentionally treated as a string. This bounded
    // subset does not implement tags, anchors or implicit timestamp coercion.
    return trimmed
  }
}

function yamlLines(
  value: Record<string, unknown>,
  depth = 0,
): string[] {
  const indent = '  '.repeat(depth)
  return Object.entries(value).flatMap(([key, item]) => {
    if (
      item
      && typeof item === 'object'
      && !Array.isArray(item)
      && Object.keys(item).length > 0
    ) {
      return [
        `${indent}${yamlKey(key)}:`,
        ...yamlLines(item as Record<string, unknown>, depth + 1),
      ]
    }
    return [`${indent}${yamlKey(key)}: ${JSON.stringify(item)}`]
  })
}

type YamlLine = {indent: number; value: string}

function normalizedYamlLines(value: string): YamlLine[] | null {
  const result: YamlLine[] = []
  for (const rawLine of value.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue
    if (/^\t/.test(rawLine)) return null
    const indent = rawLine.length - rawLine.trimStart().length
    if (indent % 2 !== 0) return null
    result.push({indent, value: rawLine.trim()})
  }
  if (!result.length) return []
  const baseIndent = result[0].indent
  if (result.some(line => line.indent < baseIndent)) return null
  return result.map(line => ({
    indent: line.indent - baseIndent,
    value: line.value,
  }))
}

function parseYamlMapping(
  lines: readonly YamlLine[],
  start: number,
  indent: number,
  depth: number,
): {next: number; value: Record<string, unknown>} | null {
  if (depth > 8) return null
  const value: Record<string, unknown> = Object.create(null)
  let index = start
  while (index < lines.length) {
    const line = lines[index]
    if (line.indent < indent) break
    if (line.indent !== indent) return null
    const entry = YAML_ENTRY.exec(line.value)
    if (!entry) return null
    const key = parseYamlKey(entry[1])
    if (!key) return null
    if (entry[2]) {
      value[key] = parseYamlValue(entry[2])
      index += 1
      continue
    }
    if (lines[index + 1]?.indent !== indent + 2) return null
    const child = parseYamlMapping(lines, index + 1, indent + 2, depth + 1)
    if (!child) return null
    value[key] = child.value
    index = child.next
  }
  return {next: index, value}
}

/**
 * Emits a deterministic, human-readable YAML 1.2 subset. Nested records use
 * two-space indentation; arrays use JSON-compatible YAML flow values.
 */
export function createMarkdownPropsNode(
  value: unknown,
): BlockcraftYamlNode | undefined {
  const props = sanitizeAdapterProps(value)
  const yaml = yamlLines(props).join('\n')
  if (!yaml || yaml.length > MAX_MARKDOWN_PROPS_LENGTH) return undefined
  return {
    type: 'blockcraftYaml',
    value: yaml,
  }
}

export function isMarkdownPropsNode(
  node: MarkdownAST | BlockcraftYamlNode | undefined,
): node is BlockcraftYamlNode {
  return !!node
    && node.type === 'blockcraftYaml'
    && 'value' in node
    && typeof node.value === 'string'
}

/** Parses only the YAML subset emitted by {@link createMarkdownPropsNode}. */
export function readMarkdownPropsNode(
  node: MarkdownAST | BlockcraftYamlNode | undefined,
): Record<string, unknown> {
  if (!node || !isMarkdownPropsNode(node)) return Object.create(null)
  if (node.value.length > MAX_MARKDOWN_PROPS_LENGTH) return Object.create(null)
  const lines = normalizedYamlLines(node.value)
  if (!lines) return Object.create(null)
  const parsed = parseYamlMapping(lines, 0, 0, 0)
  if (!parsed || parsed.next !== lines.length) return Object.create(null)
  return sanitizeAdapterProps(parsed.value)
}
