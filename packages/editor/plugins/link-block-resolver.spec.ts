import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Injector } from '@angular/core';
import {
    BlockCraftDoc, BookmarkBlockExtensionPlugin, BookmarkBlockSchema,
    DOC_ADAPTER_SERVICE_TOKEN, DOC_LINK_PREVIEWER_SERVICE_TOKEN, DOC_MESSAGE_SERVICE_TOKEN, DOC_FILE_SERVICE_TOKEN,
    EmbedBlockSchema, InlineLinkExtension, ParagraphBlockSchema, RootBlockSchema,
    SchemaManager, LINK_BLOCK_RESOLVER, AttachmentBlockSchema, DividerBlockSchema,
    type LinkBlockResolver, type LinkBlockResolution, type LinkBlockTarget, type IBlockSchemaOptions, type IBlockSnapshot
} from '../index';
import * as Y from 'yjs';

const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

declare global {
    namespace BlockCraft {
        interface IBlockComponents { 'resource-reference': BlockCraft.IBlockComponents['divider'] }
        interface IBlockCreateParameters { 'resource-reference': [{resourceId: string}] }
    }
}
const ResourceSchema = {
    ...DividerBlockSchema, flavour: 'resource-reference',
    createSnapshot: (params: {resourceId: string}) => ({
        ...DividerBlockSchema.createSnapshot(), flavour: 'resource-reference', props: {resourceId: params.resourceId}
    })
} as unknown as IBlockSchemaOptions;


