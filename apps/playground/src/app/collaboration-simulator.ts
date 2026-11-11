import {
  BlockCraftDoc,
  BlockNodeType,
  ISelectionJSON,
  NativeBlockModel,
  YBlock,
  isNativeInputTarget,
  native2YBlock,
} from '@ccc/blockcraft';
import * as Y from 'yjs';

const MAIN_TO_SHADOW_ORIGIN = Symbol('playground-main-to-shadow');
const SHADOW_TO_MAIN_ORIGIN = Symbol('playground-shadow-to-main');
const SHADOW_SCENARIO_ORIGIN = Symbol('playground-shadow-scenario');

export type ImeCollaborationScenario =
  | 'remote-text-near-caret'
  | 'insert-root-before'
  | 'move-root-to-end'
  | 'delete-selection-scope';

export const IME_AUTOMATIC_SCENARIOS: readonly ImeCollaborationScenario[] = [
  'remote-text-near-caret',
  'insert-root-before',
  'move-root-to-end',
];

export const IME_SCENARIO_LABELS: Record<ImeCollaborationScenario, string> = {
  'remote-text-near-caret': '远端文本',
  'insert-root-before': '上方插入',
  'move-root-to-end': '移到末尾',
  'delete-selection-scope': '删除 scope',
};

export interface ImeCollaborationContext {
  readonly token: number;
  readonly selection: ISelectionJSON | null;
  readonly activeBlockId: string;
  readonly directRootUnitId: string;
  readonly selectionScopeId: string | null;
  readonly path: readonly string[];
  readonly textOffset: number | null;
}

export type ImeScenarioResultStatus = 'applied' | 'skipped' | 'error';

export interface ImeScenarioResult {
  readonly scenario: ImeCollaborationScenario;
  readonly status: ImeScenarioResultStatus;
  readonly message: string;
  readonly targetBlockId?: string;
}

export interface ImeCollaborationRunnerState {
  readonly phase: 'stopped' | 'ready' | 'waiting' | 'running';
  readonly hasActiveComposition: boolean;
  readonly pendingScenario: ImeCollaborationScenario | null;
  readonly lastScenario: ImeCollaborationScenario | null;
  readonly nextScenario: ImeCollaborationScenario;
  readonly appliedCount: number;
  readonly skippedCount: number;
  readonly errorCount: number;
  readonly message: string;
}

export function createInitialImeRunnerState(): ImeCollaborationRunnerState {
  return {
    phase: 'stopped',
    hasActiveComposition: false,
    pendingScenario: null,
    lastScenario: null,
    nextScenario: IME_AUTOMATIC_SCENARIOS[0],
    appliedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    message: '未启动',
  };
}

export class ShadowCollaborationSession {
  readonly shadowDoc: Y.Doc;

  private destroyed = false;

  private readonly syncToShadow = (update: Uint8Array, origin: unknown) => {
    if (this.destroyed || origin === SHADOW_TO_MAIN_ORIGIN) return;
    try {
      Y.applyUpdate(this.shadowDoc, update, MAIN_TO_SHADOW_ORIGIN);
    } catch (error) {
      this.onBridgeError('main-to-shadow', error);
    }
  };

  private readonly syncToMain = (update: Uint8Array, origin: unknown) => {
    if (this.destroyed || origin === MAIN_TO_SHADOW_ORIGIN) return;
    try {
      Y.applyUpdate(this.mainDoc, update, SHADOW_TO_MAIN_ORIGIN);
    } catch (error) {
      this.onBridgeError('shadow-to-main', error);
    }
  };

  constructor(
    private readonly mainDoc: Y.Doc,
    private readonly onBridgeError: (
      direction: 'main-to-shadow' | 'shadow-to-main',
      error: unknown,
    ) => void = () => undefined,
  ) {
    this.shadowDoc = new Y.Doc({ gc: mainDoc.gc });
    Y.applyUpdate(this.shadowDoc, Y.encodeStateAsUpdate(mainDoc), MAIN_TO_SHADOW_ORIGIN);
    this.mainDoc.on('update', this.syncToShadow);
    this.shadowDoc.on('update', this.syncToMain);
  }

  transact(operation: () => void): void {
    if (this.destroyed) {
      throw new Error('Shadow collaboration session has been destroyed.');
    }
    this.shadowDoc.transact(operation, SHADOW_SCENARIO_ORIGIN);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.mainDoc.off('update', this.syncToShadow);
    this.shadowDoc.off('update', this.syncToMain);
    this.shadowDoc.destroy();
  }
}

