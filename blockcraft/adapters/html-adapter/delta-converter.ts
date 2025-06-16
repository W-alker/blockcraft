import {ASTToDeltaMatcher, DeltaASTConverter, DeltaASTConverterOptions, InlineDeltaMatcher} from "../types";
import {DeltaInsert, IInlineNodeAttrs} from "../../framework";
import {HtmlAST, InlineHtmlAST} from "../types";
import {TextUtils} from "../utils";

export type InlineDeltaToHtmlAdapterMatcher = InlineDeltaMatcher<InlineHtmlAST>;

export type HtmlASTToDeltaMatcher = ASTToDeltaMatcher<HtmlAST>;

export class HtmlDeltaConverter extends DeltaASTConverter<
  IInlineNodeAttrs,
  HtmlAST
> {
  constructor(
    readonly configs: Map<string, string>,
    readonly inlineDeltaMatchers: InlineDeltaToHtmlAdapterMatcher[],
    readonly htmlASTToDeltaMatchers: HtmlASTToDeltaMatcher[]
  ) {
    super();
  }

  private _applyTextFormatting(
    delta: DeltaInsert
  ): InlineHtmlAST {
    let hast: InlineHtmlAST = {
      type: 'text',
      value: delta.insert as string,
    };

    const context: {
      configs: Map<string, string>;
      current: InlineHtmlAST;
    } = {
      configs: this.configs,
      current: hast,
    };
    for (const matcher of this.inlineDeltaMatchers) {
      if (matcher.match(delta)) {
        hast = matcher.toAST(delta, context);
        context.current = hast;
      }
    }

    return hast;
  }

  private _spreadAstToDelta(
    ast: HtmlAST,
    options: DeltaASTConverterOptions = Object.create(null)
  ): DeltaInsert[] {
    const context = {
      configs: this.configs,
      options,
      toDelta: (ast: HtmlAST, options?: DeltaASTConverterOptions) =>
        this._spreadAstToDelta(ast, options),
    };
    for (const matcher of this.htmlASTToDeltaMatchers) {
      if (matcher.match(ast)) {
        return matcher.toDelta(ast, context);
      }
    }
    return 'children' in ast
      ? ast.children.flatMap(child => this._spreadAstToDelta(child, options))
      : [];
  }

  astToDelta(
    ast: HtmlAST,
    options: DeltaASTConverterOptions = Object.create(null)
  ): DeltaInsert[] {
    return this._spreadAstToDelta(ast, options).reduce((acc, cur) => {
      return TextUtils.mergeDeltas(acc, cur)
    }, [] as DeltaInsert[]);
  }

  deltaToAST(
    deltas: DeltaInsert[],
    depth = 0
  ): InlineHtmlAST[] {
    if (depth > 0) {
      deltas.unshift({insert: ' '.repeat(4).repeat(depth)});
    }

    return deltas.map(delta => this._applyTextFormatting(delta));
  }
}
