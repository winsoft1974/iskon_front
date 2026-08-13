import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PackageContextService {
  private api  = inject(ApiService);
  private auth = inject(AuthService);

  private packagesSubject = new BehaviorSubject<any[]>([]);
  packages$ = this.packagesSubject.asObservable();

  private selectedPackageIdSubject = new BehaviorSubject<string>('');
  selectedPackageId$ = this.selectedPackageIdSubject.asObservable();

  constructor() {
    if (this.auth.isLoggedIn()) {
      this.loadPackages();
    }
  }

  loadPackages() {
    if (!this.auth.isLoggedIn()) return;

    this.api.getAll<any>('Packages').subscribe({
      next: (pkgs) => {
        this.packagesSubject.next(pkgs);
        const isKas = this.auth.isKasAuthority();
        const userPkgId = this.auth.getPackageId();

        if (!isKas && userPkgId) {
          this.selectedPackageIdSubject.next(String(userPkgId));
        } else {
          const currentSelection = this.selectedPackageIdSubject.value;
          if (currentSelection && !pkgs.find(p => String(p.id) === String(currentSelection))) {
            this.selectedPackageIdSubject.next('');
          }
        }
      },
      error: (err) => console.warn('Packages load notice:', err?.status)
    });
  }

  setSelectedPackageId(id: string) {
    if (!this.auth.isKasAuthority()) {
      const userPkgId = this.auth.getPackageId();
      if (userPkgId) {
        this.selectedPackageIdSubject.next(String(userPkgId));
        return;
      }
    }
    this.selectedPackageIdSubject.next(id);
  }

  getSelectedPackageId(): string {
    return this.selectedPackageIdSubject.value;
  }

  getPackages(): any[] {
    return this.packagesSubject.value;
  }

  isPackageCompleted(packageId?: string | number): boolean {
    const targetId = (packageId !== undefined && packageId !== null && packageId !== '')
      ? String(packageId)
      : this.selectedPackageIdSubject.value;
    if (!targetId || targetId === 'all') return false;
    const pkg = this.packagesSubject.value.find(p => String(p.id) === String(targetId));
    return (pkg?.status || '').toLowerCase() === 'completed';
  }

  isCurrentPackageCompleted(): boolean {
    return this.isPackageCompleted();
  }

  isPackageActiveOrUpcoming(packageId?: string | number): boolean {
    const targetId = (packageId !== undefined && packageId !== null && packageId !== '')
      ? String(packageId)
      : this.selectedPackageIdSubject.value;
    if (!targetId || targetId === 'all') return false;
    const pkg = this.packagesSubject.value.find(p => String(p.id) === String(targetId));
    if (!pkg) return false;
    const status = (pkg.status || '').toLowerCase();
    return status === 'active' || status === 'upcoming';
  }

  isEntryLocked(packageId?: string | number): boolean {
    return !this.isPackageActiveOrUpcoming(packageId);
  }
}
