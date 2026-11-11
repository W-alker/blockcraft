const MERMAID_MARKDOWN_LANGUAGE_ALIASES = new Set([
  'mermaid',
  // Tolerate the common transposition found in imported Markdown files.
  'mermiad',
])

export function isMermaidMarkdownLanguage(value: unknown): boolean {
  return typeof value === 'string' &&
    MERMAID_MARKDOWN_LANGUAGE_ALIASES.has(value.trim().toLowerCase())
}
