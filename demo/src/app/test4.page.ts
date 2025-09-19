import {Component, ElementRef} from "@angular/core";
import {Pagination} from './tiptap-pagination-breaks';
import {Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Highlight from '@tiptap/extension-highlight'

@Component({
  selector: "app-test4",
  template: `
  <div class="editor"></div>
  `,
  styles: [`
    .editor {
      margin: 30px;
      outline: 1px solid #ccc;
    }
  `],
  standalone: true
})
export class Test4Page {

  constructor(
    private hostElement: ElementRef
  ) {
  }

  ngAfterViewInit() {
    const editor = new Editor({
      element: document.querySelector('.editor'),
      content: `<p>Example Text</p>`,
      editable: true,
      extensions: [
        Document, Paragraph, Text,
        StarterKit, Highlight,
        Pagination.configure({
          pageHeight: 1056, // default height of the page
          pageWidth: 816,   // default width of the page
          pageMargin: 96,   // default margin of the page
        }),
      ]
    })
  }

}
