import { Awareness } from 'y-protocols/awareness';
import { Subject, takeUntil } from 'rxjs';
import {debounce, getRandomDarkColor, getScrollContainer} from "../global";
import {FakeRange, ISelectionJSON} from "../framework";

interface Config {
  throttleTime?: number;
}

interface IAwarenessState {
  cursor: ISelectionJSON | null;
  user: {
    id: string,
    name: string
  };

  [key: string]: any
}

type clientId = number;

class CursorLabelLayer {
  private readonly anchors = new Map<HTMLElement, HTMLElement>();
  private readonly hostElement: HTMLElement;
  private viewportBoundsDirty = true;
  private viewportLeft = 0;
  private viewportTop = 0;

  constructor(private readonly scrollContainer: HTMLElement | null) {
    const host = document.createElement('div');
    host.classList.add('blockcraft-cursor-label-layer');
    host.setAttribute('data-blockcraft-cursor-label-layer', 'true');
    host.setAttribute('contenteditable', 'false');
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
    this.hostElement = host;
  }

  attach(label: HTMLElement, anchor: HTMLElement) {
    if (!anchor.isConnected) {
      this.detach(label);
      return;
    }
    if (this.viewportBoundsDirty) this.refreshViewportBounds();
    this.anchors.set(label, anchor);
    if (label.parentElement !== this.hostElement) {
      this.hostElement.appendChild(label);
    }
    this._updatePosition(label, anchor);
  }

  detach(label: HTMLElement) {
    this.anchors.delete(label);
    label.remove();
  }

  refresh() {
    const positions: Array<{label: HTMLElement, left: number, top: number}> = [];
    this.anchors.forEach((anchor, label) => {
      if (!anchor.isConnected) {
        this.detach(label);
        return;
      }
      const anchorRect = anchor.getBoundingClientRect();
      positions.push({
        label,
        left: anchorRect.left - this.viewportLeft,
        top: anchorRect.top - this.viewportTop,
      });
    });
    positions.forEach(({label, left, top}) => {
      label.style.left = `${left}px`;
      label.style.top = `${top}px`;
    });
  }

  markViewportBoundsDirty() {
    this.viewportBoundsDirty = true;
  }

  refreshViewportBounds() {
    this.viewportBoundsDirty = false;
    const container = this.scrollContainer;
    if (
      !container?.isConnected ||
      container === document.body ||
      container === document.documentElement
    ) {
      this._setViewportBounds(
        0,
        0,
        document.documentElement.clientWidth,
        document.documentElement.clientHeight,
      );
      return;
    }

    const rect = container.getBoundingClientRect();
    this._setViewportBounds(
      rect.left + container.clientLeft,
      rect.top + container.clientTop,
      container.clientWidth,
      container.clientHeight,
    );
  }

  destroy() {
    this.anchors.forEach((_anchor, label) => label.remove());
    this.anchors.clear();
    this.hostElement.remove();
  }

  private _updatePosition(label: HTMLElement, anchor: HTMLElement) {
    const anchorRect = anchor.getBoundingClientRect();
    label.style.left = `${anchorRect.left - this.viewportLeft}px`;
    label.style.top = `${anchorRect.top - this.viewportTop}px`;
  }

  private _setViewportBounds(left: number, top: number, width: number, height: number) {
    this.viewportLeft = left;
    this.viewportTop = top;
    this.hostElement.style.left = `${left}px`;
    this.hostElement.style.top = `${top}px`;
    this.hostElement.style.width = `${width}px`;
    this.hostElement.style.height = `${height}px`;
  }
}

class Cursor {

  private _nameSpan: HTMLElement;
  private _color = getRandomDarkColor(.4);
  private _fakeCursor: FakeRange | null = null;
  private _selection: ISelectionJSON | null = null;
  private _coveredBlockIds = new Set<string>();
  private _labelAnchor: HTMLElement | null = null;

  constructor(
    private readonly doc: BlockCraft.Doc,
    private user: { id: string, name: string },
    private readonly getLabelLayer: () => CursorLabelLayer | null,
  ) {
    const nameSpan = document.createElement('span');
    nameSpan.innerText = user.name;
    nameSpan.classList.add('blockcraft-cursor-tag');
    nameSpan.style.cssText = ` background-color: ${this._color};`;
    this._nameSpan = nameSpan;
  }

