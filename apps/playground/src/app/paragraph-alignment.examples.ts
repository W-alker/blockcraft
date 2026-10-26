import type {DeltaInsert, IBlockProps, IBlockSnapshot} from '@ccc/blockcraft';

/** Every load creates fresh native snapshots; all examples remain editable. */
export function createParagraphAlignmentExamples(doc: BlockCraft.Doc): IBlockSnapshot[] {
  const image = new URL('assets/debug/paragraph-alignment.svg', document.baseURI).href;
  const body = '这段文字用于观察两侧边缘和字间距。图片旁的文字应避开图片，下方恢复整行宽度。';
  const children: IBlockSnapshot[] = [];
  const paragraph = (text: string | DeltaInsert[], props: IBlockProps = {}) =>
    doc.schemas.createSnapshot('paragraph', [text, props]);
  const title = (text: string) => paragraph(text, {heading: 2});
  children.push(title('段落对齐测试案例'));
  children.push(paragraph('使用顶部“对齐方式”切换左／中／右／两端／分散对齐。检查末行、软换行、图片边界，并尝试输入、选择、撤销、缩放与分页。案例以一次操作插入，可整体撤销。'));

  for (const textAlign of ['justify', 'distributed'] as const) {
    const name = textAlign === 'justify' ? '两端对齐' : '分散对齐';
    children.push(title(`${name} · 多行、短行与软换行`));
    children.push(paragraph(body.repeat(4), {textAlign}));
    children.push(paragraph('短行文字', {textAlign}));
    children.push(paragraph('软换行之前\n软换行之后', {textAlign}));
    children.push(title(`${name} · 行内嵌入节点`));
    children.push(paragraph([
      {insert:'文字与行内图片 '}, {insert:{image},attributes:{width:70,height:45}},
      {insert:' 日期 '}, {insert:{date:'2026-09-23'},attributes:{format:'YYYY年M月D日'}},
      {insert:' 提及 '}, {insert:{mention:'张三'},attributes:{mentionId:'alignment-demo'}},
      {insert:' 图标 '}, {insert:{icon:'bc_icon bc_wenben'}}, {insert:' 加粗和链接 ',attributes:{'a:bold':true,'a:link':'https://example.com'}},
      {insert:'English words and 中文混排。'},
    ],{textAlign}));
    for (const side of ['right','left','auto'] as const) {
      const label=side==='right'?'图片居左，文字右绕':side==='left'?'图片居右，文字左绕':'图片居中，文字双侧环绕';
      children.push(title(`${name} · ${label}`));
      children.push(paragraph([
        {insert:{image},attributes:{width:180,height:116,wrap:true,side,x:side==='right'?0:side==='left'?0.75:0.36,gap:12}},
        {insert:body.repeat(9)},
      ],{textAlign}));
    }
    children.push(title(`${name} · 列表与窄表格`));
    for (const flavour of ['bullet','ordered','todo'] as const) {
      children.push(doc.schemas.createSnapshot(flavour,[body.repeat(2),{textAlign}]));
    }
    const table=doc.schemas.createSnapshot('table',[1,1]);
    table.props['colWidths']=[300];
    const row = table.children[0] as IBlockSnapshot;
    const cell = row.children[0] as IBlockSnapshot;
    cell.children=[paragraph(body.repeat(2),{textAlign}),paragraph('表格短行',{textAlign})];
    children.push(table);
  }
  return children;
}
