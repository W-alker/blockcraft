import {
  BLOCK_OBJECT_LAYOUT_OPTIONS, type BlockObjectAlignment, type BlockObjectPlaneAlignment,
  replaceSnapshotsIdDeeply,
} from '../../framework';
import {stripBlockLockMetaDeep} from '../../framework/modules/clipboard/copy-filter';
import {duplicateAbsolutePlacementSelection} from '../../framework/modules/object/block-placement/duplicate-command';
import {deleteAbsolutePlacementObjects} from '../../framework/modules/object/block-placement/delete-command';

/** @internal Menu presentation and commands resolve the same live model targets. */
export type ObjectContextMenuAction = 'object-duplicate' | 'object-delete' | 'object-group' | 'object-ungroup' |
  'object-forward' | 'object-backward' |
  `object-layout:${string}` | `object-align:${BlockObjectAlignment}` | `object-page-align:${BlockObjectPlaneAlignment}`;

/** @internal */
export interface ObjectContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  action?: ObjectContextMenuAction;
  shortcut?: string;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  children?: readonly ObjectContextMenuItem[];
}

/** @internal Text ranges retain clipboard ownership and have no whole-object commands. */
export interface ObjectMenuContext {
  blockIds: readonly string[];
  whole: boolean;
}

const ALIGNMENTS: ReadonlyArray<{value: BlockObjectAlignment; label: string; icon: string}> = [
  {value: 'left', label: '左对齐', icon: 'bc_align2left'},
  {value: 'horizontal-center', label: '水平居中', icon: 'bc_align2center'},
  {value: 'right', label: '右对齐', icon: 'bc_align2right'},
  {value: 'top', label: '顶端对齐', icon: 'bc_align2top'},
  {value: 'vertical-center', label: '垂直居中', icon: 'bc_align2middle'},
  {value: 'bottom', label: '底端对齐', icon: 'bc_align2bottom'},
  {value: 'horizontal-distribute', label: '水平分布', icon: 'bc_hengxiangfenbu'},
  {value: 'vertical-distribute', label: '垂直分布', icon: 'bc_zongxiangfenbu'},
];

/** @internal No settings UI or document mutation logic is owned by the menu. */
export class ObjectContextMenuController {
  constructor(private readonly doc: BlockCraft.Doc) {}

  owner(block: BlockCraft.BlockComponent): BlockCraft.BlockComponent | null {
    let current: BlockCraft.BlockComponent | undefined = block;
    while (current && current.id !== this.doc.rootId) {
      const metadata = this.doc.schemas.get(current.flavour, false)?.metadata;
      if (metadata?.objectFormat || metadata?.placement?.modes.includes('absolute') ||
        this.doc.placement.isObjectGroup(current.id)) return current;
      current = current.parentId ? this.doc.vm.get(current.parentId)?.instance : undefined;
    }
    return null;
  }

  target(block: BlockCraft.BlockComponent, selection: BlockCraft.Selection | null): BlockCraft.BlockComponent | null {
    let target = this.owner(block);
    if (!target) return null;
    const within = (id: string, ancestor: string) => {
      for (let current: string | null = id; current; current = this.doc.model.getParentId(current)) {
        if (current === ancestor) return true;
      }
      return false;
    };
    const selected = selection?.isInSameBlock && selection.anchor.type === 'selected' && selection.head.type === 'selected'
      ? selection.anchor.blockId : null;
    if (selected && this.doc.placement.isObjectGroup(selected) && within(target.id, selected)) {
      return this.doc.vm.get(selected)?.instance ?? null;
    }
    // An inactive group is selected as a whole; an existing member/content
    // selection keeps its local editing plane when the user opens its menu.
    for (let parent = this.doc.model.getParentId(target.id); parent && this.doc.placement.isObjectGroup(parent);
      parent = this.doc.model.getParentId(parent)) {
      if (selection && within(selection.anchor.blockId, parent)) break;
      const group = this.doc.vm.get(parent)?.instance;
      if (group) target = group;
    }
    return target;
  }

  resolve(selection: BlockCraft.Selection | null): ObjectMenuContext | null {
    if (!selection) return null;
    const absolute = this.doc.placement.getAbsoluteObjectSelectionIds(selection);
    if (absolute?.length) return {blockIds: absolute, whole: true};
    if (!selection.isInSameBlock) return null;
    const block = this.doc.vm.get(selection.firstBlockId)?.instance;
    const owner = block && this.owner(block);
    if (!owner) return null;
    return {blockIds: [owner.id], whole: selection.anchor.type === 'selected' &&
      selection.head.type === 'selected' && selection.anchor.blockId === owner.id};
  }

