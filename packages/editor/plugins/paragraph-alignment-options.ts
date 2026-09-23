import type {IBlockProps} from '../framework/model';

type ParagraphAlign = NonNullable<IBlockProps['textAlign']> | 'left';

export const PARAGRAPH_ALIGNMENT_OPTIONS: {value: ParagraphAlign; icon: string; title: string}[] = [
  {value: 'left', icon: 'bc_zuoduiqi', title: '左对齐'},
  {value: 'center', icon: 'bc_juzhongduiqi', title: '居中'},
  {value: 'right', icon: 'bc_youduiqi', title: '右对齐'},
  {value: 'justify', icon: 'bc_suojinheduiqi', title: '两端对齐'},
  {value: 'distributed', icon: 'bc_hengxiangfenbu', title: '分散对齐'},
];
