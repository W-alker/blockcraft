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
import type {Root} from 'hast';

export const SIGN_BLOCK_CRAFT_JSON = 'blockcraft-json';

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
    // TODO 删除log
    console.log('----------------html ast', html)

    if (html.type === 'root') {
      const htmlNode = html.children.find(node => node.type === 'element' && node.tagName === 'html')
      if (htmlNode && htmlNode.type === 'element' && htmlNode.properties && htmlNode.properties[SIGN_BLOCK_CRAFT_JSON]) {
        const json = JSON.parse(htmlNode.properties[SIGN_BLOCK_CRAFT_JSON] as string)
        // TODO 验证数据完整性
        return json
      }
    }

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
    const htmlElement = ast.children.find(v => v.type === 'element' && v.tagName === 'html')
    if (htmlElement && htmlElement.type === 'element') {
      htmlElement.properties[SIGN_BLOCK_CRAFT_JSON] = JSON.stringify(blockSnapshot)
    }
    return this._astToHtml(ast);
  }
}
