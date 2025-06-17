import { BehaviorSubject, fromEvent, lastValueFrom, Subject, take, takeUntil, takeWhile } from "rxjs";
import { BaseStore } from "../store";
import { BlockflowInline, deltaToString, EditableBlock, KeyEventBus, sliceDelta } from "../block-std";
import { BlockModel, NO_RECORD_CHANGE_SIGNAL, syncBlockModelChildren, USER_CHANGE_SIGNAL } from "../yjs";
import Y from "../yjs";
import { FILE_UPLOADER, updateOrderAround } from "../../blocks";
import { getCurrentCharacterRange, isUrl, normalizeStaticRange, purifyString } from "../../core";
import { HtmlConverter } from "../modules/clipboard/htmlConverter";
const DEFAULT_EMBED_CONVERTER_LIST = [
    ['link', {
            toView: (data) => {
                const a = document.createElement('a');
                a.textContent = data.insert['link'];
                a.setAttribute('data-href', data.attributes['d:href']);
                return a;
            },
            toDelta: (ele) => {
                return {
                    insert: { link: ele.textContent },
                    attributes: { 'd:href': ele.getAttribute('data-href') }
                };
            }
        }],
    ['image', {
            toView: (data) => {
                const span = document.createElement('span');
                const img = document.createElement('img');
                img.setAttribute('src', data.insert['image']);
                img.setAttribute('draggable', 'false');
                span.style.width = data.attributes?.['d:width'] + 'px';
                span.appendChild(img);
                span.setAttribute('tabindex', '0');
                return span;
            },
            toDelta: (ele) => {
                return {
                    insert: { image: ele.getAttribute('src') },
                };
            }
        }]
];
export class Controller {
    constructor(config, injector) {
        this.config = config;
        this.injector = injector;
        this.readonly$ = new BehaviorSubject(false);
        this.blockRefStore = new BaseStore();
        this.blocksWaiting = {};
        this.blocksReady$ = new Subject();
        this.rootModel = [];
        this.yDoc = new Y.Doc({ gc: false, guid: this.config.rootId });
        this.rootYModel = this.yDoc.getArray(this.rootId);
        this._rootYModelObserver = (event, tr) => {
            if (tr.origin === USER_CHANGE_SIGNAL || tr.origin === NO_RECORD_CHANGE_SIGNAL)
                return;
            const { path, target, changes } = event;
            syncBlockModelChildren(changes.delta, this.rootModel);
        };
        this.undoRedo$ = new BehaviorSubject(false);
        this.keyEventBus = new KeyEventBus(this);
        this.inlineManger = new BlockflowInline(new Map(DEFAULT_EMBED_CONVERTER_LIST.concat(this.config.embeds || [])));
        this.pluginStore = new BaseStore();
        const { historyConfig = { open: true, duration: 300 } } = config;
        this.readonly$.next(config.readonly || false);
        if (historyConfig.open) {
            this.historyManager = new Y.UndoManager(this.rootYModel, { captureTimeout: historyConfig.duration || 200, trackedOrigins: new Set([null, USER_CHANGE_SIGNAL]) });
            this.historyManager.on('stack-item-added', (e) => {
                if (e.type === 'undo') {
                    e.stackItem.meta.set('selection', this.selection.getSelection());
                }
            });
            this.historyManager.on('stack-item-popped', (e) => {
                requestAnimationFrame(() => {
                    if (!this.activeElement)
                        this.selection.applyRange(e.stackItem.meta.get('selection'));
                });
            });
        }
        this.rootYModel.observe(this._rootYModelObserver);
    }
    attach(root) {
        return new Promise(resolve => {
            root.ready$.pipe(take(2)).subscribe(v => {
                if (!v)
                    return;
                this._root = root;
                root.setController(this);
                this.clipboard = new BlockFlowClipboard(this);
                this.selection = new BlockFlowSelection(this);
                this.addPlugins(this.config.plugins || []);
                this.root.onDestroy.pipe(take(1)).subscribe(() => {
                    this.pluginStore.values().forEach(plugin => {
                        plugin.destroy();
                    });
                });
                resolve(true);
            });
        });
    }
    addPlugins(plugins) {
        if (!plugins.length)
            return;
        this.root.ready$.pipe(takeWhile(Boolean)).subscribe(v => {
            if (!v)
                return;
            plugins.forEach(plugin => {
                plugin.init(this);
                this.pluginStore.set(plugin.name, plugin);
            });
        });
    }
    toggleReadonly(bol = true) {
        this.readonly$.next(bol);
    }
    get schemas() {
        return this.config.schemas;
    }
    get root() {
        return this._root;
    }
    get rootElement() {
        return this.root.rootElement;
    }
    get rootId() {
        return this.config.rootId;
    }
    toJSON() {
        return this.rootYModel.toJSON();
    }
    /**
     * Just store block instance when it rendered
     * @param blockRef block instance
     */
    storeBlockRef(blockRef) {
        this.blockRefStore.set(blockRef.id, blockRef);
        for (const key in this.blocksWaiting) {
            if (key === blockRef.id)
                this.blocksWaiting[key] = true;
            if (!this.blocksWaiting[key])
                return;
        }
        this.blocksReady$.next(true);
    }
    /** ---------------history---------------- start **/
    transact(fn, origin = null) {
        this.yDoc.transact(fn, origin);
    }
    stopCapturing() {
        this.historyManager?.stopCapturing();
    }
    undo() {
        if (!this.historyManager?.canUndo())
            return;
        if (this.undoRedo$.value)
            return;
        this.undoRedo$.next(true);
        this.historyManager.undo();
        Promise.resolve().then(() => {
            this.undoRedo$.next(false);
            // 临时方案，解决撤销后焦点丢失问题
            requestAnimationFrame(() => {
                if (!this.activeElement || document.activeElement === document.body)
                    this.rootElement.focus({ preventScroll: true });
            });
        });
    }
    redo() {
        if (!this.historyManager?.canRedo())
            return;
        if (this.undoRedo$.value)
            return;
        this.undoRedo$.next(true);
        this.historyManager.redo();
        Promise.resolve().then(() => this.undoRedo$.next(false));
    }
    /** ---------------history---------------- end **/
    /** ---------------block operation---------------- start **/
    get blockLength() {
        return this.rootModel.length;
    }
    getBlockModel(id) {
        return this.getBlockRef(id)?.model;
    }
    createBlock(flavour, params) {
        const b = this.config.schemas.create(flavour, params);
        b.meta = {
            ...b.meta,
            createdTime: Date.now(),
            lastModified: {
                time: Date.now(),
                ...this.config.localUser
            }
        };
        return BlockModel.fromModel(b);
    }
    insertBlocks(index, blocks, parentId = this.rootId, unRecord = false) {
        blocks.forEach(b => {
            this.blocksWaiting[b.id] = false;
        });
        return new Promise((resolve, reject) => {
            if (parentId === this.rootId) {
                this.transact(() => {
                    this.rootModel.splice(index, 0, ...blocks);
                    this.rootYModel.insert(index, blocks.map(b => b.yModel));
                }, unRecord ? NO_RECORD_CHANGE_SIGNAL : USER_CHANGE_SIGNAL);
            }
            else {
                const parentModel = this.getBlockRef(parentId)?.model;
                if (!parentModel)
                    return reject(new Error(`Parent block ${parentId} not found`));
                this.transact(() => {
                    parentModel.insertChildren(index, blocks);
                }, unRecord ? NO_RECORD_CHANGE_SIGNAL : USER_CHANGE_SIGNAL);
            }
            const olIndex = blocks.findIndex(b => b.flavour === 'ordered-list');
            if (olIndex >= 0 && !unRecord)
                this.updateOrderAround(blocks[olIndex]);
            this.blocksReady$.pipe(take(1)).subscribe(v => requestAnimationFrame(resolve));
        });
    }
    deleteBlocks(index, count, parentId = this.rootId) {
        if (count <= 0)
            return;
        if (parentId === this.rootId) {
            this.transact(() => {
                const items = this.rootModel.splice(index, count);
                this.rootYModel.delete(index, count);
                if (items.some(b => b.flavour === 'ordered-list')) {
                    const olIndex = this.rootModel.findIndex((b, i) => i >= index && b.flavour === 'ordered-list');
                    if (olIndex >= 0)
                        this.updateOrderAround(this.rootModel[olIndex]);
                }
            }, USER_CHANGE_SIGNAL);
            return;
        }
        const parentModel = this.getBlockModel(parentId);
        if (!parentModel)
            throw new Error(`Parent block ${parentId} not found`);
        parentModel.deleteChildren(index, count);
    }
    replaceBlocks(index, count, blocks, parentId = this.rootId) {
        if (count <= 0 || blocks.length <= 0)
            throw new Error(`Count or blocks must be greater than 0`);
        blocks.forEach(b => {
            this.blocksWaiting[b.id] = false;
        });
        if (parentId === this.rootId) {
            return new Promise((resolve, reject) => {
                this.transact(() => {
                    this.rootYModel.delete(index, count);
                    this.rootYModel.insert(index, blocks.map(b => b.yModel));
                    this.rootModel.splice(index, count, ...blocks);
                    if (blocks.some(b => b.flavour === 'ordered-list')) {
                        const olIndex = this.rootModel.findIndex((b, i) => i >= index && b.flavour === 'ordered-list');
                        if (olIndex >= 0)
                            this.updateOrderAround(this.rootModel[olIndex]);
                    }
                    this.blocksReady$.pipe(take(1)).subscribe(v => requestAnimationFrame(resolve));
                }, USER_CHANGE_SIGNAL);
            });
        }
        throw new Error(`Parent block ${parentId} not found`);
    }
    deleteBlockById(id) {
        const path = this.getBlockPosition(id);
        const { index, parentId } = path;
        return this.deleteBlocks(index, 1, parentId);
    }
    replaceWith(id, newBlocks) {
        const { index, parentId } = this.getBlockPosition(id);
        return new Promise((resolve) => {
            this.transact(() => {
                this.deleteBlocks(index, 1, parentId);
                this.insertBlocks(index, newBlocks, parentId).then(resolve);
            }, USER_CHANGE_SIGNAL);
        });
    }
    moveBlock(origin, target, position) {
        const originModel = this.getBlockRef(origin).model;
        const targetModel = this.getBlockRef(target).model;
        const originPos = originModel.getPosition();
        const targetPos = targetModel.getPosition();
        if (originPos.parentId === targetPos.parentId &&
            ((originPos.index === targetPos.index) ||
                (position === 'before' && originPos.index === targetPos.index - 1) ||
                (position === 'after' && originPos.index === targetPos.index + 1)))
            return;
        // console.log(originModel, targetModel)
        // const originParent = originModel.yModel.parent as Y.Array<YBlockModel>
        // const targetParent = targetModel.yModel.parent as Y.Array<YBlockModel>
        const insertIndex = position === 'before'
            ? (originPos.index < targetPos.index ? targetPos.index - 1 : targetPos.index)
            : (originPos.index < targetPos.index ? targetPos.index : targetPos.index + 1);
        const ym = originModel.toJSON();
        // TODO: 优化，允许跨父级移动
        this.deleteBlocks(originPos.index, 1);
        this.insertBlocks(insertIndex, [BlockModel.fromModel(ym)]);
    }
    /** ---------------block operation---------------- end **/
    /** ---------------query block---------------- start **/
    get firstBlock() {
        return this.rootModel[0];
    }
    get lastBlock() {
        return this.rootModel[this.rootModel.length - 1];
    }
    getBlockPosition(id) {
        const bRef = this.getBlockRef(id);
        if (!bRef)
            throw new Error(`Block ${id} not found`);
        const position = bRef.model.getPosition();
        return { parentId: position.parentId || this.rootId, index: position.index };
    }
    getBlockRef(id) {
        return this.blockRefStore.get(id);
    }
    findPrevEditableBlockModel(id) {
        const { index, parentId } = this.getBlockPosition(id);
        const mc = parentId === this.rootId ? this.rootModel : this.getBlockModel(parentId).children;
        let p = index - 1;
        while (p >= 0) {
            const prev = mc[p];
            if (this.isEditable(prev))
                return prev;
            p--;
        }
        return null;
    }
    findPrevEditableBlock(id) {
        const prev = this.findPrevEditableBlockModel(id);
        if (!prev)
            return null;
        return this.getBlockRef(prev.id);
    }
    findNextBlockModel(id) {
        const { index, parentId } = this.getBlockPosition(id);
        const mc = parentId === this.rootId ? this.rootModel : this.getBlockModel(parentId).children;
        if (index >= mc.length - 1)
            return null;
        return mc[index + 1];
    }
    findNextEditableBlockModel(id) {
        const { index, parentId } = this.getBlockPosition(id);
        const mc = parentId === this.rootId ? this.rootModel : this.getBlockModel(parentId).children;
        let p = index + 1;
        while (p <= mc.length - 1) {
            const next = mc[p];
            if (this.isEditable(next))
                return next;
            p++;
        }
        return null;
    }
    findNextEditableBlock(id) {
        const next = this.findNextEditableBlockModel(id);
        if (!next)
            return null;
        return this.getBlockRef(next.id);
    }
    /** ---------------query block---------------- end **/
    /** ---------------focus , selection---------------- start **/
    get activeElement() {
        return this.root.activeElement;
    }
    isEditableBlock(block) {
        return block instanceof EditableBlock;
    }
    isEditable(b) {
        return typeof b === 'string' ? this.getBlockModel(b)?.nodeType === 'editable' : b.nodeType === 'editable';
    }
    getFocusingBlockId() {
        return this.root.getActiveBlockId();
    }
    getFocusingBlockRef() {
        return this.root.activeBlock;
    }
    deleteSelectedBlocks() {
        const rootRange = this.root.selectedBlockRange;
        if (!rootRange)
            return;
        const { start, end } = rootRange;
        this.deleteBlocks(start, end - start);
        this.root.clearSelectedBlockRange();
        return [start, end];
    }
    /** ---------------focus , selection---------------- end **/
    /** ---------------For ordered-list block---------------- start **/
    updateOrderAround(block) {
        this.transact(() => {
            updateOrderAround(block, this);
        }, USER_CHANGE_SIGNAL);
    }
}
export class BlockFlowSelection {
    constructor(controller) {
        this.controller = controller;
        // public readonly selectionChange$ = new BehaviorSubject<IBlockFlowRange | null>(null)
        this.activeBlock$ = this.controller.root.activeBlock$;
        // fromEvent(document, 'selectionchange').pipe(takeUntil(this.root.onDestroy)).subscribe(v => {
        //   console.time('getSelection')
        //   this.selectionChange$.next(this.getSelection())
        //   console.timeEnd('getSelection')
        // })
    }
    get activeElement() {
        return this.controller.activeElement;
    }
    get root() {
        return this.controller.root;
    }
    normalizeStaticRange(element, range) {
        return normalizeStaticRange(element, range);
    }
    focusTo(id, from, to) {
        const block = this.controller.getBlockRef(id);
        if (!block)
            return;
        if (this.controller.isEditableBlock(block)) {
            block.setSelection(from, to);
            return;
        }
        const pos = block.getPosition();
        if (pos.parentId !== this.controller.rootId)
            return;
        this.root.selectBlocks(pos.index, pos.index + 1);
    }
    getSelection() {
        if (!this.activeElement)
            return null;
        if (this.activeElement === this.root.rootElement) {
            return {
                rootRange: this.root.selectedBlockRange,
                isAtRoot: true,
                rootId: this.controller.rootId,
            };
        }
        return {
            blockRange: getCurrentCharacterRange(this.activeElement),
            isAtRoot: false,
            blockId: this.root.getActiveBlockId(),
        };
    }
    setSelection(target, from, to) {
        if (target === this.controller.rootId) {
            this.root.selectBlocks(from, to ?? from);
        }
        else {
            const bRef = this.controller.getBlockRef(target);
            if (!bRef || bRef.nodeType !== 'editable')
                return;
            // @ts-ignore
            bRef.setSelection(from, to ?? from);
        }
    }
    applyRange(range) {
        if (!range)
            return;
        if (range.isAtRoot) {
            if (!range.rootRange)
                this.root.rootElement.focus({ preventScroll: true });
            else
                this.setSelection(range.rootId, range.rootRange.start, range.rootRange.end);
        }
        else {
            this.setSelection(range.blockId, range.blockRange.start, range.blockRange.end);
        }
    }
    getCurrentCharacterRange() {
        if (!this.controller.activeElement || this.controller.activeElement === this.controller.rootElement)
            throw new Error('Unexpected active element');
        return getCurrentCharacterRange(this.controller.activeElement);
    }
}
class BlockFlowClipboard {
    static { this.CLIPBOARD_DATA_TYPE = '@bf/json'; }
    static { this.SIGN_CLIPBOARD_JSON_DELTA = '@bf-delta/json: '; }
    static { this.SIGN_CLIPBOARD_JSON_BLOCKS = '@bf-blocks/json: '; }
    constructor(controller) {
        this.controller = controller;
        this.htmlConverter = new HtmlConverter(this.controller.schemas);
        this._data_write = undefined;
        this._data_write_ok = new Subject();
        this.onCopy = (event) => {
            if (this._data_write) {
                event.preventDefault();
                const clipboardData = event.clipboardData;
                this._data_write.forEach(v => {
                    const { data, type } = v;
                    switch (type) {
                        case 'text':
                            clipboardData.setData('text/plain', purifyString(data));
                            break;
                        case 'block':
                        case 'delta':
                            clipboardData.setData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE, (type === 'delta' ? BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA : BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS) + JSON.stringify(data));
                            break;
                        case 'text/uri-list':
                            clipboardData.setData('text/uri-list', data);
                            break;
                    }
                });
                this._data_write = undefined;
                this._data_write_ok.next(true);
                return;
            }
            const curRange = this.controller.selection.getSelection();
            if (!curRange)
                return null;
            event.preventDefault();
            const clipboardData = event.clipboardData;
            if (!curRange.isAtRoot) {
                const { blockRange: range, blockId } = curRange;
                if (range.start === range.end)
                    throw new Error('The range is collapsed');
                const bRef = this.controller.getBlockRef(blockId);
                if (!bRef || !this.controller.isEditableBlock(bRef))
                    throw new Error('The block is not editable');
                if (this.controller.activeElement?.classList.contains('bf-plain-text-only')) {
                    clipboardData.setData('text/plain', purifyString(bRef.getTextContent().slice(range.start, range.end)));
                    return { range: curRange, clipboardData };
                }
                const deltaConcat = sliceDelta(bRef.getTextDelta(), range.start, range.end);
                clipboardData.setData('text/plain', purifyString(deltaToString(deltaConcat)));
                clipboardData.setData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE, BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA + JSON.stringify(deltaConcat));
                return { range: curRange, clipboardData };
            }
            const { rootRange } = curRange;
            if (!rootRange)
                throw new Error('No range selected');
            const blocks = this.controller.rootModel.slice(rootRange.start, rootRange.end).map((block) => block.toJSON());
            clipboardData.setData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE, BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS + JSON.stringify(blocks));
            return { range: curRange, clipboardData };
        };
        this.onCut = (event) => {
            const res = this.onCopy(event);
            if (!res)
                return;
            const { range } = res;
            if (!range.isAtRoot) {
                const { blockRange, blockId } = range;
                const bRef = this.controller.getBlockRef(blockId);
                if (!bRef || !this.controller.isEditableBlock(bRef))
                    throw new Error('The block is not editable');
                const deltas = [{ retain: blockRange.start }, { delete: blockRange.end - blockRange.start }];
                document.getSelection()?.collapseToStart();
                bRef.applyDelta(deltas, false);
                return;
            }
            const rootRange = range.rootRange;
            this.controller.deleteBlocks(rootRange.start, rootRange.end - rootRange.start);
        };
        this.uploadImg = async (file) => {
            const imgUploader = this.controller.injector.get(FILE_UPLOADER);
            if (!imgUploader)
                throw new Error('imgUploader is required');
            return await imgUploader.uploadImg(file);
        };
        this.onPaste = async (event) => {
            if (this.controller.readonly$.value)
                return;
            event.preventDefault();
            const clipboardData = event.clipboardData;
            console.log(clipboardData.types);
            const curRange = this.controller.selection.getSelection();
            if (!curRange)
                return;
            // text/uri-list
            if (clipboardData.types.includes('text/uri-list')) {
                const uri = clipboardData.getData('text/uri-list').split('\n')[0];
                if (curRange.isAtRoot)
                    return;
                const bRef = this.controller.getBlockRef(curRange.blockId);
                if (!bRef || !this.controller.isEditableBlock(bRef))
                    throw new Error('The block is not editable');
                const { parentId, index } = bRef.getPosition();
                if (bRef.containerEle.classList.contains('bf-plain-text-only')) {
                    bRef.applyDelta([{ retain: curRange.blockRange.start }, { insert: uri }]);
                    return;
                }
                if (bRef.containerEle.classList.contains('bf-multi-line') && ['png', 'jpg', 'jpeg', 'gif'].lastIndexOf(uri)) {
                    bRef.applyDelta([{ retain: curRange.blockRange.start }, { insert: { image: uri } }]);
                    return;
                }
                if (parentId === this.controller.rootId) {
                    const block = this.controller.createBlock('image', [uri]);
                    this.controller.insertBlocks(index + 1, [block], this.controller.rootId);
                    return;
                }
            }
            // files
            if (clipboardData.types.includes('Files')) {
                if (curRange.isAtRoot || !clipboardData.files.length)
                    return;
                const imgFiles = Array.from(clipboardData.files).filter(file => file.type.startsWith('image'));
                if (!imgFiles.length)
                    return;
                const fileUri = await this.uploadImg(imgFiles[0]);
                const bRef = this.controller.getBlockRef(curRange.blockId);
                if (!bRef || !this.controller.isEditableBlock(bRef))
                    throw new Error('The block is not editable');
                const { parentId, index } = bRef.getPosition();
                if (bRef.containerEle.classList.contains('bf-plain-text-only'))
                    return;
                if (bRef.containerEle.classList.contains('bf-multi-line')) {
                    bRef.applyDelta([{ retain: curRange.blockRange.start }, { insert: { image: fileUri } }]);
                    return;
                }
                if (parentId === this.controller.rootId) {
                    const block = this.controller.createBlock('image', [fileUri]);
                    this.controller.insertBlocks(index + 1, [block], this.controller.rootId);
                    return;
                }
            }
            if (clipboardData.types.includes(BlockFlowClipboard.CLIPBOARD_DATA_TYPE)) {
                const data = clipboardData.getData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE);
                if (data.startsWith(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA)) {
                    const deltas = JSON.parse(data.slice(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA.length));
                    if (curRange.isAtRoot)
                        return;
                    const bRef = this.controller.getBlockRef(curRange.blockId);
                    if (!bRef || !this.controller.isEditableBlock(bRef))
                        throw new Error('The block is not editable');
                    applyPasteDeltaToBlock(bRef, deltas, curRange.blockRange);
                    return;
                }
                if (data.startsWith(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS)) {
                    const json = JSON.parse(data.slice(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS.length));
                    let index;
                    if (curRange.isAtRoot) {
                        index = curRange.rootRange.end;
                    }
                    else {
                        index = this.controller.getBlockPosition(curRange.blockId).index + 1;
                    }
                    this.controller.insertBlocks(index, json.map(BlockModel.fromModel));
                    return;
                }
                return;
            }
            if (!curRange.isAtRoot && clipboardData.types.includes('text/html')) {
                if (!this.controller.activeElement?.classList.contains('bf-plain-text-only')) {
                    const html = clipboardData.getData('text/html');
                    console.log('parse as html', html);
                    const position = this.controller.getBlockPosition(curRange.blockId);
                    if (position.parentId === this.controller.rootId && !this.controller.activeElement?.classList.contains('bf-multi-line')) {
                        const parseModels = this.htmlConverter.convertToBlocks(html);
                        if (parseModels.length) {
                            this.controller.insertBlocks(position.index + 1, parseModels.map(BlockModel.fromModel));
                            return;
                        }
                    }
                    else {
                        const deltas = this.htmlConverter.convertToDeltas(html);
                        if (deltas.length) {
                            const bRef = this.controller.getBlockRef(curRange.blockId);
                            if (!bRef || !this.controller.isEditableBlock(bRef))
                                throw new Error('The block is not editable');
                            applyPasteDeltaToBlock(bRef, deltas, curRange.blockRange);
                        }
                        return;
                    }
                }
            }
            const text = clipboardData.getData('text/plain');
            if (!text || curRange.isAtRoot)
                return;
            const bRef = this.controller.getBlockRef(curRange.blockId);
            if (!bRef || !this.controller.isEditableBlock(bRef))
                throw new Error('The block is not editable');
            let deltas;
            if (isUrl(text) && !bRef.containerEle.classList.contains('bf-plain-text-only')) {
                if (curRange.blockRange.start !== curRange.blockRange.end) {
                    // 直降将当前文本转化为链接
                    const string = deltaToString(sliceDelta(bRef.getTextDelta(), curRange.blockRange.start, curRange.blockRange.end));
                    deltas = [
                        { delete: curRange.blockRange.end - curRange.blockRange.start },
                        { insert: { link: string }, attributes: { 'd:href': text } },
                    ];
                }
                else {
                    deltas = [{ insert: { link: text }, attributes: { 'd:href': text } }];
                }
            }
            else {
                deltas = [{ insert: text }];
                if (curRange.blockRange.start !== curRange.blockRange.end) {
                    deltas.unshift({ delete: curRange.blockRange.end - curRange.blockRange.start });
                }
            }
            if (curRange.blockRange.start > 0) {
                deltas.unshift({ retain: curRange.blockRange.start });
            }
            bRef.applyDelta(deltas);
        };
        this.onDrop = async (event) => {
            event.preventDefault();
            console.log('onDrop', event);
            if (!event.dataTransfer)
                return;
            event.dataTransfer.types.forEach(type => console.log(type, event.dataTransfer.getData(type)));
            const types = event.dataTransfer.types;
            if (event.dataTransfer.files) {
                const imgFiles = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image'));
                if (!imgFiles.length)
                    return;
                const target = event.target;
                const blockId = target.closest('[bf-block-wrap]')?.getAttribute('data-block-id');
                if (!blockId)
                    return;
                const fileUri = await this.uploadImg(imgFiles[0]);
                const bPos = this.controller.getBlockPosition(blockId);
                const imgBlock = this.controller.createBlock('image', [fileUri]);
                this.controller.insertBlocks(bPos.index + 1, [imgBlock]);
            }
        };
        fromEvent(document, 'copy').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onCopy);
        fromEvent(document, 'cut').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onCut);
        fromEvent(controller.rootElement, 'drop').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onDrop);
        fromEvent(controller.rootElement, 'paste').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onPaste);
    }
    execCommand(command) {
        document.execCommand(command);
    }
    copy() {
        this.execCommand('copy');
    }
    cut() {
        this.execCommand('cut');
    }
    writeText(text) {
        return navigator.clipboard.writeText(purifyString(text));
    }
    writeData(data) {
        if (!data)
            return Promise.reject(new Error('data is empty'));
        this._data_write = data;
        document.execCommand('copy');
        return lastValueFrom(this._data_write_ok.pipe(take(1)));
    }
}
const applyPasteDeltaToBlock = (blockRef, deltaInsert, range) => {
    const deltas = [];
    if (range.start > 0) {
        deltas.push({ retain: range.start });
    }
    if (range.start !== range.end) {
        deltas.push({ delete: range.end - range.start });
    }
    if (blockRef.containerEle.classList.contains('bf-plain-text-only'))
        deltas.push({ insert: deltaToString(deltaInsert) });
    else
        deltas.push(...deltaInsert);
    blockRef.applyDelta(deltas, true);
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJvbGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL2Jsb2NrZmxvdy9zcmMvY29yZS9jb250cm9sbGVyL2NvbnRyb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFDLGVBQWUsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBQyxNQUFNLE1BQU0sQ0FBQztBQUNwRyxPQUFPLEVBQUMsU0FBUyxFQUFDLE1BQU0sVUFBVSxDQUFDO0FBR25DLE9BQU8sRUFFTCxlQUFlLEVBQ2YsYUFBYSxFQUNiLGFBQWEsRUFFYixXQUFXLEVBQ1gsVUFBVSxFQUNYLE1BQU0sY0FBYyxDQUFDO0FBQ3RCLE9BQU8sRUFDTCxVQUFVLEVBQ1YsdUJBQXVCLEVBQ3ZCLHNCQUFzQixFQUN0QixrQkFBa0IsRUFFbkIsTUFBTSxRQUFRLENBQUM7QUFDaEIsT0FBTyxDQUFDLE1BQU0sUUFBUSxDQUFDO0FBV3ZCLE9BQU8sRUFBQyxhQUFhLEVBQTBCLGlCQUFpQixFQUFDLE1BQU0sY0FBYyxDQUFDO0FBQ3RGLE9BQU8sRUFBbUIsd0JBQXdCLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLFlBQVksRUFBQyxNQUFNLFlBQVksQ0FBQztBQUNqSCxPQUFPLEVBQUMsYUFBYSxFQUFDLE1BQU0sb0NBQW9DLENBQUM7QUFxQmpFLE1BQU0sNEJBQTRCLEdBQStCO0lBQy9ELENBQUMsTUFBTSxFQUFFO1lBQ1AsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7Z0JBQ2YsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQTtnQkFDckMsQ0FBQyxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBVyxDQUFBO2dCQUM3QyxDQUFDLENBQUMsWUFBWSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMs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LENBQUE7SUFDaEQsQ0FBQztJQUNELElBQUksUUFBUSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDO1FBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFDLE1BQU0sRUFBRSxhQUFhLENBQUMsV0FBVyxDQUFDLEVBQUMsQ0FBQyxDQUFBOztRQUNoSCxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsV0FBVyxDQUFDLENBQUE7SUFDaEMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUE7QUFDbkMsQ0FBQyxDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtCZWhhdmlvclN1YmplY3QsIGZyb21FdmVudCwgbGFzdFZhbHVlRnJvbSwgU3ViamVjdCwgdGFrZSwgdGFrZVVudGlsLCB0YWtlV2hpbGV9IGZyb20gXCJyeGpzXCI7XG5pbXBvcnQge0Jhc2VTdG9yZX0gZnJvbSBcIi4uL3N0b3JlXCI7XG5pbXBvcnQge1NjaGVtYVN0b3JlfSBmcm9tIFwiLi4vc2NoZW1hc1wiO1xuaW1wb3J0IHtJUGx1Z2lufSBmcm9tIFwiLi4vcGx1Z2luc1wiO1xuaW1wb3J0IHtcbiAgQmFzZUJsb2NrLFxuICBCbG9ja2Zsb3dJbmxpbmUsXG4gIGRlbHRhVG9TdHJpbmcsXG4gIEVkaXRhYmxlQmxvY2ssXG4gIEVtYmVkQ29udmVydGVyLFxuICBLZXlFdmVudEJ1cyxcbiAgc2xpY2VEZWx0YVxufSBmcm9tIFwiLi4vYmxvY2stc3RkXCI7XG5pbXBvcnQge1xuICBCbG9ja01vZGVsLFxuICBOT19SRUNPUkRfQ0hBTkdFX1NJR05BTCxcbiAgc3luY0Jsb2NrTW9kZWxDaGlsZHJlbixcbiAgVVNFUl9DSEFOR0VfU0lHTkFMLFxuICBZQmxvY2tNb2RlbFxufSBmcm9tIFwiLi4veWpzXCI7XG5pbXBvcnQgWSBmcm9tIFwiLi4veWpzXCI7XG5pbXBvcnQge0VkaXRvclJvb3R9IGZyb20gXCIuLi9ibG9jay1yZW5kZXJcIjtcbmltcG9ydCB7SW5qZWN0b3J9IGZyb20gXCJAYW5ndWxhci9jb3JlXCI7XG5pbXBvcnQge1xuICBDaGFyYWN0ZXJJbmRleCxcbiAgRGVsdGFJbnNlcnQsXG4gIERlbHRhT3BlcmF0aW9uLFxuICBJQmxvY2tGbGF2b3VyLFxuICBJQmxvY2tGbG93UmFuZ2UsXG4gIElCbG9ja01vZGVsLFxufSBmcm9tIFwiLi4vdHlwZXNcIjtcbmltcG9ydCB7RklMRV9VUExPQURFUiwgSU9yZGVyZWRMaXN0QmxvY2tNb2RlbCwgdXBkYXRlT3JkZXJBcm91bmR9IGZyb20gXCIuLi8uLi9ibG9ja3NcIjtcbmltcG9ydCB7YWRqdXN0UmFuZ2VFZGdlcywgZ2V0Q3VycmVudENoYXJhY3RlclJhbmdlLCBpc1VybCwgbm9ybWFsaXplU3RhdGljUmFuZ2UsIHB1cmlmeVN0cmluZ30gZnJvbSBcIi4uLy4uL2NvcmVcIjtcbmltcG9ydCB7SHRtbENvbnZlcnRlcn0gZnJvbSBcIi4uL21vZHVsZXMvY2xpcGJvYXJkL2h0bWxDb252ZXJ0ZXJcIjtcblxuZXhwb3J0IGludGVyZmFjZSBIaXN0b3J5Q29uZmlnIHtcbiAgb3BlbjogYm9vbGVhblxuICBkdXJhdGlvbj86IG51bWJlcixcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29udHJvbGxlckNvbmZpZyB7XG4gIHJvb3RJZDogc3RyaW5nXG4gIHNjaGVtYXM6IFNjaGVtYVN0b3JlXG4gIC8vIFtmbGF2b3VyLCBjb252ZXJ0ZXJdXG4gIGVtYmVkcz86IFtzdHJpbmcsIEVtYmVkQ29udmVydGVyXVtdXG4gIHJlYWRvbmx5PzogYm9vbGVhblxuICBoaXN0b3J5Q29uZmlnPzogSGlzdG9yeUNvbmZpZ1xuICBwbHVnaW5zPzogSVBsdWdpbltdLFxuICBsb2NhbFVzZXI/OiB7XG4gICAgdXNlcklkOiBzdHJpbmdcbiAgICB1c2VyTmFtZTogc3RyaW5nXG4gIH1cbn1cblxuY29uc3QgREVGQVVMVF9FTUJFRF9DT05WRVJURVJfTElTVDogW3N0cmluZywgRW1iZWRDb252ZXJ0ZXJdW10gPSBbXG4gIFsnbGluaycsIHtcbiAgICB0b1ZpZXc6IChkYXRhKSA9PiB7XG4gICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpXG4gICAgICBhLnRleHRDb250ZW50ID0gZGF0YS5pbnNlcnRbJ2xpbmsnXSBhcyBzdHJpbmdcbiAgICAgIGEuc2V0QXR0cmlidXRlKCdkYXRhLWhyZWYnLCBkYXRhLmF0dHJpYnV0ZXMhWydkOmhyZWYnXSBhcyBzdHJpbmcpXG4gICAgICByZXR1cm4gYVxuICAgIH0sXG4gICAgdG9EZWx0YTogKGVsZSkgPT4ge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaW5zZXJ0OiB7bGluazogZWxlLnRleHRDb250ZW50IX0sXG4gICAgICAgIGF0dHJpYnV0ZXM6IHsnZDpocmVmJzogZWxlLmdldEF0dHJpYnV0ZSgnZGF0YS1ocmVmJyl9XG4gICAgICB9XG4gICAgfVxuICB9XSxcbiAgWydpbWFnZScsIHtcbiAgICB0b1ZpZXc6IChkYXRhKSA9PiB7XG4gICAgICBjb25zdCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpXG4gICAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbWcnKVxuICAgICAgaW1nLnNldEF0dHJpYnV0ZSgnc3JjJywgZGF0YS5pbnNlcnRbJ2ltYWdlJ10gYXMgc3RyaW5nKVxuICAgICAgaW1nLnNldEF0dHJpYnV0ZSgnZHJhZ2dhYmxlJywgJ2ZhbHNlJylcbiAgICAgIHNwYW4uc3R5bGUud2lkdGggPSBkYXRhLmF0dHJpYnV0ZXM/LlsnZDp3aWR0aCddICsgJ3B4J1xuICAgICAgc3Bhbi5hcHBlbmRDaGlsZChpbWcpXG4gICAgICBzcGFuLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpXG4gICAgICByZXR1cm4gc3BhblxuICAgIH0sXG4gICAgdG9EZWx0YTogKGVsZSkgPT4ge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaW5zZXJ0OiB7aW1hZ2U6IGVsZS5nZXRBdHRyaWJ1dGUoJ3NyYycpIX0sXG4gICAgICB9XG4gICAgfVxuICB9XVxuXVxuXG5leHBvcnQgY2xhc3MgQ29udHJvbGxlciB7XG4gIHB1YmxpYyByZWFkb25seSByZWFkb25seSQgPSBuZXcgQmVoYXZpb3JTdWJqZWN0KGZhbHNlKVxuXG4gIHByaXZhdGUgYmxvY2tSZWZTdG9yZSA9IG5ldyBCYXNlU3RvcmU8c3RyaW5nLCBCYXNlQmxvY2sgfCBFZGl0YWJsZUJsb2NrPigpXG4gIHByaXZhdGUgYmxvY2tzV2FpdGluZzogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSB7fVxuICBwcml2YXRlIHJlYWRvbmx5IGJsb2Nrc1JlYWR5JCA9IG5ldyBTdWJqZWN0KClcblxuICBwdWJsaWMgcmVhZG9ubHkgcm9vdE1vZGVsOiBCbG9ja01vZGVsW10gPSBbXVxuICBwdWJsaWMgcmVhZG9ubHkgeURvYyA9IG5ldyBZLkRvYyh7Z2M6IGZhbHNlLCBndWlkOiB0aGlzLmNvbmZpZy5yb290SWR9KVxuICBwdWJsaWMgcmVhZG9ubHkgcm9vdFlNb2RlbCA9IHRoaXMueURvYy5nZXRBcnJheTxZQmxvY2tNb2RlbD4odGhpcy5yb290SWQpXG4gIHByaXZhdGUgX3Jvb3RZTW9kZWxPYnNlcnZlciA9IChldmVudDogWS5ZQXJyYXlFdmVudDxZQmxvY2tNb2RlbD4sIHRyOiBZLlRyYW5zYWN0aW9uKSA9PiB7XG4gICAgaWYgKHRyLm9yaWdpbiA9PT0gVVNFUl9DSEFOR0VfU0lHTkFMIHx8IHRyLm9yaWdpbiA9PT0gTk9fUkVDT1JEX0NIQU5HRV9TSUdOQUwpIHJldHVyblxuICAgIGNvbnN0IHtwYXRoLCB0YXJnZXQsIGNoYW5nZXN9ID0gZXZlbnRcbiAgICBzeW5jQmxvY2tNb2RlbENoaWxkcmVuKGNoYW5nZXMuZGVsdGEgYXMgYW55W10sIHRoaXMucm9vdE1vZGVsIGFzIEJsb2NrTW9kZWxbXSlcbiAgfVxuXG4gIHB1YmxpYyByZWFkb25seSBoaXN0b3J5TWFuYWdlcj86IFkuVW5kb01hbmFnZXJcbiAgcHVibGljIHJlYWRvbmx5IHVuZG9SZWRvJCA9IG5ldyBCZWhhdmlvclN1YmplY3Q8Ym9vbGVhbj4oZmFsc2UpXG5cbiAgcHVibGljIGNsaXBib2FyZCE6IEJsb2NrRmxvd0NsaXBib2FyZFxuICBwdWJsaWMgc2VsZWN0aW9uITogQmxvY2tGbG93U2VsZWN0aW9uXG4gIHB1YmxpYyByZWFkb25seSBrZXlFdmVudEJ1czogS2V5RXZlbnRCdXMgPSBuZXcgS2V5RXZlbnRCdXModGhpcylcblxuICBwdWJsaWMgcmVhZG9ubHkgaW5saW5lTWFuZ2VyID0gbmV3IEJsb2NrZmxvd0lubGluZShuZXcgTWFwKERFRkFVTFRfRU1CRURfQ09OVkVSVEVSX0xJU1QuY29uY2F0KHRoaXMuY29uZmlnLmVtYmVkcyB8fCBbXSkpKVxuXG4gIHB1YmxpYyByZWFkb25seSBwbHVnaW5TdG9yZSA9IG5ldyBCYXNlU3RvcmU8c3RyaW5nLCBJUGx1Z2luPigpXG4gIHByaXZhdGUgX3Jvb3QhOiBFZGl0b3JSb290XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHVibGljIHJlYWRvbmx5IGNvbmZpZzogSUNvbnRyb2xsZXJDb25maWcsXG4gICAgcHVibGljIHJlYWRvbmx5IGluamVjdG9yOiBJbmplY3RvclxuICApIHtcbiAgICBjb25zdCB7aGlzdG9yeUNvbmZpZyA9IHtvcGVuOiB0cnVlLCBkdXJhdGlvbjogMzAwfX0gPSBjb25maWdcbiAgICB0aGlzLnJlYWRvbmx5JC5uZXh0KGNvbmZpZy5yZWFkb25seSB8fCBmYWxzZSlcbiAgICBpZiAoaGlzdG9yeUNvbmZpZy5vcGVuKSB7XG4gICAgICB0aGlzLmhpc3RvcnlNYW5hZ2VyID0gbmV3IFkuVW5kb01hbmFnZXIodGhpcy5yb290WU1vZGVsLFxuICAgICAgICB7Y2FwdHVyZVRpbWVvdXQ6IGhpc3RvcnlDb25maWcuZHVyYXRpb24gfHwgMjAwLCB0cmFja2VkT3JpZ2luczogbmV3IFNldChbbnVsbCwgVVNFUl9DSEFOR0VfU0lHTkFMXSl9KVxuICAgICAgdGhpcy5oaXN0b3J5TWFuYWdlci5vbignc3RhY2staXRlbS1hZGRlZCcsIChlKSA9PiB7XG4gICAgICAgIGlmIChlLnR5cGUgPT09ICd1bmRvJykge1xuICAgICAgICAgIGUuc3RhY2tJdGVtLm1ldGEuc2V0KCdzZWxlY3Rpb24nLCB0aGlzLnNlbGVjdGlvbi5nZXRTZWxlY3Rpb24oKSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIHRoaXMuaGlzdG9yeU1hbmFnZXIub24oJ3N0YWNrLWl0ZW0tcG9wcGVkJywgKGUpID0+IHtcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuYWN0aXZlRWxlbWVudCkgdGhpcy5zZWxlY3Rpb24uYXBwbHlSYW5nZShlLnN0YWNrSXRlbS5tZXRhLmdldCgnc2VsZWN0aW9uJykgYXMgYW55KVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9XG5cbiAgICB0aGlzLnJvb3RZTW9kZWwub2JzZXJ2ZSh0aGlzLl9yb290WU1vZGVsT2JzZXJ2ZXIpXG4gIH1cblxuICBhdHRhY2gocm9vdDogRWRpdG9yUm9vdCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIHJvb3QucmVhZHkkLnBpcGUodGFrZSgyKSkuc3Vic2NyaWJlKHYgPT4ge1xuICAgICAgICBpZiAoIXYpIHJldHVyblxuICAgICAgICB0aGlzLl9yb290ID0gcm9vdFxuICAgICAgICByb290LnNldENvbnRyb2xsZXIodGhpcylcbiAgICAgICAgdGhpcy5jbGlwYm9hcmQgPSBuZXcgQmxvY2tGbG93Q2xpcGJvYXJkKHRoaXMpXG4gICAgICAgIHRoaXMuc2VsZWN0aW9uID0gbmV3IEJsb2NrRmxvd1NlbGVjdGlvbih0aGlzKVxuICAgICAgICB0aGlzLmFkZFBsdWdpbnModGhpcy5jb25maWcucGx1Z2lucyB8fCBbXSlcblxuICAgICAgICB0aGlzLnJvb3Qub25EZXN0cm95LnBpcGUodGFrZSgxKSkuc3Vic2NyaWJlKCgpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpblN0b3JlLnZhbHVlcygpLmZvckVhY2gocGx1Z2luID0+IHtcbiAgICAgICAgICAgIHBsdWdpbi5kZXN0cm95KClcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgICAgICByZXNvbHZlKHRydWUpXG4gICAgICB9KVxuICAgIH0pXG4gIH1cblxuICBhZGRQbHVnaW5zKHBsdWdpbnM6IElQbHVnaW5bXSkge1xuICAgIGlmICghcGx1Z2lucy5sZW5ndGgpIHJldHVyblxuICAgIHRoaXMucm9vdC5yZWFkeSQucGlwZSh0YWtlV2hpbGUoQm9vbGVhbikpLnN1YnNjcmliZSh2ID0+IHtcbiAgICAgIGlmICghdikgcmV0dXJuXG4gICAgICBwbHVnaW5zLmZvckVhY2gocGx1Z2luID0+IHtcbiAgICAgICAgcGx1Z2luLmluaXQodGhpcylcbiAgICAgICAgdGhpcy5wbHVnaW5TdG9yZS5zZXQocGx1Z2luLm5hbWUsIHBsdWdpbilcbiAgICAgIH0pXG4gICAgfSlcbiAgfVxuXG4gIHRvZ2dsZVJlYWRvbmx5KGJvbCA9IHRydWUpIHtcbiAgICB0aGlzLnJlYWRvbmx5JC5uZXh0KGJvbClcbiAgfVxuXG4gIGdldCBzY2hlbWFzKCkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5zY2hlbWFzXG4gIH1cblxuICBnZXQgcm9vdCgpIHtcbiAgICByZXR1cm4gdGhpcy5fcm9vdFxuICB9XG5cbiAgZ2V0IHJvb3RFbGVtZW50KCkge1xuICAgIHJldHVybiB0aGlzLnJvb3Qucm9vdEVsZW1lbnRcbiAgfVxuXG4gIGdldCByb290SWQoKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLnJvb3RJZFxuICB9XG5cbiAgdG9KU09OKCkge1xuICAgIHJldHVybiB0aGlzLnJvb3RZTW9kZWwudG9KU09OKCkgYXMgSUJsb2NrTW9kZWxbXVxuICB9XG5cbiAgLyoqXG4gICAqIEp1c3Qgc3RvcmUgYmxvY2sgaW5zdGFuY2Ugd2hlbiBpdCByZW5kZXJlZFxuICAgKiBAcGFyYW0gYmxvY2tSZWYgYmxvY2sgaW5zdGFuY2VcbiAgICovXG4gIHN0b3JlQmxvY2tSZWY8QiBleHRlbmRzIEJhc2VCbG9jaz4oYmxvY2tSZWY6IEIpIHtcbiAgICB0aGlzLmJsb2NrUmVmU3RvcmUuc2V0KGJsb2NrUmVmLmlkLCBibG9ja1JlZilcbiAgICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLmJsb2Nrc1dhaXRpbmcpIHtcbiAgICAgIGlmIChrZXkgPT09IGJsb2NrUmVmLmlkKSB0aGlzLmJsb2Nrc1dhaXRpbmdba2V5XSA9IHRydWVcbiAgICAgIGlmICghdGhpcy5ibG9ja3NXYWl0aW5nW2tleV0pIHJldHVyblxuICAgIH1cbiAgICB0aGlzLmJsb2Nrc1JlYWR5JC5uZXh0KHRydWUpXG4gIH1cblxuICAvKiogLS0tLS0tLS0tLS0tLS0taGlzdG9yeS0tLS0tLS0tLS0tLS0tLS0gc3RhcnQgKiovXG4gIHRyYW5zYWN0KGZuOiAoKSA9PiB2b2lkLCBvcmlnaW46IGFueSA9IG51bGwpIHtcbiAgICB0aGlzLnlEb2MudHJhbnNhY3QoZm4sIG9yaWdpbilcbiAgfVxuXG4gIHN0b3BDYXB0dXJpbmcoKSB7XG4gICAgdGhpcy5oaXN0b3J5TWFuYWdlcj8uc3RvcENhcHR1cmluZygpXG4gIH1cblxuICB1bmRvKCkge1xuICAgIGlmICghdGhpcy5oaXN0b3J5TWFuYWdlcj8uY2FuVW5kbygpKSByZXR1cm5cbiAgICBpZiAodGhpcy51bmRvUmVkbyQudmFsdWUpIHJldHVyblxuICAgIHRoaXMudW5kb1JlZG8kLm5leHQodHJ1ZSlcbiAgICB0aGlzLmhpc3RvcnlNYW5hZ2VyIS51bmRvKClcbiAgICBQcm9taXNlLnJlc29sdmUoKS50aGVuKCgpID0+IHtcbiAgICAgIHRoaXMudW5kb1JlZG8kLm5leHQoZmFsc2UpXG4gICAgICAvLyDkuLTml7bmlrnmoYjvvIzop6PlhrPmkqTplIDlkI7nhKbngrnkuKLlpLHpl67pophcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgIGlmICghdGhpcy5hY3RpdmVFbGVtZW50IHx8IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkpIHRoaXMucm9vdEVsZW1lbnQuZm9jdXMoe3ByZXZlbnRTY3JvbGw6IHRydWV9KVxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgcmVkbygpIHtcbiAgICBpZiAoIXRoaXMuaGlzdG9yeU1hbmFnZXI/LmNhblJlZG8oKSkgcmV0dXJuXG4gICAgaWYgKHRoaXMudW5kb1JlZG8kLnZhbHVlKSByZXR1cm5cbiAgICB0aGlzLnVuZG9SZWRvJC5uZXh0KHRydWUpXG4gICAgdGhpcy5oaXN0b3J5TWFuYWdlciEucmVkbygpXG4gICAgUHJvbWlzZS5yZXNvbHZlKCkudGhlbigoKSA9PiB0aGlzLnVuZG9SZWRvJC5uZXh0KGZhbHNlKSlcbiAgfVxuXG4gIC8qKiAtLS0tLS0tLS0tLS0tLS1oaXN0b3J5LS0tLS0tLS0tLS0tLS0tLSBlbmQgKiovXG5cbiAgLyoqIC0tLS0tLS0tLS0tLS0tLWJsb2NrIG9wZXJhdGlvbi0tLS0tLS0tLS0tLS0tLS0gc3RhcnQgKiovXG4gIGdldCBibG9ja0xlbmd0aCgpIHtcbiAgICByZXR1cm4gdGhpcy5yb290TW9kZWwubGVuZ3RoXG4gIH1cblxuICBnZXRCbG9ja01vZGVsKGlkOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRCbG9ja1JlZihpZCk/Lm1vZGVsXG4gIH1cblxuICBjcmVhdGVCbG9jayhmbGF2b3VyOiBJQmxvY2tGbGF2b3VyLCBwYXJhbXM/OiBhbnlbXSkge1xuICAgIGNvbnN0IGIgPSB0aGlzLmNvbmZpZy5zY2hlbWFzLmNyZWF0ZShmbGF2b3VyLCBwYXJhbXMpXG4gICAgYi5tZXRhID0ge1xuICAgICAgLi4uYi5tZXRhLFxuICAgICAgY3JlYXRlZFRpbWU6IERhdGUubm93KCksXG4gICAgICBsYXN0TW9kaWZpZWQ6IHtcbiAgICAgICAgdGltZTogRGF0ZS5ub3coKSxcbiAgICAgICAgLi4udGhpcy5jb25maWcubG9jYWxVc2VyXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBCbG9ja01vZGVsLmZyb21Nb2RlbChiKVxuICB9XG5cbiAgaW5zZXJ0QmxvY2tzKGluZGV4OiBudW1iZXIsIGJsb2NrczogQmxvY2tNb2RlbFtdLCBwYXJlbnRJZDogc3RyaW5nID0gdGhpcy5yb290SWQsIHVuUmVjb3JkID0gZmFsc2UpIHtcbiAgICBibG9ja3MuZm9yRWFjaChiID0+IHtcbiAgICAgIHRoaXMuYmxvY2tzV2FpdGluZ1tiLmlkXSA9IGZhbHNlXG4gICAgfSlcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgaWYgKHBhcmVudElkID09PSB0aGlzLnJvb3RJZCkge1xuICAgICAgICB0aGlzLnRyYW5zYWN0KCgpID0+IHtcbiAgICAgICAgICB0aGlzLnJvb3RNb2RlbC5zcGxpY2UoaW5kZXgsIDAsIC4uLmJsb2NrcylcbiAgICAgICAgICB0aGlzLnJvb3RZTW9kZWwuaW5zZXJ0KGluZGV4LCBibG9ja3MubWFwKGIgPT4gYi55TW9kZWwpKVxuICAgICAgICB9LCB1blJlY29yZCA/IE5PX1JFQ09SRF9DSEFOR0VfU0lHTkFMIDogVVNFUl9DSEFOR0VfU0lHTkFMKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcGFyZW50TW9kZWwgPSB0aGlzLmdldEJsb2NrUmVmKHBhcmVudElkKT8ubW9kZWxcbiAgICAgICAgaWYgKCFwYXJlbnRNb2RlbCkgcmV0dXJuIHJlamVjdChuZXcgRXJyb3IoYFBhcmVudCBibG9jayAke3BhcmVudElkfSBub3QgZm91bmRgKSlcblxuICAgICAgICB0aGlzLnRyYW5zYWN0KCgpID0+IHtcbiAgICAgICAgICBwYXJlbnRNb2RlbC5pbnNlcnRDaGlsZHJlbihpbmRleCwgYmxvY2tzKVxuICAgICAgICB9LCB1blJlY29yZCA/IE5PX1JFQ09SRF9DSEFOR0VfU0lHTkFMIDogVVNFUl9DSEFOR0VfU0lHTkFMKVxuXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG9sSW5kZXggPSBibG9ja3MuZmluZEluZGV4KGIgPT4gYi5mbGF2b3VyID09PSAnb3JkZXJlZC1saXN0JylcbiAgICAgIGlmIChvbEluZGV4ID49IDAgJiYgIXVuUmVjb3JkKSB0aGlzLnVwZGF0ZU9yZGVyQXJvdW5kKGJsb2Nrc1tvbEluZGV4XSBhcyBhbnkpXG5cbiAgICAgIHRoaXMuYmxvY2tzUmVhZHkkLnBpcGUodGFrZSgxKSkuc3Vic2NyaWJlKHYgPT4gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHJlc29sdmUpKVxuICAgIH0pXG4gIH1cblxuICBkZWxldGVCbG9ja3MoaW5kZXg6IG51bWJlciwgY291bnQ6IG51bWJlciwgcGFyZW50SWQ6IHN0cmluZyA9IHRoaXMucm9vdElkKSB7XG4gICAgaWYgKGNvdW50IDw9IDApIHJldHVyblxuICAgIGlmIChwYXJlbnRJZCA9PT0gdGhpcy5yb290SWQpIHtcbiAgICAgIHRoaXMudHJhbnNhY3QoKCkgPT4ge1xuICAgICAgICBjb25zdCBpdGVtcyA9IHRoaXMucm9vdE1vZGVsLnNwbGljZShpbmRleCwgY291bnQpXG4gICAgICAgIHRoaXMucm9vdFlNb2RlbC5kZWxldGUoaW5kZXgsIGNvdW50KVxuXG4gICAgICAgIGlmIChpdGVtcy5zb21lKGIgPT4gYi5mbGF2b3VyID09PSAnb3JkZXJlZC1saXN0JykpIHtcbiAgICAgICAgICBjb25zdCBvbEluZGV4ID0gdGhpcy5yb290TW9kZWwuZmluZEluZGV4KChiLCBpKSA9PiBpID49IGluZGV4ICYmIGIuZmxhdm91ciA9PT0gJ29yZGVyZWQtbGlzdCcpXG4gICAgICAgICAgaWYgKG9sSW5kZXggPj0gMCkgdGhpcy51cGRhdGVPcmRlckFyb3VuZCh0aGlzLnJvb3RNb2RlbFtvbEluZGV4XSBhcyBhbnkpXG4gICAgICAgIH1cblxuICAgICAgfSwgVVNFUl9DSEFOR0VfU0lHTkFMKVxuXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgcGFyZW50TW9kZWwgPSB0aGlzLmdldEJsb2NrTW9kZWwocGFyZW50SWQpXG4gICAgaWYgKCFwYXJlbnRNb2RlbCkgdGhyb3cgbmV3IEVycm9yKGBQYXJlbnQgYmxvY2sgJHtwYXJlbnRJZH0gbm90IGZvdW5kYClcbiAgICBwYXJlbnRNb2RlbC5kZWxldGVDaGlsZHJlbihpbmRleCwgY291bnQpXG4gIH1cblxuICByZXBsYWNlQmxvY2tzKGluZGV4OiBudW1iZXIsIGNvdW50OiBudW1iZXIsIGJsb2NrczogQmxvY2tNb2RlbFtdLCBwYXJlbnRJZDogc3RyaW5nID0gdGhpcy5yb290SWQpIHtcbiAgICBpZiAoY291bnQgPD0gMCB8fCBibG9ja3MubGVuZ3RoIDw9IDApIHRocm93IG5ldyBFcnJvcihgQ291bnQgb3IgYmxvY2tzIG11c3QgYmUgZ3JlYXRlciB0aGFuIDBgKVxuICAgIGJsb2Nrcy5mb3JFYWNoKGIgPT4ge1xuICAgICAgdGhpcy5ibG9ja3NXYWl0aW5nW2IuaWRdID0gZmFsc2VcbiAgICB9KVxuICAgIGlmIChwYXJlbnRJZCA9PT0gdGhpcy5yb290SWQpIHtcblxuICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgdGhpcy50cmFuc2FjdCgoKSA9PiB7XG4gICAgICAgICAgdGhpcy5yb290WU1vZGVsLmRlbGV0ZShpbmRleCwgY291bnQpXG4gICAgICAgICAgdGhpcy5yb290WU1vZGVsLmluc2VydChpbmRleCwgYmxvY2tzLm1hcChiID0+IGIueU1vZGVsKSlcbiAgICAgICAgICB0aGlzLnJvb3RNb2RlbC5zcGxpY2UoaW5kZXgsIGNvdW50LCAuLi5ibG9ja3MpXG5cbiAgICAgICAgICBpZiAoYmxvY2tzLnNvbWUoYiA9PiBiLmZsYXZvdXIgPT09ICdvcmRlcmVkLWxpc3QnKSkge1xuICAgICAgICAgICAgY29uc3Qgb2xJbmRleCA9IHRoaXMucm9vdE1vZGVsLmZpbmRJbmRleCgoYiwgaSkgPT4gaSA+PSBpbmRleCAmJiBiLmZsYXZvdXIgPT09ICdvcmRlcmVkLWxpc3QnKVxuICAgICAgICAgICAgaWYgKG9sSW5kZXggPj0gMCkgdGhpcy51cGRhdGVPcmRlckFyb3VuZCh0aGlzLnJvb3RNb2RlbFtvbEluZGV4XSBhcyBhbnkpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5ibG9ja3NSZWFkeSQucGlwZSh0YWtlKDEpKS5zdWJzY3JpYmUodiA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocmVzb2x2ZSkpXG4gICAgICAgIH0sIFVTRVJfQ0hBTkdFX1NJR05BTClcbiAgICAgIH0pXG5cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRXJyb3IoYFBhcmVudCBibG9jayAke3BhcmVudElkfSBub3QgZm91bmRgKVxuICB9XG5cbiAgZGVsZXRlQmxvY2tCeUlkKGlkOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwYXRoID0gdGhpcy5nZXRCbG9ja1Bvc2l0aW9uKGlkKVxuICAgIGNvbnN0IHtpbmRleCwgcGFyZW50SWR9ID0gcGF0aFxuICAgIHJldHVybiB0aGlzLmRlbGV0ZUJsb2NrcyhpbmRleCwgMSwgcGFyZW50SWQpXG4gIH1cblxuICByZXBsYWNlV2l0aChpZDogc3RyaW5nLCBuZXdCbG9ja3M6IEJsb2NrTW9kZWxbXSkge1xuICAgIGNvbnN0IHtpbmRleCwgcGFyZW50SWR9ID0gdGhpcy5nZXRCbG9ja1Bvc2l0aW9uKGlkKSFcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIHRoaXMudHJhbnNhY3QoKCkgPT4ge1xuICAgICAgICB0aGlzLmRlbGV0ZUJsb2NrcyhpbmRleCwgMSwgcGFyZW50SWQpXG4gICAgICAgIHRoaXMuaW5zZXJ0QmxvY2tzKGluZGV4LCBuZXdCbG9ja3MsIHBhcmVudElkKS50aGVuKHJlc29sdmUpXG4gICAgICB9LCBVU0VSX0NIQU5HRV9TSUdOQUwpXG4gICAgfSlcbiAgfVxuXG4gIG1vdmVCbG9jayhvcmlnaW46IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcsIHBvc2l0aW9uOiAnYmVmb3JlJyB8ICdhZnRlcicpIHtcbiAgICBjb25zdCBvcmlnaW5Nb2RlbCA9IHRoaXMuZ2V0QmxvY2tSZWYob3JpZ2luKSEubW9kZWxcbiAgICBjb25zdCB0YXJnZXRNb2RlbCA9IHRoaXMuZ2V0QmxvY2tSZWYodGFyZ2V0KSEubW9kZWxcblxuICAgIGNvbnN0IG9yaWdpblBvcyA9IG9yaWdpbk1vZGVsLmdldFBvc2l0aW9uKClcbiAgICBjb25zdCB0YXJnZXRQb3MgPSB0YXJnZXRNb2RlbC5nZXRQb3NpdGlvbigpXG5cbiAgICBpZiAob3JpZ2luUG9zLnBhcmVudElkID09PSB0YXJnZXRQb3MucGFyZW50SWQgJiZcbiAgICAgICgob3JpZ2luUG9zLmluZGV4ID09PSB0YXJnZXRQb3MuaW5kZXgpIHx8XG4gICAgICAgIChwb3NpdGlvbiA9PT0gJ2JlZm9yZScgJiYgb3JpZ2luUG9zLmluZGV4ID09PSB0YXJnZXRQb3MuaW5kZXggLSAxKSB8fFxuICAgICAgICAocG9zaXRpb24gPT09ICdhZnRlcicgJiYgb3JpZ2luUG9zLmluZGV4ID09PSB0YXJnZXRQb3MuaW5kZXggKyAxKSlcbiAgICApIHJldHVyblxuXG4gICAgLy8gY29uc29sZS5sb2cob3JpZ2luTW9kZWwsIHRhcmdldE1vZGVsKVxuXG4gICAgLy8gY29uc3Qgb3JpZ2luUGFyZW50ID0gb3JpZ2luTW9kZWwueU1vZGVsLnBhcmVudCBhcyBZLkFycmF5PFlCbG9ja01vZGVsPlxuICAgIC8vIGNvbnN0IHRhcmdldFBhcmVudCA9IHRhcmdldE1vZGVsLnlNb2RlbC5wYXJlbnQgYXMgWS5BcnJheTxZQmxvY2tNb2RlbD5cblxuICAgIGNvbnN0IGluc2VydEluZGV4ID0gcG9zaXRpb24gPT09ICdiZWZvcmUnXG4gICAgICA/IChvcmlnaW5Qb3MuaW5kZXggPCB0YXJnZXRQb3MuaW5kZXggPyB0YXJnZXRQb3MuaW5kZXggLSAxIDogdGFyZ2V0UG9zLmluZGV4KVxuICAgICAgOiAob3JpZ2luUG9zLmluZGV4IDwgdGFyZ2V0UG9zLmluZGV4ID8gdGFyZ2V0UG9zLmluZGV4IDogdGFyZ2V0UG9zLmluZGV4ICsgMSlcblxuICAgIGNvbnN0IHltID0gb3JpZ2luTW9kZWwudG9KU09OKCkgYXMgSUJsb2NrTW9kZWxcblxuICAgIC8vIFRPRE86IOS8mOWMlu+8jOWFgeiuuOi3qOeItue6p+enu+WKqFxuICAgIHRoaXMuZGVsZXRlQmxvY2tzKG9yaWdpblBvcy5pbmRleCwgMSlcbiAgICB0aGlzLmluc2VydEJsb2NrcyhpbnNlcnRJbmRleCwgW0Jsb2NrTW9kZWwuZnJvbU1vZGVsKHltKV0pXG4gIH1cblxuICAvKiogLS0tLS0tLS0tLS0tLS0tYmxvY2sgb3BlcmF0aW9uLS0tLS0tLS0tLS0tLS0tLSBlbmQgKiovXG5cbiAgLyoqIC0tLS0tLS0tLS0tLS0tLXF1ZXJ5IGJsb2NrLS0tLS0tLS0tLS0tLS0tLSBzdGFydCAqKi9cbiAgZ2V0IGZpcnN0QmxvY2soKSB7XG4gICAgcmV0dXJuIHRoaXMucm9vdE1vZGVsWzBdXG4gIH1cblxuICBnZXQgbGFzdEJsb2NrKCkge1xuICAgIHJldHVybiB0aGlzLnJvb3RNb2RlbFt0aGlzLnJvb3RNb2RlbC5sZW5ndGggLSAxXVxuICB9XG5cbiAgZ2V0QmxvY2tQb3NpdGlvbihpZDogc3RyaW5nKSB7XG4gICAgY29uc3QgYlJlZiA9IHRoaXMuZ2V0QmxvY2tSZWYoaWQpXG4gICAgaWYgKCFiUmVmKSB0aHJvdyBuZXcgRXJyb3IoYEJsb2NrICR7aWR9IG5vdCBmb3VuZGApXG4gICAgY29uc3QgcG9zaXRpb24gPSBiUmVmLm1vZGVsLmdldFBvc2l0aW9uKClcbiAgICByZXR1cm4ge3BhcmVudElkOiBwb3NpdGlvbi5wYXJlbnRJZCB8fCB0aGlzLnJvb3RJZCwgaW5kZXg6IHBvc2l0aW9uLmluZGV4fVxuICB9XG5cbiAgZ2V0QmxvY2tSZWYoaWQ6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmJsb2NrUmVmU3RvcmUuZ2V0KGlkKVxuICB9XG5cbiAgZmluZFByZXZFZGl0YWJsZUJsb2NrTW9kZWwoaWQ6IHN0cmluZykge1xuICAgIGNvbnN0IHtpbmRleCwgcGFyZW50SWR9ID0gdGhpcy5nZXRCbG9ja1Bvc2l0aW9uKGlkKSFcbiAgICBjb25zdCBtYyA9IHBhcmVudElkID09PSB0aGlzLnJvb3RJZCA/IHRoaXMucm9vdE1vZGVsIDogdGhpcy5nZXRCbG9ja01vZGVsKHBhcmVudElkKSEuY2hpbGRyZW4gYXMgQmxvY2tNb2RlbFtdXG4gICAgbGV0IHAgPSBpbmRleCAtIDFcbiAgICB3aGlsZSAocCA+PSAwKSB7XG4gICAgICBjb25zdCBwcmV2ID0gbWNbcF1cbiAgICAgIGlmICh0aGlzLmlzRWRpdGFibGUocHJldikpIHJldHVybiBwcmV2XG4gICAgICBwLS1cbiAgICB9XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIGZpbmRQcmV2RWRpdGFibGVCbG9jayhpZDogc3RyaW5nKTogRWRpdGFibGVCbG9jayB8IG51bGwge1xuICAgIGNvbnN0IHByZXYgPSB0aGlzLmZpbmRQcmV2RWRpdGFibGVCbG9ja01vZGVsKGlkKVxuICAgIGlmICghcHJldikgcmV0dXJuIG51bGxcbiAgICByZXR1cm4gdGhpcy5nZXRCbG9ja1JlZihwcmV2LmlkKSBhcyBFZGl0YWJsZUJsb2NrXG4gIH1cblxuICBmaW5kTmV4dEJsb2NrTW9kZWwoaWQ6IHN0cmluZykge1xuICAgIGNvbnN0IHtpbmRleCwgcGFyZW50SWR9ID0gdGhpcy5nZXRCbG9ja1Bvc2l0aW9uKGlkKSFcbiAgICBjb25zdCBtYyA9IHBhcmVudElkID09PSB0aGlzLnJvb3RJZCA/IHRoaXMucm9vdE1vZGVsIDogdGhpcy5nZXRCbG9ja01vZGVsKHBhcmVudElkKSEuY2hpbGRyZW4gYXMgQmxvY2tNb2RlbFtdXG4gICAgaWYgKGluZGV4ID49IG1jLmxlbmd0aCAtIDEpIHJldHVybiBudWxsXG4gICAgcmV0dXJuIG1jW2luZGV4ICsgMV1cbiAgfVxuXG4gIGZpbmROZXh0RWRpdGFibGVCbG9ja01vZGVsKGlkOiBzdHJpbmcpIHtcbiAgICBjb25zdCB7aW5kZXgsIHBhcmVudElkfSA9IHRoaXMuZ2V0QmxvY2tQb3NpdGlvbihpZCkhXG4gICAgY29uc3QgbWMgPSBwYXJlbnRJZCA9PT0gdGhpcy5yb290SWQgPyB0aGlzLnJvb3RNb2RlbCA6IHRoaXMuZ2V0QmxvY2tNb2RlbChwYXJlbnRJZCkhLmNoaWxkcmVuIGFzIEJsb2NrTW9kZWxbXVxuICAgIGxldCBwID0gaW5kZXggKyAxXG4gICAgd2hpbGUgKHAgPD0gbWMubGVuZ3RoIC0gMSkge1xuICAgICAgY29uc3QgbmV4dCA9IG1jW3BdXG4gICAgICBpZiAodGhpcy5pc0VkaXRhYmxlKG5leHQpKSByZXR1cm4gbmV4dFxuICAgICAgcCsrXG4gICAgfVxuICAgIHJldHVybiBudWxsXG4gIH1cblxuICBmaW5kTmV4dEVkaXRhYmxlQmxvY2soaWQ6IHN0cmluZyk6IEVkaXRhYmxlQmxvY2sgfCBudWxsIHtcbiAgICBjb25zdCBuZXh0ID0gdGhpcy5maW5kTmV4dEVkaXRhYmxlQmxvY2tNb2RlbChpZClcbiAgICBpZiAoIW5leHQpIHJldHVybiBudWxsXG4gICAgcmV0dXJuIHRoaXMuZ2V0QmxvY2tSZWYobmV4dC5pZCkgYXMgRWRpdGFibGVCbG9ja1xuICB9XG5cbiAgLyoqIC0tLS0tLS0tLS0tLS0tLXF1ZXJ5IGJsb2NrLS0tLS0tLS0tLS0tLS0tLSBlbmQgKiovXG5cbiAgLyoqIC0tLS0tLS0tLS0tLS0tLWZvY3VzICwgc2VsZWN0aW9uLS0tLS0tLS0tLS0tLS0tLSBzdGFydCAqKi9cbiAgZ2V0IGFjdGl2ZUVsZW1lbnQoKSB7XG4gICAgcmV0dXJuIHRoaXMucm9vdC5hY3RpdmVFbGVtZW50XG4gIH1cblxuICBpc0VkaXRhYmxlQmxvY2soYmxvY2s6IEJhc2VCbG9jazxhbnk+KTogYmxvY2sgaXMgRWRpdGFibGVCbG9jayB7XG4gICAgcmV0dXJuIGJsb2NrIGluc3RhbmNlb2YgRWRpdGFibGVCbG9ja1xuICB9XG5cbiAgaXNFZGl0YWJsZShiOiBzdHJpbmcgfCBCbG9ja01vZGVsIHwgQmFzZUJsb2NrIHwgRWRpdGFibGVCbG9jaykge1xuICAgIHJldHVybiB0eXBlb2YgYiA9PT0gJ3N0cmluZycgPyB0aGlzLmdldEJsb2NrTW9kZWwoYik/Lm5vZGVUeXBlID09PSAnZWRpdGFibGUnIDogYi5ub2RlVHlwZSA9PT0gJ2VkaXRhYmxlJ1xuICB9XG5cbiAgZ2V0Rm9jdXNpbmdCbG9ja0lkKCkge1xuICAgIHJldHVybiB0aGlzLnJvb3QuZ2V0QWN0aXZlQmxvY2tJZCgpXG4gIH1cblxuICBnZXRGb2N1c2luZ0Jsb2NrUmVmKCkge1xuICAgIHJldHVybiB0aGlzLnJvb3QuYWN0aXZlQmxvY2tcbiAgfVxuXG4gIGRlbGV0ZVNlbGVjdGVkQmxvY2tzKCkge1xuICAgIGNvbnN0IHJvb3RSYW5nZSA9IHRoaXMucm9vdC5zZWxlY3RlZEJsb2NrUmFuZ2VcbiAgICBpZiAoIXJvb3RSYW5nZSkgcmV0dXJuXG4gICAgY29uc3Qge3N0YXJ0LCBlbmR9ID0gcm9vdFJhbmdlXG4gICAgdGhpcy5kZWxldGVCbG9ja3Moc3RhcnQsIGVuZCAtIHN0YXJ0KVxuICAgIHRoaXMucm9vdC5jbGVhclNlbGVjdGVkQmxvY2tSYW5nZSgpXG4gICAgcmV0dXJuIFtzdGFydCwgZW5kXVxuICB9XG5cbiAgLyoqIC0tLS0tLS0tLS0tLS0tLWZvY3VzICwgc2VsZWN0aW9uLS0tLS0tLS0tLS0tLS0tLSBlbmQgKiovXG5cbiAgLyoqIC0tLS0tLS0tLS0tLS0tLUZvciBvcmRlcmVkLWxpc3QgYmxvY2stLS0tLS0tLS0tLS0tLS0tIHN0YXJ0ICoqL1xuICB1cGRhdGVPcmRlckFyb3VuZChibG9jazogQmxvY2tNb2RlbDxJT3JkZXJlZExpc3RCbG9ja01vZGVsPikge1xuICAgIHRoaXMudHJhbnNhY3QoKCkgPT4ge1xuICAgICAgdXBkYXRlT3JkZXJBcm91bmQoYmxvY2ssIHRoaXMpXG4gICAgfSwgVVNFUl9DSEFOR0VfU0lHTkFMKVxuICB9XG5cbiAgLyoqIC0tLS0tLS0tLS0tLS0tLUZvciBvcmRlcmVkLWxpc3QgYmxvY2stLS0tLS0tLS0tLS0tLS0tIGVuZCAqKi9cbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZWxlY3Rpb25DaGFuZ2VFdmVudCB7XG4gIGRvY3VtZW50U2VsZWN0aW9uOiBTZWxlY3Rpb24sXG4gIGJsb2NrRmxvd1NlbGVjdGlvbjogQmxvY2tGbG93U2VsZWN0aW9uLFxufVxuXG5leHBvcnQgY2xhc3MgQmxvY2tGbG93U2VsZWN0aW9uIHtcbiAgLy8gcHVibGljIHJlYWRvbmx5IHNlbGVjdGlvbkNoYW5nZSQgPSBuZXcgQmVoYXZpb3JTdWJqZWN0PElCbG9ja0Zsb3dSYW5nZSB8IG51bGw+KG51bGwpXG4gIHB1YmxpYyByZWFkb25seSBhY3RpdmVCbG9jayQgPSB0aGlzLmNvbnRyb2xsZXIucm9vdC5hY3RpdmVCbG9jayRcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwdWJsaWMgcmVhZG9ubHkgY29udHJvbGxlcjogQ29udHJvbGxlclxuICApIHtcbiAgICAvLyBmcm9tRXZlbnQoZG9jdW1lbnQsICdzZWxlY3Rpb25jaGFuZ2UnKS5waXBlKHRha2VVbnRpbCh0aGlzLnJvb3Qub25EZXN0cm95KSkuc3Vic2NyaWJlKHYgPT4ge1xuICAgIC8vICAgY29uc29sZS50aW1lKCdnZXRTZWxlY3Rpb24nKVxuICAgIC8vICAgdGhpcy5zZWxlY3Rpb25DaGFuZ2UkLm5leHQodGhpcy5nZXRTZWxlY3Rpb24oKSlcbiAgICAvLyAgIGNvbnNvbGUudGltZUVuZCgnZ2V0U2VsZWN0aW9uJylcbiAgICAvLyB9KVxuICB9XG5cbiAgZ2V0IGFjdGl2ZUVsZW1lbnQoKSB7XG4gICAgcmV0dXJuIHRoaXMuY29udHJvbGxlci5hY3RpdmVFbGVtZW50XG4gIH1cblxuICBnZXQgcm9vdCgpIHtcbiAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyLnJvb3RcbiAgfVxuXG4gIG5vcm1hbGl6ZVN0YXRpY1JhbmdlKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCByYW5nZTogU3RhdGljUmFuZ2UpIHtcbiAgICByZXR1cm4gbm9ybWFsaXplU3RhdGljUmFuZ2UoZWxlbWVudCwgcmFuZ2UpXG4gIH1cblxuICBmb2N1c1RvKGlkOiBzdHJpbmcsIGZyb206IENoYXJhY3RlckluZGV4LCB0bz86IENoYXJhY3RlckluZGV4KSB7XG4gICAgY29uc3QgYmxvY2sgPSB0aGlzLmNvbnRyb2xsZXIuZ2V0QmxvY2tSZWYoaWQpXG4gICAgaWYgKCFibG9jaykgcmV0dXJuXG4gICAgaWYgKHRoaXMuY29udHJvbGxlci5pc0VkaXRhYmxlQmxvY2soYmxvY2spKSB7XG4gICAgICBibG9jay5zZXRTZWxlY3Rpb24oZnJvbSwgdG8pXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcG9zID0gYmxvY2suZ2V0UG9zaXRpb24oKVxuICAgIGlmIChwb3MucGFyZW50SWQgIT09IHRoaXMuY29udHJvbGxlci5yb290SWQpIHJldHVybjtcbiAgICB0aGlzLnJvb3Quc2VsZWN0QmxvY2tzKHBvcy5pbmRleCwgcG9zLmluZGV4ICsgMSlcbiAgfVxuXG4gIGdldFNlbGVjdGlvbigpOiBJQmxvY2tGbG93UmFuZ2UgfCBudWxsIHtcbiAgICBpZiAoIXRoaXMuYWN0aXZlRWxlbWVudCkgcmV0dXJuIG51bGxcbiAgICBpZiAodGhpcy5hY3RpdmVFbGVtZW50ID09PSB0aGlzLnJvb3Qucm9vdEVsZW1lbnQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJvb3RSYW5nZTogdGhpcy5yb290LnNlbGVjdGVkQmxvY2tSYW5nZSxcbiAgICAgICAgaXNBdFJvb3Q6IHRydWUsXG4gICAgICAgIHJvb3RJZDogdGhpcy5jb250cm9sbGVyLnJvb3RJZCxcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIGJsb2NrUmFuZ2U6IGdldEN1cnJlbnRDaGFyYWN0ZXJSYW5nZSh0aGlzLmFjdGl2ZUVsZW1lbnQpLFxuICAgICAgaXNBdFJvb3Q6IGZhbHNlLFxuICAgICAgYmxvY2tJZDogdGhpcy5yb290LmdldEFjdGl2ZUJsb2NrSWQoKSEsXG4gICAgfVxuICB9XG5cbiAgc2V0U2VsZWN0aW9uKHRhcmdldDogc3RyaW5nLCBmcm9tOiBDaGFyYWN0ZXJJbmRleCwgdG8/OiBDaGFyYWN0ZXJJbmRleCkge1xuICAgIGlmICh0YXJnZXQgPT09IHRoaXMuY29udHJvbGxlci5yb290SWQpIHtcbiAgICAgIHRoaXMucm9vdC5zZWxlY3RCbG9ja3MoZnJvbSwgdG8gPz8gZnJvbSlcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgYlJlZiA9IHRoaXMuY29udHJvbGxlci5nZXRCbG9ja1JlZih0YXJnZXQpXG4gICAgICBpZiAoIWJSZWYgfHwgYlJlZi5ub2RlVHlwZSAhPT0gJ2VkaXRhYmxlJykgcmV0dXJuXG4gICAgICAvLyBAdHMtaWdub3JlXG4gICAgICBiUmVmLnNldFNlbGVjdGlvbihmcm9tLCB0byA/PyBmcm9tKVxuICAgIH1cbiAgfVxuXG4gIGFwcGx5UmFuZ2UocmFuZ2U6IElCbG9ja0Zsb3dSYW5nZSkge1xuICAgIGlmICghcmFuZ2UpIHJldHVyblxuICAgIGlmIChyYW5nZS5pc0F0Um9vdCkge1xuICAgICAgaWYgKCFyYW5nZS5yb290UmFuZ2UpIHRoaXMucm9vdC5yb290RWxlbWVudC5mb2N1cyh7cHJldmVudFNjcm9sbDogdHJ1ZX0pXG4gICAgICBlbHNlIHRoaXMuc2V0U2VsZWN0aW9uKHJhbmdlLnJvb3RJZCwgcmFuZ2Uucm9vdFJhbmdlIS5zdGFydCwgcmFuZ2Uucm9vdFJhbmdlIS5lbmQpXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc2V0U2VsZWN0aW9uKHJhbmdlLmJsb2NrSWQsIHJhbmdlLmJsb2NrUmFuZ2UhLnN0YXJ0LCByYW5nZS5ibG9ja1JhbmdlIS5lbmQpXG4gICAgfVxuICB9XG5cbiAgZ2V0Q3VycmVudENoYXJhY3RlclJhbmdlKCkge1xuICAgIGlmICghdGhpcy5jb250cm9sbGVyLmFjdGl2ZUVsZW1lbnQgfHwgdGhpcy5jb250cm9sbGVyLmFjdGl2ZUVsZW1lbnQgPT09IHRoaXMuY29udHJvbGxlci5yb290RWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGFjdGl2ZSBlbGVtZW50JylcbiAgICByZXR1cm4gZ2V0Q3VycmVudENoYXJhY3RlclJhbmdlKHRoaXMuY29udHJvbGxlci5hY3RpdmVFbGVtZW50KVxuICB9XG59XG5cbmNsYXNzIEJsb2NrRmxvd0NsaXBib2FyZCB7XG4gIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgQ0xJUEJPQVJEX0RBVEFfVFlQRSA9ICdAYmYvanNvbidcbiAgcHVibGljIHN0YXRpYyByZWFkb25seSBTSUdOX0NMSVBCT0FSRF9KU09OX0RFTFRBID0gJ0BiZi1kZWx0YS9qc29uOiAnXG4gIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgU0lHTl9DTElQQk9BUkRfSlNPTl9CTE9DS1MgPSAnQGJmLWJsb2Nrcy9qc29uOiAnXG5cbiAgcHJvdGVjdGVkIHJlYWRvbmx5IGh0bWxDb252ZXJ0ZXIgPSBuZXcgSHRtbENvbnZlcnRlcih0aGlzLmNvbnRyb2xsZXIuc2NoZW1hcylcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwdWJsaWMgcmVhZG9ubHkgY29udHJvbGxlcjogQ29udHJvbGxlclxuICApIHtcbiAgICBmcm9tRXZlbnQ8Q2xpcGJvYXJkRXZlbnQ+KGRvY3VtZW50LCAnY29weScpLnBpcGUodGFrZVVudGlsKGNvbnRyb2xsZXIucm9vdC5vbkRlc3Ryb3kpKS5zdWJzY3JpYmUodGhpcy5vbkNvcHkpXG4gICAgZnJvbUV2ZW50PENsaXBib2FyZEV2ZW50Pihkb2N1bWVudCwgJ2N1dCcpLnBpcGUodGFrZVVudGlsKGNvbnRyb2xsZXIucm9vdC5vbkRlc3Ryb3kpKS5zdWJzY3JpYmUodGhpcy5vbkN1dClcbiAgICBmcm9tRXZlbnQ8RHJhZ0V2ZW50Pihjb250cm9sbGVyLnJvb3RFbGVtZW50LCAnZHJvcCcpLnBpcGUodGFrZVVudGlsKGNvbnRyb2xsZXIucm9vdC5vbkRlc3Ryb3kpKS5zdWJzY3JpYmUodGhpcy5vbkRyb3ApXG4gICAgZnJvbUV2ZW50PENsaXBib2FyZEV2ZW50Pihjb250cm9sbGVyLnJvb3RFbGVtZW50LCAncGFzdGUnKS5waXBlKHRha2VVbnRpbChjb250cm9sbGVyLnJvb3Qub25EZXN0cm95KSkuc3Vic2NyaWJlKHRoaXMub25QYXN0ZSlcbiAgfVxuXG4gIGV4ZWNDb21tYW5kKGNvbW1hbmQ6ICdjdXQnIHwgJ2NvcHknKSB7XG4gICAgZG9jdW1lbnQuZXhlY0NvbW1hbmQoY29tbWFuZClcbiAgfVxuXG4gIGNvcHkoKSB7XG4gICAgdGhpcy5leGVjQ29tbWFuZCgnY29weScpXG4gIH1cblxuICBjdXQoKSB7XG4gICAgdGhpcy5leGVjQ29tbWFuZCgnY3V0JylcbiAgfVxuXG4gIHdyaXRlVGV4dCh0ZXh0OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQocHVyaWZ5U3RyaW5nKHRleHQpKVxuICB9XG5cbiAgcHJpdmF0ZSBfZGF0YV93cml0ZTogQXJyYXk8eyB0eXBlOiAnZGVsdGEnLCBkYXRhOiBEZWx0YUluc2VydFtdIH1cbiAgICAgIHwgeyB0eXBlOiAnYmxvY2snLCBkYXRhOiBJQmxvY2tNb2RlbFtdIH1cbiAgICAgIHwgeyB0eXBlOiAndGV4dCcsIGRhdGE6IHN0cmluZyB9XG4gICAgICB8IHsgdHlwZTogJ3RleHQvdXJpLWxpc3QnLCBkYXRhOiBzdHJpbmcgfVxuICAgID5cbiAgICB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZFxuXG4gIHByaXZhdGUgX2RhdGFfd3JpdGVfb2sgPSBuZXcgU3ViamVjdDxib29sZWFuPigpXG5cbiAgd3JpdGVEYXRhKGRhdGE6IHR5cGVvZiB0aGlzLl9kYXRhX3dyaXRlKSB7XG4gICAgaWYgKCFkYXRhKSByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdkYXRhIGlzIGVtcHR5JykpXG4gICAgdGhpcy5fZGF0YV93cml0ZSA9IGRhdGFcbiAgICBkb2N1bWVudC5leGVjQ29tbWFuZCgnY29weScpXG4gICAgcmV0dXJuIGxhc3RWYWx1ZUZyb20odGhpcy5fZGF0YV93cml0ZV9vay5waXBlKHRha2UoMSkpKVxuICB9XG5cbiAgcHJpdmF0ZSBvbkNvcHkgPSAoZXZlbnQ6IENsaXBib2FyZEV2ZW50KSA9PiB7XG4gICAgaWYgKHRoaXMuX2RhdGFfd3JpdGUpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgICAgIGNvbnN0IGNsaXBib2FyZERhdGEgPSBldmVudC5jbGlwYm9hcmREYXRhIVxuXG4gICAgICB0aGlzLl9kYXRhX3dyaXRlLmZvckVhY2godiA9PiB7XG4gICAgICAgIGNvbnN0IHtkYXRhLCB0eXBlfSA9IHZcbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgY2FzZSAndGV4dCc6XG4gICAgICAgICAgICBjbGlwYm9hcmREYXRhLnNldERhdGEoJ3RleHQvcGxhaW4nLCBwdXJpZnlTdHJpbmcoZGF0YSBhcyBzdHJpbmcpKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlICdibG9jayc6XG4gICAgICAgICAgY2FzZSAnZGVsdGEnOlxuICAgICAgICAgICAgY2xpcGJvYXJkRGF0YS5zZXREYXRhKEJsb2NrRmxvd0NsaXBib2FyZC5DTElQQk9BUkRfREFUQV9UWVBFLFxuICAgICAgICAgICAgICAodHlwZSA9PT0gJ2RlbHRhJyA/IEJsb2NrRmxvd0NsaXBib2FyZC5TSUdOX0NMSVBCT0FSRF9KU09OX0RFTFRBIDogQmxvY2tGbG93Q2xpcGJvYXJkLlNJR05fQ0xJUEJPQVJEX0pTT05fQkxPQ0tTKSArIEpTT04uc3RyaW5naWZ5KGRhdGEpXG4gICAgICAgICAgICApXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ3RleHQvdXJpLWxpc3QnOlxuICAgICAgICAgICAgY2xpcGJvYXJkRGF0YS5zZXREYXRhKCd0ZXh0L3VyaS1saXN0JywgZGF0YSBhcyBzdHJpbmcpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgdGhpcy5fZGF0YV93cml0ZSA9IHVuZGVmaW5lZFxuICAgICAgdGhpcy5fZGF0YV93cml0ZV9vay5uZXh0KHRydWUpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBjdXJSYW5nZSA9IHRoaXMuY29udHJvbGxlci5zZWxlY3Rpb24uZ2V0U2VsZWN0aW9uKClcbiAgICBpZiAoIWN1clJhbmdlKSByZXR1cm4gbnVsbFxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgICBjb25zdCBjbGlwYm9hcmREYXRhID0gZXZlbnQuY2xpcGJvYXJkRGF0YSFcbiAgICBpZiAoIWN1clJhbmdlLmlzQXRSb290KSB7XG4gICAgICBjb25zdCB7YmxvY2tSYW5nZTogcmFuZ2UsIGJsb2NrSWR9ID0gY3VyUmFuZ2VcbiAgICAgIGlmIChyYW5nZS5zdGFydCA9PT0gcmFuZ2UuZW5kKSB0aHJvdyBuZXcgRXJyb3IoJ1RoZSByYW5nZSBpcyBjb2xsYXBzZWQnKVxuICAgICAgY29uc3QgYlJlZiA9IHRoaXMuY29udHJvbGxlci5nZXRCbG9ja1JlZihibG9ja0lkKVxuICAgICAgaWYgKCFiUmVmIHx8ICF0aGlzLmNvbnRyb2xsZXIuaXNFZGl0YWJsZUJsb2NrKGJSZWYpKSB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBibG9jayBpcyBub3QgZWRpdGFibGUnKVxuXG4gICAgICBpZiAodGhpcy5jb250cm9sbGVyLmFjdGl2ZUVsZW1lbnQ/LmNsYXNzTGlzdC5jb250YWlucygnYmYtcGxhaW4tdGV4dC1vbmx5JykpIHtcbiAgICAgICAgY2xpcGJvYXJkRGF0YS5zZXREYXRhKCd0ZXh0L3BsYWluJywgcHVyaWZ5U3RyaW5nKGJSZWYuZ2V0VGV4dENvbnRlbnQoKS5zbGljZShyYW5nZS5zdGFydCwgcmFuZ2UuZW5kKSkpXG4gICAgICAgIHJldHVybiB7cmFuZ2U6IGN1clJhbmdlLCBjbGlwYm9hcmREYXRhfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBkZWx0YUNvbmNhdCA9IHNsaWNlRGVsdGEoYlJlZi5nZXRUZXh0RGVsdGEoKSwgcmFuZ2Uuc3RhcnQsIHJhbmdlLmVuZClcbiAgICAgIGNsaXBib2FyZERhdGEuc2V0RGF0YSgndGV4dC9wbGFpbicsIHB1cmlmeVN0cmluZyhkZWx0YVRvU3RyaW5nKGRlbHRhQ29uY2F0KSkpXG4gICAgICBjbGlwYm9hcmREYXRhLnNldERhdGEoQmxvY2tGbG93Q2xpcGJvYXJkLkNMSVBCT0FSRF9EQVRBX1RZUEUsIEJsb2NrRmxvd0NsaXBib2FyZC5TSUdOX0NMSVBCT0FSRF9KU09OX0RFTFRBICsgSlNPTi5zdHJpbmdpZnkoZGVsdGFDb25jYXQpKVxuICAgICAgcmV0dXJuIHtyYW5nZTogY3VyUmFuZ2UsIGNsaXBib2FyZERhdGF9XG4gICAgfVxuXG4gICAgY29uc3Qge3Jvb3RSYW5nZX0gPSBjdXJSYW5nZVxuICAgIGlmICghcm9vdFJhbmdlKSB0aHJvdyBuZXcgRXJyb3IoJ05vIHJhbmdlIHNlbGVjdGVkJylcbiAgICBjb25zdCBibG9ja3MgPSB0aGlzLmNvbnRyb2xsZXIucm9vdE1vZGVsLnNsaWNlKHJvb3RSYW5nZS5zdGFydCwgcm9vdFJhbmdlLmVuZCkubWFwKChibG9jaykgPT4gYmxvY2sudG9KU09OKCkpXG4gICAgY2xpcGJvYXJkRGF0YS5zZXREYXRhKEJsb2NrRmxvd0NsaXBib2FyZC5DTElQQk9BUkRfREFUQV9UWVBFLCBCbG9ja0Zsb3dDbGlwYm9hcmQuU0lHTl9DTElQQk9BUkRfSlNPTl9CTE9DS1MgKyBKU09OLnN0cmluZ2lmeShibG9ja3MpKVxuICAgIHJldHVybiB7cmFuZ2U6IGN1clJhbmdlLCBjbGlwYm9hcmREYXRhfVxuICB9XG5cbiAgcHJpdmF0ZSBvbkN1dCA9IChldmVudDogQ2xpcGJvYXJkRXZlbnQpID0+IHtcbiAgICBjb25zdCByZXMgPSB0aGlzLm9uQ29weShldmVudClcbiAgICBpZiAoIXJlcykgcmV0dXJuXG4gICAgY29uc3Qge3JhbmdlfSA9IHJlc1xuICAgIGlmICghcmFuZ2UuaXNBdFJvb3QpIHtcbiAgICAgIGNvbnN0IHtibG9ja1JhbmdlLCBibG9ja0lkfSA9IHJhbmdlXG4gICAgICBjb25zdCBiUmVmID0gdGhpcy5jb250cm9sbGVyLmdldEJsb2NrUmVmKGJsb2NrSWQpXG4gICAgICBpZiAoIWJSZWYgfHwgIXRoaXMuY29udHJvbGxlci5pc0VkaXRhYmxlQmxvY2soYlJlZikpIHRocm93IG5ldyBFcnJvcignVGhlIGJsb2NrIGlzIG5vdCBlZGl0YWJsZScpXG5cbiAgICAgIGNvbnN0IGRlbHRhcyA9IFt7cmV0YWluOiBibG9ja1JhbmdlLnN0YXJ0fSwge2RlbGV0ZTogYmxvY2tSYW5nZS5lbmQgLSBibG9ja1JhbmdlLnN0YXJ0fV1cbiAgICAgIGRvY3VtZW50LmdldFNlbGVjdGlvbigpPy5jb2xsYXBzZVRvU3RhcnQoKVxuICAgICAgYlJlZi5hcHBseURlbHRhKGRlbHRhcywgZmFsc2UpXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgcm9vdFJhbmdlID0gcmFuZ2Uucm9vdFJhbmdlIVxuICAgIHRoaXMuY29udHJvbGxlci5kZWxldGVCbG9ja3Mocm9vdFJhbmdlLnN0YXJ0LCByb290UmFuZ2UuZW5kIC0gcm9vdFJhbmdlLnN0YXJ0KVxuICB9XG5cbiAgcHJpdmF0ZSB1cGxvYWRJbWcgPSBhc3luYyAoZmlsZTogRmlsZSkgPT4ge1xuICAgIGNvbnN0IGltZ1VwbG9hZGVyID0gdGhpcy5jb250cm9sbGVyLmluamVjdG9yLmdldChGSUxFX1VQTE9BREVSKVxuICAgIGlmICghaW1nVXBsb2FkZXIpIHRocm93IG5ldyBFcnJvcignaW1nVXBsb2FkZXIgaXMgcmVxdWlyZWQnKVxuICAgIHJldHVybiBhd2FpdCBpbWdVcGxvYWRlci51cGxvYWRJbWcoZmlsZSlcbiAgfVxuXG4gIHByaXZhdGUgb25QYXN0ZSA9IGFzeW5jIChldmVudDogQ2xpcGJvYXJkRXZlbnQpID0+IHtcbiAgICBpZiAodGhpcy5jb250cm9sbGVyLnJlYWRvbmx5JC52YWx1ZSkgcmV0dXJuXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgIGNvbnN0IGNsaXBib2FyZERhdGEgPSBldmVudC5jbGlwYm9hcmREYXRhIVxuICAgIGNvbnNvbGUubG9nKGNsaXBib2FyZERhdGEudHlwZXMpXG4gICAgY29uc3QgY3VyUmFuZ2UgPSB0aGlzLmNvbnRyb2xsZXIuc2VsZWN0aW9uLmdldFNlbGVjdGlvbigpXG4gICAgaWYgKCFjdXJSYW5nZSkgcmV0dXJuXG5cbiAgICAvLyB0ZXh0L3VyaS1saXN0XG4gICAgaWYgKGNsaXBib2FyZERhdGEudHlwZXMuaW5jbHVkZXMoJ3RleHQvdXJpLWxpc3QnKSkge1xuICAgICAgY29uc3QgdXJpID0gY2xpcGJvYXJkRGF0YS5nZXREYXRhKCd0ZXh0L3VyaS1saXN0Jykuc3BsaXQoJ1xcbicpWzBdXG4gICAgICBpZiAoY3VyUmFuZ2UuaXNBdFJvb3QpIHJldHVyblxuICAgICAgY29uc3QgYlJlZiA9IHRoaXMuY29udHJvbGxlci5nZXRCbG9ja1JlZihjdXJSYW5nZS5ibG9ja0lkKVxuICAgICAgaWYgKCFiUmVmIHx8ICF0aGlzLmNvbnRyb2xsZXIuaXNFZGl0YWJsZUJsb2NrKGJSZWYpKSB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBibG9jayBpcyBub3QgZWRpdGFibGUnKVxuICAgICAgY29uc3Qge3BhcmVudElkLCBpbmRleH0gPSBiUmVmLmdldFBvc2l0aW9uKClcbiAgICAgIGlmIChiUmVmLmNvbnRhaW5lckVsZS5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLXBsYWluLXRleHQtb25seScpKSB7XG4gICAgICAgIGJSZWYuYXBwbHlEZWx0YShbe3JldGFpbjogY3VyUmFuZ2UuYmxvY2tSYW5nZS5zdGFydH0sIHtpbnNlcnQ6IHVyaX1dKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGlmIChiUmVmLmNvbnRhaW5lckVsZS5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLW11bHRpLWxpbmUnKSAmJiBbJ3BuZycsICdqcGcnLCAnanBlZycsICdnaWYnXS5sYXN0SW5kZXhPZih1cmkpKSB7XG4gICAgICAgIGJSZWYuYXBwbHlEZWx0YShbe3JldGFpbjogY3VyUmFuZ2UuYmxvY2tSYW5nZS5zdGFydH0sIHtpbnNlcnQ6IHtpbWFnZTogdXJpfX1dKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGlmIChwYXJlbnRJZCA9PT0gdGhpcy5jb250cm9sbGVyLnJvb3RJZCkge1xuICAgICAgICBjb25zdCBibG9jayA9IHRoaXMuY29udHJvbGxlci5jcmVhdGVCbG9jaygnaW1hZ2UnLCBbdXJpXSlcbiAgICAgICAgdGhpcy5jb250cm9sbGVyLmluc2VydEJsb2NrcyhpbmRleCArIDEsIFtibG9ja10sIHRoaXMuY29udHJvbGxlci5yb290SWQpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGZpbGVzXG4gICAgaWYgKGNsaXBib2FyZERhdGEudHlwZXMuaW5jbHVkZXMoJ0ZpbGVzJykpIHtcbiAgICAgIGlmIChjdXJSYW5nZS5pc0F0Um9vdCB8fCAhY2xpcGJvYXJkRGF0YS5maWxlcy5sZW5ndGgpIHJldHVybjtcblxuICAgICAgY29uc3QgaW1nRmlsZXMgPSBBcnJheS5mcm9tKGNsaXBib2FyZERhdGEuZmlsZXMpLmZpbHRlcihmaWxlID0+IGZpbGUudHlwZS5zdGFydHNXaXRoKCdpbWFnZScpKVxuICAgICAgaWYgKCFpbWdGaWxlcy5sZW5ndGgpIHJldHVyblxuICAgICAgY29uc3QgZmlsZVVyaSA9IGF3YWl0IHRoaXMudXBsb2FkSW1nKGltZ0ZpbGVzWzBdKVxuXG4gICAgICBjb25zdCBiUmVmID0gdGhpcy5jb250cm9sbGVyLmdldEJsb2NrUmVmKGN1clJhbmdlLmJsb2NrSWQpXG4gICAgICBpZiAoIWJSZWYgfHwgIXRoaXMuY29udHJvbGxlci5pc0VkaXRhYmxlQmxvY2soYlJlZikpIHRocm93IG5ldyBFcnJvcignVGhlIGJsb2NrIGlzIG5vdCBlZGl0YWJsZScpXG5cbiAgICAgIGNvbnN0IHtwYXJlbnRJZCwgaW5kZXh9ID0gYlJlZi5nZXRQb3NpdGlvbigpXG4gICAgICBpZiAoYlJlZi5jb250YWluZXJFbGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1wbGFpbi10ZXh0LW9ubHknKSkgcmV0dXJuXG4gICAgICBpZiAoYlJlZi5jb250YWluZXJFbGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1tdWx0aS1saW5lJykpIHtcbiAgICAgICAgYlJlZi5hcHBseURlbHRhKFt7cmV0YWluOiBjdXJSYW5nZS5ibG9ja1JhbmdlLnN0YXJ0fSwge2luc2VydDoge2ltYWdlOiBmaWxlVXJpfX1dKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGlmIChwYXJlbnRJZCA9PT0gdGhpcy5jb250cm9sbGVyLnJvb3RJZCkge1xuICAgICAgICBjb25zdCBibG9jayA9IHRoaXMuY29udHJvbGxlci5jcmVhdGVCbG9jaygnaW1hZ2UnLCBbZmlsZVVyaV0pXG4gICAgICAgIHRoaXMuY29udHJvbGxlci5pbnNlcnRCbG9ja3MoaW5kZXggKyAxLCBbYmxvY2tdLCB0aGlzLmNvbnRyb2xsZXIucm9vdElkKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoY2xpcGJvYXJkRGF0YS50eXBlcy5pbmNsdWRlcyhCbG9ja0Zsb3dDbGlwYm9hcmQuQ0xJUEJPQVJEX0RBVEFfVFlQRSkpIHtcbiAgICAgIGNvbnN0IGRhdGEgPSBjbGlwYm9hcmREYXRhLmdldERhdGEoQmxvY2tGbG93Q2xpcGJvYXJkLkNMSVBCT0FSRF9EQVRBX1RZUEUpXG4gICAgICBpZiAoZGF0YS5zdGFydHNXaXRoKEJsb2NrRmxvd0NsaXBib2FyZC5TSUdOX0NMSVBCT0FSRF9KU09OX0RFTFRBKSkge1xuICAgICAgICBjb25zdCBkZWx0YXMgPSBKU09OLnBhcnNlKGRhdGEuc2xpY2UoQmxvY2tGbG93Q2xpcGJvYXJkLlNJR05fQ0xJUEJPQVJEX0pTT05fREVMVEEubGVuZ3RoKSkgYXMgRGVsdGFJbnNlcnRbXVxuICAgICAgICBpZiAoY3VyUmFuZ2UuaXNBdFJvb3QpIHJldHVyblxuICAgICAgICBjb25zdCBiUmVmID0gdGhpcy5jb250cm9sbGVyLmdldEJsb2NrUmVmKGN1clJhbmdlLmJsb2NrSWQpXG4gICAgICAgIGlmICghYlJlZiB8fCAhdGhpcy5jb250cm9sbGVyLmlzRWRpdGFibGVCbG9jayhiUmVmKSkgdGhyb3cgbmV3IEVycm9yKCdUaGUgYmxvY2sgaXMgbm90IGVkaXRhYmxlJylcbiAgICAgICAgYXBwbHlQYXN0ZURlbHRhVG9CbG9jayhiUmVmLCBkZWx0YXMsIGN1clJhbmdlLmJsb2NrUmFuZ2UpXG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKGRhdGEuc3RhcnRzV2l0aChCbG9ja0Zsb3dDbGlwYm9hcmQuU0lHTl9DTElQQk9BUkRfSlNPTl9CTE9DS1MpKSB7XG4gICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnBhcnNlKGRhdGEuc2xpY2UoQmxvY2tGbG93Q2xpcGJvYXJkLlNJR05fQ0xJUEJPQVJEX0pTT05fQkxPQ0tTLmxlbmd0aCkpIGFzIElCbG9ja01vZGVsW11cbiAgICAgICAgbGV0IGluZGV4OiBudW1iZXJcbiAgICAgICAgaWYgKGN1clJhbmdlLmlzQXRSb290KSB7XG4gICAgICAgICAgaW5kZXggPSBjdXJSYW5nZS5yb290UmFuZ2UhLmVuZFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGluZGV4ID0gdGhpcy5jb250cm9sbGVyLmdldEJsb2NrUG9zaXRpb24oY3VyUmFuZ2UuYmxvY2tJZCkhLmluZGV4ICsgMVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY29udHJvbGxlci5pbnNlcnRCbG9ja3MoaW5kZXgsIGpzb24ubWFwKEJsb2NrTW9kZWwuZnJvbU1vZGVsKSlcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCFjdXJSYW5nZS5pc0F0Um9vdCAmJiBjbGlwYm9hcmREYXRhLnR5cGVzLmluY2x1ZGVzKCd0ZXh0L2h0bWwnKSkge1xuXG4gICAgICBpZiAoIXRoaXMuY29udHJvbGxlci5hY3RpdmVFbGVtZW50Py5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLXBsYWluLXRleHQtb25seScpKSB7XG4gICAgICAgIGNvbnN0IGh0bWwgPSBjbGlwYm9hcmREYXRhLmdldERhdGEoJ3RleHQvaHRtbCcpXG4gICAgICAgIGNvbnNvbGUubG9nKCdwYXJzZSBhcyBodG1sJywgaHRtbClcbiAgICAgICAgY29uc3QgcG9zaXRpb24gPSB0aGlzLmNvbnRyb2xsZXIuZ2V0QmxvY2tQb3NpdGlvbihjdXJSYW5nZS5ibG9ja0lkKSFcblxuICAgICAgICBpZiAocG9zaXRpb24ucGFyZW50SWQgPT09IHRoaXMuY29udHJvbGxlci5yb290SWQgJiYgIXRoaXMuY29udHJvbGxlci5hY3RpdmVFbGVtZW50Py5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLW11bHRpLWxpbmUnKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnNlTW9kZWxzID0gdGhpcy5odG1sQ29udmVydGVyLmNvbnZlcnRUb0Jsb2NrcyhodG1sKVxuICAgICAgICAgIGlmIChwYXJzZU1vZGVscy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRoaXMuY29udHJvbGxlci5pbnNlcnRCbG9ja3MocG9zaXRpb24uaW5kZXggKyAxLCBwYXJzZU1vZGVscy5tYXAoQmxvY2tNb2RlbC5mcm9tTW9kZWwpKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IGRlbHRhcyA9IHRoaXMuaHRtbENvbnZlcnRlci5jb252ZXJ0VG9EZWx0YXMoaHRtbClcbiAgICAgICAgICBpZiAoZGVsdGFzLmxlbmd0aCkge1xuICAgICAgICAgICAgY29uc3QgYlJlZiA9IHRoaXMuY29udHJvbGxlci5nZXRCbG9ja1JlZihjdXJSYW5nZS5ibG9ja0lkKVxuICAgICAgICAgICAgaWYgKCFiUmVmIHx8ICF0aGlzLmNvbnRyb2xsZXIuaXNFZGl0YWJsZUJsb2NrKGJSZWYpKSB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBibG9jayBpcyBub3QgZWRpdGFibGUnKVxuICAgICAgICAgICAgYXBwbHlQYXN0ZURlbHRhVG9CbG9jayhiUmVmLCBkZWx0YXMsIGN1clJhbmdlLmJsb2NrUmFuZ2UpXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgdGV4dCA9IGNsaXBib2FyZERhdGEuZ2V0RGF0YSgndGV4dC9wbGFpbicpXG4gICAgaWYgKCF0ZXh0IHx8IGN1clJhbmdlLmlzQXRSb290KSByZXR1cm47XG4gICAgY29uc3QgYlJlZiA9IHRoaXMuY29udHJvbGxlci5nZXRCbG9ja1JlZihjdXJSYW5nZS5ibG9ja0lkKVxuICAgIGlmICghYlJlZiB8fCAhdGhpcy5jb250cm9sbGVyLmlzRWRpdGFibGVCbG9jayhiUmVmKSkgdGhyb3cgbmV3IEVycm9yKCdUaGUgYmxvY2sgaXMgbm90IGVkaXRhYmxlJylcbiAgICBsZXQgZGVsdGFzOiBEZWx0YU9wZXJhdGlvbltdXG4gICAgaWYgKGlzVXJsKHRleHQpICYmICFiUmVmLmNvbnRhaW5lckVsZS5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLXBsYWluLXRleHQtb25seScpKSB7XG4gICAgICBpZiAoY3VyUmFuZ2UuYmxvY2tSYW5nZS5zdGFydCAhPT0gY3VyUmFuZ2UuYmxvY2tSYW5nZS5lbmQpIHtcbiAgICAgICAgLy8g55u06ZmN5bCG5b2T5YmN5paH5pys6L2s5YyW5Li66ZO+5o6lXG4gICAgICAgIGNvbnN0IHN0cmluZyA9IGRlbHRhVG9TdHJpbmcoc2xpY2VEZWx0YShiUmVmLmdldFRleHREZWx0YSgpLCBjdXJSYW5nZS5ibG9ja1JhbmdlLnN0YXJ0LCBjdXJSYW5nZS5ibG9ja1JhbmdlLmVuZCkpXG4gICAgICAgIGRlbHRhcyA9IFtcbiAgICAgICAgICB7ZGVsZXRlOiBjdXJSYW5nZS5ibG9ja1JhbmdlLmVuZCAtIGN1clJhbmdlLmJsb2NrUmFuZ2Uuc3RhcnR9LFxuICAgICAgICAgIHtpbnNlcnQ6IHtsaW5rOiBzdHJpbmd9LCBhdHRyaWJ1dGVzOiB7J2Q6aHJlZic6IHRleHR9fSxcbiAgICAgICAgXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVsdGFzID0gW3tpbnNlcnQ6IHtsaW5rOiB0ZXh0fSwgYXR0cmlidXRlczogeydkOmhyZWYnOiB0ZXh0fX1dXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlbHRhcyA9IFt7aW5zZXJ0OiB0ZXh0fV1cbiAgICAgIGlmIChjdXJSYW5nZS5ibG9ja1JhbmdlLnN0YXJ0ICE9PSBjdXJSYW5nZS5ibG9ja1JhbmdlLmVuZCkge1xuICAgICAgICBkZWx0YXMudW5zaGlmdCh7ZGVsZXRlOiBjdXJSYW5nZS5ibG9ja1JhbmdlLmVuZCAtIGN1clJhbmdlLmJsb2NrUmFuZ2Uuc3RhcnR9KVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoY3VyUmFuZ2UuYmxvY2tSYW5nZS5zdGFydCA+IDApIHtcbiAgICAgIGRlbHRhcy51bnNoaWZ0KHtyZXRhaW46IGN1clJhbmdlLmJsb2NrUmFuZ2Uuc3RhcnR9KVxuICAgIH1cbiAgICBiUmVmLmFwcGx5RGVsdGEoZGVsdGFzKVxuICB9XG5cbiAgcHJpdmF0ZSBvbkRyb3AgPSBhc3luYyAoZXZlbnQ6IERyYWdFdmVudCkgPT4ge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgICBjb25zb2xlLmxvZygnb25Ecm9wJywgZXZlbnQpXG4gICAgaWYgKCFldmVudC5kYXRhVHJhbnNmZXIpIHJldHVyblxuXG4gICAgZXZlbnQuZGF0YVRyYW5zZmVyLnR5cGVzLmZvckVhY2godHlwZSA9PiBjb25zb2xlLmxvZyh0eXBlLCBldmVudC5kYXRhVHJhbnNmZXIhLmdldERhdGEodHlwZSkpKVxuICAgIGNvbnN0IHR5cGVzID0gZXZlbnQuZGF0YVRyYW5zZmVyIS50eXBlc1xuXG4gICAgaWYgKGV2ZW50LmRhdGFUcmFuc2Zlci5maWxlcykge1xuICAgICAgY29uc3QgaW1nRmlsZXMgPSBBcnJheS5mcm9tKGV2ZW50LmRhdGFUcmFuc2Zlci5maWxlcykuZmlsdGVyKGZpbGUgPT4gZmlsZS50eXBlLnN0YXJ0c1dpdGgoJ2ltYWdlJykpXG4gICAgICBpZiAoIWltZ0ZpbGVzLmxlbmd0aCkgcmV0dXJuXG4gICAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnRcbiAgICAgIGNvbnN0IGJsb2NrSWQgPSB0YXJnZXQuY2xvc2VzdCgnW2JmLWJsb2NrLXdyYXBdJyk/LmdldEF0dHJpYnV0ZSgnZGF0YS1ibG9jay1pZCcpXG4gICAgICBpZiAoIWJsb2NrSWQpIHJldHVyblxuICAgICAgY29uc3QgZmlsZVVyaSA9IGF3YWl0IHRoaXMudXBsb2FkSW1nKGltZ0ZpbGVzWzBdKVxuICAgICAgY29uc3QgYlBvcyA9IHRoaXMuY29udHJvbGxlci5nZXRCbG9ja1Bvc2l0aW9uKGJsb2NrSWQpIVxuICAgICAgY29uc3QgaW1nQmxvY2sgPSB0aGlzLmNvbnRyb2xsZXIuY3JlYXRlQmxvY2soJ2ltYWdlJywgW2ZpbGVVcmldKVxuICAgICAgdGhpcy5jb250cm9sbGVyLmluc2VydEJsb2NrcyhiUG9zLmluZGV4ICsgMSwgW2ltZ0Jsb2NrXSlcbiAgICB9XG5cbiAgfVxufVxuXG5jb25zdCBhcHBseVBhc3RlRGVsdGFUb0Jsb2NrID0gKGJsb2NrUmVmOiBhbnksIGRlbHRhSW5zZXJ0OiBEZWx0YUluc2VydFtdLCByYW5nZToge1xuICBzdGFydDogbnVtYmVyLFxuICBlbmQ6IG51bWJlclxufSkgPT4ge1xuICBjb25zdCBkZWx0YXM6IERlbHRhT3BlcmF0aW9uW10gPSBbXVxuICBpZiAocmFuZ2Uuc3RhcnQgPiAwKSB7XG4gICAgZGVsdGFzLnB1c2goe3JldGFpbjogcmFuZ2Uuc3RhcnR9KVxuICB9XG4gIGlmIChyYW5nZS5zdGFydCAhPT0gcmFuZ2UuZW5kKSB7XG4gICAgZGVsdGFzLnB1c2goe2RlbGV0ZTogcmFuZ2UuZW5kIC0gcmFuZ2Uuc3RhcnR9KVxuICB9XG4gIGlmIChibG9ja1JlZi5jb250YWluZXJFbGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1wbGFpbi10ZXh0LW9ubHknKSkgZGVsdGFzLnB1c2goe2luc2VydDogZGVsdGFUb1N0cmluZyhkZWx0YUluc2VydCl9KVxuICBlbHNlIGRlbHRhcy5wdXNoKC4uLmRlbHRhSW5zZXJ0KVxuICBibG9ja1JlZi5hcHBseURlbHRhKGRlbHRhcywgdHJ1ZSlcbn1cbiJdfQ==