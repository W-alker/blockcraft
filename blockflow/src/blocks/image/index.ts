import {BlockSchema} from "@core";
import {ImageBlock} from "./image.block";
import {IImageBlockProps} from "./type";
export * from './token'

export const ImageSchema: BlockSchema<IImageBlockProps> = {
  flavour: 'image',
  nodeType: 'block',
  render: ImageBlock,
  icon: 'editor editor-picture',
  label: '图片',
  onCreate: (src: string) => {
    if(!src) throw new Error('src is required')
    return {
      props: () => ({
        src,
        width: 400,
        height: 0,
        align: 'center'
      }),
      children: []
    }
  }
}
