import { Awareness } from 'y-protocols/awareness';
import { Subject, takeUntil } from 'rxjs';
import {debounce, getScrollContainer} from "../global";
import {
  BlockSelection,
  EditableBlockComponent,
  FakeRange,
  ISelectionJSON,
  ISelectionPointJSON,
} from "../framework";
import {
  resolveCollaborationCursorColor,
} from "./collaboration-cursor-color";
import type {
  CollaborationCursorColors,
  CollaborationUser,
} from "./collaboration-cursor-color";

export {resolveCollaborationCursorColor} from "./collaboration-cursor-color";
export type {CollaborationUser} from "./collaboration-cursor-color";

export interface BlockCraftAwarenessConfig {
  throttleTime?: number;
  shouldRenderRemoteCursor?: (state: Readonly<Record<string, unknown>>) => boolean;
}

interface IAwarenessState {
  cursor: ISelectionJSON | null;
  user: CollaborationUser;

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
  private _user: CollaborationUser;
  private _colors: CollaborationCursorColors;
  private _fakeCursor: FakeRange | null = null;
  private _selection: ISelectionJSON | null = null;
  private _normalizedSelection: BlockSelection | null = null;
  private _coveredBlockIds = new Set<string>();
  private _labelAnchor: HTMLElement | null = null;
  private _mountedRootIds: readonly string[] | null = null;
  private _projectionKey: string | null = null;
  private _projectionDeferredForView = false;

  constructor(
    private readonly doc: BlockCraft.Doc,
    user: CollaborationUser,
    private readonly getLabelLayer: () => CursorLabelLayer | null,
  ) {
    this._user = {...user};
    this._colors = resolveCollaborationCursorColor(user);
    const nameSpan = document.createElement('span');
    nameSpan.innerText = user.name;
    nameSpan.classList.add('blockcraft-cursor-tag');
    nameSpan.style.backgroundColor = this._colors.solid;
    nameSpan.style.color = '#fff';
    this._nameSpan = nameSpan;
  }

  updateUser(user: CollaborationUser) {
    const nameChanged = user.name !== this._user.name;
    const colorChanged =
      user.id !== this._user.id ||
      user.color !== this._user.color;
    if (!nameChanged && !colorChanged) return;

    this._user = {...user};
    if (nameChanged) this._nameSpan.innerText = user.name;
    if (!colorChanged) return;

    this._colors = resolveCollaborationCursorColor(user);
    this._nameSpan.style.backgroundColor = this._colors.solid;
    this._fakeCursor?.setColor({bgColor: this._getRangeColor()});
  }

  updatePosition(
    selection: ISelectionJSON | null,
    mountedRootIds: readonly string[] | null = null,
  ) {
    this._selection = this._clampSelectionToModel(selection);
    this._mountedRootIds = mountedRootIds;
    this._normalizedSelection = this._normalizeSelection(this._selection);
    this._coveredBlockIds = this._collectCoveredBlockIds(this._selection);
    this._render(true);
  }

  refreshAfterTextViewChange(affectedBlockIds: ReadonlySet<string>) {
    if (!this._selection) return;
    for (const id of affectedBlockIds) {
      if (!this._coveredBlockIds.has(id)) continue;
      const projectionNeedsRetry = this._projectionDeferredForView;
      this._selection = this._clampSelectionToModel(this._selection);
      this._normalizedSelection = this._normalizeSelection(this._selection);
      this._coveredBlockIds = this._collectCoveredBlockIds(this._selection);
      if (
        projectionNeedsRetry ||
        !this._fakeCursor ||
        this._fakeCursor.hasLostRenderedSpans
      ) {
        this._render(true);
      }
      return;
    }
  }

  refreshAfterViewChange(mountedRootIds: readonly string[]) {
    this._mountedRootIds = mountedRootIds;
    this._render(false);
  }

  refreshAfterStructureChange() {
    if (!this._selection) return;
    this._selection = this._clampSelectionToModel(this._selection);
    this._normalizedSelection = this._normalizeSelection(this._selection);
    this._coveredBlockIds = this._collectCoveredBlockIds(this._selection);
    this._render(true);
  }

