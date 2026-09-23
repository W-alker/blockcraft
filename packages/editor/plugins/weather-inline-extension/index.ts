import {Subject, Subscription, takeUntil} from 'rxjs'
import {
  closetBlockId,
  DocPlugin,
  DOC_WEATHER_SERVICE_TOKEN,
  type DocWeatherData,
  EditableBlockComponent,
  EventListen,
  getPositionWithOffset,
  normalizeRange,
  UIEventStateContext,
} from '../../framework'
import {
  INLINE_WEATHER_CLASS,
  createInlineWeatherEmbedConverter,
  isInlineWeatherFormat,
  readInlineWeatherDelta,
} from '../../embeds/weather'
import {InlineWeatherFormatDialog} from './weather-format-dialog'

/** 行内天气格式设置与主动刷新；沿用快照日期。 */
export class WeatherInlineExtensionPlugin extends DocPlugin {
  override name = 'weather-inline-extension'

  private readonly _closeDialog$ = new Subject<void>()
  private readonly _sub = new Subscription()
  private _refreshAbort: AbortController | null = null
  private _activeBlock: BlockCraft.BlockComponent | null = null
  private _activeWeatherEl: HTMLElement | null = null

  init() {
    this._sub.add(
      this.doc.subscribeReadonlyChange(readonly => {
        if (readonly) this.closeDialog()
      }),
    )
    const stateChange$ = this.doc.readonlyManager?.stateChange$
    if (stateChange$) {
      this._sub.add(stateChange$.subscribe(() => {
        const block = this._activeBlock
        if (block && (!this._isBlockAlive(block) || this._isReadonly(block))) {
          this.closeDialog()
        }
      }))
    }
  }

  @EventListen('mouseDown', {flavour: 'root'})
  onInlineClick(ctx: UIEventStateContext) {
    if (this.doc.isReadonly) return

    const target = ctx.getDefaultEvent().target
    if (!(target instanceof Element)) return

    const weatherEl = target.closest<HTMLElement>(`.${INLINE_WEATHER_CLASS}`)
    if (!weatherEl) return

    const blockId = closetBlockId(weatherEl)
    if (!blockId) return

    const block = this._getLiveBlockById(blockId)
    if (!block) return
    if (!this.doc.isEditable(block)) return
    if (this._isReadonly(block)) return

    this.closeDialog()
    this._activeBlock = block
    this._activeWeatherEl = weatherEl
    weatherEl.classList.add('editing')

    const delta = createInlineWeatherEmbedConverter().toDelta(weatherEl)
    const {componentRef} =
      this.doc.overlayService.createConnectedOverlay<InlineWeatherFormatDialog>(
        {
          target: weatherEl,
          component: InlineWeatherFormatDialog,
          positions: [
            getPositionWithOffset('bottom-left', 0, 8),
            getPositionWithOffset('top-left', 0, 8),
          ],
          backdrop: true,
        },
        this._closeDialog$,
        this.closeDialog,
      )

    componentRef.setInput('delta', delta)

    componentRef.instance.close
      .pipe(takeUntil(this._closeDialog$))
      .subscribe(() => this.closeDialog())

    componentRef.instance.update
      .pipe(takeUntil(this._closeDialog$))
      .subscribe(result => {
        this._applyUpdate(block, weatherEl, result)
        this.closeDialog()
      })

    componentRef.instance.refresh.pipe(takeUntil(this._closeDialog$)).subscribe(async format => {
      if (this._refreshAbort || !this._isBlockAlive(block) || this._isReadonly(block) || !weatherEl.isConnected) return
      const current = createInlineWeatherEmbedConverter().toDelta(weatherEl)
      if (current.attributes?.['weatherSource'] === 'createdTime') return
      const date = current.attributes?.['weatherDate']
      const controller = new AbortController()
      this._refreshAbort = controller
      componentRef.setInput('loading', true)
      try {
        const weather = await this.doc.injector.get(DOC_WEATHER_SERVICE_TOKEN).query({
          ...(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? {date} : {}), refresh: true,
        }, controller.signal)
        if (controller.signal.aborted) return
        if (!readInlineWeatherDelta({insert: {weather: JSON.stringify(weather)}})) throw new Error('Invalid weather')
        if (this._applyUpdate(block, weatherEl, format, weather)) this.doc.messageService.success('天气已刷新')
        this.closeDialog()
      } catch {
        if (!controller.signal.aborted && this._isBlockAlive(block) && !this._isReadonly(block) && weatherEl.isConnected) {
          this.doc.messageService.error('天气刷新失败，请重试')
        }
      } finally {
        if (this._refreshAbort === controller) {
          this._refreshAbort = null
          componentRef.setInput('loading', false)
        }
      }
    })

    return true
  }

  /**
   * 用「删 1 + 插新」整体换掉 embed，而不是原地改 DOM：embed 的逻辑长度恒为 1，
   * 位置从实时 DOM range 反解出来，所以协同下别人在前面插了字也不会写错地方。
   */
  private _applyUpdate(
    block: EditableBlockComponent,
    weatherEl: HTMLElement,
    format: string,
    weather?: DocWeatherData,
  ): boolean {
    if (!this._isBlockAlive(block) || this._isReadonly(block)) return false

    if (!isInlineWeatherFormat(format) || !weatherEl.isConnected) return false
    const delta = createInlineWeatherEmbedConverter().toDelta(weatherEl)
    if (weather) delta.insert = {weather: JSON.stringify(weather)}
    delta.attributes = {...delta.attributes, weatherFormat: format}

    const range = this._tryGetEmbedRange(weatherEl)
    if (!range || range.start.type !== 'text' || range.start.blockId !== block.id) {
      return false
    }

    const embedIndex = range.start.offset
    if (weather) this.doc.crud.undoManager.stopCapturing()
    block.applyDeltaOperations([
      {retain: embedIndex},
      {delete: 1},
      {insert: delta.insert, attributes: delta.attributes},
    ])

    if (weather) this.doc.crud.undoManager.stopCapturing()

    requestAnimationFrame(() => {
      if (!this._isBlockAlive(block)) return
      this.doc.selection.setCursorAt(block, embedIndex + 1)
    })
    return true
  }

  private _tryGetEmbedRange(target: HTMLElement) {
    const range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(true)
    try {
      return normalizeRange(range, id => this.doc.getBlockById(id) as any)
    } catch {
      return null
    } finally {
      range.detach()
    }
  }

  private _isReadonly(block: BlockCraft.BlockComponent): boolean {
    return this.doc.readonlyManager?.isReadonly(block) ?? this.doc.isReadonly
  }

  private _isBlockAlive(block: BlockCraft.BlockComponent): boolean {
    try {
      return this.doc.getBlockById(block.id) === block
    } catch {
      return false
    }
  }

  private _getLiveBlockById(blockId: string): BlockCraft.BlockComponent | null {
    try {
      const block = this.doc.getBlockById(blockId)
      return this._isBlockAlive(block) ? block : null
    } catch {
      return null
    }
  }

  closeDialog = () => {
    this._refreshAbort?.abort()
    this._refreshAbort = null
    this._activeWeatherEl?.classList.remove('editing')
    this._closeDialog$.next()
    this._activeBlock = null
    this._activeWeatherEl = null
  }

  destroy() {
    this.closeDialog()
    this._sub.unsubscribe()
  }
}
