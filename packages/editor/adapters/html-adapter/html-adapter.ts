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
import type {Root} from 'hast';
import {AdapterRegistry} from '../registry';

export class HtmlAdapter extends ASTWalker<HtmlAST, IBlockSnapshot> {
  deltaConverter: HtmlDeltaConverter
  readonly blockMatchers: readonly BlockHtmlAdapterMatcher[]
  private readonly registry?: AdapterRegistry

  constructor(
    readonly fileService: DocFileService,
    readonly adapterConfigs = new Map<string, string>(),
    source: readonly BlockHtmlAdapterMatcher[] | AdapterRegistry,
  ) {
    super();
    this.registry = source instanceof AdapterRegistry ? source : undefined
    this.blockMatchers = [...(
      this.registry?.htmlBlockMatchers
      ?? source as readonly BlockHtmlAdapterMatcher[]
    )].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    this.deltaConverter = new HtmlDeltaConverter(
      adapterConfigs,
      [
        ...(this.registry?.htmlInlineDeltaMatchers ?? []),
        ...inlineDeltaToHtmlAdapterMatchers.filter(matcher =>
          !this.registry?.htmlInlineDeltaMatchers.some(
            owned => owned.name === matcher.name,
          ),
        ),
      ],
      [
        ...(this.registry?.htmlInlineAstMatchers ?? []),
        ...htmlInlineToDeltaMatchers.filter(matcher =>
          !this.registry?.htmlInlineAstMatchers.some(
            owned => owned.name === matcher.name,
          ),
        ),
      ],
    )
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
            configs: this.adapterConfigs,
            // job: this.job,
            deltaConverter: this.deltaConverter,
            // textBuffer: { content: '' },
            // assets,
          };
          await matcher.toBlockSnapshot.enter?.(o, adapterContext);
          if (matcher.consumes) break
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
            configs: this.adapterConfigs,
            // job: this.job,
            deltaConverter: this.deltaConverter,
            // textBuffer: { content: '' },
            // assets,
          };
          await matcher.toBlockSnapshot.leave?.(o, adapterContext);
          if (matcher.consumes) break
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
      const matchers = this.registry?.htmlMatchersForFlavour(o.node.flavour)
        ?? this.blockMatchers
      for (const matcher of matchers) {
        if (matcher.fromMatch(o)) {
          const adapterContext: AdapterContext<
            IBlockSnapshot,
            HtmlAST,
            HtmlDeltaConverter
          > = {
            walker,
            walkerContext: context,
            fileManager: this.fileService,
            configs: this.adapterConfigs,
            // job: this.job,
            deltaConverter: this.deltaConverter,
            // textBuffer: { content: '' },
            // assets,
            // updateAssetIds: (assetsId: string) => {
            //   assetsIds.push(assetsId);
            // },
          };
          matcher.fromBlockSnapshot.enter?.(o, adapterContext);
          if (matcher.consumes) break
        }
      }
    });
    walker.setLeave(async (o, context) => {
      const matchers = this.registry?.htmlMatchersForFlavour(o.node.flavour)
        ?? this.blockMatchers
      for (const matcher of matchers) {
        if (matcher.fromMatch(o)) {
          const adapterContext: AdapterContext<
            IBlockSnapshot,
            HtmlAST,
            HtmlDeltaConverter
          > = {
            walker,
            walkerContext: context,
            fileManager: this.fileService,
            configs: this.adapterConfigs,
            // job: this.job,
            deltaConverter: this.deltaConverter,
            // textBuffer: { content: '' },
            // assets,
          };
          matcher.fromBlockSnapshot.leave?.(o, adapterContext);
          if (matcher.consumes) break
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
    return this._astToHtml(ast);
  }
}
