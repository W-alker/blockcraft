import {
  BLOCK_PLACEMENT_LAYOUT_FLAVOUR,
  BlockCraftDoc,
  BlockPosition,
  IBlockSnapshot,
  generateId,
  resolveBlockPosition,
} from '@ccc/blockcraft'
import type { ActiveDecoService } from './active-deco.service'

/**
 * 模板装饰只保留核心 placement 尚未表达的领域状态：
 * - block：上下型；
 * - float：模板专属四周型；
 * - absolute：由编辑器原生 placement-layout / placement manager 管理。
 *
 * 旧模板的 template-layout、x/y/z 和自定义行内图片只在载入前做纯数据迁移，
 * 运行时不再维护第二套绝对定位容器、坐标或拖拽实现。
 */
export type PlacementMode = 'block' | 'float' | 'absolute'
export const LAYOUT_FLAVOUR = BLOCK_PLACEMENT_LAYOUT_FLAVOUR
export const LEGACY_LAYOUT_FLAVOUR = 'template-layout'

export type PlaceableProps = {
  /** 旧模板 Logo 的列宽百分比；载入后迁为 wr。 */
  width?: number | null
  /** 相对 root 内容宽度的百分比。 */
  wr?: number
  /** 宽高比 width / height。 */
  ar?: number
  position?: BlockPosition
  placementLayer?: 'under'
  /** 流内上边距；absolute 的 top 使用 position.y。 */
  y?: number
  /** 旋转角度，仅 absolute 生效。 */
  deg?: number
  float?: 'left' | 'right'
  align?: 'left' | 'center' | 'right'
  mb?: number
  ml?: number
  mr?: number
}

export interface PlaceableBlock {
  id: string
  flavour?: string
  parentId: string | null
  props?: PlaceableProps
  hostElement: HTMLElement
  textLength?: number
  childrenIds?: string[]
  updateProps(
    props: Omit<Partial<PlaceableProps>, 'position' | 'float' | 'deg'> & {
      position?: BlockPosition | null
      placementLayer?: 'under' | null
      float?: 'left' | 'right' | null
      deg?: number | null
    },
  ): void
}

const asBlock = (doc: BlockCraftDoc, id: string): PlaceableBlock | null => {
  try {
    return doc.getBlockById(id) as unknown as PlaceableBlock
  } catch {
    return null
  }
}

export const isPlaceableDeco = (flavour?: string): boolean =>
  typeof flavour === 'string' &&
  flavour.startsWith('template-') &&
  flavour !== LEGACY_LAYOUT_FLAVOUR

export function flowPlacementModeFromProps(
  props?: Pick<PlaceableProps, 'float'>,
): Exclude<PlacementMode, 'absolute'> {
  return props?.float === 'left' || props?.float === 'right'
    ? 'float'
    : 'block'
}

const finiteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const positiveNumber = (value: unknown): number | null => {
  const parsed = finiteNumber(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

const canonicalPosition = (
  value: unknown,
): BlockPosition | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return resolveBlockPosition(value)
}

const migrateInlineDelta = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value
  const delta = value as {
    insert?: unknown
    attributes?: Record<string, unknown>
  }
  if (
    !delta.insert ||
    typeof delta.insert !== 'object' ||
    !Object.prototype.hasOwnProperty.call(delta.insert, 'template-image-inline')
  ) {
    return value
  }

  const attributes = {...(delta.attributes ?? {})}
  const src = typeof attributes['src'] === 'string' ? attributes['src'] : ''
  const widthPct = positiveNumber(attributes['width'])
  const height = positiveNumber(attributes['height'])
  delete attributes['src']
  delete attributes['width']
  delete attributes['height']
  if (widthPct !== null) attributes['width'] = Math.round(widthPct * 768 / 100)
  if (height !== null) attributes['height'] = height

  const migrated: Record<string, unknown> = {
    ...delta,
    insert: {image: src},
  }
  if (Object.keys(attributes).length) migrated['attributes'] = attributes
  else delete migrated['attributes']
  return migrated
}

