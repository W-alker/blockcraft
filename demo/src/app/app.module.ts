import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import {BlockFlowEditor} from "@blockflow";
import {FileUploaderService} from "../services/file-uploader.service";
import {FILE_UPLOADER} from "@blocks/image";

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BlockFlowEditor
  ],
  providers: [
    {provide: FILE_UPLOADER, useClass: FileUploaderService},
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
