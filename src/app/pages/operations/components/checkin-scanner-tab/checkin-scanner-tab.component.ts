import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OperationsComponent } from '../../operations.component';

@Component({
  selector: 'app-checkin-scanner-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './checkin-scanner-tab.component.html'
})
export class CheckinScannerTabComponent {
  @Input() ops!: OperationsComponent;
}
