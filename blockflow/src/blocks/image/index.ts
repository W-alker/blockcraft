import {ImageBlock} from "./image.block";
import {IImageBlockProps} from "./type";
import {BlockSchema} from "../../core";
export * from './token'

export const ImageSchema: BlockSchema<IImageBlockProps> = {
  flavour: 'image',
  nodeType: 'block',
  render: ImageBlock,
  icon: 'bf_icon bf_tupian-color',
  svgIcon: 'bf_tupian-color',
  label: '图片',
  onCreate: (src: string, width?: number) => {
    if(!src) throw new Error('src is required')
    return {
      props: () => ({
        src,
        width: width || 400,
        height: 0,
        align: 'center'
      }),
      children: []
    }
  }
}
