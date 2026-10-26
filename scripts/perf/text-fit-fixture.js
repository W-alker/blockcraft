// Real BlockCraft components; instrumentation stays in this benchmark fixture.
(() => {
  const source = window.ng.getComponent(document.querySelector('block-craft-editor')).doc
  if (source.isInitialized) throw new Error('Keep the demo uninitialized')
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
  const frames = async n => { for (let i = 0; i < n; i++) await frame() }
  const text = '内容自适应压测：文字变化后保持布局稳定。'
  const props = {width: 320, height: 160, textFont: '16px 400', textPadding: '8 12'}
  let fixture, active, frameId, observer
  const percentile = (values, ratio) => {
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.ceil(sorted.length * ratio) - 1]
  }
  const summarize = values => ({n: values.length, p50: percentile(values, .5),
    p95: percentile(values, .95), max: values.length ? Math.max(...values) : null,
    total: values.reduce((sum, value) => sum + value, 0)})

  function createDoc(children) {
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;inset:20px;width:1000px;height:800px;overflow:auto;background:white;z-index:99999;padding:24px;box-sizing:border-box'
    const target = document.createElement('div')
    viewport.append(target)
    document.body.append(viewport)
    const snapshot = source.schemas.createSnapshot('root', ['text-fit-stress', children])
    const doc = new source.constructor({...source.config, docId: snapshot.id,
      yDoc: new source.yDoc.constructor(), plugins: [], scrollContainer: viewport,
      virtualization: {enabled: true, idlePrefetch: false, retainedViewLimit: 12, overscanViewports: 1}})
    return {doc, viewport, target, snapshot}
  }
  function destroy(item) {
    const yDoc = item.doc.yDoc
    item.doc.destroy()
    yDoc.destroy()
    item.viewport.remove()
  }

  async function mount(config, autoFit) {
    if (document.visibilityState !== 'visible') throw new Error('Background benchmark page')
    await document.fonts.ready
    const calibration = ['text-box', 'word-art'].map(flavour =>
      source.schemas.createSnapshot(flavour, [text, {...props, textAutoFit: 'resize-shape'}]))
    const seed = createDoc(calibration)
    await seed.doc.initBySnapshot(seed.snapshot, seed.target)
    await document.fonts.ready
    await frames(10)
    const heights = Object.fromEntries(calibration.map(snapshot => [snapshot.flavour,
      parseFloat(getComputedStyle(seed.doc.getBlockById(snapshot.id).hostElement
        .querySelector('[data-bc-object-surface]')).height)]))
    const prototype = Object.getPrototypeOf(seed.doc.getBlockById(calibration[0].id).autoFit)
    const fitTimingScope = typeof prototype.capture === 'function'
      ? 'DOM size reads only; shared batch setup/restore/model writes are included in CDP scriptMs'
      : 'Complete per-object measure/restore/model callback; included downstream work overlaps estimateMs'
    if (!prototype.__stressWrapped) {
      const original = prototype.fit
      prototype.fit = function (...args) {
        const meter = active
        if (!meter) return original.apply(this, args)
        meter.fitCalls++
        if (!this.surface.isConnected) meter.detachedFitCalls++
        const start = performance.now()
        try { return original.apply(this, args) }
        finally { meter.fitMs.push(performance.now() - start) }
      }
      prototype.__stressWrapped = true
    }
    destroy(seed)
    await frames(2)

    const objects = [], children = []
    const buildStart = performance.now()
    for (let i = 0; i < config.count; i++) {
      if (config.nested || i % 5 === 0) {
        const flavour = objects.length % 2 ? 'word-art' : 'text-box'
        const height = heights[flavour]
        const snapshot = source.schemas.createSnapshot(flavour, [text, {...props, height,
          textAutoFit: autoFit ? 'resize-shape' : 'none', ...(autoFit ? {textFit: height} : {})}])
        children.push(snapshot)
        objects.push({id: snapshot.id, flavour,
          textId: flavour === 'text-box' ? snapshot.children[0].id : snapshot.id})
      } else children.push(source.schemas.createSnapshot('paragraph', [`普通正文段落 ${i}，用于保持真实混合文档结构。`]))
    }
    let roots = children
    if (config.nested) {
      const region = source.schemas.createSnapshot('render-unit', [{}, {}])
      region.children = children
      roots = [region, ...Array.from({length: 200}, (_, i) =>
        source.schemas.createSnapshot('paragraph', [`容器后正文 ${i}`]))]
    }
    const snapshotBuildMs = performance.now() - buildStart
    fixture = {...createDoc(roots), objects, config, autoFit, heights, snapshotBuildMs}
    const originalUpdate = fixture.doc.placement.updateObjectGeometry
    fixture.doc.placement.updateObjectGeometry = function (block, updates, ...rest) {
      if (active && Object.hasOwn(updates, 'textFit')) active.fitWrites++
      return originalUpdate.call(this, block, updates, ...rest)
    }
    fixture.doc.onPropsUpdate$.subscribe(event => {
      if (active && event.transactions.some(({changes}) => changes.has('textFit'))) active.fitTransactions++
    })
    const originalEstimate = fixture.doc.virtualization.resolveModelHeightEstimate
    fixture.doc.virtualization.resolveModelHeightEstimate = function (...args) {
      const start = performance.now()
      try { return originalEstimate.apply(this, args) }
      finally { if (active) active.estimateMs.push(performance.now() - start) }
    }
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      observer = new PerformanceObserver(list => {
        if (active) active.longTasks.push(...list.getEntries().map(entry => ({start: entry.startTime, duration: entry.duration})))
      })
      observer.observe({type: 'longtask'})
    }
    return {heights, snapshotBuildMs, objectCount: objects.length, rootCount: roots.length, fitTimingScope}
  }

  function begin(name) {
    if (active) throw new Error('Phase already active')
    active = {name, started: performance.now(), frameMs: [], fitMs: [], fitCalls: 0,
      detachedFitCalls: 0, fitWrites: 0, fitTransactions: 0, longTasks: [], mountedMax: 0, keyMs: [], operationMs: [], estimateMs: []}
    let previous = active.started, index = 0
    const tick = () => {
      if (!active) return
      const now = performance.now()
      active.frameMs.push(now - previous)
      previous = now
      if (++index % 10 === 0 && fixture.doc.isInitialized) {
        active.mountedMax = Math.max(active.mountedMax, fixture.doc.vm.getMountedRootChildIds().length)
      }
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
  }

  async function end() {
    await frames(3)
    cancelAnimationFrame(frameId)
    const result = active
    result.elapsedMs = performance.now() - result.started
    result.mountedEnd = fixture.doc.vm.getMountedRootChildIds().length
    result.mountedMax = Math.max(result.mountedMax, result.mountedEnd)
    result.connectedObjects = fixture.objects.filter(object =>
      fixture.doc.vm.get(object.id)?.instance.hostElement.isConnected).length
    result.longTasks = result.longTasks.filter(entry => entry.start >= result.started)
    result.summary = {frames: summarize(result.frameMs), fit: summarize(result.fitMs),
      estimates: summarize(result.estimateMs),
      keys: summarize(result.keyMs), operations: summarize(result.operationMs),
      longTasks: summarize(result.longTasks.map(entry => entry.duration)),
      framesOver33: result.frameMs.filter(ms => ms > 33.4).length,
      framesOver50: result.frameMs.filter(ms => ms > 50).length}
    active = null
    return result
  }
  function operation(fn) {
    const start = performance.now()
    fn()
    active?.operationMs.push(performance.now() - start)
  }

  async function run(name) {
    const {doc, viewport, objects} = fixture
    if (name === 'init') {
      const start = performance.now()
      await doc.initBySnapshot(fixture.snapshot, fixture.target)
      active.operationMs.push(performance.now() - start)
      await frames(10)
      if (!doc.virtualization.enabled || !doc.vm.usesSparseRoot) throw new Error('Virtualization not active')
      doc.crud.undoManager.clearHistory()
    } else if (name === 'scroll') {
      for (let i = 0; i < 120; i++) {
        viewport.scrollTop += 150
        await frame()
      }
      // A rapid sweep also exercises cold mounts throughout the entire document.
      for (let i = 0; i < 40; i++) {
        viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) * (i % 2 ? 1 - i / 40 : i / 40)
        await frames(2)
      }
      await frames(8)
    } else if (name === 'offscreen-edit') {
      const targets = objects.filter(object => !doc.vm.get(object.id)?.instance.hostElement.isConnected)
      active.targets = targets.length
      operation(() => doc.crud.transact(() => {
        for (const object of targets) doc.crud.replaceText(object.textId, 0,
          doc.model.getTextLength(object.textId), text.repeat(4))
      }))
      await frames(12)
    } else if (name === 'batch-edit') {
      active.targets = objects.length
      operation(() => doc.crud.transact(() => {
        for (const object of objects) doc.crud.replaceText(object.textId, 0,
          doc.model.getTextLength(object.textId), text.repeat(3))
      }))
      await frames(12)
    } else if (name === 'width') {
      const targets = objects.filter(object => doc.vm.get(object.id)?.instance.hostElement.isConnected)
      active.targets = targets.length
      for (let i = 0; i < 12; i++) {
        operation(() => doc.crud.transact(() => {
          for (const object of targets) doc.crud.updateBlockProps(object.id, {width: i % 2 ? 320 : 220})
        }))
        await frames(3)
      }
      await frames(8)
    } else if (name === 'idle') {
      await new Promise(resolve => setTimeout(resolve, 1000))
    } else throw new Error('Unknown phase: ' + name)
  }

  async function top() {
    fixture.doc.selection.blur()
    fixture.viewport.scrollTop = 0
    await fixture.doc.navigateToBlock(fixture.objects[0].id)
    fixture.doc.selection.blur()
    await frames(10)
  }
  async function prepareTyping() {
    await top()
    const {doc, viewport, objects} = fixture
    const block = doc.getBlockById(objects[0].textId)
    fixture.beforeTyping = block.textContent()
    doc.selection.setCursorAtBlock(block, false, false)
    fixture.keyHandler = event => {
      if (event.inputType !== 'insertText') return
      const meter = active, start = performance.now()
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (meter === active) meter.keyMs.push(performance.now() - start)
      }))
    }
    viewport.addEventListener('beforeinput', fixture.keyHandler, true)
    await frames(3)
  }
  async function finishTyping(typed) {
    await frames(5)
    fixture.viewport.removeEventListener('beforeinput', fixture.keyHandler, true)
    const actual = fixture.doc.getBlockById(fixture.objects[0].textId).textContent()
    if (actual !== fixture.beforeTyping + typed) throw new Error('Native input text mismatch')
    if (active.keyMs.length !== typed.length) throw new Error('Missing beforeinput timing samples')
  }
  async function dispose() {
    observer?.disconnect()
    observer = null
    destroy(fixture)
    fixture = null
    await frames(2)
  }
  window.textFitPerf = {mount, begin, end, run, top, prepareTyping, finishTyping, dispose}
})()
