import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OperationsComponent } from '../../operations.component';

@Component({
  selector: 'app-volunteers-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './volunteers-tab.component.html'
})
export class VolunteersTabComponent {
  @Input() ops!: OperationsComponent;
}
