import {InlineDeltaToHtmlAdapterMatcher} from "../delta-converter";
import {InlineHtmlAST} from "../../types";


export const boldDeltaToHtmlAdapterMatcher: InlineDeltaToHtmlAdapterMatcher = {
  name: 'bold',
  match: delta => !!delta.attributes?.['a:bold'],
  toAST: (_, context) => {
    return {
      type: 'element',
      tagName: 'strong',
      properties: {},
      children: [context.current],
    };
  },
};

export const italicDeltaToHtmlAdapterMatcher: InlineDeltaToHtmlAdapterMatcher =
  {
    name: 'italic',
    match: delta => !!delta.attributes?.['a:italic'],
    toAST: (_, context) => {
      return {
        type: 'element',
        tagName: 'em',
        properties: {},
        children: [context.current],
      };
    },
  };

export const strikeDeltaToHtmlAdapterMatcher: InlineDeltaToHtmlAdapterMatcher =
  {
    name: 'strike',
    match: delta => !!delta.attributes?.['a:strike'],
    toAST: (_, context) => {
      return {
        type: 'element',
        tagName: 'del',
        properties: {},
        children: [context.current],
      };
    },
  };

export const inlineCodeDeltaToMarkdownAdapterMatcher: InlineDeltaToHtmlAdapterMatcher =
  {
    name: 'inlineCode',
    match: delta => !!delta.attributes?.['a:code'],
    toAST: (_, context) => {
      return {
        type: 'element',
        tagName: 'code',
        properties: {},
        children: [context.current],
      };
    },
  };

export const underlineDeltaToHtmlAdapterMatcher: InlineDeltaToHtmlAdapterMatcher =
  {
    name: 'underline',
    match: delta => !!delta.attributes?.['a:underline'],
    toAST: (_, context) => {
      return {
        type: 'element',
        tagName: 'u',
        properties: {},
        children: [context.current],
      };
    },
  };

// export const referenceDeltaToHtmlAdapterMatcher: InlineDeltaToHtmlAdapterMatcher =
//   {
//     name: 'reference',
//     match: delta => !!delta.attributes?.reference,
//     toAST: (delta, context) => {
//       let hast: InlineHtmlAST = {
//         type: 'text',
//         value: delta.insert,
//       };
//       const reference = delta.attributes?.reference;
//       if (!reference) {
//         return hast;
//       }
//
//       const { configs } = context;
//       const title = configs.get(`title:${reference.pageId}`);
//       const url = generateDocUrl(
//         configs.get('docLinkBaseUrl') ?? '',
//         String(reference.pageId),
//         reference.params ?? Object.create(null)
//       );
//       if (title) {
//         hast.value = title;
//       }
//       hast = {
//         type: 'element',
//         tagName: 'a',
//         properties: {
//           href: url,
//         },
//         children: [hast],
//       };
//
//       return hast;
//     },
//   };

export const linkDeltaToHtmlAdapterMatcher: InlineDeltaToHtmlAdapterMatcher = {
  name: 'link',
  match: delta => !!delta.attributes?.['a:link'],
  toAST: (delta, _) => {
    const hast: InlineHtmlAST = {
      type: 'text',
      value: delta.insert as string,
    };
    const link = delta.attributes?.['a:link'];
    if (!link) {
      return hast;
    }
    return {
      type: 'element',
      tagName: 'a',
      properties: {
        href: link,
      },
      children: [hast],
    };
  },
};

export const mentionDeltaToHtmlAdapterMatcher: InlineDeltaToHtmlAdapterMatcher =
  {
    name: 'mention',
    // @ts-expect-error
    match: delta => typeof delta === 'object' && !!delta.insert?.['mention'],
    toAST: (_, context) => {
      return {
        type: 'element',
        tagName: 'span',
        properties: {},
        children: [],
      };
    },
  };

export const latexDeltaToHtmlAdapterMatcher: InlineDeltaToHtmlAdapterMatcher =
  {
    name: 'latex',
    match: delta => typeof delta.insert === 'object' && 'latex' in (delta.insert as object),
    toAST: delta => {
      const latex = (delta.insert as Record<string, unknown>)['latex'] as string;
      return {
        type: 'element',
        tagName: 'code',
        properties: {
          className: ['math', 'math-inline'],
          dataLatex: latex,
        },
        children: [
          {
            type: 'text',
            value: latex,
          },
        ],
      };
    },
  };

export const inlineDeltaToHtmlAdapterMatchers: InlineDeltaToHtmlAdapterMatcher[] =
  [
    latexDeltaToHtmlAdapterMatcher,
    boldDeltaToHtmlAdapterMatcher,
    italicDeltaToHtmlAdapterMatcher,
    strikeDeltaToHtmlAdapterMatcher,
    underlineDeltaToHtmlAdapterMatcher,
    inlineCodeDeltaToMarkdownAdapterMatcher,
    // referenceDeltaToHtmlAdapterMatcher,
    linkDeltaToHtmlAdapterMatcher,
    mentionDeltaToHtmlAdapterMatcher,
  ];
