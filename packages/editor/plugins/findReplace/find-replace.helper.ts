import {Subscription} from "rxjs";
import {deltaToString, nextTick, performanceTest} from "../../global";
import {
  BlockNodeType,
  DeltaOperation,
  EditableBlockComponent,
  FakeRange,
  STR_ZERO_WIDTH_SPACE
} from "../../framework";

export interface FindReplaceMatch {
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
 * 混合策略：
 * - 匹配数 ≤ LAZY_THRESHOLD：全量创建 FakeRange，零 observer 开销
 * - 匹配数 > LAZY_THRESHOLD：IntersectionObserver 懒加载，只为视口内块创建 FakeRange
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
      this.doc.onChildrenUpdate$.subscribe(evt => {
        if (!this.isActive) return
        this.cancelHighlight()
        this._blockOrder = null

        nextTick().then(() => {
          if (this._destroyed || !this.isActive) return
          evt.transactions.forEach(t => {
            if (t.deleted) {
              const parentBlock = t.block
              const childIdSet = new Set(parentBlock.childrenIds)
              const toRemove: string[] = []
              for (const [bid, m] of this.matchedBlockMap) {
                if (m[0].block.parentId === parentBlock.id && !childIdSet.has(bid)) {
                  toRemove.push(bid)
                }
              }
              toRemove.forEach(id => this.clearOldMatchesMark(id))
            }

            if (t.inserted) {
              t.inserted.forEach(block => {
                if (!this.doc.isEditable(block)) return
                if (!this._isBlockAlive(block)) return
                this._matchBlockText(block)
              })
            }
          })

          this._resortMatches()
          this.highlightCurrent(false)
        })
      }),

