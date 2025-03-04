import {IS_SAFARI} from "../../global";

export const INLINE_CONTAINER_CLASS = 'edit-container'
export const INLINE_ELEMENT_TAG = 'c-element'
export const INLINE_EMBED_NODE_TAG = 'c-embed'
export const INLINE_TEXT_NODE_TAG = 'c-text'

export const INLINE_EMBED_ELEMENT_CLASS = 'c-embed-element'

export const STR_ZERO_WIDTH_SPACE = IS_SAFARI ? '\u200C' : '\u200B';
// see https://en.wikipedia.org/wiki/Zero-width_non-joiner
export const STR_ZERO_WIDTH_NON_JOINER = '\u200C';

export const STR_LINE_BREAK = '\n'
// Tab符
export const STR_TAB = '\t'

