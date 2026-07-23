import {Subscription} from "rxjs";
import {deltaToString, nextTick, performanceTest} from "../../global";
import {
  BlockNodeType,
  DeltaOperation,
  FakeRange,
  STR_ZERO_WIDTH_SPACE
} from "../../framework";

export interface FindReplaceMatch {
  /** Stable model identity; available even when the block view is unmounted. */
  readonly blockId?: string
  block: BlockCraft.BlockComponent
  index: number
  length: number
  fakeRange: FakeRange | null
}

export interface FindReplaceFlag {
  name: string
  value: string
  checked: boolean
  title: string
}

const MATCH_COLOR = 'rgba(255, 198, 10, 0.4)'
const ACTIVE_COLOR = 'rgba(245, 74, 69, .4)'

/**
 * 匹配数 ≤ 此阈值时全量创建 FakeRange，超过时启用 IntersectionObserver 懒加载。
 * 50 个 FakeRange ≈ 50-150ms，用户无明显感知。
 */
const LAZY_THRESHOLD = 50

/**
 * Headless find-replace helper.
 *
 * Mixed strategy:
 * - model scan always covers mounted and unmounted blocks
 * - non-virtual documents with few matches create every FakeRange
 * - virtual or high-match documents materialize only visible/current matches
 */
export class FindReplaceHelper {
  matchIndex = 0
  matchedList: FindReplaceMatch[] = []
  matchedBlockMap = new Map<string, FindReplaceMatch[]>()

  regFlag = 'g'
  matchReg: RegExp = new RegExp('', this.regFlag)
  regFlagList: FindReplaceFlag[] = [
    {name: 'i', value: 'i', checked: false, title: '忽略大小写'}
  ]

  get isActive() { return !!this._findText }

  private _findText = ''
  private _subs: Subscription[] = []
  private _blockOrder: string[] | null = null
  private _destroyed = false
  private _refreshQueued = false
  private _refreshAll = false
  private _pendingTextBlockIds = new Set<string>()

  /** 当前搜索是否使用懒加载模式 */
  private _lazyMode = false

  // ── Viewport-aware FakeRange ───────────────────────────────
  private _observer: IntersectionObserver | null = null
  private _visibleBlockIds = new Set<string>()
  private _observedEls = new Map<string, Element>()
  private _elToBlockId = new Map<Element, string>()

  constructor(private readonly doc: BlockCraft.Doc) {
  }

  // ── Lifecycle ────────────────────────────────────────────────

  listen() {
    this._destroyed = false
    this._initObserver()

    this._subs.push(
      this.doc.model.structureChange$.subscribe(() => this._queueModelRefresh()),
      this.doc.model.textChange$.subscribe(evt => this._queueModelRefresh(evt.blockIds)),
      this.doc.virtualization.viewChange$.subscribe(() => {
        if (this.isActive && this._lazyMode) this._syncMountedMatchObservers()
      }),
    )
  }

  destroy() {
    this._destroyed = true
    this.clearAll()
    this._destroyObserver()
    this._subs.forEach(s => s.unsubscribe())
    this._subs = []
    this._pendingTextBlockIds.clear()
    this._refreshQueued = false
    this._refreshAll = false
  }

  // ── IntersectionObserver ────────────────────────────────────

  private _initObserver() {
    this._observer = new IntersectionObserver(
      (entries) => {
        if (!this._lazyMode) return
        entries.forEach(entry => {
          const blockId = this._elToBlockId.get(entry.target)
          if (!blockId) return

          if (entry.isIntersecting) {
            this._visibleBlockIds.add(blockId)
            this._materializeBlock(blockId)
          } else {
            this._visibleBlockIds.delete(blockId)
            this._dematerializeBlock(blockId)
          }
        })
      },
      {
        root: this.doc.scrollContainer ?? null,
        rootMargin: '200px 0px',
      }
    )
  }

  private _observeBlock(block: BlockCraft.BlockComponent) {
    if (!this._observer || this._observedEls.has(block.id)) return
    const el = block.hostElement
    this._observedEls.set(block.id, el)
    this._elToBlockId.set(el, block.id)
    this._observer.observe(el)
  }

  private _unobserveBlock(blockId: string) {
    const el = this._observedEls.get(blockId)
    if (!el || !this._observer) return
    this._observer.unobserve(el)
    this._observedEls.delete(blockId)
    this._elToBlockId.delete(el)
    this._visibleBlockIds.delete(blockId)
  }

