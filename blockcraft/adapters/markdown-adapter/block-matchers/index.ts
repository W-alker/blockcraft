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

export const defaultBlockMarkdownAdapterMatchers = [
  paragraphBlockMarkdownAdapterMatcher,
  listBlockMarkdownAdapterMatcher,
  imageBlockMarkdownAdapterMatcher,
  codeBlockMarkdownAdapterMatcher,
  dividerBlockMarkdownAdapterMatcher,
  embedFigmaBlockMarkdownAdapterMatcher,
  embedJuejinBlockMarkdownAdapterMatcher,
  bookmarkBlockMarkdownAdapterMatcher
]