describe('host link to block conversion with native menus and document transactions', () => {
    let doc: BlockCraftDoc;
    let container: HTMLElement;
    let toolbar: ComponentFixture<any> | undefined;
    let link: InlineLinkExtension;
    let bookmarks: BookmarkBlockExtensionPlugin;
    const blockedUrl = 'https://example.com/internal/resource';
    const webUrl = 'https://example.com/report.html';

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [
            { provide: DOC_MESSAGE_SERVICE_TOKEN, useValue: { error: jasmine.createSpy(), warn: jasmine.createSpy(), success: jasmine.createSpy() } },
            { provide: DOC_FILE_SERVICE_TOKEN, useValue: { isLocalObjectURL: () => false, getFileByObjectURL: () => undefined } },
            { provide: DOC_LINK_PREVIEWER_SERVICE_TOKEN, useValue: { query: async () => ({}) } },
            { provide: DOC_ADAPTER_SERVICE_TOKEN, useValue: { supportedAdapters: [], getAdapter: () => undefined } }
        ] });
    });

    afterEach(() => {
        doc?.destroy(); doc?.yDoc.destroy(); toolbar?.destroy(); toolbar = undefined;
        container?.remove(); TestBed.resetTestingModule();
    });

    function documentSnapshot() {
        const snapshot = doc.exportSnapshot();
        if (!snapshot) throw new Error('Expected an initialized document snapshot');
        return snapshot;
    }

    async function create(source: 'inline' | 'card', url: string, filtered = true, resolver?: LinkBlockResolver) {
        link = new InlineLinkExtension();
        bookmarks = new BookmarkBlockExtensionPlugin();
        const schemas = new SchemaManager([RootBlockSchema, ParagraphBlockSchema, BookmarkBlockSchema, EmbedBlockSchema, AttachmentBlockSchema, ResourceSchema]);
        doc = new BlockCraftDoc({
            docId: 'host-doc', yDoc: new Y.Doc({ gc: false }), schemas,
            injector: Injector.create({
                parent: TestBed.inject(Injector),
                providers: filtered ? [{ provide: LINK_BLOCK_RESOLVER, useValue: resolver ?? {
                    resolve: (value: string) => ({kind: new URL(value).pathname.startsWith('/internal/') ? 'blocked' : 'unhandled'})
                } }] : []
            }), readonly: false,
            plugins: [link, bookmarks], virtualization: { enabled: false },
            logger: { info: jasmine.createSpy(), debug: jasmine.createSpy(), warn: jasmine.createSpy(), error: jasmine.createSpy() } as any
        });
        const snapshot = source === 'inline'
            ? ParagraphBlockSchema.createSnapshot([{ insert: '来源链接', attributes: { 'a:link': url } }])
            : BookmarkBlockSchema.createSnapshot(url);
        container = document.createElement('div'); document.body.append(container);
        doc.initBySnapshot(RootBlockSchema.createSnapshot('host-doc', [snapshot]), container);
        await settle();
        doc.crud.undoManager.stopCapturing();
        // 捕获原生工具栏组件，让 TestBed 驱动它的真实模板；仅替换浮层定位设施。
        spyOn(doc.overlayService, 'createConnectedOverlay').and.callFake((options: any) => {
            toolbar = TestBed.createComponent(options.component);
            return { componentRef: toolbar.componentRef, overlayRef: { dispose: () => {} } } as any;
        });
        const block = doc.getBlockById(snapshot.id);
        if (source === 'inline') {
            const target = block.hostElement.querySelector<HTMLElement>('[link] > *')!;
            expect(target).not.toBeNull();
            doc.selection.setCursorAt(block as any, 0);
            (link as any).openToolbar(target, url, block);
        } else {
            doc.selection.selectBlock(block);
            await new Promise(resolve => setTimeout(resolve, 220));
        }
        expect(toolbar).toBeDefined();
        toolbar!.detectChanges();
        await settle(); toolbar!.detectChanges();
        return block;
    }

    function viewModes(source: 'inline' | 'card') {
        return toolbar!.componentInstance[source === 'inline' ? 'LINK_VIEW_MODE_MAP' : 'BOOKMARK_BLOCK_VIEW_MODE_MAP']() as Map<string, string>;
    }

    async function openViewMenu() {
        const trigger = toolbar!.nativeElement.querySelector('[data-float-binding]') as HTMLElement;
        expect(trigger).not.toBeNull();
        trigger.dispatchEvent(new MouseEvent('mouseenter'));
        await new Promise(resolve => setTimeout(resolve, 10));
        toolbar!.detectChanges();
        return Array.from(document.querySelectorAll<HTMLElement>('.cdk-overlay-pane bc-float-toolbar-item'));
    }

    async function convert(source: 'inline' | 'card', mode: 'embed' | 'card' | 'inline') {
        if (source === 'inline') await (link as any).switchView(mode);
        else await toolbar!.componentInstance.switchViewMode({ value: mode });
        await settle();
    }

    for (const source of ['inline', 'card'] as const) {
        it(`${source} 宿主受限链接不展示嵌入项，绕过菜单调用转换也不写入`, async () => {
            await create(source, `${blockedUrl}?source=document#table`);
            expect(viewModes(source).has('embed')).toBe(false);
            expect([...viewModes(source).keys()]).toEqual(['inline', 'card']);
            const menu = await openViewMenu();
            expect(menu.map(item => item.textContent!.trim())).toEqual(['链接视图', '卡片视图']);
            const before = documentSnapshot();
            const updates = jasmine.createSpy(); doc.yDoc.on('update', updates);
            await convert(source, 'embed');
            expect(documentSnapshot()).toEqual(before);
            expect(updates).not.toHaveBeenCalled();
        });

        it(`${source} 普通网页仍展示嵌入项，转换与撤销重做保留 URL`, async () => {
            await create(source, webUrl);
            expect(viewModes(source).get('embed')).toBe('嵌入视图');
            const menu = await openViewMenu();
            const embed = menu.find(item => item.textContent!.trim() === '嵌入视图');
            expect(embed).toBeDefined();
            const before = documentSnapshot();
            embed!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            await settle();
            const after = documentSnapshot();
            const children = after.children as IBlockSnapshot[];
            expect(children.some(block => block.flavour === 'embed' && block.props['url'] === webUrl)).toBe(true);
            doc.crud.undoManager.undo(); await settle();
            expect(documentSnapshot()).toEqual(before);
            doc.crud.undoManager.redo(); await settle();
            expect(documentSnapshot()).toEqual(after);
        });

        it(`${source} 执行转换时重新检查 URL，已打开菜单不能绕过限制`, async () => {
            const block = await create(source, webUrl);
            expect(viewModes(source).has('embed')).toBe(true);
            if (source === 'card') block.updateProps({ url: blockedUrl });
            else (block as any).formatText(0, (block as any).textLength, { 'a:link': blockedUrl });
            await settle();
            const before = documentSnapshot();
            await convert(source, 'embed');
            expect(documentSnapshot()).toEqual(before);
        });
    }

    it('未配置宿主策略时保留框架原有行为', async () => {
        await create('inline', blockedUrl, false);
        expect(viewModes('inline').has('embed')).toBe(true);
        await convert('inline', 'embed');
        expect((documentSnapshot().children as IBlockSnapshot[]).some(block => block.flavour === 'embed')).toBe(true);
    });

    it('宿主受限链接仍能转卡片，再转回链接', async () => {
        await create('inline', blockedUrl);
        await convert('inline', 'card');
        const card = (documentSnapshot().children as IBlockSnapshot[]).find(block => block.flavour === 'bookmark')!;
        expect(card.props['url']).toBe(blockedUrl);
        // 同一真实卡片插件在选中卡片后创建工具栏。
        (link as any).closeToolbar();
        doc.selection.selectBlock(doc.getBlockById(card.id));
        await new Promise(resolve => setTimeout(resolve, 220));
        toolbar!.detectChanges();
        await convert('card', 'inline');
        const paragraph = (documentSnapshot().children as IBlockSnapshot[]).find(block => block.flavour === 'paragraph')!;
        expect(paragraph.children).toEqual([{ insert: blockedUrl, attributes: { 'a:link': blockedUrl } }]);
    });
    const attachmentTarget: LinkBlockTarget<'attachment'> = {kind: 'block' as const, label: '附件预览', flavour: 'attachment' as const,
        params: [{url: 'https://example.com/file.pdf', name: '报告.pdf', type: 'application/pdf', size: 42}]};
    const resourceTarget: LinkBlockTarget<'resource-reference'> = {kind: 'block' as const, label: '内嵌业务块', flavour: 'resource-reference' as const,
        params: [{resourceId: 'original-resource'}]};

    for (const source of ['inline', 'card'] as const) {
        for (const target of [attachmentTarget, resourceTarget]) {
            it(`${source} 能转为宿主指定的 ${target.flavour} 并独立撤销重做`, async () => {
                await create(source, blockedUrl, true, {resolve: async () => target});
                expect(viewModes(source).get('embed')).toBe(target.label);
                const menu = await openViewMenu();
                const item = menu.find(item => item.textContent!.trim() === target.label)!;
                expect(item).toBeDefined();
                const before = documentSnapshot();
                item.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true}));
                await settle();
                const after = documentSnapshot();
                const block = (after.children as IBlockSnapshot[]).find(block => block.flavour === target.flavour)!;
                expect(block).toBeDefined();
                if (target.flavour === 'attachment') expect(block.props['url']).toBe('https://example.com/file.pdf');
                else expect(block.props['resourceId']).toBe('original-resource');
                doc.crud.undoManager.undo(); await settle(); expect(documentSnapshot()).toEqual(before);
                doc.crud.undoManager.redo(); await settle(); expect(documentSnapshot()).toEqual(after);
            });
        }

        it(`${source} 异步转换期间源链接变化会取消，不能替换新内容`, async () => {
            let finish!: (value: LinkBlockResolution) => void;
            const block = await create(source, webUrl, true, {resolve: (_url, context) => context.phase === 'menu'
                ? resourceTarget : new Promise(resolve => finish = resolve)});
            const pending = source === 'inline' ? (link as any).switchView('embed')
                : toolbar!.componentInstance.switchViewMode({value: 'embed'});
            if (source === 'inline') (block as any).formatText(0, (block as any).textLength, {'a:link': blockedUrl});
            else block.updateProps({url: blockedUrl});
            const before = documentSnapshot(); finish(resourceTarget); await pending;
            expect(documentSnapshot()).toEqual(before);
        });

        it(`${source} 异步返回时已只读不会写入`, async () => {
            let finish!: (value: LinkBlockResolution) => void;
            await create(source, webUrl, true, {resolve: (_url, context) => context.phase === 'menu'
                ? resourceTarget : new Promise(resolve => finish = resolve)});
            const pending = source === 'inline' ? (link as any).switchView('embed')
                : toolbar!.componentInstance.switchViewMode({value: 'embed'});
            doc.toggleReadonly(true);
            const before = documentSnapshot(); finish(resourceTarget); await pending;
            expect(documentSnapshot()).toEqual(before);
        });

        it(`${source} 执行时的拒绝或解析失败不会回退成网页`, async () => {
            await create(source, webUrl, true, {resolve: (_url, context) => context.phase === 'menu'
                ? resourceTarget : {kind: 'blocked'}});
            const before = documentSnapshot(); await convert(source, 'embed');
            expect(documentSnapshot()).toEqual(before);
        });

        it(`${source} 父容器拒绝目标块时保留原链接`, async () => {
            await create(source, webUrl, true, {resolve: () => resourceTarget});
            spyOn(doc, 'canInsertChild').and.callFake((_parent, flavour) => flavour !== 'resource-reference');
            const before = documentSnapshot(); await convert(source, 'embed');
            expect(documentSnapshot()).toEqual(before);
        });
    }

    for (const source of ['inline', 'card'] as const) {
        it(`${source} 销毁执行者会取消请求，迟到结果不写入`, async () => {
            let finish!: (value: LinkBlockResolution) => void;
            let signal!: AbortSignal;
            await create(source, webUrl, true, {resolve: (_url, context) => {
                if (context.phase === 'menu') return resourceTarget;
                signal = context.signal; return new Promise(resolve => finish = resolve);
            }});
            const pending = source === 'inline' ? (link as any).switchView('embed')
                : toolbar!.componentInstance.switchViewMode({value: 'embed'});
            const before = documentSnapshot();
            if (source === 'inline') link.destroy(); else toolbar!.destroy();
            expect(signal.aborted).toBeTrue(); finish(resourceTarget); await pending;
            expect(documentSnapshot()).toEqual(before);
        });

        it(`${source} 源块被删除后异步结果不复活该块`, async () => {
            let finish!: (value: LinkBlockResolution) => void;
            const block = await create(source, webUrl, true, {resolve: (_url, context) => context.phase === 'menu'
                ? resourceTarget : new Promise(resolve => finish = resolve)});
            const pending = source === 'inline' ? (link as any).switchView('embed')
                : toolbar!.componentInstance.switchViewMode({value: 'embed'});
            doc.crud.deleteBlockById(block.id);
            const before = documentSnapshot(); finish(resourceTarget); await pending;
            expect(documentSnapshot()).toEqual(before);
        });

        it(`${source} 新转换取消旧请求且只生成一个目标块`, async () => {
            const finishes: Array<(value: LinkBlockResolution) => void> = [];
            const signals: AbortSignal[] = [];
            await create(source, webUrl, true, {resolve: (_url, context) => {
                if (context.phase === 'menu') return resourceTarget;
                signals.push(context.signal); return new Promise(resolve => finishes.push(resolve));
            }});
            const start = () => source === 'inline' ? (link as any).switchView('embed')
                : toolbar!.componentInstance.switchViewMode({value: 'embed'});
            const first = start(); const second = start();
            expect(signals[0].aborted).toBeTrue();
            finishes[0](resourceTarget); await first;
            finishes[1](resourceTarget); await second;
            expect((documentSnapshot().children as IBlockSnapshot[]).filter(block => block.flavour === 'resource-reference').length).toBe(1);
        });
    }

    it('异步解析期间前文变化通过相对锚点跟随，链接之外的格式和后文保留', async () => {
        let finish!: (value: LinkBlockResolution) => void;
        const block = await create('inline', webUrl, true, {resolve: (_url, context) => context.phase === 'menu'
            ? resourceTarget : new Promise(resolve => finish = resolve)});
        (block as any).insertText(0, '前文', {bold: true});
        (block as any).insertText((block as any).textLength, '后文', {italic: true});
        const target = block.hostElement.querySelector<HTMLElement>('[link] > *')!;
        (link as any).closeToolbar(); (link as any).openToolbar(target, webUrl, block);
        const pending = (link as any).switchView('embed');
        (block as any).insertText(0, '新增', {bold: true});
        finish(resourceTarget); await pending;
        const children = documentSnapshot().children as IBlockSnapshot[];
        expect(children[0].children).toEqual([{insert: '新增前文', attributes: {bold: true}}]);
        expect(children[1].flavour).toBe('resource-reference');
        expect(children[2].children).toEqual([{insert: '后文', attributes: {italic: true}}]);
    });

});
