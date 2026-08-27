import {BLOCKCRAFT_BUILTIN_AGENT_CAPABILITIES} from '@ccc/blockcraft'
import type {DocumentAgentHostExtension} from './host-extension'

export const BLOCKCRAFT_BUILTIN_AGENT_EXTENSION: DocumentAgentHostExtension = {
  id: 'blockcraft.builtin',
  version: '3',
  description: 'BlockCraft 内置 Block 与 Inline Embed 的 Agent 语义及写入契约',
  capabilities: BLOCKCRAFT_BUILTIN_AGENT_CAPABILITIES,
}
