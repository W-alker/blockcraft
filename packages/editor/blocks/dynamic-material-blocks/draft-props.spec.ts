import {
  draftPropMetaKey,
  hasDraftProps,
  projectDraftProps,
  readDraftProp,
} from './draft-props'

describe('draft props projection', () => {
  it('projects only declared draft keys and leaves real props untouched', () => {
    const props = {width: 160, style: 'row', source: 'resolved-user'}
    const meta = {'draft:style': 'column', 'draft:source': 'creator', lock: 'u1'}

    expect(projectDraftProps(props, meta, ['style', 'source'])).toEqual({
      width: 160,
      style: 'column',
      source: 'creator',
    })
    expect(props).toEqual({width: 160, style: 'row', source: 'resolved-user'})
    expect(meta).toEqual({'draft:style': 'column', 'draft:source': 'creator', lock: 'u1'})
  })

  it('keeps falsy draft values and falls back to props when draft meta is absent', () => {
    expect(readDraftProp({dept: 'on'}, {'draft:dept': ''}, 'dept')).toBe('')
    expect(readDraftProp({dept: 'on'}, {}, 'dept')).toBe('on')
  })

  it('uses the namespaced contract without treating system meta as draft data', () => {
    expect(draftPropMetaKey('date')).toBe('draft:date')
    expect(hasDraftProps({lock: 'u1', incl: ['paragraph']})).toBeFalse()
    expect(hasDraftProps({'draft:date': 'live'})).toBeTrue()
  })
})
