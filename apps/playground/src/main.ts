import { provideHttpClient } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { DOC_SPEECH_TRANSCRIPTION_SERVICE_TOKEN } from '@ccc/blockcraft';
import { AppComponent } from './app/app.component';
import { PlaygroundSpeechTranscriptionService } from './app/playground-speech-transcription.service';

bootstrapApplication(AppComponent, {
  providers: [
    provideAnimations(),
    provideHttpClient(),
    PlaygroundSpeechTranscriptionService,
    {
      provide: DOC_SPEECH_TRANSCRIPTION_SERVICE_TOKEN,
      useExisting: PlaygroundSpeechTranscriptionService
    }
  ]
}).catch(err => console.error(err));
