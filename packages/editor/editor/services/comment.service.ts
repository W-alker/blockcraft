import {Injectable} from "@angular/core";
import {nanoid} from "nanoid";

interface ICommentInfo {
  id: string;
  comment: string;
  time: number
  user: {
    id: string;
    name: string;
  }
}

@Injectable()
export class MyCommentService {
  private comments: ICommentInfo[] = [];

  getComments(id: string) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(this.comments.filter((comment) => comment.id === id))
      })
    })
  }

  addComment(comment: string, id = nanoid() ): Promise<ICommentInfo> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const _comment: ICommentInfo = {
          id,
          comment,
          time: Date.now(),
          user: {
            id: "1",
            name: "John Doe"
          }
        }
        this.comments.push(_comment)
        resolve(_comment)
      })
    })

  }
}