  /** 为进入视口的块创建 FakeRange */
  private _materializeBlock(blockId: string) {
    const matches = this.matchedBlockMap.get(blockId)
    if (!matches) return
    const pending = [...matches]
    pending.forEach(m => this._ensureFakeRange(m))
    const activeMatch = this.matchedList[this.matchIndex]
    if (activeMatch && this._matchBlockId(activeMatch) === blockId) {
      activeMatch.fakeRange?.setColor({bgColor: ACTIVE_COLOR})
    }
  }

  /** Destroy view highlights outside the observed window. */
  private _dematerializeBlock(blockId: string, force = false) {
    const matches = this.matchedBlockMap.get(blockId)
    if (!matches) return
    const activeMatch = this.matchedList.length > 0 ? this.matchedList[this.matchIndex] : null
    matches.forEach(m => {
      if (m.fakeRange && (force || m !== activeMatch)) {
        m.fakeRange.destroy()
        m.fakeRange = null
      }
    })
  }

  /** 全量创建所有 FakeRange（非懒加载模式） */
  private _materializeAll() {
    this.matchedBlockMap.forEach(matches => {
      const pending = [...matches]
      pending.forEach(m => this._ensureFakeRange(m))
    })
  }

  /** Disconnect every observed host before rebuilding the view projection. */
  private _resetObservation() {
    this._observer?.disconnect()
    this._observedEls.clear()
    this._elToBlockId.clear()
    this._visibleBlockIds.clear()
  }

  private _destroyObserver() {
    this._resetObservation()
    this._visibleBlockIds.clear()
    this._observer = null
  }

  // ── Regex ────────────────────────────────────────────────────

  buildRegex(findText: string) {
    this.matchReg = new RegExp(
      findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      this.regFlag
    )
  }

  toggleFlag(flag: FindReplaceFlag) {
    flag.checked = !flag.checked
    this.regFlag = 'g' + this.regFlagList.filter(f => f.checked).map(f => f.value).join('')
  }

  // ── Find ─────────────────────────────────────────────────────

  @performanceTest()
  findAll(findText: string) {
    this._clearMatches()
    this._findText = findText
    if (!findText) return

    this.buildRegex(findText)
    this._blockOrder = null

    // Phase 1: scan the complete model without creating Angular views.
    this._scanModel()
    this._resortMatches()

    // Phase 2: 根据匹配数量决定策略
    this._syncMaterializationStrategy()

    if (this.matchedList.length) {
      this.highlightCurrent()
    }
  }

  findNext() {
    this.findByStep(1)
  }

  findPrev() {
    this.findByStep(-1)
  }

  findByStep(step: 1 | -1) {
    if (!this.matchedList.length) return
    this.cancelHighlight()
    this.matchIndex += step
    if (this.matchIndex >= this.matchedList.length) {
      this.matchIndex = 0
    }
    if (this.matchIndex < 0) {
      this.matchIndex = this.matchedList.length - 1
    }
    this.highlightCurrent()
  }

  // ── Highlight ────────────────────────────────────────────────

  cancelHighlight() {
    const match = this.matchedList[this.matchIndex]
    if (match?.fakeRange) {
      match.fakeRange.setColor({bgColor: MATCH_COLOR})
    }
  }

