import {
  DocPlugin,
  IBlockSelectionJSON
} from "../../framework";
import {BehaviorSubject} from "rxjs";
import {IFixedToolbarExtensionAction, IFixedToolbarExtensionActionContext} from "../fixed-toolbar";
import {
  DocSpeechTranscriptionChunk,
  DocSpeechTranscriptionResult,
  DocSpeechTranscriptionService,
  DocSpeechTranscriptionSession
} from "./speech-transcription.service";

type VoiceTranscriptionState = 'idle' | 'recording' | 'transcribing'

interface LiveTranscriptBinding {
  blockId: string
  index: number
  length: number
}

interface VoiceRecorderSession {
  binding: LiveTranscriptBinding
  cancelled: boolean
  error: unknown
  lastChunkEndedAt: number
  lastText: string
  mimeType: string
  pending: Promise<void>
  recorder: MediaRecorder
  sequence: number
  serviceSession: DocSpeechTranscriptionSession
  startedAt: number
  stopPromise: Promise<void>
  stream: MediaStream
}

export interface VoiceTranscriptionPluginOptions {
  service?: DocSpeechTranscriptionService | null
  actionKey?: string
  actionIcon?: string
  chunkDurationMs?: number
  idleTitle?: string
  recordingTitle?: string
  transcribingTitle?: string
}

const DEFAULT_ACTION_KEY = 'voice-transcription'

export class VoiceTranscriptionPlugin extends DocPlugin {
  override name = 'voice-transcription'

  readonly state$ = new BehaviorSubject<VoiceTranscriptionState>('idle')

  private readonly options: Required<Omit<VoiceTranscriptionPluginOptions, 'service'>> & {
    service: DocSpeechTranscriptionService | null
  }
  private session: VoiceRecorderSession | null = null

  constructor(options: VoiceTranscriptionPluginOptions = {}) {
    super()
    this.options = {
      service: options.service ?? null,
      actionKey: options.actionKey || DEFAULT_ACTION_KEY,
      actionIcon: options.actionIcon || 'bc_yinpin',
      chunkDurationMs: options.chunkDurationMs || 900,
      idleTitle: options.idleTitle || '开始实时语音转写',
      recordingTitle: options.recordingTitle || '结束实时语音转写',
      transcribingTitle: options.transcribingTitle || '正在完成语音转写'
    }
  }

  init() {
    this.doc.subscribeReadonlyChange((readonly) => {
      if (readonly && this.session) {
        void this.cancelRecording('编辑器已切换为只读，实时转写已停止')
      }
    })
  }

  override destroy() {
    this.state$.complete()
    if (this.session) {
      void this.cancelRecording()
    }
  }

  setService(service: DocSpeechTranscriptionService | null) {
    this.options.service = service
  }

  createToolbarActions(): IFixedToolbarExtensionAction[] {
    const state = this.state$.value
    return [
      {
        key: this.options.actionKey,
        icon: this.options.actionIcon,
        title: this.resolveActionTitle(state),
        active: state === 'recording',
        disabled: state === 'transcribing'
      }
    ]
  }

  async handleToolbarAction(context: IFixedToolbarExtensionActionContext) {
    if (context.action.key !== this.options.actionKey) return false
    if (this.doc.isReadonly) return true
    if (this.state$.value === 'transcribing') return true

    if (this.session) {
      await this.stopAndFinalize()
      return true
    }

    await this.startRecording(context.selection)
    return true
  }

  private resolveActionTitle(state: VoiceTranscriptionState) {
    switch (state) {
      case 'recording':
        return this.options.recordingTitle
      case 'transcribing':
        return this.options.transcribingTitle
      default:
        return this.options.idleTitle
    }
  }

