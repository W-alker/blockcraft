import {ASTWalker} from "../base/ast-walker";
import {Markdown, MarkdownAST} from "./type";
import {BlockNodeType, DocFileService, generateId, IBlockSnapshot} from "../../framework";
import type {Root} from 'mdast';
import {BlockMarkdownAdapterMatcher} from "./block-adapter";
import {AdapterContext} from "../types";
import {MarkdownDeltaConverter} from "./delta-converter";
import {inlineDeltaToMarkdownAdapterMatchers} from "./delta-converter/inline-delta";
import {markdownInlineToDeltaMatchers} from "./delta-converter/markdown-inline";
import {AdapterRegistry} from '../registry';
import {
  DEFAULT_MARKDOWN_ADAPTER_PROFILE,
  MARKDOWN_ADAPTER_PROFILE_CONFIG,
  type MarkdownAdapterProfile,
} from '../registry';
import {parseMarkdownAst, stringifyMarkdownAst} from './markdown-processor';

export class MarkdownAdapter extends ASTWalker<MarkdownAST, IBlockSnapshot> {
  deltaConverter: MarkdownDeltaConverter;
  readonly blockMatchers: readonly BlockMarkdownAdapterMatcher[];
  private readonly registry?: AdapterRegistry;

  constructor(
    readonly fileService: DocFileService,
    readonly adapterConfigs = new Map<string, string>(),
    source: readonly BlockMarkdownAdapterMatcher[] | AdapterRegistry,
  ) {
    super();
    this.registry = source instanceof AdapterRegistry ? source : undefined;
    this.blockMatchers = [...(
      this.registry?.markdownBlockMatchers
      ?? source as readonly BlockMarkdownAdapterMatcher[]
    )].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    this.deltaConverter = new MarkdownDeltaConverter(
      adapterConfigs,
      [
        ...(this.registry?.markdownInlineDeltaMatchers ?? []),
        ...inlineDeltaToMarkdownAdapterMatchers.filter(matcher =>
          !this.registry?.markdownInlineDeltaMatchers.some(
            owned => owned.name === matcher.name,
          ),
        ),
      ],
      [
        ...(this.registry?.markdownInlineAstMatchers ?? []),
        ...markdownInlineToDeltaMatchers.filter(matcher =>
          !this.registry?.markdownInlineAstMatchers.some(
            owned => owned.name === matcher.name,
          ),
        ),
      ]
    );
  }

  private _astToMarkdown(ast: Root) {
    return stringifyMarkdownAst(ast, this.markdownProfile);
  }

  private _markdownToAst(markdown: Markdown) {
    return parseMarkdownAst(markdown, this.markdownProfile);
  }

  private get markdownProfile(): MarkdownAdapterProfile {
    const configured = this.adapterConfigs.get(MARKDOWN_ADAPTER_PROFILE_CONFIG)
    return configured === 'portable'
      || configured === 'hybrid'
      || configured === 'blockcraft'
      ? configured
      : DEFAULT_MARKDOWN_ADAPTER_PROFILE;
  }

  async toMarkdown(snapshot: IBlockSnapshot) {
    const root: Root = {
      type: 'root',
      children: [],
    };
    const ast = await this._traverseSnapshot(snapshot, root);
    return this._astToMarkdown(ast);
  }

  async toBlockSnapshot(markdown: Markdown) {
    const blockSnapshotRoot: IBlockSnapshot = {
      id: generateId(),
      flavour: 'root',
      nodeType: BlockNodeType.root,
      props: {},
      meta: {},
      children: [],
    };
    const ast = this._markdownToAst(markdown);
    return this._traverseMarkdown(ast, blockSnapshotRoot);
  }

  private _traverseMarkdown = (
    markdown: MarkdownAST,
    snapshot: IBlockSnapshot,
    // assets?: AssetsManager
  ) => {
    const walker = new ASTWalker<MarkdownAST, IBlockSnapshot>();
    walker.setONodeTypeGuard(
      (node): node is MarkdownAST =>
        !Array.isArray(node) &&
        'type' in (node as object) &&
        (node as MarkdownAST).type !== undefined
    );
    walker.setEnter(async (o, context) => {
      for (const matcher of this.blockMatchers) {
        if (matcher.toMatch(o)) {
          const adapterContext: AdapterContext<
            MarkdownAST,
            IBlockSnapshot,
            MarkdownDeltaConverter
          > = {
            walker,
            fileManager: this.fileService,
            walkerContext: context,
            configs: this.adapterConfigs,
            // job: this.job,
            deltaConverter: this.deltaConverter,
            // textBuffer: { content: '' },
            // assets,
          };
          await matcher.toBlockSnapshot.enter?.(o, adapterContext);
          if (matcher.consumes) break;
        }
      }
    });
    walker.setLeave(async (o, context) => {
      for (const matcher of this.blockMatchers) {
        if (matcher.toMatch(o)) {
          const adapterContext: AdapterContext<
            MarkdownAST,
            IBlockSnapshot,
            MarkdownDeltaConverter
          > = {
            walker,
            walkerContext: context,
            configs: this.adapterConfigs,
            // job: this.job,
            deltaConverter: this.deltaConverter,
            fileManager: this.fileService
          };
          await matcher.toBlockSnapshot.leave?.(o, adapterContext);
          if (matcher.consumes) break;
        }
      }
    });
    return walker.walk(markdown, snapshot);
  };

  private _traverseSnapshot = async (
    snapshot: IBlockSnapshot,
    markdown: MarkdownAST,
    // assets?: AssetsManager
  ) => {
    const walker = new ASTWalker<IBlockSnapshot, MarkdownAST>();
    walker.setONodeTypeGuard(
      (node): node is IBlockSnapshot => typeof node === 'object' && node !== null && 'flavour' in node && 'id' in node
    );
    walker.setEnter(async (o, context) => {
      const matchers = this.registry?.markdownMatchersForFlavour(o.node.flavour)
        ?? this.blockMatchers;
      for (const matcher of matchers) {
        if (matcher.fromMatch(o)) {
          const adapterContext: AdapterContext<
            IBlockSnapshot,
            MarkdownAST,
            MarkdownDeltaConverter
          > = {
            walker,
            walkerContext: context,
            configs: this.adapterConfigs,
            // job: this.job,
            deltaConverter: this.deltaConverter,
            fileManager: this.fileService,
            // textBuffer: { content: '' },
            // assets,
          };
          await matcher.fromBlockSnapshot.enter?.(o, adapterContext);
          if (matcher.consumes) break;
        }
      }
    });
    walker.setLeave(async (o, context) => {
      const matchers = this.registry?.markdownMatchersForFlavour(o.node.flavour)
        ?? this.blockMatchers;
      for (const matcher of matchers) {
        if (matcher.fromMatch(o)) {
          const adapterContext: AdapterContext<
            IBlockSnapshot,
            MarkdownAST,
            MarkdownDeltaConverter
          > = {
            walker,
            walkerContext: context,
            configs: this.adapterConfigs,
            // job: this.job,
            deltaConverter: this.deltaConverter,
            fileManager: this.fileService,
            // textBuffer: { content: '' },
            // assets,
          };
          await matcher.fromBlockSnapshot.leave?.(o, adapterContext);
          if (matcher.consumes) break;
        }
      }
    });
    return(await walker.walk(snapshot, markdown)) as Root
  };

}