const migrateSnapshot = (snapshot: IBlockSnapshot): IBlockSnapshot => {
  const props = {...(snapshot.props ?? {})} as Record<string, unknown>
  const meta = {...(snapshot.meta ?? {})} as Record<string, unknown>
  const legacyZ = finiteNumber(props['z'])
  const legacyX = finiteNumber(props['x'])

  // lockKind 上线前，模板 surface 中的所有显式锁都来自“冻结模板物料”。
  // 载入旧模板时补齐来源，后续发布/实例化即可脱离页面上下文稳定识别。
  if (
    typeof meta['lock'] === 'string'
    && meta['lock'].trim().length > 0
    && meta['lockKind'] !== 'template'
  ) {
    meta['lockKind'] = 'template'
  }

  if (isPlaceableDeco(snapshot.flavour)) {
    const current = canonicalPosition(props['position'])
    if (current) {
      props['position'] = current
    } else if (legacyX !== null) {
      props['position'] = {
        x: legacyX,
        y: finiteNumber(props['y']) ?? 0,
      }
    }
    if (legacyZ !== null && legacyZ < 0) props['placementLayer'] = 'under'
    else if (props['placementLayer'] !== 'under') delete props['placementLayer']
    delete props['x']
    delete props['z']
    if (legacyX !== null) delete props['y']
  } else {
    const current = canonicalPosition(props['position'])
    if (current) props['position'] = current
  }
  delete props['placement']

  if (String(snapshot.flavour) === 'template-logo') {
    const width = positiveNumber(props['width'])
    if (positiveNumber(props['wr']) === null && width !== null) {
      props['wr'] = width
    }
    if (positiveNumber(props['ar']) === null) props['ar'] = 1
    delete props['width']
  }

  let children = Array.isArray(snapshot.children)
    ? snapshot.children.map(child => {
        if (
          child &&
          typeof child === 'object' &&
          'flavour' in child &&
          'nodeType' in child
        ) {
          return migrateSnapshot(child as IBlockSnapshot)
        }
        return migrateInlineDelta(child)
    })
    : snapshot.children

  // 早期内容区域把提示写在 render-unit 容器上。现在统一由其中的
  // editable 块交给 PlaceholderPlugin 渲染；载入时把旧字段一次性迁到
  // 第一个文本子块，没有文本子块则补一个空段落。
  if (
    String(snapshot.flavour) === 'render-unit' &&
    typeof meta['plh'] === 'string' &&
    Array.isArray(children)
  ) {
    const plh = meta['plh']
    const plhMode = meta['plhMode']
    delete meta['plh']
    delete meta['plhMode']
    const blockChildren = children as IBlockSnapshot[]
    const editableIndex = blockChildren.findIndex(
      child => child.nodeType === 'editable',
    )
    const placeholderMeta: IBlockSnapshot['meta'] = {
      plh,
      ...(
        plhMode === 'always' || plhMode === 'focused'
          ? {plhMode}
          : {}
      ),
    }
    if (editableIndex >= 0) {
      const editable = blockChildren[editableIndex]
      if (typeof editable.meta?.['plh'] !== 'string') {
        blockChildren[editableIndex] = {
          ...editable,
          meta: {...(editable.meta ?? {}), ...placeholderMeta},
        }
      }
    } else {
      blockChildren.unshift({
        id: generateId(),
        flavour: 'paragraph',
        nodeType: 'editable',
        props: {depth: 0},
        meta: placeholderMeta,
        children: [],
      } as IBlockSnapshot)
    }
    children = blockChildren
  }

  return {
    ...snapshot,
    flavour: String(snapshot.flavour) === LEGACY_LAYOUT_FLAVOUR
      ? LAYOUT_FLAVOUR
      : snapshot.flavour,
    props,
    meta,
    children,
  } as IBlockSnapshot
}

/**
 * 载入前的幂等迁移：
 * - 合并旧/新 root layout；
 * - 所有 absolute root 子块归入标准 placement-layout；
 * - layout 中误存的 relative 子块回到正文流；
 * - 递归迁移旧动态物料属性、模板锁来源和 template-image-inline Delta。
 */
export function normalizeTemplateSnapshots(
  children: IBlockSnapshot[],
): IBlockSnapshot[] {
  const migrated = children.map(migrateSnapshot)
  const layouts = migrated.filter(
    child => child.flavour === LAYOUT_FLAVOUR,
  )
  const flow: IBlockSnapshot[] = []
  const absolute: IBlockSnapshot[] = []
  const partition = (child: IBlockSnapshot): void => {
    const position = (child.props as PlaceableProps | undefined)?.position
    ;(position && typeof position === 'object' ? absolute : flow).push(child)
  }

  for (const child of migrated) {
    if (child.flavour === LAYOUT_FLAVOUR) continue
    partition(child)
  }
  for (const layout of layouts) {
    for (const child of layout.children as IBlockSnapshot[]) partition(child)
  }
  if (!absolute.length) return flow

  const first = layouts[0]
  const layout: IBlockSnapshot = first
    ? {
        ...first,
        flavour: LAYOUT_FLAVOUR,
        props: {},
        children: absolute,
      } as IBlockSnapshot
    : {
        id: generateId(),
        flavour: LAYOUT_FLAVOUR,
        nodeType: 'block',
        props: {},
        meta: {},
        children: absolute,
      } as IBlockSnapshot
  return [...flow, layout]
}

