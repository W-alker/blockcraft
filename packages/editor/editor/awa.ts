import { Awareness } from 'y-protocols/awareness';
import { Subject, takeUntil } from 'rxjs';
import {debounce, getRandomDarkColor} from "../global";
import {FakeRange, IBlockSelectionJSON} from "../framework";

interface Config {
  throttleTime?: number;
}

interface IAwarenessState {
  cursor: IBlockSelectionJSON | null;
  user: {
    id: string,
    name: string
  };

  [key: string]: any
}

type clientId = number;

class Cursor {

  private _nameSpan: HTMLElement;
  private _color = getRandomDarkColor(.4);
  private _fakeCursor: FakeRange | null = null;

  constructor(private readonly doc: BlockCraft.Doc, private user: { id: string, name: string }) {
    const nameSpan = document.createElement('span');
    nameSpan.innerText = user.name;
    nameSpan.classList.add('blockcraft-cursor-tag');
    nameSpan.style.cssText = ` background-color: ${this._color};`;
    this._nameSpan = nameSpan;
  }

  public setColor(color: string) {
    this._color = color;
  }

  updatePosition(selection: IBlockSelectionJSON | null) {
    if (this._fakeCursor) {
      this._fakeCursor.destroy();
      this._fakeCursor = null;
    }
    if (!selection) return;
    try {
      this._fakeCursor = this.doc.selection.createFakeRange(selection, {
        bgColor: this._color,
        minCursorWidth: 2
      });
      this._fakeCursor.fakeSpans[0].firstElementChild!.appendChild(this._nameSpan);
    } catch (e) {
      this.doc.logger.warn(`update cursor error: ${e}`);
    }
  }

  destroy() {
    this._nameSpan.remove();
    this._fakeCursor?.destroy();
  }

}

export class BlockCraftAwareness {
  private cursors = new Map<clientId, Cursor>();
  private _states!: Map<clientId, IAwarenessState>

  private _localUser?: IAwarenessState['user'];

  get localUser() {
    return this._localUser;
  }

  public readonly onUserChange$ = new Subject<IAwarenessState['user'][]>();

  constructor(private readonly doc: BlockCraft.Doc,
              private readonly awareness: Awareness,
              config?: Config) {

    this.doc.selection.selectionChange$.pipe(takeUntil(this.doc.onDestroy$)).subscribe(debounce(selection => {
      this.awareness.setLocalStateField('cursor', selection?.toJSON());
    }, 100));

    this._states = this.awareness.getStates() as Map<clientId, IAwarenessState>;

    this.awareness.on('change', (changes: any, origin: any) => {
        // console.log('%c----------states change-------', 'color: #ff0000', this._states, changes);
        if (changes.added.length) {
          changes.added.forEach((id: number) => {
            const state = this._states.get(id)!;
            this.addCursor(id);

            if ('cursor' in state) {
              this.doc.afterInit(() => {
                this.cursors.get(id)?.updatePosition(state['cursor']);
              });
            }
          });

          this.onUserChange$.next(this.getUsers());
        }

        if (changes.updated.length && origin !== 'local') {
          changes.updated.forEach((id: number) => {
            const state = this._states.get(id);
            if (!state || !state.user) return;
            if (!this.cursors.has(id)) {
              this.addCursor(id);
            }
            this.cursors.get(id)?.updatePosition(state['cursor']);
          });
        }

        if (changes.removed.length) {
          changes.removed.forEach((id: number) => {
            this.removeCursor(id);
          });
          this.onUserChange$.next(this.getUsers());
        }
      }
    );

  }

  setLocalUser(user: IAwarenessState['user']) {
    this.awareness.setLocalStateField('user', this._localUser = user);
  }

  getUsers() {
    return Object.values(this._states).map(state => state.user);
  }

  protected addCursor(clientId: number) {
    const state = this._states.get(clientId)
    if (!state || !state.user || this._localUser?.id === state.user.id && this.cursors.has(clientId)) return;
    this.cursors.set(clientId, new Cursor(this.doc, state.user));
  }

  protected removeCursor(clientId: number) {
    this.cursors.get(clientId)?.destroy();
  }

  on(eventName: 'userChange', callback: (users: IAwarenessState['user'][]) => void) {
    switch (eventName) {
      case 'userChange':
        this.onUserChange$.pipe(takeUntil(this.doc.onDestroy$)).subscribe(callback);
        break;
    }
  }


}
