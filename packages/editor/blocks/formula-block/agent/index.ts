import {defineBlockAgentCapability} from '../../../framework'
import {blockAgentWritableProps} from '../../agent-support'

const LATEX_SCHEMA = {type: 'string', maxLength: 20_000} as const

export const FORMULA_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.formula',
  kind: 'block',
  flavour: 'formula',
  schemaVersion: 1,
  title: '公式',
  description: '用 LaTeX 表达式创建数学公式。',
  domains: ['document'],
  semanticRoles: ['formula', 'math'],
  createParameters: {type: 'array', maxItems: 1, prefixItems: [LATEX_SCHEMA]},
  writableProps: blockAgentWritableProps({latex: LATEX_SCHEMA}),
  examples: [{flavour: 'formula', params: ['x^2 + y^2']}],
})
