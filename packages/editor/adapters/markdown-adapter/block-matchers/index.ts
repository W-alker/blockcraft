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
} from "./table-matcher";
import {formulaBlockMarkdownAdapterMatcher} from "./formula-matcher";
import {mediaBlockMarkdownAdapterMatcher} from "./media-matcher";

export const defaultBlockMarkdownAdapterMatchers = [
  mediaBlockMarkdownAdapterMatcher,
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
