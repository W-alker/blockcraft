import * as Y from 'yjs';
import type {IInlineNodeAttrs} from '../../model';
import {normalizeParagraphTextDefaults} from '../../block-std/typography/paragraph-style';

/** 段落标记属于文档；调用方将此写入放进所属格式/文本操作的事务。 */
export class ParagraphFormatManager {
  constructor(private readonly doc: BlockCraft.Doc) {}

  remember(blockId: string, attrs: IInlineNodeAttrs | undefined, onlyEmpty = false): void {
    if (this.doc.isPlainTextBlock?.(blockId)) return;
    const block = this.doc.model?.getYBlock?.(blockId);
    const text = block?.get('children');
    if (!(text instanceof Y.Text) || (onlyEmpty && text.length > 0)) return;
    const defaults = normalizeParagraphTextDefaults(attrs);
    const previous = normalizeParagraphTextDefaults(this.doc.model.getProps(blockId)?.['textDefaults']);
    const keys = Object.keys(defaults);
    if (keys.length === Object.keys(previous).length && keys.every(key => defaults[key] === previous[key])) return;
    this.doc.crud.updateBlockProps(blockId, {textDefaults: keys.length ? defaults : null});
  }
}
