import { Injectable } from '@angular/core';
import {
  DocSpeechTranscriptionChunk,
  DocSpeechTranscriptionResult,
  DocSpeechTranscriptionService,
  DocSpeechTranscriptionSession,
  DocSpeechTranscriptionSessionOptions
} from '@ccc/blockcraft';

@Injectable({ providedIn: 'root' })
export class PlaygroundSpeechTranscriptionService extends DocSpeechTranscriptionService {
  createSession(options: DocSpeechTranscriptionSessionOptions = {}): DocSpeechTranscriptionSession {
    const segments = [
      '【Playground 外部注入服务】',
      '当前正在演示应用层注入的实时转写能力。',
      '录音过程中，文本会持续写回编辑器。',
      '接入真实服务时，只需要替换这里的 session 实现。'
    ];

    let closed = false;
    let transcript = '';
    let totalDurationMs = 0;
    let totalSizeBytes = 0;
    let chunkCount = 0;

    const emit = (result: DocSpeechTranscriptionResult) => {
      transcript = result.text;
      options.onResult?.(result);
    };

    return {
      appendAudioChunk: async (chunk: DocSpeechTranscriptionChunk) => {
        if (closed) return;
        chunkCount += 1;
        totalDurationMs += Math.max(0, chunk.endedAt - chunk.startedAt);
        totalSizeBytes += chunk.audio.size;
        await this.wait(Math.min(320, 100 + chunkCount * 30));
        emit({
          text: segments.slice(0, Math.min(chunkCount, segments.length)).join('')
        });
      },
      complete: async () => {
        if (closed) {
          return {
            text: transcript,
            isFinal: true
          };
        }
        closed = true;
        const durationSeconds = Math.max(1, Math.round(totalDurationMs / 1000));
        const sizeKb = Math.max(1, Math.round(totalSizeBytes / 1024));
        const finalText = `${transcript || segments.join('')} 共收到 ${chunkCount || 1} 段音频，时长约 ${durationSeconds} 秒，音频大小约 ${sizeKb} KB。生产环境里你可以在应用层把这里替换成真实的 WebSocket / HTTP 流式 ASR 实现。`;
        await this.wait(120);
        const result = {
          text: finalText,
          isFinal: true
        };
        emit(result);
        return result;
      },
      abort: async () => {
        closed = true;
      }
    };
  }

  private wait(time: number) {
    return new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), time);
    });
  }
}
