import {MarkdownASTToDeltaMatcher} from "../delta-converter";
import {isUrl} from "../../../global";

export const markdownTextToDeltaMatcher: MarkdownASTToDeltaMatcher = {
  name: 'text',
  match: ast => ast.type === 'text',
  toDelta: ast => {
    if (!('value' in ast)) {
      return [];
    }
    return [{insert: ast.value}];
  },
};

export const markdownInlineCodeToDeltaMatcher: MarkdownASTToDeltaMatcher = {
  name: 'inlineCode',
  match: ast => ast.type === 'inlineCode',
  toDelta: ast => {
    if (!('value' in ast)) {
      return [];
    }
    return [{insert: ast.value, attributes: {['a:code']: true}}];
  },
};

export const markdownStrongToDeltaMatcher: MarkdownASTToDeltaMatcher = {
  name: 'strong',
  match: ast => ast.type === 'strong',
  toDelta: (ast, context) => {
    if (!('children' in ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child).map(delta => {
        delta.attributes = {...delta.attributes, ['a:bold']: true};
        return delta;
      })
    );
  },
};

export const markdownEmphasisToDeltaMatcher: MarkdownASTToDeltaMatcher = {
  name: 'emphasis',
  match: ast => ast.type === 'emphasis',
  toDelta: (ast, context) => {
    if (!('children' in ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child).map(delta => {
        delta.attributes = {...delta.attributes, ['a:italic']: true};
        return delta;
      })
    );
  },
};

export const markdownDeleteToDeltaMatcher: MarkdownASTToDeltaMatcher = {
  name: 'delete',
  match: ast => ast.type === 'delete',
  toDelta: (ast, context) => {
    if (!('children' in ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child).map(delta => {
        delta.attributes = {...delta.attributes, ['a:strike']: true};
        return delta;
      })
    );
  },
};

export const markdownLinkToDeltaMatcher: MarkdownASTToDeltaMatcher = {
  name: 'link',
  match: ast => ast.type === 'link',
  toDelta: (ast, context) => {
    if (!('children' in ast) || !('url' in ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child).map(delta => {
        if (isUrl(ast.url)) {
          delta.attributes = {...delta.attributes, ['a:link']: ast.url};
        }
        return delta;
      })
    );
  },
};

export const markdownListToDeltaMatcher: MarkdownASTToDeltaMatcher = {
  name: 'list',
  match: ast => ast.type === 'list',
  toDelta: () => [],
};

export const markdownTableToDeltaMatcher: MarkdownASTToDeltaMatcher = {
  name: 'table',
  match: ast => ast.type === 'table' || ast.type === 'tableRow',
  toDelta: () => [],
};

export const markdownInlineMathToDeltaMatcher: MarkdownASTToDeltaMatcher = {
  name: 'inlineMath',
  match: ast => ast.type === 'inlineMath',
  toDelta: ast => {
    if (!('value' in ast)) {
      return [];
    }
    return [{insert: {latex: ast.value}}];
  },
};

export const markdownInlineToDeltaMatchers: MarkdownASTToDeltaMatcher[] = [
  markdownTextToDeltaMatcher,
  markdownInlineCodeToDeltaMatcher,
  markdownStrongToDeltaMatcher,
  markdownEmphasisToDeltaMatcher,
  markdownDeleteToDeltaMatcher,
  markdownLinkToDeltaMatcher,
  markdownInlineMathToDeltaMatcher,
  markdownListToDeltaMatcher,
  markdownTableToDeltaMatcher,
];
