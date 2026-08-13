import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OperationsComponent } from '../../operations.component';

@Component({
  selector: 'app-announcements-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './announcements-tab.component.html'
})
export class AnnouncementsTabComponent {
  @Input() ops!: OperationsComponent;
}
