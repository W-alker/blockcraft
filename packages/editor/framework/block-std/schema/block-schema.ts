import { Type } from "@angular/core";
import { BlockNodeType, IBlockProps, IBlockSnapshot, IEditableBlockProps, InlineModel } from "../types";
import { NativeBlockModel } from "../index";
import { BlockCraftError, ErrorCode } from "../../../global";
import { generateId } from "../../utils";

export type EditableBlockCreateSnapshotParams = [(InlineModel | string)?, IBlockProps?];

type BlockCreateFn<T extends unknown[], M extends NativeBlockModel> = T extends [infer A, infer B, infer C] ? (arg1: A, arg: B, arg3: C) => IBlockSnapshot<M['props'], M['meta']> : (...args: T) => IBlockSnapshot<M['props'], M['meta']>

export type BlockPlaceholderConfig =
  | string
  | {
      default?: string
      heading?: { 1?: string; 2?: string; 3?: string }
    }

export type BlockSelectionScopeKind = "document" | "table" | "columns" | "container"

export type BlockSelectionScopeMetadata =
  | BlockSelectionScopeKind
  | "transparent"

/**
 * Resolve the placeholder text for an editable block based on its Schema
 * placeholder config and current heading level.
 *
 * Returns '' when no applicable placeholder is configured.
 */
export function resolvePlaceholderText(
  config: BlockPlaceholderConfig | undefined,
  heading: number | undefined
): string {
  if (!config) return ''
  if (typeof config === 'string') return config

  if (heading != null && config.heading) {
    // `heading` arrives as a generic number from props; values outside 1–3
    // safely resolve to `undefined` via the heading map's optional keys.
    const headingMap = config.heading as { [key: number]: string | undefined }
    const headingText = headingMap[heading]
    if (headingText) return headingText
  }
  return config.default ?? ''
}

export interface IBlockSchemaOptions<T extends NativeBlockModel = NativeBlockModel> {
  flavour: T['flavour'];
  nodeType: T['nodeType'];
  component: Type<BlockCraft.IBlockComponents[T['flavour']]>;
  createSnapshot: BlockCreateFn<BlockCraft.BlockCreateParameters<T['flavour']>, T>
  metadata: {
    version: number
    icon?: string;
    svgIcon?: string;
    label: string;
    description?: string;
    // 是否是某个block的依附子块
    isLeaf?: boolean;
    // true → 从插入菜单（斜杠菜单 + 右侧快捷插入）隐藏；与 isLeaf 不同，不限制其作为根级子块，仍可程序化插入
    hideInInsertMenu?: boolean;
    // 是否是渲染单元。代表它可以渲染各种块
    renderUnit?: boolean;
    /**
     * ['paragraph', 'image'] means that this block can contain in paragraph and image blocks\
     * ['table-*'] contains 'table-row', 'table-cell' blocks\
     * ['*'] means that this block can contain any blocks
     */
    includeChildren?: string[]
    /**
     * This block cannot contain the specified block. It is priority over 'includeChildren'
     */
    excludeChildren?: string[]
    /**
     * Placeholder shown on focused empty editable blocks.
     * - string: a single placeholder for all states.
     * - object: provide `default` and/or per-heading text.
     * - omitted: no placeholder is rendered.
     */
    placeholder?: BlockPlaceholderConfig
    /**
     * Semantic selection scope owned by this block.
     *
     * - omitted / "transparent": descendants inherit the nearest ancestor scope.
     * - "document": top-level document scope; normally used by root.
     * - "table": table descendants share one closed table scope.
     * - "columns": column descendants share one layout scope.
     * - "container": closed generic container scope such as callout/highlight.
     */
    selectionScope?: BlockSelectionScopeMetadata
  }
}

export const editableBlockCreateSnapShotFn = <M extends NativeBlockModel = NativeBlockModel>(flavour: M['flavour'], defaultProps?: Omit<IEditableBlockProps, 'depth'>): BlockCreateFn<unknown[], M> => {
  return (...args: unknown[]) => {
    const [deltas, props] = args
    const ch = []
    if (!deltas) {
    } else if (typeof deltas === 'string') {
      ch.push({ insert: deltas })
    } else if (Array.isArray(deltas)) {
      ch.push(...deltas)
    } else {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${flavour} block createSnapshot error: deltas must be string or deltas`)
    }

    if (props !== undefined && typeof props !== 'object') {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${flavour} block createSnapshot error: props must be undefined or object`)
    }

    const _props = {
      ...defaultProps,
    }
    // @ts-ignore
    _props['depth'] = props?.['depth'] || 0
    // @ts-ignore
    const _textAlign = props?.['textAlign'] || defaultProps?.['textAlign']
    if (_textAlign) _props['textAlign'] = _textAlign
    // @ts-ignore
    const _heading = props?.['heading'] || defaultProps?.['heading'] || undefined
    if (_heading) _props['heading'] = _heading

    return {
      id: generateId(),
      flavour: flavour,
      nodeType: BlockNodeType.editable,
      props: _props,
      meta: {},
      children: ch
    }
  }
}
