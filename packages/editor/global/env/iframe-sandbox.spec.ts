import {IFRAME_SANDBOX_FLAGS} from './iframe-sandbox'

describe('IFRAME_SANDBOX_FLAGS', () => {
  it('uses the Angular and Safari compatible common subset', () => {
    const flags = IFRAME_SANDBOX_FLAGS.split(' ')

    expect(flags).toContain('allow-scripts')
    expect(flags).toContain('allow-same-origin')
    expect(flags).toContain('allow-forms')
    expect(flags).toContain('allow-popups')
    expect(flags).toContain('allow-downloads')
    expect(flags).toContain('allow-storage-access-by-user-activation')
    expect(flags).not.toContain('allow-presentation')
  })
})
