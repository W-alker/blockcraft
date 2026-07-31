import {
  BLOCK_CREATOR_SERVICE_TOKEN,
  BlockCraftDoc,
  BundledBlockMaterial,
} from '@ccc/blockcraft'

function getLiveBlock(
  doc: BlockCraftDoc,
  id: string | null | undefined,
): BlockCraft.BlockComponent | null {
  if (!id) return null
  try {
    return doc.getBlockById(id)
  } catch {
    return null
  }
}

/**
 * 从当前 model selection 向外找第一个可容纳目标 flavour 的兄弟落点。
 * 模板页关闭虚拟化，返回的 BlockComponent 与 stable id 一致；找不到时回退
 * 到 root 最后一个普通流内块，明确跳过 placement-layout。
 */
export function resolveContentInsertionTarget(
  doc: BlockCraftDoc,
  flavour: BlockCraft.BlockFlavour,
): BlockCraft.BlockComponent | null {
  const selection = doc.selection.value
  let block = getLiveBlock(
    doc,
    selection?.head.blockId ??
      selection?.lastBlockId ??
      selection?.firstBlockId,
  )

  while (block?.parentBlock) {
    if (doc.canInsertChild(block.parentBlock.id, flavour)) {
      return block
    }
    block = block.parentBlock
  }

  const rootIds = doc.model.getChildrenIds(doc.rootId)
  for (let index = rootIds.length - 1; index >= 0; index--) {
    const candidate = getLiveBlock(doc, rootIds[index])
    if (
      !candidate ||
      doc.placement.isPlacementLayout(candidate) ||
      !candidate.parentBlock ||
      !doc.canInsertChild(candidate.parentBlock.id, flavour)
    ) {
      continue
    }
    return candidate
  }
  return null
}

/** Insert the generic template content region with app-owned template marker. */
export function insertTemplateRegion(doc: BlockCraftDoc): void {
  if (doc.isReadonly) return
  const target = resolveContentInsertionTarget(doc, 'render-unit')
  let parentId = target?.parentId ?? null
  let index = target ? target.getIndexOfParent() + 1 : -1
  if (!parentId && doc.canInsertChild(doc.rootId, 'render-unit')) {
    parentId = doc.rootId
    const layoutIndex = doc.root.childrenIds.findIndex(id =>
      doc.placement.isPlacementLayout(id),
    )
    index = layoutIndex >= 0 ? layoutIndex : doc.root.childrenLength
  }
  if (!parentId || index < 0) {
    doc.messageService.warn('当前没有可插入内容区域的位置')
    return
  }
  const paragraph = doc.schemas.createSnapshot('paragraph', [])
  paragraph.meta = {
    ...paragraph.meta,
    plh: '请在此填写内容',
    plhMode: 'always',
  }
  const snapshot = doc.schemas.createSnapshot('render-unit', [{
    tplRegion: true,
  }] as never)
  snapshot.children = [paragraph]
  const inserted = doc.crud.insertBlocks(
    parentId,
    index,
    [snapshot],
  )
  if (!inserted.length) return
  doc.selection.setCursorAtBlock(inserted[0], true)
}

async function insertAbsoluteShape(
  doc: BlockCraftDoc,
  material: BundledBlockMaterial,
): Promise<void> {
  const schema = doc.schemas.get(material.flavour, false)
  if (!schema || doc.isReadonly) return
  const anchorRect = doc.selection.getSelectionRect()
  const creator = doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN)
  let params: unknown[] | null = null
  try {
    params = await creator.getParamsByScheme(schema) as unknown[] | null
  } catch {
    return
  }
  if (!params || doc.isReadonly) return

  const snapshot = doc.schemas.createSnapshot(
    material.flavour,
    params as never,
  )
  const insertedId = doc.placement.insertAbsoluteSnapshot(snapshot, {
    anchorRect,
    layer: 'over',
  })
  if (!insertedId) {
    doc.messageService.warn(`此处不能添加${material.label}`)
    return
  }
  doc.selection.selectOrSetCursorAtBlock(insertedId, true)
}

/**
 * 点击右侧内容物料：普通块复用 DocDndService/BlockCreator 的原始创建链；
 * shape 与 fixed toolbar 一致，直接创建到标准绝对定位 layout。
 */
export function insertContentBlock(
  doc: BlockCraftDoc,
  material: BundledBlockMaterial,
): void {
  if (doc.isReadonly) return
  if (material.flavour === 'shape') {
    void insertAbsoluteShape(doc, material)
    return
  }

  const target = resolveContentInsertionTarget(doc, material.flavour)
  if (!target) {
    doc.messageService.warn(`当前没有可插入${material.label}的位置`)
    return
  }
  doc.dndService.onInsertNewBlock(material.flavour, {}, target, 'after')
}
