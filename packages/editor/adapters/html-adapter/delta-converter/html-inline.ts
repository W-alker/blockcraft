import {HtmlASTToDeltaMatcher} from "../delta-converter";
import {HtmlAST} from "../../types";
import type { Element } from 'hast';
import { collapseWhiteSpace } from 'collapse-white-space';

const isElement = (ast: HtmlAST): ast is Element => {
  return ast.type === 'element';
};

const textLikeElementTags = ['span', 'bdi', 'bdo', 'ins'];
const listElementTags = ['ol', 'ul'];
const strongElementTags = ['strong', 'b'];
const italicElementTags = ['i', 'em'];

export const htmlTextToDeltaMatcher: HtmlASTToDeltaMatcher = {
  name: 'text',
  match: ast => ast.type === 'text',
  toDelta: (ast, context) => {
    if (!('value' in ast)) {
      return [];
    }
    const { options } = context;
    options.trim ??= true;

    if (options.pre) {
      return [{ insert: ast.value }];
    }

    const value = options.trim
      ? collapseWhiteSpace(ast.value, { trim: options.trim })
      : collapseWhiteSpace(ast.value);
    return value ? [{ insert: value , attributes: {}}] : [];
  },
};

export const htmlTextLikeElementToDeltaMatcher: HtmlASTToDeltaMatcher = {
  name: 'text-like-element',
  match: ast => isElement(ast) && textLikeElementTags.includes(ast.tagName),
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false })
    );
  },
};

export const htmlListToDeltaMatcher: HtmlASTToDeltaMatcher = {
  name: 'list-element',
  match: ast => isElement(ast) && listElementTags.includes(ast.tagName),
  toDelta: () => {
    return [];
  },
};

export const htmlStrongElementToDeltaMatcher: HtmlASTToDeltaMatcher = {
  name: 'strong-element',
  match: ast => isElement(ast) && strongElementTags.includes(ast.tagName),
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false }).map(delta => {
        delta.attributes = { ...delta.attributes, 'a:bold': true };
        return delta;
      })
    );
  },
};

export const htmlItalicElementToDeltaMatcher: HtmlASTToDeltaMatcher = {
  name: 'italic-element',
  match: ast => isElement(ast) && italicElementTags.includes(ast.tagName),
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false }).map(delta => {
        delta.attributes = { ...delta.attributes, 'a:italic': true };
        return delta;
      })
    );
  },
};
export const htmlCodeElementToDeltaMatcher: HtmlASTToDeltaMatcher = {
  name: 'code-element',
  match: ast => isElement(ast) && ast.tagName === 'code',
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false }).map(delta => {
        delta.attributes = { ...delta.attributes, 'a:code': true };
        return delta;
      })
    );
  },
};

export const htmlDelElementToDeltaMatcher: HtmlASTToDeltaMatcher = {
  name: 'del-element',
  match: ast => isElement(ast) && ast.tagName === 'del',
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false }).map(delta => {
        delta.attributes = { ...delta.attributes, 'a:strike': true };
        return delta;
      })
    );
  },
};

export const htmlUnderlineElementToDeltaMatcher: HtmlASTToDeltaMatcher = {
  name: 'underline-element',
  match: ast => isElement(ast) && ast.tagName === 'u',
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false }).map(delta => {
        delta.attributes = { ...delta.attributes, 'a:underline': true };
        return delta;
      })
    );
  },
};

export const htmlLinkElementToDeltaMatcher: HtmlASTToDeltaMatcher = {
  name: 'link-element',
  match: ast => isElement(ast) && ast.tagName === 'a',
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    const href = ast.properties?.['href'];
    if (typeof href !== 'string') {
      return [];
    }
    const { configs } = context;
    // const baseUrl = configs.get('docLinkBaseUrl') ?? '';
    // if (baseUrl && href.startsWith(baseUrl)) {
    //   const path = href.substring(baseUrl.length);
    //   //    ^ - /{pageId}?mode={mode}&blockIds={blockIds}&elementIds={elementIds}
    //   const match = path.match(/^\/([^?]+)(\?.*)?$/);
    //   if (match) {
    //     const pageId = match?.[1];
    //     const search = match?.[2];
    //     const searchParams = search ? new URLSearchParams(search) : undefined;
    //     const mode = searchParams?.get('mode');
    //     const blockIds = searchParams?.get('blockIds')?.split(',');
    //     const elementIds = searchParams?.get('elementIds')?.split(',');
    //
    //     return [
    //       {
    //         insert: ' ',
    //         attributes: {
    //           reference: {
    //             type: 'LinkedPage',
    //             pageId,
    //             params: {
    //               mode:
    //                 mode && ['edgeless', 'page'].includes(mode)
    //                   ? (mode as 'edgeless' | 'page')
    //                   : undefined,
    //               blockIds,
    //               elementIds,
    //             },
    //           },
    //         },
    //       },
    //     ];
    //   }
    // }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false }).map(delta => {
        if (href.startsWith('http')) {
          delta.attributes = {
            ...delta.attributes,
            'a:link': href,
          };
          return delta;
        }
        return delta;
      })
    );
  },
};

export const htmlMarkElementToDeltaMatcher: HtmlASTToDeltaMatcher = {
  name: 'mark-element',
  match: ast => isElement(ast) && ast.tagName === 'mark',
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false }).map(delta => {
        delta.attributes = { ...delta.attributes };
        return delta;
      })
    );
  },
};

export const htmlBrElementToDeltaMatcher: HtmlASTToDeltaMatcher = {
  name: 'br-element',
  match: ast => isElement(ast) && ast.tagName === 'br',
  toDelta: () => {
    return [{ insert: '\n' }];
  },
};

export const htmlMathInlineToDeltaMatcher: HtmlASTToDeltaMatcher = {
  name: 'math-inline',
  match: ast =>
    isElement(ast) && (
      (ast.tagName === 'code' && Array.isArray(ast.properties?.['className']) &&
        (ast.properties['className'] as string[]).includes('math')) ||
      (ast.tagName === 'span' && Array.isArray(ast.properties?.['className']) &&
        (ast.properties['className'] as string[]).some(c => c === 'katex' || c === 'math-inline'))
    ),
  toDelta: (ast, context) => {
    if (!isElement(ast)) return [];
    const latex = (ast.properties?.['dataLatex'] as string) || '';
    if (latex) {
      return [{insert: {latex}}];
    }
    const text = ast.children.flatMap(child =>
      context.toDelta(child, {trim: false})
    ).map(d => d.insert as string).join('');
    return text ? [{insert: {latex: text}}] : [];
  },
};

export const htmlInlineToDeltaMatchers: HtmlASTToDeltaMatcher[] = [
  htmlTextToDeltaMatcher,
  htmlTextLikeElementToDeltaMatcher,
  htmlStrongElementToDeltaMatcher,
  htmlItalicElementToDeltaMatcher,
  htmlCodeElementToDeltaMatcher,
  htmlDelElementToDeltaMatcher,
  htmlUnderlineElementToDeltaMatcher,
  htmlLinkElementToDeltaMatcher,
  htmlMarkElementToDeltaMatcher,
  htmlBrElementToDeltaMatcher,
  htmlMathInlineToDeltaMatcher,
];
