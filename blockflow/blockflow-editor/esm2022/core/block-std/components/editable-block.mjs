import { Component, HostBinding, Input } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { BaseBlock } from "./base-block";
import { USER_CHANGE_SIGNAL } from "../../yjs";
import { deleteContent, insertContent } from "../utils";
import { setCharacterRange } from "../../utils";
import * as i0 from "@angular/core";
export class EditableBlock extends BaseBlock {
    constructor() {
        super(...arguments);
        this.placeholder = '';
        this._textAlign = 'left';
        this._textIndent = '0';
        this.oldHasContent = false;
    }
    ngOnInit() {
        super.ngOnInit();
        this.yText = this.model.getYText();
        this.oldHasContent = !!this.textLength;
        this._textAlign !== this.props.textAlign && (this._textAlign = this.props.textAlign || 'left');
        this._textIndent = (this.props.indent || 0) * 2 + 'em';
        this.cdr.markForCheck();
        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
            if (v.type === 'props') {
                this._textAlign !== this.props.textAlign && (this._textAlign = this.props.textAlign || 'left');
                parseInt(this._textIndent) / 2 !== this.props.indent && (this._textIndent = (this.props.indent || 0) * 2 + 'em');
                this.cdr.markForCheck();
            }
        });
        this.yText.observe((event, tr) => {
            this.setPlaceholder();
            // console.log(this.getTextContent(), '\n', this.containerEle.textContent, this.getTextDelta(), this.getTextContent() === this.containerEle.textContent)
            if (tr.origin === USER_CHANGE_SIGNAL)
                return;
            this.applyDeltaToView(event.changes.delta, this.controller.undoRedo$.value);
            // console.log('再验证', this.getTextContent() === this.containerEle.textContent)
            this.model.children.splice(0, this.model.children.length, ...this.yText.toDelta());
        });
    }
    setPlaceholder() {
        if (!this.placeholder || (this.textLength && this.oldHasContent) || (!this.textLength && !this.oldHasContent))
            return;
        this.oldHasContent = !!this.textLength;
        if (this.textLength)
            this.containerEle.classList.remove('placeholder-visible');
        else
            this.containerEle.classList.add('placeholder-visible');
    }
    ngAfterViewInit() {
        super.ngAfterViewInit();
        this.containerEle = this.hostEl.nativeElement.querySelector('.editable-container') || this.hostEl.nativeElement;
        this.placeholder && this.containerEle.setAttribute('placeholder', this.placeholder);
        this.forceRender();
        this.setPlaceholder();
        this.controller.readonly$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(readonly => {
            if (readonly)
                this.containerEle.removeAttribute('contenteditable');
            else
                this.containerEle.setAttribute('contenteditable', 'true');
        });
    }
    getTextDelta() {
        return this.yText.toDelta();
    }
    getTextContent() {
        return this.yText.toString();
    }
    get textLength() {
        return this.yText.length;
    }
    setSelection(start, end) {
        setCharacterRange(this.containerEle, start, end ?? start);
    }
    forceRender() {
        const delta = this.getTextDelta();
        this.containerEle.innerHTML = '';
        if (delta.length) {
            const fragment = document.createDocumentFragment();
            for (const insert of delta) {
                if (!insert.insert)
                    continue;
                fragment.appendChild(this.controller.inlineManger.createView(insert));
            }
            this.containerEle.appendChild(fragment);
            return;
        }
    }
    applyDelta(deltas, setSelection = true) {
        // console.log('applyDeltaToView', deltas)
        this.controller.transact(() => {
            this.yText.applyDelta(deltas);
            this.applyDeltaToView(deltas, setSelection);
        }, USER_CHANGE_SIGNAL);
    }
    applyDeltaToModel(deltas) {
        console.log('applyDeltaToModel', deltas);
        this.yText.applyDelta(deltas);
    }
    applyDeltaToView(deltas, withSelection = false, containerEle = this.containerEle) {
        let _range;
        // console.log('applyDeltaToModel', deltas)
        let retain = 0;
        for (const delta of deltas) {
            if (delta.retain) {
                if (delta.attributes)
                    this.forceRender();
                withSelection && (_range = { start: retain, end: retain + delta.retain });
                retain += delta.retain;
            }
            else if (delta.insert) {
                insertContent(containerEle, retain, delta, this.controller.inlineManger.createView.bind(this.controller.inlineManger));
                retain += typeof delta.insert === 'string' ? delta.insert.length : 1;
                withSelection && (_range = { start: retain, end: retain });
            }
            else if (delta.delete) {
                deleteContent(containerEle, retain, delta.delete);
                withSelection && (_range = { start: retain, end: retain });
            }
        }
        if (withSelection && _range) {
            // console.log('setSelection', _range)
            setCharacterRange(containerEle, _range.start, _range.end);
        }
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: EditableBlock, deps: null, target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.3.12", type: EditableBlock, isStandalone: true, selector: ".editable-container", inputs: { placeholder: "placeholder" }, host: { properties: { "style.text-align": "this._textAlign", "style.margin-left": "this._textIndent" } }, usesInheritance: true, ngImport: i0, template: ``, isInline: true }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: EditableBlock, decorators: [{
            type: Component,
            args: [{
                    selector: '.editable-container',
                    template: ``,
                    imports: [],
                    standalone: true,
                }]
        }], propDecorators: { placeholder: [{
                type: Input
            }], _textAlign: [{
                type: HostBinding,
                args: ['style.text-align']
            }], _textIndent: [{
                type: HostBinding,
                args: ['style.margin-left']
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdGFibGUtYmxvY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2NvcmUvYmxvY2stc3RkL2NvbXBvbmVudHMvZWRpdGFibGUtYmxvY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFDLFNBQVMsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFDLE1BQU0sZUFBZSxDQUFDO0FBQzVELE9BQU8sRUFBQyxrQkFBa0IsRUFBQyxNQUFNLDRCQUE0QixDQUFDO0FBRTlELE9BQU8sRUFBQyxTQUFTLEVBQUMsTUFBTSxjQUFjLENBQUM7QUFDdkMsT0FBTyxFQUFDLGtCQUFrQixFQUFDLE1BQU0sV0FBVyxDQUFDO0FBQzdDLE9BQU8sRUFBQyxhQUFhLEVBQUUsYUFBYSxFQUFDLE1BQU0sVUFBVSxDQUFDO0FBRXRELE9BQU8sRUFBQyxpQkFBaUIsRUFBQyxNQUFNLGFBQWEsQ0FBQzs7QUFROUMsTUFBTSxPQUFPLGFBQXVFLFNBQVEsU0FBZ0I7SUFONUc7O1FBT1csZ0JBQVcsR0FBVyxFQUFFLENBQUE7UUFHdkIsZUFBVSxHQUFXLE1BQU0sQ0FBQTtRQUczQixnQkFBVyxHQUFXLEdBQUcsQ0FBQTtRQWlDM0Isa0JBQWEsR0FBRyxLQUFLLENBQUE7S0E0RjlCO0lBeEhVLFFBQVE7UUFDZixLQUFLLENBQUMsUUFBUSxFQUFFLENBQUE7UUFDaEIsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFBO1FBQ2xDLElBQUksQ0FBQyxhQUFhLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUE7UUFFdEMsSUFBSSxDQUFDLFVBQVUsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLElBQUksTUFBTSxDQUFDLENBQUE7UUFDOUYsSUFB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QUNaLE9BQU8sRUFBRSxFQUFFO29CQUNYLFVBQVUsRUFBRSxJQUFJO2lCQUNqQjs4QkFFVSxXQUFXO3NCQUFuQixLQUFLO2dCQUdJLFVBQVU7c0JBRG5CLFdBQVc7dUJBQUMsa0JBQWtCO2dCQUlyQixXQUFXO3NCQURwQixXQUFXO3VCQUFDLG1CQUFtQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7Q29tcG9uZW50LCBIb3N0QmluZGluZywgSW5wdXR9IGZyb20gXCJAYW5ndWxhci9jb3JlXCI7XG5pbXBvcnQge3Rha2VVbnRpbERlc3Ryb3llZH0gZnJvbSBcIkBhbmd1bGFyL2NvcmUvcnhqcy1pbnRlcm9wXCI7XG5pbXBvcnQge0NoYXJhY3RlckluZGV4LCBEZWx0YUluc2VydCwgRGVsdGFPcGVyYXRpb24sIElDaGFyYWN0ZXJSYW5nZSwgSUVkaXRhYmxlQmxvY2tNb2RlbH0gZnJvbSBcIi4uLy4uL3R5cGVzXCI7XG5pbXBvcnQge0Jhc2VCbG9ja30gZnJvbSBcIi4vYmFzZS1ibG9ja1wiO1xuaW1wb3J0IHtVU0VSX0NIQU5HRV9TSUdOQUx9IGZyb20gXCIuLi8uLi95anNcIjtcbmltcG9ydCB7ZGVsZXRlQ29udGVudCwgaW5zZXJ0Q29udGVudH0gZnJvbSBcIi4uL3V0aWxzXCI7XG5pbXBvcnQgWSBmcm9tICcuLi8uLi95anMnXG5pbXBvcnQge3NldENoYXJhY3RlclJhbmdlfSBmcm9tIFwiLi4vLi4vdXRpbHNcIjtcblxuQENvbXBvbmVudCh7XG4gIHNlbGVjdG9yOiAnLmVkaXRhYmxlLWNvbnRhaW5lcicsXG4gIHRlbXBsYXRlOiBgYCxcbiAgaW1wb3J0czogW10sXG4gIHN0YW5kYWxvbmU6IHRydWUsXG59KVxuZXhwb3J0IGNsYXNzIEVkaXRhYmxlQmxvY2s8TW9kZWwgZXh0ZW5kcyBJRWRpdGFibGVCbG9ja01vZGVsID0gSUVkaXRhYmxlQmxvY2tNb2RlbD4gZXh0ZW5kcyBCYXNlQmxvY2s8TW9kZWw+IHtcbiAgQElucHV0KCkgcGxhY2Vob2xkZXI6IHN0cmluZyA9ICcnXG5cbiAgQEhvc3RCaW5kaW5nKCdzdHlsZS50ZXh0LWFsaWduJylcbiAgcHJvdGVjdGVkIF90ZXh0QWxpZ246IHN0cmluZyA9ICdsZWZ0J1xuXG4gIEBIb3N0QmluZGluZygnc3R5bGUubWFyZ2luLWxlZnQnKVxuICBwcm90ZWN0ZWQgX3RleHRJbmRlbnQ6IHN0cmluZyA9ICcwJ1xuXG4gIHB1YmxpYyB5VGV4dCE6IFkuVGV4dFxuICBwdWJsaWMgY29udGFpbmVyRWxlITogSFRNTEVsZW1lbnRcblxuICBvdmVycmlkZSBuZ09uSW5pdCgpIHtcbiAgICBzdXBlci5uZ09uSW5pdCgpXG4gICAgdGhpcy55VGV4dCA9IHRoaXMubW9kZWwuZ2V0WVRleHQoKVxuICAgIHRoaXMub2xkSGFzQ29udGVudCA9ICEhdGhpcy50ZXh0TGVuZ3RoXG5cbiAgICB0aGlzLl90ZXh0QWxpZ24gIT09IHRoaXMucHJvcHMudGV4dEFsaWduICYmICh0aGlzLl90ZXh0QWxpZ24gPSB0aGlzLnByb3BzLnRleHRBbGlnbiB8fCAnbGVmdCcpXG4gICAgdGhpcy5fdGV4dEluZGVudCA9ICh0aGlzLnByb3BzLmluZGVudCB8fCAwKSAqIDIgKyAnZW0nXG4gICAgdGhpcy5jZHIubWFya0ZvckNoZWNrKClcblxuICAgIHRoaXMubW9kZWwudXBkYXRlJC5waXBlKHRha2VVbnRpbERlc3Ryb3llZCh0aGlzLmRlc3Ryb3lSZWYpKS5zdWJzY3JpYmUodiA9PiB7XG4gICAgICBpZiAodi50eXBlID09PSAncHJvcHMnKSB7XG4gICAgICAgIHRoaXMuX3RleHRBbGlnbiAhPT0gdGhpcy5wcm9wcy50ZXh0QWxpZ24gJiYgKHRoaXMuX3RleHRBbGlnbiA9IHRoaXMucHJvcHMudGV4dEFsaWduIHx8ICdsZWZ0JylcbiAgICAgICAgcGFyc2VJbnQodGhpcy5fdGV4dEluZGVudCkgLyAyICE9PSB0aGlzLnByb3BzLmluZGVudCAmJiAodGhpcy5fdGV4dEluZGVudCA9ICh0aGlzLnByb3BzLmluZGVudCB8fCAwKSAqIDIgKyAnZW0nKVxuICAgICAgICB0aGlzLmNkci5tYXJrRm9yQ2hlY2soKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICB0aGlzLnlUZXh0Lm9ic2VydmUoKGV2ZW50LCB0cikgPT4ge1xuICAgICAgdGhpcy5zZXRQbGFjZWhvbGRlcigpXG4gICAgICAvLyBjb25zb2xlLmxvZyh0aGlzLmdldFRleHRDb250ZW50KCksICdcXG4nLCB0aGlzLmNvbnRhaW5lckVsZS50ZXh0Q29udGVudCwgdGhpcy5nZXRUZXh0RGVsdGEoKSwgdGhpcy5nZXRUZXh0Q29udGVudCgpID09PSB0aGlzLmNvbnRhaW5lckVsZS50ZXh0Q29udGVudClcblxuICAgICAgaWYgKHRyLm9yaWdpbiA9PT0gVVNFUl9DSEFOR0VfU0lHTkFMKSByZXR1cm5cbiAgICAgIHRoaXMuYXBwbHlEZWx0YVRvVmlldyhldmVudC5jaGFuZ2VzLmRlbHRhIGFzIERlbHRhT3BlcmF0aW9uW10sIHRoaXMuY29udHJvbGxlci51bmRvUmVkbyQudmFsdWUpXG4gICAgICAvLyBjb25zb2xlLmxvZygn5YaN6aqM6K+BJywgdGhpcy5nZXRUZXh0Q29udGVudCgpID09PSB0aGlzLmNvbnRhaW5lckVsZS50ZXh0Q29udGVudClcbiAgICAgIHRoaXMubW9kZWwuY2hpbGRyZW4uc3BsaWNlKDAsIHRoaXMubW9kZWwuY2hpbGRyZW4ubGVuZ3RoLCAuLi50aGlzLnlUZXh0LnRvRGVsdGEoKSlcbiAgICB9KVxuICB9XG5cbiAgcHJpdmF0ZSBvbGRIYXNDb250ZW50ID0gZmFsc2VcblxuICBwcml2YXRlIHNldFBsYWNlaG9sZGVyKCkge1xuICAgIGlmICghdGhpcy5wbGFjZWhvbGRlciB8fCAodGhpcy50ZXh0TGVuZ3RoICYmIHRoaXMub2xkSGFzQ29udGVudCkgfHwgKCF0aGlzLnRleHRMZW5ndGggJiYgIXRoaXMub2xkSGFzQ29udGVudCkpIHJldHVyblxuICAgIHRoaXMub2xkSGFzQ29udGVudCA9ICEhdGhpcy50ZXh0TGVuZ3RoXG4gICAgaWYgKHRoaXMudGV4dExlbmd0aCkgdGhpcy5jb250YWluZXJFbGUuY2xhc3NMaXN0LnJlbW92ZSgncGxhY2Vob2xkZXItdmlzaWJsZScpXG4gICAgZWxzZSB0aGlzLmNvbnRhaW5lckVsZS5jbGFzc0xpc3QuYWRkKCdwbGFjZWhvbGRlci12aXNpYmxlJylcbiAgfVxuXG4gIG92ZXJyaWRlIG5nQWZ0ZXJWaWV3SW5pdCgpIHtcbiAgICBzdXBlci5uZ0FmdGVyVmlld0luaXQoKVxuICAgIHRoaXMuY29udGFpbmVyRWxlID0gdGhpcy5ob3N0RWwubmF0aXZlRWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuZWRpdGFibGUtY29udGFpbmVyJykgfHwgdGhpcy5ob3N0RWwubmF0aXZlRWxlbWVudFxuICAgIHRoaXMucGxhY2Vob2xkZXIgJiYgdGhpcy5jb250YWluZXJFbGUuc2V0QXR0cmlidXRlKCdwbGFjZWhvbGRlcicsIHRoaXMucGxhY2Vob2xkZXIpXG5cbiAgICB0aGlzLmZvcmNlUmVuZGVyKClcblxuICAgIHRoaXMuc2V0UGxhY2Vob2xkZXIoKVxuICAgIHRoaXMuY29udHJvbGxlci5yZWFkb25seSQucGlwZSh0YWtlVW50aWxEZXN0cm95ZWQodGhpcy5kZXN0cm95UmVmKSkuc3Vic2NyaWJlKHJlYWRvbmx5ID0+IHtcbiAgICAgIGlmIChyZWFkb25seSkgdGhpcy5jb250YWluZXJFbGUucmVtb3ZlQXR0cmlidXRlKCdjb250ZW50ZWRpdGFibGUnKVxuICAgICAgZWxzZSB0aGlzLmNvbnRhaW5lckVsZS5zZXRBdHRyaWJ1dGUoJ2NvbnRlbnRlZGl0YWJsZScsICd0cnVlJylcbiAgICB9KVxuICB9XG5cbiAgZ2V0VGV4dERlbHRhKCkge1xuICAgIHJldHVybiB0aGlzLnlUZXh0LnRvRGVsdGEoKVxuICB9XG5cbiAgZ2V0VGV4dENvbnRlbnQoKSB7XG4gICAgcmV0dXJuIHRoaXMueVRleHQudG9TdHJpbmcoKVxuICB9XG5cbiAgZ2V0IHRleHRMZW5ndGgoKSB7XG4gICAgcmV0dXJuIHRoaXMueVRleHQubGVuZ3RoXG4gIH1cblxuICBzZXRTZWxlY3Rpb24oc3RhcnQ6IENoYXJhY3RlckluZGV4LCBlbmQ/OiBDaGFyYWN0ZXJJbmRleCkge1xuICAgIHNldENoYXJhY3RlclJhbmdlKHRoaXMuY29udGFpbmVyRWxlLCBzdGFydCwgZW5kID8/IHN0YXJ0KTtcbiAgfVxuXG4gIGZvcmNlUmVuZGVyKCkge1xuICAgIGNvbnN0IGRlbHRhID0gdGhpcy5nZXRUZXh0RGVsdGEoKVxuICAgIHRoaXMuY29udGFpbmVyRWxlLmlubmVySFRNTCA9ICcnXG4gICAgaWYgKGRlbHRhLmxlbmd0aCkge1xuICAgICAgY29uc3QgZnJhZ21lbnQgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KClcbiAgICAgIGZvciAoY29uc3QgaW5zZXJ0IG9mIGRlbHRhKSB7XG4gICAgICAgIGlmICghaW5zZXJ0Lmluc2VydCkgY29udGludWVcbiAgICAgICAgZnJhZ21lbnQuYXBwZW5kQ2hpbGQodGhpcy5jb250cm9sbGVyLmlubGluZU1hbmdlci5jcmVhdGVWaWV3KGluc2VydCkpXG4gICAgICB9XG4gICAgICB0aGlzLmNvbnRhaW5lckVsZS5hcHBlbmRDaGlsZChmcmFnbWVudClcbiAgICAgIHJldHVyblxuICAgIH1cbiAgfVxuXG4gIGFwcGx5RGVsdGEoZGVsdGFzOiBEZWx0YU9wZXJhdGlvbltdLCBzZXRTZWxlY3Rpb24gPSB0cnVlKSB7XG4gICAgLy8gY29uc29sZS5sb2coJ2FwcGx5RGVsdGFUb1ZpZXcnLCBkZWx0YXMpXG4gICAgdGhpcy5jb250cm9sbGVyLnRyYW5zYWN0KCgpID0+IHtcbiAgICAgIHRoaXMueVRleHQuYXBwbHlEZWx0YShkZWx0YXMpXG4gICAgICB0aGlzLmFwcGx5RGVsdGFUb1ZpZXcoZGVsdGFzLCBzZXRTZWxlY3Rpb24pXG4gICAgfSwgVVNFUl9DSEFOR0VfU0lHTkFMKVxuICB9XG5cbiAgYXBwbHlEZWx0YVRvTW9kZWwoZGVsdGFzOiBEZWx0YU9wZXJhdGlvbltdKSB7XG4gICAgY29uc29sZS5sb2coJ2FwcGx5RGVsdGFUb01vZGVsJywgZGVsdGFzKVxuICAgIHRoaXMueVRleHQuYXBwbHlEZWx0YShkZWx0YXMpXG4gIH1cblxuICBhcHBseURlbHRhVG9WaWV3KGRlbHRhczogRGVsdGFPcGVyYXRpb25bXSwgd2l0aFNlbGVjdGlvbiA9IGZhbHNlLCBjb250YWluZXJFbGUgPSB0aGlzLmNvbnRhaW5lckVsZSkge1xuICAgIGxldCBfcmFuZ2U6IElDaGFyYWN0ZXJSYW5nZSB8IHVuZGVmaW5lZFxuICAgIC8vIGNvbnNvbGUubG9nKCdhcHBseURlbHRhVG9Nb2RlbCcsIGRlbHRhcylcblxuICAgIGxldCByZXRhaW4gPSAwXG4gICAgZm9yIChjb25zdCBkZWx0YSBvZiBkZWx0YXMpIHtcbiAgICAgIGlmIChkZWx0YS5yZXRhaW4pIHtcbiAgICAgICAgaWYgKGRlbHRhLmF0dHJpYnV0ZXMpIHRoaXMuZm9yY2VSZW5kZXIoKVxuICAgICAgICB3aXRoU2VsZWN0aW9uICYmIChfcmFuZ2UgPSB7c3RhcnQ6IHJldGFpbiwgZW5kOiByZXRhaW4gKyBkZWx0YS5yZXRhaW59KVxuICAgICAgICByZXRhaW4gKz0gZGVsdGEucmV0YWluXG4gICAgICB9IGVsc2UgaWYgKGRlbHRhLmluc2VydCkge1xuICAgICAgICBpbnNlcnRDb250ZW50KGNvbnRhaW5lckVsZSwgcmV0YWluLCBkZWx0YSBhcyBEZWx0YUluc2VydCwgdGhpcy5jb250cm9sbGVyLmlubGluZU1hbmdlci5jcmVhdGVWaWV3LmJpbmQodGhpcy5jb250cm9sbGVyLmlubGluZU1hbmdlcikpXG4gICAgICAgIHJldGFpbiArPSB0eXBlb2YgZGVsdGEuaW5zZXJ0ID09PSAnc3RyaW5nJyA/IGRlbHRhLmluc2VydC5sZW5ndGggOiAxXG4gICAgICAgIHdpdGhTZWxlY3Rpb24gJiYgKF9yYW5nZSA9IHtzdGFydDogcmV0YWluLCBlbmQ6IHJldGFpbn0pXG4gICAgICB9IGVsc2UgaWYgKGRlbHRhLmRlbGV0ZSkge1xuICAgICAgICBkZWxldGVDb250ZW50KGNvbnRhaW5lckVsZSwgcmV0YWluLCBkZWx0YS5kZWxldGUpXG4gICAgICAgIHdpdGhTZWxlY3Rpb24gJiYgKF9yYW5nZSA9IHtzdGFydDogcmV0YWluLCBlbmQ6IHJldGFpbn0pXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHdpdGhTZWxlY3Rpb24gJiYgX3JhbmdlKSB7XG4gICAgICAvLyBjb25zb2xlLmxvZygnc2V0U2VsZWN0aW9uJywgX3JhbmdlKVxuICAgICAgc2V0Q2hhcmFjdGVyUmFuZ2UoY29udGFpbmVyRWxlLCBfcmFuZ2Uuc3RhcnQsIF9yYW5nZS5lbmQpXG4gICAgfVxuICB9XG5cbn1cbiJdfQ==