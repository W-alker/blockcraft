import {ChangeDetectorRef} from '@angular/core'
import {OrderedPrefixToolbar} from './ordered-prefix-toolbar'
import {BcFloatToolbarItemComponent} from '../../../components'

describe('OrderedPrefixToolbar continuation', () => {
  it('allows the default segment to continue and clears that intent on reset', () => {
    const toolbar = new OrderedPrefixToolbar({markForCheck: () => {}} as ChangeDetectorRef)
    const props: any = {order: 0}
    const updateProps = jasmine.createSpy('updateProps').and.callFake(patch => Object.assign(props, patch))
    toolbar.orderedBlock = {props, updateProps} as any
    toolbar.checkMode()
    expect((toolbar as any).activeMode).toBe('')
    toolbar.onItemClicked({name: 'continue'} as BcFloatToolbarItemComponent)
    expect(updateProps).toHaveBeenCalledWith({start: 0, continuePrevious: true})
    toolbar.checkMode()
    expect((toolbar as any).activeMode).toBe('continue')
    toolbar.onItemClicked({name: 'reset'} as BcFloatToolbarItemComponent)
    expect(updateProps).toHaveBeenCalledWith({start: 1, continuePrevious: false, order: 0})
    toolbar.ngOnDestroy()
  })

  it('does not write when the target is no longer writable', () => {
    const toolbar = new OrderedPrefixToolbar({markForCheck: () => {}} as ChangeDetectorRef)
    const updateProps = jasmine.createSpy('updateProps')
    toolbar.orderedBlock = {props: {}, updateProps} as any
    toolbar.isBlockAlive = () => false
    toolbar.onItemClicked({name: 'reset'} as BcFloatToolbarItemComponent)
    expect(updateProps).not.toHaveBeenCalled()
    toolbar.ngOnDestroy()
  })
})
