import {Component} from "@angular/core";
import {
  BaseBlockComponent,
  BlockNodeType, generateId,
  IBlockSchemaOptions,
  NoEditableBlockNative
} from "../../../framework";

export interface DemoCoverBlockModel extends NoEditableBlockNative {
  flavour: "demo-cover",
  nodeType: BlockNodeType.void,
  props: {
    title: string,
    banner?: {
      url: string
    },
    author?: {
      name: string,
      avatar?: string,
      info?: string
    }
  }
}

@Component({
  selector: "demo-cover-block",
  template: `
    @if (props.banner?.url) {
      <div class="banner">
        <img [src]="props.banner!.url" alt="Cover Banner">
      </div>
    }

    <div class="content-area">
      <div class="title">{{ props.title }}</div>
      <div class="auth-info">
        @if(props.author?.avatar) {
          <div class="author-avatar">
            <img [src]="props.author?.avatar" alt="Author Avatar">
          </div>
        }
        <div class="author-text">{{ props.author?.name }} {{ props.author?.info }}</div>
      </div>
      <div class="current-time">{{ time }}</div>
    </div>

  `,
  styles: [`
    :host {
      margin: 0 !important;
      display: flex;
      flex-direction: column;
      justify-content: center;
      height: 80vh;
      width: 100%;
      position: relative;
      background: white;
      transform: none !important;

      &.selected {
        background: white !important;
      }

      .banner {
        margin: -10vh 0 0 -10vw;
        max-height: 100vh;
        overflow: hidden;
        width: calc(100% + 20vw);
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        position: absolute;
        top: 0;
        left: 0;

        &::before {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 70%;
          background: linear-gradient(to top, rgba(255, 255, 255), transparent);
        }

        img {
          width: 100%;
        }
      }

      .content-area {
        position: relative;
        z-index: 1;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 3rem 2rem;
        text-align: center;
      }

      .title {
        font-size: calc(var(--bc-fs) * 3.5);
        font-weight: 700;
        color: #2c3e50;
        margin-bottom: 24px;
        line-height: 1.2;
        letter-spacing: 1px;
        text-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }

      .auth-info {
        display: flex;
        align-items: center;
        gap: 0.5em;
        color: #7f8c8d;
        font-size: calc(var(--bc-fs) * 1.2);
        text-shadow: 0 2px 4px rgba(0,0,0,0.05);
      }

      .author-avatar {
        img {
          width: 30px;
          height: 30px;
          border-radius:50%;
          overflow:hidden;
        }
      }

      .author-text {
        font-weight: 500;
      }

      .current-time {
        color: #95a5a6;
        font-size: var(--bc-fs);
        font-weight: 400;
        margin-top: 1em;
      }

      .company-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: #7f8c8d;
        font-size: 0.9rem;
      }

      .company-logo {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: linear-gradient(135deg, #3498db, #2980b9);
        color: white;
        border-radius: 4px;
        font-weight: bold;
        font-size: 0.8rem;
      }

      .date-info {
        color: #7f8c8d;
        font-size: 0.9rem;
        font-weight: 500;
      }

    }
  `],
  standalone: true
})
export class DemoCoverBlockComponent extends BaseBlockComponent<DemoCoverBlockModel> {

  time = ''

  override ngOnInit() {
    super.ngOnInit();
    this.time = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}

export const DemoCoverBlockSchema: IBlockSchemaOptions<DemoCoverBlockModel> = {
  flavour: "demo-cover",
  nodeType: BlockNodeType.void,
  component: DemoCoverBlockComponent,
  createSnapshot: (props) => {
    return {
      id: generateId(),
      flavour: "demo-cover",
      nodeType: BlockNodeType.void,
      meta: {
      },
      props: {
        ...props
      },
      children: []
    }
  },
  metadata: {
    version: 1,
    label: "演示封面",
    includeChildren: [],
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'demo-cover': DemoCoverBlockComponent
    }

    interface IBlockCreateParameters {
      'demo-cover': [DemoCoverBlockModel['props']]
    }
  }
}
