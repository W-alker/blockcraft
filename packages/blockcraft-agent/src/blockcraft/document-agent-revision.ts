import type {BlockCraftDoc} from '@ccc/blockcraft'
import type {DocumentAgentContextBlock} from '../core/agent.types'

export function fingerprintAgentBlocks(
  blocks: readonly DocumentAgentContextBlock[],
): string {
  return JSON.stringify(
    blocks.map(block => ({
      blockId: block.blockId,
      flavour: block.flavour,
      nodeType: block.nodeType,
      props: block.props ?? {},
      textDelta: block.text?.delta ?? [],
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
      nodeType: String(doc.model.getNodeType(block.blockId) ?? 'unknown'),
      props: doc.model.getProps(block.blockId) ?? {},
      ...(doc.model.getTextDeltas(block.blockId) === undefined
        ? {}
        : {
            text: {
              plain: '',
              delta: doc.model.getTextDeltas(block.blockId) ?? [],
            },
          }),
    })),
  )
}
