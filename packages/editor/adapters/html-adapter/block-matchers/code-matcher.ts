import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {CodeBlockSchema} from "../../../blocks";
import {HastUtils} from "../../utils";
import {deltaToString} from "../../../global";
import {DeltaInsert} from "../../../framework";
import {HtmlAST} from "../../types";
import {
  editableTypographyFromHtml,
  editableTypographyToHtmlProperties,
} from '../typography';

/** Extract raw text from a code `<pre>` tree, converting `<br>` to `\n` and preserving whitespace. */
function getCodeText(node: HtmlAST): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') {
    if (node.tagName === 'br') return '\n';
    return node.children.map(child => getCodeText(child as HtmlAST)).join('');
  }
  return '';
}

export const codeBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'pre',
  fromMatch: o => o.node.flavour === 'code',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }

      const {walkerContext} = context;

      const depth = (walkerContext.currentNode()?.props.depth || -1) + 1

      if (o.parent?.node.type === 'element' && !['td'].includes(o.parent.node.tagName)) {
        walkerContext.closeNode()
      }

      const text = getCodeText(o.node).replace(/\n+$/g, '')
      if(!text) return;

      const codeBlock = CodeBlockSchema.createSnapshot(text)
      codeBlock.props.depth = depth
      Object.assign(codeBlock.props, editableTypographyFromHtml(o.node))

      walkerContext
        .openNode(codeBlock, 'children')
        .closeNode()
      walkerContext.skipAllChildren()
    },
  },
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const {walkerContext} = context;
      const delta = o.node.children as DeltaInsert[];
      walkerContext.openNode({
        type: 'element',
        tagName: 'pre',
        properties: editableTypographyToHtmlProperties(o.node.props),
        children: [
          {
            type: 'element',
            tagName: 'span',
            properties: {},
            children: [
              {
                type: 'text',
                value: deltaToString(delta),
              }
            ]
          }
        ],
      }, 'children').closeNode();
    },
  },
};
