import {BlockMarkdownAdapterMatcher} from "../block-adapter";
import {BlockNodeType, generateId} from "../../../framework";

export const formulaBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  toMatch: o => o.node.type === 'math',
  fromMatch: o => o.node.flavour === 'formula',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (o.node.type !== 'math') return;
      const {walkerContext} = context;
      walkerContext
        .openNode(
          {
            id: generateId(),
            flavour: 'formula',
            nodeType: BlockNodeType.void,
            props: {
              latex: o.node.value || '',
            },
            meta: {},
            children: [],
          },
          'children'
        )
        .closeNode();
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext} = context;
      walkerContext
        .openNode(
          {
            type: 'math',
            value: (o.node.props['latex'] as string) || '',
          },
          'children'
        )
        .closeNode();
    },
  },
};
