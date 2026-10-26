import {MarkdownAST} from "../../../adapters/markdown-adapter/type";
import {Code} from "mdast";
import {BlockMarkdownAdapterMatcher} from "../../../adapters/markdown-adapter/block-adapter";
import {BlockNodeType, DeltaInsert, generateId} from "../../../framework";
import {deltaToString} from "../../../global";
import {LANGUAGE_LIST} from "../const";
import {SHIKI_LANGUAGE_MAP} from "../shiki-config";
import {isMermaidMarkdownLanguage} from '../../mermaid-block/adapter/language';

const isCodeNode = (node: MarkdownAST): node is Code =>
  node.type === 'code' && !isMermaidMarkdownLanguage(node.lang);

const LANGUAGE_ALIAS: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TSX',
  js: 'JavaScript',
  jsx: 'JSX',
  py: 'Python',
  rb: 'Ruby',
  rs: 'Rust',
  kt: 'Kotlin',
  cs: 'C#',
  'c++': 'C++',
  cpp: 'C++',
  'objective-c': 'Objective-C',
  'objc': 'Objective-C',
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
  shell: 'Shell',
  yml: 'YAML',
  yaml: 'YAML',
  md: 'Markdown',
  markdown: 'Markdown',
  htm: 'HTML',
  text: 'PlainText',
  txt: 'PlainText',
  plaintext: 'PlainText',
};

export function resolveDisplayLanguage(codeLang: string): string {
  const lower = codeLang.toLowerCase();
  const aliased = LANGUAGE_ALIAS[lower];
  if (aliased) {
    return aliased;
  }
  const byDisplay = LANGUAGE_LIST.find(v => v.toLowerCase() === lower);
  if (byDisplay) {
    return byDisplay;
  }
  const byShikiId = LANGUAGE_LIST.find(v =>
    SHIKI_LANGUAGE_MAP[v as keyof typeof SHIKI_LANGUAGE_MAP]?.toLowerCase() === lower
  );
  return byShikiId || 'PlainText';
}

export const codeBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  toMatch: o => isCodeNode(o.node),
  fromMatch: o => o.node.flavour === 'code',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!isCodeNode(o.node)) {
        return;
      }
      const {walkerContext} = context;
      const codeLang = o.node.lang || 'PlainText';
      walkerContext
        .openNode(
          {
            id: generateId(),
            nodeType: BlockNodeType.editable,
            flavour: 'code',
            props: {
              lang: resolveDisplayLanguage(codeLang),
            },
            children: [{
              insert: o.node.value,
            }],
            meta: {}
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
            type: 'code',
            lang: SHIKI_LANGUAGE_MAP[(o.node.props['lang'] as keyof typeof SHIKI_LANGUAGE_MAP)] || 'plaintext',
            meta: null,
            value: deltaToString(o.node.children as DeltaInsert[]),
          },
          'children'
        )
        .closeNode();
    },
  },
};
