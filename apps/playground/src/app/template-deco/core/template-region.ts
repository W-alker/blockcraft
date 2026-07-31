import {
  BlockCraftDoc,
  BlockMutationContext,
  BlockMutationPolicy,
} from '@ccc/blockcraft'

export const TEMPLATE_REGION_META_KEY = 'tplRegion'

function isTemplateRegion(doc: BlockCraftDoc, blockId: string): boolean {
  const meta = doc.model.getYBlock(blockId)?.get('meta') as
    | {get?(key: string): unknown}
    | undefined
  return meta?.get?.(TEMPLATE_REGION_META_KEY) === true
}

function isWithinTemplateRegion(
  doc: BlockCraftDoc,
  blockId: string,
): boolean {
  let current: string | null = blockId
  while (current) {
    if (isTemplateRegion(doc, current)) return true
    current = doc.model.getParentId(current)
  }
  return false
}

function isTemplatePlaceholderBlock(
  doc: BlockCraftDoc,
  blockId: string,
): boolean {
  if (!isWithinTemplateRegion(doc, blockId)) return false
  const meta = doc.model.getYBlock(blockId)?.get('meta') as
    | {get?(key: string): unknown}
    | undefined
  return typeof meta?.get?.('plh') === 'string'
}

function subtreeContainsTemplateRegion(
  doc: BlockCraftDoc,
  blockId: string,
): boolean {
  if (isTemplateRegion(doc, blockId)) return true
  return doc.model.getChildrenIds(blockId).some(childId =>
    subtreeContainsTemplateRegion(doc, childId),
  )
}

/**
 * Use-page invariants:
 * - region configuration remains immutable;
 * - a region shell may be deleted as ordinary document content;
 * - its placeholder paragraph cannot be removed, replaced or moved alone;
 * - replacing/moving a region shell (or an ancestor that owns one) is blocked;
 * - undo/redo remains available for user content and region deletion.
 */
export function createTemplateUseMutationPolicy(): BlockMutationPolicy {
  return (
    context: BlockMutationContext,
    doc: BlockCraft.Doc,
  ) => {
    const typedDoc = doc as BlockCraftDoc
    if (context.operation === 'update-meta') {
      const touchesPlaceholder = context.metaKeys?.some(key =>
        key === 'plh' || key === 'plhMode',
      )
      const touchesRegionConfig = context.metaKeys?.some(key =>
        key === 'incl' ||
        key === 'excl' ||
        key === TEMPLATE_REGION_META_KEY,
      )
      if (
        (
          touchesPlaceholder &&
          context.blockIds.some(id => isWithinTemplateRegion(typedDoc, id))
        ) ||
        (
          touchesRegionConfig &&
          context.blockIds.some(id => isTemplateRegion(typedDoc, id))
        )
      ) {
        return {
          allowed: false,
          message: '使用模板时不能修改内容区域配置',
        }
      }
      return true
    }

    const protectsRegionIdentity =
      context.operation === 'replace' ||
      context.operation === 'move'
    if (
      protectsRegionIdentity &&
      context.blockIds.some(id => subtreeContainsTemplateRegion(typedDoc, id))
    ) {
      return {
        allowed: false,
        message: '模板内容区域不能被替换或移动',
      }
    }

    const protectsPlaceholder =
      context.operation === 'delete' ||
      context.operation === 'replace' ||
      context.operation === 'move'
    if (
      protectsPlaceholder &&
      context.blockIds.some(id => isTemplatePlaceholderBlock(typedDoc, id))
    ) {
      return {
        allowed: false,
        message: '模板内容区域的提示段落不能单独删除、替换或移动',
      }
    }
    return true
  }
}