  private _render(force: boolean) {
    const projectionKey = this._projectionSignature();
    if (!force && projectionKey === this._projectionKey) {
      if (this._fakeCursor && !this._fakeCursor.hasLostRenderedSpans) return;
      if (!this._fakeCursor && !projectionKey) return;
    }
    this._projectionKey = projectionKey;

    this.getLabelLayer()?.detach(this._nameSpan);
    this._labelAnchor = null;
    if (this._fakeCursor) {
      this._fakeCursor.destroy();
      this._fakeCursor = null;
    }
    this._projectionDeferredForView = false;
    if (!this._selection || (this._isSparseView() && !projectionKey)) return;
    try {
      const projectionSelection = this._normalizedSelection;
      if (!projectionSelection || !this._canProjectSelection(projectionSelection)) {
        this._projectionDeferredForView = !!projectionSelection;
        return;
      }
      this._fakeCursor = this.doc.selection.createFakeRange(projectionSelection, {
        bgColor: this._getRangeColor(),
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

  private _isSparseView() {
    return this.doc.virtualization?.enabled === true;
  }

  private _getRangeColor() {
    return this._normalizedSelection?.collapsed
      ? this._colors.solid
      : this._colors.selection;
  }

  private _normalizeSelection(selection: ISelectionJSON | null) {
    if (!selection) return null;
    try {
      return this.doc.selection.createSelection(selection);
    } catch {
      return null;
    }
  }

  private _clampSelectionToModel(
    selection: ISelectionJSON | null,
  ): ISelectionJSON | null {
    if (!selection) return null;
    const anchor = this._clampPointToModel(selection.anchor);
    const head = this._clampPointToModel(selection.head);
    if (anchor === selection.anchor && head === selection.head) return selection;
    return {...selection, anchor, head};
  }

  private _clampPointToModel(point: ISelectionPointJSON): ISelectionPointJSON {
    try {
      if (point.type === 'text') {
        const length = this.doc.model?.getTextLength?.(point.blockId);
        if (!Number.isFinite(length)) return point;
        const offset = Math.max(0, Math.min(point.offset ?? 0, length));
        return offset === point.offset ? point : {...point, offset};
      }
      if (point.type === 'boundary') {
        const children = this.doc.model?.getChildrenIds?.(point.blockId);
        if (!children) return point;
        const index = Math.max(0, Math.min(point.index ?? 0, children.length));
        return index === point.index ? point : {...point, index};
      }
    } catch {
      // A concurrent deletion can invalidate the endpoint between awareness
      // delivery and projection. Existing liveness checks will hide it.
    }
    return point;
  }

  private _canProjectTextThrough(blockId: string, requiredOffset: number): boolean {
    try {
      if (this._isSparseView() && !this.doc.vm.isMounted(blockId)) return true;
      const block = this.doc.getBlockById(blockId);
      if (!this.doc.isEditable(block)) return true;
      const length = (block as EditableBlockComponent).runtime?.textLength;
      return Number.isFinite(length) && requiredOffset <= length;
    } catch {
      return false;
    }
  }

  private _canProjectSelection(selection: BlockSelection): boolean {
    try {
      const start = selection.start;
      const end = selection.end;
      const firstBlockId = selection.firstBlockId;
      const lastBlockId = selection.lastBlockId;

      if (start.type === 'text') {
        const requiredOffset = selection.isInSameBlock && end.type === 'text'
          ? end.offset
          : start.block.textLength;
        if (!this._canProjectTextThrough(firstBlockId, requiredOffset)) return false;
      }
      if (
        !selection.isInSameBlock &&
        end.type === 'text' &&
        !this._canProjectTextThrough(lastBlockId, end.offset)
      ) {
        return false;
      }

      for (const blockId of this._coveredBlockIds) {
        if (blockId === firstBlockId || blockId === lastBlockId) continue;
        if (this._isSparseView() && !this.doc.vm.isMounted(blockId)) continue;
        const block = this.doc.getBlockById(blockId);
        if (
          this.doc.isEditable(block) &&
          !this._canProjectTextThrough(blockId, block.textLength)
        ) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  private _projectionSignature(): string | null {
    if (!this._isSparseView()) return null;
    const selection = this._normalizedSelection;
    if (!selection || !this._mountedRootIds?.length) return '';

    let startRootId: string | null;
    let endRootId: string | null;
    try {
      startRootId = this._rootUnitId(selection.firstBlockId);
      endRootId = this._rootUnitId(selection.lastBlockId);
    } catch {
      return '';
    }
    if (!startRootId || !endRootId) return '';

    const relevant: string[] = [];
    for (const rootId of this._mountedRootIds) {
      if (rootId === startRootId || rootId === endRootId) {
        relevant.push(rootId);
        continue;
      }
      if (startRootId === endRootId) continue;
      try {
        if (selection.contains(rootId)) relevant.push(rootId);
      } catch {
        // A concurrent structure change can invalidate one remote endpoint.
      }
    }
    return relevant.join('\u0000');
  }

  private _rootUnitId(blockId: string): string | null {
    const path = this.doc.model.getPath(blockId);
    if (!path || path[0] !== this.doc.rootId) return null;
    return path[1] ?? (blockId === this.doc.rootId ? this.doc.rootId : null);
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
    this._normalizedSelection = null;
    this._coveredBlockIds.clear();
    this._labelAnchor = null;
    this._mountedRootIds = null;
    this._projectionKey = null;
    this._projectionDeferredForView = false;
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
  private _mountedRootIds: readonly string[] | null = null;
  private _localCursorEnabled = true;

  private _localUser?: IAwarenessState['user'];

  get localUser() {
    return this._localUser;
  }

  public readonly onUserChange$ = new Subject<IAwarenessState['user'][]>();

  constructor(private readonly doc: BlockCraft.Doc,
              private readonly awareness: Awareness,
              private readonly config: BlockCraftAwarenessConfig = {}) {

    this.doc.selection.selectionChange$.pipe(
      takeUntil(this._destroy$),
      takeUntil(this.doc.onDestroy$),
    ).subscribe(debounce(selection => {
      this.awareness.setLocalStateField(
        'cursor',
        this._localCursorEnabled ? selection?.toJSON() : null,
      );
    }, config.throttleTime ?? 100));

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
      if (this.doc.virtualization?.enabled) {
        this._mountedRootIds = this.doc.vm.getMountedRootChildIds();
      }
      const scrollContainer = this.doc.scrollContainer ??
        this.doc.config?.scrollContainer ??
        getScrollContainer(root.hostElement);
      this._labelLayer ??= new CursorLabelLayer(scrollContainer);
      this.cursors.forEach(cursor => cursor.refreshLabelPosition());
    });
    document.addEventListener('scroll', this._handleScroll, true);
    window.addEventListener('resize', this._handleResize, {passive: true});
    this.doc.onDestroy$.pipe(takeUntil(this._destroy$)).subscribe(() => this.destroy());

    if (this.doc.virtualization?.enabled) {
      if (this.doc.isInitialized) {
        this._mountedRootIds = this.doc.vm.getMountedRootChildIds();
      }
      this.doc.virtualization.viewChange$.pipe(
        takeUntil(this._destroy$),
        takeUntil(this.doc.onDestroy$),
      ).subscribe(({mountedRootIds}) => {
        this._mountedRootIds = mountedRootIds;
        this.cursors.forEach(cursor => cursor.refreshAfterViewChange(mountedRootIds));
      });
      this.doc.model.structureChange$.pipe(
        takeUntil(this._destroy$),
        takeUntil(this.doc.onDestroy$),
      ).subscribe(() => {
        this.cursors.forEach(cursor => cursor.refreshAfterStructureChange());
      });
    }

    this._states = this.awareness.getStates() as Map<clientId, IAwarenessState>;

    this._awarenessChangeHandler = (changes: any, origin: any) => {
        if (changes.added.length) {
          changes.added.forEach((id: number) => {
            const state = this._states.get(id)!;
            this.addCursor(id);

            if ('cursor' in state) {
              this.doc.afterInit(() => {
                this.cursors.get(id)?.updatePosition(state['cursor'], this._mountedRootIds);
              });
            }
          });

          this.onUserChange$.next(this.getUsers());
        }

        if (changes.updated.length && origin !== 'local') {
          changes.updated.forEach((id: number) => {
            const state = this._states.get(id);
            if (!state || !state.user) return;
            if (this._localUser?.id === state.user.id) {
              this.removeCursor(id);
              return;
            }
            if (!this._shouldRenderRemoteCursor(state)) {
              this.removeCursor(id);
              return;
            }
            if (!this.cursors.has(id)) {
              this.addCursor(id);
            }
            const cursor = this.cursors.get(id);
            cursor?.updateUser(state.user);
            cursor?.updatePosition(state['cursor'], this._mountedRootIds);
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

  /**
   * Enables or suppresses this client's collaboration cursor without
   * disabling remote cursor rendering or tearing down Awareness.
   *
   * Host presence layers can use this for viewing/readonly states. Re-enabling
   * publishes the current canonical BlockCraft selection immediately.
   */
  setLocalCursorEnabled(enabled: boolean) {
    if (this._destroyed || this._localCursorEnabled === enabled) return;
    this._localCursorEnabled = enabled;
    this.awareness.setLocalStateField(
      'cursor',
      enabled ? this.doc.selection.value?.toJSON() ?? null : null,
    );
  }

  get localCursorEnabled() {
    return this._localCursorEnabled;
  }

  getUsers() {
    return Array.from(this._states.values()).map(state => state.user);
  }

  protected addCursor(clientId: number) {
    const state = this._states.get(clientId)
    if (
      !state ||
      !state.user ||
      !this._shouldRenderRemoteCursor(state) ||
      this._localUser?.id === state.user.id ||
      this.cursors.has(clientId)
    ) return;
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

  private _shouldRenderRemoteCursor(state: IAwarenessState) {
    return this.config.shouldRenderRemoteCursor?.(state) ?? true;
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
    this._mountedRootIds = null;
    this.cursors.forEach(cursor => cursor.destroy());
    this.cursors.clear();
    this._labelLayer?.destroy();
    this._labelLayer = null;
    this.onUserChange$.complete();
  }


}
