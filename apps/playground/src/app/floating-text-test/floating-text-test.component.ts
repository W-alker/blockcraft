import {AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, NgZone, OnDestroy, ViewChild, inject} from '@angular/core'
import {EditorComponent, IBlockSnapshot} from '@ccc/blockcraft'
import {Subscription, auditTime, fromEvent, merge} from 'rxjs'

@Component({
  selector: 'bc-floating-text-test',
  standalone: true,
  imports: [EditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './floating-text-test.component.html',
  styleUrl: './floating-text-test.component.scss',
})
export class FloatingTextTestComponent implements AfterViewInit, OnDestroy {
  @ViewChild(EditorComponent) editor!: EditorComponent
  private readonly zone = inject(NgZone)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly subscriptions = new Subscription()
  readonly stress = new URLSearchParams(location.search).get('scale') === 'stress'
  readonly fixedCount = this.stress ? 1000 : 60
  readonly autoCount = this.stress ? 24 : 4
  readonly longText = '向上滚动时，这一段也应该完整出现。可以双击编辑文字，观察文本框随内容变高。'.repeat(18)
  ready = false
  error = ''
  status = '正在准备测试文档…'
  mountedFixed = 0
  mountedAuto = 0
  mountedGroups = 0
  scrollTop = 0
  autoFit = true
  targetMounted = false
  targetFit = '—'
  private layoutId = ''
  private targetId = ''
  private targetTextId = ''
  private groupId = ''
  private fixedIds = new Set<string>()
  private autoIds = new Set<string>()
  private surface?: HTMLElement

  private get doc() { return this.editor.doc }
  private get viewport(): HTMLElement { return this.editor.container.nativeElement }

  ngAfterViewInit(): void {
    // 等子编辑器完成自己的视图初始化，再在 Angular 外构建真实文档。
    queueMicrotask(() => {
      if (this.subscriptions.closed) return
      this.zone.runOutsideAngular(() => {
        try {
          const snapshot = this.createFixture()
          this.surface = document.createElement('div')
          this.surface.className = 'floating-test-surface'
          this.viewport.append(this.surface)
          this.doc.config.scrollContainer = this.viewport
          this.doc.initBySnapshot(snapshot, this.surface)
          this.targetTextId = this.doc.model.getChildrenIds(this.targetId)[0]
          const detachScale = this.doc.viewScale.attach(this.surface)
          this.doc.onDestroy(detachScale)
          this.subscriptions.add(merge(
            fromEvent(this.viewport, 'scroll', {passive: true}),
            this.doc.virtualization.viewChange$,
            this.doc.model.contentChange$,
          ).pipe(auditTime(150)).subscribe(() => this.refreshStats()))
          this.ready = true
          this.status = '已就绪。先点击“从主文本框下方开始”，再向上滚动。'
          this.refreshStats()
        } catch (error) {
          this.zone.run(() => {
            this.error = error instanceof Error ? error.message : String(error)
            this.cdr.markForCheck()
          })
        }
      })
    })
  }

  private createFixture(): IBlockSnapshot {
    const schemas = this.doc.schemas
    const fixed = Array.from({length: this.fixedCount}, (_, index) => {
      const block = schemas.createSnapshot('text-box', [`固定尺寸 ${index + 1}`, {
        position: `100 ${80 + index * (this.stress ? 50 : 180)}`,
        width: 145, height: 42, textFont: '14px 400', textPadding: '4 8', textAutoFit: 'none',
      }])
      this.fixedIds.add(block.id)
      return block
    })
    const auto = Array.from({length: this.autoCount}, (_, index) => {
      const block = index === 1
        ? schemas.createSnapshot('word-art', ['艺术字也会随内容调整尺寸。'.repeat(12), {
            position: '300 2400', width: 270, height: 100, textFont: '24px 600', textAutoFit: 'resize-shape',
          }])
        : schemas.createSnapshot('text-box', [index === 0 ? this.longText : `自适应文本框 ${index + 1}。`.repeat(18), {
            position: index === 2 ? '640 1600' : `300 ${index === 0 ? 240 : 600 + index * 2000}`,
            width: index === 2 ? 100 : 270, height: index === 2 ? 320 : 120,
            textFont: '18px 400', textPadding: '8 12', textAutoFit: 'resize-shape',
            textDirection: index === 2 ? 'vertical-rl' : 'horizontal',
          }])
      this.autoIds.add(block.id)
      return block
    })
    this.targetId = auto[0].id
    const groupText = schemas.createSnapshot('text-box', ['组合内的自适应文字。'.repeat(16), {
      position: '0 0', width: 240, height: 100, textFont: '17px 400', textPadding: '8 12', textAutoFit: 'resize-shape',
    }])
    const groupShape = schemas.createSnapshot('shape', ['rectangle'])
    Object.assign(groupShape.props, {position: '0 440', width: 240, height: 50})
    const group = schemas.createSnapshot('object-group', [{width: 250, height: 500}, [groupText, groupShape]])
    group.props['position'] = '640 300'
    this.groupId = group.id
    const layout = schemas.createSnapshot('placement-layout', [[...fixed, ...auto, group]])
    this.layoutId = layout.id
    const paragraphs = Array.from({length: this.stress ? 1600 : 360}, (_, index) =>
      schemas.createSnapshot('paragraph', [`${String(index + 1).padStart(4, '0')}`]))
    return schemas.createSnapshot('root', [this.editor.rootId, [layout, ...paragraphs]])
  }

  private refreshStats(): void {
    if (!this.ready || this.subscriptions.closed) return
    // 只遍历已挂载对象；滚动期间不扫描全部模型，也不读取布局尺寸。
    const ids = this.doc.vm.get(this.layoutId)?.instance.childrenRenderRef?.ids ?? []
    let fixed = 0
    let auto = 0
    for (const id of ids) {
      if (this.fixedIds.has(id)) fixed++
      if (this.autoIds.has(id)) auto++
    }
    const props = this.doc.model.getProps(this.targetId)
    this.zone.run(() => {
      this.mountedFixed = fixed
      this.mountedAuto = auto
      this.mountedGroups = this.doc.vm.isMounted(this.groupId) ? 1 : 0
      this.scrollTop = Math.round(this.viewport.scrollTop)
      this.autoFit = props?.['textAutoFit'] === 'resize-shape'
      this.targetMounted = this.doc.vm.isMounted(this.targetId)
      this.targetFit = typeof props?.['textFit'] === 'number' ? `${Math.round(props['textFit'])} px` : '—'
      this.cdr.markForCheck()
    })
  }

  scrollTo(where: 'top' | 'bottom' | 'target' | 'below'): void {
    if (!this.ready) return
    this.doc.selection.blur()
    if (where === 'top' || where === 'bottom') {
      this.viewport.scrollTop = where === 'top' ? 0 : this.viewport.scrollHeight
    } else {
      const props = this.doc.model.getProps(this.targetId)
      if (!props) {
        this.status = '主文本框已被删除，请撤销或刷新测试页面。'
        return
      }
      const y = Number(String(props['position']).split(' ')[1]) || 0
      const height = this.autoFit && typeof props['textFit'] === 'number' ? props['textFit'] : Number(props['height'])
      const rootTop = this.doc.root.hostElement.getBoundingClientRect().top
        - this.viewport.getBoundingClientRect().top + this.viewport.scrollTop
      this.viewport.scrollTop = rootTop + y + (where === 'below' ? height + 80 : -40)
    }
    this.status = where === 'below' ? '现在位于主文本框下方。请在编辑区向上滚动，检查文本框尾部是否直接出现。' : '已跳转，可以继续滚动或编辑。'
    this.refreshStats()
  }

  changeText(long: boolean): void {
    if (!this.ready) return
    if (!this.doc.model.getProps(this.targetTextId)) {
      this.status = '主文本框的文字已被删除，请撤销或刷新测试页面。'
      return
    }
    this.doc.crud.replaceText(this.targetTextId, 0, this.doc.model.getTextLength(this.targetTextId), long ? this.longText : '短文本：高度应立即缩小。')
    this.status = `主文本框已换为${long ? '长' : '短'}文本；即使不在屏幕内，也可检查自适应尺寸是否更新。`
  }

  toggleFit(): void {
    if (!this.ready) return
    if (!this.doc.model.getProps(this.targetId)) {
      this.status = '主文本框已被删除，请撤销或刷新测试页面。'
      return
    }
    this.doc.crud.updateBlockProps(this.targetId, {textAutoFit: this.autoFit ? 'none' : 'resize-shape'})
    this.refreshStats()
    this.status = `主文本框已切换为${this.autoFit ? '内容自适应' : '固定尺寸'}。移到文档底部，可观察它是否仍挂载。`
  }

  undo(): void { this.doc.crud.undoManager.undo() }
  redo(): void { this.doc.crud.undoManager.redo() }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
    // EditorComponent 负责 Doc；本页拥有未接协同服务的 Y.Doc。
    const yDoc = this.editor?.doc?.yDoc
    if (yDoc) this.editor.doc.onDestroy(() => yDoc.destroy())
  }
}
