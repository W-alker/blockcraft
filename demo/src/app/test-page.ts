import {Component, TemplateRef, ViewChild} from "@angular/core";
import {BlockFlowContextmenu, BlockFlowEditor, GlobalConfig} from "@editor";
import {BlockModel, genUniqueID, IBlockModel, IEditableBlockModel, SchemaStore} from "@core";
import {CalloutSchema} from "@blocks/callout";
import {
    BulletListSchema, CodeBlockSchema, DividerSchema,
    HeadingFourSchema,
    HeadingOneSchema,
    HeadingThreeSchema,
    HeadingTwoSchema,
    ImageSchema, MermaidBlockSchema, OrderedListSchema,
    ParagraphSchema, TableBlockSchema, TableCellBlockSchema, TableRowBlockSchema, TodoListSchema
} from "@blocks";
import {
    BlockControllerPlugin,
    BlockTransformPlugin,
    FloatTextToolbarPlugin, InlineLinkPlugin,
    MentionPlugin
} from "../../../blockflow/src/plugins";
import {BlockflowBinding} from "../../../blockflow/src/y-blockflow";
import {LinkSchema} from "@blocks/link";

const schemaStore = new SchemaStore([ParagraphSchema, HeadingOneSchema, HeadingTwoSchema, HeadingThreeSchema, HeadingFourSchema,
    ImageSchema, BulletListSchema, OrderedListSchema, TodoListSchema, CalloutSchema, DividerSchema, LinkSchema, CodeBlockSchema, MermaidBlockSchema, TableBlockSchema, TableRowBlockSchema, TableCellBlockSchema])

const mentionRequest = async (keyword: string) => {
    const len = Math.floor(Math.random() * 10)
    const list = Array.from({length: len}).map(() => ({
        id: genUniqueID(),
        name: keyword + Math.floor(Math.random() * 10000).toString().slice(0, 4)
    }))

    return {
        list
    }
}

interface BlockSchemaMap {
    'paragraph': IEditableBlockModel,
    'heading-one': IEditableBlockModel
}

@Component({
    selector: 'test-page',
    template: `
        <bf-editor [config]="config" #editor style="padding: 30px; height: 80vh"></bf-editor>

        <button (click)="onClickReadonly()">切换只读</button>
        <button (click)="onClick1()">删除第二个</button>
        <button (mousedown)="onClick3($event)">选中范围</button>
        <button (click)="onClick2()">打印数据</button>

        <button (click)="onClick5()">新增数据</button>
        <button (click)="onClick6()">新增图片</button>

        <button (click)="onClick4()">开启协同</button>

        <ng-template #mentionTpl let-item>
            {{ item.name + item.id }}
        </ng-template>
    `,
    styles: [`

    `],
    imports: [
        BlockFlowEditor,
    ],
    standalone: true,
})
export class TestPage {
    // @ts-ignore
    @ViewChild('editor') editor!: BlockFlowEditor<BlockSchemaMap>
    @ViewChild('mentionTpl', {read: TemplateRef}) mentionTpl!: TemplateRef<any>

    model: IBlockModel[] = [
        {
            flavour: 'paragraph',
            nodeType: 'editable',
            id: genUniqueID(),
            children: [
                {
                    insert: 'Hello, World!\n'
                },
                {
                    insert: 'This is a paragraph.',
                    attributes: {
                        'a:bold': true,
                    }
                }
            ],
            meta: {},
            props: {}
        },
        {
            flavour: 'heading-one',
            nodeType: 'editable',
            id: genUniqueID(),
            children: [
                {
                    insert: 'Hello Again!'
                }
            ],
            meta: {},
            props: {
                id: '0001',
                hs: [1, 2, 3]
            }
        }
    ]
    modelLength = 101

    constructor() {
        let i = 0
        while (i < this.modelLength) {
            i++
            const id = genUniqueID()
            this.model.push({
                flavour: 'heading-one',
                nodeType: 'editable',
                id,
                children: [
                    {
                        insert: 'Hello Again!' + id
                    }
                ],
                meta: {},
                props: {}
            })
        }
    }

    config: GlobalConfig = {
        rootId: '67177d1e2c4cf755f81cabdb',
        schemas: schemaStore,
        // lazyload: {
        //   pageSize: 10,
        //   requester: async (page) => {
        //     const start = (page - 1) * this.config.lazyload!.pageSize
        //         return {
        //             totalCount: this.modelLength,
        //             data: this.model.slice(start, start + this.config.lazyload!.pageSize)
        //         }
        //   }
        // }
        plugins: [new FloatTextToolbarPlugin(
            [
                {
                    item: {
                        name: "|",
                        value: "|",
                    },
                },
                {
                    item: {
                        name: "task",
                        icon: "bf_renwu",
                        intro: "任务",
                        value: true,
                    },
                    click: (item) => {
                        console.log(item)
                    }
                }
            ]
        ), new BlockControllerPlugin(BlockFlowContextmenu), new BlockTransformPlugin(), new InlineLinkPlugin()],
        localUser: {
            userId: '123',
            userName: 'chengxu'
        }
    }

    yBinding?: BlockflowBinding

    get controller() {
        return this.editor.controller
    }

    ngAfterViewInit() {
        // this.editor.controller.transact(()=>{
        // }, {name: 'init'})
        this.controller.addPlugins([
            new MentionPlugin(mentionRequest),
        ])
    }

    onClickReadonly() {
        this.editor.controller.toggleReadonly(!this.editor.controller.readonly$.value)
    }

    onClick1() {
        console.log(this.controller.rootModel)
        this.controller.deleteBlockById(this.controller.rootModel[1].id)
    }

    onClick2() {
        console.log(this.controller.rootModel, this.controller.rootYModel, this.controller.rootYModel.toJSON())
    }

    onClick3(e: Event) {
        e.preventDefault()
        console.log(this.controller.getSelection())
    }

    onClick4() {
        this.yBinding = new BlockflowBinding(this.controller, {serverUrl: 'ws://193.168.1.123:1234'})
        this.yBinding.connect()
    }

    onClick5() {
        const bm = this.editor.controller.createBlock('code', [
            [{
                insert: 'const s = "Hello, World!";\nHello, World!',
            }],
        ])
        this.editor.controller.insertBlocks(0, [bm])
    }

    onClick6() {
        const img: IBlockModel = {
            "flavour": "image",
            "id": genUniqueID(),
            "nodeType": "block",
            "props": {
                "src": "https://v17.angular.io/generated/images/guide/start/fork-the-project.png",
                "width": 400,
                "height": 0,
                "align": "center"
            },
            "meta": {},
            "children": [
                {
                    "flavour": "paragraph",
                    "id": "1726043571963-03c23813-3fbf",
                    "nodeType": "editable",
                    "props": {},
                    "meta": {},
                    "children": [
                        {
                            "insert": "z这是一个图片测试"
                        }
                    ]
                }
            ]
        }
        const bm = BlockModel.fromModel(img)
        this.editor.controller.insertBlocks(0, [bm])
    }
}
