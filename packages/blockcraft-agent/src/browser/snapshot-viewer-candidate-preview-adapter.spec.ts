import {BlockNodeType, type IBlockSnapshot} from '@ccc/blockcraft'
import {createSnapshotViewerCandidatePreviewAdapter} from './snapshot-viewer-candidate-preview-adapter'

describe('Snapshot Viewer candidate preview adapter', () => {
  it('rasterizes an isolated Snapshot and cleans up its offscreen surface', async () => {
    const snapshot: IBlockSnapshot = {
      id: 'root-preview',
      flavour: 'root',
      nodeType: BlockNodeType.root,
      props: {},
      meta: {},
      children: [
        {
          id: 'paragraph-preview',
          flavour: 'paragraph',
          nodeType: BlockNodeType.editable,
          props: {depth: 0, heading: 2, backColor: '#eef4ff'},
          meta: {},
          children: [
            {insert: 'Candidate ', attributes: {'a:bold': true}},
            {insert: 'preview'},
          ],
        },
        {
          id: 'mermaid-preview',
          flavour: 'mermaid',
          nodeType: BlockNodeType.block,
          props: {mode: 'graph'},
          meta: {},
          children: [{
            id: 'mermaid-source-preview',
            flavour: 'mermaid-textarea',
            nodeType: BlockNodeType.editable,
            props: {depth: 0},
            meta: {},
            children: [{insert: 'graph TD;A-->B;'}],
          }],
        },
      ],
    }
    let mermaidRendered = false
    const adapter = createSnapshotViewerCandidatePreviewAdapter({
      surfaceWidth: 640,
      maxImageWidth: 800,
      maxImageHeight: 600,
      viewerOptions: {
        enhancers: {
          mermaid: {
            render: async () => {
              await new Promise(resolve => setTimeout(resolve, 20))
              mermaidRendered = true
              return '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><text x="4" y="24">A → B</text></svg>'
            },
          },
        },
      },
    })

    const preview = await adapter.render({
      candidatePreviewVersion: 1,
      snapshot,
      affectedBlockIds: ['paragraph-preview', 'mermaid-preview'],
      operationTargets: [{operationIndex: 0, blockIds: ['paragraph-preview', 'mermaid-preview']}],
      candidate: {
        summary: 'Preview paragraph',
        operations: [{
          kind: 'update-block-props',
          blockId: 'paragraph-preview',
          props: {heading: 2},
        }],
      },
      attempt: 1,
    })

    expect(preview.image.mimeType).toBe('image/png')
    expect(preview.image.dataUrl).toMatch(/^data:image\/png;base64,/)
    expect(preview.image.dataUrl.length).toBeGreaterThan(100)
    expect(preview.image.width).toBeGreaterThan(1)
    expect(preview.image.height).toBeGreaterThan(1)
    expect(mermaidRendered).toBeTrue()
    expect(preview.capturedBlockIds).toEqual(['paragraph-preview', 'mermaid-preview'])
    expect(document.querySelector('.bc-agent-candidate-preview')).toBeNull()
  })
})