      this.doc.onTextUpdate$.subscribe(evt => {
        if (!this.isActive) return
        this.cancelHighlight()

        nextTick().then(() => {
          if (this._destroyed || !this.isActive) return
          evt.transactions.forEach(t => {
            const block = t.block
            if (!this._isBlockAlive(block)) return
            this.clearOldMatchesMark(block.id)
            this._matchBlockText(block)
          })
          this._resortMatches()
          this.highlightCurrent(false)
        })
      })
    )
  }

  destroy() {
    this._destroyed = true
    this.clearAll()
    this._destroyObserver()
    this._subs.forEach(s => s.unsubscribe())
    this._subs = []
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
  }

  /** 为进入视口的块创建 FakeRange */
  private _materializeBlock(blockId: string) {
    const matches = this.matchedBlockMap.get(blockId)
    if (!matches) return
    const pending = [...matches]
    pending.forEach(m => this._ensureFakeRange(m))
  }

  /** 为离开视口的块销毁 FakeRange（保留当前高亮项） */
  private _dematerializeBlock(blockId: string) {
    const matches = this.matchedBlockMap.get(blockId)
    if (!matches) return
    const activeMatch = this.matchedList.length > 0 ? this.matchedList[this.matchIndex] : null
    matches.forEach(m => {
      if (m.fakeRange && m !== activeMatch) {
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

  /** 断开所有观察，但保留 _visibleBlockIds 供下次搜索复用 */
  private _resetObservation() {
    this._observer?.disconnect()
    this._observedEls.clear()
    this._elToBlockId.clear()
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

    // Phase 1: 纯文本扫描，收集匹配位置（不创建 FakeRange）
    const walk = (b: BlockCraft.BlockComponent) => {
      b.getChildrenBlocks().forEach(child => {
        if (child.nodeType === 'void') return
        if (child.nodeType === 'editable') {
          this._collectBlockMatches(child as EditableBlockComponent)
        } else {
          walk(child)
        }
      })
    }
    walk(this.doc.root)
    this._resortMatches()

    // Phase 2: 根据匹配数量决定策略
    this._lazyMode = this.matchedList.length > LAZY_THRESHOLD
    if (this._lazyMode) {
      // 懒加载：observer 按需创建
      this._observeAndMaterializeVisible()
    } else {
      // 全量：直接创建所有 FakeRange
      this._materializeAll()
    }

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
      withScroll && match.block.hostElement.scrollIntoView({behavior: 'smooth', block: 'center', inline: 'center'})
      return
    }
  }

  // ── Replace ──────────────────────────────────────────────────

  replaceOne(replaceText: string) {
    if (!this.matchedList.length) return
    const match = this.matchedList[this.matchIndex]
    if (!this._ensureFakeRange(match)) return
    this.doc.crud.transact(() => {
      this._replaceMatch(match, replaceText)
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
        let block: BlockCraft.BlockComponent
        try {
          block = this.doc.getBlockById(bid)
        } catch {
          return
        }
        if (!this._isBlockAlive(block) || !this.doc.isEditable(block)) return
        block.applyDeltaOperations(delta)
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
    if (this._destroyed || !this._isBlockAlive(match.block)) {
      this._dropMatch(match)
      return false
    }
    if (match.fakeRange) return true
    try {
      match.fakeRange = this._createFakeRange(match)
      return true
    } catch {
      this._dropMatch(match)
      return false
    }
  }

  private _dropMatch(match: FindReplaceMatch) {
    const blockMatches = this.matchedBlockMap.get(match.block.id)
    if (blockMatches) {
      const blockIndex = blockMatches.indexOf(match)
      if (blockIndex >= 0) blockMatches.splice(blockIndex, 1)
      if (!blockMatches.length) {
        this.matchedBlockMap.delete(match.block.id)
        this._unobserveBlock(match.block.id)
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
        blockId: match.block.id,
        index: match.index,
        length: match.length,
        type: 'text'
      },
      to: null
    }, {bgColor: MATCH_COLOR})
  }

  /** 纯数据收集，不创建 FakeRange，不 observe */
  private _collectBlockMatches = (block: EditableBlockComponent): FindReplaceMatch[] | null => {
    const text = deltaToString(block.textDeltas(), STR_ZERO_WIDTH_SPACE)
    if (!text) return null
    const matches = text.matchAll(this.matchReg)
    const res: FindReplaceMatch[] = []
    for (const match of matches) {
      res.push({
        fakeRange: null,
        index: match.index,
        length: match[0].length,
        block: block,
      })
    }
    if (res.length) {
      this.matchedBlockMap.set(block.id, res)
    }
    return res
  }

  /** 增量更新：扫描块文本 + 根据当前模式同步高亮 */
  private _matchBlockText = (block: EditableBlockComponent): FindReplaceMatch[] | null => {
    const res = this._collectBlockMatches(block)
    if (res?.length) {
      this._syncBlockHighlight(block)
    }
    return res
  }

  /** 根据当前模式为单个块同步高亮 */
  private _syncBlockHighlight(block: BlockCraft.BlockComponent) {
    if (!this._lazyMode) {
      // 非懒加载：直接创建
      this._materializeBlock(block.id)
      return
    }
    // 懒加载：observe + 如果可见则立即创建
    this._observeBlock(block)
    if (this._visibleBlockIds.has(block.id)) {
      this._materializeBlock(block.id)
    }
  }

  /** 为所有已匹配块注册观察，并立即创建可见块的 FakeRange */
  private _observeAndMaterializeVisible() {
    for (const [blockId, matches] of this.matchedBlockMap) {
      const block = matches[0].block
      this._observeBlock(block)
      if (this._visibleBlockIds.has(blockId)) {
        this._materializeBlock(blockId)
      }
    }
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
    const walk = (b: BlockCraft.BlockComponent) => {
      for (const childId of b.childrenIds) {
        ids.push(childId)
        try {
          const child = this.doc.getBlockById(childId)
          if (child.nodeType === BlockNodeType.block) {
            walk(child)
          }
        } catch {
          // block may have been destroyed between events
        }
      }
    }
    walk(this.doc.root)
    return ids
  }

  private _replaceMatch(match: FindReplaceMatch, replaceText: string) {
    if (!this._isBlockAlive(match.block) || !this.doc.isEditable(match.block)) return
    match.block.yText.delete(match.index, match.length)
    replaceText && match.block.yText.insert(match.index, replaceText)
  }

  private _isBlockAlive(block: BlockCraft.BlockComponent | null | undefined) {
    if (!block) return false
    try {
      return this.doc.getBlockById(block.id) === block
    } catch {
      return false
    }
  }
}
