import {Pipe} from "@angular/core";

@Pipe({
  name: 'scaleRatio',
  standalone: true
})
export class ScaleRatioPipe {
  transform(ratio: number) {
    return ratio.toFixed(2)
  }
}
