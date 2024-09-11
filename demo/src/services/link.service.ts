import {map, Observable, of} from "rxjs";
import {ELinkService, ILinkPadItem} from "../../../cses-editor";
import {Injectable} from "@angular/core";

export interface ISearchResult {
  isSuccess: boolean;
  items: Array<{
    id: string;
    title: string;
    docCatalogEntries: Array<{
      id: string;
      parentId?: string;
      docTitle: string;
    }>
  }>
}

@Injectable()
export class LinkService implements ELinkService {
  // constructor(private http: CsesHttpService) {
  // }

  searchLinks(text: string): Observable<ILinkPadItem[]> {
    return of([])
    // return this.http.post('/doc/globalSearch', {text}).pipe(
    //   map((res: ISearchResult) => res.items.map(item => {
    //       return {
    //         title: item.title,
    //         link: item.id,
    //         type: 'doc',
    //       }
    //     })
    //   ))
  }
}
