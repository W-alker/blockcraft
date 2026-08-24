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
      this.contextChange$.next(captureBlockCraftAgentContext(this.doc as BlockCraftDoc))
    })
  }

  getContext(): DocumentAgentContext | null {
    return captureBlockCraftAgentContext(this.doc as BlockCraftDoc)
  }

  override destroy(): void {
    this.selectionSubscription?.unsubscribe()
    this.selectionSubscription = undefined
    this.contextChange$.complete()
  }
}
