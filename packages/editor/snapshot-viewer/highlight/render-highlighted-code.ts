import type {BundledLanguage, ThemedToken} from "shiki";
import {STR_LINE_BREAK} from "../../framework/block-std/inline/const";
import {DeltaInsertText} from "../../framework/block-std/types/delta.type";
import {InlineModel} from "../../framework/block-std/types/inline.type";
import {SHIKI_LANGUAGE_MAP, shikiService} from "../../blocks/code-block/shiki-config";

const MERMAID_LANG_SET = new Set<BundledLanguage>(["mermaid", "mmd"]);

export async function renderHighlightedCodeModel(
  source: string,
  options: {
    lang?: string
    withLineBreak?: boolean
    theme?: "github-light" | "github-dark"
  } = {}
): Promise<InlineModel> {
  const text = `${source ?? ""}`;
  const lang = resolveLanguage(options.lang);
  const highlighter = await shikiService.getHighlighter();
  await shikiService.ensureLanguageLoaded(lang);

  const theme = options.theme || "github-light";
  const baseTokens = highlighter.codeToTokens(text, {lang, theme});
  let tokenLines = baseTokens.tokens;

  if (isMermaidLang(lang) && !hasMultipleTokenColors(tokenLines)) {
    const wrappedTokens = highlighter.codeToTokens(wrapMermaidForShiki(text), {
      lang,
      theme,
    });
    const stripped = stripMermaidFenceLines(wrappedTokens.tokens);
    if (hasMultipleTokenColors(stripped)) {
      tokenLines = stripped;
    }
  }

  return flatShikiTokens(tokenLines, text, options.withLineBreak !== false);
}

function resolveLanguage(lang?: string): BundledLanguage {
  if (!lang || lang === "PlainText") {
    return "text" as BundledLanguage;
  }

  return (SHIKI_LANGUAGE_MAP[lang] || lang || "text") as BundledLanguage;
}

function isMermaidLang(lang: BundledLanguage) {
  return MERMAID_LANG_SET.has(lang);
}

function hasMultipleTokenColors(lines: ThemedToken[][]): boolean {
  const colors = new Set<string>();
  for (const line of lines) {
    for (const token of line) {
      if (!token.color) continue;
      colors.add(token.color);
      if (colors.size > 1) {
        return true;
      }
    }
  }
  return false;
}

function wrapMermaidForShiki(text: string): string {
  const body = text.endsWith("\n") ? text : `${text}\n`;
  return `\`\`\`mermaid\n${body}\`\`\``;
}

function stripMermaidFenceLines(lines: ThemedToken[][]): ThemedToken[][] {
  if (lines.length <= 2) {
    return [];
  }
  return lines.slice(1, -1);
}

function getOriginalLineBreaks(text: string): string[] {
  return text.match(/\r\n|\r|\n/g) || [];
}

function flatShikiTokens(
  lines: ThemedToken[][],
  originalText: string,
  withLineBreak: boolean
): DeltaInsertText[] {
  const result: DeltaInsertText[] = [];
  const originalLineBreaks = getOriginalLineBreaks(originalText);

  for (let i = 0; i < lines.length; i++) {
    for (const token of lines[i]) {
      if (!token.content) continue;
      result.push({
        insert: token.content,
        attributes: token.color ? {"s:color": token.color} : undefined,
      });
    }

    if (i < lines.length - 1) {
      if (originalLineBreaks[i] === "\r\n") {
        result.push({insert: "\r"});
      }

      result.push({
        insert: STR_LINE_BREAK,
        attributes: withLineBreak ? {"d:lineBreak": true} : undefined,
      });
    }
  }

  return result;
}
