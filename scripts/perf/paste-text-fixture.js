// Browser fixture: actual clipboard/input paths, isolated from the demo snapshot.
(() => {
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
  const settle = async () => { await frame(); await frame() }
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const source = window.ng.getComponent(document.querySelector('block-craft-editor')).doc
  assert(!source.isInitialized, 'Source demo must remain uninitialized')
  let fixture

  async function mount(config, guarded) {
    assert(document.visibilityState === 'visible', 'Page is backgrounded')
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;left:20px;top:20px;width:850px;height:550px;overflow:auto;background:white;z-index:99999;padding:24px'
    const target = document.createElement('div')
    viewport.append(target); document.body.append(viewport)
    const paragraph = source.schemas.createSnapshot('paragraph', [''])
    const snapshot = source.schemas.createSnapshot('root', ['paste-perf', [paragraph]])
    const doc = new source.constructor({...source.config, docId: snapshot.id,
      yDoc: new source.yDoc.constructor(), plugins: [], scrollContainer: viewport,
      pasteTextPolicy: 'remove-stacked-marks',
      virtualization: {enabled: false}})
    doc.initBySnapshot(snapshot, target)
    const block = doc.getBlockById(paragraph.id)
    fixture = {doc, block, viewport, config, guarded}
    await document.fonts.ready; await settle()
    block.hostElement.querySelector('.edit-container').focus()
    doc.selection.setCursorAt(block, 0)
  }

  async function paste() {
    const {doc, block, config, guarded} = fixture
    const data = new DataTransfer()
    if (config.rich) {
      const boundaries = Array.from({length: 257}, (_, i) => {
        const offset = Math.floor(i * config.text.length / 256)
        const previous = config.text.charCodeAt(offset - 1)
        return previous >= 0xd800 && previous <= 0xdbff ? offset - 1 : offset
      })
      const deltas = Array.from({length: 256}, (_, i) => ({
        insert: config.text.slice(boundaries[i], boundaries[i + 1]),
        attributes: {'a:bold': i % 2 === 0, 's:color': i % 2 === 0 ? '#345678' : '#765432'}
      }))
      const paragraph = doc.schemas.createSnapshot('paragraph', [deltas])
      const snapshot = doc.schemas.createSnapshot('root', ['incoming', [paragraph]])
      data.setData('application/x-blockcraft-snapshot+json', JSON.stringify(snapshot))
    } else data.setData('text/plain', config.text)
    const event = new ClipboardEvent('paste', {bubbles: true, cancelable: true, clipboardData: data})
    Object.defineProperty(event, 'clipboardData', {value: data})
    const start = performance.now()
    block.hostElement.dispatchEvent(event)
    const dispatchMs = performance.now() - start
    await settle()
    const height = block.hostElement.getBoundingClientRect().height
    const pasteTwoFramesMs = performance.now() - start
    const expected = guarded ? config.text.replace(/\p{M}{9,}/gu, '') : config.text
    fixture.expected = expected
    assert(event.defaultPrevented, 'Paste handler was not entered')
    assert(block.textContent() === expected, 'Stored paste content mismatch')
    const display = Array.from(block.hostElement.querySelectorAll('c-text')).map(node => node.textContent).join('')
    assert(display === expected, 'Displayed paste content mismatch')
    assert(doc.selection.value.start.offset === expected.length, 'Post-paste cursor offset mismatch')
    assert(height > 0, 'No actual layout')
    return {dispatchMs, pasteTwoFramesMs, height, storedUnits: expected.length,
      textNodes: block.hostElement.querySelectorAll('c-text').length}
  }

  async function prepareKey() {
    const {viewport} = fixture
    fixture.keyFrames = []
    fixture.keyHandler = event => {
      if (event.inputType !== 'insertText' || event.data !== 'x') return
      const start = performance.now()
      requestAnimationFrame(() => fixture.keyFrames.push(performance.now() - start))
    }
    viewport.addEventListener('beforeinput', fixture.keyHandler, true)
    await settle()
  }

  async function finishKey() {
    await settle()
    const {block, viewport, keyHandler, keyFrames, expected} = fixture
    viewport.removeEventListener('beforeinput', keyHandler, true)
    assert(keyFrames.length === 1, 'Trusted keyboard timing missing')
    assert(block.textContent() === expected + 'x', 'Trusted keyboard result mismatch')
    return keyFrames[0]
  }

  async function dispose() {
    const {doc, viewport} = fixture
    const yDoc = doc.yDoc
    doc.destroy(); yDoc.destroy(); viewport.remove(); fixture = null
    await settle()
  }

  window.pastePerf = {mount, paste, prepareKey, finishKey, dispose}
})()