export function replaceRootChildren(
  doc: BlockCraftDoc,
  rawChildren: IBlockSnapshot['children'] | null | undefined,
): void {
  const children = normalizeTemplateSnapshots(
    (rawChildren ?? []) as IBlockSnapshot[],
  )
  if (!children.length) return
  const count = doc.root.childrenLength
  doc.crud.transact(() => {
    if (count > 0) doc.crud.deleteBlocks(doc.rootId, 0, count, true)
    doc.crud.insertBlocks(doc.rootId, 0, children)
  })
  // Snapshot hydration establishes the editing baseline. Keeping this
  // transaction in history can merge the first user keystroke into the load
  // item, so Ctrl/Cmd+Z would remove the template instead of just its text.
  doc.crud.undoManager.clearHistory()
}

/**
 * 模板专属流式状态切换。absolute 的迁移与视觉锚点解析完全复用核心
 * BlockPlacementManager；这里只在同一事务里清理/写入四周环绕字段。
 */
export function applyPlacement(
  doc: BlockCraftDoc,
  blockId: string,
  mode: PlacementMode,
  side?: 'left' | 'right',
): boolean {
  const block = asBlock(doc, blockId)
  if (!block || doc.isBlockReadonly(blockId)) return false
  if (mode === 'absolute') {
    return doc.placement.setObjectLayout(blockId, 'over')
  }

  const current = doc.placement.getState(blockId).mode === 'absolute'
    ? 'absolute'
    : flowPlacementModeFromProps(block.props)
  let changed = false
  doc.crud.transact(() => {
    if (current === 'absolute') {
      changed = doc.placement.setMode(blockId, 'relative')
      if (!changed) return
    } else {
      changed = true
    }
    block.updateProps({
      float: mode === 'float'
        ? side ?? block.props?.float ?? 'left'
        : null,
      ...(current === 'absolute' ? {deg: null} : {}),
    })
  })
  return changed
}

const findLayoutId = (doc: BlockCraftDoc): string | null =>
  doc.root.childrenIds.find(id => doc.placement.isPlacementLayout(id)) ?? null

const rootTopIndex = (doc: BlockCraftDoc, blockId?: string): number => {
  if (!blockId) return -1
  let block = asBlock(doc, blockId)
  while (block?.parentId && block.parentId !== doc.rootId) {
    block = asBlock(doc, block.parentId)
  }
  return block ? doc.root.childrenIds.indexOf(block.id) : -1
}

const isWholeDocumentSelection = (
  doc: BlockCraftDoc,
  layoutId: string | null,
): boolean => {
  const selection = doc.selection.value
  if (!selection) return false
  if (layoutId && selection.contains(layoutId)) return true

  const ids = doc.root.childrenIds
  const flowIds = ids.filter(id => id !== layoutId)
  if (!flowIds.length) return false
  const startTop = rootTopIndex(doc, selection.firstBlockId)
  const endTop = rootTopIndex(doc, selection.lastBlockId)
  if (startTop < 0 || endTop < 0) return false
  const lo = Math.min(startTop, endTop)
  const hi = Math.max(startTop, endTop)
  if (lo > ids.indexOf(flowIds[0]) || hi < ids.indexOf(flowIds.at(-1)!)) {
    return false
  }

  const start = selection.start
  const end = selection.end
  if (start.type === 'text' && start.offset > 0) return false
  if (
    start.type === 'boundary' &&
    start.blockId === doc.rootId &&
    start.index > ids.indexOf(flowIds[0])
  ) {
    return false
  }
  if (start.type === 'gap' && start.side !== 'before') return false
  const endBlock = asBlock(doc, end.blockId)
  if (
    end.type === 'text' &&
    endBlock &&
    end.offset < (endBlock.textLength ?? 0)
  ) {
    return false
  }
  if (
    end.type === 'boundary' &&
    end.blockId === doc.rootId &&
    end.index < ids.indexOf(flowIds.at(-1)!) + 1
  ) {
    return false
  }
  return end.type !== 'gap' || end.side === 'after'
}

