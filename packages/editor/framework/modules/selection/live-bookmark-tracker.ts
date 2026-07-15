import {Subscription} from 'rxjs'
import {
  captureRelativeSelectionBookmark,
  RelativeSelectionBookmark,
} from './relative-bookmark'

export interface LiveSelectionBookmarkSnapshot {
  readonly revision: number
  readonly bookmark: RelativeSelectionBookmark | null
}

export class LiveSelectionBookmarkTracker {
  private revision = 0
  private bookmark: RelativeSelectionBookmark | null = null
  private readonly subscription: Subscription

  constructor(private readonly doc: BlockCraft.Doc) {
    this.subscription = doc.selection.changeObserve().subscribe(selection => {
      this.revision += 1
      this.bookmark = captureRelativeSelectionBookmark(selection, doc, this.bookmark)
    })
  }

  snapshot(): LiveSelectionBookmarkSnapshot {
    return {revision: this.revision, bookmark: this.bookmark}
  }

  isCurrent(revision: number): boolean {
    return revision === this.revision
  }

  destroy(): void {
    this.subscription.unsubscribe()
    this.bookmark = null
  }
}
