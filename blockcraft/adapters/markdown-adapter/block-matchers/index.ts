import {paragraphBlockMarkdownAdapterMatcher} from "./paragraph-matcher";
import {listBlockMarkdownAdapterMatcher} from "./list-matcher";
import {imageBlockMarkdownAdapterMatcher} from "./image-matcher";
import {codeBlockMarkdownAdapterMatcher} from "./code-matcher";
import {dividerBlockMarkdownAdapterMatcher} from "./divider-matcher";
import {
  bookmarkBlockMarkdownAdapterMatcher,
  embedFigmaBlockMarkdownAdapterMatcher,
  embedJuejinBlockMarkdownAdapterMatcher
} from "./embed-matcher";
import {
  tableBlockMarkdownAdapterMatcher,
  tableRowBlockMarkdownAdapterMatcher,
  tableCellBlockMarkdownAdapterMatcher,
  tableCellParagraphMarkdownMatcher,
} from "./table-matcher";
import {formulaBlockMarkdownAdapterMatcher} from "./formula-matcher";

export const defaultBlockMarkdownAdapterMatchers = [
  // Table cell paragraph must come before generic paragraph matcher
  // so that paragraphs inside table cells are handled as inline content
  tableCellParagraphMarkdownMatcher,
  paragraphBlockMarkdownAdapterMatcher,
  listBlockMarkdownAdapterMatcher,
  tableBlockMarkdownAdapterMatcher,
  tableRowBlockMarkdownAdapterMatcher,
  tableCellBlockMarkdownAdapterMatcher,
  imageBlockMarkdownAdapterMatcher,
  codeBlockMarkdownAdapterMatcher,
  formulaBlockMarkdownAdapterMatcher,
  dividerBlockMarkdownAdapterMatcher,
  embedFigmaBlockMarkdownAdapterMatcher,
  embedJuejinBlockMarkdownAdapterMatcher,
  bookmarkBlockMarkdownAdapterMatcher
]
