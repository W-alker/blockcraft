import {Subscription, fromEvent} from 'rxjs'
import {
  BlockNodeType,
  DocPlugin,
  closetBlockId,
  isNativeInputTarget,
} from '../../framework'
import {
  BlockPlaceholderConfig,
  resolvePlaceholderText,
} from '../../framework/block-std/schema/block-schema'
import {EditableBlockComponent} from '../../framework/block-std/block/component/editable-block'
import {BlockSelection} from '../../framework/modules/selection/blockSelection'

/**
 * Per-flavour placeholder overrides. Takes precedence over each Schema's
 * `metadata.placeholder` at render time without mutating the Schema.
 */
export type PlaceholderOverrides =
  Record<string, BlockPlaceholderConfig | null>

export interface PlaceholderPluginOptions {
  overrides?: PlaceholderOverrides
}

/**
 * Renders:
 * - the historical focused placeholder for empty editable blocks; and
 * - an opt-in persistent placeholder on empty editable blocks when
 *   `meta.plhMode === "always"`.
 *
 * Persistent placeholders use doc-level model events and keep only a set of
 * opted-in mounted block IDs. They do not allocate a text/meta subscription
 * for every block in a large document.
 */
export class PlaceholderPlugin extends DocPlugin {
  override name = 'placeholder'

  private readonly _subs = new Subscription()
  private readonly _persistentIds = new Set<string>()
  private readonly _lastTextById = new Map<string, string>()
  private readonly _pendingDiscoveryIds = new Set<string>()
  private _overrides: PlaceholderOverrides
  private _activeBlock: EditableBlockComponent | null = null
  private _composingBlockId: string | null = null
  private _discoveryScheduled = false
  private _destroyed = false

  constructor(options: PlaceholderPluginOptions = {}) {
    super()
    this._overrides = {...(options.overrides ?? {})}
  }

  setOverrides(overrides: PlaceholderOverrides): void {
    this._overrides = {...overrides}
    this._lastTextById.clear()
    this._syncAllPersistent()
    this._sync()
  }

  setOverrideFor(
    flavour: string,
    config: BlockPlaceholderConfig | null | undefined,
  ): void {
    const next = {...this._overrides}
    if (config === undefined) delete next[flavour]
    else next[flavour] = config
    this._overrides = next
    this._lastTextById.clear()
    this._syncAllPersistent()
    this._sync()
  }

  init(): void {
    this._subs.add(
      this.doc.selection.selectionChange$.subscribe(selection =>
        this._onSelectionChange(selection),
      ),
    )
    this._subs.add(
      this.doc.readonlySwitch$.subscribe(() => {
        this._syncAllPersistent()
        this._sync()
      }),
    )
    this._subs.add(
      this.doc.crud.onMetaUpdate$.subscribe(event => {
        let activePlaceholderChanged = false
        for (const transaction of event.transactions) {
          if (
            !transaction.changes.has('plh') &&
            !transaction.changes.has('plhMode')
          ) {
            continue
          }
          if (transaction.blockId === this._activeBlock?.id) {
            activePlaceholderChanged = true
          }
          const block = this._mountedBlock(transaction.blockId)
          if (block) this._reconcilePersistentBlock(block)
        }
        if (activePlaceholderChanged) this._sync()
      }),
    )
    this._subs.add(
      this.doc.crud.onTextUpdate$.subscribe(event => {
        event.transactions.forEach(transaction =>
          this._syncBlock(transaction.block),
        )
        this._sync()
      }),
    )
    this._subs.add(
      this.doc.crud.onPropsUpdate$.subscribe(event => {
        event.transactions.forEach(transaction => {
          if (transaction.changes.has('heading')) {
            this._syncBlock(transaction.block)
          }
        })
      }),
    )
    this._subs.add(
      this.doc.crud.onChildrenUpdate$.subscribe(event => {
        event.transactions.forEach(transaction => {
          transaction.inserted?.forEach(block =>
            this._discoverMountedSubtree(block),
          )
        })
        this._sync()
      }),
    )
    this._subs.add(
      this.doc.model.structureChange$.subscribe(event => {
        event.reachableRemovedIds.forEach(id => this._forgetBlock(id))
        this._scheduleMountedDiscovery(event.reachableAddedIds)
      }),
    )
    this._subs.add(
      this.doc.virtualization.viewChange$.subscribe(event => {
        event.mountedRootIds.forEach(id => {
          const block = this._mountedBlock(id)
          if (block) this._discoverMountedSubtree(block)
        })
      }),
    )

    const rootHost = this.doc.root.hostElement
    this._subs.add(
      fromEvent<CompositionEvent>(
        rootHost,
        'compositionstart',
        {capture: true},
      ).subscribe(event => {
        this._setComposingBlock(
          this._resolveCompositionBlock(event)?.id ?? null,
        )
      }),
    )
    this._subs.add(
      fromEvent<CompositionEvent>(
        rootHost,
        'compositionend',
        {capture: true},
      ).subscribe(() => this._setComposingBlock(null)),
    )

    this._discoverMountedSubtree(this.doc.root)
  }

