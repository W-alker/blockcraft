import {ChangeDetectionStrategy, Component} from '@angular/core'
import {takeUntilDestroyed} from '@angular/core/rxjs-interop'
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
import {objectGroupResizeBounds, scaleObjectGroupMembers, type ObjectGroupResizeMember} from '../../framework/modules/object/block-placement/group-resize'

@Component({
  selector: 'div.object-group-block',
  standalone: true,
  imports: [ShapeResizerComponent],
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
        [maxWidthResolver]="objectMaxWidthResolver"
        [resizeCalculator]="resizeCalculator"
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
  private resizeSnapshot: string | null = null
  private resizeMembers: ObjectGroupResizeMember[] = []
  private resizeRequest: ShapeResizeBox | null = null
  private previewBox: ShapeResizeBox | null = null
  private memberViews: {
    id: string; host: HTMLElement; surface: HTMLElement
    left: string; top: string; width: string; height: string
    stretch: boolean
  }[] = []

  override ngOnInit(): void {
    super.ngOnInit()
    this.onPropsChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(changes => {
      if (!changes.has('width')) return
      // Ratio members may keep exactly the same wr/ar during group resize.
      // Their reference plane still changed, including remote edits and Undo.
      for (const id of this.doc.model.getChildrenIds(this.id)) {
        this.doc.getBlockById(id)?.changeDetectorRef.markForCheck()
      }
    })
  }

  protected readonly resizeCalculator: ShapeResizeCalculator = (handle, start, dx, dy, maxWidth) => {
    if (!this.resizeSnapshot) return start
    const request = calculateImageResize(handle, start, dx, dy, maxWidth)
    const scaled = scaleObjectGroupMembers(this.resizeMembers,
      request.width / start.width, request.height / start.height)
    if (!scaled) return this.previewBox ?? start
    const bounds = objectGroupResizeBounds(scaled, !this.isAbsolute)
    const left = bounds?.left ?? 0
    const top = bounds?.top ?? 0
    const byId = new Map(scaled.map(object => [object.id, object]))
    for (const view of this.memberViews) {
      const object = byId.get(view.id)
      if (!object) continue
      view.host.style.left = `${object.x - left}px`
      view.host.style.top = `${object.y - top}px`
      view.surface.style.width = `${object.width}px`
      view.surface.style.height = `${object.height}px`
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
    this.resizeSnapshot = null
    this.resizeRequest = this.previewBox = null
    this.resizeMembers = []
    this.memberViews = []
    const ids = this.doc.model.getChildrenIds(this.id)
    if (ids.some(id => this.doc.readonlyManager.isReadonly(id) ||
      this.doc.readonlyManager.containsReadonly(id))) return
    for (const id of ids) {
      const geometry = resolvePlacementObjectGeometry(this.doc, id, {referenceWidth: this.groupProps.width})
      if (!geometry) return
      this.resizeMembers.push({...geometry,
        format: this.doc.schemas.get(geometry.flavour, false)?.metadata.objectFormat,
      })
      const host = this.doc.getBlockById(id)?.hostElement
      if (!host) continue
      // Resolve surfaces once at the gesture boundary; pointer frames only write
      // cached styles. Text lays out natively and never receives a font scale.
      const surface = host.querySelector<HTMLElement>('[data-bc-print-visual-surface], [data-bc-object-surface]') ?? host
      this.memberViews.push({id, host, surface,
        left: host.style.left, top: host.style.top,
        width: surface.style.width, height: surface.style.height,
        stretch: surface.hasAttribute('data-bc-image-resize-stretch'),
      })
    }
    this.resizeSnapshot = this.geometrySnapshot()
  }

  protected onResizeEnd(): void {
    const stale = this.resizeSnapshot !== this.geometrySnapshot()
    for (const view of this.memberViews) {
      view.host.style.left = view.left
      view.host.style.top = view.top
      view.surface.style.width = view.width
      view.surface.style.height = view.height
      view.surface.toggleAttribute('data-bc-image-resize-stretch', view.stretch)
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
  }

  protected onResizeCommit(event: ShapeResizeCommit): void {
    const current = this.groupProps
    const request = this.resizeRequest ?? event
    if (!this.isReadonly && this.resizeSnapshot === this.geometrySnapshot() &&
      (Math.abs(request.width - current.width) > .01 || Math.abs(request.height - current.height) > .01)) {
      const position = this.doc.placement.getState(this.id)
      this.doc.crud.undoManager.stopCapturing()
      try {
        this.doc.placement.updateObjectGeometry(this, {
          width: request.width,
          height: request.height,
          ...(this.isAbsolute ? {position: storeBlockPosition({
            x: position.x + request.offsetX,
            y: position.y + request.offsetY,
          })} : {}),
        })
      } finally {
        this.doc.crud.undoManager.stopCapturing()
      }
    }
    this.hostElement.style.width = `${this.groupProps.width}px`
    this.hostElement.style.height = `${this.groupProps.height}px`
    this.resizeSnapshot = null
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
