import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import {unified} from 'unified';
import {HtmlAST, AdapterContext} from "../types";
import {ASTWalker} from "../base/ast-walker";
import {BlockNodeType, IBlockSnapshot, generateId, DocFileService} from "../../framework";
import {BlockHtmlAdapterMatcher} from "./block-adapter";
import {HtmlDeltaConverter} from "./delta-converter";
import {inlineDeltaToHtmlAdapterMatchers} from "./delta-converter/inline-delta";
import {htmlInlineToDeltaMatchers} from "./delta-converter/html-inline";
import {DEFAULT_BLOCK_MATCHERS} from "./block-matchers";
import {isYoudaoHtml, parseYoudaoHtml, ynedbg} from "../yne-adapter";
import type {Root} from 'hast';

export class HtmlAdapter extends ASTWalker<HtmlAST, IBlockSnapshot> {
  deltaConverter = new HtmlDeltaConverter(this.adapterConfigs, inlineDeltaToHtmlAdapterMatchers, htmlInlineToDeltaMatchers)

  constructor(
    readonly fileService: DocFileService,
    readonly adapterConfigs = new Map<string, string>(),
    readonly blockMatchers: BlockHtmlAdapterMatcher[] = DEFAULT_BLOCK_MATCHERS,
  ) {
    super();
  }

  private _htmlToAst(html: string) {
    return unified().use(rehypeParse, {fragment: false}).parse(html);
  }

  private _astToHtml(ast: Root) {
    return unified().use(rehypeStringify).stringify(ast);
  }

  private _traverseHtml = async (
    html: HtmlAST,
    snapshot: IBlockSnapshot,
    // assets?: AssetsManager
  ) => {
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
            fileManager: this.fileService,
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
            fileManager: this.fileService,
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

  private _traverseSnapshot = async (
    snapshot: IBlockSnapshot,
    html: HtmlAST,
  ) => {
    const walker = new ASTWalker<IBlockSnapshot, HtmlAST>();
    walker.setONodeTypeGuard(
      (node): node is IBlockSnapshot => typeof node === 'object' && node !== null && 'flavour' in node && 'id' in node
    );
    walker.setEnter((o, context) => {
      for (const matcher of this.blockMatchers) {
        if (matcher.fromMatch(o)) {
          const adapterContext: AdapterContext<
            IBlockSnapshot,
            HtmlAST,
            HtmlDeltaConverter
          > = {
            walker,
            walkerContext: context,
            fileManager: this.fileService,
            // configs: this.configs,
            // job: this.job,
            deltaConverter: this.deltaConverter,
            // textBuffer: { content: '' },
            // assets,
            // updateAssetIds: (assetsId: string) => {
            //   assetsIds.push(assetsId);
            // },
          };
          matcher.fromBlockSnapshot.enter?.(o, adapterContext);
        }
      }
    });
    walker.setLeave(async (o, context) => {
      for (const matcher of this.blockMatchers) {
        if (matcher.fromMatch(o)) {
          const adapterContext: AdapterContext<
            IBlockSnapshot,
            HtmlAST,
            HtmlDeltaConverter
          > = {
            walker,
            walkerContext: context,
            fileManager: this.fileService,
            // configs: this.configs,
            // job: this.job,
            deltaConverter: this.deltaConverter,
            // textBuffer: { content: '' },
            // assets,
          };
          matcher.fromBlockSnapshot.leave?.(o, adapterContext);
        }
      }
    });
    return (await walker.walk(snapshot, html)) as Root
  };

  toBlockSnapshot(html: string) {
    // 有道云 HTML 短路：WKWebView/Tauri 等会剥离 text/yne-json 等自定义剪贴板
    // MIME，只剩 text/html；但完整结构嵌在 <article data-content> 里、图片字节在
    // 可见 <img data:base64> 中。命中即走高保真 bulb 解析，跳过通用（有损）HAST。
    const youdaoMatch = isYoudaoHtml(html);
    ynedbg('HtmlAdapter.toBlockSnapshot: isYoudaoHtml=', youdaoMatch, 'htmlLen=', html.length);
    if (youdaoMatch) {
      const youdao = parseYoudaoHtml(html, this.fileService);
      if (youdao) return Promise.resolve(youdao);
      // matched but parse returned null → parseYoudaoHtml already logged why; fall through to generic
    }
    const blockSnapshotRoot: IBlockSnapshot = {
      id: generateId(),
      flavour: 'root',
      nodeType: BlockNodeType.root,
      props: {},
      meta: {},
      children: [],
    };
    return this._traverseHtml(this._htmlToAst(html), blockSnapshotRoot);
  }

  async toHtml(blockSnapshot: IBlockSnapshot) {
    const root: Root = {
      type: 'root',
      children: [
        {
          type: 'doctype',
        },
      ],
    };
    const ast = await this._traverseSnapshot(blockSnapshot, root);
    return this._astToHtml(ast);
  }
}
