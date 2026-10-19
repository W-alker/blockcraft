import type {DeltaInsertEmbed, IBlockSnapshot} from '../../framework/block-std/types'
import type {FrozenPersonCardData} from '../../blocks/dynamic-material-blocks/dynamic-material-data'
import {createInlinePersonDelta, readInlinePersonDelta} from '.'

/** 使用模板时由宿主传入创建人；已有真值、其他来源和源模板均不改写。 */
export function materializeInlinePersonSnapshots(
  snapshots: readonly IBlockSnapshot[],
  creator: FrozenPersonCardData | null,
): IBlockSnapshot[] {
  const frozen = creator ? createInlinePersonDelta(creator) : null
  const insert = frozen && readInlinePersonDelta(frozen) ? frozen.insert : {person: ''}
  const visit = (snapshot: IBlockSnapshot): IBlockSnapshot => ({
    ...snapshot,
    children: snapshot.children.map(child => {
      if ('flavour' in child) return visit(child as IBlockSnapshot)
      if (typeof child.insert !== 'object' || !child.insert || child.insert['person'] !== ''
        || child.attributes?.['personSource'] !== 'creator') return child
      const attributes: NonNullable<DeltaInsertEmbed['attributes']> = {...child.attributes}
      delete attributes['personSource']
      return {insert: {...insert}, attributes}
    }),
  } as IBlockSnapshot)
  return snapshots.map(visit)
}
