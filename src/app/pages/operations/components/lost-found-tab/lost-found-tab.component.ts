import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OperationsComponent } from '../../operations.component';

@Component({
  selector: 'app-lost-found-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lost-found-tab.component.html'
})
export class LostFoundTabComponent {
  @Input() ops!: OperationsComponent;
}
