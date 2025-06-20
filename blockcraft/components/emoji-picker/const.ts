export interface EmojiItem {
  char: string;
  keywords: string[];
}

export interface EmojiGroup {
  name: string;
  emojis: EmojiItem[];
}

export const EMOJI_DATA: EmojiGroup[] = [
  {
    name: '表情',
    emojis: [
      {char: '😀', keywords: ['笑', '开心', '喜']},
      {char: '😃', keywords: ['笑', '开怀', '乐']},
      {char: '😄', keywords: ['高兴', '喜悦']},
      {char: '😁', keywords: ['咧嘴', '笑']},
      {char: '😆', keywords: ['哈哈', '开心']},
      {char: '😅', keywords: ['汗', '紧张']},
      {char: '😂', keywords: ['大笑', '眼泪', '笑出声']},
      {char: '🤣', keywords: ['爆笑', '狂笑']},
      {char: '😊', keywords: ['微笑', '温柔']},
      {char: '😇', keywords: ['天使', '善良']},
      {char: '😉', keywords: ['眨眼', '调皮']},
      {char: '😍', keywords: ['爱', '喜欢', '心']},
      {char: '🥰', keywords: ['感动', '爱']},
      {char: '😘', keywords: ['亲', '吻']},
      {char: '😗', keywords: ['亲吻']},
      {char: '😙', keywords: ['亲亲', '笑']},
      {char: '😚', keywords: ['闭眼', '亲吻']},
      {char: '😋', keywords: ['好吃', '馋']},
      {char: '😜', keywords: ['吐舌', '调皮']},
      {char: '🤪', keywords: ['疯狂', '鬼脸']},
      {char: '😎', keywords: ['酷', '墨镜']},
      {char: '🥸', keywords: ['伪装', '搞笑']},
      {char: '😢', keywords: ['哭', '伤心']},
      {char: '😭', keywords: ['大哭', '难过']},
      {char: '😤', keywords: ['怒', '不满']},
      {char: '😡', keywords: ['生气', '愤怒']},
      {char: '🤬', keywords: ['骂人', '愤怒']},
      {char: '😱', keywords: ['惊讶', '恐惧']},
      {char: '😨', keywords: ['害怕', '担心']},
      {char: '😰', keywords: ['冷汗', '紧张']},
      {char: '😥', keywords: ['失望', '无奈']},
      {char: '😓', keywords: ['沮丧', '疲惫']},
      {char: '🥵', keywords: ['热', '火']},
      {char: '🥶', keywords: ['冷', '冰']},
      {char: '😴', keywords: ['困', '睡觉']},
      {char: '🤤', keywords: ['流口水', '馋']},
      {char: '🤯', keywords: ['炸裂', '震惊']}
    ]
  },
  {
    name: '手势',
    emojis: [
      {char: '👍', keywords: ['赞', '棒']},
      {char: '👎', keywords: ['不行', '踩']},
      {char: '👌', keywords: ['好', '行']},
      {char: '✌️', keywords: ['胜利', '和平']},
      {char: '🤞', keywords: ['希望', '祈祷']},
      {char: '🤟', keywords: ['爱你', '摇滚']},
      {char: '🤘', keywords: ['摇滚', '酷']},
      {char: '👏', keywords: ['鼓掌', '赞']},
      {char: '🙌', keywords: ['举手', '庆祝']},
      {char: '🙏', keywords: ['谢谢', '祈祷', '阿门']},
      {char: '👊', keywords: ['拳头', '击拳']},
      {char: '✊', keywords: ['抗议', '力量']},
      {char: '🤝', keywords: ['握手', '合作']},
      {char: '🫶', keywords: ['比心', '爱']},
      {char: '🤙', keywords: ['呼噜', '电话']},
      {char: '👋', keywords: ['挥手', '再见']},
      {char: '🖐️', keywords: ['高举', '停']},
      {char: '✋', keywords: ['手掌', '停']}
    ]
  },
  {
    name: '情感',
    emojis: [
      {char: '❤️', keywords: ['爱', '心']},
      {char: '🧡', keywords: ['橙心', '暖']},
      {char: '💛', keywords: ['黄心', '希望']},
      {char: '💚', keywords: ['绿心', '自然']},
      {char: '💙', keywords: ['蓝心', '冷静']},
      {char: '💜', keywords: ['紫心', '浪漫']},
      {char: '🖤', keywords: ['黑心', '哥特']},
      {char: '🤍', keywords: ['白心', '纯洁']},
      {char: '💔', keywords: ['心碎', '失恋']},
      {char: '💕', keywords: ['双心', '爱']},
      {char: '💖', keywords: ['闪心', '爱']},
      {char: '💗', keywords: ['粉心']},
      {char: '💘', keywords: ['箭心', '丘比特']},
      {char: '💞', keywords: ['旋转心']},
      {char: '💝', keywords: ['礼物', '心']},
      {char: '💟', keywords: ['装饰', '心']},
      {char: '❣️', keywords: ['感叹心', '爱']}
    ]
  },
  {
    name: '食物',
    emojis: [
      {char: '🍏', keywords: ['青苹果']},
      {char: '🍎', keywords: ['苹果']},
      {char: '🍐', keywords: ['梨']},
      {char: '🍊', keywords: ['橙子']},
      {char: '🍋', keywords: ['柠檬']},
      {char: '🍌', keywords: ['香蕉']},
      {char: '🍉', keywords: ['西瓜']},
      {char: '🍇', keywords: ['葡萄']},
      {char: '🍓', keywords: ['草莓']},
      {char: '🍒', keywords: ['樱桃']},
      {char: '🍑', keywords: ['桃子']},
      {char: '🥭', keywords: ['芒果']},
      {char: '🍍', keywords: ['菠萝']},
      {char: '🥥', keywords: ['椰子']},
      {char: '🥑', keywords: ['鳄梨']},
      {char: '🍆', keywords: ['茄子']},
      {char: '🥕', keywords: ['胡萝卜']},
      {char: '🌽', keywords: ['玉米']},
      {char: '🍔', keywords: ['汉堡']},
      {char: '🍟', keywords: ['薯条']},
      {char: '🍕', keywords: ['披萨']},
      {char: '🌭', keywords: ['热狗']},
      {char: '🌮', keywords: ['墨西哥饼']},
      {char: '🍣', keywords: ['寿司']},
      {char: '🍱', keywords: ['便当']},
      {char: '🍿', keywords: ['爆米花']},
      {char: '🍩', keywords: ['甜甜圈']},
      {char: '🍪', keywords: ['饼干']},
      {char: '🎂', keywords: ['生日蛋糕']},
      {char: '🍰', keywords: ['蛋糕']},
      {char: '🧁', keywords: ['纸杯蛋糕']}
    ]
  },
  {
    name: '动物',
    emojis: [
      {char: '🐶', keywords: ['狗']},
      {char: '🐱', keywords: ['猫']},
      {char: '🐭', keywords: ['老鼠']},
      {char: '🐹', keywords: ['仓鼠']},
      {char: '🐰', keywords: ['兔子']},
      {char: '🦊', keywords: ['狐狸']},
      {char: '🐻', keywords: ['熊']},
      {char: '🐼', keywords: ['熊猫']},
      {char: '🐨', keywords: ['考拉']},
      {char: '🐯', keywords: ['老虎']},
      {char: '🦁', keywords: ['狮子']},
      {char: '🐮', keywords: ['牛']},
      {char: '🐷', keywords: ['猪']},
      {char: '🐸', keywords: ['青蛙']},
      {char: '🐔', keywords: ['鸡']},
      {char: '🐧', keywords: ['企鹅']},
      {char: '🐦', keywords: ['鸟']},
      {char: '🐤', keywords: ['小鸡']},
      {char: '🐿️', keywords: ['松鼠']},
      {char: '🦉', keywords: ['猫头鹰']},
      {char: '🦄', keywords: ['独角兽']},
      {char: '🐻‍❄️', keywords: ['北极熊']}
    ]
  },
  {
    name: '自然 & 天气',
    emojis: [
      {char: '☀️', keywords: ['晴', '太阳']},
      {char: '🌤️', keywords: ['多云']},
      {char: '⛅', keywords: ['阴']},
      {char: '🌥️', keywords: ['阴天']},
      {char: '🌦️', keywords: ['阵雨']},
      {char: '🌧️', keywords: ['雨']},
      {char: '⛈️', keywords: ['雷雨']},
      {char: '🌩️', keywords: ['闪电']},
      {char: '🌨️', keywords: ['雪']},
      {char: '❄️', keywords: ['冰', '雪花']},
      {char: '🌪️', keywords: ['龙卷风']},
      {char: '🌫️', keywords: ['雾']},
      {char: '🌈', keywords: ['彩虹']},
      {char: '🌙', keywords: ['月亮', '夜']},
      {char: '⭐', keywords: ['星星']},
      {char: '🌟', keywords: ['闪耀']},
      {char: '💧', keywords: ['水滴']},
      {char: '🔥', keywords: ['火']},
      {char: '🌊', keywords: ['海浪']},
      {char: '🍂', keywords: ['落叶', '秋']},
      {char: '🍃', keywords: ['绿叶', '春']}
    ]
  },
  {
    name: '活动 & 旅行',
    emojis: [
      {char: '🏃', keywords: ['跑步']},
      {char: '🚶', keywords: ['走路']},
      {char: '🚴', keywords: ['骑行']},
      {char: '🏌️', keywords: ['高尔夫']},
      {char: '🎉', keywords: ['庆祝']},
      {char: '🎊', keywords: ['派对']},
      {char: '🎈', keywords: ['气球']},
      {char: '🎁', keywords: ['礼物']},
      {char: '🧳', keywords: ['行李']},
      {char: '✈️', keywords: ['飞机', '旅行']},
      {char: '🚗', keywords: ['汽车']},
      {char: '🚆', keywords: ['火车']},
      {char: '🚢', keywords: ['船']},
      {char: '🏝️', keywords: ['海岛']},
      {char: '🏖️', keywords: ['沙滩']},
      {char: '🏕️', keywords: ['露营']}
    ]
  },
  {
    name: '交通工具',
    emojis: [
      {char: '🚗', keywords: ['汽车', '车']},
      {char: '🚕', keywords: ['出租车', '打车']},
      {char: '🚌', keywords: ['公交', '巴士']},
      {char: '🚎', keywords: ['无轨电车']},
      {char: '🚓', keywords: ['警车']},
      {char: '🚑', keywords: ['救护车']},
      {char: '🚒', keywords: ['消防车']},
      {char: '🚜', keywords: ['拖拉机']},
      {char: '🚲', keywords: ['自行车']},
      {char: '🛵', keywords: ['电动车', '摩托']},
      {char: '🏍️', keywords: ['摩托车']},
      {char: '✈️', keywords: ['飞机']},
      {char: '🚆', keywords: ['火车']},
      {char: '🚢', keywords: ['轮船']},
      {char: '🛸', keywords: ['飞碟']}
    ]
  },
  {
    name: '物品',
    emojis: [
      {char: '📱', keywords: ['手机']},
      {char: '💻', keywords: ['电脑', '笔电']},
      {char: '🖨️', keywords: ['打印机']},
      {char: '📷', keywords: ['相机']},
      {char: '📺', keywords: ['电视']},
      {char: '💡', keywords: ['灯泡', '灵感']},
      {char: '🔑', keywords: ['钥匙']},
      {char: '💰', keywords: ['钱', '财富']},
      {char: '📚', keywords: ['书', '学习']},
      {char: '🛏️', keywords: ['床', '睡觉']},
      {char: '🚪', keywords: ['门']},
      {char: '🍴', keywords: ['刀叉', '吃饭']},
      {char: '🔒', keywords: ['锁']}
    ]
  },
  {
    name: '标志 & 符号',
    emojis: [
      {char: '✅', keywords: ['对', '正确']},
      {char: '❌', keywords: ['错', '不']},
      {char: '⚠️', keywords: ['警告', '注意']},
      {char: '➕', keywords: ['加', '正']},
      {char: '➖', keywords: ['减', '负']},
      {char: '➡️', keywords: ['右', '向右']},
      {char: '⬅️', keywords: ['左', '向左']},
      {char: '⬆️', keywords: ['上', '向上']},
      {char: '⬇️', keywords: ['下', '向下']},
      {char: '🔄', keywords: ['刷新', '循环']},
      {char: '★', keywords: ['星', '收藏']}
    ]
  },
  {
    name: '节日 & 活动',
    emojis: [
      {char: '🎃', keywords: ['南瓜', '万圣节']},
      {char: '🎄', keywords: ['圣诞树', '圣诞节']},
      {char: '🎆', keywords: ['烟花', '庆祝']},
      {char: '🎇', keywords: ['礼花']},
      {char: '🎉', keywords: ['派对', '庆祝']},
      {char: '🎁', keywords: ['礼物', '生日']},
      {char: '🎂', keywords: ['蛋糕', '生日']},
      {char: '🎈', keywords: ['气球', '派对']},
      {char: '🕯️', keywords: ['蜡烛']},
      {char: '🧨', keywords: ['鞭炮', '春节']}
    ]
  },
  {
    name: '体育运动',
    emojis: [
      {char: '⚽', keywords: ['足球']},
      {char: '🏀', keywords: ['篮球']},
      {char: '🏈', keywords: ['橄榄球']},
      {char: '⚾', keywords: ['棒球']},
      {char: '🎾', keywords: ['网球']},
      {char: '🏐', keywords: ['排球']},
      {char: '🎳', keywords: ['保龄球']},
      {char: '🏓', keywords: ['乒乓球']},
      {char: '🏸', keywords: ['羽毛球']},
      {char: '🥊', keywords: ['拳击']},
      {char: '🤿', keywords: ['潜水']}
    ]
  },
  {
    name: '旗帜 & 国籍',
    emojis: [
      {char: '🇨🇳', keywords: ['中国', '中国国旗']},
      {char: '🇺🇸', keywords: ['美国', '美国国旗']},
      {char: '🇯🇵', keywords: ['日本', '日本国旗']},
      {char: '🇬🇧', keywords: ['英国', '英国国旗']},
      {char: '🇫🇷', keywords: ['法国', '法国国旗']},
      {char: '🏳️', keywords: ['白旗']},
      {char: '🏴', keywords: ['黑旗']}
    ]
  },
  {
    name: '职业 & 人物',
    emojis: [
      {char: '👮', keywords: ['警察']},
      {char: '👷', keywords: ['工人']},
      {char: '💂', keywords: ['卫兵']},
      {char: '🕵️', keywords: ['侦探']},
      {char: '👩‍⚕️', keywords: ['医生']},
      {char: '👨‍🏫', keywords: ['老师']},
      {char: '👩‍🍳', keywords: ['厨师']},
      {char: '👨‍🚒', keywords: ['消防员']},
      {char: '👩‍🎓', keywords: ['学生']},
      {char: '👨‍💻', keywords: ['程序员']}
    ]
  }
];


