import * as i0 from '@angular/core';
import { EventEmitter, inject, DestroyRef, ChangeDetectorRef, ElementRef, Component, Input, Output, HostBinding, ChangeDetectionStrategy, HostListener, ViewChild, InjectionToken, Pipe, TemplateRef, ViewContainerRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import * as i2$2 from '@angular/common';
import { DOCUMENT, NgIf, NgForOf, AsyncPipe, NgSwitch, NgTemplateOutlet, CommonModule } from '@angular/common';
import * as Y from 'yjs';
import { Subject, BehaviorSubject, fromEvent, take, throttleTime, takeUntil, fromEventPattern, merge, filter, takeWhile, lastValueFrom, first, debounceTime, Subscription } from 'rxjs';
import * as i4$1 from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import Viewer from 'viewerjs';
import * as i1 from '@angular/cdk/overlay';
import { OverlayModule, Overlay } from '@angular/cdk/overlay';
import { ComponentPortal, TemplatePortal } from '@angular/cdk/portal';
import * as Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-git';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-dart';
import 'prismjs/components/prism-mongodb';
import 'prismjs/components/prism-nginx';
import 'prismjs/components/prism-markdown';
import * as i1$1 from 'ng-zorro-antd/button';
import { NzButtonModule, NzButtonComponent } from 'ng-zorro-antd/button';
import * as i4 from 'ng-zorro-antd/radio';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import * as i2 from 'ng-zorro-antd/core/transition-patch';
import * as i3 from 'ng-zorro-antd/core/wave';
import mermaid from 'mermaid';
import { HtmlToDelta } from 'quill-delta-from-html';
import * as i2$1 from '@angular/material/icon';
import { MatIconModule, MatIcon } from '@angular/material/icon';
import { WebsocketProvider } from 'y-websocket';
import { removeAwarenessStates } from 'y-protocols/awareness';
import * as i1$2 from 'ng-zorro-antd/empty';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzTabsModule } from 'ng-zorro-antd/tabs';

class BaseBlock {
    constructor() {
        this.onDestroy = new EventEmitter();
        this.destroyRef = inject(DestroyRef);
        this.cdr = inject(ChangeDetectorRef);
        this.hostEl = inject(ElementRef);
        this.DOCUMENT = inject(DOCUMENT);
    }
    get id() {
        return this.model.id;
    }
    get nodeType() {
        return this.model.nodeType;
    }
    get flavour() {
        return this.model.flavour;
    }
    get props() {
        return this.model.props;
    }
    get children() {
        return this.model.children;
    }
    setProp(key, value) {
        this.model.setProp(key, value);
    }
    deleteProp(key) {
        this.model.deleteProp(key);
    }
    ngOnInit() {
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(t => {
            // this.controller.blockUpdate$.next({
            //   ...t,
            //   block: this
            // })
            if (t.event.transaction.origin === this.controller.historyManager)
                return;
            if (t.event.transaction.local) {
                this.setModifyRecord();
            }
            const pid = this.model.getParentId();
            if (!pid)
                return;
            const parentModel = this.controller.getBlockModel(pid);
            if (!parentModel)
                return;
            // @ts-ignore
            parentModel.update$.next({ type: 'children', event: t.event });
        });
    }
    ngAfterViewInit() {
        this.controller.storeBlockRef(this);
        this.hostEl.nativeElement.setAttribute('id', this.model.id);
        this.hostEl.nativeElement.setAttribute('bf-node-type', this.model.nodeType);
    }
    ngOnDestroy() {
        this.onDestroy.emit();
    }
    setModifyRecord(time = Date.now()) {
        const m = {
            time,
            ...this.controller.config.localUser
        };
        this.model.setMeta('lastModified', m);
    }
    getParentId() {
        return this.model.getParentId() || this.controller.rootId;
    }
    getPosition() {
        const pos = this.model.getPosition();
        return {
            parentId: pos.parentId || this.controller.rootId,
            index: pos.index
        };
    }
    destroySelf() {
        const { parentId, index } = this.getPosition();
        if (parentId === this.controller.rootId && index > 0) {
            const prevEditable = this.controller.findPrevEditableBlock(this.id);
            prevEditable && prevEditable.setSelection('end');
        }
        this.controller.deleteBlocks(index, 1, parentId);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BaseBlock, deps: [], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: BaseBlock, isStandalone: true, selector: "[bf-base-block]", inputs: { controller: "controller", model: "model" }, outputs: { onDestroy: "onDestroy" }, ngImport: i0, template: ``, isInline: true }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BaseBlock, decorators: [{
            type: Component,
            args: [{
                    selector: '[bf-base-block]',
                    standalone: true,
                    template: ``,
                }]
        }], propDecorators: { controller: [{
                type: Input,
                args: [{ required: true }]
            }], model: [{
                type: Input,
                args: [{ required: true }]
            }], onDestroy: [{
                type: Output
            }] } });

const genUniqueID = () => {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return Date.now() + '_' + s4() + s4() + '_' + s4();
};

const isEmbedElement = (node) => {
    if (!node || !(node instanceof HTMLElement))
        return false;
    return !node.isContentEditable;
};

const isUrl = (url) => {
    return /https?:\/\/[^\s/$.?#].[^\s]*$/.test(url);
};

const purifyString = (str) => {
    return str.replaceAll('\u00A0', ' ').replaceAll('\u200B', '');
};

const characterIndex2Number = (index, length) => {
    return typeof index === 'number' ? index : index === 'start' ? 0 : length;
};
const findNodeByIndex = (ele, index, findFrom) => {
    if (!ele.childNodes.length)
        throw new Error('no childNodes');
    let cnt = findFrom?.beforeNodeCharacterCount || 0;
    if (index === 0) {
        return {
            node: ele.firstChild,
            offset: 0,
            nodeOffset: 0,
            beforeNodeCharacterCount: 0
        };
    }
    const childNodes = ele.childNodes;
    for (let i = findFrom?.nodeOffset || 0; i < childNodes.length; i++) {
        const child = childNodes[i];
        if (child instanceof Text) {
            const childTextLength = child.length || 1;
            if (cnt + childTextLength >= index) {
                return {
                    node: child,
                    offset: index - cnt,
                    nodeOffset: i,
                    beforeNodeCharacterCount: cnt
                };
            }
            cnt += childTextLength;
            continue;
        }
        if (child.tagName === 'BR') {
            child.remove();
            i--;
            continue;
        }
        const childTextLength = isEmbedElement(child) ? 1 : child.textContent?.length || 1;
        if (cnt + childTextLength >= index) {
            return {
                node: child,
                offset: index - cnt,
                nodeOffset: i,
                beforeNodeCharacterCount: cnt
            };
        }
        cnt += childTextLength;
    }
    throw new Error('index out of range');
};
const createRangeByCharacterRange = (el, start, end) => {
    const _range = document.createRange();
    if (!el.childNodes.length) {
        _range.setStart(el, 0);
        _range.setEnd(el, 0);
        return _range;
    }
    if ((start === 'start' || start === 0) && end === 'end') {
        _range.selectNodeContents(el);
        return _range;
    }
    switch (start) {
        case 0:
        case 'start':
            _range.setStart(el, 0);
            break;
        case 'end':
            _range.setStart(el, el.childElementCount);
            break;
        default:
            const startPos = findNodeByIndex(el, start);
            if (startPos.node instanceof HTMLElement && !startPos.node.isContentEditable) {
                startPos.offset === 0 ? _range.setStartBefore(startPos.node) : _range.setStartAfter(startPos.node);
            }
            else {
                _range.setStart(startPos.node instanceof Text ? startPos.node : startPos.node.firstChild, startPos.offset);
            }
            break;
    }
    if (start === end) {
        _range.collapse(true);
        return _range;
    }
    switch (end) {
        case 0:
        case 'start':
            _range.setEnd(el, 0);
            break;
        case 'end':
            _range.setEnd(el, el.childElementCount);
            break;
        default:
            const endPos = findNodeByIndex(el, end);
            if (endPos.node instanceof HTMLElement && !endPos.node.isContentEditable) {
                endPos.offset === 0 ? _range.setEndBefore(endPos.node) : _range.setEndAfter(endPos.node);
            }
            else {
                _range.setEnd(endPos.node instanceof Text ? endPos.node : endPos.node.lastChild, endPos.offset);
            }
            break;
    }
    return _range;
};
const setCharacterRange = (el, start, end) => {
    const sel = document.getSelection();
    if (document.activeElement !== el)
        el.focus();
    if (!el.childNodes.length) {
        sel.setPosition(el, 0);
        return;
    }
    if ((start === 'start' || start === 0) && end === 'end') {
        sel.selectAllChildren(el);
        return;
    }
    if (start === end) {
        if (start === 'start' || start === 0) {
            setCursorBefore(el.firstChild, sel);
            return;
        }
        else if (start === 'end') {
            setCursorAfter(el.lastChild, sel);
            return;
        }
        const { node, offset, nodeOffset } = findNodeByIndex(el, start);
        if (isEmbedElement(node)) {
            sel.setPosition(el, nodeOffset + 1);
        }
        else {
            sel.setPosition(node instanceof Text ? node : node.firstChild, offset);
        }
        return;
    }
    const _range = document.createRange();
    switch (start) {
        case 0:
        case 'start':
            _range.setStart(el, 0);
            break;
        case 'end':
            _range.setStart(el, el.childElementCount);
            break;
        default:
            const startPos = findNodeByIndex(el, start);
            if (startPos.node instanceof HTMLElement && !startPos.node.isContentEditable) {
                startPos.offset === 0 ? _range.setStartBefore(startPos.node) : _range.setStartAfter(startPos.node);
            }
            else {
                _range.setStart(startPos.node instanceof Text ? startPos.node : startPos.node.firstChild, startPos.offset);
            }
            break;
    }
    switch (end) {
        case 0:
        case 'start':
            _range.setEnd(el, 0);
            break;
        case 'end':
            _range.setEnd(el, el.childElementCount);
            break;
        default:
            const endPos = findNodeByIndex(el, end);
            if (endPos.node instanceof HTMLElement && !endPos.node.isContentEditable) {
                endPos.offset === 0 ? _range.setEndBefore(endPos.node) : _range.setEndAfter(endPos.node);
            }
            else {
                _range.setEnd(endPos.node instanceof Text ? endPos.node : endPos.node.lastChild, endPos.offset);
            }
            break;
    }
    sel.removeAllRanges();
    sel.addRange(_range);
};
const normalizeStaticRange = (container, range) => {
    return getCurrentCharacterRange(container, range);
};
const getCurrentCharacterRange = (activeElement, range) => {
    if (!range) {
        const sel = document.getSelection();
        if (!sel?.rangeCount)
            throw new Error('range is not defined');
        range = sel.getRangeAt(0);
    }
    let { startOffset, endOffset, startContainer, endContainer } = range;
    if (!activeElement.contains(startContainer))
        throw new Error('Anchor node is not in active element');
    const children = activeElement.childNodes;
    if (!children.length)
        return { start: 0, end: 0 };
    if (startContainer === activeElement) {
        if (startOffset >= children.length) {
            startOffset = 1;
            startContainer = children[children.length - 1];
        }
        else {
            startContainer = children[startOffset];
            startOffset = 0;
        }
    }
    if (endContainer === activeElement) {
        if (endOffset >= children.length) {
            endOffset = 1;
            endContainer = children[children.length - 1];
        }
        else {
            endContainer = children[endOffset];
            endOffset = 0;
        }
    }
    // if (!startContainer.parentElement!.isContentEditable) {
    //   startContainer = startContainer.parentElement!
    //   startOffset = 0
    // }
    //
    // if (!endContainer.parentElement!.isContentEditable) {
    //   endContainer = endContainer.parentElement!
    //   endOffset = 1
    // }
    let startPos = -1, endPos = -1, cnt = 0;
    const childNodes = activeElement.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
        const child = childNodes[i];
        if (child instanceof Text) {
            if (child === startContainer) {
                startPos = cnt + startOffset;
            }
            if (child === endContainer) {
                endPos = cnt + endOffset;
                return { start: startPos, end: endPos };
            }
            cnt += child.length;
            continue;
        }
        const isEmbed = isEmbedElement(child);
        const textLength = isEmbed ? 1 : child.textContent?.length || 0;
        if (child === startContainer) {
            startPos = cnt + (isEmbed ? startOffset : (startOffset === 0 ? 0 : textLength));
        }
        if (child === endContainer) {
            endPos = cnt + (isEmbed ? endOffset : (endOffset === 0 ? 0 : textLength));
            return { start: startPos, end: endPos };
        }
        if (!isEmbed) {
            for (let j = 0; j < child.childNodes.length; j++) {
                const grandChild = child.childNodes[j];
                if (grandChild === startContainer) {
                    startPos = cnt + startOffset;
                }
                if (grandChild === endContainer) {
                    endPos = cnt + endOffset;
                    return { start: startPos, end: endPos };
                }
            }
        }
        cnt += textLength;
    }
    throw new Error('Cannot find range');
};
const getElementCharacterOffset = (ele, container) => {
    let cnt = 0;
    for (let i = 0; i < container.childNodes.length; i++) {
        const child = container.childNodes[i];
        if (child === ele)
            return cnt;
        cnt += isEmbedElement(child) ? 1 : (child.textContent?.length || 0);
    }
    return -1;
};
const setCursorAfter = (el, sel = document.getSelection()) => {
    if (!el)
        return;
    if (el instanceof Text) {
        sel.setPosition(el, el.length);
        return;
    }
    if (!(el instanceof Element))
        return;
    if (isEmbedElement(el)) {
        const range = document.createRange();
        range.setEndAfter(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
    }
    sel.setPosition(el.lastChild, el.lastChild.nodeValue.length);
};
const setCursorBefore = (el, sel = document.getSelection()) => {
    if (!el)
        return;
    if (el instanceof Text) {
        sel.setPosition(el, 0);
        return;
    }
    if (!(el instanceof Element))
        return;
    if (isEmbedElement(el)) {
        const range = document.createRange();
        range.setStartBefore(el);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
    }
    sel.setPosition(el.firstChild, 0);
};
const isCursorAtElStart = (el) => {
    const sel = document.getSelection();
    if (!sel.isCollapsed)
        return false;
    const { startContainer, startOffset } = sel.getRangeAt(0);
    if (!el.contains(startContainer) || startOffset !== 0)
        return false;
    if (startContainer === el) {
        return startOffset === 0;
    }
    let node = startContainer;
    while (node && node !== el) {
        if (node.previousSibling)
            return false;
        if (node instanceof Text && sel.anchorOffset !== 0)
            return false;
        node = node.parentNode;
    }
    return true;
};
const isCursorAtElEnd = (el) => {
    const selection = document.getSelection();
    if (!selection.isCollapsed)
        return false;
    const range = selection.getRangeAt(0);
    if (!el.contains(range.startContainer))
        return false;
    if (range.endContainer === el) {
        // 如果选区直接在编辑块，检查是否是最后一个字符
        return range.endOffset === el.childNodes.length;
    }
    // 如果选区在子节点，检查是否在最后一个字符之后
    let node = range.endContainer;
    while (node && node !== el) {
        if (node.nextSibling)
            return false;
        if (node instanceof Text && node.length !== range.endOffset)
            return false;
        node = node.parentNode;
    }
    return true;
};
const clearBreakElement = (container) => {
    // console.time('clearBreakElement')
    for (let i = 0; i < container.children.length; i++) {
        const child = container.children[i];
        if (child instanceof HTMLElement && child.tagName === 'BR') {
            container.removeChild(child);
        }
    }
    // console.timeEnd('clearBreakElement')
};
const adjustRangeEdges = (container, range = document.getSelection()?.getRangeAt(0)) => {
    if (!range)
        return;
    const { startContainer, endContainer, startOffset, endOffset } = range;
    let flag = false;
    if (startContainer instanceof Text && startOffset === 0 && startContainer.parentElement !== container) {
        range.setStartBefore(startContainer.parentElement);
        flag = true;
    }
    if (endContainer instanceof Text && endOffset === endContainer.length && endContainer.parentElement !== container) {
        range.setEndAfter(endContainer.parentElement);
        flag = true;
    }
    return flag;
};

const findByPath = (path, obj) => {
    let res = obj;
    if (!path?.length)
        return res;
    for (let i = 0; i < path.length; i++) {
        res = res[path[i]];
    }
    return res;
};
const syncBlockModelChildren = (deltas, array) => {
    let r = 0;
    deltas.forEach((d) => {
        const { retain, insert, delete: del } = d;
        if (retain) {
            r += retain;
        }
        else if (insert) {
            const bms = insert.map(v => BlockModel.fromYModel(v));
            Array.prototype.splice.call(array, r, 0, ...bms);
            r += bms.length;
        }
        else {
            Array.prototype.splice.call(array, r, del);
        }
    });
};
const syncMapUpdate = (event, map, cb) => {
    const { path, target, changes, transaction } = event;
    if (transaction.origin !== USER_CHANGE_SIGNAL && transaction.origin !== NO_RECORD_CHANGE_SIGNAL) {
        event.changes.keys.forEach((change, key) => {
            // console.log(map, change, target.get(key), path)
            switch (change.action) {
                case 'add':
                case 'update':
                    Reflect.set(map, key, target.get(key));
                    break;
                case 'delete':
                    Reflect.deleteProperty(map, key);
            }
        });
    }
    cb && cb(event);
};
// It means the change is caused by user, the b-model has been synced with y-model
const USER_CHANGE_SIGNAL = Symbol('user-change');
// Like {@link USER_CHANGE_SIGNAL}, but the change will not set history record
const NO_RECORD_CHANGE_SIGNAL = Symbol('user-change-no-signal');
class BlockModel {
    constructor(_model, yModel, _childrenModel) {
        this._model = _model;
        this.yModel = yModel;
        this._childrenModel = _childrenModel;
        this.update$ = new Subject();
        this._yChildrenObserver = (event, tr) => {
            if (event.target instanceof Y.Array && tr.origin !== USER_CHANGE_SIGNAL && tr.origin !== NO_RECORD_CHANGE_SIGNAL) {
                const { path, target, changes } = event;
                syncBlockModelChildren(changes.delta, this._childrenModel);
            }
            this.update$.next({ type: 'children', event });
        };
        Promise.resolve().then(() => {
            this.yModel.get('children').observe(this._yChildrenObserver);
            this.yModel.get('props').observe(e => syncMapUpdate(e, this.props, e => this.update$.next({ type: 'props', event: e })));
            this.yModel.get('meta').observe(e => syncMapUpdate(e, this.meta
            // , e => this.update$.next({type: 'meta', event: e})
            ));
        });
    }
    static fromYModel(yModel) {
        const model = yModel.toJSON();
        let children;
        const yChildren = yModel.get('children');
        if (yChildren instanceof Y.Text) {
            children = model.children;
        }
        else {
            children = yChildren.map(BlockModel.fromYModel);
        }
        return new BlockModel(model, yModel, children);
    }
    static fromModel(block) {
        block.id = genUniqueID();
        let children;
        let yChildren;
        if (block.nodeType === 'editable') {
            yChildren = new Y.Text();
            block.children.length && yChildren.applyDelta(block.children);
            children = block.children;
        }
        else {
            children = block.children.map(BlockModel.fromModel);
            yChildren = Y.Array.from(children.map(c => c.yModel));
        }
        const yProps = new Y.Map(Object.entries(block.props));
        const yMeta = new Y.Map(Object.entries(block.meta));
        const yModel = new Y.Map([
            ['flavour', block.flavour],
            ['id', block.id],
            ['nodeType', block.nodeType],
            ['props', yProps],
            ['meta', yMeta],
            ['children', yChildren],
        ]);
        return new BlockModel(block, yModel, children);
    }
    getParentId() {
        return this.yModel.parent?.parent?.get('id');
    }
    getPosition() {
        const parentChildren = this.yModel.parent;
        let i = 0;
        for (const value of parentChildren) {
            if (value.get('id') === this.id)
                break;
            i++;
        }
        if (i >= parentChildren.length)
            throw new Error('Block not found in parent children');
        const parent = parentChildren.parent;
        return { parentId: parent && parent.get('id'), index: i };
    }
    toJSON() {
        return this.yModel.toJSON();
    }
    get id() {
        return this._model.id;
    }
    get flavour() {
        return this._model.flavour;
    }
    get nodeType() {
        return this._model.nodeType;
    }
    get props() {
        return this._model.props;
    }
    get meta() {
        return this._model.meta;
    }
    get children() {
        return this.nodeType === 'editable' ? this.getYText().toDelta() : this._childrenModel;
    }
    getYText() {
        return this.yModel.get('children');
    }
    setProp(key, value) {
        this.yModel.doc.transact(() => {
            // @ts-ignore
            this._model.props[key] = value;
            this.yModel.get('props').set(key, value);
        }, USER_CHANGE_SIGNAL);
    }
    deleteProp(key) {
        this.yModel.doc.transact(() => {
            // @ts-ignore
            delete this._model.props[key];
            this.yModel.get('props').delete(key);
        }, USER_CHANGE_SIGNAL);
    }
    setMeta(key, value) {
        this.yModel.doc.transact(() => {
            // @ts-ignore
            this._model.meta[key] = value;
            this.yModel.get('meta').set(key, value);
        }, NO_RECORD_CHANGE_SIGNAL);
    }
    getYChildren() {
        return this.yModel.get('children');
    }
    insertChildren(index, children) {
        if (this.nodeType === 'editable')
            throw new Error('Editable block cannot have children');
        this.yModel.doc.transact(() => {
            this.children.splice(index, 0, ...children);
            this.getYChildren().insert(index, children.map(c => c.yModel));
        }, USER_CHANGE_SIGNAL);
    }
    deleteChildren(index, num) {
        if (this.nodeType === 'editable')
            throw new Error('Editable block cannot have children');
        this.yModel.doc.transact(() => {
            this.children.splice(index, num);
            this.getYChildren().delete(index, num);
        }, USER_CHANGE_SIGNAL);
    }
}

// cover Y.Text.prototype.toJSON globally
Y.Text.prototype.toJSON = Y.Text.prototype.toDelta;

function sliceDelta(delta, start = 0, end = Infinity) {
    const slicedOps = [];
    let offset = 0;
    for (const op of delta) {
        const opLength = typeof op.insert === 'string' ? op.insert.length : 1;
        if (offset + opLength <= start) {
            // 跳过当前操作，因为它完全在开始位置之前
            offset += opLength;
            continue;
        }
        if (offset >= end) {
            // 如果已经达到结束位置，则停止处理
            break;
        }
        let sliceStart = Math.max(start - offset, 0);
        let sliceEnd = Math.min(end - offset, opLength);
        const length = sliceEnd - sliceStart;
        if (length > 0) {
            const insert = typeof op.insert === 'string'
                ? op.insert.slice(sliceStart, sliceEnd)
                : op.insert;
            slicedOps.push({ insert, ...(op.attributes && { attributes: op.attributes }) });
        }
        offset += opLength;
    }
    return slicedOps;
}

const characterAtDelta = (deltas, position) => {
    let currentPosition = 1;
    for (let i = 0; i < deltas.length; i++) {
        const delta = deltas[i];
        if (typeof delta.insert === 'string') {
            // 如果 insert 是文本
            const insertText = delta.insert;
            const textLength = insertText.length;
            if (currentPosition + textLength >= position) {
                // 如果目标位置在当前 insert 字符串中
                const charIndex = position - currentPosition;
                return insertText.charAt(charIndex);
            }
            currentPosition += textLength;
        }
        else {
            // 如果是嵌入对象，算作一个字符
            if (currentPosition === position) {
                // 如果目标位置是嵌入对象的位置，返回该对象
                return delta.insert;
            }
            currentPosition += 1;
        }
    }
    // 如果遍历完所有 delta 后仍然没有找到，说明位置超出了长度
    return null;
};

const deltaToString = (delta) => {
    return delta.reduce((acc, cur) => acc + (typeof cur.insert === "string" ? cur.insert : ''), '');
};

const deleteContent = (ele, from, count) => {
    // console.time('deleteContent')
    let currentPos = 0;
    let end = from + count;
    if (ele.childNodes.length === 0)
        return;
    for (let i = 0; i < ele.childNodes.length; i++) {
        const child = ele.childNodes[i];
        if (child instanceof Text) {
            const textLength = child.length;
            if (currentPos + child.length >= from && currentPos <= end) {
                const rangeStart = Math.max(0, from - currentPos);
                const rangeEnd = Math.min(child.length, end - currentPos);
                if (rangeStart === 0 && rangeEnd === child.length) {
                    child.remove();
                    i--;
                }
                else {
                    child.deleteData(rangeStart, rangeEnd - rangeStart);
                }
            }
            currentPos += textLength;
            if (currentPos >= end)
                break;
            continue;
        }
        if (child.tagName === 'BR') {
            child.remove();
            i--;
            continue;
        }
        const isEmbed = isEmbedElement(child);
        const textLength = isEmbed ? 1 : child.textContent?.length || 0;
        if (currentPos + textLength >= from && currentPos <= end) {
            const rangeStart = Math.max(0, from - currentPos);
            const rangeEnd = Math.min(textLength, end - currentPos);
            if (rangeStart === 0 && rangeEnd === textLength) {
                child.remove();
                i--;
            }
            else if (rangeStart >= 0 && rangeEnd <= textLength) {
                child.firstChild.deleteData(rangeStart, rangeEnd - rangeStart);
            }
        }
        currentPos += textLength;
        if (currentPos >= end)
            break;
    }
    // console.timeEnd('deleteContent')
};

const setAttributes = (element, attributes) => {
    for (const key in attributes) {
        // @ts-ignore
        const attr = attributes[key];
        if (key.startsWith('a:')) {
            const attrName = `bfi-${key.slice(2)}`;
            attr ? element.setAttribute(attrName, attr + '') : element.removeAttribute(attrName);
            continue;
        }
        if (key.startsWith('d:')) {
            attr ? element.dataset[key.slice(2)] = attr + '' : delete element.dataset[key.slice(2)];
            continue;
        }
        switch (key) {
            case 's:c':
                element.style.color = attr;
                continue;
            case 's:bc':
                element.style.backgroundColor = attr;
                continue;
            case 's:fs':
                element.style.fontSize = attr + 'px';
                continue;
            case 's:ff':
                element.style.fontFamily = attr;
        }
    }
};

const getAttributesFrom = (node) => {
    const attrs = {};
    const { attributes, dataset } = node;
    for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i];
        if (attr.name.startsWith('bfi-')) {
            attrs[`a:${attr.name.slice(4)}`] = attr.value;
        }
    }
    for (const key in dataset) {
        attrs[`d:${key}`] = dataset[key];
    }
    const { color, backgroundColor, fontSize, fontFamily } = node.style;
    if (color)
        attrs['s:c'] = color;
    if (backgroundColor)
        attrs['s:bc'] = backgroundColor;
    if (fontSize)
        attrs['s:fs'] = parseInt(fontSize);
    if (fontFamily)
        attrs['s:ff'] = fontFamily;
    return attrs;
};

const compareAttributesWithEle = (ele, attrs) => {
    const eleAttrs = ele.attributes;
    if ((attrs && !eleAttrs.length) || (!attrs && eleAttrs.length))
        return false;
    if (!attrs)
        return true;
    const attrsEntries = Object.entries(attrs);
    if (!attrsEntries.length)
        return false; // {} is mean alone plain text element
    for (const [key, attr] of attrsEntries) {
        if (key.startsWith('a:')) {
            if (ele.getAttribute(`bfi-${key.slice(2)}`) !== attr + '')
                return false;
        }
        if (key.startsWith('d:')) {
            if (ele.dataset[key.slice(2)] !== attr + '')
                return false;
        }
        switch (key) {
            case 's:c':
                if (ele.style.color !== attr)
                    return false;
                continue;
            case 's:bc':
                if (ele.style.backgroundColor !== attr)
                    return false;
                continue;
            case 's:fs':
                if (ele.style.fontSize !== attr + 'px')
                    return false;
                continue;
            case 's:ff':
                if (ele.style.fontFamily !== attr)
                    return false;
        }
    }
    return true;
};
const compareAttributesBetweenElements = (ele1, ele2) => {
    if (!ele1.attributes && !ele2.attributes)
        return true;
    if ((ele1.attributes && !ele2.attributes) || (!ele1.attributes && ele2.attributes))
        return false;
    let attrs;
    return true;
};

class BlockflowInline {
    constructor(embedConverterMap = new Map()) {
        this.embedConverterMap = embedConverterMap;
    }
    createView(delta) {
        const { insert, attributes } = delta;
        if (typeof insert === 'object') {
            const key = Object.keys(insert)[0];
            const embedCreator = this.embedConverterMap.get(key);
            if (!embedCreator)
                throw new Error(`Embed creator for key ${key} not found`);
            const node = embedCreator.toView(delta);
            node.setAttribute('bf-embed', key);
            node.setAttribute('contenteditable', 'false');
            return node;
        }
        if (!delta.attributes || Object.keys(delta.attributes).length === 0) {
            return document.createTextNode(insert);
        }
        const span = document.createElement('span');
        span.textContent = insert;
        attributes && setAttributes(span, attributes);
        return span;
    }
    elementToDelta(ele) {
        const attributes = getAttributesFrom(ele);
        const embed = ele.getAttribute('bf-embed');
        if (embed) {
            const embedCreator = this.embedConverterMap.get(embed);
            if (!embedCreator)
                throw new Error(`Embed creator for key ${embed} not found`);
            const delta = embedCreator.toDelta(ele);
            delta.attributes = {
                ...delta.attributes,
                ...attributes
            };
            return delta;
        }
        const insert = ele.textContent;
        // @ts-ignore
        return { insert, attributes };
    }
    static setAttributes(element, attributes, embed = false) {
        if (embed)
            element.setAttribute('contenteditable', 'false');
        if (attributes)
            setAttributes(element, attributes);
    }
    static getAttributes(element) {
        return getAttributesFrom(element);
    }
    static compareAttributesWithEle(element, attributes) {
        return compareAttributesWithEle(element, attributes);
    }
}

const insertContent = (ele, from, delta, viewCreator) => {
    // console.time('insertContent')
    if (!ele.childNodes.length || from === 0) {
        return ele.prepend(viewCreator(delta));
    }
    const { node, offset } = findNodeByIndex(ele, from);
    if (node instanceof Text) {
        if (typeof delta.insert === 'string' && (!delta.attributes || Object.keys(delta.attributes).length === 0)) {
            node.insertData(offset, delta.insert);
            return;
        }
        const span = viewCreator(delta);
        switch (offset) {
            case 0:
                node.before(span);
                break;
            case node.length:
                node.after(span);
                break;
            default:
                const newNode = node.splitText(offset);
                newNode.before(span);
                break;
        }
        return;
    }
    if (isEmbedElement(node)) {
        const embed = viewCreator(delta);
        offset === 0 ? node.before(embed) : node.after(embed);
        return;
    }
    const textNode = node.firstChild;
    const isSame = BlockflowInline.compareAttributesWithEle(node, delta.attributes);
    if (typeof delta.insert === 'object') {
        const embed = viewCreator(delta);
        if (offset > 0 && offset < textNode.length)
            return splitBy(node, offset, embed);
        return offset === 0 ? node.before(embed) : node.after(embed);
    }
    if (isSame) {
        textNode.insertData(offset, delta.insert);
    }
    else {
        const span = viewCreator(delta);
        if (offset === textNode.length) {
            if (!delta.attributes || !isSame)
                node.after(span);
            else
                textNode.insertData(offset, delta.insert);
        }
        else if (offset === 0) {
            if (!delta.attributes || !isSame)
                node.before(span);
            else
                textNode.insertData(offset, delta.insert);
        }
        else {
            splitBy(node, offset, span);
        }
    }
    // console.timeEnd('insertContent')
};
const splitBy = (ele, index, insertEle) => {
    const textNode = ele.firstChild;
    const fragment = document.createDocumentFragment();
    const clone = ele.cloneNode();
    clone.textContent = textNode.data.slice(index);
    fragment.appendChild(insertEle);
    fragment.appendChild(clone);
    ele.after(fragment);
    textNode.deleteData(index, textNode.length - index);
};

const getCommonAttributesFromDelta = (delta) => {
    if (!delta.length)
        return {};
    let commonAttrs;
    for (const op of delta) {
        if (!op.attributes)
            return {};
        if (!commonAttrs) {
            commonAttrs = { ...op.attributes };
            continue;
        }
        for (const key in commonAttrs) {
            // @ts-ignore
            if (commonAttrs[key] !== op.attributes[key]) {
                // @ts-ignore
                delete commonAttrs[key];
            }
        }
    }
    return commonAttrs || {};
};

class EditableBlock extends BaseBlock {
    constructor() {
        super(...arguments);
        this.placeholder = '';
        this._textAlign = 'left';
        this._textIndent = '0';
        this.oldHasContent = false;
    }
    ngOnInit() {
        super.ngOnInit();
        this.yText = this.model.getYText();
        this.oldHasContent = !!this.textLength;
        this._textAlign !== this.props.textAlign && (this._textAlign = this.props.textAlign || 'left');
        this._textIndent = (this.props.indent || 0) * 2 + 'em';
        this.cdr.markForCheck();
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
            if (v.type === 'props') {
                this._textAlign !== this.props.textAlign && (this._textAlign = this.props.textAlign || 'left');
                parseInt(this._textIndent) / 2 !== this.props.indent && (this._textIndent = (this.props.indent || 0) * 2 + 'em');
                this.cdr.markForCheck();
            }
        });
        this.yText.observe((event, tr) => {
            this.setPlaceholder();
            // console.log(this.getTextContent(), '\n', this.containerEle.textContent, this.getTextDelta(), this.getTextContent() === this.containerEle.textContent)
            if (tr.origin === USER_CHANGE_SIGNAL)
                return;
            this.applyDeltaToView(event.changes.delta, this.controller.undoRedo$.value);
            // console.log('再验证', this.getTextContent() === this.containerEle.textContent)
            this.model.children.splice(0, this.model.children.length, ...this.yText.toDelta());
        });
    }
    setPlaceholder() {
        if (!this.placeholder || (this.textLength && this.oldHasContent) || (!this.textLength && !this.oldHasContent))
            return;
        this.oldHasContent = !!this.textLength;
        if (this.textLength)
            this.containerEle.classList.remove('placeholder-visible');
        else
            this.containerEle.classList.add('placeholder-visible');
    }
    ngAfterViewInit() {
        super.ngAfterViewInit();
        this.containerEle = this.hostEl.nativeElement.querySelector('.editable-container') || this.hostEl.nativeElement;
        this.placeholder && this.containerEle.setAttribute('placeholder', this.placeholder);
        this.forceRender();
        this.setPlaceholder();
        this.controller.readonly$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(readonly => {
            if (readonly)
                this.containerEle.removeAttribute('contenteditable');
            else
                this.containerEle.setAttribute('contenteditable', 'true');
        });
    }
    getTextDelta() {
        return this.yText.toDelta();
    }
    getTextContent() {
        return this.yText.toString();
    }
    get textLength() {
        return this.yText.length;
    }
    setSelection(start, end) {
        setCharacterRange(this.containerEle, start, end ?? start);
    }
    forceRender() {
        const delta = this.getTextDelta();
        this.containerEle.innerHTML = '';
        if (delta.length) {
            const fragment = document.createDocumentFragment();
            for (const insert of delta) {
                if (!insert.insert)
                    continue;
                fragment.appendChild(this.controller.inlineManger.createView(insert));
            }
            this.containerEle.appendChild(fragment);
            return;
        }
    }
    applyDelta(deltas, setSelection = true) {
        // console.log('applyDeltaToView', deltas)
        this.controller.transact(() => {
            this.yText.applyDelta(deltas);
            this.applyDeltaToView(deltas, setSelection);
        }, USER_CHANGE_SIGNAL);
    }
    applyDeltaToModel(deltas) {
        console.log('applyDeltaToModel', deltas);
        this.yText.applyDelta(deltas);
    }
    applyDeltaToView(deltas, withSelection = false, containerEle = this.containerEle) {
        let _range;
        // console.log('applyDeltaToModel', deltas)
        let retain = 0;
        for (const delta of deltas) {
            if (delta.retain) {
                if (delta.attributes)
                    this.forceRender();
                withSelection && (_range = { start: retain, end: retain + delta.retain });
                retain += delta.retain;
            }
            else if (delta.insert) {
                insertContent(containerEle, retain, delta, this.controller.inlineManger.createView.bind(this.controller.inlineManger));
                retain += typeof delta.insert === 'string' ? delta.insert.length : 1;
                withSelection && (_range = { start: retain, end: retain });
            }
            else if (delta.delete) {
                deleteContent(containerEle, retain, delta.delete);
                withSelection && (_range = { start: retain, end: retain });
            }
        }
        if (withSelection && _range) {
            // console.log('setSelection', _range)
            setCharacterRange(containerEle, _range.start, _range.end);
        }
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: EditableBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: EditableBlock, isStandalone: true, selector: ".editable-container", inputs: { placeholder: "placeholder" }, host: { properties: { "style.text-align": "this._textAlign", "style.margin-left": "this._textIndent" } }, usesInheritance: true, ngImport: i0, template: ``, isInline: true }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: EditableBlock, decorators: [{
            type: Component,
            args: [{
                    selector: '.editable-container',
                    template: ``,
                    imports: [],
                    standalone: true,
                }]
        }], propDecorators: { placeholder: [{
                type: Input
            }], _textAlign: [{
                type: HostBinding,
                args: ['style.text-align']
            }], _textIndent: [{
                type: HostBinding,
                args: ['style.margin-left']
            }] } });

const onBackspace = (e, controller) => {
    const curRange = controller.selection.getSelection();
    if (curRange.isAtRoot) {
        e.preventDefault();
        const res = controller.deleteSelectedBlocks();
        if (!res || res[0] === 0)
            return;
        // 聚焦上一个块
        const prev = controller.rootModel[res[0] - 1];
        controller.selection.focusTo(prev.id, 'end');
        return;
    }
    const { blockId, blockRange } = curRange;
    const bRef = controller.getBlockRef(blockId);
    if (blockRange.start === 0 && blockRange.end === 0) {
        e.preventDefault();
        // transform to paragraph
        if (bRef.flavour !== 'paragraph') {
            const pBlock = controller.createBlock('paragraph', [bRef.getTextDelta(), bRef.props]);
            controller.replaceWith(bRef.id, [pBlock]).then(() => {
                controller.selection.setSelection(pBlock.id, 'start');
            });
            return;
        }
        // decrement indent
        if (bRef.props.indent > 0) {
            bRef.setProp('indent', bRef.props.indent - 1);
            return;
        }
        const position = bRef.getPosition();
        if (position.parentId !== controller.rootId || position.index === 0)
            return;
        const prevBlock = controller.getBlockRef(controller.rootModel[position.index - 1].id);
        if (!prevBlock)
            throw new Error(`Can not find prev block`);
        if (!controller.isEditableBlock(prevBlock)) {
            if (!bRef.textLength) {
                controller.deleteBlocks(position.index, 1);
            }
            controller.selection.setSelection(controller.rootId, position.index - 1, position.index);
            return;
        }
        const deltas = bRef.textLength ? [{ retain: prevBlock.textLength }, ...bRef.getTextDelta()] : [];
        controller.transact(() => {
            prevBlock.setSelection('end');
            deltas.length && prevBlock.applyDelta(deltas, false);
            controller.deleteBlockById(bRef.id);
        }, USER_CHANGE_SIGNAL);
        return;
    }
    // const activeElement = bRef.containerEle
    // const yText = bRef.yText
    // const selection = window.getSelection()!
    //
    // if (selection.isCollapsed) {
    //   const {focusNode, focusOffset} = selection
    //
    //   // delete prev element and focus to prev node before it
    //   const deletePrevEle = (prevEle: Element) => {
    //     controller.transact(() => {
    //       prevEle.remove()
    //       yText.delete(blockRange.start - 1, 1)
    //     }, USER_CHANGE_SIGNAL)
    //   }
    //
    //   if (focusNode === activeElement) {
    //     const prevNode = activeElement.childNodes[focusOffset - 1]
    //
    //     // if prev element is embed element, delete it
    //     if (prevNode instanceof Element && isEmbedElement(prevNode)) {
    //       return deletePrevEle(prevNode)
    //     }
    //
    //     // if prev element is not embed element, focus to it end
    //     setCursorAfter(prevNode, selection)
    //   }
    //
    //   // if focusNode is text node
    //   if (focusOffset === 0) {
    //     const parentNode = focusNode!.parentElement!
    //     const prevNode = parentNode === activeElement ? focusNode!.previousSibling! : parentNode.previousSibling!
    //
    //     if (isEmbedElement(prevNode)) {
    //       return deletePrevEle(<HTMLElement>prevNode)
    //     }
    //
    //     setCursorAfter(prevNode, selection)
    //   }
    //
    //   // default, handle it as text node
    //   controller.transact(() => {
    //     // TODO bug
    //     const {focusNode, focusOffset} = selection;
    //
    //     selection.modify('move', 'backward', 'character')
    //     const textNode = focusNode as Text
    //     textNode.deleteData(focusOffset - 1, 1);
    //     yText.delete(blockRange.start - 1, 1)
    //
    //     if (textNode.length === 0) {
    //       const parentNode = textNode.parentElement!
    //       if (parentNode === activeElement) {
    //         textNode.remove()
    //         return
    //       }
    //       // const prevNode = parentNode.previousSibling!
    //       // parentNode.remove()
    //       // setCursorAfter(prevNode, selection)
    //     }
    //
    //   }, USER_CHANGE_SIGNAL)
    //
    //   return
    // }
    //
    // const deltas = [
    //   {retain: blockRange.start},
    //   {delete: blockRange.end - blockRange.start},
    // ]
    // adjustRangeEdges(bRef.containerEle, selection.getRangeAt(0))
    // selection.collapseToStart()
    // bRef.applyDelta(deltas, false)
};

const onDelete = (e, controller) => {
    const curRange = controller.selection.getSelection();
    if (curRange.isAtRoot) {
        e.preventDefault();
        const res = controller.deleteSelectedBlocks();
        if (!res || res[1] >= controller.rootModel.length)
            return;
        const end = controller.rootModel[res[1]];
        controller.selection.focusTo(end.id, 'start');
        return;
    }
    const activeElement = document.activeElement;
    const { blockId, blockRange } = curRange;
    const bRef = controller.getBlockRef(blockId);
    // At end of block
    if (blockRange.start === bRef.textLength && blockRange.end === bRef.textLength) {
        e.preventDefault();
        const position = controller.getBlockPosition(bRef.id);
        // If it's the last block, don't do anything
        if (position.parentId !== controller.rootId || position.index >= controller.rootModel.length - 1)
            return;
        const nextBlockModel = controller.findNextBlockModel(bRef.id);
        // If next block is not editable, select the next block
        if (!controller.isEditable(nextBlockModel)) {
            controller.selection.setSelection(controller.rootId, position.index + 1, position.index + 2);
            return;
        }
        // Merge with next editable block
        const nextBlock = controller.getBlockRef(nextBlockModel.id);
        if (!bRef.textLength) {
            controller.deleteBlocks(position.index, 1);
            nextBlock.setSelection(0);
            return;
        }
        controller.transact(() => {
            bRef.applyDelta([{ retain: bRef.textLength }, ...nextBlock.getTextDelta()], false);
            controller.deleteBlockById(nextBlock.id);
        }, USER_CHANGE_SIGNAL);
        return;
    }
    // const yText = bRef.yText
    // const selection = window.getSelection()!
    // if (selection.isCollapsed) {
    //
    //   const {focusNode, focusOffset} = selection
    //
    //   const deleteNextEle = (nextEle: HTMLElement) => {
    //     controller.transact(() => {
    //       nextEle.remove()
    //       yText.delete(blockRange.start, 1)
    //     }, USER_CHANGE_SIGNAL)
    //   }
    //
    //   if (focusNode === activeElement) {
    //     const nextElement = activeElement.children[focusOffset]
    //
    //     if (nextElement instanceof HTMLElement && isEmbedElement(nextElement)) {
    //       return deleteNextEle(nextElement)
    //     }
    //
    //     setCursorBefore(nextElement, selection)
    //   }
    //
    //   if (!focusNode?.textContent || focusOffset === focusNode.textContent.length) {
    //     const parentNode = focusNode!.parentElement!
    //     const nextNode = parentNode === activeElement ? focusNode!.nextSibling : parentNode.nextSibling
    //
    //     if (nextNode && isEmbedElement(nextNode)) {
    //       return deleteNextEle(<HTMLElement>nextNode)
    //     }
    //
    //     nextNode && setCursorBefore(nextNode, selection)
    //   }
    //
    //   controller.transact(() => {
    //     const {focusNode, focusOffset} = selection;
    //
    //     selection.modify('move', 'forward', 'character')
    //     const textNode = focusNode as Text
    //     textNode.deleteData(focusOffset, 1);
    //     yText.delete(blockRange.start, 1)
    //
    //     if (!textNode.length) {
    //       const parentNode = textNode.parentElement!
    //
    //       if (parentNode === activeElement) {
    //         textNode.remove()
    //         return
    //       }
    //
    //       const prevNode = parentNode.nextSibling!
    //       parentNode.remove()
    //       setCursorBefore(prevNode, selection)
    //     }
    //
    //   }, USER_CHANGE_SIGNAL)
    //   return;
    // }
    //
    // const deltas = [
    //   {retain: blockRange.start},
    //   {delete: blockRange.end - blockRange.start},
    // ]
    // adjustRangeEdges(bRef.containerEle, selection.getRangeAt(0))
    // selection.collapseToEnd()
    // bRef.applyDelta(deltas)
};

class ParagraphBlock extends EditableBlock {
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: ParagraphBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: ParagraphBlock, isStandalone: true, selector: "p.editable-container", usesInheritance: true, ngImport: i0, template: '', isInline: true, styles: [":host.selected{background-color:var(--bf-selected)}\n"], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: ParagraphBlock, decorators: [{
            type: Component,
            args: [{ selector: 'p.editable-container', standalone: true, imports: [], template: '', changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host.selected{background-color:var(--bf-selected)}\n"] }]
        }] });

const ParagraphSchema = {
    flavour: 'paragraph',
    nodeType: 'editable',
    render: ParagraphBlock,
    icon: 'bf_icon bf_wenben',
    label: '基础段落',
};

class HeadingOneBlock extends EditableBlock {
    constructor() {
        super(...arguments);
        this.placeholder = '一级标题';
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: HeadingOneBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: HeadingOneBlock, isStandalone: true, selector: "h2.editable-container", usesInheritance: true, ngImport: i0, template: ``, isInline: true, styles: [""], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: HeadingOneBlock, decorators: [{
            type: Component,
            args: [{ selector: 'h2.editable-container', template: ``, standalone: true, changeDetection: ChangeDetectionStrategy.OnPush }]
        }] });

class HeadingTwoBlock extends EditableBlock {
    constructor() {
        super(...arguments);
        this.placeholder = '二级标题';
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: HeadingTwoBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: HeadingTwoBlock, isStandalone: true, selector: "h3.editable-container", usesInheritance: true, ngImport: i0, template: ``, isInline: true, styles: [""], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: HeadingTwoBlock, decorators: [{
            type: Component,
            args: [{ selector: 'h3.editable-container', template: ``, standalone: true, changeDetection: ChangeDetectionStrategy.OnPush }]
        }] });

class HeadingThreeBlock extends EditableBlock {
    constructor() {
        super(...arguments);
        this.placeholder = '三级标题';
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: HeadingThreeBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: HeadingThreeBlock, isStandalone: true, selector: "h4.editable-container", usesInheritance: true, ngImport: i0, template: ``, isInline: true, styles: [""], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: HeadingThreeBlock, decorators: [{
            type: Component,
            args: [{ selector: 'h4.editable-container', template: ``, standalone: true, changeDetection: ChangeDetectionStrategy.OnPush }]
        }] });

class HeadingFourBlock extends EditableBlock {
    constructor() {
        super(...arguments);
        this.placeholder = '四级标题';
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: HeadingFourBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: HeadingFourBlock, isStandalone: true, selector: "h5.editable-container", usesInheritance: true, ngImport: i0, template: ``, isInline: true, styles: [""], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: HeadingFourBlock, decorators: [{
            type: Component,
            args: [{ selector: 'h5.editable-container', template: ``, standalone: true, changeDetection: ChangeDetectionStrategy.OnPush }]
        }] });

const HeadingOneSchema = {
    flavour: 'heading-one',
    nodeType: 'editable',
    render: HeadingOneBlock,
    icon: 'bf_icon bf_biaoti_1',
    label: '一级标题',
};
const HeadingTwoSchema = {
    flavour: 'heading-two',
    nodeType: 'editable',
    render: HeadingTwoBlock,
    icon: 'bf_icon bf_biaoti_2',
    label: '二级标题',
};
const HeadingThreeSchema = {
    flavour: 'heading-three',
    nodeType: 'editable',
    render: HeadingThreeBlock,
    icon: 'bf_icon bf_biaoti_3',
    label: '三级标题',
};
const HeadingFourSchema = {
    flavour: 'heading-four',
    nodeType: 'editable',
    render: HeadingFourBlock,
    icon: 'bf_icon bf_biaoti_4',
    label: '四级标题',
};

class BulletListBlock extends EditableBlock {
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BulletListBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: BulletListBlock, isStandalone: true, selector: "div.bullet-list.editable-container", usesInheritance: true, ngImport: i0, template: ``, isInline: true, styles: [":host{position:relative;padding-left:1.2em}:host.selected{background-color:var(--bf-selected)}:host:before{position:absolute;text-align:center;padding-left:.5em;left:0;content:\"\\25cf\";color:var(--bf-anchor);font-size:.5em}\n"] }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BulletListBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.bullet-list.editable-container', template: ``, standalone: true, styles: [":host{position:relative;padding-left:1.2em}:host.selected{background-color:var(--bf-selected)}:host:before{position:absolute;text-align:center;padding-left:.5em;left:0;content:\"\\25cf\";color:var(--bf-anchor);font-size:.5em}\n"] }]
        }] });

const BulletListSchema = {
    flavour: 'bullet-list',
    nodeType: 'editable',
    render: BulletListBlock,
    icon: 'bf_icon bf_wuxuliebiao',
    svgIcon: 'bf_wuxuliebiao-color',
    label: '无序列表',
};

function number2letter(n) {
    const ordA = 'a'.charCodeAt(0);
    const ordZ = 'z'.charCodeAt(0);
    const len = ordZ - ordA + 1;
    let s = '';
    while (n >= 0) {
        s = String.fromCharCode((n % len) + ordA) + s;
        n = Math.floor(n / len) - 1;
    }
    return s;
}
// Derive from https://gist.github.com/imilu/00f32c61e50b7ca296f91e9d96d8e976
function number2roman(num) {
    const lookup = {
        M: 1000,
        CM: 900,
        D: 500,
        CD: 400,
        C: 100,
        XC: 90,
        L: 50,
        XL: 40,
        X: 10,
        IX: 9,
        V: 5,
        IV: 4,
        I: 1,
    };
    let romanStr = '';
    for (const i in lookup) {
        while (num >= lookup[i]) {
            romanStr += i;
            num -= lookup[i];
        }
    }
    return romanStr;
}
function getPrefix(depth, index) {
    const map = [() => index + 1, number2letter, () => number2roman(index + 1)];
    return map[depth % map.length](index);
}
function getNumberPrefix(index, depth) {
    const prefix = getPrefix(depth, index);
    if (prefix.toString().length > 1) {
        return `${prefix}`;
    }
    return `${prefix}`;
}

const updateOrderAround = (block, controller) => {
    if (block.flavour !== 'ordered-list')
        return;
    const position = block.getPosition();
    const parentChildren = position.parentId ? controller.getBlockModel(position.parentId).children : controller.rootModel;
    const aroundOrderBlocks = [];
    for (let i = position.index - 1; i >= 0; i--) {
        const prevBlock = parentChildren[i];
        if (prevBlock.flavour !== 'ordered-list' && (!prevBlock.props.indent || prevBlock.props.indent === 0))
            break;
        if (prevBlock.flavour === 'ordered-list' && prevBlock.props.indent === 0) {
            aroundOrderBlocks.unshift(prevBlock);
            break;
        }
        // if (prevBlock.flavour !== 'ordered-list' && <number>prevBlock.props.indent <= block.props.indent) break
        // if(prevBlock.flavour === 'ordered-list' && <number>prevBlock.props.indent < block.props.indent) {
        //   aroundOrderBlocks.unshift(prevBlock as BlockModel<IOrderedListBlockModel>)
        //   break
        // }
        prevBlock.flavour === 'ordered-list' && aroundOrderBlocks.unshift(prevBlock);
    }
    for (let j = position.index; j < parentChildren.length; j++) {
        const nextBlock = parentChildren[j];
        if (nextBlock.flavour !== 'ordered-list' && (!nextBlock.props.indent || nextBlock.props.indent === 0))
            break;
        // if(nextBlock.flavour !== 'ordered-list' && <number>nextBlock.props.indent >= block.props.indent) break
        aroundOrderBlocks.push(nextBlock);
    }
    const orderMap = {};
    let prevIndent = aroundOrderBlocks[0].props.indent;
    orderMap[aroundOrderBlocks[0].props.indent] = aroundOrderBlocks[0].props.order;
    aroundOrderBlocks.slice(1).forEach((b, i) => {
        if (typeof orderMap[b.props.indent] === 'undefined' || b.props.indent > prevIndent) {
            orderMap[b.props.indent] = 0;
            b.props.order !== 0 && b.setProp('order', 0);
            prevIndent = b.props.indent;
            return;
        }
        const correctOrder = orderMap[b.props.indent] + 1;
        b.props.order !== correctOrder && b.setProp('order', correctOrder);
        orderMap[b.props.indent] = correctOrder;
        prevIndent = b.props.indent;
        // const correctOrder = orderMap[b.props.indent] === undefined ? 0 : orderMap[b.props.indent] + 1
        // b.props.order !== correctOrder && b.setProp('order', correctOrder)
        // orderMap[b.props.indent] = correctOrder
    });
    return;
};

class OrderedListBlock extends EditableBlock {
    constructor() {
        super(...arguments);
        this._numPrefix = '';
    }
    ngOnInit() {
        super.ngOnInit();
        this.setOrder();
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => {
            if (v.type === 'props') {
                this.setOrder();
            }
        });
    }
    setOrder() {
        this._numPrefix = getNumberPrefix(this.props.order, this.props.indent);
        this.cdr.markForCheck();
        // this.hostEl.nativeElement.setAttribute('data-order', getNumberPrefix(this.props.order, this.props.indent))
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: OrderedListBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: OrderedListBlock, isStandalone: true, selector: "div.ordered-list", usesInheritance: true, ngImport: i0, template: `
    <span class="order-list__num">{{_numPrefix}}.&nbsp;</span>
    <div class="editable-container"></div>
  `, isInline: true, styles: [":host{position:relative;display:flex}:host.selected{background-color:var(--bf-selected)}:host>.order-list__num{color:var(--bf-anchor)}:host>.editable-container{flex:1;text-indent:0}\n"], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: OrderedListBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.ordered-list', template: `
    <span class="order-list__num">{{_numPrefix}}.&nbsp;</span>
    <div class="editable-container"></div>
  `, standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{position:relative;display:flex}:host.selected{background-color:var(--bf-selected)}:host>.order-list__num{color:var(--bf-anchor)}:host>.editable-container{flex:1;text-indent:0}\n"] }]
        }] });

const OrderedListSchema = {
    flavour: 'ordered-list',
    nodeType: 'editable',
    render: OrderedListBlock,
    icon: 'bf_icon bf_youxuliebiao',
    svgIcon: 'bf_youxuliebiao-color',
    label: '有序列表',
    onCreate: (deltas, props) => {
        return {
            props: () => ({
                order: Math.max((props?.["order"] || 0), 0),
                indent: props?.indent || 0
            }),
            children: deltas
        };
    }
};

class TodoListBlock extends EditableBlock {
    constructor() {
        super(...arguments);
        this.placeholder = '待办事项';
        this._date = null;
        this._checked = false;
    }
    ngOnInit() {
        super.ngOnInit();
        this.setCheck();
    }
    ngAfterViewInit() {
        super.ngAfterViewInit();
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
            if (v.type === 'props') {
                this._checked !== this.props.checked && this.setCheck();
            }
        });
    }
    setCheck() {
        this._checked = this.props.checked;
        this.cdr.markForCheck();
    }
    toggleCheck() {
        if (this.controller.readonly$.value)
            return;
        this._checked = !this._checked;
        this.setProp('checked', this._checked);
    }
    openDatePicker() {
        this._date = this.props.endTime ? new Date(this.props.endTime) : new Date();
    }
    onDatePickerChange(e) {
        e ? this.setProp('endTime', e.getTime()) : this.deleteProp('endTime');
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TodoListBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: TodoListBlock, isStandalone: true, selector: "div.todo-list", host: { properties: { "class.checked": "this._checked" } }, usesInheritance: true, ngImport: i0, template: `
      <span [class]="['todo-list__icon', 'bf_icon', props.checked ? 'bf_xuanzhong-fill' : 'bf_weixuanzhong']"
            [class.checked]="props.checked" (click)="toggleCheck()"></span>
      <div class="editable-container"></div>
  `, isInline: true, styles: [":host{position:relative;padding-left:1.2em}:host.selected{background-color:var(--bf-selected)}.todo-list__icon{position:absolute;left:0;cursor:pointer;color:var(--bf-anchor);font-size:1.1em;line-height:var(--bf-lh)}:host.checked .todo-list__icon{color:var(--bf-anchor)}:host .editable-container{flex:1}:host.checked .editable-container{text-decoration:line-through;opacity:.6}.todo-list__date-pick-icon{cursor:pointer}.todo-list__date-pick-icon:hover{color:#4857e2}\n"], dependencies: [{ kind: "ngmodule", type: FormsModule }, { kind: "ngmodule", type: NzDatePickerModule }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TodoListBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.todo-list', template: `
      <span [class]="['todo-list__icon', 'bf_icon', props.checked ? 'bf_xuanzhong-fill' : 'bf_weixuanzhong']"
            [class.checked]="props.checked" (click)="toggleCheck()"></span>
      <div class="editable-container"></div>
  `, standalone: true, imports: [
                        FormsModule,
                        NgIf,
                        NzDatePickerModule
                    ], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{position:relative;padding-left:1.2em}:host.selected{background-color:var(--bf-selected)}.todo-list__icon{position:absolute;left:0;cursor:pointer;color:var(--bf-anchor);font-size:1.1em;line-height:var(--bf-lh)}:host.checked .todo-list__icon{color:var(--bf-anchor)}:host .editable-container{flex:1}:host.checked .editable-container{text-decoration:line-through;opacity:.6}.todo-list__date-pick-icon{cursor:pointer}.todo-list__date-pick-icon:hover{color:#4857e2}\n"] }]
        }], propDecorators: { _checked: [{
                type: HostBinding,
                args: ['class.checked']
            }] } });

const TodoListSchema = {
    flavour: 'todo-list',
    nodeType: 'editable',
    icon: 'bf_icon bf_gongzuoshixiang',
    svgIcon: 'bf_gongzuoshixiang-color',
    label: '工作事项',
    render: TodoListBlock,
    onCreate: (deltas, props) => {
        return {
            props: () => ({
                checked: false,
                indent: props?.indent || 0
            }),
            children: deltas
        };
    }
};

class BlockquoteBlock extends EditableBlock {
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockquoteBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: BlockquoteBlock, isStandalone: true, selector: "blockquote.bf-multi-line.editable-container", usesInheritance: true, ngImport: i0, template: ``, isInline: true, styles: [":host{padding:6px 8px;border-left:4px solid #ccc;background:var(--bf-bg)}:host.selected{background-color:var(--bf-selected)}\n"] }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockquoteBlock, decorators: [{
            type: Component,
            args: [{ selector: 'blockquote.bf-multi-line.editable-container', template: ``, standalone: true, styles: [":host{padding:6px 8px;border-left:4px solid #ccc;background:var(--bf-bg)}:host.selected{background-color:var(--bf-selected)}\n"] }]
        }] });

const BlockquoteSchema = {
    flavour: 'blockquote',
    nodeType: 'editable',
    icon: 'bf_icon bf_blockquote',
    label: '引用块',
    render: BlockquoteBlock,
    onCreate: (deltas, props) => {
        return {
            props: () => ({
                indent: 0
            }),
            children: deltas
        };
    }
};

class FloatToolbar {
    constructor(destroyRef, cdr) {
        this.destroyRef = destroyRef;
        this.cdr = cdr;
        this.toolbarList = [];
        this.itemClick = new EventEmitter;
    }
    addActive(id) {
        this.activeMenu ??= new Set();
        this.activeMenu?.add(id);
        this.cdr.markForCheck();
    }
    removeActive(id) {
        this.cdr.markForCheck();
        this.activeMenu?.delete(id);
    }
    clearActive() {
        this.cdr.markForCheck();
        this.activeMenu?.clear();
    }
    clearActiveByName(name) {
        this.toolbarList.forEach(item => {
            if (item.name === name && this.activeMenu?.has(item.id)) {
                this.activeMenu?.delete(item.id);
            }
        });
        this.cdr.markForCheck();
    }
    replaceActiveGroupByName(name, id) {
        this.activeMenu ??= new Set();
        this.clearActiveByName(name);
        id && this.addActive(id);
    }
    onMouseEvent(event) {
        event.stopPropagation();
        event.preventDefault();
    }
    onItemClick(event, item) {
        event.stopPropagation();
        this.itemClick.emit({ item, event });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: FloatToolbar, deps: [{ token: i0.DestroyRef }, { token: i0.ChangeDetectorRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "17.3.12", type: FloatToolbar, isStandalone: true, selector: "div.bf-float-toolbar", inputs: { activeMenu: "activeMenu", toolbarList: "toolbarList" }, outputs: { itemClick: "itemClick" }, host: { listeners: { "mousedown": "onMouseEvent($event)" } }, ngImport: i0, template: `
    @for(item of toolbarList; track item.id) {
        <div class="bf-float-toolbar__item" [title]="item.title" (click)="onItemClick($event, item)"
             [class.active]="activeMenu?.has(item.id)" [class.divide]="item.divide">
          <i [class]="item.icon"></i><span *ngIf="item.text">{{ item.text }}</span>
        </div>
    }
  `, isInline: true, styles: [":host{display:flex;height:32px;padding:0 8px;align-items:center;gap:8px;background:#fff;border-radius:4px;box-shadow:0 0 20px #0000001a}.bf-float-toolbar__item{display:flex;gap:4px;align-items:center;justify-content:center;padding:0 4px;height:24px;cursor:pointer;border-radius:4px;font-size:16px;color:#333;white-space:nowrap}.bf-float-toolbar__item.divide{margin-right:8px;position:relative}.bf-float-toolbar__item.divide:after{position:absolute;content:\"\";height:32px;width:1px;background:#e6e6e6;right:-8px;top:-4px}.bf-float-toolbar__item.active{background:#5f6fff14;color:#4857e2}.bf-float-toolbar__item:hover{background:#d7d7d799}.bf-float-toolbar__item>span{font-size:14px}.bf-float-toolbar__item>i{font-size:inherit;color:inherit}\n"], dependencies: [{ kind: "directive", type: NgIf, selector: "[ngIf]", inputs: ["ngIf", "ngIfThen", "ngIfElse"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: FloatToolbar, decorators: [{
            type: Component,
            args: [{ selector: 'div.bf-float-toolbar', template: `
    @for(item of toolbarList; track item.id) {
        <div class="bf-float-toolbar__item" [title]="item.title" (click)="onItemClick($event, item)"
             [class.active]="activeMenu?.has(item.id)" [class.divide]="item.divide">
          <i [class]="item.icon"></i><span *ngIf="item.text">{{ item.text }}</span>
        </div>
    }
  `, standalone: true, imports: [
                        NgForOf,
                        NgIf
                    ], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{display:flex;height:32px;padding:0 8px;align-items:center;gap:8px;background:#fff;border-radius:4px;box-shadow:0 0 20px #0000001a}.bf-float-toolbar__item{display:flex;gap:4px;align-items:center;justify-content:center;padding:0 4px;height:24px;cursor:pointer;border-radius:4px;font-size:16px;color:#333;white-space:nowrap}.bf-float-toolbar__item.divide{margin-right:8px;position:relative}.bf-float-toolbar__item.divide:after{position:absolute;content:\"\";height:32px;width:1px;background:#e6e6e6;right:-8px;top:-4px}.bf-float-toolbar__item.active{background:#5f6fff14;color:#4857e2}.bf-float-toolbar__item:hover{background:#d7d7d799}.bf-float-toolbar__item>span{font-size:14px}.bf-float-toolbar__item>i{font-size:inherit;color:inherit}\n"] }]
        }], ctorParameters: () => [{ type: i0.DestroyRef }, { type: i0.ChangeDetectorRef }], propDecorators: { activeMenu: [{
                type: Input
            }], toolbarList: [{
                type: Input,
                args: [{ required: true }]
            }], itemClick: [{
                type: Output
            }], onMouseEvent: [{
                type: HostListener,
                args: ['mousedown', ['$event']]
            }] } });

const ColorPaletteList = Object.freeze([
    {
        name: "mark",
        value: null,
    },
    {
        name: "mark",
        value: '#d9dcdf',
    },
    {
        name: "mark",
        value: '#9ad7d7',
    },
    {
        name: "mark",
        value: '#dc9b9b',
    },
    {
        name: "mark",
        value: '#dcae8e',
    },
    {
        name: "mark",
        value: '#d3b77d',
    },
    {
        name: "mark",
        value: '#7fce7e',
    },
    {
        name: "mark",
        value: '#8a9ad5',
    },
    {
        name: "mark",
        value: '#a891d9',
    },
]);
const BgColorPaletteList = Object.freeze([
    {
        name: "mark",
        value: '#F4F5F5',
    },
    {
        name: "mark",
        value: '#E0FEFE',
    },
    {
        name: "mark",
        value: '#FEDEDE',
    },
    {
        name: "mark",
        value: '#FFE6CD',
    },
    {
        name: "mark",
        value: '#FFEFBA',
    },
    {
        name: "mark",
        value: '#D3F3D2',
    },
    {
        name: "mark",
        value: '#DCE7FE',
    },
    {
        name: "mark",
        value: '#E9DFFC',
    },
]);

class ColorPalette {
    constructor(cdr) {
        this.cdr = cdr;
        this.activeColor = '';
        this.activeBgColor = '';
        this.activeEdgeColor = '';
        // @Input() hiddenList: ('c' | 'bc' | 'ec')[] = []
        this.showEdgeColor = false;
        this.colorChange = new EventEmitter();
        this.close = new EventEmitter();
        this.colorList = ColorPaletteList;
        this.bgColorList = BgColorPaletteList;
        this.edgeColorList = ColorPaletteList.slice(1);
    }
    onMouseDown(e) {
        e.stopPropagation();
        e.preventDefault();
    }
    pickColor(type, value) {
        type === 'ec' && (this.activeEdgeColor = value);
        type === 'c' && (this.activeColor = value);
        type === 'bc' && (this.activeBgColor = value);
        this.cdr.markForCheck();
        this.colorChange.emit({ type, value });
    }
    ngOnDestroy() {
        this.close.emit(true);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: ColorPalette, deps: [{ token: i0.ChangeDetectorRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: ColorPalette, isStandalone: true, selector: "color-palette", inputs: { activeColor: "activeColor", activeBgColor: "activeBgColor", activeEdgeColor: "activeEdgeColor", showEdgeColor: "showEdgeColor" }, outputs: { colorChange: "colorChange", close: "close" }, host: { listeners: { "mousedown": "onMouseDown($event)" } }, ngImport: i0, template: "<div class=\"gap\"></div>\n<div class=\"container\" style=\"padding: 8px\">\n  <p class=\"title\">\u5B57\u4F53\u989C\u8272</p>\n  <div class=\"list\" style=\"margin-bottom: 8px\">\n          <span class=\"list__item\" *ngFor=\"let item of colorList\"\n                [class.active]=\"item.value === activeColor\"\n                (mousedown)=\"pickColor('c', item.value)\" [style.color]=\"item.value || '#333'\"\n                style=\"border: 1px solid #eee;\">A</span>\n  </div>\n  <ng-container *ngIf=\"showEdgeColor\">\n    <p class=\"title\">\u8FB9\u6846\u989C\u8272</p>\n    <div class=\"list\" style=\"margin-bottom: 8px\">\n      <span class=\"list__item\" [class.active]=\"activeEdgeColor === null\"\n            style=\"border: 1px solid #eee; background: linear-gradient(-45deg, transparent 49%, black 50%, transparent 51%);\"\n            (mousedown)=\"pickColor('ec', null)\">\n       </span>\n      <span class=\"list__item\" *ngFor=\"let item of edgeColorList\"\n            [class.active]=\"item.value === activeEdgeColor\"\n            (mousedown)=\"pickColor('ec', item.value)\" [style.background-color]=\"item.value\"\n            style=\"border: 1px solid #eee;\"></span>\n    </div>\n  </ng-container>\n  <p class=\"title\">\u586B\u5145\u989C\u8272</p>\n  <div class=\"list\">\n    <span class=\"list__item\" [class.active]=\"activeBgColor === null\"\n          style=\"border: 1px solid #eee; background: linear-gradient(-45deg, transparent 49%, black 50%, transparent 51%);\"\n          (mousedown)=\"pickColor('bc', null)\">\n    </span>\n    <span class=\"list__item\" *ngFor=\"let item of bgColorList\"\n          [class.active]=\"item.value === activeBgColor\" [style.background-color]=\"item.value\"\n          (mousedown)=\"pickColor('bc', item.value)\">\n        </span>\n  </div>\n</div>\n<div class=\"gap\"></div>\n", styles: [":host .gap{height:8px;background:transparent}:host .container{background:var(--bf-bg);box-shadow:0 0 20px #0000001a;overflow:hidden;animation:bf_expand_color_picker .15s ease-in-out}@keyframes bf_expand_color_picker{0%{max-height:0}to{max-height:240px}}:host .container .title{margin:0 0 4px;color:#999;font-size:14px;font-style:normal;font-weight:600;line-height:20px}:host .container .list{width:224px;display:flex;justify-content:space-around}:host .container .list__item{width:20px;height:20px;border-radius:4px;cursor:pointer;text-align:center;line-height:20px}:host .container .list__item:hover{outline:2px solid rgba(72,87,226,.6)}:host .container .list__item.active{outline:2px solid #4857E2}\n"], dependencies: [{ kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }, { kind: "directive", type: NgIf, selector: "[ngIf]", inputs: ["ngIf", "ngIfThen", "ngIfElse"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: ColorPalette, decorators: [{
            type: Component,
            args: [{ selector: 'color-palette', standalone: true, imports: [
                        NgForOf,
                        NgIf
                    ], changeDetection: ChangeDetectionStrategy.OnPush, template: "<div class=\"gap\"></div>\n<div class=\"container\" style=\"padding: 8px\">\n  <p class=\"title\">\u5B57\u4F53\u989C\u8272</p>\n  <div class=\"list\" style=\"margin-bottom: 8px\">\n          <span class=\"list__item\" *ngFor=\"let item of colorList\"\n                [class.active]=\"item.value === activeColor\"\n                (mousedown)=\"pickColor('c', item.value)\" [style.color]=\"item.value || '#333'\"\n                style=\"border: 1px solid #eee;\">A</span>\n  </div>\n  <ng-container *ngIf=\"showEdgeColor\">\n    <p class=\"title\">\u8FB9\u6846\u989C\u8272</p>\n    <div class=\"list\" style=\"margin-bottom: 8px\">\n      <span class=\"list__item\" [class.active]=\"activeEdgeColor === null\"\n            style=\"border: 1px solid #eee; background: linear-gradient(-45deg, transparent 49%, black 50%, transparent 51%);\"\n            (mousedown)=\"pickColor('ec', null)\">\n       </span>\n      <span class=\"list__item\" *ngFor=\"let item of edgeColorList\"\n            [class.active]=\"item.value === activeEdgeColor\"\n            (mousedown)=\"pickColor('ec', item.value)\" [style.background-color]=\"item.value\"\n            style=\"border: 1px solid #eee;\"></span>\n    </div>\n  </ng-container>\n  <p class=\"title\">\u586B\u5145\u989C\u8272</p>\n  <div class=\"list\">\n    <span class=\"list__item\" [class.active]=\"activeBgColor === null\"\n          style=\"border: 1px solid #eee; background: linear-gradient(-45deg, transparent 49%, black 50%, transparent 51%);\"\n          (mousedown)=\"pickColor('bc', null)\">\n    </span>\n    <span class=\"list__item\" *ngFor=\"let item of bgColorList\"\n          [class.active]=\"item.value === activeBgColor\" [style.background-color]=\"item.value\"\n          (mousedown)=\"pickColor('bc', item.value)\">\n        </span>\n  </div>\n</div>\n<div class=\"gap\"></div>\n", styles: [":host .gap{height:8px;background:transparent}:host .container{background:var(--bf-bg);box-shadow:0 0 20px #0000001a;overflow:hidden;animation:bf_expand_color_picker .15s ease-in-out}@keyframes bf_expand_color_picker{0%{max-height:0}to{max-height:240px}}:host .container .title{margin:0 0 4px;color:#999;font-size:14px;font-style:normal;font-weight:600;line-height:20px}:host .container .list{width:224px;display:flex;justify-content:space-around}:host .container .list__item{width:20px;height:20px;border-radius:4px;cursor:pointer;text-align:center;line-height:20px}:host .container .list__item:hover{outline:2px solid rgba(72,87,226,.6)}:host .container .list__item.active{outline:2px solid #4857E2}\n"] }]
        }], ctorParameters: () => [{ type: i0.ChangeDetectorRef }], propDecorators: { activeColor: [{
                type: Input
            }], activeBgColor: [{
                type: Input
            }], activeEdgeColor: [{
                type: Input
            }], showEdgeColor: [{
                type: Input
            }], colorChange: [{
                type: Output
            }], close: [{
                type: Output
            }], onMouseDown: [{
                type: HostListener,
                args: ['mousedown', ['$event']]
            }] } });

const COPIED_MENU = {
    id: 'copied',
    name: 'copied',
    icon: 'bf_icon bf_xuanzhong',
    title: '已复制',
    text: '已复制'
};
const IMAGE_BLOCK_TOOLBAR_LIST = [
    {
        id: 'caption',
        name: 'caption',
        icon: 'bf_icon bf_tianjiamiaoshu',
        title: '添加图片标题',
        divide: true
    },
    {
        id: 'align-left',
        name: 'align',
        icon: 'bf_icon bf_tupianjuzuo',
        value: 'left',
        title: '居左'
    },
    {
        id: 'align-center',
        name: 'align',
        icon: 'bf_icon bf_tupianjuzhong',
        value: 'center',
        title: '居中'
    },
    {
        id: 'align-right',
        name: 'align',
        icon: 'bf_icon bf_tupianjuyou',
        value: 'right',
        title: '居右',
        divide: true
    },
    {
        id: 'copy-link',
        name: 'copy-link',
        icon: 'bf_icon bf_tupianlianjie',
        title: '复制图片链接'
    },
    {
        id: 'download',
        name: 'download',
        icon: 'bf_icon bf_xiazai-2',
        title: '下载图片'
    }
];
class ImageBlock extends BaseBlock {
    constructor(_cdr) {
        super();
        this._cdr = _cdr;
        this.TOOLBAR_LIST = [...IMAGE_BLOCK_TOOLBAR_LIST];
        this.imgLoadState = 'loading';
        this._showWidth = 100;
        this._align = 'left';
        this.isFocusing$ = new BehaviorSubject(false);
        this._viewer = null;
    }
    ngOnInit() {
        super.ngOnInit();
        this._showWidth = this.model.props.width;
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
            if (e.type === 'props') {
                this.setAlign();
                this._showWidth !== this.props.width && (this._showWidth = this.props.width);
            }
        });
    }
    ngAfterViewInit() {
        super.ngAfterViewInit();
        this.setAlign();
        const img = this.img.nativeElement;
        if (img.complete && img.naturalHeight !== 0) {
            this.imgLoadState = 'loaded';
            return;
        }
        const errorSub = fromEvent(img, 'error').pipe(take(1)).subscribe(() => {
            this.imgLoadState = 'error';
            this._cdr.detectChanges();
            loadSub.unsubscribe();
        });
        const loadSub = fromEvent(img, 'load').pipe(take(1)).subscribe(() => {
            this.imgLoadState = 'loaded';
            this._cdr.detectChanges();
            errorSub.unsubscribe();
        });
    }
    onKeydown(e) {
        if (e.isComposing || e.eventPhase !== 2)
            return;
        console.log(e);
        switch (e.key) {
            case 'Delete':
            case 'Backspace':
                e.stopPropagation();
                e.preventDefault();
                this.destroySelf();
                break;
            case 'Enter':
                e.stopPropagation();
                e.preventDefault();
                const { parentId, index } = this.getPosition();
                if (parentId !== this.controller.rootId)
                    break;
                const np = this.controller.createBlock('paragraph');
                this.controller.insertBlocks(index + 1, [np], parentId).then(() => {
                    this.controller.selection.setSelection(np.id, 'start');
                });
                break;
            case 'c':
                if (!e.ctrlKey && !e.metaKey)
                    break;
                e.stopPropagation();
                e.preventDefault();
                this.controller.clipboard.writeData([{ type: 'text/uri-list', data: this.props.src }]);
                break;
            case 'x':
                if (this.controller.readonly$.value || (!e.ctrlKey && !e.metaKey))
                    break;
                e.stopPropagation();
                e.preventDefault();
                this.controller.clipboard.writeData([{ type: 'text/uri-list', data: this.props.src }]);
                this.destroySelf();
                break;
        }
    }
    setAlign() {
        if (this._align === this.props.align)
            return;
        this._align = this.props.align;
        this.hostEl.nativeElement.setAttribute('data-align', this._align);
    }
    setToolbarActive() {
        const set = new Set();
        if (this.model.children.length)
            set.add('caption');
        set.add('align-' + this.props.align);
        this.activeMenu = set;
    }
    onImgFocus(event) {
        event.stopPropagation();
        event.preventDefault();
        this.setToolbarActive();
        this.isFocusing$.next(true);
    }
    onImgBlur(event) {
        event.stopPropagation();
        this.isFocusing$.next(false);
    }
    onImgClick(event) {
        event.preventDefault();
        event.stopPropagation();
        if (this.controller.readonly$.value) {
            this.previewImg();
            return;
        }
        if (!this.isFocusing$.value)
            return;
        this.previewImg();
    }
    previewImg() {
        this._viewer ??= new Viewer(this.img.nativeElement, { inline: false, zIndex: 999999 });
        this._viewer.show();
    }
    onResizeHandleMouseDown(event, direction) {
        event.stopPropagation();
        event.preventDefault();
        this.mouseMove$?.unsubscribe();
        this.startPoint = { x: event.clientX, y: event.clientY, direction };
        this.mouseMove$ = fromEvent(document, 'mousemove')
            .pipe(throttleTime(60))
            .subscribe((e) => {
            const movePx = e.clientX - this.startPoint.x;
            if (this.startPoint.direction === 'left')
                this._showWidth -= movePx;
            else
                this._showWidth += movePx;
            this.startPoint.x = e.clientX;
        });
        fromEvent(document, 'mouseup').pipe(take(1)).subscribe((e) => {
            this.startPoint = undefined;
            this.mouseMove$?.unsubscribe();
            this._showWidth !== this.props.width && this.setProp('width', this._showWidth);
        });
    }
    onToolbarItemClick(e) {
        const item = e.item;
        switch (item.name) {
            case 'caption':
                if (this.model.children.length) {
                    this.model.deleteChildren(0, 1);
                }
                else {
                    const paragraph = this.controller.createBlock('paragraph');
                    this.controller.insertBlocks(0, [paragraph], this.id).then(() => {
                        this.controller.selection.setSelection(paragraph.id, 0);
                    });
                }
                this.setToolbarActive();
                break;
            case 'align':
                if (this.props.align === item.value)
                    return;
                this.setProp('align', item.value);
                this.setToolbarActive();
                break;
            case 'copy-link':
                this.controller.clipboard.writeText(this.props.src).then(() => {
                    const idx = this.TOOLBAR_LIST.findIndex(item => item.name === 'copy-link');
                    this.TOOLBAR_LIST.splice(idx, 1, COPIED_MENU);
                    this.activeMenu?.add(COPIED_MENU.id);
                    this.TOOLBAR_LIST = [...this.TOOLBAR_LIST];
                    setTimeout(() => {
                        this.TOOLBAR_LIST.splice(idx, 1, item);
                        this.TOOLBAR_LIST = [...this.TOOLBAR_LIST];
                    }, 2000);
                });
                break;
            case 'download':
                this.download(this.props.src);
                break;
        }
    }
    download(src, caption) {
        let a = document.createElement('a');
        a.href = src;
        a.download = caption || src;
        a.target = '_blank';
        a.dispatchEvent(new MouseEvent('click'));
        a = null;
    }
    onDragStart(e) {
        const target = e.target;
        e.stopPropagation();
        e.dataTransfer?.clearData();
        e.dataTransfer?.setData('text/plain', this.props.src);
        e.dataTransfer?.setData('@bf/image', this.props.src);
        e.dataTransfer?.setDragImage(this.img.nativeElement, 0, 0);
        fromEvent(this.controller.rootElement, 'drop').pipe(takeUntil(fromEvent(target, 'dragend'))).subscribe(e => {
            e.preventDefault();
            e.stopPropagation();
            if (!e.dataTransfer?.getData('@bf/image'))
                return;
            const range = document.caretRangeFromPoint(e.clientX, e.clientY);
            if (!range)
                return;
            const blockId = (range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement)?.closest('[bf-node-type="editable"]')?.id;
            if (!blockId || blockId === this.id)
                return;
            const bRef = this.controller.getBlockRef(blockId);
            if (!bRef || !this.controller.isEditableBlock(bRef))
                return;
            const parentId = bRef.getParentId();
            // 根级直接移动block
            if (parentId === this.controller.rootId) {
                // 计算放置的位置在目标元素的上方还是下方
                const target = e.target;
                const rect = target.getBoundingClientRect();
                const y = e.clientY - rect.top;
                this.controller.moveBlock(this.id, blockId, y < rect.height / 2 ? 'before' : 'after');
                return;
            }
            const nativeRange = this.controller.selection.normalizeStaticRange(bRef.containerEle, range);
            if (bRef.containerEle.classList.contains('bf-plain-text-only') || !bRef.containerEle.classList.contains('bf-multi-line'))
                return;
            const deltas = [];
            if (nativeRange.start > 0) {
                deltas.push({ retain: nativeRange.start });
            }
            deltas.push({ insert: { image: this.props.src } });
            bRef.applyDelta(deltas);
            this.destroySelf();
        });
    }
    ngOnDestroy() {
        super.ngOnDestroy();
        this._viewer?.destroy();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: ImageBlock, deps: [{ token: i0.ChangeDetectorRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "17.3.12", type: ImageBlock, isStandalone: true, selector: "div.image-block", host: { properties: { "attr.contenteditable": "false" } }, viewQueries: [{ propertyName: "img", first: true, predicate: ["img"], descendants: true, read: ElementRef, static: true }], usesInheritance: true, ngImport: i0, template: `
    <div class="img-block__container" [style.width.px]="_showWidth"
         [attr.tabindex]=" (controller.readonly$ | async) ? null : 0 " (keydown)="onKeydown($event)"
         (focus)="onImgFocus($event)" (blur)="onImgBlur($event)">

      <div [class]="['img-default-skeleton', imgLoadState]" *ngIf="imgLoadState !== 'loaded'">
        <span class="img-default-skeleton__icon bf_icon bf_jiazai" *ngIf="imgLoadState === 'loading'"></span>
        <span class="img-default-skeleton__error" *ngIf="imgLoadState === 'error'">加载失败!</span>
      </div>

      @if (imgLoadState === 'loaded') {
        <div class="bf-float-toolbar img-block__toolbar" *ngIf="isFocusing$ | async"
             [toolbarList]="TOOLBAR_LIST" [activeMenu]="activeMenu" (click)="$event.stopPropagation();"
             (itemClick)="onToolbarItemClick($event)">
        </div>
      }

      <img [src]="model.props.src" [class.focusing]="isFocusing$ | async"
           draggable="false" (click)="onImgClick($event)" #img>

      <ng-container *ngIf="imgLoadState === 'loaded'">
        <p class="img-block__caption editable-container" *ngFor="let item of children"
           [controller]="controller" [model]="item" [placeholder]="'添加标题'"
           (click)="$event.stopPropagation()" (mousemove)="$event.stopPropagation()"></p>
      </ng-container>

      <div class="img-resizer" *ngIf="isFocusing$ | async" (click)="onImgClick($event)" draggable="true"
           (dragstart)="onDragStart($event)">
        <div class="img-resizer__handle img-resizer__handle__line img-resizer__handle--left"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__line  img-resizer__handle--right"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--tl"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--tr"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--bl"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--br"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
      </div>

    </div>
  `, isInline: true, styles: [".img-block__toolbar{z-index:100;position:absolute;top:-40px;right:50%;transform:translate(50%)}:host{display:flex;width:fit-content;max-width:100%}:host[data-align=left]{margin-left:0}:host[data-align=right]{margin-left:100%;transform:translate(-100%)}:host[data-align=center]{margin:0 auto}:host.selected .img-block__container{outline:2px solid var(--bf-selected-border)}.img-block__container{position:relative;max-width:100%;min-width:150px}.img-block__container img{display:block;width:100%}.img-default-skeleton{position:absolute;top:0;left:0;width:100%;height:100%;background-color:#f3f3f380}.img-default-skeleton.loading,.img-default-skeleton.error{min-height:200px;width:100%;display:flex;justify-content:center;align-items:center}.img-default-skeleton__icon{font-size:40px;color:#5089b2;transform-origin:center center;animation:bf_img_loading 1s linear infinite}@keyframes bf_img_loading{to{transform:rotate(360deg)}}.img-default-skeleton__error{color:red}.img-block__caption{z-index:1;position:absolute;margin:0;width:100%;bottom:0;left:0;padding:8px;font-size:14px;color:#fff;background:linear-gradient(180deg,transparent 0%,rgba(0,0,0,.4) 100%);box-sizing:border-box}.img-resizer{position:absolute;top:0;left:0;width:100%;height:100%;border:2px solid #4857E2;outline:2px solid #B9C0FF;cursor:zoom-in;box-shadow:0 0 5px 2px #e8e8e8}.img-resizer__handle{z-index:1;position:absolute}.img-resizer__handle__point{width:14px;height:14px;background-color:#4857e2;border:2px solid #fff;border-radius:50%}.img-resizer__handle--tl{top:-7px;left:-7px;cursor:nwse-resize}.img-resizer__handle--tr{top:-7px;right:-7px;cursor:nesw-resize}.img-resizer__handle--bl{bottom:-7px;left:-7px;cursor:nesw-resize}.img-resizer__handle--br{bottom:-7px;right:-7px;cursor:nwse-resize}.img-resizer__handle--left,.img-resizer__handle--right{top:0;width:4px;height:100%;cursor:w-resize}.img-resizer__handle--left{left:-2px}.img-resizer__handle--right{right:-2px}\n"], dependencies: [{ kind: "directive", type: NgIf, selector: "[ngIf]", inputs: ["ngIf", "ngIfThen", "ngIfElse"] }, { kind: "component", type: ParagraphBlock, selector: "p.editable-container" }, { kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }, { kind: "component", type: FloatToolbar, selector: "div.bf-float-toolbar", inputs: ["activeMenu", "toolbarList"], outputs: ["itemClick"] }, { kind: "ngmodule", type: OverlayModule }, { kind: "pipe", type: AsyncPipe, name: "async" }] }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: ImageBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.image-block', standalone: true, template: `
    <div class="img-block__container" [style.width.px]="_showWidth"
         [attr.tabindex]=" (controller.readonly$ | async) ? null : 0 " (keydown)="onKeydown($event)"
         (focus)="onImgFocus($event)" (blur)="onImgBlur($event)">

      <div [class]="['img-default-skeleton', imgLoadState]" *ngIf="imgLoadState !== 'loaded'">
        <span class="img-default-skeleton__icon bf_icon bf_jiazai" *ngIf="imgLoadState === 'loading'"></span>
        <span class="img-default-skeleton__error" *ngIf="imgLoadState === 'error'">加载失败!</span>
      </div>

      @if (imgLoadState === 'loaded') {
        <div class="bf-float-toolbar img-block__toolbar" *ngIf="isFocusing$ | async"
             [toolbarList]="TOOLBAR_LIST" [activeMenu]="activeMenu" (click)="$event.stopPropagation();"
             (itemClick)="onToolbarItemClick($event)">
        </div>
      }

      <img [src]="model.props.src" [class.focusing]="isFocusing$ | async"
           draggable="false" (click)="onImgClick($event)" #img>

      <ng-container *ngIf="imgLoadState === 'loaded'">
        <p class="img-block__caption editable-container" *ngFor="let item of children"
           [controller]="controller" [model]="item" [placeholder]="'添加标题'"
           (click)="$event.stopPropagation()" (mousemove)="$event.stopPropagation()"></p>
      </ng-container>

      <div class="img-resizer" *ngIf="isFocusing$ | async" (click)="onImgClick($event)" draggable="true"
           (dragstart)="onDragStart($event)">
        <div class="img-resizer__handle img-resizer__handle__line img-resizer__handle--left"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__line  img-resizer__handle--right"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--tl"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--tr"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--bl"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--br"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
      </div>

    </div>
  `, imports: [
                        NgIf, ParagraphBlock, NgForOf, FloatToolbar, OverlayModule, AsyncPipe
                    ], host: {
                        '[attr.contenteditable]': 'false',
                    }, styles: [".img-block__toolbar{z-index:100;position:absolute;top:-40px;right:50%;transform:translate(50%)}:host{display:flex;width:fit-content;max-width:100%}:host[data-align=left]{margin-left:0}:host[data-align=right]{margin-left:100%;transform:translate(-100%)}:host[data-align=center]{margin:0 auto}:host.selected .img-block__container{outline:2px solid var(--bf-selected-border)}.img-block__container{position:relative;max-width:100%;min-width:150px}.img-block__container img{display:block;width:100%}.img-default-skeleton{position:absolute;top:0;left:0;width:100%;height:100%;background-color:#f3f3f380}.img-default-skeleton.loading,.img-default-skeleton.error{min-height:200px;width:100%;display:flex;justify-content:center;align-items:center}.img-default-skeleton__icon{font-size:40px;color:#5089b2;transform-origin:center center;animation:bf_img_loading 1s linear infinite}@keyframes bf_img_loading{to{transform:rotate(360deg)}}.img-default-skeleton__error{color:red}.img-block__caption{z-index:1;position:absolute;margin:0;width:100%;bottom:0;left:0;padding:8px;font-size:14px;color:#fff;background:linear-gradient(180deg,transparent 0%,rgba(0,0,0,.4) 100%);box-sizing:border-box}.img-resizer{position:absolute;top:0;left:0;width:100%;height:100%;border:2px solid #4857E2;outline:2px solid #B9C0FF;cursor:zoom-in;box-shadow:0 0 5px 2px #e8e8e8}.img-resizer__handle{z-index:1;position:absolute}.img-resizer__handle__point{width:14px;height:14px;background-color:#4857e2;border:2px solid #fff;border-radius:50%}.img-resizer__handle--tl{top:-7px;left:-7px;cursor:nwse-resize}.img-resizer__handle--tr{top:-7px;right:-7px;cursor:nesw-resize}.img-resizer__handle--bl{bottom:-7px;left:-7px;cursor:nesw-resize}.img-resizer__handle--br{bottom:-7px;right:-7px;cursor:nwse-resize}.img-resizer__handle--left,.img-resizer__handle--right{top:0;width:4px;height:100%;cursor:w-resize}.img-resizer__handle--left{left:-2px}.img-resizer__handle--right{right:-2px}\n"] }]
        }], ctorParameters: () => [{ type: i0.ChangeDetectorRef }], propDecorators: { img: [{
                type: ViewChild,
                args: ['img', { static: true, read: ElementRef }]
            }] } });

/**
 * {@link IFileUploader}
 */
const FILE_UPLOADER = new InjectionToken('IFileUploader');

const ImageSchema = {
    flavour: 'image',
    nodeType: 'block',
    render: ImageBlock,
    icon: 'bf_icon bf_tupian-color',
    svgIcon: 'bf_tupian-color',
    label: '图片',
    onCreate: (src, width) => {
        if (!src)
            throw new Error('src is required');
        return {
            props: () => ({
                src,
                width: width || 400,
                height: 0,
                align: 'left'
            }),
            children: []
        };
    }
};

class DividerBlock extends BaseBlock {
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: DividerBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: DividerBlock, isStandalone: true, selector: "div.bf-divider", usesInheritance: true, ngImport: i0, template: `<div></div>`, isInline: true, styles: [":host{padding:8px 0 7px}:host.selected{background-color:var(--bf-selected)}:host>div{height:1px;background-color:#e6e6e6}\n"], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: DividerBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.bf-divider', template: `<div></div>`, standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{padding:8px 0 7px}:host.selected{background-color:var(--bf-selected)}:host>div{height:1px;background-color:#e6e6e6}\n"] }]
        }] });

const DividerSchema = {
    flavour: 'divider',
    nodeType: 'void',
    render: DividerBlock,
    icon: 'bf_icon bf_fengexian',
    svgIcon: 'bf_fengexian-color',
    label: '分割线',
};

const TOOLBAR_LIST$1 = [
    {
        id: 'color',
        icon: 'bf_icon bf_yanse',
        name: 'color',
        title: '更换颜色',
        divide: true
    },
    {
        id: 'copy',
        icon: 'bf_icon bf_fuzhi',
        name: 'copy',
        title: '复制文本'
    }
];
const COPIED_TOOLBAR_LIST = [...TOOLBAR_LIST$1].slice(0, TOOLBAR_LIST$1.length - 1).concat({
    id: 'copied',
    icon: 'bf_icon bf_fuzhi',
    name: 'copied',
    title: '复制文本',
    text: '已复制',
});
const POSITIONS$1 = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' },
];
class CalloutBlock extends EditableBlock {
    constructor(overlay) {
        super();
        this.overlay = overlay;
        this._backgroundColor = '#dc9b9b';
        this._borderColor = '#FFE6CD';
        this._toolbarDispose$ = new Subject();
        this.closeToolbar = () => {
            this.toolbarOverlayRef?.dispose();
            this.toolbarOverlayRef = undefined;
            this._toolbarDispose$.next(true);
            this.closeColorPicker();
        };
        this.closeColorPicker = () => {
            this._colorPickerOverlayRef?.dispose();
            this._colorPickerOverlayRef = undefined;
        };
    }
    ngOnInit() {
        super.ngOnInit();
        this.setStyle();
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
            if (v.type === 'props')
                this.setStyle();
        });
    }
    setStyle() {
        this._backgroundColor !== this.props.bc && (this._backgroundColor = this.props.bc);
        this._borderColor !== this.props.ec && (this._borderColor = this.props.ec);
        this.cdr.markForCheck();
    }
    showToolbar(e) {
        if (this.toolbarOverlayRef)
            return;
        this.toolbarOverlayRef = this.overlay.create({
            positionStrategy: this.overlay.position().flexibleConnectedTo(this.hostEl.nativeElement).withPositions(POSITIONS$1),
            scrollStrategy: this.overlay.scrollStrategies.close()
        });
        this.toolbarOverlayRef.backdropClick().pipe(take(1)).subscribe(this.closeToolbar);
        const cpr = this.toolbarOverlayRef.attach(new ComponentPortal(FloatToolbar));
        cpr.setInput('toolbarList', TOOLBAR_LIST$1);
        fromEvent(this.hostEl.nativeElement, 'mouseleave').pipe(takeUntil(this._toolbarDispose$)).subscribe(e => {
            if (!cpr.location.nativeElement.contains(e.relatedTarget))
                this.closeToolbar();
        });
        fromEvent(cpr.location.nativeElement, 'mouseleave').pipe(takeUntil(this._toolbarDispose$)).subscribe(e => {
            if (e.relatedTarget !== this.hostEl.nativeElement && !e.relatedTarget.closest('.cdk-overlay-container'))
                this.closeToolbar();
        });
        cpr.instance.itemClick.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ item, event }) => {
            switch (item.name) {
                case 'color':
                    this.showColorPicker(event.target);
                    break;
                case 'copy':
                    navigator.clipboard.writeText(this.getTextContent()).then(() => {
                        cpr.setInput('toolbarList', COPIED_TOOLBAR_LIST);
                        setTimeout(() => {
                            cpr.setInput('toolbarList', TOOLBAR_LIST$1);
                        }, 2000);
                    });
            }
        });
    }
    showColorPicker(target) {
        if (this._colorPickerOverlayRef)
            return;
        const positionStrategy = this.overlay.position().flexibleConnectedTo(target).withPositions([
            { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
            { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
        ]).withPush(false);
        this._colorPickerOverlayRef = this.overlay.create({
            positionStrategy,
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-transparent-backdrop',
            scrollStrategy: this.overlay.scrollStrategies.close()
        });
        this._colorPickerOverlayRef.backdropClick().pipe(take(1)).subscribe(this.closeColorPicker);
        const cpr = this._colorPickerOverlayRef.attach(new ComponentPortal(ColorPalette));
        cpr.setInput('activeColor', this.props.c);
        cpr.setInput('activeBgColor', this.props.bc);
        cpr.setInput('activeEdgeColor', this.props.ec);
        cpr.setInput('showEdgeColor', true);
        cpr.instance.colorChange.pipe(takeUntil(cpr.instance.close)).subscribe(({ type, value }) => {
            this.setProp(type, value);
        });
    }
    ngOnDestroy() {
        super.ngOnDestroy();
        this.closeToolbar();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: CalloutBlock, deps: [{ token: i1.Overlay }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: CalloutBlock, isStandalone: true, selector: "div.callout-block", host: { listeners: { "mouseenter": "showToolbar()" }, properties: { "style.backgroundColor": "this._backgroundColor", "style.borderColor": "this._borderColor" } }, usesInheritance: true, ngImport: i0, template: `
    <span class="callout-block__emoji">{{ props.emoji }}</span>
    <div class="editable-container bf-multi-line" [style.color]="props.c" contenteditable="true"
         (blur)="closeToolbar()"></div>
  `, isInline: true, styles: [":host{border:1px solid transparent;padding:8px 8px 8px 42px;border-radius:4px;position:relative}:host.selected{background-color:var(--bf-selected)!important;border:1px solid var(--bf-selected-border)!important}.callout-block__emoji{position:absolute;left:12px;top:8px;font-size:18px;text-indent:0;cursor:pointer}.callout-block__emoji:hover{background-color:#4857e24d;border-radius:4px}\n"], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: CalloutBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.callout-block', template: `
    <span class="callout-block__emoji">{{ props.emoji }}</span>
    <div class="editable-container bf-multi-line" [style.color]="props.c" contenteditable="true"
         (blur)="closeToolbar()"></div>
  `, standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{border:1px solid transparent;padding:8px 8px 8px 42px;border-radius:4px;position:relative}:host.selected{background-color:var(--bf-selected)!important;border:1px solid var(--bf-selected-border)!important}.callout-block__emoji{position:absolute;left:12px;top:8px;font-size:18px;text-indent:0;cursor:pointer}.callout-block__emoji:hover{background-color:#4857e24d;border-radius:4px}\n"] }]
        }], ctorParameters: () => [{ type: i1.Overlay }], propDecorators: { _backgroundColor: [{
                type: HostBinding,
                args: ['style.backgroundColor']
            }], _borderColor: [{
                type: HostBinding,
                args: ['style.borderColor']
            }], showToolbar: [{
                type: HostListener,
                args: ['mouseenter']
            }] } });

const CalloutSchema = {
    flavour: 'callout',
    nodeType: 'editable',
    icon: 'bf_icon bf_gaoliangkuai',
    svgIcon: 'bf_gaoliangkuai-color',
    label: '高亮块',
    render: CalloutBlock,
    onCreate: (deltas, props) => {
        return {
            props: () => ({
                indent: 0,
                ec: '#dc9b9b',
                bc: '#FFE6CD',
                c: null,
                emoji: '🔥',
            }),
            children: deltas
        };
    }
};

const LANGUAGE_LIST = [
    { value: 'java', name: 'Java' },
    { value: 'javascript', name: 'JavaScript' },
    { value: 'typescript', name: 'TypeScript' },
    { value: 'css', name: 'CSS' },
    { value: 'html', name: 'HTML' },
    { value: 'php', name: 'PHP' },
    { value: 'python', name: 'Python' },
    { value: 'go', name: 'Go' },
    { value: 'c', name: 'C' },
    { value: 'cs', name: 'C#' },
    { value: 'cpp', name: 'C++' },
    { value: 'rust', name: 'Rust' },
    { value: 'json', name: 'JSON' },
    { value: 'sql', name: 'SQL' },
    { value: 'xml', name: 'XML' },
    { value: 'bash', name: 'Bash' },
    { value: 'kotlin', name: 'Kotlin' },
    { value: 'swift', name: 'Swift' },
    { value: 'ruby', name: 'Ruby' },
    { value: 'scala', name: 'Scala' },
    { value: 'dart', name: 'Dart' },
    { value: 'git', name: 'Git' },
    { value: 'mongodb', name: 'MongoDB' },
    { value: 'nginx', name: 'nginx' },
    { value: 'markdown', name: 'Markdown' },
].sort((item1, item2) => item1.name.localeCompare(item2.name));

class LangNamePipe {
    transform(val) {
        return LANGUAGE_LIST.find(v => v.value === val)?.name;
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LangNamePipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "17.3.12", ngImport: i0, type: LangNamePipe, isStandalone: true, name: "lang" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LangNamePipe, decorators: [{
            type: Pipe,
            args: [{
                    name: 'lang',
                    standalone: true
                }]
        }] });

class LangListComponent {
    constructor(cdr, destroyRef) {
        this.cdr = cdr;
        this.destroyRef = destroyRef;
        this.activeLang = 'javascript';
        this.langChange = new EventEmitter();
        this.destroy = new EventEmitter();
        this.languageList = LANGUAGE_LIST;
        this.hoverIdx = -1;
    }
    ngOnInit() {
        this.setHoverIdx(this.activeLang);
    }
    ngAfterViewInit() {
        this.input.nativeElement.focus();
        this.viewHoverLang();
    }
    onMouseEnter(e) {
        const target = e.target;
        if (target.classList.contains('lang-list_item')) {
            this.setHoverIdx(target.dataset["value"]);
        }
    }
    onMouseDown(e) {
        e.stopPropagation();
        e.preventDefault();
        const target = e.target;
        if (target.classList.contains('lang-list_item')) {
            this.langChange.emit(this.languageList.find(item => item.value === target.dataset["value"]));
        }
    }
    setHoverIdx(v) {
        this.hoverIdx = this.languageList.findIndex(item => item.value === v);
    }
    viewHoverLang() {
        this.langList.nativeElement.children[this.hoverIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    onSearch(e) {
        const v = e.target.value;
        if (!v)
            this.languageList = LANGUAGE_LIST;
        else
            this.languageList = LANGUAGE_LIST.filter(item => item.value.includes(v) || item.name.includes(v));
        this.hoverIdx = [0, this.hoverIdx, this.languageList.length].sort((a, b) => a - b)[1];
        this.cdr.markForCheck();
    }
    onKeydown($event) {
        switch ($event.key) {
            case 'Escape':
                $event.preventDefault();
                this.destroy.emit();
                break;
            case 'ArrowDown':
                $event.preventDefault();
                this.hoverIdx = this.hoverIdx < this.languageList.length - 1 ? this.hoverIdx + 1 : 0;
                this.cdr.detectChanges();
                this.viewHoverLang();
                break;
            case 'ArrowUp':
                $event.preventDefault();
                this.hoverIdx = this.hoverIdx > 0 ? this.hoverIdx - 1 : this.languageList.length - 1;
                this.cdr.detectChanges();
                this.viewHoverLang();
                break;
            case 'Enter':
                if (!this.languageList.length || !this.languageList[this.hoverIdx])
                    return;
                this.langChange.emit(this.languageList[this.hoverIdx]);
                break;
            default:
                break;
        }
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LangListComponent, deps: [{ token: i0.ChangeDetectorRef }, { token: i0.DestroyRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "17.3.12", type: LangListComponent, isStandalone: true, selector: "lang-list", inputs: { activeLang: "activeLang" }, outputs: { langChange: "langChange", destroy: "destroy" }, viewQueries: [{ propertyName: "input", first: true, predicate: ["input"], descendants: true, read: ElementRef }, { propertyName: "langList", first: true, predicate: ["langList"], descendants: true, read: ElementRef }], ngImport: i0, template: `
    <input (input)="onSearch($event)" #input (keydown)="onKeydown($event)" />
    <div class="lang-list" (mouseover)="onMouseEnter($event)" (mousedown)="onMouseDown($event)" #langList>
      @for (item of languageList; track item.name; let index = $index) {
        <div class="lang-list_item" [class.active]="item.value === activeLang"
             [attr.data-value]="item.value" [class.hover]="hoverIdx === index">
          {{ item.name }}
        </div>
      }
    </div>
  `, isInline: true, styles: [":host{background-color:#fff;border:1px solid #f5f2f0;box-shadow:0 0 4px #0000001a;border-radius:4px;padding:4px}:host>input{margin:0 auto;width:120px;height:calc(var(--bf-lh) * 1.5);line-height:calc(var(--bf-lh) * 1.5);font-size:var(--bf-fs);border:1px solid #f5f2f0;border-radius:4px;padding:0 4px}:host>input:focus{outline:1px solid #4857E2}:host .lang-list{margin-top:4px;max-height:40vh;overflow-y:auto}:host .lang-list_item{margin-top:4px;padding:0 4px;height:calc(var(--bf-lh) * 1.5);line-height:calc(var(--bf-lh) * 1.5);text-align:center;font-size:calc(var(--bf-fs) * .8);color:#999;cursor:pointer;border-radius:4px}:host .lang-list_item:is(.active,.hover){background-color:#9999991a}\n"], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LangListComponent, decorators: [{
            type: Component,
            args: [{ selector: 'lang-list', template: `
    <input (input)="onSearch($event)" #input (keydown)="onKeydown($event)" />
    <div class="lang-list" (mouseover)="onMouseEnter($event)" (mousedown)="onMouseDown($event)" #langList>
      @for (item of languageList; track item.name; let index = $index) {
        <div class="lang-list_item" [class.active]="item.value === activeLang"
             [attr.data-value]="item.value" [class.hover]="hoverIdx === index">
          {{ item.name }}
        </div>
      }
    </div>
  `, imports: [NgForOf], standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{background-color:#fff;border:1px solid #f5f2f0;box-shadow:0 0 4px #0000001a;border-radius:4px;padding:4px}:host>input{margin:0 auto;width:120px;height:calc(var(--bf-lh) * 1.5);line-height:calc(var(--bf-lh) * 1.5);font-size:var(--bf-fs);border:1px solid #f5f2f0;border-radius:4px;padding:0 4px}:host>input:focus{outline:1px solid #4857E2}:host .lang-list{margin-top:4px;max-height:40vh;overflow-y:auto}:host .lang-list_item{margin-top:4px;padding:0 4px;height:calc(var(--bf-lh) * 1.5);line-height:calc(var(--bf-lh) * 1.5);text-align:center;font-size:calc(var(--bf-fs) * .8);color:#999;cursor:pointer;border-radius:4px}:host .lang-list_item:is(.active,.hover){background-color:#9999991a}\n"] }]
        }], ctorParameters: () => [{ type: i0.ChangeDetectorRef }, { type: i0.DestroyRef }], propDecorators: { activeLang: [{
                type: Input
            }], langChange: [{
                type: Output
            }], destroy: [{
                type: Output
            }], input: [{
                type: ViewChild,
                args: ['input', { read: ElementRef }]
            }], langList: [{
                type: ViewChild,
                args: ['langList', { read: ElementRef }]
            }] } });

function updateHighlightedTokens(container, oldTokens, newTokens) {
    const oldLength = oldTokens.length;
    const newLength = newTokens.length;
    let oldIndex = 0, newIndex = 0;
    const childNodes = Array.from(container.childNodes); // 确保节点快照一致
    while (oldIndex < oldLength || newIndex < newLength) {
        const oldToken = oldTokens[oldIndex];
        const newToken = newTokens[newIndex];
        // Case 1: 删除旧节点
        if (oldIndex < oldLength && newIndex >= newLength) {
            container.removeChild(childNodes[oldIndex]);
            oldIndex++;
        }
        // Case 2: 插入新节点
        else if (newIndex < newLength && oldIndex >= oldLength) {
            const newNode = createTokenNode(newToken);
            container.appendChild(newNode);
            newIndex++;
        }
        // Case 3: 替换变化的节点
        else if (isTokenChanged(oldToken, newToken) // 检查是否有变化
        ) {
            const newNode = createTokenNode(newToken);
            container.replaceChild(newNode, childNodes[oldIndex]);
            oldIndex++;
            newIndex++;
        }
        // Case 4: 节点相同，跳过
        else {
            oldIndex++;
            newIndex++;
        }
    }
}
// 判断两个 Token 是否发生变化
function isTokenChanged(oldToken, newToken) {
    if (typeof oldToken === 'string' && typeof newToken === 'string') {
        return oldToken !== newToken;
    }
    if (typeof oldToken === 'object' && typeof newToken === 'object') {
        if (oldToken.type !== newToken.type)
            return true;
        return compareTokenContent(oldToken.content, newToken.content);
    }
    return true; // 类型不同必然变化
}
// 比较 TokenStream 的内容（支持嵌套数组）
function compareTokenContent(oldContent, newContent) {
    if (typeof oldContent === 'string' && typeof newContent === 'string') {
        return oldContent !== newContent;
    }
    if (Array.isArray(oldContent) && Array.isArray(newContent)) {
        if (oldContent.length !== newContent.length)
            return true;
        for (let i = 0; i < oldContent.length; i++) {
            if (isTokenChanged(oldContent[i], newContent[i])) {
                return true;
            }
        }
        return false;
    }
    if (typeof oldContent === 'object' && typeof newContent === 'object') {
        return isTokenChanged(oldContent, newContent);
    }
    return true; // 不同类型或无法比较时认为内容已变
}
// 创建一个高亮 Token 的 DOM 节点
function createTokenNode(token) {
    const span = document.createElement('span');
    if (typeof token === 'string') {
        if (token.startsWith('\n')) {
            span.className = 'line-break';
        }
        // Token 是纯字符串
        span.textContent = token;
    }
    else if (typeof token === 'object') {
        // Token 是对象
        span.className = `${token.type}`; // 样式类
        if (Array.isArray(token.content)) {
            // 递归创建子节点
            token.content.forEach(subToken => {
                span.appendChild(createTokenNode(subToken));
            });
        }
        else {
            span.textContent = token.content;
        }
    }
    return span;
}

class CodeBlock extends EditableBlock {
    constructor(overlay) {
        super();
        this.overlay = overlay;
        this.lines = [];
        this.oldTokens = [];
        this.highlight = (text = this.getTextContent()) => {
            // console.time('highlight')
            const tokens = Prism.tokenize(text, Prism.languages[this.props.lang]);
            updateHighlightedTokens(this.highlighter.nativeElement, this.oldTokens, tokens);
            this.oldTokens = tokens;
            // console.timeEnd('highlight')
        };
    }
    ngAfterViewInit() {
        super.ngAfterViewInit();
        this.highlight();
        this.yText.observe(e => {
            this.highlight();
        });
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
            if (e.type === 'props') {
                this.highlight();
            }
        });
        fromEventPattern((handler) => {
            this.resizeSub = new ResizeObserver(handler);
            this.resizeSub.observe(this.hostEl.nativeElement);
        }, (handler) => {
            this.resizeSub?.disconnect();
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
            // 高度变化时
            this.setLines();
        });
    }
    onKeydown(e) {
        // if((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
        //   e.preventDefault()
        //   e.stopPropagation()
        //
        // }
    }
    setLines() {
        this.lines = this.getTextContent().replace(/\n$/, '').split('\n');
        this.cdr.markForCheck();
    }
    changeLanguage(mode) {
        this.setProp('lang', mode);
        this.cdr.markForCheck();
    }
    showLangList(e) {
        const positionStrategy = this.overlay.position().flexibleConnectedTo(e.target).withPositions([
            { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' }
        ]);
        const portal = new ComponentPortal(LangListComponent);
        const ovr = this.overlay.create({
            positionStrategy,
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-transparent-backdrop',
        });
        const cpr = ovr.attach(portal);
        cpr.setInput('activeLang', this.props.lang);
        const ls = this.destroyRef.onDestroy(() => {
            ovr.dispose();
        });
        const close = () => {
            ovr.dispose();
            this.setSelection(0);
            ls();
        };
        merge(cpr.instance.destroy, ovr.backdropClick()).pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe(() => {
            close();
        });
        cpr.instance.langChange.pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe((lang) => {
            this.changeLanguage(lang.value);
            close();
        });
    }
    onCopyText(e) {
        e.stopPropagation();
        e.preventDefault();
        const text = this.getTextContent();
        this.controller.clipboard.writeText(text).then(() => {
            const el = e.target;
            el.childNodes[1].textContent = '已复制';
            setTimeout(() => {
                el.childNodes[1].textContent = '复制';
            }, 2000);
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: CodeBlock, deps: [{ token: i1.Overlay }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: CodeBlock, isStandalone: true, selector: "div.code-block", viewQueries: [{ propertyName: "highlighter", first: true, predicate: ["highlighter"], descendants: true, read: ElementRef, static: true }], usesInheritance: true, ngImport: i0, template: "<div class=\"line-numbers\">\n  <span *ngFor=\"let line of lines; let i = index\">\n    {{ i + 1 }}\n  </span>\n</div>\n\n<div class=\"editable-container bf-multi-line bf-plain-text-only\" (keydown)=\"onKeydown($event)\">\n</div>\n\n<div class=\"highlight-container\">\n  <div #highlighter></div>\n</div>\n\n<div class=\"head-btn__group\">\n  <div class=\"head-btn\" (click)=\"showLangList($event)\">\n    <span>{{ props.lang | lang }}</span> <i class=\"bf_icon bf_xiajaintou\" [hidden]=\"controller.readonly$ | async\"></i>\n  </div>\n  <div class=\"head-btn\" (mousedown)=\"onCopyText($event)\"><i class=\"bf_icon bf_fuzhi\"></i> \u590D\u5236</div>\n</div>\n\n", styles: ["@charset \"UTF-8\";:host{--code-padding-left: calc(var(--bf-fs) * 2.5);--code-padding-top: calc(var(--bf-lh) * 1.5);--code-padding-bottom: 20px;padding:var(--code-padding-top) var(--code-padding-left) var(--code-padding-bottom);border:1px solid #e6e6e6;border-radius:4px;--code-font-family: \"DM Mono\", monospace;position:relative}:host.selected{border-color:var(--bf-selected-border);background-color:var(--bf-selected)}:host:focus-within .line-numbers{visibility:visible}:host .line-numbers{visibility:hidden;position:absolute;top:var(--code-padding-top);left:0;width:calc(var(--code-padding-left) * .8);height:calc(100% - var(--code-padding-top) - var(--code-padding-bottom));color:#abb2bf;font-size:calc(var(--bf-fs) * .9);pointer-events:none;-webkit-user-select:none;user-select:none;overflow:hidden}:host .line-numbers>span{display:block;width:100%;flex:1;line-height:var(--bf-lh);text-align:end;font-family:var(--code-font-family)}:host .editable-container{font-weight:100;background:transparent!important;color:transparent!important;caret-color:#000!important}:host .editable-container,:host .highlight-container{font-size:var(--bf-fs);line-height:var(--bf-lh);overflow-wrap:break-word;font-family:var(--code-font-family);white-space:break-spaces}:host .editable-container{overflow:hidden}:host ::ng-deep .highlight-container{position:absolute;width:100%;height:100%;top:0;left:0;padding:var(--code-padding-top) var(--code-padding-left) var(--code-padding-bottom);pointer-events:none}:host ::ng-deep .highlight-container span{white-space:break-spaces}:host ::ng-deep .highlight-container .variable{color:#d19a66}:host ::ng-deep .highlight-container .keyword{color:#c678dd}:host ::ng-deep .highlight-container .title{color:#61afef}:host ::ng-deep .highlight-container .number{color:#d19a66}:host ::ng-deep .highlight-container .string{color:#98c379}:host ::ng-deep .highlight-container .comment{color:#5c6370}:host ::ng-deep .highlight-container .function{color:#e06c75}:host ::ng-deep .highlight-container .operator{color:#56b6c2}:host ::ng-deep .highlight-container .punctuation{color:#abb2bf}:host ::ng-deep .highlight-container .tag{color:#e06c75}:host ::ng-deep .highlight-container .attr{color:#e06c75}:host ::ng-deep .highlight-container .attr-value{color:#98c379}:host ::ng-deep .highlight-container .attr-name{color:#e06c75}:host ::ng-deep .highlight-container .property{color:#e06c75}:host ::ng-deep .highlight-container .selector{color:#e06c75}:host ::ng-deep .highlight-container .builtin{color:#e06c75}:host ::ng-deep .highlight-container .class{color:#e06c75}:host ::ng-deep .highlight-container .constant{color:#d19a66}:host ::ng-deep .highlight-container .regex{color:#98c379}:host ::ng-deep .highlight-container .important{color:#e06c75}:host ::ng-deep .highlight-container .literal{color:#d19a66}.head-btn{cursor:pointer;display:flex;align-items:center;text-align:center;gap:4px;color:#999;border-radius:4px;padding:0 4px;height:calc(var(--code-padding-top) * .8)}.head-btn__group{-webkit-user-select:none;user-select:none;position:absolute;top:0;right:var(--code-padding-left);font-size:calc(var(--bf-fs) * .7);line-height:var(--code-padding-top);height:var(--code-padding-top);gap:8px;display:flex;align-items:center}.head-btn>span{pointer-events:none;height:var(--code-padding-top);line-height:var(--code-padding-top)}.head-btn>i{font-size:inherit;pointer-events:none}.head-btn:hover{background-color:#9999991a}\n"], dependencies: [{ kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }, { kind: "ngmodule", type: OverlayModule }, { kind: "pipe", type: AsyncPipe, name: "async" }, { kind: "pipe", type: LangNamePipe, name: "lang" }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: CodeBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.code-block', standalone: true, imports: [
                        NgForOf,
                        NgIf,
                        OverlayModule,
                        AsyncPipe,
                        LangNamePipe
                    ], changeDetection: ChangeDetectionStrategy.OnPush, template: "<div class=\"line-numbers\">\n  <span *ngFor=\"let line of lines; let i = index\">\n    {{ i + 1 }}\n  </span>\n</div>\n\n<div class=\"editable-container bf-multi-line bf-plain-text-only\" (keydown)=\"onKeydown($event)\">\n</div>\n\n<div class=\"highlight-container\">\n  <div #highlighter></div>\n</div>\n\n<div class=\"head-btn__group\">\n  <div class=\"head-btn\" (click)=\"showLangList($event)\">\n    <span>{{ props.lang | lang }}</span> <i class=\"bf_icon bf_xiajaintou\" [hidden]=\"controller.readonly$ | async\"></i>\n  </div>\n  <div class=\"head-btn\" (mousedown)=\"onCopyText($event)\"><i class=\"bf_icon bf_fuzhi\"></i> \u590D\u5236</div>\n</div>\n\n", styles: ["@charset \"UTF-8\";:host{--code-padding-left: calc(var(--bf-fs) * 2.5);--code-padding-top: calc(var(--bf-lh) * 1.5);--code-padding-bottom: 20px;padding:var(--code-padding-top) var(--code-padding-left) var(--code-padding-bottom);border:1px solid #e6e6e6;border-radius:4px;--code-font-family: \"DM Mono\", monospace;position:relative}:host.selected{border-color:var(--bf-selected-border);background-color:var(--bf-selected)}:host:focus-within .line-numbers{visibility:visible}:host .line-numbers{visibility:hidden;position:absolute;top:var(--code-padding-top);left:0;width:calc(var(--code-padding-left) * .8);height:calc(100% - var(--code-padding-top) - var(--code-padding-bottom));color:#abb2bf;font-size:calc(var(--bf-fs) * .9);pointer-events:none;-webkit-user-select:none;user-select:none;overflow:hidden}:host .line-numbers>span{display:block;width:100%;flex:1;line-height:var(--bf-lh);text-align:end;font-family:var(--code-font-family)}:host .editable-container{font-weight:100;background:transparent!important;color:transparent!important;caret-color:#000!important}:host .editable-container,:host .highlight-container{font-size:var(--bf-fs);line-height:var(--bf-lh);overflow-wrap:break-word;font-family:var(--code-font-family);white-space:break-spaces}:host .editable-container{overflow:hidden}:host ::ng-deep .highlight-container{position:absolute;width:100%;height:100%;top:0;left:0;padding:var(--code-padding-top) var(--code-padding-left) var(--code-padding-bottom);pointer-events:none}:host ::ng-deep .highlight-container span{white-space:break-spaces}:host ::ng-deep .highlight-container .variable{color:#d19a66}:host ::ng-deep .highlight-container .keyword{color:#c678dd}:host ::ng-deep .highlight-container .title{color:#61afef}:host ::ng-deep .highlight-container .number{color:#d19a66}:host ::ng-deep .highlight-container .string{color:#98c379}:host ::ng-deep .highlight-container .comment{color:#5c6370}:host ::ng-deep .highlight-container .function{color:#e06c75}:host ::ng-deep .highlight-container .operator{color:#56b6c2}:host ::ng-deep .highlight-container .punctuation{color:#abb2bf}:host ::ng-deep .highlight-container .tag{color:#e06c75}:host ::ng-deep .highlight-container .attr{color:#e06c75}:host ::ng-deep .highlight-container .attr-value{color:#98c379}:host ::ng-deep .highlight-container .attr-name{color:#e06c75}:host ::ng-deep .highlight-container .property{color:#e06c75}:host ::ng-deep .highlight-container .selector{color:#e06c75}:host ::ng-deep .highlight-container .builtin{color:#e06c75}:host ::ng-deep .highlight-container .class{color:#e06c75}:host ::ng-deep .highlight-container .constant{color:#d19a66}:host ::ng-deep .highlight-container .regex{color:#98c379}:host ::ng-deep .highlight-container .important{color:#e06c75}:host ::ng-deep .highlight-container .literal{color:#d19a66}.head-btn{cursor:pointer;display:flex;align-items:center;text-align:center;gap:4px;color:#999;border-radius:4px;padding:0 4px;height:calc(var(--code-padding-top) * .8)}.head-btn__group{-webkit-user-select:none;user-select:none;position:absolute;top:0;right:var(--code-padding-left);font-size:calc(var(--bf-fs) * .7);line-height:var(--code-padding-top);height:var(--code-padding-top);gap:8px;display:flex;align-items:center}.head-btn>span{pointer-events:none;height:var(--code-padding-top);line-height:var(--code-padding-top)}.head-btn>i{font-size:inherit;pointer-events:none}.head-btn:hover{background-color:#9999991a}\n"] }]
        }], ctorParameters: () => [{ type: i1.Overlay }], propDecorators: { highlighter: [{
                type: ViewChild,
                args: ['highlighter', { read: ElementRef, static: true }]
            }] } });

const CodeBlockSchema = {
    flavour: 'code',
    nodeType: 'editable',
    render: CodeBlock,
    icon: 'bf_icon bf_daimakuai',
    svgIcon: 'bf_daimakuai1',
    label: '代码块',
    onCreate: (deltas) => {
        return {
            props: () => ({
                lang: 'javascript',
                indent: 0
            }),
            children: deltas?.length ? [{
                    insert: deltaToString(deltas),
                }] : []
        };
    }
};

class LinkBlockFloatDialog {
    constructor() {
        this.close = new EventEmitter();
        this.update = new EventEmitter();
        this.titleError = false;
        this.urlError = false;
        this.updatedText = '';
        this.updatedHref = '';
        this.appearanceUpdated = false;
    }
    onTextUpdate(e) {
        this.updatedText = e.target.value;
        this.titleError = !this.updatedText;
    }
    onHrefUpdate(e) {
        this.updatedHref = e.target.value;
        this.urlError = !isUrl(this.updatedHref);
    }
    onClose() {
        this.close.emit();
    }
    onAppearanceUpdate(value) {
        this.appearanceUpdated = value !== this.attrs?.appearance;
    }
    onUpdate() {
        if (this.titleError)
            return this.titleInput.nativeElement.focus();
        if (this.urlError)
            return this.urlInput.nativeElement.focus();
        this.update.emit({
            text: this.updatedText || this.attrs?.text,
            href: this.updatedHref || this.attrs?.href,
            appearance: this.appearanceUpdated ? this.attrs?.appearance === 'card' ? 'text' : 'card' : this.attrs?.appearance
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LinkBlockFloatDialog, deps: [], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: LinkBlockFloatDialog, isStandalone: true, selector: "div.float-edit-dialog", inputs: { attrs: "attrs" }, outputs: { close: "close", update: "update" }, viewQueries: [{ propertyName: "titleInput", first: true, predicate: ["titleInput"], descendants: true, read: ElementRef }, { propertyName: "urlInput", first: true, predicate: ["urlInput"], descendants: true, read: ElementRef }], ngImport: i0, template: `
    <p>标题</p>
    <input type="text" placeholder="请输入标题" [value]="attrs?.text" (input)="onTextUpdate($event)"
           [class.error]="titleError" #titleInput>
    <p>地址</p>
    <input type="text" placeholder="请输入地址" [value]="attrs?.href" (input)="onHrefUpdate($event)"
           [class.error]="urlError" #urlInput>
    <p>展现</p>
    <nz-radio-group [ngModel]="attrs?.appearance" (ngModelChange)="onAppearanceUpdate($event)">
      <label nz-radio nzValue="text">链接</label>
      <label nz-radio nzValue="card">卡片</label>
    </nz-radio-group>
    <div style="width: 100%; display: flex; justify-content: flex-end; gap: 16px">
      <button nz-button (click)="onClose()">取消</button>
      <button nz-button nzType="primary" (click)="onUpdate()">确定</button>
    </div>
  `, isInline: true, styles: [":host{width:400px;display:flex;flex-direction:column;align-items:flex-start;padding:16px;gap:16px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;font-size:14px;color:#333}:host>p{margin:0;padding:0}:host>input{width:100%;margin:0;padding:8px;border-radius:4px;border:1px solid #E6E6E6}:host>input:focus{border-color:#4857e2}:host>input.error{border-color:#ff4d4f}\n"], dependencies: [{ kind: "ngmodule", type: NzButtonModule }, { kind: "component", type: i1$1.NzButtonComponent, selector: "button[nz-button], a[nz-button]", inputs: ["nzBlock", "nzGhost", "nzSearch", "nzLoading", "nzDanger", "disabled", "tabIndex", "nzType", "nzShape", "nzSize"], exportAs: ["nzButton"] }, { kind: "directive", type: i2.ɵNzTransitionPatchDirective, selector: "[nz-button], nz-button-group, [nz-icon], [nz-menu-item], [nz-submenu], nz-select-top-control, nz-select-placeholder, nz-input-group", inputs: ["hidden"] }, { kind: "directive", type: i3.NzWaveDirective, selector: "[nz-wave],button[nz-button]:not([nzType=\"link\"]):not([nzType=\"text\"])", inputs: ["nzWaveExtraNode"], exportAs: ["nzWave"] }, { kind: "ngmodule", type: NzRadioModule }, { kind: "component", type: i4.NzRadioComponent, selector: "[nz-radio],[nz-radio-button]", inputs: ["nzValue", "nzDisabled", "nzAutoFocus", "nz-radio-button"], exportAs: ["nzRadio"] }, { kind: "component", type: i4.NzRadioGroupComponent, selector: "nz-radio-group", inputs: ["nzDisabled", "nzButtonStyle", "nzSize", "nzName"], exportAs: ["nzRadioGroup"] }, { kind: "ngmodule", type: FormsModule }, { kind: "directive", type: i4$1.NgControlStatus, selector: "[formControlName],[ngModel],[formControl]" }, { kind: "directive", type: i4$1.NgModel, selector: "[ngModel]:not([formControlName]):not([formControl])", inputs: ["name", "disabled", "ngModel", "ngModelOptions"], outputs: ["ngModelChange"], exportAs: ["ngModel"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LinkBlockFloatDialog, decorators: [{
            type: Component,
            args: [{ selector: 'div.float-edit-dialog', template: `
    <p>标题</p>
    <input type="text" placeholder="请输入标题" [value]="attrs?.text" (input)="onTextUpdate($event)"
           [class.error]="titleError" #titleInput>
    <p>地址</p>
    <input type="text" placeholder="请输入地址" [value]="attrs?.href" (input)="onHrefUpdate($event)"
           [class.error]="urlError" #urlInput>
    <p>展现</p>
    <nz-radio-group [ngModel]="attrs?.appearance" (ngModelChange)="onAppearanceUpdate($event)">
      <label nz-radio nzValue="text">链接</label>
      <label nz-radio nzValue="card">卡片</label>
    </nz-radio-group>
    <div style="width: 100%; display: flex; justify-content: flex-end; gap: 16px">
      <button nz-button (click)="onClose()">取消</button>
      <button nz-button nzType="primary" (click)="onUpdate()">确定</button>
    </div>
  `, standalone: true, imports: [
                        NzButtonModule,
                        NzRadioModule,
                        FormsModule,
                    ], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{width:400px;display:flex;flex-direction:column;align-items:flex-start;padding:16px;gap:16px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;font-size:14px;color:#333}:host>p{margin:0;padding:0}:host>input{width:100%;margin:0;padding:8px;border-radius:4px;border:1px solid #E6E6E6}:host>input:focus{border-color:#4857e2}:host>input.error{border-color:#ff4d4f}\n"] }]
        }], propDecorators: { attrs: [{
                type: Input,
                args: [{ required: true }]
            }], close: [{
                type: Output
            }], update: [{
                type: Output
            }], titleInput: [{
                type: ViewChild,
                args: ['titleInput', { read: ElementRef }]
            }], urlInput: [{
                type: ViewChild,
                args: ['urlInput', { read: ElementRef }]
            }] } });

const TOOLBAR_LIST = [
    {
        id: 'open',
        icon: 'bf_icon bf_open-link',
        text: '打开',
        title: '打开链接',
        name: 'open',
        divide: true
    },
    {
        id: 'edit',
        icon: 'bf_icon bf_bianji_1',
        title: '编辑',
        name: 'edit',
    },
    // {
    //   icon: 'bf_icon bf_fuzhi',
    //   title: '复制',
    //   name: 'copy',
    // },
    {
        id: 'unlink',
        icon: 'bf_icon bf_jiebang',
        title: '解除链接',
        name: 'unlink',
    },
];
class LinkBlock extends BaseBlock {
    constructor(ovr) {
        super();
        this.ovr = ovr;
    }
    ngAfterViewInit() {
        super.ngAfterViewInit();
        // this.onSetLink()
    }
    onClick(e) {
        e.stopPropagation();
        if (this.controller.readonly$.value) {
            this.props.href && window.open(this.props.href);
            return;
        }
        const portal = new ComponentPortal(FloatToolbar);
        const ovr = this.createOverlay();
        const cpr = ovr.attach(portal);
        cpr.setInput('toolbarList', TOOLBAR_LIST);
        cpr.instance.itemClick.pipe(take(1)).subscribe(({ item, event }) => {
            switch (item.name) {
                case 'open':
                    this.props.href && window.open(this.props.href);
                    break;
                case 'edit':
                    this.onSetLink();
                    break;
                case 'unlink':
                    this.unLink();
                    break;
            }
            ovr.dispose();
        });
    }
    createOverlay() {
        const positionStrategy = this.ovr.position().flexibleConnectedTo(this.hostEl.nativeElement).withPositions([
            { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
            { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' },
        ]);
        const overlayRef = this.ovr.create({
            positionStrategy,
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-transparent-backdrop'
        });
        overlayRef.backdropClick().pipe(take(1)).subscribe(() => {
            overlayRef.dispose();
        });
        return overlayRef;
    }
    onSetLink() {
        const overlayRef = this.createOverlay();
        const portal = new ComponentPortal(LinkBlockFloatDialog);
        const cpr = overlayRef.attach(portal);
        cpr.instance.close.pipe(take(1))
            .subscribe(() => {
            overlayRef.dispose();
        });
        cpr.setInput('attrs', this.props);
        cpr.instance.update.pipe(take(1)).subscribe(v => {
            this.controller.transact(() => {
                v.text !== this.props.text && this.setProp('text', v.text);
                v.href !== this.props.href && this.setProp('href', v.href);
                v.appearance !== this.props.appearance && this.setProp('appearance', v.appearance);
            }, USER_CHANGE_SIGNAL);
            overlayRef.dispose();
            this.cdr.markForCheck();
        });
    }
    unLink() {
        const deltas = [{ insert: this.props.text }];
        const block = this.controller.createBlock('paragraph', [deltas]);
        this.controller.replaceWith(this.id, [block]).then(() => {
            this.controller.selection.setSelection(block.id, 0);
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LinkBlock, deps: [{ token: i1.Overlay }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: LinkBlock, isStandalone: true, selector: "link-block", host: { listeners: { "click": "onClick($event)" } }, usesInheritance: true, ngImport: i0, template: `
    <ng-container *ngIf="props.text else empty">
      <ng-container *ngIf="props.appearance === 'text' else card">
        <div class="text">
          <i class="bf_icon bf_lianjie"></i>
          <span>{{props.text}}</span>
        </div>
      </ng-container>

      <ng-template #card>
        <div class="card">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none">
            <path
              d="M9.5999 16.8004C11.5095 16.8004 13.3408 16.0418 14.6911 14.6916C16.0413 13.3413 16.7999 11.5099 16.7999 9.60039C16.7999 7.69083 16.0413 5.85948 14.6911 4.50922C13.3408 3.15896 11.5095 2.40039 9.5999 2.40039C7.69034 2.40039 5.859 3.15896 4.50873 4.50922C3.15847 5.85948 2.3999 7.69083 2.3999 9.60039C2.3999 11.5099 3.15847 13.3413 4.50873 14.6916C5.859 16.0418 7.69034 16.8004 9.5999 16.8004ZM29.9999 8.40039C30.3151 8.40043 30.6272 8.33838 30.9184 8.21778C31.2096 8.09719 31.4743 7.92041 31.6971 7.69755C31.92 7.47469 32.0968 7.2101 32.2175 6.9189C32.3381 6.6277 32.4002 6.31559 32.4002 6.00039C32.4002 5.68519 32.3381 5.37308 32.2175 5.08188C32.0968 4.79068 31.92 4.5261 31.6971 4.30323C31.4743 4.08037 31.2096 3.90359 30.9184 3.783C30.6272 3.6624 30.3151 3.60035 29.9999 3.60039C29.3634 3.60047 28.7531 3.85336 28.303 4.30344C27.853 4.75352 27.6002 5.36392 27.6002 6.00039C27.6002 6.63686 27.853 7.24726 28.303 7.69734C28.7531 8.14742 29.3634 8.40031 29.9999 8.40039Z"
              fill="url(#paint0_linear_4241_86575)"/>
            <path
              d="M7.7112 12.131C8.94702 10.5906 10.5133 9.34769 12.2942 8.4942C14.0751 7.64072 16.0251 7.19848 18 7.2002C19.9749 7.19848 21.9249 7.64072 23.7058 8.4942C25.4867 9.34769 27.053 10.5906 28.2888 12.131C29.0064 12.3386 29.6844 12.5678 30.318 12.8162C31.92 13.4462 33.2988 14.225 34.296 15.1514C35.2956 16.0802 36 17.2442 36 18.6002C36 19.9562 35.2956 21.1202 34.296 22.049C33.2988 22.9754 31.92 23.7542 30.318 24.3842C27.1056 25.6442 22.752 26.4002 18 26.4002C13.2492 26.4002 8.8944 25.6454 5.682 24.3842C4.08 23.7542 2.7012 22.9754 1.704 22.049C0.7044 21.1202 0 19.9562 0 18.6002C0 17.2442 0.7044 16.0802 1.704 15.1514C2.7012 14.225 4.08 13.4462 5.682 12.8162C6.3471 12.5567 7.02382 12.3281 7.71 12.131H7.7112ZM5.7912 15.3746C4.7304 15.8558 3.9072 16.3802 3.3372 16.9106C2.6364 17.561 2.4 18.1346 2.4 18.6002C2.4 19.067 2.6364 19.6394 3.336 20.2898C3.79183 20.6993 4.29453 21.0533 4.8336 21.3446C4.68514 19.3072 5.013 17.2633 5.7912 15.3746ZM31.1664 21.3446C31.7051 21.0532 32.2073 20.6992 32.6628 20.2898C33.3636 19.6394 33.6 19.0658 33.6 18.6002C33.6 18.1334 33.3636 17.561 32.664 16.9106C32.0916 16.3802 31.2696 15.8558 30.21 15.3746C30.9878 17.2634 31.3152 19.3073 31.1664 21.3446ZM18 33.6002C15.6252 33.601 13.2942 32.961 11.2528 31.7476C9.21131 30.5343 7.53508 28.7926 6.4008 26.7062C9.708 28.0358 13.7124 28.8002 18 28.8002C22.2876 28.8002 26.292 28.0358 29.5992 26.7062C28.4649 28.7926 26.7887 30.5343 24.7472 31.7476C22.7058 32.961 20.3748 33.601 18 33.6002Z"
              fill="url(#paint1_linear_4241_86575)"/>
            <path
              d="M5.87988 25.6377C6.90281 28.0027 8.59539 30.0167 10.749 31.4315C12.9026 32.8463 15.4231 33.6 17.9999 33.5997C23.4287 33.5997 28.0919 30.3225 30.1199 25.6377C26.6639 26.8761 22.4915 27.5997 17.9999 27.5997C13.5071 27.5997 9.33588 26.8761 5.87988 25.6377Z"
              fill="url(#paint2_linear_4241_86575)"/>
            <path
              d="M22.8 15.5998C23.1152 15.5998 23.4274 15.5378 23.7186 15.4172C24.0098 15.2966 24.2744 15.1198 24.4973 14.897C24.7202 14.6741 24.897 14.4095 25.0176 14.1183C25.1383 13.8271 25.2003 13.515 25.2003 13.1998C25.2003 12.8846 25.1383 12.5725 25.0176 12.2813C24.897 11.9901 24.7202 11.7255 24.4973 11.5026C24.2744 11.2798 24.0098 11.103 23.7186 10.9824C23.4274 10.8618 23.1152 10.7998 22.8 10.7998C22.1636 10.7999 21.5532 11.0528 21.1032 11.5029C20.6532 11.9529 20.4003 12.5633 20.4003 13.1998C20.4003 13.8363 20.6532 14.4467 21.1032 14.8968C21.5532 15.3468 22.1636 15.5997 22.8 15.5998ZM14.4 22.7998C15.3548 22.7998 16.2705 22.4205 16.9456 21.7454C17.6208 21.0703 18 20.1546 18 19.1998C18 18.245 17.6208 17.3294 16.9456 16.6542C16.2705 15.9791 15.3548 15.5998 14.4 15.5998C13.4453 15.5998 12.5296 15.9791 11.8545 16.6542C11.1793 17.3294 10.8 18.245 10.8 19.1998C10.8 20.1546 11.1793 21.0703 11.8545 21.7454C12.5296 22.4205 13.4453 22.7998 14.4 22.7998Z"
              fill="white"/>
            <defs>
              <linearGradient id="paint0_linear_4241_86575" x1="17.4" y1="2.40039" x2="17.4" y2="16.8004"
                              gradientUnits="userSpaceOnUse">
                <stop stop-color="#BDCCFF"/>
                <stop offset="0.945" stop-color="#79BFFF"/>
              </linearGradient>
              <linearGradient id="paint1_linear_4241_86575" x1="18" y1="7.2002" x2="18" y2="33.6002"
                              gradientUnits="userSpaceOnUse">
                <stop stop-color="#BDCCFF"/>
                <stop offset="0.945" stop-color="#79BFFF"/>
              </linearGradient>
              <linearGradient id="paint2_linear_4241_86575" x1="17.9999" y1="25.6377" x2="17.9999" y2="33.5997"
                              gradientUnits="userSpaceOnUse">
                <stop stop-color="#BDCCFF"/>
                <stop offset="0.945" stop-color="#79BFFF"/>
              </linearGradient>
            </defs>
          </svg>
          <div class="info">
            <p>{{props.text}}</p>
            <p>{{props.href}}</p>
          </div>
        </div>
      </ng-template>
    </ng-container>

    <ng-template #empty>
      <div class="empty">插入链接</div>
    </ng-template>
  `, isInline: true, styles: [":host{display:block;cursor:pointer;font-size:16px}:host.selected{background-color:var(--bf-selected)}:host .text{display:flex;align-items:flex-start;gap:4px;height:36px;color:#4857e2}:host .text>span{word-break:break-word}:host .text:hover{text-decoration:underline}:host .card{position:relative;padding:10px 8px 10px 50px;border-radius:8px;background:#eaf3fe}:host .card>svg{position:absolute;left:8px;top:50%;transform:translateY(-50%)}:host .card .info>p{margin:0;color:#999;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}:host .card .info>p:first-child{margin-bottom:4px;color:#333;font-weight:700}:host .empty{flex:1;padding:0 8px;line-height:36px;color:#999;height:36px;border-radius:4px;border:1px solid #4857E2}\n"], dependencies: [{ kind: "directive", type: NgIf, selector: "[ngIf]", inputs: ["ngIf", "ngIfThen", "ngIfElse"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LinkBlock, decorators: [{
            type: Component,
            args: [{ selector: 'link-block', template: `
    <ng-container *ngIf="props.text else empty">
      <ng-container *ngIf="props.appearance === 'text' else card">
        <div class="text">
          <i class="bf_icon bf_lianjie"></i>
          <span>{{props.text}}</span>
        </div>
      </ng-container>

      <ng-template #card>
        <div class="card">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none">
            <path
              d="M9.5999 16.8004C11.5095 16.8004 13.3408 16.0418 14.6911 14.6916C16.0413 13.3413 16.7999 11.5099 16.7999 9.60039C16.7999 7.69083 16.0413 5.85948 14.6911 4.50922C13.3408 3.15896 11.5095 2.40039 9.5999 2.40039C7.69034 2.40039 5.859 3.15896 4.50873 4.50922C3.15847 5.85948 2.3999 7.69083 2.3999 9.60039C2.3999 11.5099 3.15847 13.3413 4.50873 14.6916C5.859 16.0418 7.69034 16.8004 9.5999 16.8004ZM29.9999 8.40039C30.3151 8.40043 30.6272 8.33838 30.9184 8.21778C31.2096 8.09719 31.4743 7.92041 31.6971 7.69755C31.92 7.47469 32.0968 7.2101 32.2175 6.9189C32.3381 6.6277 32.4002 6.31559 32.4002 6.00039C32.4002 5.68519 32.3381 5.37308 32.2175 5.08188C32.0968 4.79068 31.92 4.5261 31.6971 4.30323C31.4743 4.08037 31.2096 3.90359 30.9184 3.783C30.6272 3.6624 30.3151 3.60035 29.9999 3.60039C29.3634 3.60047 28.7531 3.85336 28.303 4.30344C27.853 4.75352 27.6002 5.36392 27.6002 6.00039C27.6002 6.63686 27.853 7.24726 28.303 7.69734C28.7531 8.14742 29.3634 8.40031 29.9999 8.40039Z"
              fill="url(#paint0_linear_4241_86575)"/>
            <path
              d="M7.7112 12.131C8.94702 10.5906 10.5133 9.34769 12.2942 8.4942C14.0751 7.64072 16.0251 7.19848 18 7.2002C19.9749 7.19848 21.9249 7.64072 23.7058 8.4942C25.4867 9.34769 27.053 10.5906 28.2888 12.131C29.0064 12.3386 29.6844 12.5678 30.318 12.8162C31.92 13.4462 33.2988 14.225 34.296 15.1514C35.2956 16.0802 36 17.2442 36 18.6002C36 19.9562 35.2956 21.1202 34.296 22.049C33.2988 22.9754 31.92 23.7542 30.318 24.3842C27.1056 25.6442 22.752 26.4002 18 26.4002C13.2492 26.4002 8.8944 25.6454 5.682 24.3842C4.08 23.7542 2.7012 22.9754 1.704 22.049C0.7044 21.1202 0 19.9562 0 18.6002C0 17.2442 0.7044 16.0802 1.704 15.1514C2.7012 14.225 4.08 13.4462 5.682 12.8162C6.3471 12.5567 7.02382 12.3281 7.71 12.131H7.7112ZM5.7912 15.3746C4.7304 15.8558 3.9072 16.3802 3.3372 16.9106C2.6364 17.561 2.4 18.1346 2.4 18.6002C2.4 19.067 2.6364 19.6394 3.336 20.2898C3.79183 20.6993 4.29453 21.0533 4.8336 21.3446C4.68514 19.3072 5.013 17.2633 5.7912 15.3746ZM31.1664 21.3446C31.7051 21.0532 32.2073 20.6992 32.6628 20.2898C33.3636 19.6394 33.6 19.0658 33.6 18.6002C33.6 18.1334 33.3636 17.561 32.664 16.9106C32.0916 16.3802 31.2696 15.8558 30.21 15.3746C30.9878 17.2634 31.3152 19.3073 31.1664 21.3446ZM18 33.6002C15.6252 33.601 13.2942 32.961 11.2528 31.7476C9.21131 30.5343 7.53508 28.7926 6.4008 26.7062C9.708 28.0358 13.7124 28.8002 18 28.8002C22.2876 28.8002 26.292 28.0358 29.5992 26.7062C28.4649 28.7926 26.7887 30.5343 24.7472 31.7476C22.7058 32.961 20.3748 33.601 18 33.6002Z"
              fill="url(#paint1_linear_4241_86575)"/>
            <path
              d="M5.87988 25.6377C6.90281 28.0027 8.59539 30.0167 10.749 31.4315C12.9026 32.8463 15.4231 33.6 17.9999 33.5997C23.4287 33.5997 28.0919 30.3225 30.1199 25.6377C26.6639 26.8761 22.4915 27.5997 17.9999 27.5997C13.5071 27.5997 9.33588 26.8761 5.87988 25.6377Z"
              fill="url(#paint2_linear_4241_86575)"/>
            <path
              d="M22.8 15.5998C23.1152 15.5998 23.4274 15.5378 23.7186 15.4172C24.0098 15.2966 24.2744 15.1198 24.4973 14.897C24.7202 14.6741 24.897 14.4095 25.0176 14.1183C25.1383 13.8271 25.2003 13.515 25.2003 13.1998C25.2003 12.8846 25.1383 12.5725 25.0176 12.2813C24.897 11.9901 24.7202 11.7255 24.4973 11.5026C24.2744 11.2798 24.0098 11.103 23.7186 10.9824C23.4274 10.8618 23.1152 10.7998 22.8 10.7998C22.1636 10.7999 21.5532 11.0528 21.1032 11.5029C20.6532 11.9529 20.4003 12.5633 20.4003 13.1998C20.4003 13.8363 20.6532 14.4467 21.1032 14.8968C21.5532 15.3468 22.1636 15.5997 22.8 15.5998ZM14.4 22.7998C15.3548 22.7998 16.2705 22.4205 16.9456 21.7454C17.6208 21.0703 18 20.1546 18 19.1998C18 18.245 17.6208 17.3294 16.9456 16.6542C16.2705 15.9791 15.3548 15.5998 14.4 15.5998C13.4453 15.5998 12.5296 15.9791 11.8545 16.6542C11.1793 17.3294 10.8 18.245 10.8 19.1998C10.8 20.1546 11.1793 21.0703 11.8545 21.7454C12.5296 22.4205 13.4453 22.7998 14.4 22.7998Z"
              fill="white"/>
            <defs>
              <linearGradient id="paint0_linear_4241_86575" x1="17.4" y1="2.40039" x2="17.4" y2="16.8004"
                              gradientUnits="userSpaceOnUse">
                <stop stop-color="#BDCCFF"/>
                <stop offset="0.945" stop-color="#79BFFF"/>
              </linearGradient>
              <linearGradient id="paint1_linear_4241_86575" x1="18" y1="7.2002" x2="18" y2="33.6002"
                              gradientUnits="userSpaceOnUse">
                <stop stop-color="#BDCCFF"/>
                <stop offset="0.945" stop-color="#79BFFF"/>
              </linearGradient>
              <linearGradient id="paint2_linear_4241_86575" x1="17.9999" y1="25.6377" x2="17.9999" y2="33.5997"
                              gradientUnits="userSpaceOnUse">
                <stop stop-color="#BDCCFF"/>
                <stop offset="0.945" stop-color="#79BFFF"/>
              </linearGradient>
            </defs>
          </svg>
          <div class="info">
            <p>{{props.text}}</p>
            <p>{{props.href}}</p>
          </div>
        </div>
      </ng-template>
    </ng-container>

    <ng-template #empty>
      <div class="empty">插入链接</div>
    </ng-template>
  `, standalone: true, imports: [
                        NgIf
                    ], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{display:block;cursor:pointer;font-size:16px}:host.selected{background-color:var(--bf-selected)}:host .text{display:flex;align-items:flex-start;gap:4px;height:36px;color:#4857e2}:host .text>span{word-break:break-word}:host .text:hover{text-decoration:underline}:host .card{position:relative;padding:10px 8px 10px 50px;border-radius:8px;background:#eaf3fe}:host .card>svg{position:absolute;left:8px;top:50%;transform:translateY(-50%)}:host .card .info>p{margin:0;color:#999;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}:host .card .info>p:first-child{margin-bottom:4px;color:#333;font-weight:700}:host .empty{flex:1;padding:0 8px;line-height:36px;color:#999;height:36px;border-radius:4px;border:1px solid #4857E2}\n"] }]
        }], ctorParameters: () => [{ type: i1.Overlay }], propDecorators: { onClick: [{
                type: HostListener,
                args: ['click', ['$event']]
            }] } });

const LinkSchema = {
    flavour: 'link',
    nodeType: 'void',
    label: '链接',
    render: LinkBlock,
    icon: 'bf_icon bf_lianjie',
    svgIcon: 'bf_lianjie-color',
    onCreate: () => {
        return {
            props: () => ({
                href: '',
                text: '',
                appearance: 'text'
            }),
            children: []
        };
    }
};

const TEMPLATE_LIST = [
    {
        name: '时序图',
        prefix: 'sequenceDiagram\n',
        template: '    Alice->>John: Hello John, how are you?\n' +
            '    John-->>Alice: Great!\n' +
            '    Alice-)John: See you later!\n'
    },
    {
        name: '流程图',
        prefix: 'flowchart LR\n',
        template: '    A[Start] --> B{Is it?}\n' +
            '    B -- Yes --> C[OK]\n' +
            '    C --> D[Rethink]\n' +
            '    D --> B\n' +
            '    B -- No ----> E[End]'
    },
    {
        name: '类图',
        prefix: 'classDiagram\n',
        template: '    class BankAccount\n' +
            '    BankAccount : +String owner\n' +
            '    BankAccount : +Bigdecimal balance\n' +
            '    BankAccount : +deposit(amount)\n' +
            '    BankAccount : +withdrawal(amount)'
    },
    {
        name: '思维导图',
        prefix: 'mindmap\n',
        template: '    Root\n' +
            '        A[A]\n' +
            '        :::urgent large\n' +
            '        B(B)\n' +
            '        C'
    },
    {
        name: '时间线图',
        prefix: 'timeline\n',
        template: '    title History of Social Media Platform\n' +
            '    2002 : LinkedIn\n' +
            '    2004 : Facebook\n' +
            '         : Google\n' +
            '    2005 : Youtube\n' +
            '    2006 : Twitter'
    }
];

mermaid.initialize({ startOnLoad: false });
class MermaidBlock extends EditableBlock {
    constructor(overlay, vcr) {
        super();
        this.overlay = overlay;
        this.vcr = vcr;
        this.templateList = TEMPLATE_LIST;
        this._viewMode = 'text';
        this.isIntersecting = false;
        this.renderGraph = async () => {
            // console.time('renderGraph')
            if (!this.textLength)
                return;
            const graphDefinition = this.getTextContent();
            const verify = await mermaid.parse(graphDefinition, { suppressErrors: true });
            if (verify) {
                const { svg } = await mermaid.render(this.id.replace(/\d/g, '') + 'graphDiv', graphDefinition);
                this.graph.nativeElement.innerHTML = svg;
            }
            else {
                this.graph.nativeElement.innerHTML = `<span style="color: red;">语法错误！</span>`;
            }
            // console.timeEnd('renderGraph')
        };
        this.dialogFlag = 'template';
    }
    ngAfterViewInit() {
        super.ngAfterViewInit();
        this.setView(this.props.view);
        this.intersectionObserver = new IntersectionObserver(([entry]) => {
            this.isIntersecting = entry.isIntersecting;
            if (this.isIntersecting && this._viewMode !== this.props.view) {
                this.setView(this.props.view);
            }
        }, {
            threshold: [0, 1]
        });
        this.intersectionObserver.observe(this.hostEl.nativeElement);
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
            if (v.type === 'props' && this._viewMode !== this.props.view) {
                this.setView(this.props.view);
            }
        });
    }
    onSwitchView() {
        this.setProp('view', this._viewMode === 'graph' ? 'text' : 'graph');
    }
    setView(view) {
        if (this._viewMode === view || !this.isIntersecting)
            return;
        // console.log('切换视图', view)
        this.hostEl.nativeElement.setAttribute('data-view-mode', this._viewMode = view);
        if (view === 'graph') {
            this.renderGraph();
        }
        else {
            this.graph.nativeElement.innerHTML = '';
        }
    }
    onShowTemplateList(e, flag) {
        const target = e.target;
        const portal = new TemplatePortal(this.templateListTpl, this.vcr);
        const positionStrategy = this.overlay.position().flexibleConnectedTo(target).withPositions([
            { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' }
        ]);
        this.modalRef = this.overlay.create({
            positionStrategy,
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-transparent-backdrop',
        });
        this.modalRef.backdropClick().pipe(take(1)).subscribe(() => {
            this.modalRef?.dispose();
        });
        this.modalRef.attach(portal);
        this.dialogFlag = flag;
    }
    useTemplate(item) {
        if (this.dialogFlag === 'template') {
            const deltas = [{ insert: item.prefix + item.template }];
            if (this.textLength) {
                deltas.unshift({ delete: this.textLength });
            }
            this.applyDelta(deltas);
        }
        else {
            this.applyDelta([
                { insert: item.prefix }
            ]);
        }
        this.modalRef?.dispose();
    }
    ngOnDestroy() {
        super.ngOnDestroy();
        this.intersectionObserver.disconnect();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: MermaidBlock, deps: [{ token: i1.Overlay }, { token: i0.ViewContainerRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: MermaidBlock, isStandalone: true, selector: "div.mermaid", viewQueries: [{ propertyName: "graph", first: true, predicate: ["graph"], descendants: true, read: ElementRef }, { propertyName: "templateListTpl", first: true, predicate: ["templateListTpl"], descendants: true, read: TemplateRef }], usesInheritance: true, ngImport: i0, template: "<div class=\"head\">\n  <div class=\"btn\" style=\"color: #999;\">Mermaid</div>\n  <div class=\"template-btn btn\" (click)=\"onShowTemplateList($event, 'prefix')\">\u7C7B\u578B <i class=\"bf_icon bf_xiajaintou\" style=\"font-size: .8em\"></i></div>\n\n  <div class=\"template-btn btn\" (click)=\"onShowTemplateList($event, 'template')\">\u6A21\u677F <i class=\"bf_icon bf_xiajaintou\"></i></div>\n  <div class=\"switch-btn btn\" (click)=\"onSwitchView()\"><i class=\"bf_icon bf_qiehuan\"></i></div>\n</div>\n\n<div class=\"container\">\n  <div class=\"editable-container bf-multi-line bf-plain-text-only\"></div>\n  <div class=\"graph-con\" #graph></div>\n</div>\n\n<ng-template #templateListTpl>\n  <div class=\"template-list\">\n    <div class=\"template-list_item\" *ngFor=\"let item of templateList\"\n      (click)=\"useTemplate(item)\">\n      {{item.name}}\n    </div>\n  </div>\n</ng-template>\n", styles: [":host{display:block;border-radius:4px;overflow:hidden;border:1px solid #e6e6e6}:host.selected{border-color:var(--bf-selected-border);background-color:var(--bf-selected)}:host[data-view-mode=text] .graph-con{visibility:hidden;height:0;overflow:hidden}:host[data-view-mode=graph] .editable-container{visibility:hidden;height:0;overflow:hidden;min-height:0}:host .head{background-color:var(--bf-bg);display:flex;align-items:center;position:relative;padding:8px 20px;border-bottom:1px solid #e6e6e6}:host .head .btn{padding:4px 8px;cursor:pointer;border-radius:4px;display:flex;align-items:center;gap:4px;font-size:small}:host .head .btn:hover{background-color:#9999991a}:host .head .btn>*{pointer-events:none}:host .head .switch-btn{position:absolute;top:50%;right:var(--bf-lh);transform:translateY(-50%)}:host .container{padding:20px;font-family:DM Mono,monospace;color:var(--bf-c)}:host .graph-con{overflow-x:auto}::ng-deep .template-list{background-color:#fff;border:1px solid #f5f2f0;border-radius:4px;padding:4px}::ng-deep .template-list_item{padding:0 4px;height:calc(var(--bf-lh) * 1.5);line-height:calc(var(--bf-lh) * 1.5);text-align:center;font-size:calc(var(--bf-fs) * .8);color:#999;cursor:pointer;border-radius:4px}::ng-deep .template-list_item:hover{background-color:#9999991a}\n"], dependencies: [{ kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: MermaidBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.mermaid', standalone: true, imports: [
                        NgForOf
                    ], changeDetection: ChangeDetectionStrategy.OnPush, template: "<div class=\"head\">\n  <div class=\"btn\" style=\"color: #999;\">Mermaid</div>\n  <div class=\"template-btn btn\" (click)=\"onShowTemplateList($event, 'prefix')\">\u7C7B\u578B <i class=\"bf_icon bf_xiajaintou\" style=\"font-size: .8em\"></i></div>\n\n  <div class=\"template-btn btn\" (click)=\"onShowTemplateList($event, 'template')\">\u6A21\u677F <i class=\"bf_icon bf_xiajaintou\"></i></div>\n  <div class=\"switch-btn btn\" (click)=\"onSwitchView()\"><i class=\"bf_icon bf_qiehuan\"></i></div>\n</div>\n\n<div class=\"container\">\n  <div class=\"editable-container bf-multi-line bf-plain-text-only\"></div>\n  <div class=\"graph-con\" #graph></div>\n</div>\n\n<ng-template #templateListTpl>\n  <div class=\"template-list\">\n    <div class=\"template-list_item\" *ngFor=\"let item of templateList\"\n      (click)=\"useTemplate(item)\">\n      {{item.name}}\n    </div>\n  </div>\n</ng-template>\n", styles: [":host{display:block;border-radius:4px;overflow:hidden;border:1px solid #e6e6e6}:host.selected{border-color:var(--bf-selected-border);background-color:var(--bf-selected)}:host[data-view-mode=text] .graph-con{visibility:hidden;height:0;overflow:hidden}:host[data-view-mode=graph] .editable-container{visibility:hidden;height:0;overflow:hidden;min-height:0}:host .head{background-color:var(--bf-bg);display:flex;align-items:center;position:relative;padding:8px 20px;border-bottom:1px solid #e6e6e6}:host .head .btn{padding:4px 8px;cursor:pointer;border-radius:4px;display:flex;align-items:center;gap:4px;font-size:small}:host .head .btn:hover{background-color:#9999991a}:host .head .btn>*{pointer-events:none}:host .head .switch-btn{position:absolute;top:50%;right:var(--bf-lh);transform:translateY(-50%)}:host .container{padding:20px;font-family:DM Mono,monospace;color:var(--bf-c)}:host .graph-con{overflow-x:auto}::ng-deep .template-list{background-color:#fff;border:1px solid #f5f2f0;border-radius:4px;padding:4px}::ng-deep .template-list_item{padding:0 4px;height:calc(var(--bf-lh) * 1.5);line-height:calc(var(--bf-lh) * 1.5);text-align:center;font-size:calc(var(--bf-fs) * .8);color:#999;cursor:pointer;border-radius:4px}::ng-deep .template-list_item:hover{background-color:#9999991a}\n"] }]
        }], ctorParameters: () => [{ type: i1.Overlay }, { type: i0.ViewContainerRef }], propDecorators: { graph: [{
                type: ViewChild,
                args: ['graph', { read: ElementRef }]
            }], templateListTpl: [{
                type: ViewChild,
                args: ['templateListTpl', { read: TemplateRef }]
            }] } });

const MermaidBlockSchema = {
    flavour: 'mermaid',
    nodeType: 'editable',
    render: MermaidBlock,
    icon: 'bf_icon bf_daimahuitu',
    svgIcon: 'bf_daimahuitu',
    label: '代码绘图',
    onCreate: (deltas) => {
        return {
            props: () => ({
                view: 'text',
                indent: 0
            }),
            children: deltas?.length ? [{
                    insert: deltaToString(deltas),
                }] : []
        };
    }
};

class TableCellBlock extends EditableBlock {
    constructor() {
        super(...arguments);
        this.colIdx = 0;
        this.rowIdx = 0;
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TableCellBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: TableCellBlock, isStandalone: true, selector: "td.table-cell", inputs: { colIdx: "colIdx", rowIdx: "rowIdx" }, host: { properties: { "class.bf-multi-line": "true", "class.editable-container": "true", "attr.data-col-idx": "colIdx", "attr.data-row-idx": "rowIdx" } }, usesInheritance: true, ngImport: i0, template: ``, isInline: true, styles: [""], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TableCellBlock, decorators: [{
            type: Component,
            args: [{ selector: 'td.table-cell', template: ``, standalone: true, host: {
                        '[class.bf-multi-line]': 'true',
                        '[class.editable-container]': 'true',
                        '[attr.data-col-idx]': 'colIdx',
                        '[attr.data-row-idx]': 'rowIdx'
                    }, changeDetection: ChangeDetectionStrategy.OnPush }]
        }], propDecorators: { colIdx: [{
                type: Input
            }], rowIdx: [{
                type: Input
            }] } });

class TableRowBlock extends BaseBlock {
    constructor() {
        super(...arguments);
        this._height = 0;
        this.rowIdx = 0;
        this.heightChange = new EventEmitter();
        this.trackById = (index, item) => item.id;
    }
    ngAfterViewInit() {
        super.ngAfterViewInit();
        fromEventPattern(handler => {
            this._resizeObserver = new ResizeObserver(handler);
            this._resizeObserver.observe(this.hostEl.nativeElement);
        }, () => {
            this._resizeObserver.disconnect();
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
            if (e[0][0].contentRect.height === this._height)
                return;
            this._height = e[0][0].contentRect.height;
            this.heightChange.emit(this._height);
            // console.log('height change', this._height)
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TableRowBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: TableRowBlock, isStandalone: true, selector: "tr.table-row", inputs: { rowIdx: "rowIdx" }, outputs: { heightChange: "heightChange" }, host: { properties: { "attr.data-row-idx": "rowIdx" } }, usesInheritance: true, ngImport: i0, template: `
    <td class="table-cell" *ngFor="let cell of model.children; index as colIdx; trackBy: trackById" [colIdx]="colIdx"
        [rowIdx]="rowIdx" [controller]="controller" [model]="cell"></td>
  `, isInline: true, styles: [""], dependencies: [{ kind: "component", type: TableCellBlock, selector: "td.table-cell", inputs: ["colIdx", "rowIdx"] }, { kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }] }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TableRowBlock, decorators: [{
            type: Component,
            args: [{ selector: 'tr.table-row', template: `
    <td class="table-cell" *ngFor="let cell of model.children; index as colIdx; trackBy: trackById" [colIdx]="colIdx"
        [rowIdx]="rowIdx" [controller]="controller" [model]="cell"></td>
  `, standalone: true, imports: [
                        TableCellBlock,
                        NgForOf
                    ], host: {
                        '[attr.data-row-idx]': 'rowIdx'
                    } }]
        }], propDecorators: { rowIdx: [{
                type: Input
            }], heightChange: [{
                type: Output
            }] } });

const ALIGN_MENUS = [
    {
        id: 'align-left',
        name: "align",
        title: "左对齐",
        value: "left",
        icon: "bf_icon bf_zuoduiqi"
    },
    {
        id: 'align-center',
        name: "align",
        title: "居中对齐",
        value: "center",
        icon: "bf_icon bf_juzhongduiqi"
    },
    {
        id: 'align-right',
        name: "align",
        title: "右对齐",
        value: "right",
        icon: "bf_icon bf_youduiqi",
        divide: true
    },
];
const SET_ROW_HEADER = {
    id: 'setHeadRow',
    name: "setHeadRow",
    title: "设置为标题行",
    value: "row",
    icon: "bf_icon bf_biaotihang",
    divide: true
};
const SET_COL_HEADER = {
    id: 'setHeadCol',
    name: "setHeadCol",
    title: "设置为标题列",
    value: "col",
    icon: "bf_icon bf_biaotilie",
    divide: true
};
const TableRolControlMenu = [
    ...ALIGN_MENUS,
    {
        id: 'insert-top',
        name: "insert",
        title: "向上插入一行",
        value: "top",
        icon: "bf_icon bf_shangjiantou-jia"
    },
    {
        id: 'insert-bottom',
        name: "insert",
        title: "向下插入一行",
        value: "bottom",
        icon: "bf_icon bf_xiajiantou-jia",
        divide: true
    },
    {
        id: 'delete',
        name: 'delete',
        title: '删除当前行',
        value: 'delete',
        icon: 'bf_icon bf_shanchu-2'
    }
];
const TableColControlMenu = [
    ...ALIGN_MENUS,
    {
        id: 'insert-left',
        name: "insert",
        title: "向左插入一列",
        value: "left",
        icon: "bf_icon bf_zuojiantou-jia"
    },
    {
        id: 'insert-right',
        name: "insert",
        title: "向右插入一列",
        value: "right",
        icon: "bf_icon bf_youjiantou-jia",
        divide: true
    },
    // {
    //   name: "复制当前列",
    //   value: "copy",
    //   icon: "editor-xuqiuwendang_fuzhi"
    // },
    // {
    //   name: "清除内容",
    //   value: "clear",
    //   icon: "editor-delete_02"
    // },
    {
        id: 'delete',
        name: 'delete',
        title: '删除当前列',
        value: 'delete',
        icon: 'bf_icon bf_shanchu-2'
    }
];

class TableBlock extends BaseBlock {
    constructor(overlay) {
        super();
        this.overlay = overlay;
        this.activeColIdx = -1;
        this.activeRowIdx = -1;
        this._rowHeights = [];
        this.hoverCell = [-1, -1];
        this._colWidths = [];
        this.resizing$ = new BehaviorSubject(false);
        this.resizeColIdx = -1;
        this.resizeBarX = 0;
        this.selecting$ = new BehaviorSubject(false);
        this.trackById = (index, item) => item.id;
        this.trackByValue = (index, w) => w;
        this.getCellPos = (td) => {
            if (!td || td.tagName !== 'TD')
                return null;
            const colIdx = td.getAttribute('data-col-idx');
            const rowIdx = td.getAttribute('data-row-idx');
            return [parseInt(rowIdx), parseInt(colIdx)];
        };
    }
    ngAfterViewInit() {
        super.ngAfterViewInit();
        this._colWidths = [...this.model.props.colWidths];
        this.selecting$.pipe(takeUntilDestroyed(this.destroyRef), filter(e => e)).subscribe((selecting) => {
            window.getSelection().removeAllRanges();
            this.table.nativeElement.focus({ preventScroll: true });
        });
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
            if (e.type === 'props') {
                if (e.event.changes.keys.get('colWidths')) {
                    this._colWidths = [...this.model.props.colWidths];
                }
            }
        });
    }
    ngOnDestroy() {
        super.ngOnDestroy();
        this.overlayRef?.dispose();
    }
    onKeyDown(e) {
        if (e.code === 'KeyC' && (e.ctrlKey || e.metaKey)) {
            this.copyCells(e);
            return;
        }
        if (this.controller.readonly$.value)
            return;
        switch (e.key) {
            case 'Enter':
                e.preventDefault();
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                {
                    e.stopPropagation();
                    if (this.selectingCell) {
                        e.preventDefault();
                        this.focusCell(this.selectingCell[0][0], this.selectingCell[0][1], 'start');
                        return;
                    }
                    const cell = e.target;
                    if (isCursorAtElStart(cell)) {
                        e.preventDefault();
                        this.moveSelection(e.target, e.key === 'ArrowLeft' ? 'left' : 'up');
                    }
                }
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                {
                    e.stopPropagation();
                    if (this.selectingCell) {
                        e.preventDefault();
                        this.focusCell(this.selectingCell[1][0], this.selectingCell[1][1], 'end');
                        return;
                    }
                    const target = e.target;
                    if (isCursorAtElEnd(target)) {
                        e.preventDefault();
                        this.moveSelection(target, e.key === 'ArrowRight' ? 'right' : 'down');
                    }
                }
                break;
            case 'Backspace':
                if (this.selectingCell) {
                    e.stopPropagation();
                    e.preventDefault();
                    this.clearSelectingCellText();
                }
                else {
                    const cell = e.target;
                    if (isCursorAtElStart(cell)) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }
                break;
        }
    }
    copyCells(e) {
        if (!this.selectingCell)
            return;
        e.stopPropagation();
        e.preventDefault();
        const json = this.model.toJSON();
        // 裁截选中的单元格
        const [start, end] = this.selectingCell;
        json.children = json.children.slice(start[0], end[0] + 1);
        json.children.forEach(row => {
            row.children = row.children.slice(start[1], end[1] + 1);
        });
        json.props = {
            colHead: false,
            rowHead: false,
            colWidths: this._colWidths.slice(start[1], end[1] + 1)
        };
        this.controller.clipboard.writeData([{
                type: 'block',
                data: [json]
            }]);
    }
    /** 表格行列操作 **/
    onShowColBar(e) {
        e.stopPropagation();
        const target = e.target;
        const dataColIdx = target.getAttribute('data-col-idx');
        if (!dataColIdx)
            return;
        const colIdx = parseInt(dataColIdx);
        this.activeColIdx = colIdx;
        const portal = new ComponentPortal(FloatToolbar);
        this.overlayRef = this.overlay.create({
            positionStrategy: this.overlay.position().flexibleConnectedTo(target).withPositions([
                { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -4 },
                { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 4 },
            ]),
            scrollStrategy: this.overlay.scrollStrategies.close(),
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-transparent-backdrop',
        });
        const close = () => {
            this.overlayRef?.dispose();
            this.activeColIdx = -1;
        };
        this.overlayRef.backdropClick().pipe(take(1)).subscribe(close);
        const cpr = this.overlayRef.attach(portal);
        const menu = [...TableColControlMenu];
        if (colIdx === 0)
            menu.unshift(SET_COL_HEADER);
        const colFirAlign = this.children[0].children[colIdx].props['textAlign'];
        const commonAlign = this.children.every(row => row.children[colIdx].props['textAlign'] === colFirAlign);
        if (commonAlign) {
            cpr.instance.addActive('align-' + colFirAlign);
        }
        if (this.props.colHead) {
            cpr.instance.addActive('setHeadCol');
        }
        cpr.setInput('toolbarList', menu);
        cpr.instance.itemClick.pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe(({ item, event }) => {
            switch (item.name) {
                case 'align':
                    this.setColAlign(colIdx, item.value);
                    cpr.instance.replaceActiveGroupByName(item.name, item.id);
                    break;
                case 'insert':
                    this.addCol(item.value === 'left' ? colIdx : colIdx + 1);
                    break;
                case 'delete':
                    this.deleteCol(colIdx);
                    close();
                    break;
                case 'setHeadCol':
                    this.setProp('colHead', !this.props.colHead);
                    this.props.colHead ? cpr.instance.addActive('setHeadCol') : cpr.instance.removeActive('setHeadCol');
                    break;
            }
        });
    }
    setColAlign(colIdx, align) {
        const rows = this.model.children;
        this.controller.transact(() => {
            for (let i = 0; i < rows.length; i++) {
                const cell = rows[i].children[colIdx];
                if (cell && cell.props['textAlign'] !== align)
                    cell.setProp('textAlign', align);
            }
        }, USER_CHANGE_SIGNAL);
    }
    setRowAlign(rowIdx, align) {
        const cells = this.model.children[rowIdx].children;
        this.controller.transact(() => {
            cells.forEach(cell => {
                if (cell.props['textAlign'] !== align)
                    cell.setProp('textAlign', align);
            });
        });
    }
    addCol(index) {
        const addWidth = 80;
        // // 提前计算宽度
        // const maxWidth = this.table.nativeElement.getBoundingClientRect().width
        // const totalWidth = this._colWidths.reduce((pre, cur) => pre + cur, 0)
        // // 如果超出最大宽度
        // if (totalWidth + addWidth > maxWidth) {
        //   // 其他列宽度平均减少加出的宽度
        //   const reduceWidth = Math.floor((totalWidth + addWidth - maxWidth) / this._colWidths.length)
        //   this._colWidths = this._colWidths.map(width => width - reduceWidth)
        // }
        this._colWidths.splice(index, 0, addWidth);
        this.controller.transact(() => {
            this.model.children.forEach(row => {
                const cell = this.controller.createBlock('table-cell');
                row.insertChildren(index, [cell]);
            });
        }, USER_CHANGE_SIGNAL);
        this.setColWidths();
    }
    deleteCol(index, len = 1) {
        if (len === this.children[0].children.length) {
            return this.destroySelf();
        }
        this.controller.transact(() => {
            this.model.children.forEach(row => {
                row.deleteChildren(index, 1);
            });
        }, USER_CHANGE_SIGNAL);
        this._colWidths.splice(index, 1);
        this.setColWidths();
    }
    onRowHeightChange(height, rowIdx) {
        this._rowHeights[rowIdx] = height;
    }
    onShowRowBar(e) {
        e.stopPropagation();
        const target = e.target;
        const dataRowIdx = target.getAttribute('data-row-idx');
        if (!dataRowIdx)
            return;
        const rowIdx = parseInt(dataRowIdx);
        this.activeRowIdx = rowIdx;
        const portal = new ComponentPortal(FloatToolbar);
        const overlayRef = this.overlay.create({
            positionStrategy: this.overlay.position().flexibleConnectedTo(target).withPositions([
                { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
                { originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetX: 4 },
            ]),
            scrollStrategy: this.overlay.scrollStrategies.close(),
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-transparent-backdrop',
        });
        const close = () => {
            overlayRef.dispose();
            this.activeRowIdx = -1;
        };
        overlayRef.backdropClick().pipe(take(1)).subscribe(close);
        const cpr = overlayRef.attach(portal);
        const menu = [...TableRolControlMenu];
        if (rowIdx === 0)
            menu.unshift(SET_ROW_HEADER);
        const rowFirAlign = this.children[rowIdx].children[0].props['textAlign'];
        const commonAlign = this.children[rowIdx].children.every(cell => cell.props['textAlign'] === rowFirAlign);
        if (commonAlign) {
            cpr.instance.addActive('align-' + rowFirAlign);
        }
        if (this.props.rowHead) {
            cpr.instance.addActive('setHeadRow');
        }
        cpr.setInput('toolbarList', menu);
        cpr.instance.itemClick.pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe(({ item, event }) => {
            switch (item.name) {
                case 'align':
                    this.setRowAlign(rowIdx, item.value);
                    cpr.instance.replaceActiveGroupByName('align', item.id);
                    break;
                case 'insert':
                    this.addRow(item.value === 'top' ? rowIdx : rowIdx + 1);
                    break;
                case 'delete':
                    this.deleteRow(rowIdx);
                    close();
                    break;
                case 'setHeadRow':
                    this.setProp('rowHead', !this.props.rowHead);
                    this.props.colHead ? cpr.instance.addActive('setHeadRow') : cpr.instance.removeActive('setHeadRow');
                    break;
            }
        });
    }
    addRow(index) {
        const addHeight = 40;
        this._rowHeights.splice(index, 0, addHeight);
        const row = this.controller.createBlock('table-row', [this._colWidths.length]);
        this.model.insertChildren(index, [row]);
    }
    deleteRow(index, len = 1) {
        if (len === this.children.length) {
            return this.destroySelf();
        }
        this.model.deleteChildren(index, 1);
        this._rowHeights.splice(index, 1);
    }
    onTableBarRightClick(e) {
        e.preventDefault();
        e.stopPropagation();
        this.addCol(this.model.children[0].children.length);
    }
    onTableBarBottomClick(e) {
        e.preventDefault();
        e.stopPropagation();
        this.addRow(this.model.children.length);
    }
    /** 表格列宽调整 **/
    setColWidths() {
        this.model.yModel.get('props').set('colWidths', this._colWidths);
    }
    onMouseOver(e) {
        const target = e.target;
        if (target.tagName !== 'TD' || this.resizing$.value)
            return;
        const colIdx = parseInt(target.getAttribute('data-col-idx'));
        const rowIdx = parseInt(target.getAttribute('data-row-idx'));
        this.hoverCell = [rowIdx, colIdx];
        this.resizeColIdx = colIdx;
        this.resizeBarX = target.getBoundingClientRect().right - this.table.nativeElement.getBoundingClientRect().left;
    }
    onResizebarMouseDown(e) {
        e.stopPropagation();
        e.preventDefault();
        this.resizing$.next(true);
        const resizeSub = fromEvent(document, 'mousemove').pipe(takeUntil(this.resizing$.pipe(filter(v => !v))))
            .subscribe((e) => {
            const { left } = this.tableWrapper.nativeElement.getBoundingClientRect();
            const scrollLeft = this.tableWrapper.nativeElement.scrollLeft;
            if (!this.resizing$.value || e.clientX < left)
                return;
            const targetRect = this.table.nativeElement.querySelector(`td:nth-child(${this.resizeColIdx + 1})`).getBoundingClientRect();
            let newWidth = e.clientX - targetRect.left;
            // 不得小于50，不得大于maxWidth - 其他列宽度之和
            if (newWidth < 50)
                return;
            // // 如果是减少宽度，不用判断是否超出最大宽度
            // if (newWidth <= this.props.colWidths[this.resizeColIdx]) {
            //   this.resizeBarX = targetRect.right - left - 2
            //   this._colWidths[this.resizeColIdx] = newWidth
            //   return;
            // }
            // if (newWidth - this.props.colWidths[this.resizeColIdx] > width - this.props.colWidths.reduce((pre, cur) => pre + cur, 0)) return
            this.resizeBarX = targetRect.right + scrollLeft - left;
            this._colWidths[this.resizeColIdx] = newWidth;
        });
        fromEvent(document, 'mouseup').pipe(take(1)).subscribe(() => {
            if (!this.resizing$.value)
                return;
            this.resizing$.next(false);
            this.resizeColIdx = -1;
            this.setColWidths();
        });
    }
    /** 表格选中 **/
    focusCell(rowIdx, colIdx, pos) {
        const cell = this.model.children[rowIdx].children[colIdx];
        if (!cell)
            return;
        this.controller.getBlockRef(cell.id).setSelection(pos);
    }
    moveSelection(target, direction) {
        const cellEl = target.closest('td.table-cell');
        const cellPos = this.getCellPos(cellEl);
        if (!cellPos)
            return;
        const [rowIdx, colIdx] = cellPos;
        switch (direction) {
            case 'up':
                if (rowIdx === 0)
                    return;
                this.focusCell(rowIdx - 1, colIdx, 'end');
                break;
            case 'down':
                if (rowIdx === this.model.children.length - 1)
                    return;
                this.focusCell(rowIdx + 1, colIdx, 'start');
                break;
            case 'left':
                if (colIdx === 0)
                    return;
                this.focusCell(rowIdx, colIdx - 1, 'end');
                break;
            case 'right':
                if (colIdx === this.model.children[rowIdx].children.length - 1)
                    return;
                this.focusCell(rowIdx, colIdx + 1, 'start');
                break;
        }
    }
    clearSelectingCellText() {
        if (!this.selectingCell)
            return;
        const [start, end] = this.selectingCell;
        if (start[0] === end[0] && start[1] === end[1])
            return this.clearSelecting();
        const [startRowIdx, startColIdx] = start;
        const [endRowIdx, endColIdx] = end;
        this.controller.transact(() => {
            for (let rowIdx = startRowIdx; rowIdx <= endRowIdx; rowIdx++) {
                const tr = this.model.children[rowIdx];
                for (let colIdx = startColIdx; colIdx <= endColIdx; colIdx++) {
                    const td = tr.children[colIdx];
                    const block = this.controller.getBlockRef(td.id);
                    if (!block)
                        continue;
                    block.textLength && block.applyDelta([
                        { retain: 0 },
                        { delete: block.textLength }
                    ]);
                }
            }
        });
        const firstCell = this.model.children[startRowIdx].children[startColIdx];
        this.controller.selection.setSelection(firstCell.id, 0);
        this.clearSelecting();
    }
    onBlur() {
        console.log('blur', this.id);
        this.clearSelecting();
    }
    onMouseDown(e) {
        e.stopPropagation();
        this.clearSelecting();
        const target = e.target;
        const cellPos = this.getCellPos(target.closest('td.table-cell'));
        if (!cellPos)
            return;
        this.startSelectingCell = cellPos;
        this.selectingCell = [cellPos, cellPos];
        fromEvent(this.hostEl.nativeElement, 'mouseover').pipe(takeUntil(fromEvent(document, 'mouseup')))
            .subscribe((e) => {
            e.stopPropagation();
            if (!this.startSelectingCell || !this.selectingCell)
                return;
            const cellPos = this.getCellPos(e.target.closest('td.table-cell'));
            if (!cellPos)
                return;
            // 确定选区，左上角和右下角
            if (this.startSelectingCell[0] === cellPos[0] && this.startSelectingCell[1] === cellPos[1]) {
                return;
            }
            // 鼠标移动方向，确定是从左上到右下还是从右下到左上
            // 从左上到右下
            if (this.startSelectingCell[0] <= cellPos[0] && this.startSelectingCell[1] <= cellPos[1])
                this.selectingCell[1] = cellPos;
            // 从右下到左上
            else
                this.selectingCell[0] = cellPos;
            this.selecting$.next(true);
            this.selectCell();
        });
        fromEvent(document, 'mouseup').pipe(take(1)).subscribe((e) => {
            if (!this.selecting$.value)
                return this.clearSelecting();
            this.selecting$.next(false);
        });
    }
    clearSelecting() {
        this.selectingCell = undefined;
        this.startSelectingCell = undefined;
        this.cells?.forEach(cell => cell.classList.remove('selected'));
        this.cells = undefined;
    }
    selectCell() {
        if (!this.selectingCell)
            return;
        if (!this.cells) {
            this.cells = this.hostEl.nativeElement.querySelectorAll('td.table-cell');
        }
        this.cells.forEach((cell, idx) => {
            const [cellRowIdx, cellColIdx] = this.getCellPos(cell);
            if (cellRowIdx >= this.selectingCell[0][0] && cellRowIdx <= this.selectingCell[1][0] && cellColIdx >= this.selectingCell[0][1] && cellColIdx <= this.selectingCell[1][1]) {
                cell.classList.add('selected');
            }
            else {
                cell.classList.remove('selected');
            }
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TableBlock, deps: [{ token: i1.Overlay }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: TableBlock, isStandalone: true, selector: "div.table-block", viewQueries: [{ propertyName: "table", first: true, predicate: ["tableElement"], descendants: true, read: ElementRef }, { propertyName: "tableWrapper", first: true, predicate: ["wrapper"], descendants: true, read: ElementRef }], usesInheritance: true, ngImport: i0, template: "<div class=\"table-header_row-bar\" (click)=\"onShowRowBar($event)\" [class.active]=\"activeRowIdx >= 0\">\n    <span *ngFor=\"let row of _rowHeights; index as idx; trackBy: trackByValue\" [attr.data-row-idx]=\"idx\"\n          [class.active]=\"activeRowIdx === idx\" [class.hover]=\"hoverCell[0] === idx\" [style.height.px]=\"row || 0\"></span>\n</div>\n\n<div class=\"table-wrapper\" [class.col-head]=\"props.colHead\" [class.row-head]=\"props.rowHead\" #wrapper>\n  <div class=\"table-col-resize-bar\" *ngIf=\"!(controller.readonly$ | async)\" [class.active]=\"resizing$ | async\"\n       [hidden]=\"resizeColIdx < 0\" [style.left.px]=\"resizeBarX\" (mousedown)=\"onResizebarMouseDown($event)\"></div>\n\n  <div class=\"table-header_col-bar\" (click)=\"onShowColBar($event)\" [class.active]=\"activeColIdx >= 0\">\n    <span *ngFor=\"let col of _colWidths; index as idx\" [style.width.px]=\"col\" [attr.data-col-idx]=\"idx\"\n          [class.active]=\"activeColIdx === idx\" [class.hover]=\"hoverCell[1] === idx\"></span>\n  </div>\n\n  <table tabindex=\"0\" #tableElement (keydown)=\"onKeyDown($event)\" (blur)=\"onBlur()\" (mousedown)=\"onMouseDown($event)\"\n         (mouseover)=\"onMouseOver($event)\">\n    <colgroup>\n      <col *ngFor=\"let column of _colWidths; index as idx; trackBy: trackByValue\" [width]=\"column\"/>\n    </colgroup>\n\n    <tbody>\n    <tr class=\"table-row\" *ngFor=\"let row of model.children; index as rowIdx; trackBy: trackById\" [rowIdx]=\"rowIdx\"\n        [controller]=\"controller\" [model]=\"$any(row)\" [class.active]=\"activeRowIdx === rowIdx\"\n        (heightChange)=\"onRowHeightChange($event, rowIdx)\">\n    </tr>\n    </tbody>\n  </table>\n</div>\n\n\n\n\n\n", styles: [":host{display:block;position:relative;padding:0 2px 0 10px}:host.selected table{border:1px solid var(--bf-selected-border);background:var(--bf-selected)}:host:hover .table-header_row-bar,:host:focus-within .table-header_row-bar{display:block}:host:hover .table-header_col-bar,:host:hover .table-add-bar,:host:focus-within .table-header_col-bar,:host:focus-within .table-add-bar{display:flex}:host .table-col-resize-bar{z-index:3;position:absolute;top:0;left:0;height:100%;width:6px;background-color:#4857e2;cursor:col-resize;opacity:0}:host .table-col-resize-bar.active,:host .table-col-resize-bar:hover{opacity:1}:host .table-wrapper{padding-top:10px;position:relative;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;scrollbar-color:rgba(153,153,153,.5) transparent}:host .table-wrapper.col-head ::ng-deep td:first-child{font-weight:700;background:#f2f3f5;position:sticky;left:0;z-index:1}:host .table-wrapper.col-head .table-header_col-bar>span:first-child{position:sticky;left:0;z-index:2}:host .table-wrapper.row-head tr:first-child{font-weight:700;background:#f2f3f5;position:sticky;top:0;z-index:1}:host .table-header_col-bar{position:absolute;top:0;left:0;display:none;height:100%}:host .table-header_col-bar.active{display:flex}:host .table-header_col-bar>span{height:10px;background:#f1f1f1;cursor:pointer;position:relative}:host .table-header_col-bar>span:hover,:host .table-header_col-bar>span.hover{background:#e0e0e0}:host .table-header_col-bar>span.active{height:100%;z-index:2;background:unset}:host .table-header_col-bar>span.active:before,:host .table-header_col-bar>span.active:after{z-index:2;content:\"\";position:absolute;top:0;left:0;width:100%}:host .table-header_col-bar>span.active:before{height:10px;background:#4857e2}:host .table-header_col-bar>span.active:after{height:100%;background:#5f6fff14}:host .table-header_row-bar{display:none;position:absolute;top:10px;left:0;height:100%;overflow:hidden}:host .table-header_row-bar.active{display:block}:host .table-header_row-bar>span{display:block;width:10px;background:#f1f1f1;cursor:pointer;position:relative}:host .table-header_row-bar>span.active{background:#4857e2}:host .table-header_row-bar>span:hover,:host .table-header_row-bar>span.hover{background:#e0e0e0}:host table{position:relative;outline:none;table-layout:fixed;border-collapse:collapse;width:fit-content;font-size:var(--bf-fs)}:host table tr{position:relative}:host table tr.active:after{z-index:2;position:absolute;content:\"\";top:0;left:0;width:100%;height:100%;background:#5f6fff14!important}:host table ::ng-deep .table-cell{padding:10px;position:relative;border:1px solid #ccc;min-height:calc(var(--bf-fs) + 20px)}:host table ::ng-deep .table-cell.selected:after{z-index:2;position:absolute;content:\"\";top:0;left:0;width:100%;height:100%;background:#5f6fff14!important}:host .table-add-bar{display:none;position:absolute;background-color:#f1f1f0;color:#a5a5a2;align-items:center;justify-content:center;border-radius:4px;cursor:pointer;transition:all .2s;font-size:14px}:host .table-add-bar:hover{background-color:#e0e0de}:host .table-add-bar-right{top:0;right:-20px;width:16px;height:100%}:host .table-add-bar-bottom{bottom:-20px;width:100%;left:0;height:16px}:host .table-add-bar-bottom-right{position:absolute;bottom:-20px;right:-20px;width:16px;height:16px;background-color:#f1f1f0;color:#a5a5a2;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center}\n"], dependencies: [{ kind: "component", type: TableRowBlock, selector: "tr.table-row", inputs: ["rowIdx"], outputs: ["heightChange"] }, { kind: "directive", type: NgIf, selector: "[ngIf]", inputs: ["ngIf", "ngIfThen", "ngIfElse"] }, { kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }, { kind: "pipe", type: AsyncPipe, name: "async" }] }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TableBlock, decorators: [{
            type: Component,
            args: [{ selector: 'div.table-block', standalone: true, imports: [
                        TableRowBlock,
                        NgIf,
                        NgForOf,
                        AsyncPipe,
                    ], template: "<div class=\"table-header_row-bar\" (click)=\"onShowRowBar($event)\" [class.active]=\"activeRowIdx >= 0\">\n    <span *ngFor=\"let row of _rowHeights; index as idx; trackBy: trackByValue\" [attr.data-row-idx]=\"idx\"\n          [class.active]=\"activeRowIdx === idx\" [class.hover]=\"hoverCell[0] === idx\" [style.height.px]=\"row || 0\"></span>\n</div>\n\n<div class=\"table-wrapper\" [class.col-head]=\"props.colHead\" [class.row-head]=\"props.rowHead\" #wrapper>\n  <div class=\"table-col-resize-bar\" *ngIf=\"!(controller.readonly$ | async)\" [class.active]=\"resizing$ | async\"\n       [hidden]=\"resizeColIdx < 0\" [style.left.px]=\"resizeBarX\" (mousedown)=\"onResizebarMouseDown($event)\"></div>\n\n  <div class=\"table-header_col-bar\" (click)=\"onShowColBar($event)\" [class.active]=\"activeColIdx >= 0\">\n    <span *ngFor=\"let col of _colWidths; index as idx\" [style.width.px]=\"col\" [attr.data-col-idx]=\"idx\"\n          [class.active]=\"activeColIdx === idx\" [class.hover]=\"hoverCell[1] === idx\"></span>\n  </div>\n\n  <table tabindex=\"0\" #tableElement (keydown)=\"onKeyDown($event)\" (blur)=\"onBlur()\" (mousedown)=\"onMouseDown($event)\"\n         (mouseover)=\"onMouseOver($event)\">\n    <colgroup>\n      <col *ngFor=\"let column of _colWidths; index as idx; trackBy: trackByValue\" [width]=\"column\"/>\n    </colgroup>\n\n    <tbody>\n    <tr class=\"table-row\" *ngFor=\"let row of model.children; index as rowIdx; trackBy: trackById\" [rowIdx]=\"rowIdx\"\n        [controller]=\"controller\" [model]=\"$any(row)\" [class.active]=\"activeRowIdx === rowIdx\"\n        (heightChange)=\"onRowHeightChange($event, rowIdx)\">\n    </tr>\n    </tbody>\n  </table>\n</div>\n\n\n\n\n\n", styles: [":host{display:block;position:relative;padding:0 2px 0 10px}:host.selected table{border:1px solid var(--bf-selected-border);background:var(--bf-selected)}:host:hover .table-header_row-bar,:host:focus-within .table-header_row-bar{display:block}:host:hover .table-header_col-bar,:host:hover .table-add-bar,:host:focus-within .table-header_col-bar,:host:focus-within .table-add-bar{display:flex}:host .table-col-resize-bar{z-index:3;position:absolute;top:0;left:0;height:100%;width:6px;background-color:#4857e2;cursor:col-resize;opacity:0}:host .table-col-resize-bar.active,:host .table-col-resize-bar:hover{opacity:1}:host .table-wrapper{padding-top:10px;position:relative;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;scrollbar-color:rgba(153,153,153,.5) transparent}:host .table-wrapper.col-head ::ng-deep td:first-child{font-weight:700;background:#f2f3f5;position:sticky;left:0;z-index:1}:host .table-wrapper.col-head .table-header_col-bar>span:first-child{position:sticky;left:0;z-index:2}:host .table-wrapper.row-head tr:first-child{font-weight:700;background:#f2f3f5;position:sticky;top:0;z-index:1}:host .table-header_col-bar{position:absolute;top:0;left:0;display:none;height:100%}:host .table-header_col-bar.active{display:flex}:host .table-header_col-bar>span{height:10px;background:#f1f1f1;cursor:pointer;position:relative}:host .table-header_col-bar>span:hover,:host .table-header_col-bar>span.hover{background:#e0e0e0}:host .table-header_col-bar>span.active{height:100%;z-index:2;background:unset}:host .table-header_col-bar>span.active:before,:host .table-header_col-bar>span.active:after{z-index:2;content:\"\";position:absolute;top:0;left:0;width:100%}:host .table-header_col-bar>span.active:before{height:10px;background:#4857e2}:host .table-header_col-bar>span.active:after{height:100%;background:#5f6fff14}:host .table-header_row-bar{display:none;position:absolute;top:10px;left:0;height:100%;overflow:hidden}:host .table-header_row-bar.active{display:block}:host .table-header_row-bar>span{display:block;width:10px;background:#f1f1f1;cursor:pointer;position:relative}:host .table-header_row-bar>span.active{background:#4857e2}:host .table-header_row-bar>span:hover,:host .table-header_row-bar>span.hover{background:#e0e0e0}:host table{position:relative;outline:none;table-layout:fixed;border-collapse:collapse;width:fit-content;font-size:var(--bf-fs)}:host table tr{position:relative}:host table tr.active:after{z-index:2;position:absolute;content:\"\";top:0;left:0;width:100%;height:100%;background:#5f6fff14!important}:host table ::ng-deep .table-cell{padding:10px;position:relative;border:1px solid #ccc;min-height:calc(var(--bf-fs) + 20px)}:host table ::ng-deep .table-cell.selected:after{z-index:2;position:absolute;content:\"\";top:0;left:0;width:100%;height:100%;background:#5f6fff14!important}:host .table-add-bar{display:none;position:absolute;background-color:#f1f1f0;color:#a5a5a2;align-items:center;justify-content:center;border-radius:4px;cursor:pointer;transition:all .2s;font-size:14px}:host .table-add-bar:hover{background-color:#e0e0de}:host .table-add-bar-right{top:0;right:-20px;width:16px;height:100%}:host .table-add-bar-bottom{bottom:-20px;width:100%;left:0;height:16px}:host .table-add-bar-bottom-right{position:absolute;bottom:-20px;right:-20px;width:16px;height:16px;background-color:#f1f1f0;color:#a5a5a2;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center}\n"] }]
        }], ctorParameters: () => [{ type: i1.Overlay }], propDecorators: { table: [{
                type: ViewChild,
                args: ['tableElement', { read: ElementRef }]
            }], tableWrapper: [{
                type: ViewChild,
                args: ['wrapper', { read: ElementRef }]
            }] } });

const TableBlockSchema = {
    flavour: 'table',
    nodeType: 'block',
    label: "表格",
    icon: "bf_icn bf_column-vertical",
    svgIcon: "bf_column-vertical",
    render: TableBlock,
    onCreate: (rowNum = 3, col = 3) => {
        return {
            props: () => ({
                colWidths: new Array(col).fill(100),
            }),
            children: Array.from({ length: rowNum }, () => ({
                flavour: 'table-row',
                params: [[col]]
            }))
        };
    },
};
const TableRowBlockSchema = {
    flavour: 'table-row',
    nodeType: 'block',
    label: "表格行",
    isLeaf: true,
    render: TableRowBlock,
    onCreate: (col) => {
        return {
            children: Array.from({ length: col }, () => ({
                flavour: 'table-cell'
            }))
        };
    }
};
const TableCellBlockSchema = {
    flavour: 'table-cell',
    nodeType: 'editable',
    label: "表格单元",
    isLeaf: true,
    render: TableCellBlock,
    children: []
};

const onTab = (e, controller) => {
    e.preventDefault();
    const curRange = controller.selection.getSelection();
    if (curRange.isAtRoot) {
        const { rootRange } = curRange;
        if (!rootRange)
            return;
        let from = 0, to = 0;
        from = rootRange.start;
        to = rootRange.end;
        let ordered = null;
        for (let i = from; i < to; i++) {
            const bm = controller.rootModel[i];
            if (bm.nodeType !== 'editable')
                continue;
            ordered === null && bm.flavour === 'ordered-list' && (ordered = bm);
            if (e.shiftKey) {
                if (bm.props.indent === 0)
                    continue;
                bm.setProp('indent', (bm.props.indent || 1) - 1);
            }
            else {
                bm.setProp('indent', (bm.props.indent || 0) + 1);
            }
        }
        ordered && controller.updateOrderAround(ordered);
    }
    else {
        const { blockId } = curRange;
        const bRef = controller.getBlockRef(blockId);
        if (controller.activeElement?.classList.contains('bf-multi-line')) {
            if (curRange.blockRange.start === curRange.blockRange.end) {
                if (e.shiftKey)
                    return;
                bRef.applyDelta([
                    { retain: curRange.blockRange.start },
                    { insert: '  ' }
                ]);
                return;
            }
            const deltas = [];
            const text = bRef.getTextContent();
            let i = curRange.blockRange.start;
            const dividerPos = [];
            while (i < curRange.blockRange.end) {
                if (text[i] === '\n') {
                    dividerPos.push(i + 1);
                }
                i++;
            }
            if (dividerPos[0] > curRange.blockRange.start || !dividerPos.length) {
                // 前一个换行符之后或者首个字符
                const prev = text.slice(0, dividerPos[0] - 1).lastIndexOf('\n');
                dividerPos.unshift(prev > 0 ? prev + 1 : 0);
            }
            dividerPos.forEach((pos, index) => {
                deltas.push({ retain: index > 0 ? pos - dividerPos[index - 1] : pos });
                deltas.push({ insert: '\u3000' });
            });
            bRef.applyDelta(deltas, false);
            requestAnimationFrame(() => {
                bRef.setSelection(curRange.blockRange.start + 1, curRange.blockRange.end + dividerPos.length);
            });
            return;
        }
        if (e.shiftKey) {
            if (bRef.model.props.indent === 0)
                return;
            bRef.model.setProp('indent', (bRef.model.props.indent || 1) - 1);
        }
        else {
            bRef.model.setProp('indent', (bRef.model.props.indent || 0) + 1);
        }
        bRef instanceof OrderedListBlock && controller.updateOrderAround(bRef.model);
    }
};

const onCtrlZ = (e, controller) => {
    e.preventDefault();
    if (e.shiftKey)
        controller.redo();
    else
        controller.undo();
};

const onCtrlC = (e, controller) => {
    e.preventDefault();
    controller.clipboard.copy();
};

const onCtrlX = (e, controller) => {
    e.preventDefault();
    controller.clipboard.cut();
};

const onEnter = (event, controller) => {
    event.preventDefault();
    event.stopPropagation();
    const curRange = controller.selection.getSelection();
    if (!curRange)
        return;
    if (curRange.isAtRoot) {
        if (!curRange.rootRange) {
            if (!controller.blockLength) {
                const np = controller.createBlock('paragraph');
                controller.insertBlocks(0, [np]).then(() => {
                    controller.selection.setSelection(np.id, 0);
                });
            }
            return;
        }
        const newBlock = controller.createBlock('paragraph');
        controller.insertBlocks(curRange.rootRange.start + 1, [newBlock]).then(() => {
            controller.selection.setSelection(newBlock.id, 'start');
        });
        return;
    }
    const { blockRange: range } = curRange;
    const bRef = controller.getFocusingBlockRef();
    if (!bRef)
        throw new Error('No focusing block');
    const textContent = bRef.getTextContent();
    const { parentId, index } = bRef.getPosition();
    if (bRef.containerEle.classList.contains('bf-multi-line') && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const isAtEnd = range.start === textContent.length && textContent.at(-1) !== '\n';
        const deltas = [
            { retain: range.start },
            { insert: isAtEnd ? '\n\u200B' : '\n' }
        ];
        if (range.end !== range.start)
            deltas.splice(1, 0, { delete: range.end - range.start });
        bRef.applyDelta(deltas, false);
        window.getSelection()?.modify('move', 'forward', 'character');
        return;
    }
    if (parentId !== controller.rootId)
        return;
    const textLength = bRef.textLength;
    const isEmpty = !textLength;
    const isAtCenter = range.start > 0 && range.end < textLength;
    const paramDeltas = isAtCenter ? sliceDelta(bRef.getTextDelta(), range.end) : undefined;
    const newBlock = controller.createBlock((isEmpty || event.ctrlKey || event.metaKey || event.shiftKey) ? 'paragraph' : bRef.flavour, [paramDeltas, bRef.props]);
    controller.transact(() => {
        if (isAtCenter) {
            bRef.applyDelta([{ retain: range.start }, { delete: textLength - range.start }]);
        }
        controller.insertBlocks(range.start === 0 && !isEmpty ? index : index + 1, [newBlock]).then(() => {
            (range.start > 0 || isEmpty) && controller.selection.setSelection(newBlock.id, 'start');
        });
    }, USER_CHANGE_SIGNAL);
};

const onCtrlA = (e, controller) => {
    // e.preventDefault()
    // const focusingBlockId = controller.getFocusingBlockId()
    // if (!focusingBlockId) return
    // const focusingBlock = controller.getBlockRef(focusingBlockId) as EditableBlock
    // controller.setSelection(focusingBlock, 'start', 'end')
};

const formatKeyHandler = (format, controller) => {
    const range = controller.selection.getSelection();
    if (range.isAtRoot)
        return;
    const block = controller.getBlockRef(range.blockId);
    // block.format(format, range.blockRange, true)
    const { start, end } = range.blockRange;
    if (start === end)
        return;
    const deltas = [
        {
            retain: start,
        },
        {
            retain: end - start,
            attributes: format
        }
    ];
    block.applyDelta(deltas);
};

const onCtrlU = (e, controller) => {
    e.preventDefault();
    formatKeyHandler({ 'a:underline': true }, controller);
};

const onCtrlI = (e, controller) => {
    e.preventDefault();
    formatKeyHandler({ 'a:italic': true }, controller);
};

const onCtrlB = (e, controller) => {
    e.preventDefault();
    formatKeyHandler({ 'a:bold': true }, controller);
};

const onArrowUp = (e, controller) => {
    const curRange = controller.selection.getSelection();
    const focusPrev = (index) => {
        const prevBlock = controller.getBlockRef(controller.rootModel[Math.max(0, index - 1)].id);
        if (!prevBlock)
            return;
        if (controller.isEditableBlock(prevBlock)) {
            prevBlock.setSelection(index > 0 ? 'end' : 0);
            return;
        }
        if (index > 0) {
            controller.selection.setSelection(controller.rootId, index - 1, index);
            return;
        }
        const np = controller.createBlock('paragraph');
        controller.insertBlocks(0, [np]).then(() => {
            controller.selection.setSelection(np.id, 0);
        });
    };
    if (curRange.isAtRoot) {
        e.preventDefault();
        const { rootRange } = curRange;
        if (!controller.rootModel.length) {
            const np = controller.createBlock('paragraph');
            controller.insertBlocks(0, [np]).then(() => {
                controller.selection.setSelection(np.id, 0);
            });
            return;
        }
        const index = rootRange ? rootRange.start : 0;
        const bm = controller.rootModel[index];
        if (controller.isEditable(bm)) {
            controller.selection.setSelection(bm.id, 0);
            return;
        }
        focusPrev(index);
        return;
    }
    if (curRange.blockRange.start === curRange.blockRange.end && curRange.blockRange.start === 0) {
        e.preventDefault();
        const bRef = controller.getFocusingBlockRef();
        const poss = bRef.getPosition();
        if (poss.parentId !== controller.rootId)
            return;
        if (poss.index === 0)
            return;
        focusPrev(poss.index);
    }
};

const onArrowDown = (e, controller) => {
    const curRange = controller.selection.getSelection();
    const focusNext = (index) => {
        const nextBlock = controller.getBlockRef(controller.rootModel[Math.min(controller.blockLength - 1, index + 1)].id);
        if (!nextBlock)
            return;
        if (controller.isEditableBlock(nextBlock)) {
            nextBlock.setSelection(index < controller.blockLength - 1 ? 'start' : 'end');
            return;
        }
        if (index < controller.blockLength - 1) {
            controller.selection.setSelection(controller.rootId, index + 1, index + 2);
            return;
        }
        const np = controller.createBlock('paragraph');
        controller.insertBlocks(controller.blockLength - 1, [np]).then(() => {
            controller.selection.setSelection(np.id, 0);
        });
    };
    if (curRange.isAtRoot) {
        e.preventDefault();
        const { rootRange } = curRange;
        if (!controller.blockLength) {
            const np = controller.createBlock('paragraph');
            controller.insertBlocks(0, [np]).then(() => {
                controller.selection.setSelection(np.id, 0);
            });
            return;
        }
        const index = rootRange ? rootRange.end - 1 : controller.blockLength - 1;
        const bm = controller.rootModel[index];
        if (controller.isEditable(bm)) {
            controller.selection.setSelection(bm.id, 'end');
            return;
        }
        focusNext(index);
        return;
    }
    const block = controller.getBlockRef(curRange.blockId);
    if (curRange.blockRange.end === block.textLength && curRange.blockRange.start === curRange.blockRange.end) {
        e.preventDefault();
        const poss = block.getPosition();
        if (poss.parentId !== controller.rootId)
            return;
        if (poss.index === controller.blockLength - 1)
            return;
        focusNext(poss.index);
    }
};

const onArrowLeft = onArrowUp;

const onArrowRight = onArrowDown;

class KeyEventBus {
    constructor(controller) {
        this.controller = controller;
        this.handlers = [
            {
                trigger: (e) => (e.code === 'Backspace'),
                handler: onBackspace
            },
            {
                trigger: (e) => (e.code === 'Delete'),
                handler: onDelete
            },
            {
                trigger: (e) => (e.code === 'Tab'),
                handler: onTab
            },
            {
                trigger: (e) => (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)),
                handler: onCtrlZ
            },
            {
                trigger: (e) => (e.code === 'KeyC' && (e.ctrlKey || e.metaKey) && !e.shiftKey),
                handler: onCtrlC
            },
            {
                trigger: (e) => (e.code === 'KeyX' && (e.ctrlKey || e.metaKey) && !e.shiftKey),
                handler: onCtrlX
            },
            {
                trigger: (e) => e.key === 'Enter',
                handler: onEnter
            },
            {
                trigger: (e) => (e.code === 'KeyA' && (e.ctrlKey || e.metaKey)),
                handler: onCtrlA
            },
            {
                trigger: (e) => (e.code === 'KeyU' && (e.ctrlKey || e.metaKey)),
                handler: onCtrlU
            },
            {
                trigger: (e) => (e.code === 'KeyI' && (e.ctrlKey || e.metaKey)),
                handler: onCtrlI
            },
            {
                trigger: (e) => (e.code === 'KeyB' && (e.ctrlKey || e.metaKey)),
                handler: onCtrlB
            },
            {
                trigger: (e) => (e.code === 'ArrowUp'),
                handler: onArrowUp
            },
            {
                trigger: (e) => (e.code === 'ArrowDown'),
                handler: onArrowDown
            },
            {
                trigger: (e) => (e.code === 'ArrowLeft'),
                handler: onArrowLeft
            },
            {
                trigger: (e) => (e.code === 'ArrowRight'),
                handler: onArrowRight
            }
        ];
    }
    add(handler) {
        this.handlers.unshift(handler);
    }
    remove(trigger) {
        const index = this.handlers.findIndex((handler) => handler.trigger === trigger);
        if (index !== -1)
            this.handlers.splice(index, 1);
    }
    handle(event) {
        for (const { trigger, handler } of this.handlers) {
            if (trigger(event)) {
                handler(event, this.controller);
                return true;
            }
        }
        return false;
    }
}

class BlockWrap {
    constructor(hostEl) {
        this.hostEl = hostEl;
    }
    ngAfterViewInit() {
        const schema = this.controller.schemas.get(this.model.flavour);
        if (!schema)
            throw new Error(`Schema not found for flavour: ${this.model.flavour}`);
        const cpr = this.container.createComponent(schema.render);
        cpr.instance.controller = this.controller;
        cpr.setInput('model', this.model);
        cpr.changeDetectorRef.detectChanges();
        cpr.instance.cdr.detectChanges();
        this.hostEl.nativeElement.setAttribute('data-block-id', this.model.id);
    }
    onAppendAfter(e) {
        e.stopPropagation();
        e.preventDefault();
        const pos = this.controller.getBlockPosition(this.model.id);
        const np = this.controller.createBlock('paragraph');
        this.controller.insertBlocks(pos.index + 1, [np]).then(() => {
            this.controller.selection.setSelection(np.id, 0);
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockWrap, deps: [{ token: i0.ElementRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: BlockWrap, isStandalone: true, selector: "div[bf-block-wrap]", inputs: { controller: "controller", model: "model" }, viewQueries: [{ propertyName: "container", first: true, predicate: ["container"], descendants: true, read: ViewContainerRef, static: true }], ngImport: i0, template: `
    <ng-container #container></ng-container>
<!--    <span style="display: block; cursor: text;" (mousedown)="onAppendAfter($event)">&ZeroWidthSpace;</span>-->
  `, isInline: true }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockWrap, decorators: [{
            type: Component,
            args: [{
                    selector: 'div[bf-block-wrap]',
                    template: `
    <ng-container #container></ng-container>
<!--    <span style="display: block; cursor: text;" (mousedown)="onAppendAfter($event)">&ZeroWidthSpace;</span>-->
  `,
                    standalone: true,
                }]
        }], ctorParameters: () => [{ type: i0.ElementRef }], propDecorators: { controller: [{
                type: Input,
                args: [{ required: true }]
            }], model: [{
                type: Input,
                args: [{ required: true }]
            }], container: [{
                type: ViewChild,
                args: ['container', { read: ViewContainerRef, static: true }]
            }] } });

class BlockSelection {
    get storeSize() {
        return this.store.size;
    }
    get selectedElements() {
        return this.store;
    }
    constructor(config) {
        this.config = config;
        this.host = this.config.host;
        this.document = this.config.document;
        this.store = new Set();
        this.selectionAreaEle = null;
        this.selectableElements = null;
        this.eventListeners = {};
        this.isSelecting = false;
        this.onMousedown = (event) => {
            if (this.config.enable)
                return;
            this.baseHostRect = this.host.getBoundingClientRect();
            // clear previous selection
            this.store.forEach(element => this.config.onItemUnselect(element));
            this.store.clear();
            // if the button is not left button, return
            if (event.button !== 0 && this.config.onlyLeftButton)
                return;
            const target = event.target;
            // if the target is input or textarea, return
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
                return;
            // if the target is content editable, bind the special mousemove event to the target
            const closetEditableContainer = target.closest('.editable-container');
            if (target.isContentEditable || closetEditableContainer) {
                this.triggerElement = target.closest('.editable-container');
                this.host.addEventListener('mousemove', this.onContentEditableMouseMove);
            }
            else {
                this.document.body.addEventListener('mousemove', this.onMousemove);
            }
            this.document.body.addEventListener('mouseup', this.onMouseup);
            this.mouseStartPos = { x: event.clientX, y: event.clientY - this.baseHostRect.y };
        };
        this.onContentEditableMouseMove = (event) => {
            if (!this.triggerElement) {
                this.host.removeEventListener('mousemove', this.onContentEditableMouseMove);
                return;
            }
            const triggerRect = this.triggerElement.getBoundingClientRect();
            if (event.target !== this.triggerElement && (event.clientY < triggerRect.top - 20 || event.clientY > triggerRect.bottom + 20)) {
                this.host.removeEventListener('mousemove', this.onContentEditableMouseMove);
                this.startSelecting();
            }
        };
        this.onMousemove = (event) => {
            // if the mouse button is not pressed or the mouseStartPos is not set, return
            if (!event.buttons || !this.mouseStartPos)
                return;
            event.preventDefault();
            // sensitivity
            if (Math.abs(event.clientX - this.mouseStartPos.x) < this.config.sensitivity || Math.abs(event.clientY - this.mouseStartPos.y) < this.config.sensitivity)
                return;
            this.startSelecting();
            this.document.body.removeEventListener('mousemove', this.onMousemove);
        };
        this.onMouseMovePicking = (event) => {
            const eleRect = this.host.getBoundingClientRect();
            this.mousePos = { x: event.clientX, y: event.clientY - eleRect.y };
            this.repaintSelectionArea();
            this.calculateSelectionAreaContain();
            if (this.eventListeners.move?.length) {
                this.eventListeners.move.forEach(callback => callback(this.selectedElements));
            }
        };
        this.onMouseup = (event) => {
            event.preventDefault();
            this.mouseStartPos = null;
            this.document.body.removeEventListener('mouseup', this.onMouseup);
            this.document.body.removeEventListener('mousemove', this.onMousemove);
            if (this.triggerElement) {
                this.triggerElement = null;
                this.host.removeEventListener('mousemove', this.onContentEditableMouseMove);
            }
            if (this.isSelecting)
                this.endSelect();
        };
        this.lastCalculateIndex = 0;
        this.bindEvents();
    }
    clear() {
        this.storeSize && this.selectedElements.forEach(ele => this.unselectElement(ele));
    }
    selectElement(element) {
        this.store.add(element);
        this.config.onItemSelect(element);
    }
    unselectElement(element) {
        this.store.delete(element);
        this.config.onItemUnselect(element);
    }
    on(event, callback) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    }
    bindEvents() {
        this.host.addEventListener('mousedown', this.onMousedown);
    }
    startSelecting() {
        this.host.style.pointerEvents = 'none';
        this.createSelectionArea();
        this.document.getSelection().removeAllRanges();
        this.host.focus({ preventScroll: true });
        this.isSelecting = true;
        this.onSelectingSub =
            fromEvent(this.document.body, 'mousemove').pipe(throttleTime(20))
                .subscribe((event) => {
                this.onMouseMovePicking(event);
            });
        this.selectableElements = this.config.selectable ? this.host.querySelectorAll(this.config.selectable) : this.host.children;
        if (this.eventListeners.start?.length) {
            this.eventListeners.start.forEach(callback => callback(this.selectedElements));
        }
    }
    calculateSelectionAreaContain() {
        // console.time('calculateSelectionAreaContain')
        let flag = 2;
        let i = 0;
        this.store.clear();
        while (flag > 0) {
            const element = this.selectableElements[i];
            if (i >= this.selectableElements.length)
                break;
            i++;
            if (!element)
                continue;
            const rect = element.getBoundingClientRect();
            if (isIntersect(this.selectionAreaEle.getBoundingClientRect(), rect)) {
                this.config.onItemSelect(element);
                this.store.add(element);
                if (flag === 2)
                    flag--;
            }
            else {
                if (flag === 1)
                    flag--;
                this.config.onItemUnselect(element);
            }
        }
        // unselect the elements that are selected before but not selected now
        if (i < this.lastCalculateIndex) {
            for (let j = i; j < this.lastCalculateIndex; j++) {
                const element = this.selectableElements[j];
                if (!element)
                    continue;
                this.config.onItemUnselect(element);
            }
        }
        this.lastCalculateIndex = i;
        // console.timeEnd('calculateSelectionAreaContain')
    }
    endSelect() {
        // @ts-ignore
        this.host.style.pointerEvents = null;
        this.onSelectingSub?.unsubscribe();
        this.removeSelectionArea();
        this.selectableElements = null;
        if (this.eventListeners.end?.length) {
            this.eventListeners.end.forEach(callback => callback(this.selectedElements));
        }
    }
    createSelectionArea() {
        const area = this.document.createElement('div');
        area.className = this.config.selectionAreaClass;
        area.style.position = 'absolute';
        this.host.appendChild(area);
        this.selectionAreaEle = area;
    }
    repaintSelectionArea() {
        if (!this.selectionAreaEle || !this.mousePos || !this.mouseStartPos)
            return;
        this.selectionAreaEle.style.cssText = `
      position: absolute;
      width: ${Math.abs(this.mousePos.x - this.mouseStartPos.x)}px;
      height: ${Math.abs(this.mousePos.y - this.mouseStartPos.y)}px;
      left: ${Math.min(this.mousePos.x, this.mouseStartPos.x) - this.baseHostRect.left}px;
      top: ${Math.min(this.mousePos.y, this.mouseStartPos.y)}px;`;
    }
    removeSelectionArea() {
        this.selectionAreaEle?.remove();
    }
}
const isIntersect = (rect1, rect2) => {
    return !(rect1.right < rect2.left || rect1.left > rect2.right || rect1.bottom < rect2.top || rect1.top > rect2.bottom);
};

class EditorRoot {
    constructor(elementRef, cdr) {
        this.elementRef = elementRef;
        this.cdr = cdr;
        this.onDestroy = new EventEmitter();
        this.activeBlock$ = new BehaviorSubject(null);
        this.ready$ = new BehaviorSubject(false);
        this._activeElement = null;
        this._activeBlock = null;
        this._selectedBlockRange = undefined;
        this.prevInput = null;
        this.compositionStatus = 'end';
    }
    ngAfterViewInit() {
        this.initBlockSelection();
        this.ready$.next(true);
    }
    get rootElement() {
        return this.elementRef.nativeElement;
    }
    get activeElement() {
        return this._activeElement;
    }
    get activeBlock() {
        return this._activeBlock;
    }
    get selectedBlockRange() {
        return this._selectedBlockRange;
    }
    setController(controller) {
        this.controller = controller;
        this.rootElement.id = controller.rootId;
        // this.controller.readonly$.pipe(takeUntil(this.onDestroy)).subscribe(readonly => {
        //   if (readonly) {
        //     this.rootElement.removeAttribute('contenteditable')
        //   } else {
        //     this.rootElement.setAttribute('contenteditable', 'false')
        //   }
        // })
    }
    initBlockSelection() {
        this.blockSelection = new BlockSelection({
            host: this.rootElement,
            document: document,
            enable: false,
            onlyLeftButton: true,
            selectable: "[bf-block-wrap]",
            selectionAreaClass: "blockflow-selection-area",
            sensitivity: 40,
            onItemSelect: (element) => {
                element.firstElementChild.classList.add('selected');
            },
            onItemUnselect: (element) => {
                element.firstElementChild.classList.remove('selected');
            }
        });
        this.blockSelection.on('end', (blocks) => {
            if (!blocks?.size)
                return;
            const blockIdxList = [...blocks].map(block => this.controller.rootModel.findIndex(b => b.id === block.getAttribute('data-block-id')));
            this._selectedBlockRange = { start: Math.min(...blockIdxList), end: Math.max(...blockIdxList) + 1 };
        });
    }
    selectBlocks(from, to) {
        document.getSelection().removeAllRanges();
        this.rootElement.focus({ preventScroll: true });
        this.clearSelectedBlockRange();
        const start = characterIndex2Number(from, this.controller.rootModel.length);
        const end = characterIndex2Number(to, this.controller.rootModel.length);
        this._selectedBlockRange = { start, end };
        for (let i = start; i < end; i++) {
            const ele = this.rootElement.children[i];
            this.blockSelection.selectElement(ele);
        }
    }
    clearSelectedBlockRange() {
        this.blockSelection.clear();
        this._selectedBlockRange = undefined;
    }
    getActiveBlockId() {
        if (!this.activeElement || this.activeElement === this.rootElement)
            return null;
        return this.activeElement.closest('[bf-node-type="editable"]')?.id;
    }
    getActiveBlockRef() {
        const bid = this.getActiveBlockId();
        if (!bid)
            return null;
        return this.controller.getBlockRef(bid);
    }
    onFocusIn(event) {
        const target = event.target;
        if (!target.isContentEditable && target !== this.rootElement) {
            this._activeElement = null;
            this.activeBlock$.next(this._activeBlock = null);
            return;
        }
        this._activeElement = target;
        this.activeBlock$.next(this._activeBlock = this.getActiveBlockRef());
        if (target.getAttribute('placeholder') && !target.textContent)
            target.classList.add('placeholder-visible');
    }
    onFocusOut(event) {
        this._activeElement = null;
        this.activeBlock$.next(this._activeBlock = null);
        const target = event.target;
        if (target === this.rootElement)
            this._selectedBlockRange && this.clearSelectedBlockRange();
        target.classList.remove('placeholder-visible');
    }
    onKeyDown(event) {
        if (this.controller.readonly$.value || event.isComposing)
            return;
        this.controller.keyEventBus.handle(event);
    }
    onCompositionStart(event) {
        this.compositionStatus = 'start';
    }
    onCompositionEnd(event) {
        this.compositionStatus = 'end';
    }
    onCompositionUpdate(event) {
        this.compositionStatus = 'update';
    }
    onBeforeInput(event) {
        // console.clear()
        // console.log('beforeinput', event, event.inputType, event.data)
        switch (event.inputType) {
            case 'insertReplacementText':
            case 'insertCompositionText':
            case 'insertText':
            case 'deleteContentForward':
            case 'deleteContentBackward':
                break;
            default:
                event.preventDefault();
                return;
        }
        const activeElement = this.activeElement;
        const sel = window.getSelection();
        const staticRange = event.getTargetRanges()[0];
        this.prevInput = this.controller.selection.normalizeStaticRange(activeElement, staticRange);
        this.prevInput.data = event.data;
        this.prevInput.inputType = event.inputType;
        // console.log(staticRange,this.prevInput)
        if (staticRange.startContainer === activeElement ||
            (staticRange.startContainer instanceof Text && (staticRange.startContainer.parentElement === activeElement || isEmbedElement(staticRange.startContainer.parentElement?.previousElementSibling))))
            this.prevInput.afterEmbed = true;
        // prevent browser behavior - hold unknown tag to insert into the text
        if (!staticRange.collapsed && this.compositionStatus !== 'start') {
            const _range = document.createRange();
            _range.setStart(staticRange.startContainer, staticRange.startOffset);
            _range.setEnd(staticRange.endContainer, staticRange.endOffset);
            const adjusted = adjustRangeEdges(activeElement, _range);
            if (adjusted) {
                event.preventDefault();
                _range.deleteContents();
                this.prevInput.afterEmbed = true;
            }
            _range.detach();
            this.handleInput(event);
            return;
        }
        if ((sel.focusNode instanceof Text && sel.focusOffset === 0 && sel.focusNode.parentElement !== activeElement) ||
            (sel.focusNode === activeElement && activeElement.className.includes('editable-container')) // at embed element before or after
        ) {
            /**
             * <p> <span></span> </p>  --> write any word in p tag --> <p> word <span></span> </p> ; it`s not expected result because the word should be in span tag
             * <p> <span>\u200B</span> </p>  --> write any word in p tag --> <p> <span>\u200Bword</span> </p> ; it`s expected result
             */
            const span = document.createElement('span');
            span.textContent = '\u200B';
            sel.focusNode instanceof Text ? sel.focusNode.parentElement.before(span) : sel.getRangeAt(0).insertNode(span);
            sel.setBaseAndExtent(span.firstChild, 0, span.firstChild, 1);
        }
        this.handleInput(event);
    }
    handleInput(e) {
        // console.log('input', e, e.inputType, e.data)
        if (!this.prevInput)
            return;
        const { start, end, afterEmbed, data, inputType } = this.prevInput;
        const ops = [];
        const bRef = this.activeBlock;
        const yText = bRef.yText;
        if (start !== end) {
            ops.push(() => yText.delete(start, end - start));
        }
        let needCheck = false;
        switch (inputType) {
            case 'insertReplacementText':
            case 'insertCompositionText':
            case 'insertText':
                data && ops.push(() => yText.insert(start, data, afterEmbed ? {} : undefined)); // avoid new text extends the attributes of previous embed element
                start === 0 && (needCheck = true);
                break;
            case 'deleteContentBackward':
                if (start === end) {
                    ops.push(() => yText.delete(start - 1, 1));
                }
                break;
            case 'deleteContentForward':
                if (start === end) {
                    ops.push(() => yText.delete(start, 1));
                }
                break;
            default:
                break;
        }
        ops.length && this.controller.transact(() => {
            ops.forEach(op => op());
            // 检查br标签
            if (needCheck && bRef.getTextContent() === data) {
                clearBreakElement(bRef.containerEle);
            }
        }, USER_CHANGE_SIGNAL);
        this.prevInput = null;
    }
    onContextMenu(event) {
        event.preventDefault();
        console.log('contextmenu', event);
    }
    ngOnDestroy() {
        this.onDestroy.emit();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: EditorRoot, deps: [{ token: i0.ElementRef }, { token: i0.ChangeDetectorRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "17.3.12", type: EditorRoot, isStandalone: true, selector: "div[bf-node-type=\"root\"][lazy-load=\"false\"]", outputs: { onDestroy: "onDestroy" }, host: { listeners: { "focusin": "onFocusIn($event)", "focusout": "onFocusOut($event)", "keydown": "onKeyDown($event)", "compositionstart": "onCompositionStart($event)", "compositionend": "onCompositionEnd($event)", "compositionupdate": "onCompositionUpdate($event)", "beforeinput": "onBeforeInput($event)", "contextmenu": "onContextMenu($event)" }, properties: { "attr.tabindex": "0", "attr.contenteditable": "false" } }, ngImport: i0, template: `
    @if (controller) {
      @for (model of controller.rootModel; track model.flavour + '-' + model.id + '-' + model.meta.createdTime) {
        <div bf-block-wrap [controller]="controller" [model]="model"></div>
      }
    }
  `, isInline: true, dependencies: [{ kind: "component", type: BlockWrap, selector: "div[bf-block-wrap]", inputs: ["controller", "model"] }] }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: EditorRoot, decorators: [{
            type: Component,
            args: [{
                    selector: 'div[bf-node-type="root"][lazy-load="false"]',
                    template: `
    @if (controller) {
      @for (model of controller.rootModel; track model.flavour + '-' + model.id + '-' + model.meta.createdTime) {
        <div bf-block-wrap [controller]="controller" [model]="model"></div>
      }
    }
  `,
                    standalone: true,
                    imports: [BlockWrap, NgForOf, NgIf],
                    host: {
                        '[attr.tabindex]': '0',
                        '[attr.contenteditable]': 'false',
                    }
                }]
        }], ctorParameters: () => [{ type: i0.ElementRef }, { type: i0.ChangeDetectorRef }], propDecorators: { onDestroy: [{
                type: Output
            }], onFocusIn: [{
                type: HostListener,
                args: ['focusin', ['$event']]
            }], onFocusOut: [{
                type: HostListener,
                args: ['focusout', ['$event']]
            }], onKeyDown: [{
                type: HostListener,
                args: ['keydown', ['$event']]
            }], onCompositionStart: [{
                type: HostListener,
                args: ['compositionstart', ['$event']]
            }], onCompositionEnd: [{
                type: HostListener,
                args: ['compositionend', ['$event']]
            }], onCompositionUpdate: [{
                type: HostListener,
                args: ['compositionupdate', ['$event']]
            }], onBeforeInput: [{
                type: HostListener,
                args: ['beforeinput', ['$event']]
            }], onContextMenu: [{
                type: HostListener,
                args: ['contextmenu', ['$event']]
            }] } });

class LazyEditorRoot extends EditorRoot {
    constructor() {
        super(...arguments);
        this.pagination = {
            totalCount: 1,
            pageNum: 1
        };
        this.lastEle = null;
        this.resizeObserver = new ResizeObserver((entries) => {
            const { height } = entries[0].contentRect;
            if (height < this.parentHeight) {
                this.loadMore(this.pagination.pageNum);
            }
            else {
                const lastIndex = this.model.length - 1;
                const id = this.model[lastIndex].id;
                this.lastEle && this.lastEleIntersection.unobserve(this.lastEle);
                const cpr = this.controller.getBlockRef(id);
                this.lastEleIntersection?.observe(cpr.hostEl.nativeElement);
                this.lastEle = cpr.hostEl.nativeElement;
            }
        });
    }
    get model() {
        return this.controller.rootModel;
    }
    loadMore(page) {
        console.log('loadMore', page, this.model);
        if (this.model.length >= this.pagination.totalCount) {
            this.unobserve();
            return;
        }
        return this.config.requester(page).then((res) => {
            const { data, totalCount } = res;
            this.pagination.totalCount = totalCount;
            this.pagination.pageNum++;
            this.controller.transact(() => {
                this.controller.insertBlocks(this.model.length, data.map(BlockModel.fromModel));
            }, Symbol('lazy-load'));
            this.cdr.detectChanges();
            console.log('res', res, this.pagination, this.model);
            return res;
        });
    }
    setController(controller) {
        super.setController(controller);
        this.observe();
    }
    observe() {
        this.parentEle = this.elementRef.nativeElement.parentElement;
        this.parentHeight = this.parentEle.clientHeight;
        this.lastEleIntersection = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting)
                this.loadMore(this.pagination.pageNum);
        }, {
            root: this.parentEle,
            rootMargin: '0px',
            threshold: 0.5
        });
        this.resizeObserver.observe(this.elementRef.nativeElement);
    }
    unobserve() {
        this.lastEleIntersection.disconnect();
        this.resizeObserver.disconnect();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LazyEditorRoot, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "17.3.12", type: LazyEditorRoot, isStandalone: true, selector: "div[bf-node-type=\"root\"][lazy-load=\"true\"]", inputs: { config: "config" }, host: { properties: { "attr.tabindex": "0" } }, usesInheritance: true, ngImport: i0, template: `
    @if (controller) {
      @for (model of controller.rootModel; track model.flavour + '-' + model.id + '-' + model.meta.createdTime) {
        <div bf-block-wrap contenteditable="false" [controller]="controller" [model]="model"></div>
      }
    }
  `, isInline: true, dependencies: [{ kind: "component", type: BlockWrap, selector: "div[bf-block-wrap]", inputs: ["controller", "model"] }] }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LazyEditorRoot, decorators: [{
            type: Component,
            args: [{
                    selector: 'div[bf-node-type="root"][lazy-load="true"]',
                    template: `
    @if (controller) {
      @for (model of controller.rootModel; track model.flavour + '-' + model.id + '-' + model.meta.createdTime) {
        <div bf-block-wrap contenteditable="false" [controller]="controller" [model]="model"></div>
      }
    }
  `,
                    standalone: true,
                    imports: [
                        NgForOf,
                        NgIf,
                        BlockWrap,
                    ],
                    host: {
                        '[attr.tabindex]': '0'
                    }
                }]
        }], propDecorators: { config: [{
                type: Input,
                args: [{ required: true }]
            }] } });

class BaseStore {
    constructor() {
        this.mapStore = new Map();
    }
    size() {
        return this.mapStore.size;
    }
    keys() {
        return [...this.mapStore.keys()];
    }
    has(key) {
        return this.mapStore.has(key);
    }
    delete(key) {
        return this.mapStore.delete(key);
    }
    values() {
        return [...this.mapStore.values()];
    }
    get(key) {
        return this.mapStore.get(key);
    }
    set(key, value) {
        return this.mapStore.set(key, value);
    }
}

class SchemaStore extends BaseStore {
    constructor(schemaList) {
        super();
        this.isDeltaInsert = (schema, params) => {
            return schema.nodeType === "editable" && params.length > 0 && typeof params[0] === 'object' && 'insert' in params[0];
        };
        this.create = (flavour, params) => {
            const schema = this.get(flavour);
            if (!schema)
                throw new Error(`schema ${flavour} not found`);
            // console.log('create', schema.flavour, params)
            const createBefore = schema.onCreate?.(...(params || []));
            let children;
            if (createBefore?.children) {
                if (this.isDeltaInsert(schema, createBefore.children)) {
                    children = createBefore.children;
                }
                else {
                    children = createBefore.children.map((c) => this.create(c.flavour, ...(c.params || [])));
                }
            }
            else {
                if (schema.nodeType === 'editable') {
                    children = params?.[0] || [];
                }
                else {
                    children = schema.children?.map(c => this.create(c));
                }
            }
            let props = createBefore?.props?.() || {};
            if (schema.nodeType === 'editable') {
                props['indent'] ??= params?.[1]?.indent || 0;
                props['textAlign'] = params?.[1]?.['textAlign'] || 'left';
            }
            return {
                id: genUniqueID(),
                flavour: schema.flavour,
                nodeType: schema.nodeType,
                children: children || [],
                props,
                meta: createBefore?.meta?.() || {}
            };
        };
        schemaList.forEach(schema => {
            this.set(schema.flavour, schema);
        });
    }
}

var BlockType;
(function (BlockType) {
    BlockType["paragraph"] = "paragraph";
    BlockType["heading-one"] = "heading-one";
    BlockType["heading-two"] = "heading-two";
    BlockType["heading-three"] = "heading-three";
    BlockType["heading-four"] = "heading-four";
    BlockType["bullet-list"] = "bullet-list";
    BlockType["ordered-list"] = "ordered-list";
    BlockType["image"] = "image";
    BlockType["code"] = "code";
    BlockType[""] = "";
})(BlockType || (BlockType = {}));
const AttrMap = {
    color: 's:c',
    background: 's:bc',
    bold: 'a:bold',
    italic: 'a:italic',
    underline: 'a:underline',
    strike: 'a:strike',
};
const htmlTagFilterRegex = /<\/?[^>]+(>|$)/;
class HtmlConverter {
    constructor(schemaStore) {
        this.schemaStore = schemaStore;
        // @ts-ignore
        this.htmlToDelta = new HtmlToDelta();
    }
    convertToDeltas(html) {
        const delta = this.htmlToDelta.convert(html);
        const deltas = [];
        delta.ops.forEach((op) => {
            if (op.insert === '\n') {
                const item = deltas[deltas.length - 1];
                if (op.attributes?.['code-block']) {
                    item.attributes ||= {};
                    item.attributes['a:code'] = true;
                    return;
                }
            }
            if (op.attributes?.['link']) {
                deltas.push({
                    // @ts-ignore
                    insert: { 'link': op.insert },
                    // @ts-ignore
                    attributes: { 'd:href': op.attributes['link'] }
                });
                return;
            }
            if (typeof op.insert === 'object') {
                if (op.insert['image']) {
                    deltas.push({
                        // @ts-ignore
                        insert: { image: op.insert['image'] },
                    });
                    return;
                }
            }
            const delta = {
                insert: op.insert,
            };
            const attrs = this.convertAttrs(op.attributes);
            attrs && (delta.attributes = attrs);
            deltas.push(delta);
        });
        return deltas;
    }
    convertToBlocks(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        console.log(div);
        const delta = this.htmlToDelta.convert(html);
        console.log('parse deltas', delta);
        const models = [];
        const splitDelta = [{ delta: [], type: '' }];
        delta.ops.forEach((op) => {
            const item = splitDelta[splitDelta.length - 1];
            if (op.insert === '\n') {
                if (op.attributes?.['code-block']) {
                    const last = item.delta[item.delta.length - 1];
                    if (typeof last.insert !== 'string')
                        return;
                    // code block
                    if (htmlTagFilterRegex.test(last.insert) && /<br>/.test(last.insert) && this.schemaStore.has('image')) {
                        const p = document.createElement('p');
                        p.innerHTML = last.insert;
                        p.querySelectorAll('br').forEach(v => {
                            v.replaceWith('\n');
                        });
                        last.insert = p.textContent;
                        item.type = 'code';
                        return;
                    }
                    // inline code
                    item.delta[item.delta.length - 1].attributes ||= {};
                    item.delta[item.delta.length - 1].attributes['a:code'] = true;
                    item.delta[item.delta.length - 1].insert = item.delta[item.delta.length - 1].insert.replace(/<\/?[^>]+(>|$)/g, '');
                    // item.type = 'paragraph'
                    return;
                }
                if (op.attributes && !item.type) {
                    item.type = this.attr2Type(op.attributes) || 'paragraph';
                }
                splitDelta.push({ delta: [], type: '' });
            }
            if (typeof op.insert === 'object') {
                if (op.insert['image']) {
                    item.delta.push(op);
                    item.type = 'image';
                }
                splitDelta.push({ delta: [], type: '' });
                return;
            }
            if (op.attributes?.['link']) {
                item.delta.push({
                    // @ts-ignore
                    insert: { 'link': op.insert },
                    // @ts-ignore
                    attributes: { 'd:href': op.attributes['link'] }
                });
                return;
            }
            const delta = {
                insert: op.insert,
            };
            const attrs = this.convertAttrs(op.attributes);
            attrs && (delta.attributes = attrs);
            item.delta.push(delta);
        });
        // console.log(splitDelta)
        splitDelta.filter(v => v.type).forEach((item) => {
            if (item.type === 'image') {
                const delta = item.delta[0];
                // @ts-ignore
                models.push(this.schemaStore.create('image', [delta.insert['image'], delta.attributes?.['width']]));
                return;
            }
            models.push(this.schemaStore.create(item.type, [item.delta]));
        });
        console.log('parse as blocks', models);
        return models;
    }
    attr2Type(attributes) {
        if (attributes['header']) {
            return ['heading-one', 'heading-two', 'heading-three', 'heading-four'][attributes['header']];
        }
        if (attributes['list']) {
            return attributes['list'] + '-list';
        }
        return 'paragraph';
    }
    convertAttrs(attrs) {
        if (!attrs)
            return undefined;
        for (const key in attrs) {
            // @ts-ignore
            if (AttrMap[key]) {
                // @ts-ignore
                attrs[AttrMap[key]] = attrs[key];
                delete attrs[key];
            }
            else {
                delete attrs[key];
            }
        }
        return attrs;
    }
    convertWordDoc(html) {
    }
}

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
class Controller {
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
class BlockFlowSelection {
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

var BlockFlavour;
(function (BlockFlavour) {
    BlockFlavour["paragraph"] = "paragraph";
    BlockFlavour["heading-one"] = "heading-one";
    BlockFlavour["heading-two"] = "heading-two";
    BlockFlavour["heading-three"] = "heading-three";
    BlockFlavour["heading-four"] = "heading-four";
    BlockFlavour["bullet-list"] = "bullet-list";
    BlockFlavour["callout"] = "callout";
    BlockFlavour["divider"] = "divider";
    BlockFlavour["image"] = "image";
    BlockFlavour["ordered-list"] = "ordered-list";
    BlockFlavour["todo-list"] = "todo-list";
    BlockFlavour["code-block"] = "code-block";
})(BlockFlavour || (BlockFlavour = {}));

class BlockFlowEditor {
    set globalConfig(config) {
        this._globalConfig = config;
        !this.controller && this.createController(this.globalConfig);
    }
    get globalConfig() {
        return this._globalConfig;
    }
    get controller() {
        return this._controller;
    }
    constructor(injector) {
        this.injector = injector;
        this.onReady = new EventEmitter();
        this.mouseDownEventPhase = -1;
    }
    ngAfterViewInit() {
        !this.controller && this.createController(this.globalConfig);
    }
    createController(config) {
        if (!config || !this.root)
            return;
        this._globalConfig = config;
        this._controller = new Controller(config, this.injector);
        this._controller.attach(this.root).then(() => {
            this.onReady.emit(this._controller);
        });
    }
    onMouseDown(event) {
        this.mouseDownEventPhase = event.eventPhase;
    }
    onMouseUp(event) {
        if (this.mouseDownEventPhase !== event.eventPhase)
            return;
        this.mouseDownEventPhase = -1;
        if (this.controller.readonly$.value || this.controller.root.selectedBlockRange)
            return;
        const lastBm = this.controller.rootModel.at(-1);
        if (lastBm && lastBm.nodeType === 'editable' && !['code', 'mermaid', 'callout', 'blockquote'].includes(lastBm.flavour)) {
            this.controller.selection.setSelection(lastBm.id, 'end');
            return;
        }
        const p = this.controller.createBlock('paragraph');
        this.controller.insertBlocks(this.controller.rootModel.length, [p]).then(() => {
            this.controller.selection.setSelection(p.id, 'start');
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockFlowEditor, deps: [{ token: i0.Injector }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "17.3.12", type: BlockFlowEditor, isStandalone: true, selector: "bf-editor", inputs: { globalConfig: ["config", "globalConfig"] }, outputs: { onReady: "onReady" }, viewQueries: [{ propertyName: "root", first: true, predicate: ["root"], descendants: true }], ngImport: i0, template: `
    @if (!globalConfig.lazyload) {
      <div bf-node-type="root" lazy-load="false" #root></div>
    } @else {
      <div bf-node-type="root" lazy-load="true" [config]="globalConfig.lazyload!" #root></div>
    }
    <div class="expand" (mousedown)="onMouseDown($event)" (mouseup)="onMouseUp($event)"></div>
  `, isInline: true, styles: [":host{display:flex;flex-direction:column;height:100%}:host>.expand{flex:1;min-height:60px}\n"], dependencies: [{ kind: "component", type: EditorRoot, selector: "div[bf-node-type=\"root\"][lazy-load=\"false\"]", outputs: ["onDestroy"] }, { kind: "component", type: LazyEditorRoot, selector: "div[bf-node-type=\"root\"][lazy-load=\"true\"]", inputs: ["config"] }] }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockFlowEditor, decorators: [{
            type: Component,
            args: [{ selector: 'bf-editor', standalone: true, template: `
    @if (!globalConfig.lazyload) {
      <div bf-node-type="root" lazy-load="false" #root></div>
    } @else {
      <div bf-node-type="root" lazy-load="true" [config]="globalConfig.lazyload!" #root></div>
    }
    <div class="expand" (mousedown)="onMouseDown($event)" (mouseup)="onMouseUp($event)"></div>
  `, imports: [
                        NgIf,
                        NgForOf,
                        EditorRoot,
                        LazyEditorRoot,
                        NgSwitch,
                    ], styles: [":host{display:flex;flex-direction:column;height:100%}:host>.expand{flex:1;min-height:60px}\n"] }]
        }], ctorParameters: () => [{ type: i0.Injector }], propDecorators: { globalConfig: [{
                type: Input,
                args: [{ required: true, alias: 'config' }]
            }], onReady: [{
                type: Output
            }], root: [{
                type: ViewChild,
                args: ['root']
            }] } });

class BlockFlowContextmenu {
    set activeBlock(val) {
        if (!val)
            return;
        this._activeBlock = val;
        this.hasContent = val instanceof EditableBlock && val.flavour === 'paragraph' ? !!val.textLength : true;
    }
    get activeBlock() {
        return this._activeBlock;
    }
    set controller(val) {
        if (!val)
            throw new Error('Controller is required');
        this._controller = val;
        const schemas = val.schemas.values().filter(schema => !schema.isLeaf);
        this.baseBlockList = schemas.filter(schema => schema.nodeType === 'editable');
        this.commonBlockList = schemas.filter(schema => schema.nodeType !== 'editable');
    }
    get controller() {
        return this._controller;
    }
    constructor(cdr, vcr, overlay) {
        this.cdr = cdr;
        this.vcr = vcr;
        this.overlay = overlay;
        this.itemClick = new EventEmitter();
        this.destroy = new EventEmitter();
        this.baseBlockList = [];
        this.commonBlockList = [];
        this.toolList = [
            {
                flavour: 'cut',
                icon: 'bf_icon bf_jianqie',
                label: '剪切',
            },
            {
                flavour: 'copy',
                icon: 'bf_icon bf_fuzhi',
                label: '复制',
            },
            {
                flavour: 'delete',
                icon: 'bf_icon bf_shanchu-2',
                label: '删除',
            }
        ];
        this.hasContent = false;
    }
    onClick(event) {
        event.stopPropagation();
        event.preventDefault();
    }
    onMouseDown(event, item, type) {
        if (type === 'block' && this.activeBlock.nodeType === "editable" && this.activeBlock.flavour === item.flavour)
            return;
        this.onItemClicked({ item, type });
        this.itemClick.emit({ item, type });
    }
    onItemClicked(value) {
        const { item, type } = value;
        const selection = this.controller.selection.getSelection();
        if (type === 'tool') {
            switch (item.flavour) {
                case 'cut':
                case 'copy':
                    if (selection?.isAtRoot && selection.rootRange) {
                        this.controller.clipboard.execCommand(item.flavour);
                    }
                    else {
                        this.controller.clipboard.writeData([
                            { type: 'block', data: [this.activeBlock.model.toJSON()] }
                        ]);
                    }
                    return;
                case 'delete':
                    if (this.controller.root.selectedBlockRange)
                        this.controller.deleteSelectedBlocks();
                    else
                        this.controller.deleteBlockById(this.activeBlock.id);
                    return;
            }
            return;
        }
        const schema = item;
        if (schema.nodeType === 'editable' && selection?.isAtRoot && selection.rootRange) {
            const selectedBlockModels = this.controller.rootModel.slice(selection.rootRange.start, selection.rootRange.end);
            if (selectedBlockModels.find(v => v.id === this.activeBlock.id)) {
                const modelsArr = selectedBlockModels.map((v, i) => {
                    if (v.flavour === schema.flavour || v.nodeType !== 'editable')
                        return -1;
                    return selection.rootRange.start + i;
                }).filter(v => v >= 0);
                if (modelsArr.length > 1) {
                    const splitModelsArr = modelsArr.reduce((acc, cur, i) => {
                        if (cur - acc[acc.length - 1][1] > 1) {
                            acc.push([cur, cur]);
                        }
                        else {
                            acc[acc.length - 1][1] = cur;
                        }
                        return acc;
                    }, [[modelsArr[0], modelsArr[0]]]);
                    this.controller.transact(() => {
                        splitModelsArr.forEach(([start, end]) => {
                            const newBlocks = [];
                            for (let i = start; i <= end; i++) {
                                const block = this.controller.rootModel[i];
                                newBlocks.push(this.controller.createBlock(schema.flavour, [JSON.parse(JSON.stringify(block.children)), block.props]));
                            }
                            this.controller.replaceBlocks(start, newBlocks.length, newBlocks).then(() => {
                                this.controller.selection.applyRange(selection);
                            });
                        });
                    }, USER_CHANGE_SIGNAL);
                    return;
                }
            }
        }
        if (this.activeBlock instanceof EditableBlock && schema.nodeType === 'editable') {
            const deltas = this.activeBlock.getTextDelta();
            const newBlock = this.controller.createBlock(schema.flavour, [deltas, this.activeBlock.props]);
            this.controller.replaceWith(this.activeBlock.id, [newBlock]).then(() => {
                this.controller.selection.setSelection(newBlock.id, 'start');
            });
            return;
        }
        const position = this.controller.getBlockPosition(this.activeBlock.id);
        if (schema.flavour === 'image') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = false;
            input.click();
            input.onchange = () => {
                const file = input.files[0];
                if (!file)
                    return;
                const fileUploader = this.controller.injector.get(FILE_UPLOADER);
                if (!file)
                    throw new Error('file is required');
                fileUploader.uploadImg(file).then((fileUri) => {
                    const newBlock = this.controller.createBlock(schema.flavour, [fileUri]);
                    this.controller.insertBlocks(position.index + 1, [newBlock], position.parentId).then(() => {
                        newBlock.nodeType === 'editable' && this.controller.selection.setSelection(newBlock.id, 'start');
                    });
                });
            };
            return;
        }
        const newBlock = this.controller.createBlock(schema.flavour);
        if (!this.hasContent)
            this.controller.replaceWith(this.activeBlock.id, [newBlock]).then(() => {
                newBlock.nodeType === 'editable' && this.controller.selection.setSelection(newBlock.id, 'start');
            });
        else
            this.controller.insertBlocks(position.index + 1, [newBlock], position.parentId).then(() => {
                newBlock.nodeType === 'editable' && this.controller.selection.setSelection(newBlock.id, 'start');
            });
    }
    onShowMoreBlock(event) {
        event.preventDefault();
        event.stopPropagation();
        if (this.moreBlockTpr)
            return;
        const target = event.target;
        const positionStrategy = this.overlay.position().flexibleConnectedTo(target)
            .withPositions([
            { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top' },
            { originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'bottom' },
        ]).withPush(true);
        const ovr = this.overlay.create({
            positionStrategy,
            hasBackdrop: false
        });
        this.moreBlockTpr = ovr.attach(new TemplatePortal(this.moreBlockContainer, this.vcr));
        const tprEl = this.moreBlockTpr.rootNodes[0];
        const leaveSub = fromEvent(target, 'mouseleave')
            .subscribe(e => {
            if (tprEl.contains(e.relatedTarget))
                return;
            ovr.dispose();
        });
        const leaveSub2 = fromEvent(tprEl, 'mouseleave')
            .subscribe(e => {
            if (target.contains(e.relatedTarget))
                return;
            ovr.dispose();
        });
        this.moreBlockTpr.onDestroy(() => {
            leaveSub.unsubscribe();
            leaveSub2.unsubscribe();
            this.moreBlockTpr = undefined;
            this.cdr.detectChanges();
        });
    }
    ngOnDestroy() {
        this.destroy.emit(true);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockFlowContextmenu, deps: [{ token: i0.ChangeDetectorRef }, { token: i0.ViewContainerRef }, { token: i1.Overlay }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: BlockFlowContextmenu, isStandalone: true, selector: "div.bf-contextmenu", inputs: { activeBlock: "activeBlock", controller: "controller" }, outputs: { itemClick: "itemClick", destroy: "destroy" }, host: { listeners: { "click": "onClick($event)", "mousedown": "onClick($event)" } }, viewQueries: [{ propertyName: "moreBlockContainer", first: true, predicate: ["moreBlockContainer"], descendants: true }], ngImport: i0, template: `

    <ng-template #icon let-item>
      <i [class]="item.icon"></i>
    </ng-template>

    <ng-template #svgIcon let-item>
      <mat-icon [svgIcon]="item.svgIcon" style="width: 1em; height: 1em"></mat-icon>
    </ng-template>

    <div class="spark-popover__gap"></div>
    <div class="spark-popover__container">
      <ng-container *ngIf="activeBlock.nodeType === 'editable'">
        <h4 class="title">基础</h4>
        <ul class='base-list'>
          <li class="base-list__item" *ngFor="let item of baseBlockList" [title]="item.description || item.label"
              (mousedown)="onMouseDown($event, item, 'block')" [class.active]="activeBlock.flavour === item.flavour">
            <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
            </ng-container>
          </li>
        </ul>
        <div class="line"></div>
      </ng-container>

      <ng-container *ngIf="hasContent">
        <ul class="common-list">
          <li class="common-list__item" *ngFor="let item of toolList"
              (mousedown)="onMouseDown($event, item, 'tool')">
            <i [class]="item.icon"></i>
            <span>{{ item.label }}</span>
          </li>
        </ul>
        <div class="line"></div>
      </ng-container>

      <ng-container *ngIf="!hasContent else appendAfter">
        <ng-container *ngTemplateOutlet="moreBlockList"></ng-container>
      </ng-container>

      <ng-template #appendAfter>
        <ul class='common-list'>
          <li class="common-list__item add-block-btn" (mouseenter)="onShowMoreBlock($event)"
              [class.active]="moreBlockTpr">
            <i class="bf_icon bf_tianjia"></i>
            <span>在下方添加</span>
            <i class="bf_icon bf_youjiantou"></i>
          </li>
        </ul>
      </ng-template>
    </div>

    <ng-template #moreBlockContainer>
      <div class="spark-popover__container spark-popover__more-block" style="max-height: 500px; overflow-y: auto;">
        <ng-container *ngTemplateOutlet="moreBlockList"></ng-container>
      </div>
    </ng-template>

    <ng-template #moreBlockList>
      <h4 class="title" *ngIf="commonBlockList.length">常用</h4>
      <ul class='common-list'>
        <ng-container *ngIf="activeBlock.nodeType !== 'editable'">
          <li class="common-list__item" *ngFor="let item of baseBlockList" [title]="item.description || item.label"
              (mousedown)="onMouseDown($event, item, 'block')">
            <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
            </ng-container>
            <span>{{ item.label }}</span>
          </li>
        </ng-container>

        <li class="common-list__item" *ngFor="let item of commonBlockList" [title]="item.description || item.label"
            (mousedown)="onMouseDown($event, item, 'block')">
          <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
          </ng-container>
          <span>{{ item.label }}</span>
        </li>
      </ul>
    </ng-template>

    <div class="spark-popover__gap"></div>
  `, isInline: true, styles: [":host{display:block}::ng-deep mat-icon{width:1em;height:1em;font-size:1em}::ng-deep mat-icon>svg{vertical-align:top}.spark-popover__gap{height:8px}.spark-popover__container{padding:8px 0;width:224px;background:#fff;border-radius:4px;border:1px solid #E6E6E6;box-shadow:0 0 20px #0000001a}.title{margin:8px 16px 0;color:#999;font-size:14px;font-weight:600;line-height:140%}.line{height:1px;background:#f3f3f3;width:100%}.base-list,.common-list{margin:0}.base-list{display:flex;flex-wrap:wrap;padding:8px 12px;gap:8px}.base-list__item{width:24px;height:24px;border-radius:4px;display:flex;justify-content:center;align-items:center;cursor:pointer}.base-list__item:hover,.base-list__item.active{background:#f3f3f3}.base-list__item>i{font-size:16px}.common-list{padding:8px}.common-list__item{display:flex;align-items:center;gap:8px;height:36px;padding:0 8px;border-radius:4px;cursor:pointer}.common-list__item:hover,.common-list__item.active{background-color:#f5f5f5}.common-list__item>i{font-size:14px}.common-list__item>span{color:#333;font-size:14px;line-height:20px;flex:1}.add-block-btn{position:relative}\n"], dependencies: [{ kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }, { kind: "directive", type: NgIf, selector: "[ngIf]", inputs: ["ngIf", "ngIfThen", "ngIfElse"] }, { kind: "directive", type: NgTemplateOutlet, selector: "[ngTemplateOutlet]", inputs: ["ngTemplateOutletContext", "ngTemplateOutlet", "ngTemplateOutletInjector"] }, { kind: "ngmodule", type: MatIconModule }, { kind: "component", type: i2$1.MatIcon, selector: "mat-icon", inputs: ["color", "inline", "svgIcon", "fontSet", "fontIcon"], exportAs: ["matIcon"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockFlowContextmenu, decorators: [{
            type: Component,
            args: [{ selector: 'div.bf-contextmenu', standalone: true, template: `

    <ng-template #icon let-item>
      <i [class]="item.icon"></i>
    </ng-template>

    <ng-template #svgIcon let-item>
      <mat-icon [svgIcon]="item.svgIcon" style="width: 1em; height: 1em"></mat-icon>
    </ng-template>

    <div class="spark-popover__gap"></div>
    <div class="spark-popover__container">
      <ng-container *ngIf="activeBlock.nodeType === 'editable'">
        <h4 class="title">基础</h4>
        <ul class='base-list'>
          <li class="base-list__item" *ngFor="let item of baseBlockList" [title]="item.description || item.label"
              (mousedown)="onMouseDown($event, item, 'block')" [class.active]="activeBlock.flavour === item.flavour">
            <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
            </ng-container>
          </li>
        </ul>
        <div class="line"></div>
      </ng-container>

      <ng-container *ngIf="hasContent">
        <ul class="common-list">
          <li class="common-list__item" *ngFor="let item of toolList"
              (mousedown)="onMouseDown($event, item, 'tool')">
            <i [class]="item.icon"></i>
            <span>{{ item.label }}</span>
          </li>
        </ul>
        <div class="line"></div>
      </ng-container>

      <ng-container *ngIf="!hasContent else appendAfter">
        <ng-container *ngTemplateOutlet="moreBlockList"></ng-container>
      </ng-container>

      <ng-template #appendAfter>
        <ul class='common-list'>
          <li class="common-list__item add-block-btn" (mouseenter)="onShowMoreBlock($event)"
              [class.active]="moreBlockTpr">
            <i class="bf_icon bf_tianjia"></i>
            <span>在下方添加</span>
            <i class="bf_icon bf_youjiantou"></i>
          </li>
        </ul>
      </ng-template>
    </div>

    <ng-template #moreBlockContainer>
      <div class="spark-popover__container spark-popover__more-block" style="max-height: 500px; overflow-y: auto;">
        <ng-container *ngTemplateOutlet="moreBlockList"></ng-container>
      </div>
    </ng-template>

    <ng-template #moreBlockList>
      <h4 class="title" *ngIf="commonBlockList.length">常用</h4>
      <ul class='common-list'>
        <ng-container *ngIf="activeBlock.nodeType !== 'editable'">
          <li class="common-list__item" *ngFor="let item of baseBlockList" [title]="item.description || item.label"
              (mousedown)="onMouseDown($event, item, 'block')">
            <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
            </ng-container>
            <span>{{ item.label }}</span>
          </li>
        </ng-container>

        <li class="common-list__item" *ngFor="let item of commonBlockList" [title]="item.description || item.label"
            (mousedown)="onMouseDown($event, item, 'block')">
          <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
          </ng-container>
          <span>{{ item.label }}</span>
        </li>
      </ul>
    </ng-template>

    <div class="spark-popover__gap"></div>
  `, imports: [NgForOf, NgIf, NgTemplateOutlet, MatIconModule], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{display:block}::ng-deep mat-icon{width:1em;height:1em;font-size:1em}::ng-deep mat-icon>svg{vertical-align:top}.spark-popover__gap{height:8px}.spark-popover__container{padding:8px 0;width:224px;background:#fff;border-radius:4px;border:1px solid #E6E6E6;box-shadow:0 0 20px #0000001a}.title{margin:8px 16px 0;color:#999;font-size:14px;font-weight:600;line-height:140%}.line{height:1px;background:#f3f3f3;width:100%}.base-list,.common-list{margin:0}.base-list{display:flex;flex-wrap:wrap;padding:8px 12px;gap:8px}.base-list__item{width:24px;height:24px;border-radius:4px;display:flex;justify-content:center;align-items:center;cursor:pointer}.base-list__item:hover,.base-list__item.active{background:#f3f3f3}.base-list__item>i{font-size:16px}.common-list{padding:8px}.common-list__item{display:flex;align-items:center;gap:8px;height:36px;padding:0 8px;border-radius:4px;cursor:pointer}.common-list__item:hover,.common-list__item.active{background-color:#f5f5f5}.common-list__item>i{font-size:14px}.common-list__item>span{color:#333;font-size:14px;line-height:20px;flex:1}.add-block-btn{position:relative}\n"] }]
        }], ctorParameters: () => [{ type: i0.ChangeDetectorRef }, { type: i0.ViewContainerRef }, { type: i1.Overlay }], propDecorators: { activeBlock: [{
                type: Input,
                args: [{ required: true }]
            }], controller: [{
                type: Input,
                args: [{ required: true }]
            }], itemClick: [{
                type: Output
            }], destroy: [{
                type: Output
            }], moreBlockContainer: [{
                type: ViewChild,
                args: ['moreBlockContainer']
            }], onClick: [{
                type: HostListener,
                args: ['click', ['$event']]
            }, {
                type: HostListener,
                args: ['mousedown', ['$event']]
            }] } });

class BlockflowBinding {
    get yDoc() {
        return this.controller.yDoc;
    }
    constructor(controller, config) {
        this.controller = controller;
        this.config = config;
        this.provider = new WebsocketProvider(this.config.serverUrl, this.config.roomName || this.controller.rootId, this.controller.yDoc, {
            connect: false,
        });
        this.statesMap = new Map();
        this.userStateUpdated$ = new Subject();
        this.awareness = this.provider.awareness;
        this.onAwarenessChange = (t) => {
            const { added, updated, removed } = t;
            if (added.length) {
                const states = this.awareness.getStates();
                if (!this.statesMap.size) {
                    this.statesMap = new Map(states);
                    this.userStateUpdated$.next({
                        user: this.getCurrentUsers(),
                        type: 'added'
                    });
                }
                else {
                    for (const id of added) {
                        const state = states.get(id);
                        this.statesMap.set(id, state);
                    }
                    this.userStateUpdated$.next({
                        user: added.map((id) => ({ user: this.statesMap.get(id)?.['user'] })),
                        type: 'added'
                    });
                }
            }
            if (removed.length) {
                this.userStateUpdated$.next({
                    type: 'removed',
                    user: removed.map((id) => ({ user: this.statesMap.get(id)?.['user'] }))
                });
                for (const id of removed) {
                    this.statesMap.delete(id);
                }
            }
        };
        this.awareness.setLocalStateField('user', this.controller.config.localUser);
        // fromEvent(document, 'selectionchange').subscribe(e => {
        //   const sel = this.controller.getSelection()
        //   this.awareness.setLocalStateField('selection', sel)
        // })
    }
    // updateCursor(ytext: Y.Text, pos: ICharacterRange) {
    //     const relPos = Y.createRelativePositionFromTypeIndex(ytext, pos.start, pos.end - pos.start)
    //     const parsedRelPos = JSON.parse(JSON.stringify(relPos))
    //     const absPos = Y.createAbsolutePositionFromRelativePosition(relPos, this.yDoc)
    //     console.log('updateCursor', parsedRelPos, absPos)
    //     this.awareness.setLocalStateField('cursor', {
    //         anchor: {
    //             id: (ytext.parent as Y.Map<any>).get('id'),
    //             ...pos
    //         },
    //     })
    // }
    connect() {
        this.provider.connect();
        this.awareness.on('change', this.onAwarenessChange);
        this.controller.root.onDestroy.pipe(first()).subscribe(() => {
            this.destroy();
        });
    }
    getCurrentUsers() {
        return Array.from(this.statesMap).map(v => v[1]['user']);
    }
    disconnect(origin = null) {
        this.awareness.off('change', this.onAwarenessChange);
        removeAwarenessStates(this.awareness, [this.yDoc.clientID], origin);
        this.provider.disconnect();
    }
    destroy() {
        this.disconnect();
        this.provider.destroy();
    }
}

const POSITIONS = [
    { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top' },
    { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom' }
];
class FloatTextToolbar {
    constructor(elementRef, overlay, vcr, cdRef, destroyRef) {
        this.elementRef = elementRef;
        this.overlay = overlay;
        this.vcr = vcr;
        this.cdRef = cdRef;
        this.destroyRef = destroyRef;
        this.toolbarMenuList = [];
        this.style = '';
        this.itemClick = new EventEmitter();
        this.prevOverItem = '';
    }
    onMousedown(e, item) {
        e.stopPropagation();
        e.preventDefault();
        if (!item)
            return;
        this.itemClick.emit(item);
    }
    onMouseEnter(e, item) {
        e.stopPropagation();
        if (this.prevOverItem !== item.name && this.embedViewRef) {
            this.embedViewRef.destroy();
        }
        this.prevOverItem = item.name;
        if (!item.children)
            return;
        const dom = this.elementRef.nativeElement.querySelector(`[data-name="${item.name}"]`);
        this.embedViewRef = this.vcr.createEmbeddedView(this.childrenTpl, { children: item.children, style: 'left: 0; top: 24px' });
        dom.appendChild(this.embedViewRef?.rootNodes[0]);
    }
    onMark(e) {
        e.preventDefault();
        e.stopPropagation();
        this.itemClick.emit({
            name: 'bc',
            value: this.markMenu.activeBgColor
        });
    }
    onMarkMouseEnter(e) {
        const target = e.target;
        this.showColorPicker(target);
    }
    showColorPicker(target) {
        if (this._colorPickerCpr)
            return;
        const positionStrategy = this.overlay.position().flexibleConnectedTo(target).withPositions(POSITIONS);
        const portal = new ComponentPortal(ColorPalette);
        const ovr = this.overlay.create({
            positionStrategy,
            // hasBackdrop: true,
            // backdropClass: 'cdk-overlay-transparent-backdrop',
        });
        this._colorPickerCpr = ovr.attach(portal);
        this._colorPickerCpr.setInput('activeColor', this.markMenu.activeColor);
        this._colorPickerCpr.setInput('activeBgColor', this.markMenu.activeBgColor);
        const cprNode = this._colorPickerCpr.location.nativeElement;
        const ovrDispose = this.destroyRef.onDestroy(() => {
            ovr.dispose();
            ovrDispose();
        });
        fromEvent(target, 'mouseleave').pipe(takeUntil(this._colorPickerCpr.instance.close)).subscribe(e => {
            if (cprNode.contains(e.relatedTarget))
                return;
            ovr.dispose();
            ovrDispose();
            this._colorPickerCpr = null;
        });
        fromEvent(cprNode, 'mouseleave').pipe(takeUntil(this._colorPickerCpr.instance.close)).subscribe(e => {
            if (target.contains(e.relatedTarget))
                return;
            ovr.dispose();
            ovrDispose();
            this._colorPickerCpr = null;
        });
        this._colorPickerCpr.instance.colorChange.pipe(takeUntil(this._colorPickerCpr.instance.close)).subscribe((res) => {
            if (res.type === 'c') {
                this.markMenu.activeColor = res.value;
            }
            if (res.type === 'bc') {
                this.markMenu.activeBgColor = res.value;
            }
            this.cdRef.detectChanges();
            this.itemClick.emit({
                name: res.type,
                value: res.value
            });
        });
    }
    onMouseLeave(e, item) {
        e.stopPropagation();
        this.prevOverItem = '';
        this.embedViewRef && this.embedViewRef.destroy();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: FloatTextToolbar, deps: [{ token: i0.ElementRef }, { token: i1.Overlay }, { token: i0.ViewContainerRef }, { token: i0.ChangeDetectorRef }, { token: i0.DestroyRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: FloatTextToolbar, isStandalone: true, selector: "bf-float-text-toolbar", inputs: { markMenu: "markMenu", activeMenuSet: "activeMenuSet", toolbarMenuList: "toolbarMenuList", style: "style" }, outputs: { itemClick: "itemClick" }, host: { listeners: { "mousedown": "onMousedown($event)" }, properties: { "style": "this.style" } }, viewQueries: [{ propertyName: "childrenTpl", first: true, predicate: ["childrenTpl"], descendants: true, read: TemplateRef }, { propertyName: "markTpl", first: true, predicate: ["markTpl"], descendants: true, read: TemplateRef }, { propertyName: "container", first: true, predicate: ["container"], descendants: true, read: ViewContainerRef }], ngImport: i0, template: "<div class=\"bf-float-toolbar__container\" #container>\n  <ng-container *ngFor=\"let menu of toolbarMenuList; index as idx\">\n      <div class=\"bf-float-toolbar__item\" [attr.data-name]=\"menu.name\" [style.order]=\"menu.order\"\n           [title]=\"menu.intro\" (mousedown)=\"onMousedown($event, menu)\"\n           [class.active]=\"activeMenuSet?.has(menu.name)\" [class.divide]=\"menu.divide\"\n           (mouseenter)=\"onMouseEnter($event, menu)\"\n           (mouseleave)=\"onMouseLeave($event, menu)\">\n        <i [class]=\"['bf_icon', menu.icon]\"></i>\n        <i class=\"bf_icon bf_xiajaintou dropdown\" *ngIf=\"menu.children\"></i>\n      </div>\n  </ng-container>\n  <div class=\"bf-float-toolbar__item mark\" [style.--color]=\"markMenu.activeColor\" [style.--background]=\"markMenu.activeBgColor \"\n       title=\"\u9AD8\u4EAE\u989C\u8272\" (mousedown)=\"onMark($event)\" style=\"order: 1;\"\n       (mouseenter)=\"onMarkMouseEnter($event)\">\n    <i [class]=\"['bf_icon', markMenu.icon]\"></i>\n    <i class=\"bf_icon bf_xiajaintou dropdown\"></i>\n  </div>\n</div>\n\n<ng-template #childrenTpl let-children=\"children\" let-style=\"style\">\n  <div class=\"bf-float-toolbar__children\" [style]=\"style\">\n    <div class=\"bf-float-toolbar__children__gap\"></div>\n    <div class=\"bf-float-toolbar__children__container\">\n      <div class=\"bf-float-toolbar__children__item\" *ngFor=\"let item of children\" [title]=\"item.intro\"\n           (mousedown)=\"onMousedown($event, item)\">\n        <i [class]=\"item.icon\" *ngIf=\"item.icon\"></i>\n        <span *ngIf=\"item.label\">{{ item.label }}</span>\n      </div>\n    </div>\n    <div class=\"bf-float-toolbar__children__gap\"></div>\n  </div>\n</ng-template>\n\n", styles: [":host{z-index:100;display:block;position:absolute}:host .bf-float-toolbar__item.divide{margin-left:8px;position:relative}:host .bf-float-toolbar__item.divide:after{content:\"\";position:absolute;top:-4px;left:-8px;height:32px;width:1px;background:#e6e6e6}:host .bf-float-toolbar__item.mark{background-color:var(--background);border-radius:4px}:host .bf-float-toolbar__item.mark:hover{background:#f5f5f5}:host .bf-float-toolbar__item.mark>i:first-child{color:var(--color)}:host .bf-float-toolbar__children{position:absolute;animation:bf_expand .15s ease-in-out}:host .bf-float-toolbar__children__gap{height:8px;background:transparent}:host .bf-float-toolbar__children__container{border-radius:4px;background:#fff;padding:2px;box-shadow:0 0 20px #0000001a;color:#666}@keyframes bf_expand{0%{max-height:0}to{max-height:120px}}:host .bf-float-toolbar__children__item{white-space:nowrap;display:flex;gap:4px;padding:0 8px;height:24px;border-radius:4px;cursor:pointer}:host .bf-float-toolbar__children__item>span{font-size:14px}:host .bf-float-toolbar__children__item:hover{background:#f5f5f5}\n"], dependencies: [{ kind: "ngmodule", type: CommonModule }, { kind: "directive", type: i2$2.NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }, { kind: "directive", type: i2$2.NgIf, selector: "[ngIf]", inputs: ["ngIf", "ngIfThen", "ngIfElse"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: FloatTextToolbar, decorators: [{
            type: Component,
            args: [{ selector: 'bf-float-text-toolbar', standalone: true, imports: [CommonModule], changeDetection: ChangeDetectionStrategy.OnPush, template: "<div class=\"bf-float-toolbar__container\" #container>\n  <ng-container *ngFor=\"let menu of toolbarMenuList; index as idx\">\n      <div class=\"bf-float-toolbar__item\" [attr.data-name]=\"menu.name\" [style.order]=\"menu.order\"\n           [title]=\"menu.intro\" (mousedown)=\"onMousedown($event, menu)\"\n           [class.active]=\"activeMenuSet?.has(menu.name)\" [class.divide]=\"menu.divide\"\n           (mouseenter)=\"onMouseEnter($event, menu)\"\n           (mouseleave)=\"onMouseLeave($event, menu)\">\n        <i [class]=\"['bf_icon', menu.icon]\"></i>\n        <i class=\"bf_icon bf_xiajaintou dropdown\" *ngIf=\"menu.children\"></i>\n      </div>\n  </ng-container>\n  <div class=\"bf-float-toolbar__item mark\" [style.--color]=\"markMenu.activeColor\" [style.--background]=\"markMenu.activeBgColor \"\n       title=\"\u9AD8\u4EAE\u989C\u8272\" (mousedown)=\"onMark($event)\" style=\"order: 1;\"\n       (mouseenter)=\"onMarkMouseEnter($event)\">\n    <i [class]=\"['bf_icon', markMenu.icon]\"></i>\n    <i class=\"bf_icon bf_xiajaintou dropdown\"></i>\n  </div>\n</div>\n\n<ng-template #childrenTpl let-children=\"children\" let-style=\"style\">\n  <div class=\"bf-float-toolbar__children\" [style]=\"style\">\n    <div class=\"bf-float-toolbar__children__gap\"></div>\n    <div class=\"bf-float-toolbar__children__container\">\n      <div class=\"bf-float-toolbar__children__item\" *ngFor=\"let item of children\" [title]=\"item.intro\"\n           (mousedown)=\"onMousedown($event, item)\">\n        <i [class]=\"item.icon\" *ngIf=\"item.icon\"></i>\n        <span *ngIf=\"item.label\">{{ item.label }}</span>\n      </div>\n    </div>\n    <div class=\"bf-float-toolbar__children__gap\"></div>\n  </div>\n</ng-template>\n\n", styles: [":host{z-index:100;display:block;position:absolute}:host .bf-float-toolbar__item.divide{margin-left:8px;position:relative}:host .bf-float-toolbar__item.divide:after{content:\"\";position:absolute;top:-4px;left:-8px;height:32px;width:1px;background:#e6e6e6}:host .bf-float-toolbar__item.mark{background-color:var(--background);border-radius:4px}:host .bf-float-toolbar__item.mark:hover{background:#f5f5f5}:host .bf-float-toolbar__item.mark>i:first-child{color:var(--color)}:host .bf-float-toolbar__children{position:absolute;animation:bf_expand .15s ease-in-out}:host .bf-float-toolbar__children__gap{height:8px;background:transparent}:host .bf-float-toolbar__children__container{border-radius:4px;background:#fff;padding:2px;box-shadow:0 0 20px #0000001a;color:#666}@keyframes bf_expand{0%{max-height:0}to{max-height:120px}}:host .bf-float-toolbar__children__item{white-space:nowrap;display:flex;gap:4px;padding:0 8px;height:24px;border-radius:4px;cursor:pointer}:host .bf-float-toolbar__children__item>span{font-size:14px}:host .bf-float-toolbar__children__item:hover{background:#f5f5f5}\n"] }]
        }], ctorParameters: () => [{ type: i0.ElementRef }, { type: i1.Overlay }, { type: i0.ViewContainerRef }, { type: i0.ChangeDetectorRef }, { type: i0.DestroyRef }], propDecorators: { markMenu: [{
                type: Input
            }], activeMenuSet: [{
                type: Input
            }], toolbarMenuList: [{
                type: Input
            }], style: [{
                type: HostBinding,
                args: ['style']
            }, {
                type: Input
            }], itemClick: [{
                type: Output,
                args: ['itemClick']
            }], childrenTpl: [{
                type: ViewChild,
                args: ['childrenTpl', { read: TemplateRef }]
            }], markTpl: [{
                type: ViewChild,
                args: ['markTpl', { read: TemplateRef }]
            }], container: [{
                type: ViewChild,
                args: ['container', { read: ViewContainerRef }]
            }], onMousedown: [{
                type: HostListener,
                args: ['mousedown', ['$event']]
            }] } });

class BlockFlowCursor {
    constructor(controller) {
        this.controller = controller;
    }
    static createVirtualRange(id, start, end) {
        const ele = document.getElementById(id);
        if (!ele)
            throw new Error(`Element with id ${id} not found`);
        const wrap = ele.parentElement;
        const cursorEle = document.createElement('span');
        cursorEle.className = 'blockflow-cursor';
        // console.time('createRangeByCharacterRange')
        const _r = createRangeByCharacterRange(ele, start, end);
        // console.timeEnd('createRangeByCharacterRange')
        const _rRects = _r.getClientRects();
        const wrapRect = wrap.getBoundingClientRect();
        for (let i = 0; i < _rRects.length; i++) {
            const rect = _rRects[i];
            if (rect.width <= 0)
                continue;
            rect.width = Math.max(1, rect.width);
            const span = document.createElement('span');
            span.style.cssText = `
        left: ${rect.left - wrapRect.left}px;
        top: ${rect.top - wrapRect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
      `;
            cursorEle.appendChild(span);
        }
        wrap.appendChild(cursorEle);
        return cursorEle;
    }
}

class LinkInputPad {
    constructor(cdr, destroyRef) {
        this.cdr = cdr;
        this.destroyRef = destroyRef;
        this.onCancel = new EventEmitter();
        this.onConfirm = new EventEmitter();
        this.isValid = true;
    }
    onMouseDown($event) {
        if ($event.eventPhase !== 2)
            return;
        $event.preventDefault();
        $event.stopPropagation();
    }
    ngAfterViewInit() {
        this.inputElement.nativeElement.focus();
    }
    onInput($event) {
        this.isValid = isUrl(this.inputElement.nativeElement.value);
        this.cdr.markForCheck();
    }
    submitValue() {
        if (!this.isValid)
            return;
        this.onConfirm.emit(this.inputElement.nativeElement.value);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LinkInputPad, deps: [{ token: i0.ChangeDetectorRef }, { token: i0.DestroyRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: LinkInputPad, isStandalone: true, selector: "link-input-pad", outputs: { onCancel: "onCancel", onConfirm: "onConfirm" }, host: { listeners: { "mousedown": "onMouseDown($event)" } }, viewQueries: [{ propertyName: "inputElement", first: true, predicate: ["inputElement"], descendants: true, read: ElementRef }], ngImport: i0, template: `
    <input type="text" (input)="onInput($event)" [class.error]="!isValid" #inputElement/>
    <div style="display: flex; justify-content: flex-end; gap: 8px; width: 100%;">
      <button nz-button nzType="default" (mousedown)="$event.preventDefault(); onCancel.emit()">取消</button>
      <button nz-button nzType="primary" (mousedown)="$event.preventDefault(); submitValue()">确定</button>
    </div>

  `, isInline: true, styles: [":host{width:400px;display:flex;flex-direction:column;align-items:flex-start;padding:16px;gap:16px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;font-size:14px;color:#333}:host>input{width:100%;margin:0;padding:8px;border-radius:4px;border:1px solid #E6E6E6;outline:none}:host>input:focus{border-color:#4857e2}:host>input.error{border-color:#ff4d4f!important}\n"], dependencies: [{ kind: "component", type: NzButtonComponent, selector: "button[nz-button], a[nz-button]", inputs: ["nzBlock", "nzGhost", "nzSearch", "nzLoading", "nzDanger", "disabled", "tabIndex", "nzType", "nzShape", "nzSize"], exportAs: ["nzButton"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LinkInputPad, decorators: [{
            type: Component,
            args: [{ selector: 'link-input-pad', template: `
    <input type="text" (input)="onInput($event)" [class.error]="!isValid" #inputElement/>
    <div style="display: flex; justify-content: flex-end; gap: 8px; width: 100%;">
      <button nz-button nzType="default" (mousedown)="$event.preventDefault(); onCancel.emit()">取消</button>
      <button nz-button nzType="primary" (mousedown)="$event.preventDefault(); submitValue()">确定</button>
    </div>

  `, standalone: true, imports: [
                        NzButtonComponent
                    ], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{width:400px;display:flex;flex-direction:column;align-items:flex-start;padding:16px;gap:16px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;font-size:14px;color:#333}:host>input{width:100%;margin:0;padding:8px;border-radius:4px;border:1px solid #E6E6E6;outline:none}:host>input:focus{border-color:#4857e2}:host>input.error{border-color:#ff4d4f!important}\n"] }]
        }], ctorParameters: () => [{ type: i0.ChangeDetectorRef }, { type: i0.DestroyRef }], propDecorators: { onCancel: [{
                type: Output
            }], onConfirm: [{
                type: Output
            }], inputElement: [{
                type: ViewChild,
                args: ['inputElement', { read: ElementRef }]
            }], onMouseDown: [{
                type: HostListener,
                args: ['mousedown', ['$event']]
            }] } });

const markMenu = {
    name: "mark",
    icon: "bf_jihaobi",
    intro: "高亮颜色",
    activeColor: null,
    activeBgColor: null,
};
const ALIGN_LIST = {
    name: "align",
    value: "left",
    icon: "bf_suojinheduiqi",
    intro: "文字方向",
    children: [
        {
            name: "align",
            icon: "bf_icon bf_zuoduiqi",
            intro: "左对齐",
            value: "left",
        },
        {
            name: "align",
            value: "center",
            icon: "bf_icon bf_juzhongduiqi",
            intro: "居中",
        },
        {
            name: "align",
            value: "right",
            icon: "bf_icon bf_youduiqi",
            intro: "右对齐",
        }
    ],
    order: 0,
};
const DEFAULT_MENU_LIST = [
    ALIGN_LIST,
    {
        name: "bold",
        icon: "bf_jiacu",
        intro: "加粗",
        value: true,
        order: 1,
        divide: true
    },
    {
        name: "strike",
        icon: "bf_shanchuxian",
        intro: "删除线",
        value: true,
        order: 1
    },
    {
        name: "underline",
        icon: "bf_xiahuaxian",
        intro: "下划线",
        value: true,
        order: 1
    },
    {
        name: "italic",
        icon: "bf_xieti",
        intro: "斜体",
        value: true,
        order: 1
    },
    {
        name: "code",
        icon: "bf_daimakuai",
        intro: "代码",
        value: true,
        order: 1
    },
    {
        name: "sup",
        icon: "bf_shangbiao",
        intro: "上标",
        value: true,
        order: 1
    },
    {
        name: "sub",
        icon: "bf_xiabiao",
        intro: "代码",
        value: true,
        order: 1
    },
    {
        name: "link",
        icon: 'bf_lianjie',
        intro: "链接",
        value: true,
        order: 1
    }
];
class FloatTextToolbarPlugin {
    constructor(expandToolbarList) {
        this.expandToolbarList = expandToolbarList;
        this.name = "float-text-toolbar";
        this.version = 1.0;
        this.expandToolbarMenuList = this.expandToolbarList?.map((item, idx) => {
            return {
                ...item,
                order: (item.order || 2) + idx
            };
        });
    }
    init(controller) {
        this._vcr = controller.injector.get(ViewContainerRef);
        this.controller = controller;
        const isRange = () => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !controller.activeElement || !sel.toString().replace(/[\u200B\t\n\r\u3000]/g, ''))
                return false;
            return sel;
        };
        fromEvent(document, 'selectionchange').pipe(takeUntil(controller.root.onDestroy))
            .subscribe(() => {
            if (controller.readonly$.value || controller.activeElement?.classList.contains('bf-plain-text-only'))
                return;
            this.timer && clearTimeout(this.timer);
            if (!isRange()) {
                this.closeToolbar();
                return;
            }
            this.timer = setTimeout(() => {
                const range = isRange();
                if (!range)
                    return;
                const rect = range.getRangeAt(0).getBoundingClientRect();
                this._cpr ? this.moveToolbar(rect) : this.openToolbar(rect);
            }, 300);
        });
    }
    openToolbar(rect) {
        const activeBlock = this.controller.getBlockRef(this.controller.getFocusingBlockId());
        if (!activeBlock)
            return;
        this._cpr = this._vcr.createComponent(FloatTextToolbar);
        this._cpr.setInput('toolbarMenuList', DEFAULT_MENU_LIST.concat(this.expandToolbarMenuList || []));
        this.moveToolbar(rect, activeBlock);
        this.controller.rootElement.appendChild(this._cpr.location.nativeElement);
        activeBlock.onDestroy.pipe(take(1)).subscribe(() => {
            this.closeToolbar();
        });
        this._cprSub = this._cpr.instance.itemClick.subscribe((item) => {
            const range = this.controller.selection.getCurrentCharacterRange();
            switch (item.name) {
                case 'align':
                    // if (item.value === 'left' && !activeBlock.props['textAlign']) break
                    ALIGN_LIST.value = item.value;
                    this._cpr?.instance.cdRef.detectChanges();
                    activeBlock.props['textAlign'] !== item.value && activeBlock.setProp('textAlign', item.value);
                    requestAnimationFrame(() => {
                        this.moveToolbar();
                    });
                    break;
                case 'italic':
                case 'bold':
                case 'underline':
                case 'strike':
                case 'code':
                case 'sub':
                case 'sup':
                    activeBlock.applyDelta([
                        { retain: range.start },
                        {
                            retain: range.end - range.start,
                            attributes: { [`a:${item.name}`]: this._cpr?.instance.activeMenuSet?.has(item.name) ? null : true }
                        }
                    ]);
                    break;
                case 'c':
                case 'bc':
                    activeBlock.applyDelta([
                        { retain: range.start },
                        { retain: range.end - range.start, attributes: { ['s:' + item.name]: item.value ? `${item.value}` : null } }
                    ]);
                    break;
                case 'link':
                    this.onLink();
                    break;
                default:
                    {
                        // 尝试调用扩展的点击事件
                        const findItem = this.expandToolbarMenuList?.find(item => item.name === item.name);
                        if (findItem.value === item.value)
                            return findItem.click?.(findItem, activeBlock, this.controller);
                        if (!findItem.children)
                            return;
                        const findChild = findItem.children.find(v => v.value === item.value);
                        if (!findChild)
                            return;
                        findChild.click?.(findChild, activeBlock, this.controller);
                    }
                    break;
            }
        });
    }
    moveToolbar(rect = window.getSelection()?.getRangeAt(0)?.getBoundingClientRect(), activeBlock) {
        if (!this._cpr || !rect)
            return;
        activeBlock ||= this.controller.root.activeBlock;
        if (!activeBlock)
            return;
        const range = this.controller.selection.getCurrentCharacterRange();
        const commonAttrs = getCommonAttributesFromDelta(sliceDelta(activeBlock.getTextDelta(), range.start, range.end));
        console.log(commonAttrs);
        const activeFormat = Object.keys(commonAttrs).filter(key => key.startsWith('a:')).map(key => key.slice(2));
        const activeMark = {
            ...markMenu,
            activeColor: commonAttrs['s:c'] ?? null,
            activeBgColor: commonAttrs['s:bc'] ?? null
        };
        this._cpr.setInput('activeMenuSet', new Set(activeFormat));
        this._cpr.setInput('markMenu', activeMark);
        const rootElementRect = this.controller.rootElement.getBoundingClientRect();
        const { top, left, bottom, right, width } = rect;
        const _top = top > window.innerHeight / 2 ? top - rootElementRect.top - 36 : bottom - rootElementRect.top + 4;
        if (left - rootElementRect.left > rootElementRect.width / 2) {
            this._cpr.setInput('style', `top: ${_top}px; left: ${left - rootElementRect.left + width}px; transform: translateX(-100%);`);
        }
        else {
            this._cpr.setInput('style', `top: ${_top}px; left: ${left - rootElementRect.left}px;`);
        }
    }
    closeToolbar() {
        this._cpr?.destroy();
        this._cpr = undefined;
        this._cprSub?.unsubscribe();
    }
    onLink() {
        const overlay = this.controller.injector.get(Overlay);
        const sel = this.controller.selection.getSelection();
        if (!sel || sel.isAtRoot)
            return;
        const range = document.getSelection().getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const bRange = sel.blockRange;
        const virCursor = BlockFlowCursor.createVirtualRange(sel.blockId, bRange.start, bRange.end);
        const positionStrategy = overlay.position().global().top(rect.bottom + 'px').left(rect.left + 'px');
        const portal = new ComponentPortal(LinkInputPad);
        const ovr = overlay.create({
            positionStrategy,
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-transparent-backdrop',
        });
        const close = () => {
            ovr.dispose();
            virCursor.remove();
            this.controller.selection.setSelection(sel.blockId, sel.blockRange.start, sel.blockRange.end);
        };
        const cpr = ovr.attach(portal);
        merge(ovr.backdropClick(), cpr.instance.onCancel).pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe(close);
        cpr.instance.onConfirm.pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe((url) => {
            close();
            const deltas = [];
            if (bRange.start > 0) {
                deltas.push({ retain: bRange.start });
            }
            deltas.push({ delete: bRange.end - bRange.start });
            deltas.push({
                insert: { link: range.toString() },
                attributes: { 'd:href': url }
            });
            const bRef = this.controller.getBlockRef(sel.blockId);
            bRef.applyDelta(deltas);
        });
    }
    destroy() {
        this.closeToolbar();
    }
}

class TriggerBtn {
    set contextmenu(c) {
        this.contextmenuPortal = new ComponentPortal(c);
    }
    constructor(host, cdr, overlay) {
        this.host = host;
        this.cdr = cdr;
        this.overlay = overlay;
        this.display = 'none';
        this.hasContent = false;
        this.top = 0;
        this.left = 0;
    }
    set activeBlockWrap(val) {
        if (this._activeBlockWrap === val)
            return;
        this.closeContextMenu();
        this._activeBlockWrap = val;
        this._onDestroySub?.unsubscribe();
        if (!val) {
            this.close();
            return;
        }
        this.activeBlock = this.controller.getBlockRef(val.getAttribute('data-block-id'));
        this.hasContent = this.activeBlock instanceof EditableBlock ? !!this._activeBlockWrap.textContent : true;
        this._onDestroySub = this.activeBlock.onDestroy.pipe(take(1)).subscribe(() => {
            this.close();
        });
        const { top, left } = this.calcPos();
        this.top = top;
        this.left = left;
        this.display = 'block';
        this.cdr.markForCheck();
    }
    calcPos() {
        const rootRect = this.controller.rootElement.getBoundingClientRect();
        const wrapRect = this.activeBlock.hostEl.nativeElement.getBoundingClientRect();
        const left = wrapRect.left - rootRect.left - 28;
        if (this.activeBlock instanceof EditableBlock && this.activeBlock.containerEle === this.activeBlock.hostEl.nativeElement) {
            const container = this.activeBlock.containerEle;
            const rect = container.getBoundingClientRect();
            return {
                top: rect.top - rootRect.top + this.calcLineHeight(container) / 2 - 11,
                left,
            };
        }
        return {
            top: wrapRect.top - rootRect.top,
            left
        };
    }
    calcLineHeight(ele) {
        const style = window.getComputedStyle(ele);
        const lineHeight = style.lineHeight;
        if (lineHeight === 'normal') {
            const fontSize = style.fontSize;
            return parseFloat(fontSize) * 1.2;
        }
        return parseFloat(lineHeight);
    }
    onClick(event) {
        event.stopPropagation();
    }
    onMouse(event) {
        event.stopPropagation();
        // event.preventDefault()  // If open this line, the btn can't be dragged
    }
    onMouseEnter(e) {
        e.stopPropagation();
        this.hasContent = this.activeBlock instanceof EditableBlock ? !!this._activeBlockWrap.textContent : true;
        this.display = 'block';
        this.cdr.markForCheck();
        this.showContextMenu();
    }
    showContextMenu() {
        if (this.ovr)
            return;
        const positionStrategy = this.overlay.position().flexibleConnectedTo(this.host)
            .withPositions([
            { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
            { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' },
        ])
            .withPush(true);
        this.ovr = this.overlay.create({ positionStrategy });
        const cpr = this.ovr.attach(this.contextmenuPortal);
        cpr.setInput('activeBlock', this.activeBlock);
        cpr.setInput('controller', this.controller);
        merge(fromEvent(document, 'click').pipe(take(1)), fromEvent(document, 'selectionchange').pipe(take(1)), fromEvent(cpr.location.nativeElement, 'mouseleave').pipe(filter(e => !e.relatedTarget.closest('.cdk-overlay-pane'))), fromEvent(this.host.nativeElement, 'mouseleave').pipe(filter(e => !e.relatedTarget.closest('.cdk-overlay-pane')))).pipe(takeUntil(cpr.instance.destroy)).subscribe(() => {
            this.ovr?.dispose();
            this.ovr = undefined;
        });
    }
    closeContextMenu() {
        this.ovr?.dispose();
        this.ovr = undefined;
    }
    close() {
        this.display = 'none';
        this.activeBlock = undefined;
        this._activeBlockWrap = undefined;
        this.closeContextMenu();
        this.cdr.markForCheck();
        // check after NG100
        requestAnimationFrame(() => {
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TriggerBtn, deps: [{ token: i0.ElementRef }, { token: i0.ChangeDetectorRef }, { token: i1.Overlay }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: TriggerBtn, isStandalone: true, selector: "div.trigger-btn", inputs: { contextmenu: "contextmenu", controller: "controller", activeBlockWrap: "activeBlockWrap" }, host: { listeners: { "click": "onClick($event)", "mousedown": "onMouse($event)", "mouseenter": "onMouseEnter($event)" }, properties: { "attr.contenteditable": "false", "style.display": "display", "style.top.px": "this.top", "style.left.px": "this.left" } }, ngImport: i0, template: `
    <div class="btn">
      <i [class]="['bf_icon', hasContent ? 'bf_yidong' : 'bf_tianjia-2']"></i>
    </div>
  `, isInline: true, styles: [":host{z-index:100;position:absolute;padding-right:8px}.btn{background-color:#fff;box-shadow:0 0 2px #999;border-radius:4px;overflow:hidden;cursor:pointer;text-align:center;color:#999;font-size:16px;width:22px;height:22px;line-height:22px}.btn:hover{background-color:#e6e6e6}\n"], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: TriggerBtn, decorators: [{
            type: Component,
            args: [{ selector: 'div.trigger-btn', standalone: true, template: `
    <div class="btn">
      <i [class]="['bf_icon', hasContent ? 'bf_yidong' : 'bf_tianjia-2']"></i>
    </div>
  `, imports: [NgIf, NgTemplateOutlet], changeDetection: ChangeDetectionStrategy.OnPush, host: {
                        '[attr.contenteditable]': 'false',
                        '[style.display]': 'display',
                    }, styles: [":host{z-index:100;position:absolute;padding-right:8px}.btn{background-color:#fff;box-shadow:0 0 2px #999;border-radius:4px;overflow:hidden;cursor:pointer;text-align:center;color:#999;font-size:16px;width:22px;height:22px;line-height:22px}.btn:hover{background-color:#e6e6e6}\n"] }]
        }], ctorParameters: () => [{ type: i0.ElementRef }, { type: i0.ChangeDetectorRef }, { type: i1.Overlay }], propDecorators: { contextmenu: [{
                type: Input,
                args: [{ required: true }]
            }], controller: [{
                type: Input
            }], activeBlockWrap: [{
                type: Input
            }], top: [{
                type: HostBinding,
                args: ['style.top.px']
            }], left: [{
                type: HostBinding,
                args: ['style.left.px']
            }], onClick: [{
                type: HostListener,
                args: ['click', ['$event']]
            }], onMouse: [{
                type: HostListener,
                args: ['mousedown', ['$event']]
            }], onMouseEnter: [{
                type: HostListener,
                args: ['mouseenter', ['$event']]
            }] } });

class BlockControllerPlugin {
    constructor(contextMenu) {
        this.contextMenu = contextMenu;
        this.name = 'block-controller';
        this.version = 1.0;
        this._activeBlockWrap = null;
        this._timer = null;
        this.eventSubs = [];
        this.onLeave = () => {
            this._cpr.setInput('activeBlockWrap', null);
            this._timer = this._activeBlockWrap = null;
            this.mouseLeaveSub?.unsubscribe();
        };
    }
    init(controller) {
        this._controller = controller;
        this._vcr = controller.injector.get(ViewContainerRef);
        this._cpr = this._vcr.createComponent(TriggerBtn, {
            injector: controller.injector
        });
        this._cpr.instance.controller = controller;
        this._cpr.setInput('contextmenu', this.contextMenu);
        controller.rootElement.appendChild(this._cpr.location.nativeElement);
        this.eventSubs = [
            fromEvent(this._cpr.location.nativeElement, 'mouseenter').subscribe(() => {
                this._timer && clearTimeout(this._timer);
            }),
            fromEvent(controller.rootElement, 'mouseover').subscribe((e) => {
                if (controller.readonly$.value)
                    return;
                const target = e.target;
                if (target === controller.rootElement)
                    return;
                const blockWrap = target.closest('[bf-block-wrap]');
                if (!blockWrap || this._activeBlockWrap === blockWrap)
                    return;
                this._timer && clearTimeout(this._timer);
                this.mouseLeaveSub?.unsubscribe();
                this._cpr.setInput('activeBlockWrap', blockWrap);
                this._activeBlockWrap = blockWrap;
                this.mouseLeaveSub = fromEvent(blockWrap, 'mouseleave').pipe(take(1)).subscribe(() => {
                    this._timer = setTimeout(this.onLeave, 200);
                });
            })
        ];
        this.addDraggable();
    }
    addDraggable() {
        this.drag$ = new BehaviorSubject('end');
        this._cpr.location.nativeElement.setAttribute('draggable', 'true');
        const createDragLine = () => {
            const dragLine = document.createElement('div');
            dragLine.style.cssText = `
      display: none;
      position: absolute;
      height: 2px;
      background-color: #3a53d9;
      pointer-events: none;
    `;
            this._controller.rootElement.appendChild(dragLine);
            return dragLine;
        };
        const calcPosition = (e, blockWrap) => {
            const rect = blockWrap.getBoundingClientRect();
            if (e.clientY > rect.top + rect.height / 2)
                return 'after';
            return 'before';
        };
        const calcLineRect = (blockWrap, position) => {
            const rootRect = this._controller.rootElement.getBoundingClientRect();
            const rect = blockWrap.getBoundingClientRect();
            if (position === 'after')
                return { top: rect.bottom - rootRect.top + 1, left: rect.left - rootRect.left, width: rect.width };
            return { top: rect.top - rootRect.top - 1, left: rect.left - rootRect.left, width: rect.width };
        };
        fromEvent(this._cpr.location.nativeElement, 'dragstart')
            .subscribe((e) => {
            this._cpr.instance.closeContextMenu();
            this._cpr.instance.cdr.detectChanges();
            if (this._controller.root.selectedBlockRange)
                this._controller.root.clearSelectedBlockRange();
            if (!this._activeBlockWrap)
                return;
            const dataTransfer = e.dataTransfer;
            dataTransfer.dropEffect = 'none';
            dataTransfer.clearData();
            dataTransfer.setDragImage(this._activeBlockWrap, 0, 0);
            let prevPosition = 'none';
            let prevBlockWrap = null;
            let dragMoveSub = undefined;
            const dragLine = createDragLine();
            this.drag$.next('start');
            fromEvent(document.body, 'dragover')
                .pipe(takeUntil(this.drag$.pipe(filter((e) => e === 'end'))))
                .subscribe((e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            fromEvent(this._controller.rootElement, 'dragenter')
                .pipe(takeUntil(this.drag$.pipe(filter((e) => e === 'end'))))
                .subscribe((e) => {
                e.stopPropagation();
                e.preventDefault();
                const target = e.target;
                const blockWrap = target.closest('[bf-block-wrap]');
                if (!blockWrap || prevBlockWrap === blockWrap)
                    return;
                prevBlockWrap = blockWrap;
                dragMoveSub?.unsubscribe();
                dragMoveSub = undefined;
                dragMoveSub = fromEvent(blockWrap, 'dragover').pipe(throttleTime(60))
                    .subscribe((e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const position = calcPosition(e, blockWrap);
                    if (prevPosition === position)
                        return;
                    prevPosition = position;
                    const rect = calcLineRect(blockWrap, position);
                    dragLine.style.display = 'block';
                    dragLine.style.top = rect.top + 'px';
                    dragLine.style.left = rect.left + 'px';
                    dragLine.style.width = rect.width + 'px';
                });
            });
            fromEvent(this._cpr.location.nativeElement, 'dragend').pipe(take(1))
                .subscribe((e) => {
                e.preventDefault();
                e.stopPropagation();
                dragLine.remove();
                this.drag$.next('end');
                prevBlockWrap && this.onSortBlock(prevBlockWrap, prevPosition);
            });
        });
    }
    onSortBlock(targetBlockWrap, position) {
        if (position === 'none' || targetBlockWrap === this._activeBlockWrap
            || (this._activeBlockWrap?.nextElementSibling === targetBlockWrap && position === 'before')
            || (this._activeBlockWrap?.previousElementSibling === targetBlockWrap && position === 'after'))
            return;
        // console.log('sort block', targetBlockWrap, position)
        const activeBlockId = this._activeBlockWrap.getAttribute('data-block-id');
        const targetBlockId = targetBlockWrap.getAttribute('data-block-id');
        this._controller.moveBlock(activeBlockId, targetBlockId, position);
    }
    destroy() {
        this._cpr.destroy();
        this.eventSubs.forEach(sub => sub.unsubscribe());
    }
}

const MENTION_TABS = [
    {
        label: '人员',
        type: 'user'
    },
    {
        label: '文档',
        type: 'doc'
    }
];
class MentionDialog {
    mousedown(event) {
        event.stopPropagation();
        event.preventDefault();
    }
    constructor(elementRef, cdr) {
        this.elementRef = elementRef;
        this.cdr = cdr;
        this.top = 0;
        this.left = 0;
        this.list = [];
        this.tabChange = new EventEmitter();
        this.itemSelect = new EventEmitter();
        this.close = new EventEmitter();
        this.MENTION_TABS = MENTION_TABS;
        this.activeTabIndex = 0;
        this.selectIndex = 0;
    }
    moveSelect(direction) {
        if (direction === 'up') {
            this.selectIndex = Math.max(0, this.selectIndex - 1);
        }
        else {
            this.selectIndex = Math.min(this.list.length - 1, this.selectIndex + 1);
        }
        this.elementRef.nativeElement.querySelector('.mention-dialog__content__item.active')?.scrollIntoView({ block: 'center' });
        this.cdr.detectChanges();
    }
    ngOnInit() {
        this.onTabChange(0);
    }
    ngAfterViewInit() {
        // 确保元素在视口内
        const rect = this.elementRef.nativeElement.getBoundingClientRect();
        const { innerHeight, innerWidth } = window;
        if (rect.bottom > innerHeight) {
            this.top = innerHeight - rect.height - 10;
        }
        if (rect.right > innerWidth) {
            this.left = innerWidth - rect.width - 10;
        }
    }
    onItemClick(e, item) {
        e.preventDefault();
        e.stopPropagation();
        this.itemSelect.emit(item);
    }
    onSure() {
        if (!this.list.length)
            return;
        this.itemSelect.emit(this.list[this.selectIndex]);
    }
    onTabChange(index) {
        this.activeTabIndex = index;
        this.selectIndex = 0;
        this.tabChange.emit(MENTION_TABS[index].type);
    }
    ngOnDestroy() {
        this.close.emit(true);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: MentionDialog, deps: [{ token: i0.ElementRef }, { token: i0.ChangeDetectorRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: MentionDialog, isStandalone: true, selector: "mention-dialog", inputs: { top: "top", left: "left", template: "template", list: "list" }, outputs: { tabChange: "tabChange", itemSelect: "itemSelect", close: "close" }, host: { listeners: { "mousedown": "mousedown($event)" }, properties: { "style.top.px": "this.top", "style.left.px": "this.left" } }, ngImport: i0, template: "<div class=\"mention-dialog__header\">\n  <ul class=\"tab-btn-list\">\n    <li class=\"tab-btn-list__item\" [class.active]=\"activeTabIndex === idx\"\n        *ngFor=\"let item of MENTION_TABS; index as idx\" (mousedown)=\"onTabChange(idx)\">\n      <span>{{ item.label }}</span>\n    </li>\n  </ul>\n</div>\n<div class=\"mention-dialog__content\">\n  <ng-container *ngIf=\"!list.length\">\n    <nz-empty nzNotFoundImage=\"simple\"></nz-empty>\n  </ng-container>\n\n  <ng-container *ngFor=\"let item of list; index as idx\">\n    <div class=\"mention-dialog__content__item\"\n         [class.active]=\"idx === selectIndex\" (mousedown)=\"onItemClick($event, item)\">\n      <ng-container *ngTemplateOutlet=\"template || simpleTpl; context: { $implicit: item, item, type: activeTabIndex === 0  ? 'user' : 'doc'}\"></ng-container>\n    </div>\n  </ng-container>\n</div>\n<div class=\"mention-dialog__footer\">\n  <div class=\"mention-dialog__footer__button\" (click)=\"onSure()\">\u786E\u5B9A</div>\n</div>\n\n<ng-template #simpleTpl let-item let-type='type'>\n  {{ item.name + type }}\n</ng-template>\n\n\n<!--<div class=\"mention-dialog__content\">-->\n<!--  <ng-container *ngFor=\"let item of list; index as idx\">-->\n<!--    <div class=\"mention-dialog__content__item\"-->\n<!--         [class.active]=\"idx === selectIndex\" (mouseenter)=\"selectIndex = idx\"-->\n<!--         (mousedown)=\"onItemClick($event, item)\">-->\n<!--      <ng-container *ngTemplateOutlet=\"template || simpleTpl; context: { $implicit: item}\"></ng-container>-->\n\n<!--      <ng-template #simpleTpl let-item>-->\n<!--        {{ item.name }}-->\n<!--      </ng-template>-->\n<!--    </div>-->\n<!--  </ng-container>-->\n\n<!--  <ng-container *ngIf=\"!list.length\">-->\n<!--    <nz-empty nzNotFoundImage=\"simple\"></nz-empty>-->\n<!--  </ng-container>-->\n<!--</div>-->\n\n", styles: [":host{display:block;width:400px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;max-height:50vh;overflow-y:auto}:host .mention-dialog__header{border-bottom:1px solid #E6E6E6}:host .mention-dialog__header .tab-btn-list{display:flex;padding:0 8px;font-size:14px;color:#999;list-style:none;margin:0}:host .mention-dialog__header .tab-btn-list__item{padding:0 12px;cursor:pointer;margin:0}:host .mention-dialog__header .tab-btn-list__item>span{display:inline-block;height:40px;line-height:40px}:host .mention-dialog__header .tab-btn-list__item:hover{color:#4857e2}:host .mention-dialog__header .tab-btn-list__item.active{font-weight:700;color:#4857e2}:host .mention-dialog__header .tab-btn-list__item.active>span{position:relative}:host .mention-dialog__header .tab-btn-list__item.active>span:before{position:absolute;content:\"\";width:100%;height:3px;background:#4857e2;bottom:-2px;left:0;border-radius:10px}:host .mention-dialog__content{padding:8px;max-height:360px;overflow-y:auto}:host .mention-dialog__content__item{width:100%;cursor:pointer}:host .mention-dialog__content__item.active,:host .mention-dialog__content__item:hover{background:#f9f9f9}:host .mention-dialog__footer{margin-top:16px;padding:0 16px;border-top:1px solid #E6E6E6}:host .mention-dialog__footer__button{padding:8px 16px;cursor:pointer;font-size:14px;color:#4857e2;text-align:center}:host .mention-dialog__footer__button:hover{background:#f9f9f9}\n"], dependencies: [{ kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }, { kind: "directive", type: NgIf, selector: "[ngIf]", inputs: ["ngIf", "ngIfThen", "ngIfElse"] }, { kind: "directive", type: NgTemplateOutlet, selector: "[ngTemplateOutlet]", inputs: ["ngTemplateOutletContext", "ngTemplateOutlet", "ngTemplateOutletInjector"] }, { kind: "ngmodule", type: NzEmptyModule }, { kind: "component", type: i1$2.NzEmptyComponent, selector: "nz-empty", inputs: ["nzNotFoundImage", "nzNotFoundContent", "nzNotFoundFooter"], exportAs: ["nzEmpty"] }, { kind: "ngmodule", type: NzTabsModule }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: MentionDialog, decorators: [{
            type: Component,
            args: [{ selector: 'mention-dialog', standalone: true, imports: [
                        NgForOf,
                        NgIf,
                        NgTemplateOutlet,
                        NzEmptyModule,
                        NzTabsModule,
                        NzButtonComponent
                    ], changeDetection: ChangeDetectionStrategy.OnPush, template: "<div class=\"mention-dialog__header\">\n  <ul class=\"tab-btn-list\">\n    <li class=\"tab-btn-list__item\" [class.active]=\"activeTabIndex === idx\"\n        *ngFor=\"let item of MENTION_TABS; index as idx\" (mousedown)=\"onTabChange(idx)\">\n      <span>{{ item.label }}</span>\n    </li>\n  </ul>\n</div>\n<div class=\"mention-dialog__content\">\n  <ng-container *ngIf=\"!list.length\">\n    <nz-empty nzNotFoundImage=\"simple\"></nz-empty>\n  </ng-container>\n\n  <ng-container *ngFor=\"let item of list; index as idx\">\n    <div class=\"mention-dialog__content__item\"\n         [class.active]=\"idx === selectIndex\" (mousedown)=\"onItemClick($event, item)\">\n      <ng-container *ngTemplateOutlet=\"template || simpleTpl; context: { $implicit: item, item, type: activeTabIndex === 0  ? 'user' : 'doc'}\"></ng-container>\n    </div>\n  </ng-container>\n</div>\n<div class=\"mention-dialog__footer\">\n  <div class=\"mention-dialog__footer__button\" (click)=\"onSure()\">\u786E\u5B9A</div>\n</div>\n\n<ng-template #simpleTpl let-item let-type='type'>\n  {{ item.name + type }}\n</ng-template>\n\n\n<!--<div class=\"mention-dialog__content\">-->\n<!--  <ng-container *ngFor=\"let item of list; index as idx\">-->\n<!--    <div class=\"mention-dialog__content__item\"-->\n<!--         [class.active]=\"idx === selectIndex\" (mouseenter)=\"selectIndex = idx\"-->\n<!--         (mousedown)=\"onItemClick($event, item)\">-->\n<!--      <ng-container *ngTemplateOutlet=\"template || simpleTpl; context: { $implicit: item}\"></ng-container>-->\n\n<!--      <ng-template #simpleTpl let-item>-->\n<!--        {{ item.name }}-->\n<!--      </ng-template>-->\n<!--    </div>-->\n<!--  </ng-container>-->\n\n<!--  <ng-container *ngIf=\"!list.length\">-->\n<!--    <nz-empty nzNotFoundImage=\"simple\"></nz-empty>-->\n<!--  </ng-container>-->\n<!--</div>-->\n\n", styles: [":host{display:block;width:400px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;max-height:50vh;overflow-y:auto}:host .mention-dialog__header{border-bottom:1px solid #E6E6E6}:host .mention-dialog__header .tab-btn-list{display:flex;padding:0 8px;font-size:14px;color:#999;list-style:none;margin:0}:host .mention-dialog__header .tab-btn-list__item{padding:0 12px;cursor:pointer;margin:0}:host .mention-dialog__header .tab-btn-list__item>span{display:inline-block;height:40px;line-height:40px}:host .mention-dialog__header .tab-btn-list__item:hover{color:#4857e2}:host .mention-dialog__header .tab-btn-list__item.active{font-weight:700;color:#4857e2}:host .mention-dialog__header .tab-btn-list__item.active>span{position:relative}:host .mention-dialog__header .tab-btn-list__item.active>span:before{position:absolute;content:\"\";width:100%;height:3px;background:#4857e2;bottom:-2px;left:0;border-radius:10px}:host .mention-dialog__content{padding:8px;max-height:360px;overflow-y:auto}:host .mention-dialog__content__item{width:100%;cursor:pointer}:host .mention-dialog__content__item.active,:host .mention-dialog__content__item:hover{background:#f9f9f9}:host .mention-dialog__footer{margin-top:16px;padding:0 16px;border-top:1px solid #E6E6E6}:host .mention-dialog__footer__button{padding:8px 16px;cursor:pointer;font-size:14px;color:#4857e2;text-align:center}:host .mention-dialog__footer__button:hover{background:#f9f9f9}\n"] }]
        }], ctorParameters: () => [{ type: i0.ElementRef }, { type: i0.ChangeDetectorRef }], propDecorators: { top: [{
                type: HostBinding,
                args: ['style.top.px']
            }, {
                type: Input
            }], left: [{
                type: HostBinding,
                args: ['style.left.px']
            }, {
                type: Input
            }], template: [{
                type: Input
            }], list: [{
                type: Input
            }], tabChange: [{
                type: Output
            }], itemSelect: [{
                type: Output
            }], close: [{
                type: Output
            }], mousedown: [{
                type: HostListener,
                args: ['mousedown', ['$event']]
            }] } });

const MENTION_EMBED_CONVERTER = {
    toView: (embed) => {
        const span = document.createElement('span');
        span.textContent = embed.insert['mention'];
        BlockflowInline.setAttributes(span, embed.attributes);
        return span;
    },
    toDelta: (ele) => {
        return {
            insert: { mention: ele.textContent },
            attributes: BlockflowInline.getAttributes(ele)
        };
    }
};
class MentionPlugin {
    constructor(request, tpl, onMentionClick) {
        this.request = request;
        this.tpl = tpl;
        this.onMentionClick = onMentionClick;
        this.name = "mention";
        this.version = 1.0;
        this._activeTab = 'user';
        this._rootInputSub = null;
    }
    init(controller) {
        this.controller = controller;
        this.controller.inlineManger.embedConverterMap.set('mention', MENTION_EMBED_CONVERTER);
        this.subRootInput();
        this._vcr = controller.injector.get(ViewContainerRef);
        if (this.onMentionClick) {
            this._clickSub = fromEvent(controller.rootElement, 'click')
                .subscribe((e) => {
                const target = e.target;
                if (!(target instanceof HTMLElement) || !target.dataset['mentionId'])
                    return;
                e.preventDefault();
                this.onMentionClick(target.dataset, e, controller);
            });
        }
    }
    subRootInput() {
        this._rootInputSub = fromEvent(this.controller.rootElement, 'input')
            .subscribe((e) => {
            if (e.data !== '@' || e.isComposing || this._mentionElement || this.controller.activeElement?.classList.contains('bf-plain-text-only'))
                return;
            // @前字符为 空格 时触发
            const activeBlock = this.controller.getFocusingBlockRef();
            const curRange = this.controller.selection.getCurrentCharacterRange();
            if (curRange.start > 1 && characterAtDelta(activeBlock.getTextDelta(), curRange.start - 1) !== ' ')
                return;
            const selection = document.getSelection();
            if (!selection.isCollapsed)
                return;
            const node = selection.focusNode;
            const parent = node.parentElement;
            const isEditableContainer = parent.classList.contains('editable-container');
            if (node.textContent === '@' && !isEditableContainer) {
                this.openMention(parent);
                return;
            }
            // delete the '@' character that was just typed
            node.deleteData(selection.focusOffset - 1, 1);
            if (isEditableContainer) {
                node.splitText(selection.focusOffset);
                const span = document.createElement('span');
                span.textContent = '@';
                node.after(span);
                this.openMention(span);
                selection.setPosition(span.firstChild, 1);
                return;
            }
            // create a new element to represent the mention
            const cloneParent = parent.cloneNode();
            cloneParent.textContent = '@';
            if (selection.focusOffset === 0) {
                parent.before(cloneParent);
            }
            else if (selection.focusOffset >= node.length) {
                parent.after(cloneParent);
            }
            else {
                const cloneParent2 = parent.cloneNode();
                const text = node.splitText(selection.focusOffset);
                // console.log(selection.focusOffset, text)
                cloneParent2.appendChild(text);
                parent.after(cloneParent);
                cloneParent.after(cloneParent2);
            }
            this.openMention(cloneParent);
            selection.setPosition(cloneParent.firstChild, 1);
        });
    }
    openMention(element) {
        this._activeTab = 'user';
        this._mentionElement = element;
        const node = this._mentionElement.firstChild;
        this.showMentionDialog();
        let isComposing = false;
        fromEvent(element.parentElement, 'compositionstart')
            .pipe(takeUntil(this._dialog.instance.close)).subscribe(() => isComposing = true);
        fromEvent(element.parentElement, 'compositionend')
            .pipe(takeUntil(this._dialog.instance.close)).subscribe(() => isComposing = false);
        const search = () => {
            if (isComposing)
                return;
            const keyword = node.textContent.slice(1);
            this.request(keyword, this._activeTab).then((res) => {
                this._dialog.setInput('list', res.list);
            });
        };
        // search immediately when the mention element is created
        search();
        // MutationObserver is used to detect changes in the text node
        fromEventPattern(handler => {
            this._mentionInputObserver = new MutationObserver(handler);
            this._mentionInputObserver.observe(node, { characterData: true });
        }, handler => this._mentionInputObserver.disconnect()).pipe(debounceTime(300), takeUntil(this._dialog.instance.close)).subscribe(search);
        // 监听元素销毁
        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && Array.from(mutation.removedNodes).includes(element)) {
                    this.closeMention();
                    observer.disconnect();
                    break;
                }
            }
        });
        observer.observe(element.parentElement, { childList: true });
        // 失焦关闭
        const sub = fromEvent(document, 'selectionchange')
            .subscribe(() => {
            const selection = document.getSelection();
            if (!selection || selection.focusNode?.parentElement !== this._mentionElement) {
                this.closeMention();
                sub.unsubscribe();
            }
        });
        this._dialog?.instance.tabChange.pipe(takeUntil(this._dialog?.instance.close)).subscribe((type) => {
            this._activeTab = type;
            search();
        });
        this._dialog?.instance.itemSelect.pipe(take(1)).subscribe((item) => {
            this.setMention(item);
            this.closeMention();
        });
        fromEvent(element.parentElement, 'keydown').pipe(takeUntil(this._dialog.instance.close))
            .subscribe((e) => {
            switch (e.key) {
                case 'Enter':
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.isComposing)
                        return;
                    this._dialog?.instance.onSure();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    e.stopPropagation();
                    this._dialog?.instance.moveSelect('down');
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    e.stopPropagation();
                    this._dialog?.instance.moveSelect('up');
                    break;
                case 'Escape':
                    e.preventDefault();
                    e.stopPropagation();
                    this.closeMention();
                    break;
                case 'Tab':
                    e.preventDefault();
                    e.stopPropagation();
                    this._dialog?.instance.onTabChange(this._dialog?.instance.activeTabIndex === 0 ? 1 : 0);
                    break;
                default:
                    break;
            }
        });
    }
    showMentionDialog() {
        if (!this._mentionElement)
            return;
        const overlay = this.controller.injector.get(Overlay);
        const portal = new ComponentPortal(MentionDialog, this._vcr);
        this.overlayRef = overlay.create({
            positionStrategy: overlay.position().flexibleConnectedTo(this._mentionElement).withPush(false)
                .withPositions([
                { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
                { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
            ]),
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-transparent-backdrop',
        });
        this._dialog = this.overlayRef.attach(portal);
        this.tpl && this._dialog.setInput('template', this.tpl);
        this.overlayRef.backdropClick().pipe(take(1)).subscribe(() => {
            this.closeMention();
        });
    }
    closeMention() {
        this.overlayRef?.dispose();
        this._dialog = this._mentionElement = this.overlayRef = undefined;
        this._mentionInputObserver.disconnect();
    }
    setMention(item) {
        if (!this._mentionElement)
            return;
        const block = this.controller.getFocusingBlockRef();
        const yText = block.yText;
        const offset = getElementCharacterOffset(this._mentionElement, block.containerEle);
        const len = this._mentionElement.textContent.length;
        const attributes = {
            'd:mentionId': item.id,
            'd:mentionType': this._activeTab,
            ...BlockflowInline.getAttributes(this._mentionElement)
        };
        const delta = { insert: { mention: item.name }, attributes };
        const mentionNode = this.controller.inlineManger.createView(delta);
        this.controller.transact(() => {
            const bs = document.createTextNode(' ');
            // view update
            this._mentionElement.replaceWith(mentionNode, bs);
            // selection update
            setCursorAfter(bs);
            // sync yText
            yText.delete(offset, len);
            yText.insertEmbed(offset, delta.insert, attributes);
            yText.insert(offset + 1, ' ', {});
        }, USER_CHANGE_SIGNAL);
        this.closeMention();
    }
    destroy() {
        this._clickSub?.unsubscribe();
        this._rootInputSub?.unsubscribe();
    }
}

class BlockTransformContextMenu {
    constructor(cdr, host) {
        this.cdr = cdr;
        this.host = host;
        this.blocks = [];
        this.blockSelected = new EventEmitter();
        this.activeIdx = 0;
    }
    selectUp() {
        if (this.activeIdx > 0)
            this.activeIdx--;
        else
            this.activeIdx = this.blocks.length - 1;
        this.cdr.detectChanges();
        this.host.nativeElement.querySelector('.list__item.active')?.scrollIntoView({ behavior: 'smooth' });
    }
    selectDown() {
        if (this.activeIdx < this.blocks.length - 1)
            this.activeIdx++;
        else
            this.activeIdx = 0;
        this.cdr.detectChanges();
        this.host.nativeElement.querySelector('.list__item.active')?.scrollIntoView({ behavior: 'smooth' });
    }
    select() {
        this.blockSelected.emit(this.blocks[this.activeIdx]);
    }
    onMouseDown(event, item) {
        event.preventDefault();
        event.stopPropagation();
        this.blockSelected.emit(item);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockTransformContextMenu, deps: [{ token: i0.ChangeDetectorRef }, { token: i0.ElementRef }], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "17.3.12", type: BlockTransformContextMenu, isStandalone: true, selector: "block-transform-contextmenu", inputs: { blocks: "blocks" }, outputs: { blockSelected: "blockSelected" }, ngImport: i0, template: `
    <ul class="list">
      <li class="list__item" *ngFor="let item of blocks; index as idx" [title]="item.description || item.label"
          (mousedown)="onMouseDown($event, item)" [class.active]="activeIdx === idx" (mouseenter)="activeIdx = idx">
        @if (item.svgIcon) {
          <mat-icon [svgIcon]="item.svgIcon" style="width: 1em; height: 1em"></mat-icon>
        } @else {
          <i [class]="item.icon"></i>
        }
        <span>{{ item.label }}</span>
      </li>
    </ul>
  `, isInline: true, styles: [":host{display:block;background:#fff;box-shadow:0 0 8px #0003;border-radius:4px;max-height:50vh;overflow-y:auto}:host ::ng-deep mat-icon svg{vertical-align:top}:host .list{margin:0;padding:4px;width:224px}:host .list__item{display:flex;align-items:center;gap:8px;height:36px;padding:0 8px;border-radius:4px;cursor:pointer}:host .list__item>mat-icon,:host .list__item i{font-size:1em}:host .list__item.active{background:#f3f3f3}\n"], dependencies: [{ kind: "directive", type: NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }, { kind: "component", type: MatIcon, selector: "mat-icon", inputs: ["color", "inline", "svgIcon", "fontSet", "fontIcon"], exportAs: ["matIcon"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: BlockTransformContextMenu, decorators: [{
            type: Component,
            args: [{ selector: 'block-transform-contextmenu', template: `
    <ul class="list">
      <li class="list__item" *ngFor="let item of blocks; index as idx" [title]="item.description || item.label"
          (mousedown)="onMouseDown($event, item)" [class.active]="activeIdx === idx" (mouseenter)="activeIdx = idx">
        @if (item.svgIcon) {
          <mat-icon [svgIcon]="item.svgIcon" style="width: 1em; height: 1em"></mat-icon>
        } @else {
          <i [class]="item.icon"></i>
        }
        <span>{{ item.label }}</span>
      </li>
    </ul>
  `, standalone: true, imports: [
                        NgForOf,
                        NgTemplateOutlet,
                        MatIcon
                    ], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{display:block;background:#fff;box-shadow:0 0 8px #0003;border-radius:4px;max-height:50vh;overflow-y:auto}:host ::ng-deep mat-icon svg{vertical-align:top}:host .list{margin:0;padding:4px;width:224px}:host .list__item{display:flex;align-items:center;gap:8px;height:36px;padding:0 8px;border-radius:4px;cursor:pointer}:host .list__item>mat-icon,:host .list__item i{font-size:1em}:host .list__item.active{background:#f3f3f3}\n"] }]
        }], ctorParameters: () => [{ type: i0.ChangeDetectorRef }, { type: i0.ElementRef }], propDecorators: { blocks: [{
                type: Input
            }], blockSelected: [{
                type: Output
            }] } });

const blockTransforms = [
    {
        flavour: 'heading-one',
        description: `一级标题(⌘/Ctrl + 1)\nMarkdown: # (空格)`,
        markdown: /^#(\s+)?$/,
        hotkey: (e) => e.code === 'Digit1' && (e.ctrlKey || e.metaKey)
    },
    {
        flavour: 'heading-two',
        description: `二级标题(⌘/Ctrl + 2)\nMarkdown: ## (空格)`,
        markdown: /^##(\s+)?$/,
        hotkey: (e) => e.code === 'Digit2' && (e.ctrlKey || e.metaKey)
    },
    {
        flavour: 'heading-three',
        description: `三级标题(⌘/Ctrl + 3)\nMarkdown: ### (空格)`,
        markdown: /^###(\s+)?$/,
        hotkey: (e) => e.code === 'Digit3' && (e.ctrlKey || e.metaKey)
    },
    {
        flavour: 'heading-four',
        description: `四级标题(⌘/Ctrl + 4)\nMarkdown: #### (空格)`,
        markdown: /^####(\s+)?$/,
        hotkey: (e) => e.code === 'Digit4' && (e.ctrlKey || e.metaKey)
    },
    {
        flavour: 'bullet-list',
        description: `无序列表(⌘/Ctrl + Shift + L)\nMarkdown: -/+ (空格)`,
        markdown: /^[-+](\s+)?$/,
        hotkey: (e) => e.code === 'KeyL' && (e.ctrlKey || e.metaKey) && e.shiftKey
    },
    {
        flavour: 'ordered-list',
        description: `有序列表(⌘/Ctrl + Shift + O)\nMarkdown: (数字). (空格)`,
        markdown: /^\d+\.(\s+)?$/,
        hotkey: (e) => e.code === 'KeyO' && (e.ctrlKey || e.metaKey) && e.shiftKey,
        onConvert: (controller, from, matchedString) => {
            const props = {
                order: parseInt(matchedString, 10) - 1,
                ...from.props
            };
            return controller.createBlock('ordered-list', [from.getTextDelta(), props]);
        }
    },
    {
        flavour: 'todo-list',
        description: `待办事项(⌘/Ctrl + Shift + T)\nMarkdown: [] (空格)`,
        markdown: /^\[\]\s$/,
        hotkey: (e) => e.code === 'KeyT' && (e.ctrlKey || e.metaKey) && e.shiftKey
    },
    {
        flavour: 'callout',
        description: `高亮块(⌘/Ctrl + Shift + Q)\nMarkdown: ! (空格)`,
        markdown: /^!\s$/,
        hotkey: (e) => e.code === 'KeyQ' && (e.ctrlKey || e.metaKey) && e.shiftKey
    },
    {
        flavour: 'blockquote',
        description: `引用块\nMarkdown: > (空格)`,
        markdown: /^>\s$/,
    },
    {
        flavour: 'divider',
        description: `分割线(⌘/Ctrl + Shift + H)\nMarkdown: --- (空格)`,
        markdown: /^---(\s+)?$/
    },
    {
        flavour: 'divider',
        description: `分割线(⌘/Ctrl + Shift + H)\nMarkdown: --- (空格)`,
        markdown: /^---(\s+)?$/,
        hotkey: (e) => e.code === 'KeyH' && (e.ctrlKey || e.metaKey) && e.shiftKey
    },
    {
        flavour: 'code',
        description: `代码块(⌘/Ctrl + Shift + C)\nMarkdown: \`\`\` (空格)`,
        markdown: /^```(\s+)?$/,
        hotkey: (e) => e.code === 'KeyC' && (e.ctrlKey || e.metaKey) && e.shiftKey
    }
];
const TransformReg = /^[\\、].*/;
class BlockTransformPlugin {
    constructor(transformList = blockTransforms) {
        this.transformList = transformList;
        this.name = 'block-transform';
        this.version = 1.0;
        this.mdTransformList = [];
        this.sub = new Subscription();
        this.contextOvr = null;
        this.closeMenu$ = new Subject();
    }
    static { this.transformEditableBlock = (controller, from, to) => {
        const deltas = from.getTextDelta();
        const newBlock = controller.createBlock(to, [deltas, from.props]);
        controller.replaceWith(from.id, [newBlock]).then(() => {
            controller.selection.setSelection(newBlock.id, 'start');
        });
    }; }
    init(controller) {
        this._controller = controller;
        this.transformList.forEach((item) => {
            const schema = controller.schemas.get(item.flavour);
            if (!schema)
                return;
            schema.description = item.description;
            item.hotkey && controller.keyEventBus.add({
                trigger: item.hotkey,
                handler: (e, controller) => {
                    const block = controller.getFocusingBlockRef();
                    if (!block)
                        return;
                    const blockPos = controller.getBlockPosition(block.id);
                    if (blockPos.parentId !== controller.rootId)
                        return;
                    e.preventDefault();
                    e.stopPropagation();
                    BlockTransformPlugin.transformEditableBlock(controller, block, item.flavour);
                }
            });
            if (item.markdown) {
                this.mdTransformList.push({
                    regex: item.markdown,
                    flavour: item.flavour
                });
            }
        });
        this.sub.add(fromEvent(controller.rootElement, 'input')
            .subscribe(e => {
            if (e.data !== ' ')
                return;
            const block = controller.getFocusingBlockRef();
            if (!block || block.flavour !== 'paragraph' || block.getParentId() !== controller.rootId)
                return;
            const range = controller.selection.getSelection();
            if (range.isAtRoot)
                return;
            const { blockId, blockRange } = range;
            const text = block.getTextContent().slice(0, blockRange.start);
            const matched = this.mdTransformList.find((item) => item.regex.test(text));
            if (!matched)
                return;
            const config = this.transformList.find((item) => item.flavour === matched.flavour);
            block.applyDelta([{ delete: text.length }], false);
            let newBlock;
            if (config.onConvert) {
                newBlock = config.onConvert(controller, block, text);
            }
            else {
                newBlock = controller.createBlock(matched.flavour, [block.getTextDelta(), block.props]);
            }
            const appendBlocks = [newBlock];
            if (newBlock.nodeType === 'void') {
                appendBlocks.push(controller.createBlock('paragraph'));
            }
            controller.replaceWith(block.id, appendBlocks).then(() => {
                controller.selection.setSelection(appendBlocks[appendBlocks.length - 1].id, 'start');
            });
        }));
        this.sub.add(fromEvent(controller.rootElement, 'input')
            .subscribe(e => {
            if (e.data !== '\\' && e.data !== '、')
                return;
            const block = controller.getFocusingBlockRef();
            if (!block || block.flavour !== 'paragraph' || block.getParentId() !== controller.rootId || block.containerEle.textContent !== e.data)
                return;
            this.openContextMenu(block);
        }));
    }
    openContextMenu(block) {
        const overlay = this._controller.injector.get(Overlay);
        const positions = overlay.position().flexibleConnectedTo(block.containerEle).withPositions([
            { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
            { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' },
        ]);
        this.contextOvr = overlay.create({ positionStrategy: positions });
        const cpr = this.contextOvr.attach(new ComponentPortal(BlockTransformContextMenu));
        const blockSchemas = this._controller.schemas.values().filter(v => !v.isLeaf && v.flavour !== 'image' && v.flavour !== 'paragraph');
        cpr.setInput('blocks', blockSchemas);
        let isComposing = false;
        fromEvent(block.containerEle, 'compositionstart').pipe(takeUntil(this.closeMenu$)).subscribe(() => {
            isComposing = true;
        });
        fromEvent(block.containerEle, 'compositionend').pipe(takeUntil(this.closeMenu$)).subscribe(() => {
            isComposing = false;
        });
        const textObserver = () => {
            if (isComposing)
                return;
            const text = block.getTextContent();
            if (!text || !TransformReg.test(text)) {
                this.closeMenu$.next(true);
                return;
            }
            const searchText = text.slice(1);
            const matchedSchemas = blockSchemas.filter(v => v.label.startsWith(searchText) || v.flavour.startsWith(searchText));
            if (!matchedSchemas.length) {
                this.closeMenu$.next(true);
                return;
            }
            cpr.setInput('blocks', matchedSchemas);
            cpr.instance.activeIdx = 0;
        };
        block.yText.observe(textObserver);
        this.closeMenu$.pipe(take(1)).subscribe(v => {
            this.contextOvr.dispose();
            this.contextOvr = null;
            block.yText.unobserve(textObserver);
        });
        cpr.instance.blockSelected.pipe(takeUntil(this.closeMenu$)).subscribe(schema => {
            this.contextOvr.dispose();
            const newBlock = this._controller.createBlock(schema.flavour);
            this._controller.replaceWith(block.id, [newBlock]).then(() => {
                newBlock.nodeType === 'editable' && this._controller.selection.setSelection(newBlock.id, 'start');
            });
        });
        merge(fromEvent(block.containerEle, 'blur'), block.onDestroy).pipe(takeUntil(this.closeMenu$)).subscribe(() => {
            this.closeMenu$.next(true);
        });
        fromEvent(block.containerEle, 'keydown').pipe(takeUntil(this.closeMenu$))
            .subscribe((e) => {
            switch (e.key) {
                case 'Escape':
                    e.preventDefault();
                    e.stopPropagation();
                    this.closeMenu$.next(true);
                    break;
                case 'Enter':
                    e.preventDefault();
                    e.stopPropagation();
                    cpr.instance.select();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    e.stopPropagation();
                    cpr.instance.selectUp();
                    break;
                case 'ArrowDown':
                    e.stopPropagation();
                    e.preventDefault();
                    cpr.instance.selectDown();
                    break;
            }
        });
    }
    destroy() {
        this.sub.unsubscribe();
        this.transformList.forEach((item) => {
            item.hotkey && this._controller.keyEventBus.remove(item.hotkey);
        });
    }
}

class InlineLinkBlockFloatDialog {
    set text(v) {
        this.updatedText = v;
        this._text = v;
    }
    get text() {
        return this._text;
    }
    set href(v) {
        this.updatedHref = v;
        this._href = v;
    }
    get href() {
        return this._href;
    }
    constructor() {
        this._text = '';
        this._href = '';
        this.close = new EventEmitter();
        this.update = new EventEmitter();
        this.titleError = false;
        this.urlError = false;
        this.updatedText = '';
        this.updatedHref = '';
    }
    ngAfterViewInit() {
        this.titleInput.nativeElement.focus();
    }
    verifyText() {
        this.titleError = !this.updatedText;
    }
    verifyUrl() {
        this.urlError = !isUrl(this.updatedHref);
    }
    onClose() {
        this.close.emit();
    }
    onUpdate() {
        this.verifyUrl();
        this.verifyText();
        if (this.titleError)
            return this.titleInput.nativeElement.focus();
        if (this.urlError)
            return this.urlInput.nativeElement.focus();
        if (this.updatedText === this.text && this.updatedHref === this.href)
            return this.close.emit();
        this.update.emit({
            text: this.updatedText,
            href: this.updatedHref
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: InlineLinkBlockFloatDialog, deps: [], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: InlineLinkBlockFloatDialog, isStandalone: true, selector: "div.float-edit-dialog", inputs: { text: "text", href: "href" }, outputs: { close: "close", update: "update" }, viewQueries: [{ propertyName: "titleInput", first: true, predicate: ["titleInput"], descendants: true, read: ElementRef }, { propertyName: "urlInput", first: true, predicate: ["urlInput"], descendants: true, read: ElementRef }], ngImport: i0, template: `
    <p>标题</p>
    <input type="text" placeholder="请输入标题" [(ngModel)]="updatedText"
           [class.error]="titleError" #titleInput (keyup.enter)="onUpdate()" (keydown.tab)="titleInput.focus()">
    <p>地址</p>
    <input type="text" placeholder="请输入地址" [(ngModel)]="updatedHref"
           [class.error]="urlError" #urlInput (keyup.enter)="onUpdate()" (keydown.tab)="urlInput.focus()">
    <div style="width: 100%; display: flex; justify-content: flex-end; gap: 16px">
      <button nz-button (click)="onClose()">取消</button>
      <button nz-button nzType="primary" (click)="onUpdate()">确定</button>
    </div>
  `, isInline: true, styles: [":host{width:400px;display:flex;flex-direction:column;align-items:flex-start;padding:16px;gap:16px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;font-size:14px;color:#333}:host>p{margin:0;padding:0}:host>input{width:100%;margin:0;padding:8px;border-radius:4px;border:1px solid #E6E6E6;outline:none}:host>input:focus{border-color:#4857e2}:host>input.error{border-color:#ff4d4f}\n"], dependencies: [{ kind: "ngmodule", type: NzButtonModule }, { kind: "component", type: i1$1.NzButtonComponent, selector: "button[nz-button], a[nz-button]", inputs: ["nzBlock", "nzGhost", "nzSearch", "nzLoading", "nzDanger", "disabled", "tabIndex", "nzType", "nzShape", "nzSize"], exportAs: ["nzButton"] }, { kind: "directive", type: i2.ɵNzTransitionPatchDirective, selector: "[nz-button], nz-button-group, [nz-icon], [nz-menu-item], [nz-submenu], nz-select-top-control, nz-select-placeholder, nz-input-group", inputs: ["hidden"] }, { kind: "directive", type: i3.NzWaveDirective, selector: "[nz-wave],button[nz-button]:not([nzType=\"link\"]):not([nzType=\"text\"])", inputs: ["nzWaveExtraNode"], exportAs: ["nzWave"] }, { kind: "ngmodule", type: FormsModule }, { kind: "directive", type: i4$1.DefaultValueAccessor, selector: "input:not([type=checkbox])[formControlName],textarea[formControlName],input:not([type=checkbox])[formControl],textarea[formControl],input:not([type=checkbox])[ngModel],textarea[ngModel],[ngDefaultControl]" }, { kind: "directive", type: i4$1.NgControlStatus, selector: "[formControlName],[ngModel],[formControl]" }, { kind: "directive", type: i4$1.NgModel, selector: "[ngModel]:not([formControlName]):not([formControl])", inputs: ["name", "disabled", "ngModel", "ngModelOptions"], outputs: ["ngModelChange"], exportAs: ["ngModel"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: InlineLinkBlockFloatDialog, decorators: [{
            type: Component,
            args: [{ selector: 'div.float-edit-dialog', template: `
    <p>标题</p>
    <input type="text" placeholder="请输入标题" [(ngModel)]="updatedText"
           [class.error]="titleError" #titleInput (keyup.enter)="onUpdate()" (keydown.tab)="titleInput.focus()">
    <p>地址</p>
    <input type="text" placeholder="请输入地址" [(ngModel)]="updatedHref"
           [class.error]="urlError" #urlInput (keyup.enter)="onUpdate()" (keydown.tab)="urlInput.focus()">
    <div style="width: 100%; display: flex; justify-content: flex-end; gap: 16px">
      <button nz-button (click)="onClose()">取消</button>
      <button nz-button nzType="primary" (click)="onUpdate()">确定</button>
    </div>
  `, standalone: true, imports: [
                        NzButtonModule,
                        FormsModule,
                    ], changeDetection: ChangeDetectionStrategy.OnPush, styles: [":host{width:400px;display:flex;flex-direction:column;align-items:flex-start;padding:16px;gap:16px;border-radius:4px;border:1px solid #E6E6E6;background:#fff;box-shadow:0 0 20px #0000001a;font-size:14px;color:#333}:host>p{margin:0;padding:0}:host>input{width:100%;margin:0;padding:8px;border-radius:4px;border:1px solid #E6E6E6;outline:none}:host>input:focus{border-color:#4857e2}:host>input.error{border-color:#ff4d4f}\n"] }]
        }], ctorParameters: () => [], propDecorators: { text: [{
                type: Input,
                args: [{ required: true }]
            }], href: [{
                type: Input,
                args: [{ required: true }]
            }], close: [{
                type: Output
            }], update: [{
                type: Output
            }], titleInput: [{
                type: ViewChild,
                args: ['titleInput', { read: ElementRef }]
            }], urlInput: [{
                type: ViewChild,
                args: ['urlInput', { read: ElementRef }]
            }] } });

const TOOLBAR_OPEN_LINK = {
    id: 'open',
    icon: 'bf_icon bf_open-link',
    text: '打开',
    title: '打开链接',
    name: 'open',
    divide: true
};
const TOOLBAR_EDIT_LINK = {
    id: 'edit',
    icon: 'bf_icon bf_bianji_1',
    title: '编辑',
    name: 'edit',
};
const TOOLBAR_COPY_LINK = {
    id: 'copy',
    icon: 'bf_icon bf_fuzhi',
    title: '复制',
    name: 'copy',
};
const TOOLBAR_COPIED_LINK = {
    id: 'copied',
    icon: 'bf_icon bf_fuzhi',
    text: '已复制',
    title: '已复制',
    name: 'copied',
};
const TOOLBAR_UNBIND_LINK = {
    id: 'unlink',
    icon: 'bf_icon bf_jiebang',
    title: '解除链接',
    name: 'unlink',
};
class InlineLinkPlugin {
    constructor() {
        this.name = 'inline-link';
        this.version = 1.0;
    }
    init(c) {
        const overlay = c.injector.get(Overlay);
        const createOverlay = (target) => {
            const position = overlay.position().flexibleConnectedTo(target).withPositions([{
                    originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top',
                }]);
            const ref = overlay.create({
                positionStrategy: position,
                hasBackdrop: true,
                backdropClass: 'cdk-overlay-transparent-backdrop',
            });
            ref.backdropClick().pipe(take(1)).subscribe(() => {
                ref.dispose();
            });
            return ref;
        };
        const openDialog = (target) => {
            const text = target.textContent;
            const href = target.getAttribute('data-href');
            const ref = createOverlay(target);
            const portal = new ComponentPortal(InlineLinkBlockFloatDialog);
            const cpr = ref.attach(portal);
            cpr.setInput('text', text);
            cpr.setInput('href', href);
            cpr.instance.close.pipe(take(1)).subscribe(() => {
                ref.dispose();
            });
            cpr.instance.update
                .pipe(take(1))
                .subscribe(v => {
                const newDelta = {
                    insert: { link: v.text },
                    attributes: { 'd:href': v.href }
                };
                const { activeBlock, start } = getActiveBlockAndPos(target);
                const newNode = c.inlineManger.createView(newDelta);
                const deltas = [{ delete: 1 }, newDelta];
                start > 0 && deltas.unshift({ retain: start });
                c.transact(() => {
                    target.replaceWith(newNode);
                    activeBlock.applyDeltaToModel(deltas);
                    const selection = document.getSelection();
                    const _r = document.createRange();
                    _r.setStartAfter(newNode);
                    _r.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(_r);
                }, USER_CHANGE_SIGNAL);
                ref.dispose();
            });
        };
        const getActiveBlockAndPos = (target) => {
            const activeBlockId = target.closest('[bf-node-type]').id;
            const activeBlock = c.getBlockRef(activeBlockId);
            return { activeBlock, start: getElementCharacterOffset(target, activeBlock.containerEle) };
        };
        this.subscribe = fromEvent(c.rootElement, 'click')
            .pipe(filter(e => e.target.getAttribute('bf-embed') === 'link'))
            .subscribe((e) => {
            e.preventDefault();
            const target = e.target;
            const ref = createOverlay(target);
            const portal = new ComponentPortal(FloatToolbar);
            const cpr = ref.attach(portal);
            cpr.setInput('toolbarList', c.readonly$.value ? [TOOLBAR_OPEN_LINK, TOOLBAR_COPY_LINK] : [TOOLBAR_OPEN_LINK, TOOLBAR_EDIT_LINK, TOOLBAR_COPY_LINK, TOOLBAR_UNBIND_LINK]);
            cpr.instance.itemClick.subscribe(({ item, event }) => {
                if (c.readonly$.value && item.name !== 'open')
                    return;
                switch (item.name) {
                    case 'open':
                        window.open(target.getAttribute('data-href'));
                        break;
                    case 'edit':
                        openDialog(target);
                        break;
                    case 'copy':
                        const delta = c.inlineManger.elementToDelta(target);
                        c.clipboard.writeData([
                            { type: 'delta', data: [delta] },
                            { type: 'text', data: delta.insert['link'] }
                        ]);
                        break;
                    case 'unlink':
                        const text = target.textContent;
                        const { activeBlock, start } = getActiveBlockAndPos(target);
                        activeBlock.applyDelta([{ retain: start }, { delete: 1 }, { insert: text }]);
                        break;
                }
                ref.dispose();
            });
        });
    }
    destroy() {
        this.subscribe.unsubscribe();
    }
}

class InlineImgPlugin {
    constructor() {
        this.name = "inline-img";
        this.version = 1.0;
        this.sub = new Subscription();
        this.inlineImg$ = new BehaviorSubject(null);
        this._viewer = null;
    }
    init(controller) {
        this._controller = controller;
        this.sub.add(this.inlineImg$.subscribe(ele => {
            // this._viewer?.destroy()
            // this._viewer = null
            if (ele) {
                this.wrapImg(this.prevImg = ele);
            }
            else if (this.prevImg) {
                this.unWrapImg(this.prevImg);
                this.prevImg = undefined;
            }
        }));
        this.sub.add(fromEvent(controller.rootElement, 'focusin')
            .subscribe((e) => {
            if (e.target instanceof HTMLElement && e.target.getAttribute('bf-embed') === 'image') {
                const ele = e.target;
                if (this._controller.readonly$.value) {
                    this.previewImg(ele);
                    return;
                }
                this.inlineImg$.value !== ele && this.inlineImg$.next(ele);
                fromEvent(ele, 'blur').pipe(take(1)).subscribe(() => {
                    this.inlineImg$.next(null);
                });
            }
        }));
    }
    previewImg(ele) {
        this._viewer?.destroy();
        this._viewer = new Viewer(ele, { zIndex: 999999 });
        this._viewer?.show();
    }
    wrapImg(ele) {
        if (!ele)
            return;
        const fragment = document.createElement('span');
        fragment.className = 'resize-container';
        const tl = document.createElement('span');
        tl.className = 'resize-point top-left';
        const tr = document.createElement('span');
        tr.className = 'resize-point top-right';
        const bl = document.createElement('span');
        bl.className = 'resize-point bottom-left';
        const br = document.createElement('span');
        br.className = 'resize-point bottom-right';
        fragment.appendChild(tl);
        fragment.appendChild(tr);
        fragment.appendChild(bl);
        fragment.appendChild(br);
        ele.classList.add('focused');
        ele.appendChild(fragment);
        fromEvent(tl, 'mousedown').pipe(takeUntil(fromEvent(document, 'mouseup'))).subscribe((e) => {
            this.onResizeHandleMouseDown(ele, e, 'left');
        });
        fromEvent(bl, 'mousedown').pipe(takeUntil(fromEvent(document, 'mouseup'))).subscribe((e) => {
            this.onResizeHandleMouseDown(ele, e, 'left');
        });
        fromEvent(br, 'mousedown').pipe(takeUntil(fromEvent(document, 'mouseup'))).subscribe((e) => {
            this.onResizeHandleMouseDown(ele, e, 'right');
        });
        fromEvent(tr, 'mousedown').pipe(takeUntil(fromEvent(document, 'mouseup'))).subscribe((e) => {
            this.onResizeHandleMouseDown(ele, e, 'right');
        });
        fromEvent(fragment, 'click')
            .pipe(takeUntil(this.inlineImg$.pipe(filter(v => v !== ele))))
            .subscribe((e) => {
            this.previewImg(ele);
        });
        fromEvent(ele, 'keydown')
            .pipe(takeUntil(this.inlineImg$.pipe(filter(v => v !== ele))))
            .subscribe((e) => {
            const remove = () => {
                const blockId = ele.closest('[bf-node-type]')?.id;
                if (!blockId)
                    return;
                const bRef = this._controller.getBlockRef(blockId);
                if (!bRef || !this._controller.isEditableBlock(bRef))
                    return;
                const characterOffset = getElementCharacterOffset(ele, bRef.containerEle);
                setCursorBefore(ele);
                ele.remove();
                this._controller.transact(() => {
                    bRef.yText.delete(characterOffset, 1);
                }, USER_CHANGE_SIGNAL);
            };
            if ((e.ctrlKey || e.metaKey)) {
                e.stopPropagation();
                e.preventDefault();
                if (e.code === 'KeyX' || e.code === 'KeyC') {
                    this._controller.clipboard.writeData([{ type: 'text/uri-list', data: ele.querySelector('img')?.src || '' }]);
                }
                e.code === 'KeyX' && remove();
                return;
            }
            switch (e.key) {
                case 'Backspace':
                case 'Delete':
                    e.preventDefault();
                    e.stopPropagation();
                    remove();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    e.stopPropagation();
                    setCursorAfter(ele);
                    break;
                case 'Enter':
                case 'ArrowLeft':
                case 'Escape':
                default:
                    e.preventDefault();
                    e.stopPropagation();
                    setCursorBefore(ele);
                    break;
            }
        });
    }
    unWrapImg(ele) {
        ele.classList.remove('focused');
        ele.removeChild(ele.lastChild);
    }
    onResizeHandleMouseDown(container, event, direction) {
        event.stopPropagation();
        event.preventDefault();
        const startPoint = { x: event.clientX, y: event.clientY, direction };
        let initWidth = Number(container.style.width) || container.clientWidth;
        let updateWidth = initWidth;
        const mouseMove$ = fromEvent(document.body, 'mousemove')
            .pipe(throttleTime(60))
            .subscribe((e) => {
            const movePx = e.clientX - startPoint.x;
            if (startPoint.direction === 'left')
                updateWidth -= movePx;
            else
                updateWidth += movePx;
            container.style.width = `${updateWidth}px`;
            startPoint.x = e.clientX;
        });
        fromEvent(document.body, 'mouseup').pipe(take(1)).subscribe((e) => {
            mouseMove$?.unsubscribe();
            if (initWidth !== updateWidth) {
                // format
                const curRange = this._controller.selection.getSelection();
                if (!curRange || curRange?.isAtRoot)
                    throw new Error('Unexpected Selection');
                const bRef = this._controller.getBlockRef(curRange.blockId);
                if (!bRef)
                    throw new Error('Unexpected BlockRef');
                this._controller.transact(() => {
                    bRef.yText.format(curRange.blockRange.start, 1, { 'd:width': updateWidth });
                }, USER_CHANGE_SIGNAL);
            }
        });
    }
    destroy() {
        this.sub.unsubscribe();
        this._viewer?.destroy();
    }
}

/**
 * Generated bundle index. Do not edit.
 */

export { BaseBlock, BaseStore, BgColorPaletteList, BlockControllerPlugin, BlockFlavour, BlockFlowContextmenu, BlockFlowEditor, BlockFlowSelection, BlockModel, BlockSelection, BlockTransformContextMenu, BlockTransformPlugin, BlockflowBinding, BlockflowInline, BlockquoteSchema, BulletListSchema, CalloutSchema, CodeBlockSchema, ColorPalette, ColorPaletteList, Controller, DividerSchema, EditableBlock, EditorRoot, FILE_UPLOADER, FloatTextToolbarPlugin, FloatToolbar, HeadingFourSchema, HeadingOneSchema, HeadingThreeSchema, HeadingTwoSchema, ImageSchema, InlineImgPlugin, InlineLinkPlugin, KeyEventBus, LazyEditorRoot, LinkSchema, MENTION_EMBED_CONVERTER, MentionPlugin, MermaidBlockSchema, NO_RECORD_CHANGE_SIGNAL, OrderedListBlock, OrderedListSchema, ParagraphSchema, SchemaStore, TableBlockSchema, TableCellBlockSchema, TableRowBlockSchema, TodoListSchema, USER_CHANGE_SIGNAL, adjustRangeEdges, blockTransforms, characterAtDelta, characterIndex2Number, clearBreakElement, createRangeByCharacterRange, deleteContent, deltaToString, findNodeByIndex, formatKeyHandler, genUniqueID, getCommonAttributesFromDelta, getCurrentCharacterRange, getElementCharacterOffset, getNumberPrefix, insertContent, isCursorAtElEnd, isCursorAtElStart, isEmbedElement, isUrl, normalizeStaticRange, number2roman, onArrowDown, onArrowLeft, onArrowRight, onArrowUp, onBackspace, onCtrlA, onCtrlB, onCtrlC, onCtrlI, onCtrlU, onCtrlX, onCtrlZ, onDelete, onEnter, onTab, purifyString, setCharacterRange, setCursorAfter, setCursorBefore, sliceDelta, syncBlockModelChildren, syncMapUpdate, updateOrderAround };
//# sourceMappingURL=w-blockflow-editor.mjs.map
