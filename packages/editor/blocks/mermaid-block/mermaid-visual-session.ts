import {MermaidWysiwygEditor, type TextEdit} from '@visimer/core'
import {MermaidCanvasView, type MermaidLike} from '@visimer/dom'
import {isMac} from 'lib0/environment'

/** 全屏局部投影；持久数据、写入权限和历史均由宿主拥有。 */
export interface MermaidVisualHost {
  read(): string
  write(base: string, edits: readonly TextEdit[]): boolean
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
}

export class MermaidVisualSession {
  private readonly editor: MermaidWysiwygEditor
  private view?: MermaidCanvasView
  private surface?: HTMLDivElement
  private applying = false
  private disposed = false
  private mountGeneration = 0
  private lastPreview: {code: string; svg: string} | null = null

  constructor(private container: HTMLElement, private mermaid: MermaidLike, private host: MermaidVisualHost, private onRendered: (ok: boolean) => void) {
    const session = this
    this.editor = new class extends MermaidWysiwygEditor {
      // 上游没有关闭历史的选项。所有投影更新合并为一个内部记录，
      // 用户撤销只调用宿主，避免长期编辑积累第二套历史。
      constructor() { super({code: host.read(), coalesceMs: Infinity}) }
      override applyEdits(edits: TextEdit[]): void {
        if (session.disposed || !edits.length) return
        session.applying = true
        try { host.write(this.code, edits) }
        finally {
          session.applying = false
          session.syncCode()
        }
      }
      override undo(): boolean { host.undo(); return true }
      override redo(): boolean { host.redo(); return true }
      override get canUndo(): boolean { return host.canUndo() }
      override get canRedo(): boolean { return host.canRedo() }
    }()
    this.mount()
  }

  private syncCode(): void {
    this.editor.setCode(this.host.read(), 'code')
  }

  sync(): boolean {
    if (this.disposed || this.applying || this.host.read() === this.editor.code) return false
    // 外部源码/协同/撤销更新取消旧标签编辑，禁止旧输入会话覆盖新文本。
    const editing = !!this.surface?.querySelector('[contenteditable="true"]')
    if (editing) this.unmount()
    this.syncCode()
    if (editing) this.mount()
    return editing
  }

  private mount(): void {
    const generation = ++this.mountGeneration
    this.surface = this.container.ownerDocument.createElement('div')
    this.surface.className = 'mermaid-visual-surface'
    this.surface.setAttribute('data-bc-native-input', '')
    this.surface.contentEditable = 'false'
    this.surface.addEventListener('keydown', event => {
      if (event.isComposing) { event.stopImmediatePropagation(); return }
      if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.stopImmediatePropagation()
        this.flush()
        if (event.shiftKey) this.host.redo()
        else this.host.undo()
      }
    }, true)
    this.container.append(this.surface)
    this.view = new MermaidCanvasView({
      editor: this.editor, container: this.surface, mermaid: {
        initialize: config => this.mermaid.initialize(config),
        parse: (code, options) => this.mermaid.parse(code, options),
        render: async (id, code) => {
          if (this.disposed || generation !== this.mountGeneration) throw new DOMException('Canvas disposed', 'AbortError')
          const result = await this.mermaid.render(id, code)
          // 上游 render 在 await 后不检查 destroy，继续执行会重新创建 Observer。
          // 拒绝结果，让它走错误分支，禁止 bindSvg 在卸载后复活。
          if (this.disposed || generation !== this.mountGeneration) throw new DOMException('Canvas disposed', 'AbortError')
          if (code === this.editor.code) this.lastPreview = {code, svg: result.svg}
          return result
        },
      },
      debounceMs: 200, panZoom: true, accentColor: 'var(--bc-active-color)',
    })
    const view = this.view
    view.on('render', ({ok}) => {
      if (!this.disposed && this.view === view) this.onRendered(ok)
    })
  }

  snapshot(): {code: string; svg: string} | null { return this.lastPreview }

  private unmount(): void {
    ++this.mountGeneration
    // 先移除旧容器；上游已在途的异步 render 只能写入脱离文档的 DOM。
    this.surface?.remove()
    this.view?.destroy()
    this.view = undefined
    this.surface = undefined
  }

  zoomBy(factor: number): void { this.view?.zoomBy(factor) }

  flush(): void {
    const input = this.surface?.querySelector<HTMLElement>('[contenteditable="true"]')
    // 上游的公开交互以 Enter 完成标签编辑；先提交尚未到防抖时间的输入。
    input?.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}))
  }

  destroy(): void {
    this.disposed = true
    this.unmount()
    this.lastPreview = null
  }
}
