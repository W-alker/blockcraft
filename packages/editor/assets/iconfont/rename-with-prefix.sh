#!/bin/bash
# 将 iconfont 目录下的文件添加 bc- 前缀（跳过 demo.css 和 demo_index.html）
# 同步更新 iconfont.css 中的引用路径，并修改 font-size

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. 先修改 iconfont.css 内容（在重命名前处理原始文件）
CSS_FILE="$DIR/iconfont.css"
if [ -f "$CSS_FILE" ]; then
  # 更新 url() 引用中的文件名：iconfont.xxx -> bc-iconfont.xxx
  sed -i '' \
    -e "s|url('iconfont\.|url('bc-iconfont.|g" \
    -e 's|font-size: 16px;|font-size: 1em;|g' \
    "$CSS_FILE"
  echo "Updated: iconfont.css (paths + font-size)"
fi

# 2. 重命名所有文件（跳过 demo.css、demo_index.html 以及脚本自身）
SKIP=("demo.css" "demo_index.html" "rename-with-prefix.sh")

for file in "$DIR"/*; do
  filename="$(basename "$file")"

  # 跳过目录
  [ -d "$file" ] && continue

  # 跳过已有 bc- 前缀的文件
  [[ "$filename" == bc-* ]] && continue

  # 跳过黑名单
  skip=false
  for s in "${SKIP[@]}"; do
    [ "$filename" = "$s" ] && skip=true && break
  done
  $skip && continue

  mv "$file" "$DIR/bc-$filename"
  echo "Renamed: $filename -> bc-$filename"
done

echo "Done."
