import {Subscription} from 'rxjs'
import {BlockReadonlyError} from '../../../doc/block-readonly.types'
import type {DocUndoItemToken} from '../../../doc/undoManger'
import type {Transaction} from 'yjs'

const arrowKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

/** Internal gesture lifetime: leading feedback, frame batching and isolated undo. */
export class PlacementKeyboardNudge {
  private frame = 0
  private dx = 0
  private dy = 0
  private committing = false
  private closed = false
  private undoToken: DocUndoItemToken | null = null
  private readonly pressed = new Set<string>()
  private readonly subscriptions = new Subscription()

  constructor(
    private readonly doc: BlockCraft.Doc,
    private readonly view: Window,
    private readonly isCurrent: () => boolean,
    private readonly commit: (dx: number, dy: number) => boolean,
    private readonly release: () => void,
  ) {
    // Every frame closes its undo boundary. Ignore empty housekeeping
    // transactions, but cancel stale queued movement after external mutations.
    doc.yDoc.on('afterTransaction', this.onExternalTransaction)
    doc.ngZone.runOutsideAngular(() => {
      view.addEventListener('keyup', this.onKeyUp, true)
      view.addEventListener('keydown', this.onKeyDown, true)
      view.addEventListener('pointerdown', this.finish, true)
      view.addEventListener('blur', this.finish)
      view.addEventListener('focusout', this.finish, true)
    })
    if (doc.selection.selectionChange$) {
      this.subscriptions.add(doc.selection.selectionChange$.subscribe(() => {
        if (!this.committing && !isCurrent()) this.end(false)
      }))
    }
    this.subscriptions.add(doc.readonlySwitch$.subscribe(readonly => {
      if (readonly) this.end(false)
    }))
  }

  get active(): boolean { return !this.closed }

  add(key: string): void {
    if (this.closed) return
    this.pressed.add(key)
    this.dx += key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0
    this.dy += key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0
    if (this.frame) return
    this.flush()
    this.scheduleFrame()
  }

  end(flush: boolean): void {
    if (this.closed) return
    try {
      if (flush) this.flush()
    } finally {
      if (!this.closed) {
        this.closed = true
        this.view.cancelAnimationFrame(this.frame)
        this.frame = 0
        this.dx = this.dy = 0
        this.undoToken = null
        this.doc.yDoc.off('afterTransaction', this.onExternalTransaction)
        this.view.removeEventListener('keyup', this.onKeyUp, true)
        this.view.removeEventListener('keydown', this.onKeyDown, true)
        this.view.removeEventListener('pointerdown', this.finish, true)
        this.view.removeEventListener('blur', this.finish)
        this.view.removeEventListener('focusout', this.finish, true)
        this.subscriptions.unsubscribe()
        this.release()
      }
    }
  }

  private scheduleFrame(): void {
    if (this.closed) return
    this.doc.ngZone.runOutsideAngular(() => {
      this.frame = this.view.requestAnimationFrame(() => {
        this.frame = 0
        if (this.dx || this.dy) {
          this.flush()
          this.scheduleFrame()
        }
      })
    })
  }

  private flush(): void {
    if (this.closed || (!this.dx && !this.dy)) return
    if (!this.isCurrent()) { this.end(false); return }
    const {dx, dy} = this
    this.dx = this.dy = 0
    this.committing = true
    try {
      const captured = this.doc.ngZone.run(() => this.doc.crud.undoManager.captureUndoItem(
        () => this.commit(dx, dy), this.undoToken,
      ))
      this.undoToken = captured.token
      if (!captured.result) this.end(false)
    } catch (error) {
      this.end(false)
      if (!(error instanceof BlockReadonlyError)) throw error
    } finally {
      this.committing = false
    }
  }

  private readonly onExternalTransaction = (transaction: Transaction) => {
    if (!this.committing && transaction.changed.size) this.end(false)
  }
  private readonly finish = () => this.end(true)
  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.pressed.delete(event.key)
    if (!this.pressed.size) this.end(true)
  }
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!arrowKeys.has(event.key) || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) this.end(true)
  }
}
