import {defineEditableBlockAgentCapability} from '../../agent-support'

export const CODE_BLOCK_AGENT_CAPABILITY =
  defineEditableBlockAgentCapability({
    flavour: 'code',
    title: '代码',
    description: '保留代码文本和语言标识。',
    semanticRoles: ['code'],
    extraWritable: {lang: {type: ['string', 'null'], maxLength: 80}},
  })
