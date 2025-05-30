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
      { char: '😀', keywords: ['笑', '开心', '喜'] },
      { char: '😃', keywords: ['笑', '开怀', '乐'] },
      { char: '😄', keywords: ['高兴', '喜悦'] },
      { char: '😁', keywords: ['咧嘴', '笑'] },
      { char: '😆', keywords: ['哈哈', '开心'] },
      { char: '😅', keywords: ['汗', '紧张'] },
      { char: '😂', keywords: ['大笑', '眼泪', '笑出声'] },
      { char: '🤣', keywords: ['爆笑', '狂笑'] },
      { char: '😊', keywords: ['微笑', '温柔'] },
      { char: '😇', keywords: ['天使', '善良'] },
      { char: '😉', keywords: ['眨眼', '调皮'] },
      { char: '😍', keywords: ['爱', '喜欢', '心'] },
      { char: '🥰', keywords: ['感动', '爱'] },
      { char: '😘', keywords: ['亲', '吻'] },
      { char: '😗', keywords: ['亲吻'] },
      { char: '😙', keywords: ['亲亲', '笑'] },
      { char: '😚', keywords: ['闭眼', '亲吻'] },
      { char: '😋', keywords: ['好吃', '馋'] },
      { char: '😜', keywords: ['吐舌', '调皮'] },
      { char: '🤪', keywords: ['疯狂', '鬼脸'] },
      { char: '😎', keywords: ['酷', '墨镜'] },
      { char: '🥸', keywords: ['伪装', '搞笑'] },
      { char: '😢', keywords: ['哭', '伤心'] },
      { char: '😭', keywords: ['大哭', '难过'] },
      { char: '😤', keywords: ['怒', '不满'] },
      { char: '😡', keywords: ['生气', '愤怒'] },
      { char: '🤬', keywords: ['骂人', '愤怒'] },
      { char: '😱', keywords: ['惊讶', '恐惧'] },
      { char: '😴', keywords: ['困', '睡觉'] }
    ]
  },
  {
    name: '手势',
    emojis: [
      { char: '👍', keywords: ['赞', '棒'] },
      { char: '👎', keywords: ['不行', '踩'] },
      { char: '👌', keywords: ['好', '行'] },
      { char: '✌️', keywords: ['胜利', '和平'] },
      { char: '🤞', keywords: ['希望', '祈祷'] },
      { char: '🤟', keywords: ['爱你', '摇滚'] },
      { char: '🤘', keywords: ['摇滚', '酷'] },
      { char: '👏', keywords: ['鼓掌', '赞'] },
      { char: '🙌', keywords: ['举手', '庆祝'] },
      { char: '🙏', keywords: ['谢谢', '祈祷'] },
      { char: '👊', keywords: ['拳头', '击拳'] },
      { char: '✊', keywords: ['抗议', '力量'] },
      { char: '🤝', keywords: ['握手', '合作'] },
      { char: '🫶', keywords: ['比心', '爱'] }
    ]
  },
  {
    name: '情感',
    emojis: [
      { char: '❤️', keywords: ['爱', '心'] },
      { char: '🧡', keywords: ['橙心', '暖'] },
      { char: '💛', keywords: ['黄心', '希望'] },
      { char: '💚', keywords: ['绿心', '自然'] },
      { char: '💙', keywords: ['蓝心', '冷静'] },
      { char: '💜', keywords: ['紫心', '浪漫'] },
      { char: '🖤', keywords: ['黑心', '哥特'] },
      { char: '🤍', keywords: ['白心', '纯洁'] },
      { char: '💔', keywords: ['心碎', '失恋'] },
      { char: '💕', keywords: ['双心', '爱'] },
      { char: '💖', keywords: ['闪心', '爱'] },
      { char: '💗', keywords: ['粉心'] },
      { char: '💘', keywords: ['箭心', '丘比特'] },
      { char: '💞', keywords: ['旋转心'] }
    ]
  },
  {
    name: '食物',
    emojis: [
      { char: '🍎', keywords: ['苹果'] },
      { char: '🍊', keywords: ['橙子'] },
      { char: '🍋', keywords: ['柠檬'] },
      { char: '🍉', keywords: ['西瓜'] },
      { char: '🍇', keywords: ['葡萄'] },
      { char: '🍓', keywords: ['草莓'] },
      { char: '🍒', keywords: ['樱桃'] },
      { char: '🍌', keywords: ['香蕉'] },
      { char: '🥝', keywords: ['奇异果'] },
      { char: '🍍', keywords: ['菠萝'] },
      { char: '🍕', keywords: ['披萨'] },
      { char: '🍔', keywords: ['汉堡'] },
      { char: '🍟', keywords: ['薯条'] },
      { char: '🌮', keywords: ['墨西哥饼'] },
      { char: '🍿', keywords: ['爆米花'] },
      { char: '🍩', keywords: ['甜甜圈'] },
      { char: '🍪', keywords: ['饼干'] },
      { char: '🍰', keywords: ['蛋糕'] },
      { char: '🎂', keywords: ['生日蛋糕'] }
    ]
  },
  {
    name: '动物',
    emojis: [
      { char: '🐶', keywords: ['狗'] },
      { char: '🐱', keywords: ['猫'] },
      { char: '🐭', keywords: ['老鼠'] },
      { char: '🐹', keywords: ['仓鼠'] },
      { char: '🐰', keywords: ['兔子'] },
      { char: '🦊', keywords: ['狐狸'] },
      { char: '🐻', keywords: ['熊'] },
      { char: '🐼', keywords: ['熊猫'] },
      { char: '🐨', keywords: ['考拉'] },
      { char: '🐯', keywords: ['老虎'] },
      { char: '🦁', keywords: ['狮子'] },
      { char: '🐷', keywords: ['猪'] },
      { char: '🐮', keywords: ['牛'] },
      { char: '🐸', keywords: ['青蛙'] },
      { char: '🐔', keywords: ['鸡'] },
      { char: '🐧', keywords: ['企鹅'] },
      { char: '🐦', keywords: ['鸟'] },
      { char: '🐤', keywords: ['小鸡'] },
      { char: '🦄', keywords: ['独角兽'] }
    ]
  },
  {
    name: '天气',
    emojis: [
      { char: '☀️', keywords: ['晴', '太阳'] },
      { char: '🌤️', keywords: ['多云'] },
      { char: '⛅', keywords: ['阴'] },
      { char: '🌧️', keywords: ['雨'] },
      { char: '⛈️', keywords: ['雷雨'] },
      { char: '🌩️', keywords: ['闪电'] },
      { char: '🌨️', keywords: ['雪'] },
      { char: '❄️', keywords: ['冰', '雪花'] },
      { char: '🌪️', keywords: ['龙卷风'] },
      { char: '🌫️', keywords: ['雾'] },
      { char: '🌈', keywords: ['彩虹'] }
    ]
  }
];

