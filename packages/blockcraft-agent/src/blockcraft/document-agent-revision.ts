import type {BlockCraftDoc} from '@ccc/blockcraft'
import type {DocumentAgentContextBlock} from '../core/agent.types'

export function fingerprintAgentBlocks(
  blocks: readonly DocumentAgentContextBlock[],
): string {
  return JSON.stringify(
    blocks.map(block => ({
      blockId: block.blockId,
      props: block.props ?? {},
      textDeltas: block.textDeltas ?? [],
    })),
  )
}

export function fingerprintCurrentAgentBlocks(
  doc: BlockCraftDoc,
  blocks: readonly DocumentAgentContextBlock[],
): string {
  return fingerprintAgentBlocks(
    blocks.map(block => ({
      blockId: block.blockId,
      flavour: doc.model.getFlavour(block.blockId) ?? 'unknown',
      props: doc.model.getProps(block.blockId) ?? {},
      textDeltas: doc.model.getTextDeltas(block.blockId) ?? [],
    })),
  )
}
