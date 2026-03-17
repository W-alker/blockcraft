import {Pipe} from "@angular/core";

@Pipe({
  name: 'hostUrl',
  standalone: true
})
export class HostUrlPipe {
  transform(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
}
