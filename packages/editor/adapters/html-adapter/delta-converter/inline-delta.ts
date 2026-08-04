import {InlineDeltaToHtmlAdapterMatcher} from "../delta-converter";
import {InlineHtmlAST} from "../../types";
import {DeltaInsertEmbed, readInlineImageDelta} from "../../../framework";
import {
  INLINE_SHAPE_EMBED_KEY,
  INLINE_WORD_ART_EMBED_KEY,
  inlineObjectPlainText,
  readInlineShapeDelta,
  readInlineWordArtDelta,
} from '../../../blocks';


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
    // `typeof null === 'object'` 为 true，故必须先排除 null/undefined 再用 `in`，
    // 否则历史/异常数据里 insert 为 null 的 op 会让 `'latex' in null` 抛错，整篇导出失败。
    match: delta => !!delta.insert && typeof delta.insert === 'object' && 'latex' in (delta.insert as object),
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

export const imageDeltaToHtmlAdapterMatcher: InlineDeltaToHtmlAdapterMatcher = {
  name: 'inline-image',
  match: delta =>
    !!delta.insert &&
    typeof delta.insert === 'object' &&
    'image' in delta.insert,
  toAST: delta => {
    const {
      src,
      width,
      height,
      wrap,
      side,
      x,
      gap,
    } = readInlineImageDelta(delta as DeltaInsertEmbed);
    return {
      type: 'element',
      tagName: 'img',
      properties: {
        className: ['bc-inline-image'],
        src,
        alt: '',
        ...(width === undefined ? {} : {width}),
        ...(height === undefined ? {} : {height}),
        ...(wrap
          ? {
              dataBcWrap: 'square',
              dataBcWrapSide: side,
              dataBcWrapX: x,
              ...(gap === undefined ? {} : {dataBcWrapGap: gap}),
            }
          : {}),
      },
      children: [],
    };
  },
};

export const inlineObjectDeltaToHtmlAdapterMatcher:
  InlineDeltaToHtmlAdapterMatcher = {
    name: 'inline-object',
    match: delta =>
      !!delta.insert &&
      typeof delta.insert === 'object' &&
      (
        INLINE_SHAPE_EMBED_KEY in delta.insert ||
        INLINE_WORD_ART_EMBED_KEY in delta.insert
      ),
    toAST: delta => {
      const embed = delta as DeltaInsertEmbed
      const kind = INLINE_SHAPE_EMBED_KEY in embed.insert
        ? 'shape'
        : 'word-art'
      const data = kind === 'shape'
        ? readInlineShapeDelta(embed)
        : readInlineWordArtDelta(embed)
      const payload = String(embed.insert[
        kind === 'shape'
          ? INLINE_SHAPE_EMBED_KEY
          : INLINE_WORD_ART_EMBED_KEY
      ] ?? '')
      return {
        type: 'element',
        tagName: 'span',
        properties: {
          className: ['bc-inline-object', `bc-inline-${kind}`],
          dataBcInlineObject: kind,
          dataBcInlineObjectPayload: payload,
          dataBcInlineObjectWidth: data.width,
          dataBcInlineObjectHeight: data.height,
          ...(data.wrap
            ? {
                dataBcWrap: 'square',
                dataBcWrapSide: data.side,
                dataBcWrapX: data.x,
                ...(data.gap === undefined
                  ? {}
                  : {dataBcWrapGap: data.gap}),
              }
            : {}),
        },
        children: [{type: 'text', value: inlineObjectPlainText(data.text)}],
      };
    },
  };

export const inlineDeltaToHtmlAdapterMatchers: InlineDeltaToHtmlAdapterMatcher[] =
  [
    inlineObjectDeltaToHtmlAdapterMatcher,
    imageDeltaToHtmlAdapterMatcher,
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
