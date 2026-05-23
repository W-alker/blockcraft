import { Subscription, filter, fromEvent } from "rxjs"
import { DocPlugin } from "../../framework"
import {
  BlockPlaceholderConfig,
  resolvePlaceholderText,
} from "../../framework/block-std/schema/block-schema"
import { EditableBlockComponent } from "../../framework/block-std/block/component/editable-block"
import { BlockSelection } from "../../framework/modules/selection/blockSelection"

/**
 * PlaceholderPlugin — renders placeholder text on an empty, focused editable
 * block.
 *
 * Design note: this plugin holds a *single* set of subscriptions for the
 * whole doc rather than one set per block. The previously focused block
 * (`_activeBlock`) is the only block that has its `onTextChange` /
 * `onPropsChange` streams subscribed at any moment — we swap subscriptions
 * on every selection change. Selection / readonly / IME composition all
 * fan-in through one handler each. So the steady-state subscription count
 * is constant (≈6) regardless of how large the document is.
 *
 * Reads `IBlockSchemaOptions.metadata.placeholder` to decide what text to
 * render. Blocks without a placeholder config render nothing.
 *
 * DOM contract (matches existing CSS in `themes/base.scss`):
 *   - `.empty` class on the host element (so the
 *     `[data-node-type="editable"].empty` selector matches).
 *   - `data-placeholder="<text>"` attribute on the `.edit-container` (the
 *     element the CSS `::before` pseudo lives on — `attr()` reads the
 *     attribute from that element, not from an ancestor).
 */
export class PlaceholderPlugin extends DocPlugin {
  override name = "placeholder"

  private readonly _globalSubs: Subscription[] = []

  private _activeBlock: EditableBlockComponent | null = null
  private _activeBlockSubs?: Subscription
  private _isComposing = false
  private _lastAppliedText = ""

  init() {
    // 1. Global subscriptions (constant, doc-wide)
    this._globalSubs.push(
      this.doc.selection.selectionChange$.subscribe(sel => this._onSelectionChange(sel)),
    )
    this._globalSubs.push(
      this.doc.readonlySwitch$.subscribe(() => this._sync()),
    )

    // 2. Composition events — listen to native DOM events on the root host
    //    in capture phase. We can't use `doc.event.add('compositionStart')`
    //    because `InputTransformer._handleCompositionStart` is registered as
    //    a global handler and always returns `true` (stopPropagation), so any
    //    later-registered global handler — including ours — would never run.
    //    Capture-phase native listening sidesteps the framework dispatcher
    //    entirely and guarantees we observe every IME session.
    const rootHost = this.doc.root.hostElement
    this._globalSubs.push(
      fromEvent<CompositionEvent>(rootHost, "compositionstart", { capture: true }).subscribe(() => {
        this._isComposing = true
        this._sync()
      }),
    )
    this._globalSubs.push(
      fromEvent<CompositionEvent>(rootHost, "compositionend", { capture: true }).subscribe(() => {
        this._isComposing = false
        this._sync()
      }),
    )
  }

  destroy() {
    this._globalSubs.forEach(s => s.unsubscribe())
    this._globalSubs.length = 0
    this._activeBlockSubs?.unsubscribe()
    this._activeBlockSubs = undefined

    // Best-effort DOM cleanup for the last active block (e.g. on hot-reload).
    if (this._activeBlock) {
      this._writeDOM(this._activeBlock, "")
    }
    this._activeBlock = null
    this._lastAppliedText = ""
  }

  /**
   * Pick the block that should own the placeholder for the given selection.
   * Returns null when no editable block is eligible (cross-block selection,
   * whole-block "selected" type, no selection, etc).
   */
  private _focusedBlockFromSelection(sel: BlockSelection | null): EditableBlockComponent | null {
    if (!sel) return null
    if (sel.start.type !== "text") return null
    if (!sel.isInSameBlock) return null
    const block = this.doc.getBlockById(sel.start.blockId, () => {})
    if (!block || !this.doc.isEditable(block)) return null
    return block
  }

  private _onSelectionChange = (sel: BlockSelection | null) => {
    const next = this._focusedBlockFromSelection(sel)
    if (next === this._activeBlock) {
      // Same block; selection moved within it. _sync() is safe; the cache in
      // _lastAppliedText short-circuits no-op writes.
      this._sync()
      return
    }

    // Clear placeholder on previously active block, regardless of cache.
    if (this._activeBlock) {
      this._writeDOM(this._activeBlock, "")
    }
    this._activeBlockSubs?.unsubscribe()
    this._activeBlockSubs = undefined
    this._lastAppliedText = ""
    this._activeBlock = next

    if (next) {
      const subs = new Subscription()
      subs.add(next.onTextChange.subscribe(() => this._sync()))
      subs.add(
        next.onPropsChange
          .pipe(filter(m => m.has("heading" as never)))
          .subscribe(() => this._sync()),
      )
      // If the active block is destroyed before selection moves away, drop
      // the cached reference so we don't write to a detached host element.
      subs.add(
        next.onDestroy$.subscribe(() => {
          if (this._activeBlock === next) {
            this._activeBlockSubs?.unsubscribe()
            this._activeBlockSubs = undefined
            this._activeBlock = null
            this._lastAppliedText = ""
          }
        }),
      )
      this._activeBlockSubs = subs
    }

    this._sync()
  }

  private _sync = () => {
    const block = this._activeBlock
    if (!block) return

    const shouldShow =
      !this.doc.isReadonly &&
      !this._isComposing &&
      block.textLength === 0

    const config = this.doc.schemas.get(block.flavour, false)?.metadata.placeholder as
      | BlockPlaceholderConfig
      | undefined
    const heading = block.props["heading"] as number | undefined
    const text = shouldShow ? resolvePlaceholderText(config, heading) : ""

    if (text === this._lastAppliedText) return
    this._lastAppliedText = text
    this._writeDOM(block, text)
  }

  private _writeDOM(block: EditableBlockComponent, text: string): void {
    if (text) {
      block.containerElement.setAttribute("data-placeholder", text)
      block.hostElement.classList.add("empty")
    } else {
      block.containerElement.removeAttribute("data-placeholder")
      block.hostElement.classList.remove("empty")
    }
  }
}
