import {
  COLLABORATION_CURSOR_PALETTE,
  resolveCollaborationCursorColor,
} from './collaboration-cursor-color'

describe('collaboration cursor colors', () => {
  it('maps the same user id to a stable curated palette color', () => {
    const first = resolveCollaborationCursorColor({id: 'user-1'})
    const second = resolveCollaborationCursorColor({id: 'user-1'})

    expect(first).toEqual({
      solid: '#2563EB',
      selection: 'rgba(37, 99, 235, 0.18)',
    })
    expect(second).toEqual(first)
    expect(COLLABORATION_CURSOR_PALETTE).toContain(first.solid as any)
  })

  it('does not use randomness when resolving fallback colors', () => {
    const random = spyOn(Math, 'random')

    resolveCollaborationCursorColor({id: 'stable-user'})

    expect(random).not.toHaveBeenCalled()
  })

  it('prefers and normalizes a valid explicit color', () => {
    expect(resolveCollaborationCursorColor({
      id: 'user-1',
      color: '#abc',
    })).toEqual({
      solid: '#AABBCC',
      selection: 'rgba(170, 187, 204, 0.18)',
    })

    expect(resolveCollaborationCursorColor({
      id: 'user-1',
      color: 'rgb(15, 118, 110)',
    })).toEqual({
      solid: '#0F766E',
      selection: 'rgba(15, 118, 110, 0.18)',
    })
  })

  it('falls back for empty and invalid explicit colors', () => {
    const fallback = resolveCollaborationCursorColor({id: 'user-2'})

    expect(resolveCollaborationCursorColor({
      id: 'user-2',
      color: '',
    })).toEqual(fallback)
    expect(resolveCollaborationCursorColor({
      id: 'user-2',
      color: 'definitely-not-a-color',
    })).toEqual(fallback)
  })
})
