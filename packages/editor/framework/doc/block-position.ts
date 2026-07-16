/**
 * A block, b block\
 * BEFORE: b block is before a block\
 * AFTER: b block is after a block\
 * CONTAINS: b block contains a block\
 * CONTAINED_BY: a block contains b block\
 * SAME: b block and a block are the same block
 */
export enum BLOCK_POSITION {
  BEFORE = 2, // Node.DOCUMENT_POSITION_PRECEDING
  AFTER = 4, // Node.DOCUMENT_POSITION_FOLLOWING
  CONTAINS = 16, // Node.DOCUMENT_POSITION_CONTAINED_BY
  CONTAINED_BY = 8, // Node.DOCUMENT_POSITION_CONTAINS
  SAME = 1, // Node.DOCUMENT_POSITION_DISCONNECTED
}
