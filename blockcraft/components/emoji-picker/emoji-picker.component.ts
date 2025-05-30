import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter, HostListener,
  Input,
  Output,
} from '@angular/core';
import {EMOJI_DATA} from "./const";
import {FormsModule} from "@angular/forms";
import {NgForOf, NgIf} from "@angular/common";

@Component({
  selector: 'app-emoji-picker',
  templateUrl: './emoji-picker.component.html',
  styleUrls: ['./emoji-picker.component.scss'],
  imports: [
    FormsModule,
    NgForOf,
    NgIf
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmojiPickerComponent {
  @Input() bindInput?: HTMLInputElement;
  @Output() emojiSelected = new EventEmitter<string>();

  searchTerm = '';
  isComposing = false;

  emojiGroups = EMOJI_DATA

  @HostListener('mousedown', ['$event'])
  handleEmojiClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const emoji = target.getAttribute('data-emoji');
    if (emoji) {
      this.selectEmoji(emoji);
    }
  }

  // 输入法事件处理
  handleCompositionStart() {
    this.isComposing = true;
  }

  handleCompositionEnd() {
    this.isComposing = false;
  }

  get filteredGroups() {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term || this.isComposing) return this.emojiGroups;

    return this.emojiGroups
      .map(group => ({
        name: group.name,
        emojis: group.emojis.filter(e =>
          e.char.includes(term) ||
          e.keywords.some(k => k.includes(term))
        )
      }))
      .filter(g => g.emojis.length > 0);
  }

  selectEmoji(emoji: string) {
    this.emojiSelected.emit(emoji);
  }

  onSearch($event: any) {
    if (this.isComposing) return
    console.log($event);
  }
}
