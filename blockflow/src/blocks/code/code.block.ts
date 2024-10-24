import {ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild} from "@angular/core";
import {BaseBlock, EditableBlock, getCurrentCharacterRange, setSelection} from "../../core";
// import {EditorState} from "@codemirror/state"
// import {EditorView, keymap} from "@codemirror/view"
// import {defaultKeymap} from "@codemirror/commands"
// import {javascript} from "@codemirror/lang-javascript"
import {ICodeBlockModel} from "./type";
import {CdkConnectedOverlay} from "@angular/cdk/overlay";
import hljs from 'highlight.js';

@Component({
    selector: 'div.code-block',
    templateUrl: './code.block.html',
    styleUrls: ['./code.block.scss'],
    standalone: true,
    imports: [
        CdkConnectedOverlay
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodeBlock extends EditableBlock<ICodeBlockModel> {

    @ViewChild('highlighter', {read: ElementRef}) highlighter!: ElementRef<HTMLDivElement>

    override ngAfterViewInit() {
        super.ngAfterViewInit();
        //
        // let startState = EditorState.create({
        //     doc: "Hello World",
        //     extensions: [keymap.of(defaultKeymap), javascript()],
        // })
        // let view = new EditorView({
        //     state: startState,
        //     parent: this.hostEl.nativeElement,
        // })
        this.highlight()
        this.yText.observe((e) => {
            this.highlight()
        })
    }

    highlight() {
        hljs.configure({
            classPrefix: ''
        })
        const text = this.containerEle.textContent!
        const token = hljs.highlight('javascript', text);
        this.highlighter.nativeElement.innerHTML = token.value;
    }

    bindEvent() {

    }

}
