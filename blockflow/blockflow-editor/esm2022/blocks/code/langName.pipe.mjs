import { LANGUAGE_LIST } from './const';
import { Pipe } from '@angular/core';
import * as i0 from "@angular/core";
export class LangNamePipe {
    transform(val) {
        return LANGUAGE_LIST.find(v => v.value === val)?.name;
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LangNamePipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "17.3.12", ngImport: i0, type: LangNamePipe, isStandalone: true, name: "lang" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.3.12", ngImport: i0, type: LangNamePipe, decorators: [{
            type: Pipe,
            args: [{
                    name: 'lang',
                    standalone: true
                }]
        }] });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ05hbWUucGlwZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL2Jsb2NrZmxvdy9zcmMvYmxvY2tzL2NvZGUvbGFuZ05hbWUucGlwZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sU0FBUyxDQUFBO0FBQ3ZDLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxlQUFlLENBQUE7O0FBTXBDLE1BQU0sT0FBTyxZQUFZO0lBRXZCLFNBQVMsQ0FBQyxHQUFXO1FBQ25CLE9BQU8sYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFBO0lBQ3ZELENBQUM7K0dBSlUsWUFBWTs2R0FBWixZQUFZOzs0RkFBWixZQUFZO2tCQUp4QixJQUFJO21CQUFDO29CQUNKLElBQUksRUFBRSxNQUFNO29CQUNaLFVBQVUsRUFBRSxJQUFJO2lCQUNqQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IExBTkdVQUdFX0xJU1QgfSBmcm9tICcuL2NvbnN0J1xuaW1wb3J0IHsgUGlwZSB9IGZyb20gJ0Bhbmd1bGFyL2NvcmUnXG5cbkBQaXBlKHtcbiAgbmFtZTogJ2xhbmcnLFxuICBzdGFuZGFsb25lOiB0cnVlXG59KVxuZXhwb3J0IGNsYXNzIExhbmdOYW1lUGlwZSB7XG5cbiAgdHJhbnNmb3JtKHZhbDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIExBTkdVQUdFX0xJU1QuZmluZCh2ID0+IHYudmFsdWUgPT09IHZhbCk/Lm5hbWVcbiAgfVxufVxuIl19