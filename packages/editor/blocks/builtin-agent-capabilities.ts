import type {BlockAgentCapabilityDefinition} from '../framework'
import {ATTACHMENT_BLOCK_AGENT_CAPABILITY} from './attachment-block/agent'
import {AUDIO_BLOCK_AGENT_CAPABILITY} from './audio-block/agent'
import {BLOCKQUOTE_BLOCK_AGENT_CAPABILITY} from './blockquote-block/agent'
import {BOOKMARK_BLOCK_AGENT_CAPABILITY} from './bookmark-block/agent'
import {BULLET_BLOCK_AGENT_CAPABILITY} from './bullet-block/agent'
import {CALLOUT_BLOCK_AGENT_CAPABILITY} from './callout-block/agent'
import {CAPTION_BLOCK_AGENT_CAPABILITY} from './caption-block/agent'
import {CODE_BLOCK_AGENT_CAPABILITY} from './code-block/agent'
import {COLUMNS_BLOCK_AGENT_CAPABILITY} from './columns-block/agent'
import {DIVIDER_BLOCK_AGENT_CAPABILITY} from './divider-block/agent'
import {DATE_CARD_BLOCK_AGENT_CAPABILITY} from './dynamic-material-blocks/date-card/agent'
import {PERSON_CARD_BLOCK_AGENT_CAPABILITY} from './dynamic-material-blocks/person-card/agent'
import {WEATHER_BLOCK_AGENT_CAPABILITY} from './dynamic-material-blocks/weather/agent'
import {FIGMA_EMBED_BLOCK_AGENT_CAPABILITY} from './embed-blocks/figma-embed-block/agent'
import {JUEJIN_EMBED_BLOCK_AGENT_CAPABILITY} from './embed-blocks/juejin-embed-block/agent'
import {FORMULA_BLOCK_AGENT_CAPABILITY} from './formula-block/agent'
import {IMAGE_BLOCK_AGENT_CAPABILITY} from './image-block/agent'
import {MERMAID_BLOCK_AGENT_CAPABILITY} from './mermaid-block/agent'
import {ORDERED_BLOCK_AGENT_CAPABILITY} from './ordered-block/agent'
import {PAGE_DIVIDER_BLOCK_AGENT_CAPABILITY} from './page-divider-block/agent'
import {PARAGRAPH_BLOCK_AGENT_CAPABILITY} from './paragraph-block/agent'
import {RENDER_UNIT_BLOCK_AGENT_CAPABILITY} from './render-unit-block/agent'
import {ROOT_BLOCK_AGENT_CAPABILITY} from './root-block/agent'
import {SHAPE_BLOCK_AGENT_CAPABILITY} from './shape-block/agent'
import {TABLE_BLOCK_AGENT_CAPABILITY} from './table-block/agent'
import {TEXT_BOX_BLOCK_AGENT_CAPABILITY} from './text-box-block/agent'
import {TODO_BLOCK_AGENT_CAPABILITY} from './todo-block/agent'
import {VIDEO_BLOCK_AGENT_CAPABILITY} from './video-block/agent'
import {WORD_ART_BLOCK_AGENT_CAPABILITY} from './word-art-block/agent'

/**
 * Aggregation only. The semantic contract for each built-in Block stays beside
 * that Block in `blocks/<block>/agent/`.
 */
export const BLOCKCRAFT_BUILTIN_BLOCK_AGENT_CAPABILITIES:
  readonly BlockAgentCapabilityDefinition[] = [
  ROOT_BLOCK_AGENT_CAPABILITY,
  PARAGRAPH_BLOCK_AGENT_CAPABILITY,
  ORDERED_BLOCK_AGENT_CAPABILITY,
  BULLET_BLOCK_AGENT_CAPABILITY,
  TODO_BLOCK_AGENT_CAPABILITY,
  BLOCKQUOTE_BLOCK_AGENT_CAPABILITY,
  CAPTION_BLOCK_AGENT_CAPABILITY,
  CODE_BLOCK_AGENT_CAPABILITY,
  CALLOUT_BLOCK_AGENT_CAPABILITY,
  DIVIDER_BLOCK_AGENT_CAPABILITY,
  PAGE_DIVIDER_BLOCK_AGENT_CAPABILITY,
  IMAGE_BLOCK_AGENT_CAPABILITY,
  TABLE_BLOCK_AGENT_CAPABILITY,
  BOOKMARK_BLOCK_AGENT_CAPABILITY,
  FIGMA_EMBED_BLOCK_AGENT_CAPABILITY,
  JUEJIN_EMBED_BLOCK_AGENT_CAPABILITY,
  ATTACHMENT_BLOCK_AGENT_CAPABILITY,
  VIDEO_BLOCK_AGENT_CAPABILITY,
  AUDIO_BLOCK_AGENT_CAPABILITY,
  FORMULA_BLOCK_AGENT_CAPABILITY,
  MERMAID_BLOCK_AGENT_CAPABILITY,
  COLUMNS_BLOCK_AGENT_CAPABILITY,
  SHAPE_BLOCK_AGENT_CAPABILITY,
  TEXT_BOX_BLOCK_AGENT_CAPABILITY,
  WORD_ART_BLOCK_AGENT_CAPABILITY,
  RENDER_UNIT_BLOCK_AGENT_CAPABILITY,
  WEATHER_BLOCK_AGENT_CAPABILITY,
  DATE_CARD_BLOCK_AGENT_CAPABILITY,
  PERSON_CARD_BLOCK_AGENT_CAPABILITY,
]
