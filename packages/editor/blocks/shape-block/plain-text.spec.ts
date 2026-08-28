import {BlockNodeType} from '../../framework'
import {ClipboardManager} from '../../framework/modules/clipboard'
import {BlockSelection} from '../../framework/modules/selection'
import {ClipboardDataType} from '../../framework/modules/clipboard/types'
import {ShapeTextBlockSchema} from './index'

describe('Shape text plain-text boundary', () => {
  it('replaces a full text selection from text/plain before any rich parser', async () => {
    const replaceText = jasmine.createSpy('replaceText')
    const block = {
      id: 'shape-text-1',
      flavour: 'shape-text',
      nodeType: BlockNodeType.editable,
      plainTextOnly: false,
      textLength: 2,
      replaceText,
    }
    const selection = new BlockSelection(
      {blockId: block.id, type: 'text', offset: 0, block} as any,
      {blockId: block.id, type: 'text', offset: 2, block} as any,
      block.id,
      id => id === block.id ? block as any : null,
      () => 0,
    )
    const getAdapter = jasmine.createSpy('getAdapter')
    const manager = new ClipboardManager({
      config: {},
      event: {add() {}, bindHotkey() {}},
      injector: {
        get: () => ({supportedAdapters: [], getAdapter}),
      },
      isReadonly: false,
      logger: {warn: jasmine.createSpy('warn')},
      schemas: {
        get: () => ShapeTextBlockSchema,
      },
    } as any)
    const clipboardData = {
      getData: (type: string) => type === ClipboardDataType.TEXT
        ? '纯文本'
        : '<strong>富文本</strong>',
    }
    const context = {
      preventDefault: jasmine.createSpy('preventDefault'),
      get: () => ({
        selection,
        clipboardData,
        dataTypes: [ClipboardDataType.HTML, ClipboardDataType.TEXT],
        getData: (type: string) => clipboardData.getData(type),
      }),
    }

    expect(await manager.onPaste(context as any)).toBeTrue()
    expect(replaceText).toHaveBeenCalledOnceWith(0, 2, '纯文本')
    expect(getAdapter).not.toHaveBeenCalled()
  })
})
