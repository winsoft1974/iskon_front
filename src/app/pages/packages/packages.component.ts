import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { PackageContextService } from '../../services/package-context.service';
import { LanguageService } from '../../services/language.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-packages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './packages.component.html'
})
export class PackagesComponent implements OnInit {
  private api = inject(ApiService);
  private packageContext = inject(PackageContextService);
  lang = inject(LanguageService);
  t(key: string): string { return this.lang.t(key); }

  packages: any[] = [];
  destinations: any[] = [];
  itineraries: any[] = [];
  schedules: any[] = [];

  selectedPackage: any = null;
  selectedPackageDestinations: any[] = [];
  selectedPackageItineraries: any[] = [];

  loading = false;

  // ── Create Package Modal ──
  showCreateModal = false;
  newPackage: any = {
    id: '', name: '', startDate: '', endDate: '',
    costPerPerson: 18000, status: 'Upcoming'
  };

  // ── Edit Package Modal ──
  showEditModal = false;
  editPackage: any = {};

  // ── Share Public Registration Link Modal ──
  showShareLinkModal = false;
  shareLinkUrl = '';
  sharePackageName = '';
  linkCopied = false;

  openShareLinkModal(pkg: any, event?: Event) {
    if (event) event.stopPropagation();
    this.sharePackageName = pkg.name;
    this.shareLinkUrl = `${window.location.origin}/public-register?packageId=${pkg.id}`;
    this.linkCopied = false;
    this.showShareLinkModal = true;
  }

  copyShareLink() {
    navigator.clipboard.writeText(this.shareLinkUrl);
    this.linkCopied = true;
    setTimeout(() => this.linkCopied = false, 3000);
  }

