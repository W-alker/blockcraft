import {ImageBlockSchema} from './index'

describe('ImageBlockSchema', () => {
  it('creates ratio-sized images from the short object input', () => {
    const snapshot = ImageBlockSchema.createSnapshot({
      src: 'https://cdn.example.com/image.png',
      wr: 45,
      ar: 16 / 9,
    })

    expect(snapshot.props).toEqual({
      src: 'https://cdn.example.com/image.png',
      wr: 45,
      ar: 16 / 9,
    })
  })

  it('keeps the legacy positional pixel-size input compatible', () => {
    const snapshot = ImageBlockSchema.createSnapshot(
      'https://cdn.example.com/image.png',
      320,
      180,
    )

    expect(snapshot.props).toEqual({
      src: 'https://cdn.example.com/image.png',
      width: 320,
      height: 180,
    })
  })
})