/**
 * 全选删除只清普通正文/普通 absolute 对象，保留模板动态 Block。
 * 单独选中动态对象时完全放行核心删除键路径；冻结校验也继续走 readonly manager。
 */
export function guardDecoDeletion(
  doc: BlockCraftDoc,
  containerEl: HTMLElement,
  activeDeco?: ActiveDecoService,
): {unsubscribe(): void} {
  const selectionSub = doc.selection.changeObserve().subscribe(selection => {
    const selectedId =
      selection?.isInSameBlock &&
      selection.anchor.type === 'selected' &&
      selection.head.type === 'selected'
        ? selection.anchor.blockId
        : null
    if (selectedId && isPlaceableDeco(asBlock(doc, selectedId)?.flavour)) {
      activeDeco?.set(selectedId)
    } else if (selection) {
      activeDeco?.set(null)
    }
  })

  const onKeydown = (event: KeyboardEvent): void => {
    if (
      (event.key !== 'Backspace' && event.key !== 'Delete') ||
      doc.isReadonly
    ) {
      return
    }
    const selection = doc.selection.value
    if (!selection) return
    if (
      selection.isInSameBlock &&
      selection.anchor.type === 'selected' &&
      selection.head.type === 'selected'
    ) {
      return
    }

    const layoutId = findLayoutId(doc)
    const dynamicRootIds = doc.root.childrenIds.filter(
      id => isPlaceableDeco(asBlock(doc, id)?.flavour),
    )
    const layout = layoutId ? asBlock(doc, layoutId) : null
    const dynamicLayoutIds = layout?.childrenIds
      ?.filter(id => isPlaceableDeco(asBlock(doc, id)?.flavour)) ?? []
    if (
      !dynamicRootIds.length &&
      !dynamicLayoutIds.length
    ) {
      return
    }
    if (!isWholeDocumentSelection(doc, layoutId)) return

    const ordinaryRootIds = doc.root.childrenIds.filter(
      id => id !== layoutId && !isPlaceableDeco(asBlock(doc, id)?.flavour),
    )
    const ordinaryAbsoluteIds = layout?.childrenIds
      ?.filter(id => !isPlaceableDeco(asBlock(doc, id)?.flavour)) ?? []
    const targets = [...ordinaryRootIds, ...ordinaryAbsoluteIds]
    event.preventDefault()
    event.stopPropagation()
    if (targets.some(id =>
      doc.isBlockReadonly(id) || doc.readonlyManager.containsReadonly(id)
    )) {
      doc.messageService.warn('所选内容包含冻结块，无法删除')
      return
    }

    doc.selection.blur()
    const paragraph = doc.schemas.createSnapshot('paragraph', [''])
    doc.crud.transact(() => {
      for (const id of targets) doc.crud.deleteBlockById(id)
      const layoutIndex = layoutId
        ? doc.root.childrenIds.indexOf(layoutId)
        : doc.root.childrenLength
      doc.crud.insertBlocks(
        doc.rootId,
        layoutIndex < 0 ? doc.root.childrenLength : layoutIndex,
        [paragraph],
      )
    })
    try {
      doc.selection.setCursorAtBlock(doc.getBlockById(paragraph.id), true)
    } catch {
      // 渲染时序边界不影响数据结果。
    }
  }
  containerEl.addEventListener('keydown', onKeydown, true)

  return {
    unsubscribe(): void {
      selectionSub.unsubscribe()
      containerEl.removeEventListener('keydown', onKeydown, true)
    },
  }
}

/**
 * 点编辑器列空白处时把光标放到最后一个正文段落；需要补段时始终插在
 * placement-layout 之前，保持核心 root layout 不变量。
 */
export function handleContainerBlankMousedown(
  doc: BlockCraftDoc,
  event: MouseEvent,
): void {
  if (event.target !== event.currentTarget) return
  event.preventDefault()
  const ids = doc.root.childrenIds
  const layoutIndex = ids.findIndex(id => doc.placement.isPlacementLayout(id))
  const insertAt = layoutIndex >= 0 ? layoutIndex : ids.length
  const last = insertAt > 0 ? asBlock(doc, ids[insertAt - 1]) : null
  if (last?.flavour === 'paragraph') {
    doc.selection.setCursorAtBlock(doc.getBlockById(last.id), false)
    return
  }
  const paragraph = doc.schemas.createSnapshot('paragraph', [''])
  void doc.chain()
    .insertSnapshots(doc.rootId, insertAt, [paragraph])
    .setCursorAtBlock(paragraph.id, true)
    .run()
}
