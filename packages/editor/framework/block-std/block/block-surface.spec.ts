import {
  blockSurfaceImageFitToObjectFit,
  normalizeBlockSurfaceProps,
  resolveBlockSurface,
} from './block-surface'

describe('block surface', () => {
  it('normalizes CSS-like padding shorthand and compact background fields', () => {
    expect(normalizeBlockSurfaceProps({
      p: [-12, 24, 1200, 48],
      bgi: "url(\"https://cdn.example.com/paper.png\") -4% 120% / 100% 100% no-repeat",

      bgo: 0.35,
    })).toEqual({
      p: [0, 24, 1000, 48],
      bgi: "url(\"https://cdn.example.com/paper.png\") 0% 100% / 100% 100% no-repeat",

      bgo: 0.35,
    })
  })

  it('canonicalizes one-to-four padding values to the shortest CSS arity', () => {
    expect(normalizeBlockSurfaceProps({p: [8]})).toEqual({p: 8})
    expect(normalizeBlockSurfaceProps({p: [8, 12, 8, 12]}))
      .toEqual({p: [8, 12]})
    expect(normalizeBlockSurfaceProps({p: [8, 12, 16, 12]}))
      .toEqual({p: [8, 12, 16]})
    expect(normalizeBlockSurfaceProps({p: [8, Number.NaN]})).toEqual({})
    expect(normalizeBlockSurfaceProps({p: [1, 2, 3, 4, 5]})).toEqual({})
  })

  it('uses stable image defaults and ignores orphan image options', () => {
    expect(normalizeBlockSurfaceProps({
      bgi: "url(\"/assets/note.png\") 50% 50% / cover no-repeat",
    })).toEqual({
      bgi: "url(\"/assets/note.png\") 50% 50% / cover no-repeat",

    })

    expect(normalizeBlockSurfaceProps({
      bgs: 'contain',
      bgo: 0.5,
    })).toEqual({})
  })

  it('rejects active URL schemes including ASCII-whitespace obfuscation', () => {
    expect(normalizeBlockSurfaceProps({
      bgi: ' java\nscript:alert(1)',
    })).toEqual({})
    expect(normalizeBlockSurfaceProps({
      bgi: '\tvbscript:msgbox(1)',
    })).toEqual({})
  })

  it('resolves render defaults and maps stretch to CSS fill', () => {
    expect(resolveBlockSurface({p: [8, 12, 16, 20]})).toEqual({
      padding: {top: 8, right: 12, bottom: 16, left: 20},
      backgroundImage: null,
    })
    expect(blockSurfaceImageFitToObjectFit('stretch')).toBe('fill')
    expect(blockSurfaceImageFitToObjectFit('contain')).toBe('contain')
  })
})
