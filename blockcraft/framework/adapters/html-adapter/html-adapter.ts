import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import {HtmlAST} from "../types/hast";
import {ASTWalker} from "../base/ast-walker";
import {IBlockSnapshot} from "../../block-std";
import {AdapterContext} from "../types/adapter";
import {BlockHtmlAdapterMatcher, defaultBlockHtmlAdapterMatchers} from "./block-adapter";
import {HtmlDeltaConverter} from "./delta-converter";

export class HtmlAdapter {

  constructor(
    readonly blockMatchers: BlockHtmlAdapterMatcher[] = defaultBlockHtmlAdapterMatchers
  ){}

  private _htmlToAst(html: string) {
    return unified().use(rehypeParse, {fragment: true}).parse(html);
  }

  // private _traverseHtml = async (
  //   html: HtmlAST,
  //   snapshot: IBlockSnapshot,
  //   // assets?: AssetsManager
  // ) => {
  //   const walker = new ASTWalker<HtmlAST, IBlockSnapshot>();
  //   walker.setONodeTypeGuard(
  //     (node): node is HtmlAST =>
  //       'type' in (node as object) && (node as HtmlAST).type !== undefined
  //   );
  //   walker.setEnter(async (o, context) => {
  //     for (const matcher of this.blockMatchers) {
  //       if (matcher.toMatch(o)) {
  //         const adapterContext: AdapterContext<
  //           HtmlAST,
  //           IBlockSnapshot,
  //           HtmlDeltaConverter
  //         > = {
  //           walker,
  //           walkerContext: context,
  //           configs: this.configs,
  //           job: this.job,
  //           deltaConverter: this.deltaConverter,
  //           textBuffer: { content: '' },
  //           assets,
  //         };
  //         await matcher.toBlockSnapshot.enter?.(o, adapterContext);
  //       }
  //     }
  //   });
  //   walker.setLeave(async (o, context) => {
  //     for (const matcher of this.blockMatchers) {
  //       if (matcher.toMatch(o)) {
  //         const adapterContext: AdapterContext<
  //           HtmlAST,
  //           BlockSnapshot,
  //           HtmlDeltaConverter
  //         > = {
  //           walker,
  //           walkerContext: context,
  //           configs: this.configs,
  //           job: this.job,
  //           deltaConverter: this.deltaConverter,
  //           textBuffer: { content: '' },
  //           assets,
  //         };
  //         await matcher.toBlockSnapshot.leave?.(o, adapterContext);
  //       }
  //     }
  //   });
  //   return walker.walk(html, snapshot);
  // };

  toBlockSnapshot(html: string) {
    return this._htmlToAst(html);
  }
}
