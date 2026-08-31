import { Type } from "@angular/core";
import {
  BlockNodeType,
  BlockPlacementMode,
  IBlockProps,
  IBlockSnapshot,
  IEditableBlockProps,
  InlineModel,
} from "../types";
import { NativeBlockModel } from "../index";
import { BlockCraftError, ErrorCode } from "../../../global";
import { generateId } from "../../utils";
import type {BlockObjectFormatCapability} from '../block/object-format'

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
 * Lets one placement-capable Block participate in document flow while relative
 * and become its own editing scope only after entering an absolute plane.
 */
export interface BlockPlacementSelectionScopeMetadata {
  relative: BlockSelectionScopeMetadata
  absolute: BlockSelectionScopeMetadata
}

export type BlockSelectionScopeCapability =
  | BlockSelectionScopeMetadata
  | BlockPlacementSelectionScopeMetadata

/** Schema-owned block-frame and child-editing interaction. */
export interface BlockSelectionInteractionCapability {
  /** Direct interaction with the block's own frame selects the whole Block. */
  frame: 'selectable'
  /**
   * Optional Escape transition from a direct editable child back to the frame.
   * This is independent from `editingBoundary`, so a relative-flow container
   * can preserve ordinary Enter/double-click editing while still exposing a
   * reliable keyboard path to whole-object selection. When omitted, Escape
   * retains the `editingBoundary` policy for backward compatibility.
   */
  escapeToFrame?: 'always' | 'absolute'
  /**
   * Optional transition between frame selection and editable descendants.
   * `absolute` keeps relative flow aligned with transparent blocks such as
   * Mermaid while making the same Block a closed object in placement layout.
   */
  editingBoundary?: 'always' | 'absolute'
}

/**
 * Controls whether a materialized block view may leave the live document.
 * `keep-alive` is intended for DOM-owned state such as iframe browsing
 * contexts and media playback positions.
 */
export type BlockViewRetention = 'virtual' | 'keep-alive'

export interface BlockPlacementCapability {
  modes: readonly BlockPlacementMode[]
}

export interface BlockObjectSizingCapability {
  /** Default width as a percentage of the root content box. */
  defaultWr: number
  /** Default aspect ratio expressed as width / height. */
  defaultAr: number
}

export interface BlockInstanceMetaCapability {
  /** Lets `meta.incl` / `meta.excl` narrow this container's direct children. */
  childConstraints?: boolean
}

/** Rendering coordinate system requesting a model-only block-height estimate. */
export type BlockVirtualizationLayoutMode = 'flow' | 'paginated'

/**
 * Pure model facts available to a Schema-owned height estimator.
 *
 * The callback runs while the block view may be unmounted. It must stay
 * deterministic and DOM/network free. Persist every layout-affecting fact in
 * block props and use `estimateChildHeight()` only for children that contribute
 * to this block's vertical extent.
 */
export interface BlockModelHeightEstimateContext<
  T extends NativeBlockModel = NativeBlockModel,
> {
  readonly blockId: string
  readonly flavour: T['flavour']
  readonly nodeType: T['nodeType']
  readonly props: Readonly<T['props']>
  readonly childIds: readonly string[]
  readonly layoutMode: BlockVirtualizationLayoutMode
  readonly fallbackHeight: number
  readonly rootContentWidth: number
  readonly baseFontSize: number
  readonly lineHeight: number
  readonly estimateChildHeight: (childId: string) => number
}

export type BlockModelHeightEstimator<
  T extends NativeBlockModel = NativeBlockModel,
> = {
  bivarianceHack(
    context: BlockModelHeightEstimateContext<T>,
  ): number
}['bivarianceHack']

export interface BlockVirtualizationCapability<
  T extends NativeBlockModel = NativeBlockModel,
> {
  /**
   * Explicitly permits the framework to materialize this view before it is
   * visible. `safe` guarantees that first mount starts no network/upload work
   * or media decoding/playback, performs no Yjs/model writes or notifications,
   * and registers no global listener or other side effect that normal
   * detach/destroy cannot fully release. Speculative mount may be cancelled
   * immediately, so it must be repeatable and reversible.
   */
  speculativeMount?: 'safe'
  /**
   * Controls whether this block's root render unit may unmount after its view
   * first materializes. Omitted / "virtual" keeps the normal windowed policy;
   * "keep-alive" preserves DOM-owned state until deletion or document disposal.
   */
  viewRetention?: BlockViewRetention
  /**
   * Return a finite non-negative CSS-pixel height from model state.
   * Invalid values and thrown errors fall back to framework rules.
   */
  estimateHeight?: BlockModelHeightEstimator<T>
}

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
    /**
     * Short plain-language introduction for insertion surfaces.
     * Keep shortcuts, Markdown triggers, and search aliases in their owning UI
     * configuration instead of embedding operational hints in this text.
     */
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
     * Marks editable content whose model must not receive rich-text formatting.
     * Components may still override `plainTextOnly`; declaring it here lets
     * model-only commands preserve the same capability while the view is
     * virtualized.
     */
    plainTextOnly?: boolean
    /**
     * Forces clipboard paste to consume only `text/plain` without disabling
     * formatting commands that the user applies inside the editable block.
     */
    pastePlainTextOnly?: boolean
    /** Block-owned root-virtualization lifecycle and model-only geometry. */
    virtualization?: BlockVirtualizationCapability<T>
    /**
     * Semantic selection scope owned by this block.
     *
     * - omitted / "transparent": descendants inherit the nearest ancestor scope.
     * - "document": top-level document scope; normally used by root.
     * - "table": table descendants share one closed table scope.
     * - "columns": column descendants share one layout scope.
     * - "container": closed generic container scope such as callout/highlight.
     */
    selectionScope?: BlockSelectionScopeCapability
    /**
     * Optional block-frame interaction owned by Selection.
     *
     * This is independent from `selectionScope`: scope controls which text
     * endpoints may form one range, while interaction controls whether the
     * container frame itself is selectable and can enter/exit child editing.
     * A Block view may declare precise descendant hit regions with
     * `data-bc-selection-interaction-frame`; unmarked descendants remain native.
     */
    selectionInteraction?: BlockSelectionInteractionCapability
    /**
     * Opts this flavour into the framework block-placement capability.
     * Omitted schemas remain flow-only even if stale props contain placement.
     */
    placement?: BlockPlacementCapability
    /**
     * Opts this flavour into root-relative object sizing.
     *
     * Sized blocks persist `props.wr` (root width percentage) and `props.ar`
     * (width / height). Renderers use these defaults when either value has not
     * been materialized yet.
     */
    objectSizing?: BlockObjectSizingCapability
    /**
     * Opts a fixed-geometry visual object into the shared Shape/TextBox/
     * WordArt format domain. Defaults are model-only and callbacks are
     * deliberately avoided so selection-wide reads stay deterministic.
     */
    objectFormat?: BlockObjectFormatCapability
    /**
     * Opts this Schema into generic instance metadata capabilities.
     * Omitted capabilities keep persisted fields inert.
     */
    instanceMeta?: BlockInstanceMetaCapability
    /**
     * Preserve this container when its last child is deleted.
     * Existing Schemas keep their historical fallback behavior by default.
     */
    allowEmptyChildren?: boolean
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
