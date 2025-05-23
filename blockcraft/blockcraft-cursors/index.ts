import {Awareness} from "y-protocols/awareness";
import {getRandomDarkColor, throttle} from "../global";
import {IBlockSelectionJSON, FakeRange} from "../framework";
import {debounceTime, takeUntil} from "rxjs";

interface Config {
  throttleTime?: number
}

class Cursor {

  private _nameSpan: HTMLElement
  private _color = getRandomDarkColor(.4)
  private _fakeCursor: FakeRange | null = null

  constructor(private readonly doc: BlockCraft.Doc, private user: { id: string, name: string }) {
    const nameSpan = document.createElement('span')
    nameSpan.innerText = user.name
    nameSpan.classList.add('blockcraft-cursor-tag')
    nameSpan.style.cssText = ` background-color: ${this._color};`
    this._nameSpan = nameSpan
  }

  public setColor(color: string) {
    this._color = color
  }

  updatePosition(selection: IBlockSelectionJSON | null) {
    if (this._fakeCursor) {
      this._fakeCursor.destroy()
      this._fakeCursor = null
    }
    if (!selection) return
    try {
      this._fakeCursor = this.doc.selection.createFakeRange(selection, {
        bgColor: this._color,
        minCursorWidth: 2
      })
      this._fakeCursor.fakeSpans[0].firstElementChild!.appendChild(this._nameSpan)
    } catch (e) {
      this.doc.logger.warn(`cursor error: ${e}`)
    }
  }

  destroy() {
    this._nameSpan.remove()
    this._fakeCursor?.destroy()
  }

}

export class BlockCraftCursors {
  cursors = new Map<number, Cursor>()

  constructor(private readonly doc: BlockCraft.Doc,
              private readonly awareness: Awareness,
              config?: Config) {

    this.doc.selection.selectionChange$.pipe(takeUntil(this.doc.onDestroy$), debounceTime(100)).subscribe(selection => {
      this.awareness.setLocalStateField('cursor', selection?.toJSON())
    })

    this.awareness.on('change', throttle((changes: any, origin: any) => {
        if (origin === 'local') return

        const states = this.awareness.getStates()
        if (changes.added.length) {
          changes.added.forEach((id: number) => {
            const state = states.get(id)!
            if (!('user' in state)) return
            const user = state['user']
            this.cursors.set(id, new Cursor(this.doc, user))

            if ('cursor' in state) {
              this.doc.afterInit(() => {
                this.cursors.get(id)?.updatePosition(state['cursor'])
              })
            }
          })
        }

        if (changes.updated.length) {
          changes.updated.forEach((id: number) => {
            const state = states.get(id)!
            this.cursors.get(id)?.updatePosition(state['cursor'])
          })
        }

        if (changes.removed.length) {
          changes.removed.forEach((id: number) => {
            this.cursors.get(id)?.destroy()
            this.cursors.delete(id)
          })
        }
      }, config?.throttleTime || 0)
    )

  }


}