  items(context: ObjectMenuContext | null): ObjectContextMenuItem[] {
    if (!context || !this.writable(context.blockIds)) return [];
    const ids = context.blockIds;
    const items: ObjectContextMenuItem[] = [];
    if (context.whole) {
      const first = ids[0]!;
      const absolute = ids.every(id => this.doc.placement.getState(id).mode === 'absolute');
      const parent = this.doc.model.getParentId(first);
      if (parent && ids.every(id => this.doc.canInsertChild(parent, this.doc.model.getFlavour(id)!))) {
        items.push({id: 'duplicate', label: '复制副本', icon: 'bc_fuzhi', action: 'object-duplicate',
          shortcut: absolute ? 'D' : undefined});
      }
      const layouts = BLOCK_OBJECT_LAYOUT_OPTIONS.filter(option =>
        (option.value !== 'inline' || ids.length === 1) &&
        ids.every(id => this.doc.placement.supportsObjectLayout(id, option.value)));
      if (layouts.length) items.push({id: 'layout', label: '文字环绕', icon: 'bc_buju', children: layouts.map(option => ({
        id: option.value, label: option.label, icon: option.icon,
        active: ids.every(id => this.doc.placement.getObjectLayout(id) === option.value),
        action: `object-layout:${option.value}`,
      }))});
      if (absolute && ids.every(id => !this.doc.placement.isInObjectGroup(id))) {
        const ordered = this.stackOrder(ids);
        if (ids.every(id => this.doc.placement.getState(id).layer === this.doc.placement.getState(first).layer)) {
          items.push({id: 'arrange', label: '排列', icon: 'bc_cengji-shang', children: [
          {id: 'forward', label: '上移一层', icon: 'bc_cengji-shangyi', action: 'object-forward',
            disabled: !this.doc.placement.canMoveForward(ordered[ordered.length - 1]!)},
          {id: 'backward', label: '下移一层', icon: 'bc_cengji-xiayi', action: 'object-backward',
            disabled: !this.doc.placement.canMoveBackward(ordered[0]!)},
          ]});
        }
        const align = ids.length > 1 ? ALIGNMENTS.filter(option => this.doc.placement.canAlignObjects(ids, option.value))
          .map(option => ({id: option.value, label: option.label, icon: option.icon,
            action: `object-align:${option.value}` as ObjectContextMenuAction})) : [];
        const plane: ReadonlyArray<{value: BlockObjectPlaneAlignment; label: string; icon: string}> = [
          {value: 'left', label: '页面左对齐', icon: 'bc_align2left'},
          {value: 'horizontal-center', label: '页面水平居中', icon: 'bc_align2center'},
          {value: 'right', label: '页面右对齐', icon: 'bc_align2right'},
        ];
        const pageAlign = plane.filter(option => this.doc.placement.canAlignObjectsToPlane(ids, option.value))
          .map((option, index) => ({id: `page-${option.value}`, label: option.label, icon: option.icon,
            separatorBefore: index === 0 && align.length > 0,
            action: `object-page-align:${option.value}` as ObjectContextMenuAction}));
        if (align.length || pageAlign.length) items.push({id: 'alignment', label: '对齐与分布', icon: 'bc_align2center', children: [...align, ...pageAlign]});
      }
      if (this.doc.placement.canGroup(ids)) items.push({id: 'group', label: '组合', icon: 'bc_combination', action: 'object-group'});
      if (ids.length === 1 && this.doc.placement.canUngroup(first)) {
        items.push({id: 'ungroup', label: '解除组合', icon: 'bc_quxiaozuhe', action: 'object-ungroup'});
      }
    }
    if (context.whole && ids.every(id => !this.doc.readonlyManager.containsReadonly(id))) {
      items.push({id: 'delete', label: ids.length > 1 ? '删除所选对象' : '删除对象', icon: 'bc_shanchu',
        action: 'object-delete', danger: true, separatorBefore: items.length > 0});
    }
    return items;
  }

  private writable(ids: readonly string[]): boolean {
    return !this.doc.isReadonly && ids.length > 0 && ids.every(id =>
      this.doc.model.exists(id) && !this.doc.readonlyManager.isReadonly(id));
  }

  private stackOrder(ids: readonly string[]): string[] {
    return ids.map(id => ({id, layer: this.doc.placement.getState(id).layer,
      index: this.doc.model.indexInParent(id)}))
      .sort((a, b) => Number(a.layer === 'over') - Number(b.layer === 'over') || a.index - b.index)
      .map(item => item.id);
  }

