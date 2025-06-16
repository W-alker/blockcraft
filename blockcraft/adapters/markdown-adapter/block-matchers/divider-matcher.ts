import type {ThematicBreak} from 'mdast';
import {MarkdownAST} from "../type";
import {BlockMarkdownAdapterMatcher} from "../block-adapter";
import {BlockNodeType, generateId} from "../../../framework";

const isDividerNode = (node: MarkdownAST): node is ThematicBreak =>
  node.type === 'thematicBreak';

export const dividerBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  toMatch: o => isDividerNode(o.node),
  fromMatch: o => o.node.flavour === 'divider',
  toBlockSnapshot: {
    enter: (_, context) => {
      const {walkerContext} = context;
      walkerContext
        .openNode(
          {
            id: generateId(),
            flavour: 'divider',
            nodeType: BlockNodeType.void,
            props: {},
            meta: {},
            children: [],
          },
          'children'
        )
        .closeNode();
    },
  },
  fromBlockSnapshot: {
    enter: (_, context) => {
      const {walkerContext} = context;
      walkerContext
        .openNode(
          {
            type: 'thematicBreak',
          },
          'children'
        )
        .closeNode();
    },
  },
};

