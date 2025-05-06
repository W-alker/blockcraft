import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {paragraphBlockHtmlAdapterMatcher} from "./paragraph-matchers";
import {listBlockAdapterMatcher} from "./list-matcher";
import {codeBlockHtmlAdapterMatcher} from "./code-matcher";
import {dividerBlockHtmlAdapterMatcher} from "./divider-matcher";

export const DEFAULT_BLOCK_MATCHERS: BlockHtmlAdapterMatcher[] = [
  paragraphBlockHtmlAdapterMatcher,
  listBlockAdapterMatcher,
  codeBlockHtmlAdapterMatcher,
  dividerBlockHtmlAdapterMatcher
]
