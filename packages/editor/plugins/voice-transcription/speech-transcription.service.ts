import {InjectionToken} from "@angular/core";

export interface DocSpeechTranscriptionChunk {
  audio: Blob
  mimeType: string
  sequence: number
  startedAt: number
  endedAt: number
}

export interface DocSpeechTranscriptionResult {
  text: string
  isFinal?: boolean
}

export interface DocSpeechTranscriptionSessionOptions {
  onResult?: (result: DocSpeechTranscriptionResult) => void
}

export interface DocSpeechTranscriptionSession {
  appendAudioChunk(chunk: DocSpeechTranscriptionChunk): Promise<void>
  complete(): Promise<DocSpeechTranscriptionResult>
  abort(reason?: string): Promise<void>
}

export const DOC_SPEECH_TRANSCRIPTION_SERVICE_TOKEN = new InjectionToken<DocSpeechTranscriptionService>('DOC_SPEECH_TRANSCRIPTION_SERVICE_TOKEN');

export abstract class DocSpeechTranscriptionService {
  abstract createSession(options?: DocSpeechTranscriptionSessionOptions): Promise<DocSpeechTranscriptionSession> | DocSpeechTranscriptionSession
}
