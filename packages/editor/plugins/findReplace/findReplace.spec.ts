import {Subject} from 'rxjs'
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
    const stateChange$ = new Subject<void>()
    const helper = {
      stateChange$,
      listen: jasmine.createSpy('listen'),
      clearAll: jasmine.createSpy('clearAll'),
      destroy: jasmine.createSpy('destroy'),
    }
    const markForCheck = jasmine.createSpy('markForCheck')
    const dialog = new FindReplaceDialog({markForCheck} as any)
    dialog.doc = {} as BlockCraft.Doc
    dialog.helper = helper as any

    dialog.ngOnInit()
    stateChange$.next()
    expect(markForCheck).toHaveBeenCalledTimes(1)
    dialog.ngOnDestroy()
    stateChange$.next()
    expect(markForCheck).toHaveBeenCalledTimes(1)

    expect(helper.listen).not.toHaveBeenCalled()
    expect(helper.clearAll).toHaveBeenCalledTimes(1)
    expect(helper.destroy).not.toHaveBeenCalled()
  })
})
