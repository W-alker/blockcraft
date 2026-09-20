import {TestBed} from '@angular/core/testing'
import {Subject} from 'rxjs'
import * as Y from 'yjs'
import {VideoBlockComponent} from './video.block'
import {VideoBlockSchema} from './index'

// 真实 Angular 模板和 DOM；文件服务为只读测试替身，不执行上传。
describe('VideoBlockComponent persisted poster rendering', () => {
  it('renders a saved poster after snapshot reload, and omits an empty poster attribute', async () => {
    await TestBed.configureTestingModule({imports: [VideoBlockComponent]}).compileComponents()
    const poster = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
    for (const savedPoster of [poster, undefined]) {
      const snapshot = JSON.parse(JSON.stringify(VideoBlockSchema.createSnapshot({
        sourceType: 'local', url: 'https://example.invalid/clip.mp4', poster: savedPoster,
      })))
      const ydoc = new Y.Doc()
      const yblock = new Y.Map<unknown>([
        ['props', new Y.Map(Object.entries(snapshot.props))],
        ['meta', new Y.Map()],
        ['children', new Y.Array()],
      ])
      ydoc.getMap('blocks').set(snapshot.id, yblock)
      const fixture = TestBed.createComponent(VideoBlockComponent)
      fixture.componentRef.setInput('model', snapshot)
      fixture.componentRef.setInput('yBlock', yblock)
      fixture.componentRef.setInput('doc', {
        isReadonly: true,
        injector: {get: () => ({isLocalObjectURL: () => false})},
        objectSizing: {
          resolve: () => ({width: 320, height: 180, ar: 16 / 9, source: 'ratio'}),
          widthChange$: new Subject(),
          rootContentWidth: 640,
        },
      })
      document.body.append(fixture.nativeElement)
      try {
        fixture.detectChanges()
        const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement
        expect(video).not.toBeNull()
        expect(video.getAttribute('poster')).toBe(savedPoster ?? null)
        expect(getComputedStyle(video).objectFit).toBe('contain')
        expect(video.getBoundingClientRect().width).toBe(320)
      } finally {
        fixture.destroy()
        fixture.nativeElement.remove()
        ydoc.destroy()
      }
    }
  })
})
