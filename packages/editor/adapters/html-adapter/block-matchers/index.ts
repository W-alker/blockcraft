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
import {formulaBlockHtmlAdapterMatcher} from "./formula-matcher";
import {mediaBlockHtmlAdapterMatcher} from "./media-matcher";
import {shapeBlockHtmlAdapterMatcher} from "./shape-matcher";
import {wordArtBlockHtmlAdapterMatcher} from "./word-art-matcher";
import {renderUnitBlockHtmlAdapterMatcher} from "./render-unit-matcher";
import {textBoxBlockHtmlAdapterMatcher} from "./text-box-matcher";

export const DEFAULT_BLOCK_MATCHERS: BlockHtmlAdapterMatcher[] = [
  renderUnitBlockHtmlAdapterMatcher,
  textBoxBlockHtmlAdapterMatcher,
  shapeBlockHtmlAdapterMatcher,
  wordArtBlockHtmlAdapterMatcher,
  paragraphBlockHtmlAdapterMatcher,
  listBlockAdapterMatcher,
  codeBlockHtmlAdapterMatcher,
  formulaBlockHtmlAdapterMatcher,
  dividerBlockHtmlAdapterMatcher,
  imageBlockHtmlAdapterMatcher,
  mediaBlockHtmlAdapterMatcher,
  embedFigmaBlockHtmlAdapterMatcher,
  embedJuejinBlockHtmlAdapterMatcher,
  bookmarkBlockHtmlAdapterMatcher,
  rootBlockHtmlAdapterMatcher,
  tableBlockHtmlAdapterMatcher,
  tableRowBlockHtmlAdapterMatcher,
  tableCellBlockHtmlAdapterMatcher
]
