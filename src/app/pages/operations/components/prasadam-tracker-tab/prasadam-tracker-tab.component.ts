import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OperationsComponent } from '../../operations.component';

@Component({
  selector: 'app-prasadam-tracker-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './prasadam-tracker-tab.component.html'
})
export class PrasadamTrackerTabComponent {
  @Input() ops!: OperationsComponent;
}