function cloneSelection(selection: ISelectionJSON | null): ISelectionJSON | null {
  if (!selection) return null;
  return Object.freeze({
    anchor: Object.freeze({ ...selection.anchor }),
    head: Object.freeze({ ...selection.head }),
    commonParent: selection.commonParent,
  });
}

function resolveTextOffset(
  selection: ISelectionJSON | null,
  activeBlockId: string,
): number | null {
  if (!selection) return null;
  const point = [selection.head, selection.anchor].find(
    candidate => candidate.type === 'text' && candidate.blockId === activeBlockId,
  );
  return point?.offset ?? null;
}

export function captureImeCollaborationContext(
  doc: BlockCraftDoc,
  token: number,
): ImeCollaborationContext | null {
  const session = doc.inputManger.compositionSession;
  const activeBlockId = session.isActive ? session.activeBlockId : null;
  if (!activeBlockId || !doc.model.exists(activeBlockId)) return null;

  const path = doc.model.getPath(activeBlockId);
  if (!path || path[0] !== doc.rootId || path.length < 2) return null;

  let selectionScopeId: string | null = null;
  for (let index = path.length - 1; index > 0; index -= 1) {
    const blockId = path[index];
    const flavour = doc.model.getFlavour(blockId);
    if (!flavour) continue;
    const scope = doc.schemas.get(flavour, false)?.metadata.selectionScope;
    if (scope && scope !== 'transparent') {
      selectionScopeId = blockId;
      break;
    }
  }

  const selection = cloneSelection(doc.selection.value?.toJSON() ?? null);
  return Object.freeze({
    token,
    selection,
    activeBlockId,
    directRootUnitId: path[1],
    selectionScopeId,
    path: Object.freeze([...path]),
    textOffset: resolveTextOffset(selection, activeBlockId),
  });
}

function getArrayChildren(block: YBlock | undefined): Y.Array<string> | null {
  if (!block) return null;
  const children = block.get('children');
  return children instanceof Y.Array ? children as Y.Array<string> : null;
}

function findReachablePath(
  blocks: Y.Map<YBlock>,
  rootId: string,
  targetId: string,
): string[] | null {
  if (!blocks.has(rootId) || !blocks.has(targetId)) return null;

  const stack: Array<{ id: string; path: string[] }> = [
    { id: rootId, path: [rootId] },
  ];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    if (current.id === targetId) return current.path;

    const children = getArrayChildren(blocks.get(current.id))?.toArray() ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childId = children[index];
      if (!seen.has(childId) && blocks.has(childId)) {
        stack.push({ id: childId, path: [...current.path, childId] });
      }
    }
  }
  return null;
}

function collectSubtreeIds(blocks: Y.Map<YBlock>, rootId: string): string[] {
  const result: string[] = [];
  const pending = [rootId];
  const seen = new Set<string>();
  while (pending.length) {
    const blockId = pending.pop()!;
    if (seen.has(blockId) || !blocks.has(blockId)) continue;
    seen.add(blockId);
    result.push(blockId);
    pending.push(...(getArrayChildren(blocks.get(blockId))?.toArray() ?? []));
  }
  return result;
}

class ImeCollaborationScenarioMutator {
  private sequence = 0;

  constructor(
    private readonly doc: BlockCraftDoc,
    private readonly session: ShadowCollaborationSession,
  ) {}

  execute(
    scenario: ImeCollaborationScenario,
    context: ImeCollaborationContext,
  ): ImeScenarioResult {
    this.sequence += 1;
    switch (scenario) {
      case 'remote-text-near-caret':
        return this.insertText(context);
      case 'insert-root-before':
        return this.insertRootParagraph(context);
      case 'move-root-to-end':
        return this.moveRootUnit(context);
      case 'delete-selection-scope':
        return this.deleteScope(context);
    }
  }

  private get blocks(): Y.Map<YBlock> {
    return this.session.shadowDoc.getMap<YBlock>('blocks');
  }

  private validateActivePath(context: ImeCollaborationContext): string[] | null {
    const path = findReachablePath(this.blocks, this.doc.rootId, context.activeBlockId);
    if (!path || path[1] !== context.directRootUnitId) return null;
    return path;
  }

  private skipped(
    scenario: ImeCollaborationScenario,
    message: string,
  ): ImeScenarioResult {
    return { scenario, status: 'skipped', message };
  }

