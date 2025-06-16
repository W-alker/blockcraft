import {ASTWalker} from "../base/ast-walker";
import {Markdown, MarkdownAST} from "./type";
import {BlockNodeType, DocFileService, generateId, IBlockSnapshot} from "../../framework";
import type {Root} from 'mdast';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import {unified} from "unified";
import {remarkGfm} from "./gfm";
import {defaultBlockMarkdownAdapterMatchers} from "./block-matchers";
import {BlockMarkdownAdapterMatcher} from "./block-adapter";
import {AdapterContext} from "../types";
import {MarkdownDeltaConverter} from "./delta-converter";
import {inlineDeltaToMarkdownAdapterMatchers} from "./delta-converter/inline-delta";
import {markdownInlineToDeltaMatchers} from "./delta-converter/markdown-inline";

export class MarkdownAdapter extends ASTWalker<MarkdownAST, IBlockSnapshot> {
  deltaConverter: MarkdownDeltaConverter;

  constructor(
    readonly fileService: DocFileService,
    readonly adapterConfigs = new Map<string, string>(),
    readonly blockMatchers: BlockMarkdownAdapterMatcher[] = defaultBlockMarkdownAdapterMatchers,
  ) {
    super();
    this.deltaConverter = new MarkdownDeltaConverter(
      adapterConfigs,
      inlineDeltaToMarkdownAdapterMatchers,
      markdownInlineToDeltaMatchers
    );
  }

  private _astToMarkdown(ast: Root) {
    return unified()
      .use(remarkGfm)
      .use(remarkStringify, {
        resourceLink: true,
      })
      .use(remarkMath)
      .stringify(ast)
      .replace(/&#x20;\n/g, ' \n');
  }

  private _markdownToAst(markdown: Markdown) {
    return unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .parse(markdown);
  }

  async toMarkdown(snapshot: IBlockSnapshot) {
    return ''
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
    console.log(ast)
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
            MarkdownAST,
            IBlockSnapshot,
            MarkdownDeltaConverter
          > = {
            walker,
            walkerContext: context,
            // configs: this.configs,
            // job: this.job,
            deltaConverter: this.deltaConverter,
            fileManager: this.fileService
          };
          await matcher.toBlockSnapshot.leave?.(o, adapterContext);
        }
      }
    });
    return walker.walk(markdown, snapshot);
  };
}