  private reselect(ids: readonly string[]): void {
    if (!ids.length || ids.some(id => !this.doc.model.exists(id))) return;
    if (ids.length === 1 || ids.some(id => this.doc.placement.getState(id).mode !== 'absolute')) {
      this.doc.selection.selectBlock(ids[ids.length - 1]!);
      return;
    }
    const parent = this.doc.model.getParentId(ids[0]!);
    if (!parent || ids.some(id => this.doc.model.getParentId(id) !== parent)) return;
    const indices = ids.map(id => this.doc.model.indexInParent(id)).sort((a, b) => a - b);
    if (indices.some((index, offset) => index !== indices[0]! + offset)) return;
    this.doc.selection.replay({anchor: {blockId: parent, type: 'boundary', index: indices[0]!},
      head: {blockId: parent, type: 'boundary', index: indices[0]! + indices.length}, commonParent: parent});
  }

  async execute(action: ObjectContextMenuAction, expected: ObjectMenuContext): Promise<boolean> {
    const current = this.resolve(this.doc.selection.value);
    if (!current || current.whole !== expected.whole || current.blockIds.length !== expected.blockIds.length ||
      current.blockIds.some((id, index) => id !== expected.blockIds[index])) return false;
    const find = (items: readonly ObjectContextMenuItem[]): ObjectContextMenuItem | undefined => {
      for (const item of items) {
        if (item.action === action) return item;
        const child = item.children && find(item.children);
        if (child) return child;
      }
      return undefined;
    };
    const item = find(this.items(current));
    if (!item || item.disabled) return false;
    const ids = current.blockIds;
    const first = ids[0]!;
    if (action === 'object-duplicate') {
      if (this.doc.placement.isAbsoluteObjectSelection(this.doc.selection.value)) {
        return !!duplicateAbsolutePlacementSelection(this.doc, this.doc.selection.value, 'menu');
      }
      if (ids.length !== 1) return false;
      const snapshot = this.doc.model.toSnapshot(first);
      const parent = this.doc.model.getParentId(first);
      if (!snapshot || !parent) return false;
      const copy = stripBlockLockMetaDeep(snapshot);
      replaceSnapshotsIdDeeply([copy]);
      let inserted: string[] = [];
      this.doc.crud.undoManager.captureUndoItem(() => {
        inserted = this.doc.crud.insertBlockSnapshots(parent, this.doc.model.indexInParent(first) + 1, [copy]);
        if (inserted[0]) this.doc.selection.selectBlock(inserted[0]);
      });
      return inserted.length === 1;
    }
    if (action === 'object-delete') {
      if (this.doc.placement.isAbsoluteObjectSelection(this.doc.selection.value)) return deleteAbsolutePlacementObjects(this.doc, ids, 'menu');
      if (ids.length !== 1) return false;
      await this.doc.chain().deleteById(first).run();
      return !this.doc.model.exists(first);
    }
    if (action === 'object-group') {
      const id = this.doc.placement.group(ids);
      if (id) this.doc.selection.selectBlock(id);
      return !!id;
    }
    if (action === 'object-ungroup') return this.doc.placement.ungroup(first).length > 0;
    const layout = BLOCK_OBJECT_LAYOUT_OPTIONS.find(option => `object-layout:${option.value}` === action);
    if (layout) {
      if (layout.value === 'inline') return this.doc.placement.setObjectLayout(first, layout.value);
      const undo = this.doc.crud.undoManager;
      undo.captureSelectionBeforeChange();
      undo.beginCaptureGroup();
      try {
        // Flush each representation command before resolving the next anchor.
        // Include the queued empty-plane cleanup in this same logical action.
        for (const id of ids) this.doc.placement.setObjectLayout(id, layout.value);
        await Promise.resolve();
        this.reselect(ids);
      } finally {
        undo.endCaptureGroup();
      }
      return true;
    }
    const alignment = ALIGNMENTS.find(option => `object-align:${option.value}` === action);
    if (alignment) { this.doc.placement.alignObjects(ids, alignment.value); return true; }
    const plane = (['left', 'horizontal-center', 'right'] as const).find(value => `object-page-align:${value}` === action);
    if (plane) { this.doc.placement.alignObjectsToPlane(ids, plane); return true; }
    if (action === 'object-forward' || action === 'object-backward') {
      this.doc.crud.undoManager.captureUndoItem(() => {
        // Preserve the selected objects' relative order when moving one layer.
        const ordered = this.stackOrder(ids);
        if (action === 'object-forward') ordered.reverse();
        this.doc.crud.transact(() => {
          for (const id of ordered) action === 'object-forward' ? this.doc.placement.moveForward(id) : this.doc.placement.moveBackward(id);
        });
        this.reselect(ids);
      });
      return true;
    }
    return false;
  }
}
