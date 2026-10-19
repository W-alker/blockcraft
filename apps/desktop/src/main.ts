import {bootstrapApplication} from '@angular/platform-browser';
import {provideAnimations} from '@angular/platform-browser/animations';
import {AppComponent} from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideAnimations()],
}).catch(error => console.error(error));
