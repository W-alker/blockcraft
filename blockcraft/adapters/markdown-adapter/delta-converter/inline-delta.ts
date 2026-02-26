import type { PhrasingContent } from 'mdast';
import {InlineDeltaToMarkdownAdapterMatcher} from "../delta-converter";

export const boldDeltaToMarkdownAdapterMatcher: InlineDeltaToMarkdownAdapterMatcher =
  {
    name: 'bold',
    match: delta => !!delta.attributes?.['a:bold'],
    toAST: (_, context) => {
      const { current: currentMdast } = context;
      return {
        type: 'strong',
        children: [currentMdast],
      };
    },
  };

export const italicDeltaToMarkdownAdapterMatcher: InlineDeltaToMarkdownAdapterMatcher =
  {
    name: 'italic',
    match: delta => !!delta.attributes?.['a:italic'],
    toAST: (_, context) => {
      const { current: currentMdast } = context;
      return {
        type: 'emphasis',
        children: [currentMdast],
      };
    },
  };

export const strikeDeltaToMarkdownAdapterMatcher: InlineDeltaToMarkdownAdapterMatcher =
  {
    name: 'strike',
    match: delta => !!delta.attributes?.['a:strike'],
    toAST: (_, context) => {
      const { current: currentMdast } = context;
      return {
        type: 'delete',
        children: [currentMdast],
      };
    },
  };

export const inlineCodeDeltaToMarkdownAdapterMatcher: InlineDeltaToMarkdownAdapterMatcher =
  {
    name: 'inlineCode',
    match: delta => !!delta.attributes?.['a:code'],
    toAST: delta => ({
      type: 'inlineCode',
      value: delta.insert as string,
    }),
  };

export const linkDeltaToMarkdownAdapterMatcher: InlineDeltaToMarkdownAdapterMatcher =
  {
    name: 'link',
    match: delta => !!delta.attributes?.['a:link'],
    toAST: (delta, context) => {
      const mdast: PhrasingContent = {
        type: 'text',
        value: delta.insert as string,
      };
      const link = delta.attributes?.['a:link'];
      if (!link) {
        return mdast;
      }

      const { current: currentMdast } = context;
      if ('value' in currentMdast) {
        if (currentMdast.value === '') {
          return {
            type: 'text',
            value: link,
          };
        }
        if ("value" in mdast && mdast.value !== link) {
          return {
            type: 'link',
            url: link,
            children: [currentMdast],
          };
        }
      }
      return mdast;
    },
  };

export const latexDeltaToMarkdownAdapterMatcher: InlineDeltaToMarkdownAdapterMatcher =
  {
    name: 'inlineLatex',
    match: delta => !!delta.attributes?.['a:latex'],
    toAST: delta => {
      if (delta.attributes?.['a:latex']) {
        return {
          type: 'inlineMath',
          value: delta.attributes['a:latex'] as string,
        };
      }
      return {
        type: 'text',
        value: delta.insert as string,
      };
    },
  };

export const inlineDeltaToMarkdownAdapterMatchers: InlineDeltaToMarkdownAdapterMatcher[] =
  [
    latexDeltaToMarkdownAdapterMatcher,
    linkDeltaToMarkdownAdapterMatcher,
    inlineCodeDeltaToMarkdownAdapterMatcher,
    boldDeltaToMarkdownAdapterMatcher,
    italicDeltaToMarkdownAdapterMatcher,
    strikeDeltaToMarkdownAdapterMatcher,
  ];
