import type { PhrasingContent } from 'mdast';
import type { MarkdownAST } from './type';
import {
  type ASTToDeltaMatcher,
  DeltaASTConverter, InlineDeltaMatcher,
} from '../types';
import {DeltaInsert, IInlineNodeAttrs} from "../../framework";

export type InlineDeltaToMarkdownAdapterMatcher =
  InlineDeltaMatcher<PhrasingContent>;

export type MarkdownASTToDeltaMatcher = ASTToDeltaMatcher<MarkdownAST>;

export class MarkdownDeltaConverter extends DeltaASTConverter<
  IInlineNodeAttrs,
  MarkdownAST
> {
  constructor(
    readonly configs: Map<string, string>,
    readonly inlineDeltaMatchers: InlineDeltaToMarkdownAdapterMatcher[],
    readonly markdownASTToDeltaMatchers: MarkdownASTToDeltaMatcher[]
    ) {
    super();
  }

  private _deltaInsertToPlainText(delta: DeltaInsert) {
    if (typeof delta.insert === 'string') {
      return delta.insert;
    }

    if ('mention' in delta.insert) {
      return String(delta.insert['mention'] ?? '');
    }

    return '';
  }

  applyTextFormatting(
    delta: DeltaInsert
  ): PhrasingContent {
    const plainText = this._deltaInsertToPlainText(delta);
    let mdast: PhrasingContent = {
      type: 'text',
      value: delta.attributes?.["a:underline"]
        ? `<u>${plainText}</u>`
        : plainText,
    };

    const context: {
      configs: Map<string, string>;
      current: PhrasingContent;
    } = {
      configs: this.configs,
      current: mdast,
    };
    for (const matcher of this.inlineDeltaMatchers) {
      if (matcher.match(delta)) {
        mdast = matcher.toAST(delta, context);
        context.current = mdast;
      }
    }

    return mdast;
  }

  astToDelta(ast: MarkdownAST): DeltaInsert[] {
    const context = {
      configs: this.configs,
      options: Object.create(null),
      toDelta: (ast: MarkdownAST) => this.astToDelta(ast),
    };
    for (const matcher of this.markdownASTToDeltaMatchers) {
      if (matcher.match(ast)) {
        return matcher.toDelta(ast, context);
      }
    }
    return 'children' in ast
      ? ast.children.flatMap(child => this.astToDelta(child))
      : [];
  }

  deltaToAST(
    deltas: DeltaInsert[],
    depth = 0
  ): PhrasingContent[] {
    if (depth > 0) {
      deltas.unshift({ insert: ' '.repeat(4).repeat(depth) });
    }

    return deltas.map(delta => this.applyTextFormatting(delta));
  }
}
