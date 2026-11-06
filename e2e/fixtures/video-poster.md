# 视频封面回归素材

`video-poster.mp4` 是本仓测试生成的 800 × 400 红色画面，约 0.5 秒、无音频的 H.264 MP4。
使用 Chromium Canvas `captureStream(10)` 和 `MediaRecorder(video/mp4;codecs=avc1.42001E)` 生成，
不含外部素材。用于验证真实浏览器解码、JPEG 提帧、640px 限制和画面内容。
