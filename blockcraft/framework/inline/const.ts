import {IS_SAFARI} from "../../global";

export const INLINE_ELEMENT_TAG = 'c-element'
export const INLINE_EMBED_NODE_TAG = 'c-embed'
export const INLINE_TEXT_NODE_TAG = 'c-text'
export const INLINE_EMBED_GAP_TAG = 'c-zero-text'
export const INLINE_COMPOS_NODE_TAG = 'c-compose-text'

export const ZERO_WIDTH_SPACE = IS_SAFARI ? '\u200C' : '\u200B';
// see https://en.wikipedia.org/wiki/Zero-width_non-joiner
export const ZERO_WIDTH_NON_JOINER = '\u200C';

