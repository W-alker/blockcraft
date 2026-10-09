import {BLOCKCRAFT_BUILTIN_AGENT_CAPABILITIES} from '@ccc/blockcraft'
import {BLOCKCRAFT_DOCUMENT_DESIGN_SKILLS} from './document-design-skills.generated'
import type {DocumentAgentHostExtension} from './host-extension'

export const BLOCKCRAFT_BUILTIN_AGENT_EXTENSION: DocumentAgentHostExtension = {
  id: 'blockcraft.builtin',
  version: '4',
  description: 'BlockCraft 内置 Block、Inline Embed 语义契约与按需读取的文档设计技能',
  capabilities: [...BLOCKCRAFT_BUILTIN_AGENT_CAPABILITIES, ...BLOCKCRAFT_DOCUMENT_DESIGN_SKILLS],
}
