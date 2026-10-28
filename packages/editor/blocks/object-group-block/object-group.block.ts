import {ChangeDetectionStrategy, Component, ViewChild} from '@angular/core'
import {takeUntilDestroyed} from '@angular/core/rxjs-interop'
import {CsTooltipDirective} from '@cses/ui'
import {
  BLOCK_OBJECT_GROUP_PADDING,
  BaseBlockComponent,
  normalizeBlockObjectGroupProps,
  storeBlockPosition,
} from '../../framework'
import type {ObjectGroupBlockModel} from './index'
import {ShapeResizerComponent, type ShapeResizeBox, type ShapeResizeCalculator, type ShapeResizeCommit} from '../shape-block/shape-resizer.component'
import {calculateImageResize} from '../image-block/image-resize'
import {resolvePlacementObjectGeometry} from '../../framework/modules/object/block-placement/object-geometry'
import {pauseObjectResizePreview} from '../../framework/modules/object/object-resize-preview'
import {createObjectGroupFontScale, createObjectGroupScaleConstraint, objectGroupResizeBounds, scaleObjectGroupMembers, type ObjectGroupResizeMember} from '../../framework/modules/object/block-placement/group-resize'
import {createWordArtResizePreview} from '../word-art-block/word-art-resize-preview'

@Component({
  selector: 'div.object-group-block',
  standalone: true,
  imports: [ShapeResizerComponent, CsTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.contenteditable]': "'false'",
    '[attr.data-bc-object-group]': "''",
    '[attr.data-bc-resize-preview-anchor]': "isAbsolute ? null : 'layout'",
    '[style.width.px]': 'groupProps.width',
    '[style.height.px]': 'groupProps.height',
    '[style.box-sizing]': "'border-box'",
    '[style.padding.px]': '0',
    '[style.--bc-object-group-padding.px]': 'groupPadding',
    '[style.overflow]': "'visible'",
  },
  template: `
    <div class="object-group-block__children children-render-container">
    </div>
    @if (!isReadonly) {
      <shape-resizer
        data-bc-selection-interaction-ignore
        [target]="hostElement"
        [maxWidthContainer]="placementContainer"
        [maxWidthResolver]="resizeMaxWidth"
        [resizeCalculator]="resizeCalculator"
        [resizeDisabledReason]="resizeDisabledReason"
        [csTooltip]="resizeDisabledReason"
        [rotatable]="false"
        (resizeStart)="onResizeStart()"
        (resizeEnd)="onResizeEnd()"
        (resizeCommit)="onResizeCommit($event)"
      />
      @for (edge of moveEdges; track edge) {
        <span
          class="object-group-block__move-edge"
          data-bc-object-drag-handle
          [attr.data-move-edge]="edge"
          contenteditable="false"
          aria-hidden="true">
        </span>
      }
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .object-group-block__children {
      position: relative;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      isolation: isolate;
      overflow: visible;
    }

    :host(.selected) > shape-resizer {
      display: block;
      z-index: 6;
    }

    @media print {
      shape-resizer { display: none !important; }
    }

    :host(.selected),
    :host(.bc-object-group--selection-within) {
      background: transparent !important;
      outline: 2px solid var(--bc-active-color, #4857e2);
      outline-offset: var(--bc-object-group-padding);
    }

    /* The resizer owns the selected frame; retain the ancestor/readonly frame
       without painting two adjacent outlines around an editable selection. */
    :host(.selected):has(> shape-resizer) {
      outline: none;
    }

    :host ::ng-deep > shape-resizer .shape-resizer__frame {
      outline-offset: var(--bc-object-group-padding);
    }

    /* Keep drag hit areas outside the content plane so member resize handles
       at its boundary remain reachable with the 4px frame outset. */
    .object-group-block__move-edge {
      position: absolute;
      z-index: 5;
      display: none;
      pointer-events: auto;
      touch-action: none;
      cursor: move;
    }

    :host([data-bc-placement='absolute'].selected) >
      /* Keep drag hit areas outside the content plane so member resize handles
       at its boundary remain reachable with the 4px frame outset. */
    .object-group-block__move-edge {
      display: block;
    }

    .object-group-block__move-edge[data-move-edge='north'] {
      top: calc(-3px - var(--bc-object-group-padding));
      right: calc(-3px - var(--bc-object-group-padding));
      left: calc(-3px - var(--bc-object-group-padding));
      height: 6px;
    }

    .object-group-block__move-edge[data-move-edge='east'] {
      top: calc(-3px - var(--bc-object-group-padding));
      right: calc(-3px - var(--bc-object-group-padding));
      bottom: calc(-3px - var(--bc-object-group-padding));
      width: 6px;
    }

    .object-group-block__move-edge[data-move-edge='south'] {
      right: calc(-3px - var(--bc-object-group-padding));
      bottom: calc(-3px - var(--bc-object-group-padding));
      left: calc(-3px - var(--bc-object-group-padding));
      height: 6px;
    }

    .object-group-block__move-edge[data-move-edge='west'] {
      top: calc(-3px - var(--bc-object-group-padding));
      bottom: calc(-3px - var(--bc-object-group-padding));
      left: calc(-3px - var(--bc-object-group-padding));
      width: 6px;
    }
  `],
})
export class ObjectGroupBlockComponent
  extends BaseBlockComponent<ObjectGroupBlockModel> {
  readonly groupPadding = BLOCK_OBJECT_GROUP_PADDING
  readonly moveEdges = ['north', 'east', 'south', 'west'] as const
  @ViewChild(ShapeResizerComponent) private resizer?: ShapeResizerComponent
  @ViewChild(CsTooltipDirective) private resizeTooltip?: CsTooltipDirective
  protected resizeDisabledReason = ''
  private constrainScale = createObjectGroupScaleConstraint([])
  private scaleFonts = createObjectGroupFontScale([])
  private resizeFeedback: string | null = null
  private resizeSnapshot: string | null = null
  private resizeStartBox: ShapeResizeBox | null = null
  private resizeMembers: ObjectGroupResizeMember[] = []
  private resizeRequest: ShapeResizeBox | null = null
  private previewBox: ShapeResizeBox | null = null
  private resumeMemberAutoFit: (() => void)[] = []
  private memberViews: {
    id: string; block: BlockCraft.BlockComponent; host: HTMLElement; surface: HTMLElement
    left: string; top: string; width: string; height: string
    stretch: boolean
    unit?: {target: HTMLElement; start: number; width: number; resolve: () => number}
    wordArt?: ReturnType<typeof createWordArtResizePreview>
  }[] = []

  override ngOnInit(): void {
    super.ngOnInit()
    this.destroyRef.onDestroy(() => this.releaseMemberAutoFit())
    this.doc.readonlyManager.stateChange$.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncResizeAvailability())
    this.doc.afterInit(() => this.syncResizeAvailability())
    this.onPropsChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(changes => {
      if (!changes.has('width')) return
      // Ratio members may keep exactly the same wr/ar during group resize.
      // Their reference plane still changed, including remote edits and Undo.
      for (const id of this.doc.model.getChildrenIds(this.id)) {
        this.doc.getBlockById(id)?.changeDetectorRef.markForCheck()
      }
    })
  }

  private syncResizeAvailability(): void {
    if (!this.doc.model.exists(this.id)) return
    const reason = this.doc.readonlyManager.containsReadonly(this.id)
      ? '组内含锁定内容，无法调整整体尺寸。请先解锁相关内容。' : ''
    if (reason === this.resizeDisabledReason) return
    const interrupted = !!reason && this.memberViews.length > 0
    this.resizeDisabledReason = reason
    // Cancel immediately, including a remote lock received between pointer frames.
    if (this.resizer) this.resizer.resizeDisabledReason = reason
    this.resizeTooltip?.hide()
    if (interrupted) this.notifyResizeLimit('组内内容已锁定，本次尺寸调整已取消。请解锁后重试。')
    this.changeDetectorRef.markForCheck()
  }

  private notifyResizeLimit(message: string | null): void {
    if (this.resizeFeedback === message) return
    this.resizeFeedback = message
    if (message) this.doc.ngZone.run(() => this.doc.messageService.info(message))
  }

  protected readonly resizeMaxWidth = () => {
    if (this.isAbsolute) return null
    const container = this.placementContainer
    if (!container) return null
    const style = getComputedStyle(container)
    const width = container.clientWidth -
      (Number.parseFloat(style.paddingLeft) || 0) -
      (Number.parseFloat(style.paddingRight) || 0)
    return width > 0 ? width : null
  }

  protected readonly resizeCalculator: ShapeResizeCalculator = (handle, start, dx, dy, maxWidth) => {
    if (!this.resizeSnapshot) return start
    // Flow CSS can constrain the displayed box without changing its model plane.
    // Start dragging at that visible edge, but scale members from their original
    // model dimensions so preview and the coordinator commit remain identical.
    // Returning to the pointer origin must also retain oversized model geometry.
    let request = dx === 0 && dy === 0
      ? start
      : calculateImageResize(handle, this.resizeStartBox ?? start, dx, dy, maxWidth)
    const requestedBox = request
    if (this.resizeStartBox && handle.includes('-')) {
      // A clipped flow frame may have a different ratio from the model plane.
      // Corners still scale the original composition uniformly into the box.
      const scale = Math.min(request.width / start.width, request.height / start.height)
      request = {...request, width: start.width * scale, height: start.height * scale}
    }
    const constrained = this.constrainScale(request.width / start.width, request.height / start.height)
    request = {...request, width: start.width * constrained.sx, height: start.height * constrained.sy}
    // Re-anchor after constraining the request, not at the last pointer frame.
    request.offsetX += handle.includes('west') ? requestedBox.width - request.width : 0
    request.offsetY += handle.includes('north') ? requestedBox.height - request.height : 0
    let feedback: string | null = null
    if (constrained.limit) feedback = constrained.limit === 'min'
      ? '组内对象已达到最小尺寸，组合已停在可缩小的边界。'
      : '组内对象已达到最大尺寸，组合已停在可放大的边界。'
    else if (dx !== 0 || dy !== 0) {
      const shrinkingWidth = handle.includes('east') ? dx < 0 : handle.includes('west') && dx > 0
      const shrinkingHeight = handle.includes('south') ? dy < 0 : handle.includes('north') && dy > 0
      const corner = handle.includes('-')
      if (Number.isFinite(maxWidth) &&
        calculateImageResize(handle, this.resizeStartBox ?? start, dx, dy).width > maxWidth! + .01) {
        feedback = '已达到正文可用宽度，无法继续加宽组合。'
      } else if (
        (requestedBox.width <= 30 && (shrinkingWidth || corner && shrinkingHeight)) ||
        (!corner && requestedBox.height <= 30 && shrinkingHeight)
      ) feedback = '已达到组合的最小尺寸，无法继续缩小。'
    }
    // Re-arm after leaving the boundary, even within the same pointer gesture.
    this.notifyResizeLimit(feedback)
    const scaled = scaleObjectGroupMembers(this.resizeMembers,
      request.width / start.width, request.height / start.height)
    if (!scaled) return this.previewBox ?? start
    const bounds = objectGroupResizeBounds(scaled, !this.isAbsolute)
    const left = bounds?.left ?? 0
    const top = bounds?.top ?? 0
    const byId = new Map(scaled.map(object => [object.id, object]))
    const fonts = this.scaleFonts(request.width / start.width, request.height / start.height)
    for (const view of this.memberViews) {
      const object = byId.get(view.id)
      if (!object) continue
      view.host.style.left = `${object.x - left}px`
      view.host.style.top = `${object.y - top}px`
      view.surface.style.width = `${object.width}px`
      view.surface.style.height = `${object.height}px`
      view.wordArt?.update(object.width, object.height, fonts.get(view.id)?.fontSize)
      if (view.unit) {
        view.unit.target.style.setProperty('--u', `${view.unit.start * object.width / view.unit.width}px`)
      }
      if (object.flavour === 'image') view.surface.toggleAttribute('data-bc-image-resize-stretch',
        Math.abs(request.width / start.width - request.height / start.height) > .0001)
    }
    this.resizeRequest = request
    return this.previewBox = {
      width: bounds ? bounds.right - left : request.width,
      height: bounds ? bounds.bottom - top : request.height,
      offsetX: request.offsetX + left,
      offsetY: request.offsetY + top,
    }
  }

  protected get isAbsolute(): boolean {
    return this.doc.placement.getState(this.id).mode === 'absolute'
  }

  protected onResizeStart(): void {
    this.releaseMemberAutoFit()
    this.resizeSnapshot = null
    this.resizeStartBox = null
    this.resizeRequest = this.previewBox = null
    this.resizeMembers = []
    this.memberViews = []
    this.resizeFeedback = null
    this.syncResizeAvailability()
    const ids = this.doc.model.getChildrenIds(this.id)
    if (ids.some(id => this.doc.readonlyManager.isReadonly(id) ||
      this.doc.readonlyManager.containsReadonly(id))) return
    if (!this.isAbsolute) {
      // One layout read per gesture; pointer frames use only cached geometry.
      const style = getComputedStyle(this.hostElement)
      const width = Number.parseFloat(style.width)
      const height = Number.parseFloat(style.height)
      if (width > 0 && height > 0) {
        this.resizeStartBox = {width, height, offsetX: 0, offsetY: 0}
      }
    }
    for (const id of ids) {
      const geometry = resolvePlacementObjectGeometry(this.doc, id, {referenceWidth: this.groupProps.width})
      if (!geometry) return
      this.resizeMembers.push({...geometry,
        format: this.doc.schemas.get(geometry.flavour, false)?.metadata.objectFormat,
      })
      const block = this.doc.getBlockById(id)
      const host = block?.hostElement
      if (!host) continue
      // Resolve surfaces once at the gesture boundary; pointer frames only write
      // cached styles. Text boxes reflow; WordArt owns its text/projection preview.
      const surface = host.querySelector<HTMLElement>('[data-bc-print-visual-surface], [data-bc-object-surface]') ?? host
      // Cards own their model-derived unit; do not infer live values from the
      // DOM during cancellation or concurrent changes. Personnel cards retain
      // their independent content scale and native reflow semantics.
      const card = (geometry.flavour === 'date-card' || geometry.flavour === 'weather') &&
        block && 'contentScale' in block ? block as typeof block & {readonly contentScale: number} : null
      const unitTarget = card ? host.querySelector<HTMLElement>('[data-bc-selection-interaction-frame]') : null
      const unit = card?.contentScale ?? 0
      this.memberViews.push({id, block: block!, host, surface,
        left: host.style.left, top: host.style.top,
        width: surface.style.width, height: surface.style.height,
        stretch: surface.hasAttribute('data-bc-image-resize-stretch'),
        ...(geometry.flavour === 'word-art' ? {
          wordArt: createWordArtResizePreview(surface, () => block!.props),
        } : {}),
        ...(unitTarget && card && Number.isFinite(unit) && unit > 0 ? {
          unit: {target: unitTarget, start: unit, width: geometry.width, resolve: () => card.contentScale},
        } : {}),
      })
    }
    this.constrainScale = createObjectGroupScaleConstraint(this.resizeMembers)
    this.scaleFonts = createObjectGroupFontScale(this.resizeMembers)
    this.resizeSnapshot = this.geometrySnapshot()
    this.resumeMemberAutoFit = this.memberViews.map(view => pauseObjectResizePreview(view.block))
  }

  private releaseMemberAutoFit(): void {
    this.resumeMemberAutoFit.forEach(resume => resume())
    this.resumeMemberAutoFit = []
  }

  protected onResizeEnd(): void {
    const stale = this.resizeSnapshot !== this.geometrySnapshot()
    for (const view of this.memberViews) {
      view.host.style.left = view.left
      view.host.style.top = view.top
      view.surface.style.width = view.width
      view.surface.style.height = view.height
      view.wordArt?.restore(stale)
      view.surface.toggleAttribute('data-bc-image-resize-stretch', view.stretch)
      if (view.unit) view.unit.target.style.setProperty('--u', `${view.unit.resolve()}px`)
      if (stale) {
        const live = resolvePlacementObjectGeometry(this.doc, view.id,
          {referenceWidth: this.groupProps.width})
        if (live) {
          view.host.style.left = `${live.x}px`
          view.host.style.top = `${live.y}px`
          view.surface.style.width = `${live.width}px`
          if (view.height) view.surface.style.height = `${live.height}px`
        }
      }
    }
    this.memberViews = []
    this.hostElement.style.width = `${this.groupProps.width}px`
    this.hostElement.style.height = `${this.groupProps.height}px`
    this.releaseMemberAutoFit()
  }

  protected onResizeCommit(event: ShapeResizeCommit): void {
    const current = this.groupProps
    const request = this.resizeRequest ?? event
    if (!this.isReadonly && this.resizeSnapshot === this.geometrySnapshot() &&
      (Math.abs(request.width - current.width) > .01 || Math.abs(request.height - current.height) > .01)) {
      const position = this.doc.placement.getState(this.id)
      this.doc.crud.undoManager.stopCapturing()
      try {
        const hadAutoFit = this.resizeMembers.some(member => member.props['textAutoFit'] === 'resize-shape')
        const committed = this.doc.placement.updateObjectGeometry(this, {
          width: request.width,
          height: request.height,
          ...(this.isAbsolute ? {position: storeBlockPosition({
            x: position.x + request.offsetX,
            y: position.y + request.offsetY,
          })} : {}),
        })
        if (committed && hadAutoFit) {
          this.notifyResizeLimit('已将组内自适应对象改为固定尺寸，可撤销恢复。')
        }
      } finally {
        this.doc.crud.undoManager.stopCapturing()
      }
    }
    this.hostElement.style.width = `${this.groupProps.width}px`
    this.hostElement.style.height = `${this.groupProps.height}px`
    this.resizeSnapshot = null
    this.resizeStartBox = null
    this.resizeMembers = []
    this.resizeRequest = this.previewBox = null
    this.changeDetectorRef.markForCheck()
  }

  private geometrySnapshot(): string {
    if (!this.doc.model.exists(this.id)) return ''
    return JSON.stringify([this.doc.model.getParentId(this.id), this.props,
      this.doc.model.getChildrenIds(this.id).map(id => [id, this.doc.model.getProps(id)])])
  }

  get groupProps() {
    return normalizeBlockObjectGroupProps(this.props)
  }
}
