import { languageList } from './const'
import { Pipe } from '@angular/core'

@Pipe({
  name: 'lang',
  standalone: true
})
export class LangNamePipe {

  transform(val: string) {
    return languageList.find(v => v.value === val)?.name
  }
}
