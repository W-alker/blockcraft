import {MarkdownAST} from "./type";
import {BlockAdapterMatcher} from "../types";
import {MarkdownDeltaConverter} from "./delta-converter";

export type BlockMarkdownAdapterMatcher = BlockAdapterMatcher<
  MarkdownAST,
  MarkdownDeltaConverter
>;
