import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OperationsComponent } from '../../operations.component';

@Component({
  selector: 'app-permissions-matrix-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './permissions-matrix-tab.component.html'
})
export class PermissionsMatrixTabComponent {
  @Input() ops!: OperationsComponent;
}
