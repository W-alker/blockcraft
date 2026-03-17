import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {HastUtils} from "../../utils";
import {BlockNodeType, generateId} from "../../../framework";

export const formulaBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o =>
    HastUtils.isElement(o.node) && (
      // Match <div class="math"> or <span class="katex-display">
      (o.node.tagName === 'div' && Array.isArray(o.node.properties?.['className']) &&
        (o.node.properties['className'] as string[]).some(c => c === 'math' || c === 'katex-display')) ||
      // Match <math display="block">
      (o.node.tagName === 'math' && o.node.properties?.['display'] === 'block')
    ),
  fromMatch: o => o.node.flavour === 'formula',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) return;
      const {walkerContext} = context;

      // Try to extract latex from data-latex attribute or annotation element
      let latex = (o.node.properties?.['dataLatex'] as string) || '';
      if (!latex) {
        // Try to get text content as fallback
        latex = HastUtils.getTextContent(o.node);
      }

      walkerContext
        .openNode(
          {
            id: generateId(),
            flavour: 'formula',
            nodeType: BlockNodeType.void,
            props: {latex},
            meta: {},
            children: [],
          },
          'children'
        )
        .closeNode();
      walkerContext.skipAllChildren();
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext} = context;
      const latex = (o.node.props['latex'] as string) || '';
      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'div',
            properties: {
              className: ['math', 'math-display'],
              dataLatex: latex,
            },
            children: [
              {
                type: 'text',
                value: `$$${latex}$$`,
              },
            ],
          },
          'children'
        )
        .closeNode();
    },
  },
};
