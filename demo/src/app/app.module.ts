import {NgModule} from '@angular/core';
import {BrowserModule, DomSanitizer} from '@angular/platform-browser';
import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {FileUploaderService} from "../services/file-uploader.service";
import {FILE_UPLOADER} from "@blocks/image";
import {registerLocaleData} from '@angular/common';
import zh from '@angular/common/locales/zh';
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {NzInputModule} from "ng-zorro-antd/input";
import {FormsModule} from "@angular/forms";
import {MatIconModule, MatIconRegistry} from "@angular/material/icon";
import {HttpClientModule} from "@angular/common/http";

registerLocaleData(zh);

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    NoopAnimationsModule,
    NzInputModule,
    FormsModule,
    MatIconModule,
    HttpClientModule
  ],
  providers: [
    {provide: FILE_UPLOADER, useClass: FileUploaderService},
  ],
  bootstrap: [AppComponent]
})
export class AppModule {
  constructor(
     private iconRegistry: MatIconRegistry,
     private sanitizer: DomSanitizer
  ) {
    this.iconRegistry.addSvgIconSet(
      this.sanitizer.bypassSecurityTrustResourceUrl('https://at.alicdn.com/t/c/font_4682833_u94uq2b8q1.js')
    )
  }

}
