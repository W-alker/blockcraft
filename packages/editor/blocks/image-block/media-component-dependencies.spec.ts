import {ImageBlockComponent} from './image.block'
import {VideoBlockComponent} from '../video-block/video.block'
import {ShapeResizerComponent} from '../shape-block/shape-resizer.component'
import {BcResourcePlaceholderDirective} from '../../components/resource-placeholder/resource-placeholder.directive'

// Imports must resolve before Angular builds the media view, including readonly previews.
describe('media block standalone dependencies', () => {
  for (const component of [ImageBlockComponent, VideoBlockComponent]) {
    it(`${component.name} resolves its resizer and resource placeholder`, () => {
      const definition = (component as any).ɵcmp
      const dependencies = definition.directiveDefs().map((dependency: any) => dependency.type)
      expect(dependencies).toContain(ShapeResizerComponent)
      expect(dependencies).toContain(BcResourcePlaceholderDirective)
    })
  }
})