  destroy(): void {
    this._destroyed = true
    this._subs.unsubscribe()
    for (const id of this._persistentIds) {
      const block = this._mountedBlock(id)
      if (block) this._writeDOM(block, '')
    }
    if (
      this._activeBlock &&
      !this._persistentIds.has(this._activeBlock.id)
    ) {
      this._writeDOM(this._activeBlock, '')
    }
    this._persistentIds.clear()
    this._lastTextById.clear()
    this._pendingDiscoveryIds.clear()
    this._activeBlock = null
    this._composingBlockId = null
  }

  private _focusedBlockFromSelection(
    selection: BlockSelection | null,
  ): EditableBlockComponent | null {
    if (!selection || selection.start.type !== 'text') return null
    if (!selection.isInSameBlock) return null
    const block = this._mountedBlock(selection.start.blockId)
    if (!block || !this.doc.isEditable(block)) return null
    return block
  }

  private _onSelectionChange = (selection: BlockSelection | null): void => {
    const previous = this._activeBlock
    const next = this._focusedBlockFromSelection(selection)
    this._activeBlock = next
    if (previous && previous !== next) this._syncBlock(previous)
    if (next) this._syncBlock(next)
  }

  private _discoverMountedSubtree(block: BlockCraft.BlockComponent): void {
    this._reconcilePersistentBlock(block)
    if (
      block.nodeType === BlockNodeType.editable ||
      block.nodeType === BlockNodeType.void
    ) {
      return
    }
    block.childrenIds.forEach(id => {
      const child = this._mountedBlock(id)
      if (child) this._discoverMountedSubtree(child)
    })
  }

  /**
   * BlockModelGraph publishes structure changes before DocCRUD finishes the
   * matching component-tree projection. Defer newly reachable IDs by one
   * microtask so snapshot replacement and other batched inserts can discover
   * their mounted persistent placeholders without waiting for focus.
   */
  private _scheduleMountedDiscovery(ids: readonly string[]): void {
    ids.forEach(id => this._pendingDiscoveryIds.add(id))
    if (!this._pendingDiscoveryIds.size || this._discoveryScheduled) return
    this._discoveryScheduled = true
    Promise.resolve().then(() => {
      this._discoveryScheduled = false
      if (this._destroyed) {
        this._pendingDiscoveryIds.clear()
        return
      }
      const pending = [...this._pendingDiscoveryIds]
      this._pendingDiscoveryIds.clear()
      pending.forEach(id => {
        const block = this._mountedBlock(id)
        if (block) this._discoverMountedSubtree(block)
      })
    })
  }

  private _reconcilePersistentBlock(block: BlockCraft.BlockComponent): void {
    const eligible = this._isPersistentEligible(block)
    if (eligible) {
      this._persistentIds.add(block.id)
      this._syncBlock(block)
      return
    }
    if (this._persistentIds.delete(block.id)) {
      this._lastTextById.delete(block.id)
      if (block !== this._activeBlock) this._writeDOM(block, '')
    }
    if (block === this._activeBlock) this._syncBlock(block)
  }

