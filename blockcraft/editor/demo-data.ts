export const demoJSON = {
  id: "689ac2b31a9abe3ae8a6788d",
  flavour: "root",
  nodeType: "root",
  props: {},
  meta: {
    createdTime: 1767939446478,
    lastModified: {
      time: 1767939446478,
      user: null
    }
  },
  children: [
    {
      id: "ai-h1",
      flavour: "paragraph",
      nodeType: "editable",
      props: {
        depth: 0,
        heading: 1
      },
      meta: {},
      children: [
        {
          insert: "AI 落地手册：从模型到产品"
        }
      ]
    },
    {
      id: "ai-intro",
      flavour: "paragraph",
      nodeType: "editable",
      props: {
        depth: 0
      },
      meta: {},
      children: [
        {
          insert: "这是一份给研发团队的 AI 项目默认模板。核心原则是：先定义业务目标，再做模型优化，最后建立可持续监控。"
        }
      ]
    },
    {
      id: "ai-callout-key",
      flavour: "callout",
      nodeType: "block",
      props: {
        color: "#1f2e3c",
        prefix: "🤖",
        depth: 0,
        backColor: "#EAF4FF",
        borderColor: "#CFE3FF"
      },
      meta: {},
      children: [
        {
          id: "ai-callout-p",
          flavour: "paragraph",
          nodeType: "editable",
          props: {
            depth: 0
          },
          meta: {},
          children: [
            {
              insert: "AI 项目最容易失败在“目标不清”。把业务指标写清楚，胜过盲目追逐最新模型。"
            }
          ]
        },
        {
          id: "ai-callout-b1",
          flavour: "bullet",
          nodeType: "editable",
          props: {
            depth: 0
          },
          meta: {},
          children: [
            {
              insert: "目标示例：客服场景首答解决率提升到 45%"
            }
          ]
        },
        {
          id: "ai-callout-b2",
          flavour: "bullet",
          nodeType: "editable",
          props: {
            depth: 0
          },
          meta: {},
          children: [
            {
              insert: "约束示例：P95 延迟 < 800ms，错误率 < 1%"
            }
          ]
        }
      ]
    },
    {
      id: "ai-roadmap-1",
      flavour: "ordered",
      nodeType: "editable",
      props: {
        order: 0,
        depth: 0,
        start: 1
      },
      meta: {},
      children: [
        {
          insert: "第一步：定义问题与指标（准确率、响应时间、成本上限）"
        }
      ]
    },
    {
      id: "ai-roadmap-2",
      flavour: "ordered",
      nodeType: "editable",
      props: {
        order: 1,
        depth: 0
      },
      meta: {},
      children: [
        {
          insert: "第二步：建立 baseline（规则系统或轻量模型）"
        }
      ]
    },
    {
      id: "ai-roadmap-3",
      flavour: "ordered",
      nodeType: "editable",
      props: {
        order: 2,
        depth: 0
      },
      meta: {},
      children: [
        {
          insert: "第三步：灰度上线并持续回收反馈数据"
        }
      ]
    },
    {
      id: "ai-h2-arch",
      flavour: "paragraph",
      nodeType: "editable",
      props: {
        depth: 0,
        heading: 2
      },
      meta: {},
      children: [
        {
          insert: "一、AI 产品最小可行架构"
        }
      ]
    },
    {
      id: "ai-arch-b1",
      flavour: "bullet",
      nodeType: "editable",
      props: {
        depth: 0
      },
      meta: {},
      children: [
        {
          insert: "输入层：用户问题、上下文、业务规则"
        }
      ]
    },
    {
      id: "ai-arch-b2",
      flavour: "bullet",
      nodeType: "editable",
      props: {
        depth: 0
      },
      meta: {},
      children: [
        {
          insert: "推理层：Prompt 模板、工具调用、模型路由"
        }
      ]
    },
    {
      id: "ai-arch-b3",
      flavour: "bullet",
      nodeType: "editable",
      props: {
        depth: 0
      },
      meta: {},
      children: [
        {
          insert: "反馈层：用户评分、错误样本、自动告警"
        }
      ]
    },
    {
      id: "ai-quote",
      flavour: "blockquote",
      nodeType: "editable",
      props: {
        depth: 0
      },
      meta: {},
      children: [
        {
          insert: "把模型当作系统中的一个组件，而不是系统本身。"
        }
      ]
    },
    {
      id: "ai-h2-prompt",
      flavour: "paragraph",
      nodeType: "editable",
      props: {
        depth: 0,
        heading: 2
      },
      meta: {},
      children: [
        {
          insert: "二、提示词与工具调用"
        }
      ]
    },
    {
      id: "ai-prompt-p",
      flavour: "paragraph",
      nodeType: "editable",
      props: {
        depth: 0
      },
      meta: {},
      children: [
        {
          insert: "推荐先固定输出 JSON 结构，再逐步增加检索和函数调用，便于评测和回归。"
        }
      ]
    },
    {
      id: "ai-code",
      flavour: "code",
      nodeType: "editable",
      props: {
        lang: "Python",
        depth: 0,
        h: 240
      },
      meta: {},
      children: [
        {
          insert: "SYSTEM = \"你是企业知识库助手，必须返回 JSON。\"\n\nprompt = f\"\"\"\n任务：回答用户问题\n约束：\n1) 仅基于检索结果回答\n2) 给出置信度 score (0-1)\n3) 缺失信息时返回 need_followup=true\n\n用户问题: {query}\n检索片段: {chunks}\n\"\"\"\n\n# 伪代码\nresult = llm.generate(prompt)\nvalidate_json(result)\n"
        }
      ]
    },
    {
      id: "ai-formula",
      flavour: "formula",
      nodeType: "void",
      props: {
        latex: "P(y=1\\mid x)=\\sigma(w^Tx+b)",
        depth: 0
      },
      meta: {},
      children: []
    },
    {
      id: "ai-image",
      flavour: "image",
      nodeType: "block",
      props: {
        src: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Artificial_neural_network.svg/1200px-Artificial_neural_network.svg.png",
        width: 860,
        height: 486,
        align: "center",
        depth: 0
      },
      meta: {},
      children: []
    },
    {
      id: "ai-image-caption",
      flavour: "paragraph",
      nodeType: "editable",
      props: {
        depth: 0,
        textAlign: "center"
      },
      meta: {},
      children: [
        {
          insert: "示意图：神经网络结构（用于说明模型层级概念）"
        }
      ]
    },
    {
      id: "ai-divider",
      flavour: "divider",
      nodeType: "void",
      props: {
        depth: 0,
        size: "large"
      },
      meta: {},
      children: []
    },
    {
      id: "ai-h2-plan",
      flavour: "paragraph",
      nodeType: "editable",
      props: {
        depth: 0,
        heading: 2
      },
      meta: {},
      children: [
        {
          insert: "三、里程碑排期（示例）"
        }
      ]
    },
    {
      id: "ai-table",
      flavour: "table",
      nodeType: "block",
      props: {
        colWidths: [180, 280, 180, 240],
        depth: 0,
        colHead: true,
        rowHead: false
      },
      meta: {},
      children: [
        {
          id: "ai-tr-1",
          flavour: "table-row",
          nodeType: "block",
          props: {
            height: 56
          },
          meta: {},
          children: [
            {
              id: "ai-tc-1-1",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top",
                backColor: "#EAF0F8"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-1-1",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "阶段"}]
                }
              ]
            },
            {
              id: "ai-tc-1-2",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top",
                backColor: "#EAF0F8"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-1-2",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "目标产出"}]
                }
              ]
            },
            {
              id: "ai-tc-1-3",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top",
                backColor: "#EAF0F8"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-1-3",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "负责人"}]
                }
              ]
            },
            {
              id: "ai-tc-1-4",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top",
                backColor: "#EAF0F8"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-1-4",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "验收指标"}]
                }
              ]
            }
          ]
        },
        {
          id: "ai-tr-2",
          flavour: "table-row",
          nodeType: "block",
          props: {
            height: 60
          },
          meta: {},
          children: [
            {
              id: "ai-tc-2-1",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-2-1",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "数据准备"}]
                }
              ]
            },
            {
              id: "ai-tc-2-2",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-2-2",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "清洗流程 + 标注规范 + 样本分层"}]
                }
              ]
            },
            {
              id: "ai-tc-2-3",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-2-3",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "数据团队"}]
                }
              ]
            },
            {
              id: "ai-tc-2-4",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-2-4",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "抽检准确率 >= 95%"}]
                }
              ]
            }
          ]
        },
        {
          id: "ai-tr-3",
          flavour: "table-row",
          nodeType: "block",
          props: {
            height: 60
          },
          meta: {},
          children: [
            {
              id: "ai-tc-3-1",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-3-1",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "模型开发"}]
                }
              ]
            },
            {
              id: "ai-tc-3-2",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-3-2",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "Baseline + Prompt 模板 + 评测脚本"}]
                }
              ]
            },
            {
              id: "ai-tc-3-3",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-3-3",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "算法团队"}]
                }
              ]
            },
            {
              id: "ai-tc-3-4",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-3-4",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "离线 F1 提升 >= 10%"}]
                }
              ]
            }
          ]
        },
        {
          id: "ai-tr-4",
          flavour: "table-row",
          nodeType: "block",
          props: {
            height: 60
          },
          meta: {},
          children: [
            {
              id: "ai-tc-4-1",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-4-1",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "上线监控"}]
                }
              ]
            },
            {
              id: "ai-tc-4-2",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-4-2",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "灰度发布 + 监控看板 + 异常回滚"}]
                }
              ]
            },
            {
              id: "ai-tc-4-3",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-4-3",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "平台团队"}]
                }
              ]
            },
            {
              id: "ai-tc-4-4",
              flavour: "table-cell",
              nodeType: "block",
              props: {
                verticalAlign: "top"
              },
              meta: {},
              children: [
                {
                  id: "ai-tp-4-4",
                  flavour: "paragraph",
                  nodeType: "editable",
                  props: {
                    depth: 0
                  },
                  meta: {},
                  children: [{insert: "P95 延迟 < 800ms，错误率 < 1%"}]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      id: "ai-h2-mermaid",
      flavour: "paragraph",
      nodeType: "editable",
      props: {
        depth: 0,
        heading: 2
      },
      meta: {},
      children: [
        {
          insert: "四、工作流图（Mermaid）"
        }
      ]
    },
    {
      id: "ai-mermaid",
      flavour: "mermaid",
      nodeType: "block",
      props: {
        mode: "default",
        depth: 0
      },
      meta: {},
      children: [
        {
          id: "ai-mermaid-text",
          flavour: "mermaid-textarea",
          nodeType: "editable",
          props: {
            depth: 0
          },
          meta: {},
          children: [
            {
              insert: "flowchart TD\nA[业务问题定义] --> B[数据准备]\nB --> C[Prompt/模型策略]\nC --> D[离线评测]\nD --> E[灰度上线]\nE --> F[在线监控]\nF --> G[样本回流与迭代]"
            }
          ]
        }
      ]
    },
    {
      id: "ai-h2-checklist",
      flavour: "paragraph",
      nodeType: "editable",
      props: {
        depth: 0,
        heading: 2
      },
      meta: {},
      children: [
        {
          insert: "五、上线前核对清单"
        }
      ]
    },
    {
      id: "ai-todo-1",
      flavour: "todo",
      nodeType: "editable",
      props: {
        created: 1767939447000,
        checked: 1,
        depth: 0
      },
      meta: {},
      children: [
        {
          insert: "已完成离线评测集与回归测试脚本"
        }
      ]
    },
    {
      id: "ai-todo-2",
      flavour: "todo",
      nodeType: "editable",
      props: {
        created: 1767939447100,
        checked: 0,
        depth: 0
      },
      meta: {},
      children: [
        {
          insert: "补齐敏感词与高风险输出拦截规则"
        }
      ]
    },
    {
      id: "ai-todo-3",
      flavour: "todo",
      nodeType: "editable",
      props: {
        created: 1767939447200,
        checked: 0,
        depth: 0
      },
      meta: {},
      children: [
        {
          insert: "确认告警阈值：延迟、错误率、空回答率"
        }
      ]
    },
    {
      id: "ai-todo-4",
      flavour: "todo",
      nodeType: "editable",
      props: {
        created: 1767939447300,
        checked: 0,
        depth: 0
      },
      meta: {},
      children: [
        {
          insert: "准备灰度回滚预案和故障演练脚本"
        }
      ]
    },
    {
      id: "ai-attachment",
      flavour: "attachment",
      nodeType: "void",
      props: {
        url: "https://arxiv.org/pdf/1706.03762.pdf",
        name: "Attention_Is_All_You_Need.pdf",
        size: 2200000,
        type: "application/pdf",
        icon: "bc_file-pdf",
        depth: 0
      },
      meta: {},
      children: []
    },
    {
      id: "ai-bookmark",
      flavour: "bookmark",
      nodeType: "void",
      props: {
        url: "https://openai.com",
        depth: 0,
        title: "OpenAI",
        description: "OpenAI 提供通用人工智能研究与产品能力，包括模型、API 和企业级应用方案。",
        icon: "https://openai.com/favicon.ico",
        image: "https://openai.com/favicon.ico"
      },
      meta: {},
      children: []
    },
    {
      id: "ai-ending",
      flavour: "paragraph",
      nodeType: "editable",
      props: {
        depth: 0
      },
      meta: {},
      children: [
        {
          insert: "建议把这份文档作为项目 kickoff 模板，每个版本迭代后更新“指标、风险、决策记录”三个部分。"
        }
      ]
    }
  ]
}
