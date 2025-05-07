import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {paragraphBlockHtmlAdapterMatcher} from "./paragraph-matchers";
import {listBlockAdapterMatcher} from "./list-matcher";
import {codeBlockHtmlAdapterMatcher} from "./code-matcher";
import {dividerBlockHtmlAdapterMatcher} from "./divider-matcher";
import {imageBlockHtmlAdapterMatcher} from "./image-matcher";
import {
  bookmarkBlockHtmlAdapterMatcher,
  embedFigmaBlockHtmlAdapterMatcher,
  embedJuejinBlockHtmlAdapterMatcher
} from "./embed-matcher";
import {rootBlockHtmlAdapterMatcher} from "./root-matcher";
import {
  tableBlockHtmlAdapterMatcher,
  tableCellBlockHtmlAdapterMatcher,
  tableRowBlockHtmlAdapterMatcher
} from "./table-matcher";

export const DEFAULT_BLOCK_MATCHERS: BlockHtmlAdapterMatcher[] = [
  paragraphBlockHtmlAdapterMatcher,
  listBlockAdapterMatcher,
  codeBlockHtmlAdapterMatcher,
  dividerBlockHtmlAdapterMatcher,
  imageBlockHtmlAdapterMatcher,
  embedFigmaBlockHtmlAdapterMatcher,
  embedJuejinBlockHtmlAdapterMatcher,
  bookmarkBlockHtmlAdapterMatcher,
  rootBlockHtmlAdapterMatcher,
  tableBlockHtmlAdapterMatcher,
  tableRowBlockHtmlAdapterMatcher,
  tableCellBlockHtmlAdapterMatcher
]