  private _isPersistentEligible(block: BlockCraft.BlockComponent): boolean {
    if (!this.doc.isEditable(block)) return false
    if (block.meta['plhMode'] !== 'always') return false
    if (typeof block.meta['plh'] !== 'string' || !block.meta['plh']) {
      return false
    }
    return true
  }

  private _sync = (): void => {
    if (this._activeBlock) this._syncBlock(this._activeBlock)
  }

  private _resolveCompositionBlock(
    event: CompositionEvent,
  ): EditableBlockComponent | null {
    if (isNativeInputTarget(event.target)) return null
    const target = event.target
    if (target && typeof (target as Node).nodeType === 'number') {
      const blockId = closetBlockId(target as Node)
      if (blockId) {
        const block = this._mountedBlock(blockId)
        if (block && this.doc.isEditable(block)) return block
      }
    }
    return this._activeBlock
  }

  private _setComposingBlock(blockId: string | null): void {
    const previousId = this._composingBlockId
    this._composingBlockId = blockId

    if (previousId) {
      const previous = this._mountedBlock(previousId)
      if (previous) this._syncBlock(previous)
    }
    if (blockId && blockId !== previousId) {
      const next = this._mountedBlock(blockId)
      if (next) this._syncBlock(next)
    }
  }

  private _syncAllPersistent(): void {
    for (const id of this._persistentIds) {
      const block = this._mountedBlock(id)
      if (block) this._syncBlock(block)
    }
  }

  private _syncBlock(block: BlockCraft.BlockComponent): void {
    const persistent = this._persistentIds.has(block.id)
    const focused = this._activeBlock?.id === block.id
    if (!persistent && !focused) {
      this._applyText(block, '')
      return
    }

    const canShowFocused =
      focused &&
      !this.doc.isReadonly &&
      !(this.doc.readonlyManager?.isReadonly(block) ?? this.doc.isReadonly)
    const shouldShow =
      this._composingBlockId !== block.id &&
      (persistent || canShowFocused) &&
      this.doc.model.getTextLength(block.id) === 0
    const text = shouldShow
      ? resolvePlaceholderText(
          this._resolveConfigFor(block),
          block.props['heading'] as number | undefined,
        )
      : ''
    this._applyText(block, text)
  }

  private _resolveConfigFor(
    block: BlockCraft.BlockComponent,
  ): BlockPlaceholderConfig | undefined {
    if (Object.prototype.hasOwnProperty.call(block.meta, 'plh')) {
      const instancePlaceholder = block.meta['plh']
      if (typeof instancePlaceholder === 'string') {
        return instancePlaceholder
      }
    }
    if (Object.prototype.hasOwnProperty.call(
      this._overrides,
      block.flavour,
    )) {
      return this._overrides[block.flavour] ?? undefined
    }
    return this.doc.schemas
      .get(block.flavour, false)
      ?.metadata.placeholder
  }

  private _applyText(block: BlockCraft.BlockComponent, text: string): void {
    if (this._lastTextById.get(block.id) === text) return
    this._lastTextById.set(block.id, text)
    this._writeDOM(block, text)
  }

  private _writeDOM(block: BlockCraft.BlockComponent, text: string): void {
    if (!this.doc.isEditable(block)) return
    const target = block.containerElement
    if (text) {
      target.setAttribute('data-placeholder', text)
      target.classList.add('bc-placeholder-target')
      block.hostElement.classList.add('empty', 'bc-placeholder-empty')
    } else {
      target.removeAttribute('data-placeholder')
      target.classList.remove('bc-placeholder-target')
      block.hostElement.classList.remove('empty', 'bc-placeholder-empty')
    }
  }

  private _mountedBlock(id: string): BlockCraft.BlockComponent | null {
    return this.doc.vm.get(id)?.instance ?? null
  }

  private _forgetBlock(id: string): void {
    this._persistentIds.delete(id)
    this._lastTextById.delete(id)
    if (this._activeBlock?.id === id) this._activeBlock = null
    if (this._composingBlockId === id) this._composingBlockId = null
  }
}
