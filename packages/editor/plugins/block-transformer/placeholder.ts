import type {IBlockSnapshot, IBlockProps} from '../../framework'

/** 转换只继承提示文案，不复制源块的锁、区域身份或其他实例配置。 */
export function preserveTransformPlaceholder(
  doc: Pick<BlockCraft.Doc, 'schemas'>,
  source: {meta?: Readonly<Record<string, unknown>>; props: IBlockProps},
  replacements: IBlockSnapshot[],
): void {
  const text = source.meta?.['plh']
  if (typeof text !== 'string') return

  const findEditable = (blocks: IBlockSnapshot[]): IBlockSnapshot | undefined => {
    for (const block of blocks) {
      if (block.nodeType === 'editable') return block
      const nested = findEditable(block.children as IBlockSnapshot[])
      if (nested) return nested
    }
    return undefined
  }
  let target = findEditable(replacements)
  if (!target) {
    // 图片、分割线等无可编辑后代，保留一个可继续填写的提示段落。
    target = doc.schemas.createSnapshot('paragraph', [[], source.props])
    replacements.push(target)
  }
  target.meta = {...target.meta, plh: text}
  const mode = source.meta?.['plhMode']
  if (mode === 'always' || mode === 'focused') target.meta['plhMode'] = mode
}
