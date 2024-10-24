import {IBlockModel, IBlockProps, IEditableBlockModel} from "../../core";

export interface IImageBlockProps extends IBlockProps {
  src: string,
  width: number,
  height: number,
  align: 'start' | 'center' | 'end'
}

export interface IImgBlockModel extends IBlockModel{
  props: IImageBlockProps
  children: IEditableBlockModel[]
}

export type IFileUploader = {
  uploadImg(file: File): Promise<string>;
}
