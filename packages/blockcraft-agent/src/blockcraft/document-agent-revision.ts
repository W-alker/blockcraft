import type {BlockCraftDoc} from '@ccc/blockcraft'
import type {DocumentAgentContextBlock} from '../core/agent.types'

export function fingerprintAgentBlocks(
  blocks: readonly DocumentAgentContextBlock[],
): string {
  let primary = 0x811c9dc5
  let secondary = 0x9e3779b9
  let serializedChars = 0

  for (const block of blocks) {
    const serialized = JSON.stringify({
      blockId: block.blockId,
      flavour: block.flavour,
      nodeType: block.nodeType,
      props: block.props ?? {},
      textDelta: block.text?.delta ?? [],
    })
    serializedChars += serialized.length
    for (let index = 0; index < serialized.length; index++) {
      const code = serialized.charCodeAt(index)
      primary = Math.imul(primary ^ code, 0x01000193)
      secondary = Math.imul(secondary ^ code, 0x85ebca6b)
    }
    primary = Math.imul(primary ^ 0x1f, 0x01000193)
    secondary = Math.imul(secondary ^ 0x1f, 0x85ebca6b)
  }

  return [
    'bc-agent-v2',
    blocks.length.toString(36),
    serializedChars.toString(36),
    toHex(primary),
    toHex(secondary),
  ].join(':')
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

function toHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0')
}
