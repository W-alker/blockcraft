import {BlockHtmlAdapterMatcher} from "../../../adapters/html-adapter/block-adapter";
import {CodeBlockSchema} from "..";
import {HastUtils} from "../../../adapters/utils";
import {deltaToString} from "../../../global";
import {DeltaInsert} from "../../../framework";
import {HtmlAST} from "../../../adapters/types";
import {
  editableTypographyFromHtml,
  editableTypographyToHtmlProperties,
} from '../../../adapters/html-adapter/typography';
import {SHIKI_LANGUAGE_MAP} from '../shiki-config';
import {resolveDisplayLanguage} from './markdown';

/** Extract raw text from a code `<pre>` tree, converting `<br>` to `\n` and preserving whitespace. */
function getCodeText(node: HtmlAST): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') {
    if (node.tagName === 'br') return '\n';
    return node.children.map(child => getCodeText(child as HtmlAST)).join('');
  }
  return '';
}

function getCodeLanguage(node: Extract<HtmlAST, {type: 'element'}>): string {
  const explicit = node.properties?.['dataBcLang']
  if (typeof explicit === 'string' && explicit.trim()) return explicit

  const code = HastUtils.querySelector(node, 'code')
  const classes = code?.properties?.['className']
  if (!Array.isArray(classes)) return 'PlainText'
  const languageClass = classes.find(value => (
    typeof value === 'string' && value.startsWith('language-')
  ))
  return typeof languageClass === 'string'
    ? languageClass.slice('language-'.length)
    : 'PlainText'
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
      codeBlock.props.lang = resolveDisplayLanguage(getCodeLanguage(o.node))
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
      const displayLanguage = typeof o.node.props['lang'] === 'string'
        ? o.node.props['lang']
        : 'PlainText'
      const syntaxLanguage = SHIKI_LANGUAGE_MAP[displayLanguage] ?? 'plaintext'
      walkerContext.openNode({
        type: 'element',
        tagName: 'pre',
        properties: {
          ...editableTypographyToHtmlProperties(o.node.props),
          dataBcLang: displayLanguage,
        },
        children: [
          {
            type: 'element',
            tagName: 'code',
            properties: {className: [`language-${syntaxLanguage}`]},
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
