import {BlockAdapterMatcher} from "../types/adapter";
import {HtmlAST} from "../types/hast";
import {HtmlDeltaConverter} from "./delta-converter";

export type BlockHtmlAdapterMatcher = BlockAdapterMatcher<
  HtmlAST,
  HtmlDeltaConverter
>;

export const defaultBlockHtmlAdapterMatchers = [
];