  private insertText(context: ImeCollaborationContext): ImeScenarioResult {
    const scenario: ImeCollaborationScenario = 'remote-text-near-caret';
    if (!this.validateActivePath(context)) {
      return this.skipped(scenario, '组合目标已移动或不可达');
    }

    const target = this.blocks.get(context.activeBlockId);
    if (target?.get('nodeType') !== BlockNodeType.editable) {
      return this.skipped(scenario, '组合目标不是文本块');
    }
    const text = target.get('children');
    if (!(text instanceof Y.Text)) {
      return this.skipped(scenario, '组合目标缺少 Y.Text');
    }

    const offset = Math.max(0, Math.min(context.textOffset ?? text.length, text.length));
    const marker = `R${this.sequence}`;
    this.session.transact(() => text.insert(offset, marker));
    return {
      scenario,
      status: 'applied',
      message: `在 ${context.activeBlockId} @${offset} 插入 ${marker}`,
      targetBlockId: context.activeBlockId,
    };
  }

  private insertRootParagraph(context: ImeCollaborationContext): ImeScenarioResult {
    const scenario: ImeCollaborationScenario = 'insert-root-before';
    if (!this.validateActivePath(context)) {
      return this.skipped(scenario, '组合目标已移动或不可达');
    }

    const rootChildren = getArrayChildren(this.blocks.get(this.doc.rootId));
    const targetIndex = rootChildren?.toArray().indexOf(context.directRootUnitId) ?? -1;
    if (!rootChildren || targetIndex < 0) {
      return this.skipped(scenario, 'direct-root unit 已不在 root 中');
    }

    const snapshot = this.doc.schemas.createSnapshot('paragraph', [
      [{ insert: `remote ${this.sequence}` }],
    ]);
    const yBlock = native2YBlock(snapshot as NativeBlockModel);
    this.session.transact(() => {
      this.blocks.set(snapshot.id, yBlock);
      rootChildren.insert(targetIndex, [snapshot.id]);
    });
    return {
      scenario,
      status: 'applied',
      message: `在 ${context.directRootUnitId} 上方插入 ${snapshot.id}`,
      targetBlockId: snapshot.id,
    };
  }

  private moveRootUnit(context: ImeCollaborationContext): ImeScenarioResult {
    const scenario: ImeCollaborationScenario = 'move-root-to-end';
    if (!this.validateActivePath(context)) {
      return this.skipped(scenario, '组合目标已移动或不可达');
    }

    const rootChildren = getArrayChildren(this.blocks.get(this.doc.rootId));
    const childIds = rootChildren?.toArray() ?? [];
    const sourceIndex = childIds.indexOf(context.directRootUnitId);
    if (!rootChildren || sourceIndex < 0) {
      return this.skipped(scenario, 'direct-root unit 已不在 root 中');
    }
    if (sourceIndex === childIds.length - 1) {
      return this.skipped(scenario, 'direct-root unit 已位于末尾');
    }

    this.session.transact(() => {
      rootChildren.delete(sourceIndex, 1);
      rootChildren.insert(rootChildren.length, [context.directRootUnitId]);
    });
    return {
      scenario,
      status: 'applied',
      message: `已将 ${context.directRootUnitId} 移到 root 末尾`,
      targetBlockId: context.directRootUnitId,
    };
  }

  private deleteScope(context: ImeCollaborationContext): ImeScenarioResult {
    const scenario: ImeCollaborationScenario = 'delete-selection-scope';
    const activePath = this.validateActivePath(context);
    if (!activePath) {
      return this.skipped(scenario, '组合目标已移动或不可达');
    }

    const targetId = context.selectionScopeId ?? context.directRootUnitId;
    if (targetId === this.doc.rootId || !activePath.includes(targetId)) {
      return this.skipped(scenario, 'scope 已变化或不可删除');
    }

    const targetPath = findReachablePath(this.blocks, this.doc.rootId, targetId);
    const parentId = targetPath?.at(-2);
    if (!targetPath || !parentId) {
      return this.skipped(scenario, 'scope 已不可达');
    }
    const parentChildren = getArrayChildren(this.blocks.get(parentId));
    const targetIndex = parentChildren?.toArray().indexOf(targetId) ?? -1;
    if (!parentChildren || targetIndex < 0) {
      return this.skipped(scenario, 'scope 父引用已变化');
    }

    const subtreeIds = collectSubtreeIds(this.blocks, targetId);
    this.session.transact(() => {
      parentChildren.delete(targetIndex, 1);
      subtreeIds.forEach(blockId => this.blocks.delete(blockId));
    });
    return {
      scenario,
      status: 'applied',
      message: `已删除 ${targetId}（${subtreeIds.length} blocks）`,
      targetBlockId: targetId,
    };
  }
}

