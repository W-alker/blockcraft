import {HtmlToDelta} from 'quill-delta-from-html';
import {DeltaInsert, IBlockModel, SchemaStore} from "../../../core";

enum BlockType {
  'paragraph' = 'paragraph',
  'heading-one' = 'heading-one',
  'heading-two' = 'heading-two',
  'heading-three' = 'heading-three',
  'heading-four' = 'heading-four',
  'bullet-list' = 'bullet-list',
  'ordered-list' = 'ordered-list',
  'image' = 'image',
  'code' = 'code',
  '' = ''
}

const AttrMap = {
  color: 's:c',
  background: 's:bc',
  bold: 'a:bold',
  italic: 'a:italic',
  underline: 'a:underline',
  strike: 'a:strike',
}

const htmlTagFilterRegex = /<\/?[^>]+(>|$)/;

export class HtmlConverter {

  // @ts-ignore
  private htmlToDelta = new HtmlToDelta();

  constructor(
    public readonly schemaStore: SchemaStore
  ) {
  }

  convertToDeltas(html: string): DeltaInsert[] {
    const delta = this.htmlToDelta.convert(html);
    const deltas: DeltaInsert[] = []
    delta.ops.forEach((op) => {
      if (op.insert === '\n') {
        const item = deltas[deltas.length - 1]

        if (op.attributes?.['code-block']) {
          item.attributes ||= {}
          item.attributes!['a:code'] = true
          return;
        }

      }

      if (op.attributes?.['link']) {
        deltas.push({
          // @ts-ignore
          insert: {'link': op.insert},
          // @ts-ignore
          attributes: {'d:href': op.attributes['link']}
        })
        return
      }

      if (typeof op.insert === 'object') {

        if (op.insert['image']) {
          deltas.push({
            // @ts-ignore
            insert: {image: op.insert['image']},
          })
          return
        }

      }

      const delta: DeltaInsert = {
        insert: op.insert as string,
      }
      const attrs = this.convertAttrs(op.attributes)
      attrs && (delta.attributes = attrs)
      deltas.push(delta)
    })
    return deltas
  }

  convertToBlocks(html: string): IBlockModel[] {
    const delta = this.htmlToDelta.convert(html);
    console.log('convert to delta', JSON.parse(JSON.stringify(delta.ops)))
    const models: IBlockModel[] = []
    const splitDelta: { delta: DeltaInsert[], type: `${BlockType}` }[] = [{delta: [], type: ''}]
    delta.ops.forEach((op) => {
      const item = splitDelta[splitDelta.length - 1]
      if (op.insert === '\n') {

        if (op.attributes?.['code-block']) {
          const last = item.delta[item.delta.length - 1]
          if (typeof last.insert !== 'string') return;

          // code block
          if (htmlTagFilterRegex.test(last.insert) && this.schemaStore.has('image')) {
            const p = document.createElement('p')
            p.innerHTML = last.insert
            p.querySelectorAll('br').forEach(v => {
              v.replaceWith('\n')
            })
            last.insert = p.textContent!
            item.type = 'code'
            return;
          }

          // inline code
          item.delta[item.delta.length - 1].attributes ||= {}
          item.delta[item.delta.length - 1].attributes!['a:code'] = true
          item.delta[item.delta.length - 1].insert = (item.delta[item.delta.length - 1].insert as string).replace(/<\/?[^>]+(>|$)/g, '')
          item.type = 'paragraph'
          return;
        }

        if (op.attributes && !item.type) {
          item.type = this.attr2Type(op.attributes as any) as `${BlockType}` || 'paragraph'
        }
        splitDelta.push({delta: [], type: ''})
      }

      if (typeof op.insert === 'object') {

        if (op.insert['image']) {
          item.delta.push(op as DeltaInsert)
          item.type = 'image'
        }
        splitDelta.push({delta: [], type: ''})

        return
      }

      if (op.attributes?.['link']) {
        item.delta.push({
          // @ts-ignore
          insert: {'link': op.insert},
          // @ts-ignore
          attributes: {'d:href': op.attributes['link']}
        })
        return;
      }

      const delta: DeltaInsert = {
        insert: op.insert as string,
      }
      const attrs = this.convertAttrs(op.attributes)
      attrs && (delta.attributes = attrs)
      item.delta.push(delta)
    })

    // console.log(splitDelta)

    splitDelta.filter(v => v.type).forEach((item) => {
      if (item.type === 'image') {
        const delta = item.delta[0]
        // @ts-ignore
        models.push(this.schemaStore.create('image', [delta.insert['image'], delta.attributes?.['width']]))
        return
      }
      models.push(this.schemaStore.create(item.type, [item.delta]))
    })
    return models
  }

  private attr2Type(attributes: Record<string, string | number>) {
    if (attributes['header']) {
      return ['heading-one', 'heading-two', 'heading-three', 'heading-four'][attributes['header'] as number]
    }
    if (attributes['list']) {
      return attributes['list'] + '-list'
    }
    return 'paragraph'
  }

  private convertAttrs(attrs?: Record<string, any>): DeltaInsert['attributes'] {
    if (!attrs) return undefined
    for (const key in attrs) {
      // @ts-ignore
      if (AttrMap[key]) {
        // @ts-ignore
        attrs[AttrMap[key]] = attrs[key]
        delete attrs[key]
      } else {
        delete attrs[key]
      }
    }
    return attrs
  }
}
