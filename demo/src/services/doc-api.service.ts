import {Injectable} from "@angular/core";
import {HttpClient} from "@angular/common/http";
import {DocType, ISpace} from "../types";
import {of} from "rxjs";

interface IBaseResponse {
  serverName: string;
  isSuccess: boolean;
}

interface IBaseListResponse<T = any> extends IBaseResponse {
  items: T[];
}

@Injectable()
export class DocApiService {

  constructor(
    private http: HttpClient
  ) {
  }

  getSpaceList() {
    // return this.http.get<IBaseListResponse<ISpace>>('/doc/space/list');
    return of<IBaseListResponse<ISpace>>({
      "serverName": "dev13.local",
      "isSuccess": true,
      "items": [
        {
          "id": "66f120f3136e0161f4e55a7e",
          "name": "个人空间",
          "spaceType": "personal",
          docCount: 1,
        },
        {
          "id": "66f120f3136e0161f4e55a77",
          "name": "共享空间",
          "spaceType": "shared"
        }
      ]
    })
  }

  newDoc(params: {
    spaceId: string;
    parentId: string;
    name: string;
    type: DocType;
  }) {
    return this.http.post<IBaseResponse>('/doc/new', params);
  }

}
