import type {IBlockSnapshot, DeltaInsertEmbed} from '../../framework/block-std/types'
import type {DocWeatherPort} from '../../framework/ports/weather'
import {createInlineWeatherDelta, readInlineWeatherDelta} from '.'

/**
 * 在写入新文档前求值。只处理行内天气的创建意向，不改源模板或已有定格天气。
 * 一次实例化共享一次宿主查询；取消向上抛出，普通失败保留不可用占位。
 */
export async function materializeInlineWeatherSnapshots(
  snapshots: readonly IBlockSnapshot[],
  context: {createdAt: Date; weather: DocWeatherPort; signal?: AbortSignal},
): Promise<IBlockSnapshot[]> {
  const {createdAt, weather, signal} = context
  const date = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')}`
  let request: Promise<DeltaInsertEmbed | null> | undefined
  const resolve = (): Promise<DeltaInsertEmbed | null> => request ??= Promise.resolve()
    .then(() => {
      signal?.throwIfAborted()
      return weather.query({date}, signal)
    })
    .then(value => {
      signal?.throwIfAborted()
      const delta = createInlineWeatherDelta(value)
      return readInlineWeatherDelta(delta) ? delta : null
    })
    .catch(() => {
      signal?.throwIfAborted()
      return null
    })

  const visit = async (snapshot: IBlockSnapshot): Promise<IBlockSnapshot> => {
    const children = await Promise.all(snapshot.children.map(async child => {
      if ('flavour' in child) return visit(child as IBlockSnapshot)
      if (typeof child.insert !== 'object' || !('weather' in child.insert)
        || child.attributes?.['weatherSource'] !== 'createdTime'
        || child.insert['weather'] !== '') return child
      const value = await resolve()
      const attributes: NonNullable<DeltaInsertEmbed['attributes']> = {...child.attributes, weatherDate: date}
      delete attributes['weatherSource']
      return {insert: value?.insert ?? {weather: ''}, attributes}
    }))
    return {...snapshot, children} as IBlockSnapshot
  }
  signal?.throwIfAborted()
  const result = await Promise.all(snapshots.map(visit))
  signal?.throwIfAborted()
  return result
}