  public setColor(color: string) {
    this._color = color;
  }

  updatePosition(selection: ISelectionJSON | null) {
    this._selection = selection;
    this._coveredBlockIds = this._collectCoveredBlockIds(selection);
    this._render();
  }

  refreshAfterTextViewChange(affectedBlockIds: ReadonlySet<string>) {
    if (!this._selection || !this._fakeCursor) return;
    for (const id of affectedBlockIds) {
      if (!this._coveredBlockIds.has(id)) continue;
      if (this._fakeCursor.hasLostRenderedSpans) this._render();
      return;
    }
  }

  private _render() {
    this.getLabelLayer()?.detach(this._nameSpan);
    this._labelAnchor = null;
    if (this._fakeCursor) {
      this._fakeCursor.destroy();
      this._fakeCursor = null;
    }
    if (!this._selection) return;
    try {
      this._fakeCursor = this.doc.selection.createFakeRange(this._selection, {
        bgColor: this._color,
        minCursorWidth: 2
      });
      const labelHost = this._fakeCursor.fakeSpans[0]?.firstElementChild;
      if (labelHost instanceof HTMLElement) {
        this._labelAnchor = labelHost;
        this.refreshLabelPosition();
      }
    } catch (e) {
      this.doc.logger.warn(`update cursor error: ${e}`);
    }
  }

  refreshLabelPosition() {
    if (!this._labelAnchor) return;
    this.getLabelLayer()?.attach(this._nameSpan, this._labelAnchor);
  }

  private _collectCoveredBlockIds(selection: ISelectionJSON | null) {
    const ids = new Set<string>();
    if (!selection) return ids;
    ids.add(selection.anchor.blockId);
    ids.add(selection.head.blockId);
    if (selection.anchor.tableId) ids.add(selection.anchor.tableId);
    if (selection.head.tableId) ids.add(selection.head.tableId);
    if (selection.anchor.blockId === selection.head.blockId) return ids;
    try {
      this.doc.queryBlocksBetween(
        selection.anchor.blockId,
        selection.head.blockId,
        true,
      ).forEach(id => ids.add(id));
    } catch {
      // Endpoint IDs are sufficient for stale/deleted cross-block selections.
    }
    return ids;
  }

  destroy() {
    this._selection = null;
    this._coveredBlockIds.clear();
    this._labelAnchor = null;
    this.getLabelLayer()?.detach(this._nameSpan);
    this._fakeCursor?.destroy();
    this._fakeCursor = null;
  }

}

export class BlockCraftAwareness {
  private cursors = new Map<clientId, Cursor>();
  private _states!: Map<clientId, IAwarenessState>
  private readonly _destroy$ = new Subject<void>();
  private _destroyed = false;
  private _awarenessChangeHandler!: (changes: any, origin: any) => void;
  private _pendingTextViewChanges = new Set<string>();
  private _textViewRefreshScheduled = false;
  private _labelLayer: CursorLabelLayer | null = null;
  private _labelRefreshFrame: number | null = null;
  private _labelViewportRefreshPending = false;

  private _localUser?: IAwarenessState['user'];

  get localUser() {
    return this._localUser;
  }

  public readonly onUserChange$ = new Subject<IAwarenessState['user'][]>();

