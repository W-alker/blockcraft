import {BlockAdapterMatcher, HtmlAST} from "../types";
import {HtmlDeltaConverter} from "./delta-converter";

export type BlockHtmlAdapterMatcher = BlockAdapterMatcher<
  HtmlAST,
  HtmlDeltaConverter
>;


