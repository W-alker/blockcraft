import {
  DRAFT_PROP_META_PREFIX,
  type FrozenPersonCardData,
  type IBlockSnapshot,
} from '@ccc/blockcraft'

export interface TemplateMaterializationContext {
  createdAt: Date
  updatedAt?: Date
  creator: FrozenPersonCardData
}

const toLocalIsoDate = (value: Date): string => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const resolveDraftValue = (
  flavour: string,
  key: string,
  value: unknown,
  context: TemplateMaterializationContext,
): unknown => {
  if (
    (flavour === 'weather' || flavour === 'date-card')
    && key === 'date'
  ) {
    if (value === 'createdTime') return toLocalIsoDate(context.createdAt)
    if (value === 'updatedTime') {
      return toLocalIsoDate(context.updatedAt ?? context.createdAt)
    }
  }
  return value
}

/**
 * 把模板作者保存在 meta.draft:* 的配置意向投影为新文档的真实 props。
 * 输入输出都是普通 snapshot；真正写入仍由宿主随后调用 DocCRUD 完成。
 */
export function materializeTemplateSnapshots(
  snapshots: readonly IBlockSnapshot[],
  context: TemplateMaterializationContext,
): IBlockSnapshot[] {
  const materializeSnapshot = (snapshot: IBlockSnapshot): IBlockSnapshot => {
    const flavour = String(snapshot.flavour)
    const props = {...(snapshot.props ?? {})} as Record<string, unknown>
    const meta = {...(snapshot.meta ?? {})} as Record<string, unknown>

    for (const metaKey of Object.keys(meta)) {
      if (!metaKey.startsWith(DRAFT_PROP_META_PREFIX)) continue
      const propKey = metaKey.slice(DRAFT_PROP_META_PREFIX.length)
      if (propKey) {
        props[propKey] = resolveDraftValue(
          flavour,
          propKey,
          meta[metaKey],
          context,
        )
      }
      delete meta[metaKey]
    }

    if (flavour === 'person-card' && props['source'] === 'creator') {
      props['person'] = JSON.stringify(context.creator)
    }

    const children = Array.isArray(snapshot.children)
      ? snapshot.children.map(child => {
          if (
            child
            && typeof child === 'object'
            && 'flavour' in child
            && 'nodeType' in child
          ) {
            return materializeSnapshot(child as IBlockSnapshot)
          }
          return child
        })
      : snapshot.children

    return {
      ...snapshot,
      props,
      meta,
      children,
    } as IBlockSnapshot
  }

  return snapshots.map(materializeSnapshot)
}