  private async startRecording(selectionJSON: IBlockSelectionJSON | null) {
    if (!this.options.service) {
      this.doc.messageService.warn('未配置语音转写服务')
      return
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.doc.messageService.error('当前环境不支持录音')
      return
    }

    if (typeof MediaRecorder === 'undefined') {
      this.doc.messageService.error('当前浏览器不支持 MediaRecorder 录音')
      return
    }

    let stream: MediaStream | null = null
    let serviceSession: DocSpeechTranscriptionSession | null = null

    try {
      stream = await navigator.mediaDevices.getUserMedia({audio: true})
      const mimeType = this.pickMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, {mimeType}) : new MediaRecorder(stream)
      const binding = await this.prepareTranscriptBinding(selectionJSON)
      const startedAt = Date.now()

      let session!: VoiceRecorderSession
      serviceSession = await this.options.service.createSession({
        onResult: (result) => {
          if (!this.session || this.session !== session || session.cancelled) return
          void this.applyTranscriptionResult(session, result)
        }
      })

      const stopPromise = new Promise<void>((resolve, reject) => {
        recorder.addEventListener('dataavailable', (event: BlobEvent) => {
          if (!event.data.size || session.cancelled) return
          this.enqueueChunk(session, event.data)
        })
        recorder.addEventListener('stop', () => resolve(), {once: true})
        recorder.addEventListener('error', (event: Event) => {
          const message = event instanceof ErrorEvent ? event.message : '录音失败'
          reject(new Error(message || '录音失败'))
        }, {once: true})
      })

      session = {
        binding,
        cancelled: false,
        error: null,
        lastChunkEndedAt: startedAt,
        lastText: '',
        mimeType: mimeType || recorder.mimeType || 'audio/webm',
        pending: Promise.resolve(),
        recorder,
        sequence: 0,
        serviceSession,
        startedAt,
        stopPromise,
        stream
      }

      this.session = session
      this.state$.next('recording')
      recorder.start(this.options.chunkDurationMs)
      this.doc.messageService.info('开始实时语音转写，再次点击按钮即可结束')
    } catch (error) {
      if (stream) {
        this.releaseStream(stream)
      }
      if (serviceSession) {
        try {
          await serviceSession.abort('start_failed')
        } catch {
        }
      }
      const message = error instanceof Error ? error.message : '无法开始录音'
      this.doc.messageService.error(message)
    }
  }

  private enqueueChunk(session: VoiceRecorderSession, audio: Blob) {
    const endedAt = Date.now()
    const chunk: DocSpeechTranscriptionChunk = {
      audio,
      mimeType: session.mimeType,
      sequence: session.sequence++,
      startedAt: session.lastChunkEndedAt,
      endedAt
    }
    session.lastChunkEndedAt = endedAt

    session.pending = session.pending
      .then(async () => {
        if (session.cancelled) return
        await session.serviceSession.appendAudioChunk(chunk)
      })
      .catch((error) => {
        session.error = session.error || error
      })
  }

  private async stopAndFinalize() {
    const session = this.session
    if (!session) return

    this.state$.next('transcribing')

    try {
      await this.stopRecordingSession(session)
      await session.pending
      if (session.error) {
        throw session.error
      }

      const result = await session.serviceSession.complete()
      await this.applyTranscriptionResult(session, {
        ...result,
        isFinal: true
      })

      if (!result.text.trim()) {
        this.doc.messageService.warn('未收到转写结果')
        return
      }
      this.doc.messageService.success('实时语音转写已完成')
    } catch (error) {
      const message = error instanceof Error ? error.message : '语音转写失败'
      this.doc.messageService.error(message)
    } finally {
      this.releaseStream(session.stream)
      this.session = null
      this.state$.next('idle')
    }
  }

  private async cancelRecording(message?: string) {
    const session = this.session
    if (!session) return

    session.cancelled = true

    try {
      await this.stopRecordingSession(session)
    } catch {
    }

    try {
      await session.serviceSession.abort(message)
    } catch {
    }

    this.releaseStream(session.stream)
    this.session = null
    this.state$.next('idle')
    if (message) {
      this.doc.messageService.warn(message)
    }
  }

  private async stopRecordingSession(session: VoiceRecorderSession) {
    if (session.recorder.state !== 'inactive') {
      session.recorder.stop()
    }
    await session.stopPromise
  }

  private releaseStream(stream: MediaStream) {
    stream.getTracks().forEach((track) => track.stop())
  }

  private pickMimeType() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return ''
    }

    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ]

    return candidates.find((item) => MediaRecorder.isTypeSupported(item)) || ''
  }

  private async prepareTranscriptBinding(selectionJSON: IBlockSelectionJSON | null): Promise<LiveTranscriptBinding> {
    if (selectionJSON) {
      try {
        this.doc.selection.replay(selectionJSON)
      } catch {
      }
    }

    const selection = this.doc.selection.value
    if (selection?.from.type === 'text' && selection.isInSameBlock) {
      return {
        blockId: selection.from.blockId,
        index: selection.from.index,
        length: selection.collapsed ? 0 : selection.from.length
      }
    }

    const snapshot = this.doc.schemas.createSnapshot('paragraph', [])
    const anchor = selection?.lastBlock || this.doc.root.lastChildren

    if (anchor?.parentBlock) {
      await this.doc.chain()
        .insertAfterSnapshots(anchor, [snapshot])
        .setCursorAtBlock(snapshot.id, true)
        .run()
    } else {
      await this.doc.chain()
        .insertSnapshots(this.doc.rootId, this.doc.root.childrenLength, [snapshot])
        .setCursorAtBlock(snapshot.id, true)
        .run()
    }

    return {
      blockId: snapshot.id,
      index: 0,
      length: 0
    }
  }

  private async applyTranscriptionResult(session: VoiceRecorderSession, result: DocSpeechTranscriptionResult) {
    const nextText = result.text ?? ''
    if (nextText === session.lastText) return

    let block: BlockCraft.BlockComponent
    try {
      block = this.doc.getBlockById(session.binding.blockId)
    } catch {
      return
    }

    if (!this.doc.isEditable(block)) return
    const editableBlock = block

    this.doc.crud.transact(() => {
      editableBlock.replaceText(session.binding.index, session.binding.length, nextText)
    })

    session.binding.length = nextText.length
    session.lastText = nextText
    this.doc.selection.setCursorAt(editableBlock, session.binding.index + nextText.length)
    if (result.isFinal) {
      this.doc.selection.scrollSelectionIntoView()
    }
  }
}

export * from './speech-transcription.service'
