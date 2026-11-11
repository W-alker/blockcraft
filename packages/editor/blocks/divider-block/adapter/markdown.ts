import type {ThematicBreak} from 'mdast';
import {MarkdownAST} from "../../../adapters/markdown-adapter/type";
import {BlockMarkdownAdapterMatcher} from "../../../adapters/markdown-adapter/block-adapter";
import {DividerBlockSchema} from "..";
import {applyDividerAdapterProps} from './props';

type DividerDirective = MarkdownAST & {
  type: 'containerDirective' | 'leafDirective';
  name: 'bc-divider';
  attributes?: Record<string, string | null | undefined> | null;
  children: MarkdownAST[];
};

const isDividerNode = (node: MarkdownAST): node is ThematicBreak =>
  node.type === 'thematicBreak';

const isDividerDirective = (node: MarkdownAST): node is DividerDirective =>
  (node.type === 'containerDirective' || node.type === 'leafDirective') &&
  (node as DividerDirective).name === 'bc-divider';

export const dividerBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  priority: 100,
  consumes: true,
  toMatch: o => isDividerNode(o.node) || isDividerDirective(o.node),
  fromMatch: o => o.node.flavour === 'divider',
  toBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext} = context;
      const snapshot = DividerBlockSchema.createSnapshot();
      if (isDividerDirective(o.node)) {
        applyDividerAdapterProps(snapshot.props, o.node.attributes?.['props']);
      }
      walkerContext
        .openNode(snapshot, 'children')
        .closeNode();
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
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
