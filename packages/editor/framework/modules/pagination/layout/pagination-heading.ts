import {BlockNodeType} from '../../../block-std/types/block.type'

interface PaginationHeadingInput {
  readonly nodeType: BlockNodeType
  readonly heading: unknown
  readonly plainTextOnly?: boolean
}

/** @internal Keep model-only seeds and mounted DOM measurements on one heading identity. */
export function isPaginationHeading({
  nodeType,
  heading,
  plainTextOnly = false,
}: PaginationHeadingInput): boolean {
  return nodeType === BlockNodeType.editable
    && !plainTextOnly
    && !!heading
}
