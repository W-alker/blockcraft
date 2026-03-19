import {Injectable, Injector} from "@angular/core";
import {
  DocSpeechTranscriptionChunk,
  DOC_SPEECH_TRANSCRIPTION_SERVICE_TOKEN,
  DocSpeechTranscriptionResult,
  DocSpeechTranscriptionService,
  DocSpeechTranscriptionSession,
  DocSpeechTranscriptionSessionOptions
} from "../../plugins/voice-transcription";

@Injectable()
export class FakeSpeechTranscriptionService extends DocSpeechTranscriptionService {
  createSession(options: DocSpeechTranscriptionSessionOptions = {}): DocSpeechTranscriptionSession {
    const segments = [
      '这是一段',
      '来自内置伪语音服务的',
      '实时转写演示。',
      '录音进行时会持续回填文字，',
      '真实场景下你可以注入自己的流式 ASR 服务。'
    ]

    let closed = false
    let transcript = ''
    let totalDurationMs = 0
    let totalSizeBytes = 0
    let chunkCount = 0

    const emit = (result: DocSpeechTranscriptionResult) => {
      transcript = result.text
      options.onResult?.(result)
    }

    return {
      appendAudioChunk: async (chunk: DocSpeechTranscriptionChunk) => {
        if (closed) return
        chunkCount += 1
        totalDurationMs += Math.max(0, chunk.endedAt - chunk.startedAt)
        totalSizeBytes += chunk.audio.size
        await this.wait(Math.min(360, 120 + chunkCount * 40))
        emit({
          text: segments.slice(0, Math.min(chunkCount, segments.length)).join('')
        })
      },
      complete: async () => {
        if (closed) {
          return {
            text: transcript,
            isFinal: true
          }
        }
        closed = true
        const durationSeconds = Math.max(1, Math.round(totalDurationMs / 1000))
        const audioSizeKb = Math.max(1, Math.round(totalSizeBytes / 1024))
        const finalText = `${transcript || segments.join('')} 本次伪实时转写共接收 ${chunkCount || 1} 段音频，时长约 ${durationSeconds} 秒，音频大小约 ${audioSizeKb} KB。你可以通过 DOC_SPEECH_TRANSCRIPTION_SERVICE_TOKEN 注入真实语音转写服务来替换当前实现。`
        await this.wait(180)
        const result = {
          text: finalText,
          isFinal: true
        }
        emit(result)
        return result
      },
      abort: async () => {
        closed = true
      }
    }
  }

  private wait(time: number) {
    return new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), time)
    })
  }
}

export const resolveSpeechTranscriptionService = (injector: Injector) => {
  return injector.get(DOC_SPEECH_TRANSCRIPTION_SERVICE_TOKEN, new FakeSpeechTranscriptionService())
}
