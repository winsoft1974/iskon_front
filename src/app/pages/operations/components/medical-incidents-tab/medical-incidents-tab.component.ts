import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OperationsComponent } from '../../operations.component';

@Component({
  selector: 'app-medical-incidents-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './medical-incidents-tab.component.html'
})
export class MedicalIncidentsTabComponent {
  @Input() ops!: OperationsComponent;
}