export interface ImeCollaborationScenarioRunnerOptions {
  readonly doc: BlockCraftDoc;
  readonly host: HTMLElement;
  readonly session: ShadowCollaborationSession;
  readonly autoEnabled?: boolean;
  readonly delayMs?: number;
  readonly onStateChange?: (state: ImeCollaborationRunnerState) => void;
  readonly onError?: (error: unknown) => void;
}

export class ImeCollaborationScenarioRunner {
  private readonly mutator: ImeCollaborationScenarioMutator;
  private stateValue = createInitialImeRunnerState();
  private activeContext: ImeCollaborationContext | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private compositionToken = 0;
  private automaticIndex = 0;
  private started = false;
  private runningScenario = false;
  private autoEnabled: boolean;
  private delayMs: number;

  private readonly onCompositionStart = (event: CompositionEvent) => {
    if (!this.started || isNativeInputTarget(event.target)) return;
    if (this.activeContext || this.pendingTimer !== null) {
      this.finishComposition('被新的 IME 会话替代');
    }
    const token = ++this.compositionToken;

    queueMicrotask(() => {
      if (!this.started || token !== this.compositionToken) return;
      const context = captureImeCollaborationContext(this.options.doc, token);
      if (!context) {
        this.patchState({
          phase: 'ready',
          hasActiveComposition: false,
          pendingScenario: null,
          message: '未捕获到可用组合目标',
        });
        return;
      }
      this.activeContext = context;
      this.patchState({
        phase: this.autoEnabled ? 'waiting' : 'ready',
        hasActiveComposition: true,
        message: `IME: ${context.activeBlockId}`,
      });
      if (this.autoEnabled) this.scheduleAutomaticScenario(context);
    });
  };

  private readonly onCompositionEnd = (event: CompositionEvent) => {
    if (isNativeInputTarget(event.target)) return;
    this.finishComposition('IME 已结束');
  };

  private readonly onFocusOut = (event: FocusEvent) => {
    const related = event.relatedTarget;
    if (related instanceof Node && this.options.host.contains(related)) return;
    this.finishComposition('编辑器已失焦');
  };

  constructor(private readonly options: ImeCollaborationScenarioRunnerOptions) {
    this.autoEnabled = options.autoEnabled ?? true;
    this.delayMs = Math.max(0, options.delayMs ?? 500);
    this.mutator = new ImeCollaborationScenarioMutator(options.doc, options.session);
  }

  get state(): ImeCollaborationRunnerState {
    return { ...this.stateValue };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.options.host.addEventListener('compositionstart', this.onCompositionStart);
    this.options.host.addEventListener('compositionend', this.onCompositionEnd);
    this.options.host.addEventListener('focusout', this.onFocusOut, true);
    this.patchState({
      phase: 'ready',
      message: '等待真实 IME 输入',
    });
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.compositionToken += 1;
    this.cancelPendingTimer();
    this.activeContext = null;
    this.options.host.removeEventListener('compositionstart', this.onCompositionStart);
    this.options.host.removeEventListener('compositionend', this.onCompositionEnd);
    this.options.host.removeEventListener('focusout', this.onFocusOut, true);
    this.patchState({
      phase: 'stopped',
      hasActiveComposition: false,
      pendingScenario: null,
      message: '已停止',
    });
  }

  setAutoEnabled(enabled: boolean): void {
    this.autoEnabled = enabled;
    this.cancelPendingTimer();
    if (enabled && this.activeContext) {
      this.scheduleAutomaticScenario(this.activeContext);
      return;
    }
    this.patchState({
      phase: this.started ? 'ready' : 'stopped',
      pendingScenario: null,
      message: enabled ? '自动轮换已开启' : '自动轮换已关闭',
    });
  }

  setDelayMs(delayMs: number): void {
    this.delayMs = Math.max(0, delayMs);
    if (this.pendingTimer !== null && this.activeContext && this.autoEnabled) {
      this.cancelPendingTimer();
      this.scheduleAutomaticScenario(this.activeContext);
    }
  }

  runNow(scenario: ImeCollaborationScenario): ImeScenarioResult | null {
    const context = this.activeContext;
    if (!this.started || !context) {
      this.patchState({ message: '当前没有活跃 IME' });
      return null;
    }
    if (!this.isContextActive(context)) {
      this.finishComposition('IME 会话已失效');
      return null;
    }
    this.cancelPendingTimer();
    return this.executeScenario(scenario, context);
  }

