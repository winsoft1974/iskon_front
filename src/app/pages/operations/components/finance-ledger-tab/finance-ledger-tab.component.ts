import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OperationsComponent } from '../../operations.component';

@Component({
  selector: 'app-finance-ledger-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './finance-ledger-tab.component.html'
})
export class FinanceLedgerTabComponent {
  @Input() ops!: OperationsComponent;
}