  highlightCurrent(withScroll = true) {
    while (this.matchedList.length) {
      this._clampMatchIndex()
      const match = this.matchedList[this.matchIndex]
      if (!this._ensureFakeRange(match)) continue
      match.fakeRange!.setColor({bgColor: ACTIVE_COLOR})
      if (withScroll) {
        const blockId = this._matchBlockId(match)
        if (this.doc.virtualization?.enabled) {
          void this.doc.virtualization.scrollToBlock(blockId)
        } else {
          this._resolveBlockView(blockId, false)?.hostElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center',
          })
        }
      }
      return
    }
  }

  // ── Replace ──────────────────────────────────────────────────

  replaceOne(replaceText: string) {
    if (!this.matchedList.length) return
    const match = this.matchedList[this.matchIndex]
    const blockId = this._matchBlockId(match)
    if (!this._isBlockIdAlive(blockId)) {
      this._dropMatch(match)
      return
    }
    if (this.doc.readonlyManager?.isReadonly(blockId) ?? this.doc.isReadonly) return
    this.doc.crud.transact(() => {
      this.doc.crud.replaceText(blockId, match.index, match.length, replaceText)
    })
  }

  replaceAll(replaceText: string) {
    this.doc.crud.transact(() => {
      this.matchedBlockMap.forEach((matched, bid) => {
        const delta: DeltaOperation[] = []
        let cursor = 0
        matched.forEach(m => {
          const retain = m.index - cursor
          if (retain > 0) delta.push({retain})
          delta.push({delete: m.length})
        if (replaceText) delta.push({insert: replaceText})
        cursor = m.index + m.length
      })
        if (!this._isBlockIdAlive(bid)) return
        if (this.doc.model.getNodeType(bid) !== BlockNodeType.editable) return
        if (this.doc.readonlyManager?.isReadonly(bid) ?? this.doc.isReadonly) return
        this.doc.crud.applyTextDelta(bid, delta)
      })
      this._destroyAllFakeRanges()
      this.matchedList = []
      this.matchedBlockMap.clear()
      this._resetObservation()
    })
  }

  // ── Cleanup ──────────────────────────────────────────────────

  clearAll() {
    this._findText = ''
    this._clearMatches()
  }

  clearOldMatchesMark(id: string) {
    const matches = this.matchedBlockMap.get(id)
    if (!matches) return
    matches.forEach(m => {
      if (m.fakeRange) m.fakeRange.destroy()
    })
    this.matchedBlockMap.delete(id)
    if (this._lazyMode) {
      this._unobserveBlock(id)
    }
  }

  // ── Internal ─────────────────────────────────────────────────

  private _clearMatches() {
    this.matchIndex = 0
    this._destroyAllFakeRanges()
    this.matchedList = []
    this.matchedBlockMap.clear()
    this._resetObservation()
    this._lazyMode = false
    this._pendingTextBlockIds.clear()
    this._refreshAll = false
  }

  private _destroyAllFakeRanges() {
    this.matchedBlockMap.forEach(matches => {
      matches.forEach(m => {
        if (m.fakeRange) {
          m.fakeRange.destroy()
          m.fakeRange = null
        }
      })
    })
  }

  private _ensureFakeRange(match: FindReplaceMatch): boolean {
    const blockId = this._matchBlockId(match)
    if (this._destroyed || !this._isBlockIdAlive(blockId)) {
      this._dropMatch(match)
      return false
    }
    if (match.fakeRange && !match.fakeRange.hasLostRenderedSpans) return true
    if (match.fakeRange) {
      match.fakeRange.destroy()
      match.fakeRange = null
    }
    const block = this._resolveBlockView(blockId, true)
    if (!block) {
      this._dropMatch(match)
      return false
    }
    try {
      match.fakeRange = this._createFakeRange(match)
      if (this._lazyMode) this._observeBlock(block)
      return true
    } catch {
      this._dropMatch(match)
      return false
    }
  }

  private _dropMatch(match: FindReplaceMatch) {
    const blockId = this._matchBlockId(match)
    const blockMatches = this.matchedBlockMap.get(blockId)
    if (blockMatches) {
      const blockIndex = blockMatches.indexOf(match)
      if (blockIndex >= 0) blockMatches.splice(blockIndex, 1)
      if (!blockMatches.length) {
        this.matchedBlockMap.delete(blockId)
        this._unobserveBlock(blockId)
      }
    }

    const listIndex = this.matchedList.indexOf(match)
    if (listIndex >= 0) {
      this.matchedList.splice(listIndex, 1)
      if (listIndex <= this.matchIndex) this.matchIndex--
    }

    if (match.fakeRange) {
      match.fakeRange.destroy()
      match.fakeRange = null
    }
    this._clampMatchIndex()
  }

  private _clampMatchIndex() {
    if (!this.matchedList.length) {
      this.matchIndex = 0
      return
    }
    if (this.matchIndex >= this.matchedList.length) {
      this.matchIndex = this.matchedList.length - 1
    }
    if (this.matchIndex < 0) {
      this.matchIndex = 0
    }
  }

  private _createFakeRange(match: FindReplaceMatch): FakeRange {
    return this.doc.selection.createFakeRange({
      from: {
        blockId: this._matchBlockId(match),
        index: match.index,
        length: match.length,
        type: 'text'
      },
      to: null
    }, {bgColor: MATCH_COLOR})
  }

  /** Pure model collection: no ComponentRef, DOM or observer work. */
  private _collectBlockMatches = (blockId: string): FindReplaceMatch[] | null => {
    const deltas = this.doc.model.getTextDeltas(blockId)
    const text = deltas ? deltaToString(deltas, STR_ZERO_WIDTH_SPACE) : ''
    if (!text) return null
    const matches = text.matchAll(this.matchReg)
    const res: FindReplaceMatch[] = []
    for (const match of matches) {
      res.push(this._createMatch(blockId, match.index, match[0].length))
    }
    if (res.length) {
      this.matchedBlockMap.set(blockId, res)
    }
    return res
  }

  /** 为所有已匹配块注册观察，并立即创建可见块的 FakeRange */
  private _observeAndMaterializeVisible() {
    this._syncMountedMatchObservers()
  }

  private _syncMountedMatchObservers() {
    for (const blockId of [...this._observedEls.keys()]) {
      if (this.doc.vm.isMounted(blockId)) continue
      this._unobserveBlock(blockId)
      this._dematerializeBlock(blockId, true)
    }

    const visit = (blockId: string) => {
      if (this.matchedBlockMap.has(blockId) && !this._observedEls.has(blockId)) {
        const block = this._resolveBlockView(blockId, false)
        if (block) this._observeBlock(block)
      }
      this.doc.model.getChildrenIds(blockId).forEach(visit)
    }
    this.doc.vm.getMountedRootChildIds().forEach(visit)
  }

  private _resortMatches() {
    if (!this._blockOrder) {
      this._blockOrder = this._computeBlockOrder()
    }
    const matchedList: FindReplaceMatch[] = []
    for (const id of this._blockOrder) {
      const list = this.matchedBlockMap.get(id)
      if (list) matchedList.push(...list)
    }
    this.matchedList = matchedList
  }

  private _computeBlockOrder(): string[] {
    const ids: string[] = []
    const walk = (parentId: string) => {
      for (const childId of this.doc.model.getChildrenIds(parentId)) {
        ids.push(childId)
        if (this.doc.model.getNodeType(childId) === BlockNodeType.block) walk(childId)
      }
    }
    walk(this.doc.rootId)
    return ids
  }

  private _scanModel() {
    this._blockOrder = this._computeBlockOrder()
    for (const blockId of this._blockOrder) {
      if (this.doc.model.getNodeType(blockId) === BlockNodeType.editable) {
        this._collectBlockMatches(blockId)
      }
    }
  }

  private _syncMaterializationStrategy() {
    const nextLazyMode = !!this.doc.virtualization?.enabled || this.matchedList.length > LAZY_THRESHOLD
    if (nextLazyMode !== this._lazyMode) {
      this._destroyAllFakeRanges()
      this._resetObservation()
      this._lazyMode = nextLazyMode
    }
    if (this._lazyMode) this._observeAndMaterializeVisible()
    else this._materializeAll()
  }

  private _queueModelRefresh(blockIds?: readonly string[]) {
    if (!this.isActive) return
    if (blockIds) blockIds.forEach(blockId => this._pendingTextBlockIds.add(blockId))
    else this._refreshAll = true
    if (this._refreshQueued) return
    this._refreshQueued = true

    nextTick().then(() => {
      this._refreshQueued = false
      if (this._destroyed || !this.isActive) return
      const previousIndex = this.matchIndex
      const activeMatch = this.matchedList[previousIndex]
      const activeKey = activeMatch ? {
        blockId: this._matchBlockId(activeMatch),
        index: activeMatch.index,
        length: activeMatch.length,
      } : null
      this.cancelHighlight()

      if (this._refreshAll) {
        this._clearMatches()
        this._scanModel()
      } else {
        const changedIds = [...this._pendingTextBlockIds]
        changedIds.forEach(blockId => {
          this.clearOldMatchesMark(blockId)
          if (this.doc.model.getNodeType(blockId) === BlockNodeType.editable) {
            this._collectBlockMatches(blockId)
          }
        })
      }
      this._refreshAll = false
      this._pendingTextBlockIds.clear()
      this._resortMatches()
      const restoredIndex = activeKey ? this.matchedList.findIndex(match =>
        this._matchBlockId(match) === activeKey.blockId &&
        match.index === activeKey.index &&
        match.length === activeKey.length
      ) : -1
      this.matchIndex = restoredIndex >= 0 ? restoredIndex : previousIndex
      this._clampMatchIndex()
      this._syncMaterializationStrategy()
      this.highlightCurrent(false)
    })
  }

  private _matchBlockId(match: FindReplaceMatch): string {
    return match.blockId ?? match.block.id
  }

  private _createMatch(blockId: string, index: number, length: number): FindReplaceMatch {
    const match = {
      blockId,
      index,
      length,
      fakeRange: null,
    } as FindReplaceMatch
    Object.defineProperty(match, 'block', {
      enumerable: false,
      get: () => {
        const block = this._resolveBlockView(blockId, true)
        if (!block) throw new Error(`Block view not found: ${blockId}`)
        return block
      },
    })
    return match
  }

  private _isBlockIdAlive(blockId: string): boolean {
    return this.doc.model.exists(blockId)
  }

  private _resolveBlockView(blockId: string, materialize: boolean): BlockCraft.BlockComponent | null {
    if (!this._isBlockIdAlive(blockId)) return null
    if (materialize) this.doc.virtualization?.ensureViewMounted([blockId])
    return this.doc.vm.get(blockId)?.instance ?? null
  }
}
