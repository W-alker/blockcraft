import {
  BlockNodeType,
  createGenericBlockAdapterContribution,
  type IBlockSnapshot,
} from '@ccc/blockcraft'

function portableLogoText(snapshot: IBlockSnapshot): string {
  const src = typeof snapshot.props['src'] === 'string'
    ? snapshot.props['src'].trim()
    : ''
  return src ? `Logo: ${src}` : 'Logo'
}

/** 模板域 Logo Block 的 HTML/Markdown 序列化所有权。 */
export const logoBlockAdapters =
  createGenericBlockAdapterContribution({
    flavour: 'logo',
    nodeType: BlockNodeType.void,
    defaultProps: {src: '', wr: 16, ar: 1},
    portableText: portableLogoText,
  })
