/** 本地文件的可选缩略图。只解码一帧，不播放，不访问远端视频。 */
export function extractVideoPoster(file: File, timeoutMs = 6000): Promise<File | undefined> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    let objectUrl: string | undefined
    let done = false
    let capturing = false
    const finish = (poster?: File) => {
      if (done) return
      done = true
      clearTimeout(timer)
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('seeked', capture)
      video.removeEventListener('error', onError)
      video.removeAttribute('src')
      video.load()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      resolve(poster)
    }
    const onError = () => finish()
    const capture = () => {
      if (done || capturing) return
      if (!video.videoWidth || !video.videoHeight) return finish()
      capturing = true
      try {
        const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) return finish()
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(blob => {
          if (done) return
          finish(blob ? new File([blob], 'video-poster.jpg', {type: 'image/jpeg'}) : undefined)
        }, 'image/jpeg', 0.8)
      } catch {
        finish()
      }
    }
    const onLoaded = () => {
      if (done) return
      // 略过起始空帧；短视频只取前半段，不扫描整个文件。
      const time = Number.isFinite(video.duration) ? Math.min(0.1, video.duration / 2) : 0
      if (time > 0) {
        try { video.currentTime = time } catch { capture() }
      } else capture()
    }
    const timer = setTimeout(onError, timeoutMs)
    video.addEventListener('loadeddata', onLoaded, {once: true})
    video.addEventListener('seeked', capture, {once: true})
    video.addEventListener('error', onError, {once: true})
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    try {
      objectUrl = URL.createObjectURL(file)
      video.src = objectUrl
      video.load()
    } catch {
      finish()
    }
  })
}