  shareOnWhatsApp() {
    const text = encodeURIComponent(`*ISCON Yatra Pilgrim Registration*\n\nHare Krishna! Register online for *${this.sharePackageName}* here:\n🔗 ${this.shareLinkUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  }

  // ── Delete Package Confirm ──
  showDeleteConfirm = false;
  packageToDelete: any = null;

  // ── Facilities Modal ──
  showFacilitiesModal = false;
  facilitiesPackageId = '';
  facilityOptions = [
    { key: 'ac_bus',      icon: '🚌', label: 'AC Bus'           },
    { key: 'non_ac_bus',  icon: '🚍', label: 'Non-AC Bus'       },
    { key: 'train',       icon: '🚆', label: 'Train'            },
    { key: 'flight',      icon: '✈️',  label: 'Flight'           },
    { key: 'hotel_3star', icon: '🏨', label: '3-Star Hotel'     },
    { key: 'hotel_5star', icon: '🌟', label: '5-Star Hotel'     },
    { key: 'dharamshala', icon: '🛕', label: 'Dharamshala'      },
    { key: 'meals',       icon: '🍽️', label: 'All Meals'        },
    { key: 'breakfast',   icon: '🥗', label: 'Breakfast Only'   },
    { key: 'prasadam',    icon: '🙏', label: 'Prasadam'         },
    { key: 'guide',       icon: '👤', label: 'Guide'            },
    { key: 'medical',     icon: '🏥', label: 'Medical Support'  },
    { key: 'puja',        icon: '🪔', label: 'Special Puja'     },
    { key: 'insurance',   icon: '🛡️', label: 'Travel Insurance' },
    { key: 'wifi',        icon: '📶', label: 'WiFi on Bus'      },
    { key: 'photography', icon: '📸', label: 'Photography'      },
  ];
  packageFacilities: { [pkgId: string]: string[] } = {};
  currentFacilities: string[] = [];

  // ── Destination Add/Edit Modal ──
  showDestModal = false;
  destModalMode: 'add' | 'edit' = 'add';
  newDest: any = { id: 0, packageId: '', destination: '', seqOrder: 1 };
  destSaving = false;

  // ── Destination Delete ──
  showDestDeleteConfirm = false;
  destToDelete: any = null;

  // ── Itinerary (Day) Add Modal ──
  showAddItineraryModal = false;
  newItinerary: any = { id: 0, packageId: '', day: 1, destination: '' };
  itinerarySaving = false;

  // ── Itinerary Delete ──
  showItineraryDeleteConfirm = false;
  itineraryToDelete: any = null;

  // ── Schedule Add Modal ──
  showAddScheduleModal = false;
  selectedItineraryForSchedule: any = null;
  newSchedule: any = { id: 0, itineraryId: 0, timeSlot: '06:00 AM', activity: '', type: 'Darshan' };
  scheduleSaving = false;
  scheduleTypes = ['Darshan', 'Temple', 'Travel', 'Food', 'Rest', 'Other'];

  // ── Schedule Delete ──
  showScheduleDeleteConfirm = false;
  scheduleToDelete: any = null;

  ngOnInit() {
    this.loadFacilitiesFromStorage();
    this.loadData();
    this.packageContext.selectedPackageId$.subscribe(id => {
      if (id && this.packages.length > 0) {
        const matched = this.packages.find(p => String(p.id) === String(id));
        if (matched && (!this.selectedPackage || String(this.selectedPackage.id) !== String(id))) {
          this.selectPackage(matched, false);
        }
      }
    });
  }

  isCurrentActive(pkgId: any): boolean {
    if (!pkgId) return false;
    return String(this.packageContext.getSelectedPackageId()) === String(pkgId);
  }

  setActivePackage(pkg: any, event?: Event) {
    if (event) event.stopPropagation();
    if (!pkg) return;
    this.packageContext.setSelectedPackageId(pkg.id);
    this.selectPackage(pkg, true);
  }

  // ── Facilities DB & LocalStorage Sync ──
  loadFacilitiesFromStorage() {
    try {
      const raw = localStorage.getItem('iscon_pkg_facilities');
      if (raw) this.packageFacilities = JSON.parse(raw);
    } catch {}
  }
  saveFacilitiesToStorage() {
    localStorage.setItem('iscon_pkg_facilities', JSON.stringify(this.packageFacilities));
  }
  getFacilitiesFor(pkgId: string): string[] { return this.packageFacilities[pkgId] || []; }
  getFacilityLabel(key: string): { icon: string; label: string } | undefined {
    return this.facilityOptions.find(f => f.key === key);
  }
  openFacilitiesModal(pkg: any) {
    this.facilitiesPackageId = pkg.id;
    this.currentFacilities = [...(this.packageFacilities[pkg.id] || [])];
    this.showFacilitiesModal = true;
  }
  toggleFacility(key: string) {
    const idx = this.currentFacilities.indexOf(key);
    if (idx === -1) this.currentFacilities.push(key); else this.currentFacilities.splice(idx, 1);
  }
  hasFacility(key: string): boolean { return this.currentFacilities.includes(key); }
  saveFacilities() {
    this.packageFacilities[this.facilitiesPackageId] = [...this.currentFacilities];
    this.saveFacilitiesToStorage();

    const targetPkg = this.packages.find(p => String(p.id) === String(this.facilitiesPackageId));
    if (targetPkg) {
      const updatedPayload = {
        ...targetPkg,
        facilities: JSON.stringify(this.currentFacilities)
      };
      this.api.update('Packages', targetPkg.id, updatedPayload).subscribe({
        next: () => {
          targetPkg.facilities = updatedPayload.facilities;
          this.showFacilitiesModal = false;
        },
        error: (err) => {
          console.error('Error saving package facilities to DB', err);
          this.showFacilitiesModal = false;
        }
      });
    } else {
      this.showFacilitiesModal = false;
    }
  }

  // ── Load Data ──
  loadData() {
    this.loading = true;
    forkJoin({
      packages: this.api.getAll<any>('Packages'),
      destinations: this.api.getAll<any>('PackageDestinations'),
      itineraries: this.api.getAll<any>('PackageItineraries'),
      schedules: this.api.getAll<any>('ItinerarySchedules')
    }).subscribe({
      next: (res) => {
        this.packages = res.packages || [];
        this.destinations = res.destinations || [];
        this.itineraries = res.itineraries || [];
        this.schedules = res.schedules || [];

        // Load facilities from package DB field
        this.packages.forEach((pkg: any) => {
          if (pkg.facilities) {
            try {
              this.packageFacilities[pkg.id] = JSON.parse(pkg.facilities);
            } catch {
              if (typeof pkg.facilities === 'string') {
                this.packageFacilities[pkg.id] = pkg.facilities.split(',').filter(Boolean);
              }
            }
          }
        });

        if (this.packages.length > 0) {
          const globalId = this.packageContext.getSelectedPackageId();
          const matched = globalId ? this.packages.find(p => p.id === globalId) : null;
          this.selectPackage(matched || this.packages[0], false);
        } else {
          this.selectedPackage = null;
        }
        this.loading = false;
      },
      error: (err) => { console.error('Error fetching packages', err); this.loading = false; }
    });
  }

  selectPackage(pkg: any, updateContext = true) {
    this.selectedPackage = pkg;
    this.selectedPackageDestinations = this.destinations
      .filter(d => d.packageId === pkg.id)
      .sort((a, b) => a.seqOrder - b.seqOrder);
    this.selectedPackageItineraries = this.itineraries
      .filter(it => it.packageId === pkg.id)
      .sort((a, b) => a.day - b.day);
    if (updateContext && pkg) this.packageContext.setSelectedPackageId(pkg.id);

    // Auto-scroll to selected package details
    if (pkg) {
      setTimeout(() => {
        const el = document.getElementById('package-details-container');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
    }
  }

  getSchedulesForItinerary(itineraryId: number) {
    return this.schedules.filter(sch => sch.itineraryId === itineraryId);
  }

  // ── Package CRUD ──
  openCreateModal() {
    this.newPackage = {
      id: 0, name: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      costPerPerson: 18000, status: 'Upcoming'
    };
    this.showCreateModal = true;
  }
  createPackage() {
    if (!this.newPackage.name) return;
    this.api.create('Packages', this.newPackage).subscribe({
      next: (created) => {
        this.showCreateModal = false;
        this.packageContext.loadPackages(); // refresh navbar dropdown
        this.loadData();
        // Auto-select newly created package in global context
        if (created && created.id) this.packageContext.setSelectedPackageId(created.id);
      },
      error: (err) => console.error('Error creating package', err)
    });
  }
  openEditModal(pkg: any, event: Event) {
    event.stopPropagation();
    this.editPackage = { ...pkg };
    this.showEditModal = true;
  }
  saveEditPackage() {
    if (!this.editPackage.name) return;
    this.api.update('Packages', this.editPackage.id, this.editPackage).subscribe({
      next: () => {
        this.showEditModal = false;
        this.packageContext.loadPackages(); // refresh navbar dropdown
        this.loadData();
      },
      error: (err) => console.error('Error updating package', err)
    });
  }
  openDeleteConfirm(pkg: any, event: Event) {
    event.stopPropagation();
    this.packageToDelete = pkg;
    this.showDeleteConfirm = true;
  }
  confirmDelete() {
    if (!this.packageToDelete) return;
    const deletedId = this.packageToDelete.id;
    this.api.delete('Packages', this.packageToDelete.id).subscribe({
      next: () => {
        this.showDeleteConfirm = false;
        this.packageToDelete = null;
        // If deleted package was globally selected, clear selection
        if (this.packageContext.getSelectedPackageId() === deletedId ||
            String(this.packageContext.getSelectedPackageId()) === String(deletedId)) {
          this.packageContext.setSelectedPackageId('');
        }
        this.packageContext.loadPackages(); // refresh navbar dropdown
        this.loadData();
      },
      error: (err) => console.error('Error deleting package', err)
    });
  }

  // ════════════════════════════════════════
  // DESTINATION CRUD
  // ════════════════════════════════════════

  // Next sequence order suggestion
  get nextSeqOrder(): number {
    if (!this.selectedPackageDestinations.length) return 1;
    return Math.max(...this.selectedPackageDestinations.map(d => d.seqOrder)) + 1;
  }

  openAddDestModal() {
    if (this.selectedPackage?.status === 'Completed') {
      alert('🔒 This package is marked as Completed. New additions are locked.');
      return;
    }
    this.destModalMode = 'add';
    this.newDest = {
      id: 0,
      packageId: this.selectedPackage.id,
      destination: '',
      seqOrder: this.nextSeqOrder
    };
    this.showDestModal = true;
  }

  openEditDestModal(dest: any) {
    if (this.selectedPackage?.status === 'Completed') {
      alert('🔒 This package is marked as Completed. Changes are locked.');
      return;
    }
    this.destModalMode = 'edit';
    this.newDest = { ...dest };
    this.showDestModal = true;
  }

  saveDest() {
    if (!this.newDest.destination.trim()) return;
    this.destSaving = true;

    if (this.destModalMode === 'add') {
      this.api.create('PackageDestinations', this.newDest).subscribe({
        next: () => {
          this.showDestModal = false;
          this.destSaving = false;
          this.reloadDestinations();
        },
        error: (err) => { console.error(err); this.destSaving = false; }
      });
    } else {
      this.api.update('PackageDestinations', this.newDest.id, this.newDest).subscribe({
        next: () => {
          this.showDestModal = false;
          this.destSaving = false;
          this.reloadDestinations();
        },
        error: (err) => { console.error(err); this.destSaving = false; }
      });
    }
  }

  openDestDeleteConfirm(dest: any) {
    if (this.selectedPackage?.status === 'Completed') {
      alert('🔒 This package is marked as Completed. Deletions are locked.');
      return;
    }
    this.destToDelete = dest;
    this.showDestDeleteConfirm = true;
  }

  confirmDeleteDest() {
    if (!this.destToDelete) return;
    this.api.delete('PackageDestinations', this.destToDelete.id).subscribe({
      next: () => {
        this.showDestDeleteConfirm = false;
        this.destToDelete = null;
        this.reloadDestinations();
      },
      error: (err) => console.error(err)
    });
  }

  // Reload only destinations without full page reload
  reloadDestinations() {
    this.api.getAll<any>('PackageDestinations').subscribe(dests => {
      this.destinations = dests;
      if (this.selectedPackage) {
        this.selectedPackageDestinations = this.destinations
          .filter(d => d.packageId === this.selectedPackage.id)
          .sort((a, b) => a.seqOrder - b.seqOrder);
      }
    });
  }

  // ════════════════════════════════════════
  // ITINERARY (DAY) CRUD
  // ════════════════════════════════════════

  get nextDay(): number {
    if (!this.selectedPackageItineraries.length) return 1;
    return Math.max(...this.selectedPackageItineraries.map(it => it.day)) + 1;
  }

  openAddItineraryModal() {
    if (this.selectedPackage?.status === 'Completed') {
      alert('🔒 This package is marked as Completed. New additions are locked.');
      return;
    }
    this.newItinerary = {
      id: 0,
      packageId: this.selectedPackage.id,
      day: this.nextDay,
      destination: ''
    };
    this.showAddItineraryModal = true;
  }

  saveItinerary() {
    if (!this.newItinerary.destination.trim()) return;
    this.itinerarySaving = true;
    this.api.create('PackageItineraries', this.newItinerary).subscribe({
      next: () => {
        this.showAddItineraryModal = false;
        this.itinerarySaving = false;
        this.reloadItineraries();
      },
      error: (err) => { console.error(err); this.itinerarySaving = false; }
    });
  }

  openItineraryDeleteConfirm(it: any) {
    this.itineraryToDelete = it;
    this.showItineraryDeleteConfirm = true;
  }

  confirmDeleteItinerary() {
    if (!this.itineraryToDelete) return;
    this.api.delete('PackageItineraries', this.itineraryToDelete.id).subscribe({
      next: () => {
        this.showItineraryDeleteConfirm = false;
        this.itineraryToDelete = null;
        this.reloadItineraries();
        this.reloadSchedules();
      },
      error: (err) => console.error(err)
    });
  }

  reloadItineraries() {
    this.api.getAll<any>('PackageItineraries').subscribe(items => {
      this.itineraries = items;
      if (this.selectedPackage) {
        this.selectedPackageItineraries = this.itineraries
          .filter(it => it.packageId === this.selectedPackage.id)
          .sort((a, b) => a.day - b.day);
      }
    });
  }

  // ════════════════════════════════════════
  // SCHEDULE CRUD
  // ════════════════════════════════════════

  openAddScheduleModal(it: any) {
    this.selectedItineraryForSchedule = it;
    this.newSchedule = {
      id: 0,
      itineraryId: it.id,
      timeSlot: '06:00 AM',
      activity: '',
      type: 'Darshan'
    };
    this.showAddScheduleModal = true;
  }

  saveSchedule() {
    if (!this.newSchedule.activity.trim()) return;
    this.scheduleSaving = true;
    this.api.create('ItinerarySchedules', this.newSchedule).subscribe({
      next: () => {
        this.showAddScheduleModal = false;
        this.scheduleSaving = false;
        this.reloadSchedules();
      },
      error: (err) => { console.error(err); this.scheduleSaving = false; }
    });
  }

  openScheduleDeleteConfirm(sch: any) {
    this.scheduleToDelete = sch;
    this.showScheduleDeleteConfirm = true;
  }

  confirmDeleteSchedule() {
    if (!this.scheduleToDelete) return;
    this.api.delete('ItinerarySchedules', this.scheduleToDelete.id).subscribe({
      next: () => {
        this.showScheduleDeleteConfirm = false;
        this.scheduleToDelete = null;
        this.reloadSchedules();
      },
      error: (err) => console.error(err)
    });
  }

  reloadSchedules() {
    this.api.getAll<any>('ItinerarySchedules').subscribe(items => {
      this.schedules = items;
    });
  }
}