  private scheduleAutomaticScenario(context: ImeCollaborationContext): void {
    if (!this.started || !this.autoEnabled || !this.isContextActive(context)) return;
    const scenario = IME_AUTOMATIC_SCENARIOS[this.automaticIndex];
    this.patchState({
      phase: 'waiting',
      pendingScenario: scenario,
      message: `${this.delayMs}ms 后执行 ${IME_SCENARIO_LABELS[scenario]}`,
    });
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      if (!this.isContextActive(context)) {
        this.dropContextIfStale(context);
        this.advanceAutomaticScenario(scenario);
        this.recordResult({
          scenario,
          status: 'skipped',
          message: 'IME 会话或目标已失效',
        });
        this.patchState({ nextScenario: IME_AUTOMATIC_SCENARIOS[this.automaticIndex] });
        return;
      }
      const result = this.executeScenario(scenario, context);
      this.advanceAutomaticScenario(scenario);
      this.patchState({ nextScenario: IME_AUTOMATIC_SCENARIOS[this.automaticIndex] });
      return result;
    }, this.delayMs);
  }

  private executeScenario(
    scenario: ImeCollaborationScenario,
    context: ImeCollaborationContext,
  ): ImeScenarioResult | null {
    if (this.runningScenario) return null;
    this.runningScenario = true;
    this.patchState({
      phase: 'running',
      pendingScenario: scenario,
      message: `执行 ${IME_SCENARIO_LABELS[scenario]}`,
    });

    let result: ImeScenarioResult;
    try {
      result = this.mutator.execute(scenario, context);
    } catch (error) {
      this.options.onError?.(error);
      result = {
        scenario,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.runningScenario = false;
    }
    this.dropContextIfStale(context);
    this.recordResult(result);
    return result;
  }

  private recordResult(result: ImeScenarioResult): void {
    const countPatch = result.status === 'applied'
      ? { appliedCount: this.stateValue.appliedCount + 1 }
      : result.status === 'skipped'
        ? { skippedCount: this.stateValue.skippedCount + 1 }
        : { errorCount: this.stateValue.errorCount + 1 };
    this.patchState({
      ...countPatch,
      phase: this.started ? 'ready' : 'stopped',
      hasActiveComposition: this.activeContext !== null,
      pendingScenario: null,
      lastScenario: result.scenario,
      message: result.message,
    });
  }

  private advanceAutomaticScenario(scenario: ImeCollaborationScenario): void {
    const current = IME_AUTOMATIC_SCENARIOS[this.automaticIndex];
    if (scenario !== current) return;
    this.automaticIndex = (this.automaticIndex + 1) % IME_AUTOMATIC_SCENARIOS.length;
  }

  private isContextActive(context: ImeCollaborationContext): boolean {
    const composition = this.options.doc.inputManger.compositionSession;
    return this.started &&
      this.activeContext?.token === context.token &&
      this.compositionToken === context.token &&
      composition.isActive &&
      composition.activeBlockId === context.activeBlockId;
  }

  private dropContextIfStale(context: ImeCollaborationContext): void {
    if (this.activeContext?.token !== context.token || this.isContextActive(context)) return;
    this.activeContext = null;
    this.compositionToken += 1;
    this.cancelPendingTimer();
  }

  private finishComposition(message: string): void {
    const skippedScenario = this.pendingTimer !== null
      ? this.stateValue.pendingScenario
      : null;
    const hadActiveComposition = this.activeContext !== null ||
      this.pendingTimer !== null ||
      this.stateValue.hasActiveComposition;
    this.compositionToken += 1;
    this.cancelPendingTimer();
    this.activeContext = null;
    if (!hadActiveComposition) return;
    if (skippedScenario) {
      this.advanceAutomaticScenario(skippedScenario);
      this.recordResult({
        scenario: skippedScenario,
        status: 'skipped',
        message: `${IME_SCENARIO_LABELS[skippedScenario]}未执行：${message}`,
      });
      this.patchState({ nextScenario: IME_AUTOMATIC_SCENARIOS[this.automaticIndex] });
      return;
    }
    this.patchState({
      phase: this.started ? 'ready' : 'stopped',
      hasActiveComposition: false,
      pendingScenario: null,
      message,
    });
  }

  private cancelPendingTimer(): void {
    if (this.pendingTimer === null) return;
    clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
  }

  private patchState(patch: Partial<ImeCollaborationRunnerState>): void {
    this.stateValue = { ...this.stateValue, ...patch };
    this.options.onStateChange?.({ ...this.stateValue });
  }
}