  constructor(private readonly doc: BlockCraft.Doc,
              private readonly awareness: Awareness,
              config?: Config) {

    this.doc.selection.selectionChange$.pipe(
      takeUntil(this._destroy$),
      takeUntil(this.doc.onDestroy$),
    ).subscribe(debounce(selection => {
      this.awareness.setLocalStateField('cursor', selection?.toJSON());
    }, 100));

    this.doc.crud.onTextUpdate$.pipe(
      takeUntil(this._destroy$),
      takeUntil(this.doc.onDestroy$),
    ).subscribe(event => {
      if (this.cursors.size === 0) return;
      event.transactions.forEach(transaction => {
        this._pendingTextViewChanges.add(transaction.block.id);
      });
      this._scheduleTextViewRefresh();
    });

    this.doc.afterInit(root => {
      if (this._destroyed) return;
      const scrollContainer = this.doc.scrollContainer ??
        this.doc.config?.scrollContainer ??
        getScrollContainer(root.hostElement);
      this._labelLayer ??= new CursorLabelLayer(scrollContainer);
      this.cursors.forEach(cursor => cursor.refreshLabelPosition());
    });
    document.addEventListener('scroll', this._handleScroll, true);
    window.addEventListener('resize', this._handleResize, {passive: true});
    this.doc.onDestroy$.pipe(takeUntil(this._destroy$)).subscribe(() => this.destroy());

    this._states = this.awareness.getStates() as Map<clientId, IAwarenessState>;

    this._awarenessChangeHandler = (changes: any, origin: any) => {
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
      };
    this.awareness.on('change', this._awarenessChangeHandler);

  }

  setLocalUser(user: IAwarenessState['user']) {
    this.awareness.setLocalStateField('user', this._localUser = user);
  }

  getUsers() {
    return Array.from(this._states.values()).map(state => state.user);
  }

  protected addCursor(clientId: number) {
    const state = this._states.get(clientId)
    if (!state || !state.user || this._localUser?.id === state.user.id || this.cursors.has(clientId)) return;
    this.cursors.set(clientId, new Cursor(
      this.doc,
      state.user,
      () => this._labelLayer,
    ));
  }

  protected removeCursor(clientId: number) {
    this.cursors.get(clientId)?.destroy();
    this.cursors.delete(clientId);
  }

  private _scheduleTextViewRefresh() {
    if (this._destroyed || this._textViewRefreshScheduled) return;
    this._textViewRefreshScheduled = true;
    queueMicrotask(() => {
      this._textViewRefreshScheduled = false;
      if (this._destroyed) return;
      const affected = this._pendingTextViewChanges;
      this._pendingTextViewChanges = new Set<string>();
      this.cursors.forEach(cursor => cursor.refreshAfterTextViewChange(affected));
    });
  }

  private readonly _scheduleLabelRefresh = () => {
    if (this._destroyed || !this._labelLayer || this.cursors.size === 0 || this._labelRefreshFrame !== null) return;
    this._labelRefreshFrame = requestAnimationFrame(() => {
      this._labelRefreshFrame = null;
      if (this._labelViewportRefreshPending) {
        this._labelViewportRefreshPending = false;
        this._labelLayer?.refreshViewportBounds();
      }
      this._labelLayer?.refresh();
    });
  };

  private readonly _handleScroll = (event: Event) => {
    const target = event.target;
    const scrollContainer = this.doc.scrollContainer;
    if (
      target === document ||
      (target instanceof Node && target !== scrollContainer && target.contains(scrollContainer))
    ) {
      this._labelViewportRefreshPending = true;
      this._labelLayer?.markViewportBoundsDirty();
    }
    this._scheduleLabelRefresh();
  };

  private readonly _handleResize = () => {
    this._labelViewportRefreshPending = true;
    this._labelLayer?.markViewportBoundsDirty();
    this._scheduleLabelRefresh();
  };

  on(eventName: 'userChange', callback: (users: IAwarenessState['user'][]) => void) {
    switch (eventName) {
      case 'userChange':
        this.onUserChange$.pipe(
          takeUntil(this._destroy$),
          takeUntil(this.doc.onDestroy$),
        ).subscribe(callback);
        break;
    }
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._destroy$.next();
    this._destroy$.complete();
    this.awareness.off('change', this._awarenessChangeHandler);
    document.removeEventListener('scroll', this._handleScroll, true);
    window.removeEventListener('resize', this._handleResize);
    if (this._labelRefreshFrame !== null) {
      cancelAnimationFrame(this._labelRefreshFrame);
      this._labelRefreshFrame = null;
    }
    this._pendingTextViewChanges.clear();
    this.cursors.forEach(cursor => cursor.destroy());
    this.cursors.clear();
    this._labelLayer?.destroy();
    this._labelLayer = null;
    this.onUserChange$.complete();
  }


}
