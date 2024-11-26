import { LANGUAGE_LIST } from './const'
import { Pipe } from '@angular/core'

@Pipe({
  name: 'lang',
  standalone: true
})
export class LangNamePipe {

  transform(val: string) {
    return LANGUAGE_LIST.find(v => v.value === val)?.name
  }
}
