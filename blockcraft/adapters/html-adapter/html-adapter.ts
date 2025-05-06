import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import {HtmlAST, AdapterContext} from "../types";
import {ASTWalker} from "../base/ast-walker";
import {BlockNodeType, IBlockSnapshot, generateId} from "../../framework";
import {BlockHtmlAdapterMatcher} from "./block-adapter";
import {HtmlDeltaConverter} from "./delta-converter";
import {inlineDeltaToHtmlAdapterMatchers} from "./delta-converter/inline-delta";
import {htmlInlineToDeltaMatchers} from "./delta-converter/html-inline";
import {DEFAULT_BLOCK_MATCHERS} from "./block-matchers";

export class HtmlAdapter extends ASTWalker<HtmlAST, IBlockSnapshot>{
  deltaConverter = new HtmlDeltaConverter(this.adapterConfigs, inlineDeltaToHtmlAdapterMatchers, htmlInlineToDeltaMatchers)

  constructor(
    readonly blockMatchers: BlockHtmlAdapterMatcher[] = DEFAULT_BLOCK_MATCHERS,
    readonly adapterConfigs = new Map<string, string>(),
  ){
    super();
  }

  private _htmlToAst(html: string) {
    return unified().use(rehypeParse, {fragment: false}).parse(html);
  }

  private _traverseHtml = async (
    html: HtmlAST,
    snapshot: IBlockSnapshot,
    // assets?: AssetsManager
  ) => {

    console.log('-----', html)

    const walker = new ASTWalker<HtmlAST, IBlockSnapshot>();
    walker.setONodeTypeGuard(
      (node): node is HtmlAST =>
        'type' in (node as object) && (node as HtmlAST).type !== undefined
    );
    walker.setEnter(async (o, context) => {
      for (const matcher of this.blockMatchers) {
        if (matcher.toMatch(o)) {
          const adapterContext: AdapterContext<
            HtmlAST,
            IBlockSnapshot,
            HtmlDeltaConverter
          > = {
            walker,
            walkerContext: context,
            // configs: this.configs,
            // job: this.job,
            deltaConverter: this.deltaConverter,
            // textBuffer: { content: '' },
            // assets,
          };
          await matcher.toBlockSnapshot.enter?.(o, adapterContext);
        }
      }
    });
    walker.setLeave(async (o, context) => {
      for (const matcher of this.blockMatchers) {
        if (matcher.toMatch(o)) {
          const adapterContext: AdapterContext<
            HtmlAST,
            IBlockSnapshot,
            HtmlDeltaConverter
          > = {
            walker,
            walkerContext: context,
            // configs: this.configs,
            // job: this.job,
            deltaConverter: this.deltaConverter,
            // textBuffer: { content: '' },
            // assets,
          };
          await matcher.toBlockSnapshot.leave?.(o, adapterContext);
        }
      }
    });
    return walker.walk(html, snapshot);
  };

  toBlockSnapshot(html: string) {
    const blockSnapshotRoot: IBlockSnapshot = {
      id: generateId(),
      flavour: 'root',
      nodeType: BlockNodeType.root,
      props: {
      },
      meta: {},
      children: [],
    };
    return this._traverseHtml(this._htmlToAst(html), blockSnapshotRoot);
  }
}
