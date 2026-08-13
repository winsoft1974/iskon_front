import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { PackageContextService } from '../../services/package-context.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html'
})
export class LoginComponent implements OnInit {
  private auth           = inject(AuthService);
  private api            = inject(ApiService);
  private router         = inject(Router);
  private packageContext = inject(PackageContextService);

  username = '';
  password = '';
  selectedPackageId = '';
  packages: any[] = [];
  packagesLoading = false;
  showPassword = false;
  loading  = signal(false);
  error    = signal('');

  ngOnInit() {
    this.loadPackages();
  }

  loadPackages() {
    this.packagesLoading = true;
    this.api.getAll<any>('Packages').subscribe({
      next: (pkgs) => {
        this.packages = pkgs || [];
        this.packagesLoading = false;
        if (this.packages.length > 0 && !this.selectedPackageId) {
          const activePkg = this.packages.find(p => (p.status || '').toLowerCase() === 'active');
          this.selectedPackageId = activePkg ? String(activePkg.id) : String(this.packages[0].id);
        }
      },
      error: () => {
        this.packagesLoading = false;
      }
    });
  }

  onSubmit() {
    if (!this.selectedPackageId) {
      this.error.set('Please select a Tour Package to log in.');
      return;
    }
    if (!this.username.trim() || !this.password.trim()) {
      this.error.set('Username and password are required.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.auth.login(this.username.trim(), this.password, this.selectedPackageId).subscribe({
      next: () => {
        this.loading.set(false);
        this.packageContext.loadPackages();
        if (this.selectedPackageId) {
          this.packageContext.setSelectedPackageId(this.selectedPackageId);
        }
        if (this.auth.isVolunteer()) {
          this.router.navigate(['/operations']);
        } else {
          this.router.navigate(['/dashboard']);
        }
      },

      error: (err) => {
        this.loading.set(false);
        if (err.error?.message) {
          this.error.set(err.error.message);
        } else if (err.status === 401) {
          this.error.set('Invalid username or password. Please try again.');
        } else {
          this.error.set('Server error. Please make sure the backend is running.');
        }
      }
    });
  }

  getRoleLabel(role: string): string {
    switch (role) {
      case 'KasAuthority':    return '👑 Kas Service Authority';
      case 'ServiceIncharge': return '🧑‍💼 Service Incharge';
      case 'Volunteer':       return '🙋 Volunteer';
      default: return role;
    }
  }
}
