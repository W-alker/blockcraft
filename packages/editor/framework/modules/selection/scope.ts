import {BaseBlockComponent, BlockNodeType, BlockSelectionScopeMetadata} from "../../block-std";
import {ISelectionPoint} from "./types";

export type SelectionScopeKind = Exclude<BlockSelectionScopeMetadata, "transparent">

export type TextRangeTailMode = "merge" | "preserve"
export type CoveredBlockClassMode = "query" | "text-endpoints"

export interface SelectionScope {
  readonly kind: SelectionScopeKind
  readonly blockId: string
}

export interface SelectionScopePolicy {
  readonly kind: SelectionScopeKind
  /**
   * Native beforeInput target ranges can be narrower than BlockCraft's model
   * selection for structural scopes. When this is true, InputTransformer keeps
   * using the live BlockSelection for text replacement.
   */
  readonly useModelForTextBeforeInput: boolean
  /**
   * Cross-block text replacement normally appends the end text tail into the
   * start block. Layout scopes such as columns preserve the tail in its own
   * structural child instead.
   */
  readonly textRangeTailMode: TextRangeTailMode
  /**
   * Generic `.selected` painting can mark intermediate structural containers.
   * Some scopes prefer focused endpoint text blocks and let their own component
   * paint richer selection UI.
   */
  readonly coveredBlockClassMode: CoveredBlockClassMode
}

const SCOPE_POLICIES: Record<SelectionScopeKind, SelectionScopePolicy> = {
  document: {
    kind: "document",
    useModelForTextBeforeInput: false,
    textRangeTailMode: "merge",
    coveredBlockClassMode: "query",
  },
  table: {
    kind: "table",
    useModelForTextBeforeInput: false,
    textRangeTailMode: "merge",
    coveredBlockClassMode: "text-endpoints",
  },
  columns: {
    kind: "columns",
    useModelForTextBeforeInput: true,
    textRangeTailMode: "preserve",
    coveredBlockClassMode: "text-endpoints",
  },
  container: {
    kind: "container",
    useModelForTextBeforeInput: false,
    textRangeTailMode: "merge",
    coveredBlockClassMode: "query",
  },
}

type GetBlockById = (id: string) => BaseBlockComponent<any>

/**
 * The physical parent of a selection endpoint. If both endpoints share this id,
 * existing same-parent behavior can keep using the DOM common ancestor.
 */
export function resolveSelectionContainerId(point: ISelectionPoint): string {
  if (point.type === "boundary") return point.blockId
  if (point.type === "table-cell") return point.tableId
  return point.block.parentId ?? point.blockId
}

/**
 * Resolve the semantic editing domain for one endpoint.
 *
 * A whole-block selected/gap point belongs to the parent's scope, because the
 * block itself is being selected as a child. Boundary and text points belong to
 * the scope that owns the content being edited.
 */
export function resolveSelectionScope(
  point: ISelectionPoint,
  getBlockById: GetBlockById,
): SelectionScope | null {
  const seed = resolveScopeSeed(point, getBlockById)
  return seed ? resolveScopeFromBlock(seed, getBlockById) : null
}

export function resolveCommonSelectionScope(
  anchor: ISelectionPoint,
  head: ISelectionPoint,
  getBlockById: GetBlockById,
): SelectionScope | null {
  const anchorScope = resolveSelectionScope(anchor, getBlockById)
  const headScope = resolveSelectionScope(head, getBlockById)
  if (!anchorScope || !headScope) return null
  return anchorScope.blockId === headScope.blockId ? anchorScope : null
}

export function getSelectionScopePolicy(scope: SelectionScope | null | undefined): SelectionScopePolicy | null {
  if (!scope) return null
  return SCOPE_POLICIES[scope.kind] ?? null
}

export function resolveSelectionScopeForBlock(
  block: BaseBlockComponent<any>,
  getBlockById: GetBlockById,
): SelectionScope | null {
  return resolveScopeFromBlock(block, getBlockById)
}

export function resolveSelectionScopeForBlockId(
  blockId: string,
  getBlockById: GetBlockById,
): SelectionScope | null {
  return resolveSelectionScopeForBlock(getBlockById(blockId), getBlockById)
}

export function resolveSelectionScopePolicyForBlockId(
  blockId: string | null | undefined,
  getBlockById: GetBlockById,
): SelectionScopePolicy | null {
  if (!blockId) return null
  return getSelectionScopePolicy(resolveSelectionScopeForBlockId(blockId, getBlockById))
}

function resolveScopeSeed(
  point: ISelectionPoint,
  getBlockById: GetBlockById,
): BaseBlockComponent<any> | null {
  if (point.type === "table-cell") return getBlockById(point.tableId)
  if (point.type === "boundary") return point.block

  const block = point.block
  return (block.parentBlock as BaseBlockComponent<any> | null) ??
    (block.parentId ? getBlockById(block.parentId) : block)
}

function resolveScopeFromBlock(
  block: BaseBlockComponent<any>,
  getBlockById: GetBlockById,
): SelectionScope | null {
  let current: BaseBlockComponent<any> | null = block

  while (current) {
    const kind = resolveSchemaSelectionScope(current)
    if (kind) return {kind, blockId: current.id}

    // Compatibility for light test doubles or partially registered roots. This
    // is node-type based, not flavour based; real blocks should declare
    // `metadata.selectionScope` on their schema.
    if (current.nodeType === BlockNodeType.root) return {kind: "document", blockId: current.id}

    current = (current.parentBlock as BaseBlockComponent<any> | null) ??
      (current.parentId ? getBlockById(current.parentId) : null)
  }

  return null
}

function resolveSchemaSelectionScope(
  block: BaseBlockComponent<any>,
): SelectionScopeKind | null {
  const metadata = readSchemaSelectionScope(block)
  if (!metadata || metadata === "transparent") return null
  return metadata
}

function readSchemaSelectionScope(
  block: BaseBlockComponent<any>,
): BlockSelectionScopeMetadata | null {
  const schemas = block.doc?.schemas
  if (!schemas?.get) return null
  try {
    return schemas.get(block.flavour, false)?.metadata.selectionScope ?? null
  } catch {
    return null
  }
}
