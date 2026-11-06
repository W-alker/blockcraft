import {isFigmaUrl, isJueJinUrl} from '../global'
import {normalizeEmbedUrl} from '../blocks/embed-blocks/embed-block/source'
import {isSelectionAlive} from '../framework/modules/selection/liveness'

/** 视图入口与转换提交共用来源规则，兼容只装配旧平台块的宿主。 */
export function getEmbedViewFlavour(url: string, schemas: {has(flavour: BlockCraft.BlockFlavour): boolean}) {
  if (!normalizeEmbedUrl(url)) return null
  if (schemas.has('embed')) return 'embed' as const
  if (isFigmaUrl(url) && schemas.has('figma-embed')) return 'figma-embed' as const
  if (isJueJinUrl(url) && schemas.has('juejin-embed')) return 'juejin-embed' as const
  return null
}

/** 一次视图转换独立撤销，并在替换源块前保留可恢复的模型选区。 */
export function runLinkViewChange(doc: BlockCraft.Doc, source: BlockCraft.BlockComponent, targetId: string, mutate: () => unknown) {
  const selection = doc.selection.value
  if (!selection || !isSelectionAlive(selection as any, doc) || selection.firstBlock.id !== source.id) {
    doc.selection.selectOrSetCursorAtBlock(source, true, false)
  }
  return doc.chain()
    .task(() => doc.crud.undoManager.captureUndoItem(() => doc.crud.transact(mutate)).result)
    .selectOrSetCursorAtBlock(targetId, false)
    .run()
}
