import {BehaviorSubject, type Subscription} from 'rxjs'
import {DocPlugin, type BlockCraftDoc} from '@ccc/blockcraft'
import type {DocumentAgentContext} from '../core/agent.types'
import {captureBlockCraftAgentContext} from './blockcraft-context-adapter'

export class DocumentAgentPlugin extends DocPlugin {
  override name = 'blockcraft-agent'

  readonly contextChange$ = new BehaviorSubject<DocumentAgentContext | null>(null)
  private selectionSubscription?: Subscription

  override init(): void {
    this.selectionSubscription = this.doc.selection.selectionChange$.subscribe(() => {
      this.publishContext()
    })
    // Document content is intentionally pulled on demand by getContext() when
    // the user sends a request. Re-capturing the full document on every Yjs
    // text/props event would repeatedly materialize a large context while the
    // user is typing. Selection changes remain eager because they change the
    // visible context scope and the fake-range affordance.
    this.publishContext()
  }

  getContext(): DocumentAgentContext | null {
    return captureBlockCraftAgentContext(this.doc as BlockCraftDoc)
  }

  override destroy(): void {
    this.selectionSubscription?.unsubscribe()
    this.selectionSubscription = undefined
    this.contextChange$.complete()
  }

  private publishContext(): void {
    this.contextChange$.next(captureBlockCraftAgentContext(this.doc as BlockCraftDoc))
  }
}
