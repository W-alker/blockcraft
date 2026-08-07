import {FindReplacePlugin} from './findReplace'
import {FindReplaceDialog} from './widgets/find-replace-dialog'

describe('FindReplacePlugin host-rendered UI mode', () => {
  it('leaves Cmd/Ctrl+F untouched when the default dialog is disabled', () => {
    const plugin = new FindReplacePlugin({defaultDialog: false})
    const getDefaultEvent = jasmine.createSpy('getDefaultEvent')

    expect(plugin.startFind({getDefaultEvent} as any)).toBeFalse()
    expect(getDefaultEvent).not.toHaveBeenCalled()
  })

  it('lets the plugin own a helper supplied to the bundled dialog', () => {
    const helper = {
      listen: jasmine.createSpy('listen'),
      clearAll: jasmine.createSpy('clearAll'),
      destroy: jasmine.createSpy('destroy'),
    }
    const dialog = new FindReplaceDialog({markForCheck: () => undefined} as any)
    dialog.doc = {} as BlockCraft.Doc
    dialog.helper = helper as any

    dialog.ngOnInit()
    dialog.ngOnDestroy()

    expect(helper.listen).not.toHaveBeenCalled()
    expect(helper.clearAll).toHaveBeenCalledTimes(1)
    expect(helper.destroy).not.toHaveBeenCalled()
  })
})
