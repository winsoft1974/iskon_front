import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { PackageContextService } from '../../services/package-context.service';
import { LanguageService } from '../../services/language.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-transit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transit.component.html'
})
export class TransitComponent implements OnInit {
  private api = inject(ApiService);
  private packageContext = inject(PackageContextService);
  lang = inject(LanguageService);
  t(key: string): string { return this.lang.t(key); }

  vehicles: any[] = [];
  trips: any[] = [];
  seats: any[] = [];
  yatris: any[] = [];

  selectedTrip: any = null;
  selectedTripVehicle: any = null;
  loading = false;

  selectedPackageId = '';

  get isPackageCompleted(): boolean {
    return this.packageContext.isCurrentPackageCompleted();
  }

  get isEntryLocked(): boolean {
    return this.packageContext.isEntryLocked();
  }
  activeTab: 'vehicles' | 'seating' = 'vehicles';

  // Search & Filter
  searchTerm = '';
  typeFilter = '';

  // Seating management properties
  showAssignSeatModal = false;
  selectedSeatNumber: number | null = null;
  selectedSeatYatriSearch = '';
  filteredYatrisForSeat: any[] = [];
  selectedYatriForSeat: any = null;
  
  // Unassign seat prompt
  showUnassignConfirm = false;
  seatToUnassign: any = null;

  // Master Vehicle Modal & CRUD Form Binding
  showVehicleModal = false;
  isEditMode = false;
  vehicleForm: any = {
    id: 0,
    vehicleCode: '',
    registrationDate: '',
    type: 'Bus',
    customType: '',
    name: '',
    numberPlate: '',
    capacity: 40,
    driverName: '',
    driverPhone: '',
    route: 'Haridwar to Rishikesh'
  };

  ngOnInit() {
    this.packageContext.selectedPackageId$.subscribe(id => {
      this.selectedPackageId = id;
      if (this.trips.length > 0 && this.selectedTrip) {
        const ft = this.filteredTrips;
        if (ft.length > 0) {
          const stillValid = ft.find(t => t.id === this.selectedTrip.id);
          this.selectTrip(stillValid || ft[0]);
        }
      }
    });
    this.loadData();
  }

  get filteredVehicles(): any[] {
    return this.vehicles.filter(v => {
      const matchSearch = !this.searchTerm || 
        (v.name && v.name.toLowerCase().includes(this.searchTerm.toLowerCase())) ||
        (v.vehicleCode && v.vehicleCode.toLowerCase().includes(this.searchTerm.toLowerCase())) ||
        (v.numberPlate && v.numberPlate.toLowerCase().includes(this.searchTerm.toLowerCase())) ||
        (v.driverName && v.driverName.toLowerCase().includes(this.searchTerm.toLowerCase())) ||
        (v.driverPhone && v.driverPhone.includes(this.searchTerm));

      const matchType = !this.typeFilter || v.type === this.typeFilter;
      return matchSearch && matchType;
    });
  }

  get filteredTrips(): any[] {
    if (!this.selectedPackageId) return this.trips;
    const pkgIdNum = Number(this.selectedPackageId);
    const packageYatriIds = this.yatris.filter(y => y.packageId === this.selectedPackageId).map(y => y.id);
    return this.trips.filter(t => {
      if (t.packageId && t.packageId === pkgIdNum) return true;
      const occupiedSeatsForTrip = this.seats.filter(s => s.vehicleTripId === t.id);
      const hasPackageYatris = occupiedSeatsForTrip.some(s => packageYatriIds.includes(s.yatriId));
      const isEmpty = occupiedSeatsForTrip.length === 0;
      return hasPackageYatris || isEmpty;
    });
  }

  packagesList: any[] = [];
  vehicleTypes: any[] = [];
  showVehicleTypeModal = false;
  newVehicleTypeName = '';
  vehicleTypeSaving = false;

  loadData() {
    this.loading = true;
    forkJoin({
      vehicles: this.api.getAll<any>('Vehicles'),
      trips: this.api.getAll<any>('VehicleTrips'),
      seats: this.api.getAll<any>('YatriSeats'),
      yatris: this.api.getAll<any>('Yatris'),
      packages: this.api.getAll<any>('Packages'),
      vTypes: this.api.getAll<any>('HotelConfigs?type=VehicleType')
    }).subscribe({
      next: (res) => {
        this.vehicles = res.vehicles || [];
        this.trips = res.trips || [];
        this.seats = res.seats || [];
        this.yatris = res.yatris || [];
        const rawVTypes = res.vTypes || [];
        const seenV = new Set<string>();
        this.vehicleTypes = rawVTypes.filter((vt: any) => {
          const k = (vt.name || '').trim().toLowerCase();
          if (!k || seenV.has(k)) return false;
          seenV.add(k);
          return true;
        });

        const ft = this.filteredTrips;
        if (ft.length > 0 && !this.selectedTrip) {
          this.selectTrip(ft[0]);
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error fetching transit data', err);
        this.loading = false;
      }
    });
  }

  saveVehicleType() {
    if (!this.newVehicleTypeName.trim()) return;
    this.vehicleTypeSaving = true;
    this.api.create<any>('HotelConfigs', { categoryType: 'VehicleType', name: this.newVehicleTypeName.trim() }).subscribe({
      next: (created) => {
        this.vehicleTypeSaving = false;
        this.showVehicleTypeModal = false;
        this.vehicleTypes.push(created);
        this.vehicleForm.type = created.name;
        this.newVehicleTypeName = '';
      },
      error: () => { this.vehicleTypeSaving = false; }
    });
  }

  // --- Vehicle CRUD Operations ---
  openRegisterVehicleModal() {
    this.isEditMode = false;
    const today = new Date().toISOString().split('T')[0];
    const randomCode = `BUS-${Math.floor(100 + Math.random() * 900)}`;

    this.vehicleForm = {
      id: 0,
      vehicleCode: randomCode,
      registrationDate: today,
      type: 'Bus',
      customType: '',
      name: '',
      numberPlate: '',
      capacity: 40,
      driverName: '',
      driverPhone: '',
      route: ''
    };
    this.showVehicleModal = true;
  }

  openEditVehicleModal(vehicle: any, event?: Event) {
    if (event) event.stopPropagation();
    this.isEditMode = true;

    let formattedDate = '';
    if (vehicle.registrationDate) {
      formattedDate = new Date(vehicle.registrationDate).toISOString().split('T')[0];
    } else {
      formattedDate = new Date().toISOString().split('T')[0];
    }

    const existingTrip = this.trips.find(t => t.vehicleId === vehicle.id);

    this.vehicleForm = {
      id: vehicle.id,
      vehicleCode: vehicle.vehicleCode || `V-10${vehicle.id}`,
      registrationDate: formattedDate,
      type: vehicle.type || 'Bus',
      customType: '',
      name: vehicle.name || '',
      numberPlate: vehicle.numberPlate || '',
      capacity: vehicle.capacity || 40,
      driverName: vehicle.driverName || '',
      driverPhone: vehicle.driverPhone || '',
      route: existingTrip ? existingTrip.route : ''
    };
    this.showVehicleModal = true;
  }

  onVehicleTypeChange() {
    if (this.vehicleForm.type !== 'Custom') {
      this.vehicleForm.customType = '';
    }
  }

  saveVehicle() {
    if (!this.vehicleForm.name || !this.vehicleForm.numberPlate) {
      alert('कृपया वाहनाचे नाव आणि नंबर प्लेट टाका! (Please enter Vehicle Name and Number Plate)');
      return;
    }

    const finalType = (this.vehicleForm.type === 'Custom')
      ? (this.vehicleForm.customType?.trim() || 'Other')
      : this.vehicleForm.type;

    const payload = {
      id: this.vehicleForm.id || 0,
      vehicleCode: this.vehicleForm.vehicleCode?.trim() || `V-${Math.floor(100+Math.random()*900)}`,
      type: finalType,
      name: this.vehicleForm.name.trim(),
      numberPlate: this.vehicleForm.numberPlate?.trim() || '',
      capacity: Number(this.vehicleForm.capacity) || 40,
      driverName: this.vehicleForm.driverName?.trim() || '',
      driverPhone: this.vehicleForm.driverPhone?.trim() || '',
      registrationDate: this.vehicleForm.registrationDate ? new Date(this.vehicleForm.registrationDate).toISOString() : new Date().toISOString()
    };

    if (this.isEditMode) {
      // Update Vehicle
      this.api.update('Vehicles', payload.id, payload).subscribe({
        next: () => {
          this.showVehicleModal = false;
          this.loadData();
        },
        error: (err) => {
          console.error('Error updating vehicle', err);
          alert('Failed to update vehicle.');
        }
      });
    } else {
      // Create Vehicle
      this.api.create('Vehicles', payload).subscribe({
        next: (createdVehicle: any) => {
          this.showVehicleModal = false;
          // Auto-create a VehicleTrip so seat allocation works immediately
          const pkgId = Number(this.selectedPackageId) || 1;
          const routeName = this.vehicleForm.route?.trim() || `${createdVehicle.name || payload.name} Route`;
          const tripPayload = {
            id: 0,
            packageId: pkgId,
            vehicleId: createdVehicle.id || 0,
            route: routeName,
            currentLocation: 'Depot / Ready for Boarding',
            etaMinutes: 15,
            transitStatus: 'On Time'
          };

          this.api.create('VehicleTrips', tripPayload).subscribe({
            next: () => {
              this.loadData();
              setTimeout(() => this.selectVehicleForSeating(createdVehicle), 300);
            },
            error: () => {
              this.loadData();
              setTimeout(() => this.selectVehicleForSeating(createdVehicle), 300);
            }
          });
        },
        error: (err) => {
          console.error('Error registering vehicle', err);
          alert('Failed to register vehicle. Please try again.');
        }
      });
    }
  }

  deleteVehicle(id: number, event?: Event) {
    if (event) event.stopPropagation();
    if (!confirm('आपण हे वाहन हटवण्याची खात्री आहे का? (Are you sure you want to delete this vehicle?)')) return;

    this.api.delete('Vehicles', id).subscribe({
      next: () => {
        this.loadData();
      },
      error: (err) => {
        console.error('Error deleting vehicle', err);
        alert('Failed to delete vehicle.');
      }
    });
  }

  getValidPackageId(): number {
    const selected = Number(this.selectedPackageId);
    if (!isNaN(selected) && selected > 0) return selected;
    if (this.packagesList && this.packagesList.length > 0) return Number(this.packagesList[0].id) || 5;
    return 5;
  }

  // --- Member-wise Seat Allocation (Click Particular Vehicle) ---
  selectVehicleForSeating(vehicle: any) {
    this.selectedTripVehicle = vehicle;
    const existingTrip = this.trips.find(t => t.vehicleId === vehicle.id);

    this.activeTab = 'seating';

    if (existingTrip && existingTrip.id > 0) {
      this.selectedTrip = existingTrip;
      this.initMap();
    } else {
      const vId = Number(vehicle.id) || (this.vehicles.length > 0 ? this.vehicles[0].id : 1);
      const pId = this.getValidPackageId();
      const tripPayload = {
        id: 0,
        packageId: pId,
        vehicleId: vId,
        route: `${vehicle.name} Route`,
        currentLocation: 'Depot / Ready for Boarding',
        etaMinutes: 15,
        transitStatus: 'On Time'
      };

      this.api.create('VehicleTrips', tripPayload).subscribe({
        next: (createdTrip: any) => {
          this.selectedTrip = createdTrip;
          this.loadData();
          this.initMap();
        },
        error: (err) => {
          console.warn('Trip auto-creation warning:', err);
          this.selectedTrip = { id: 1, vehicleId: vId, packageId: pId, route: vehicle.name };
        }
      });
    }
  }

  selectTrip(trip: any) {
    if (!trip) {
      this.selectedTrip = null;
      this.selectedTripVehicle = null;
      return;
    }
    this.selectedTrip = trip;
    this.selectedTripVehicle = this.vehicles.find(v => v.id === trip.vehicleId) || {
      name: trip.route || 'Vehicle',
      numberPlate: '—',
      driverName: 'Not Assigned',
      driverPhone: '—',
      capacity: 40
    };

    setTimeout(() => {
      const el = document.getElementById('transit-details-container');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);

    this.initMap();
  }

  getVehicleName(vehicleId: number): string {
    const v = this.vehicles.find(x => x.id === vehicleId);
    return v ? `${v.name} (${v.numberPlate || v.type})` : `Vehicle #${vehicleId}`;
  }

  getSeatsForTrip(tripId: any, vehicleCapacity: number) {
    const seatLayout = [];
    const cap = Number(vehicleCapacity) || 40;
    const currentTripId = (this.selectedTrip && this.selectedTrip.id > 0) ? this.selectedTrip.id : 1;
    const occupiedSeats = this.seats.filter(s => s.vehicleTripId === currentTripId);

    for (let i = 1; i <= cap; i++) {
      const seat = occupiedSeats.find(s => s.seatNumber === i);
      if (seat) {
        const yatri = this.yatris.find(y => y.id == seat.yatriId);
        seatLayout.push({
          seatNumber: i,
          occupied: true,
          yatriName: yatri ? yatri.name : 'Passenger',
          yatriPhone: yatri ? yatri.phone : '—',
          yatriId: seat.yatriId
        });
      } else {
        seatLayout.push({
          seatNumber: i,
          occupied: false,
          yatriName: '',
          yatriPhone: '',
          yatriId: ''
        });
      }
    }
    return seatLayout;
  }

  onSeatClick(seat: any) {
    if (seat.occupied) {
      this.seatToUnassign = seat;
      this.showUnassignConfirm = true;
    } else {
      this.selectedSeatNumber = seat.seatNumber;
      this.selectedSeatYatriSearch = '';
      this.selectedYatriForSeat = null;
      this.filterYatrisForSeat();
      this.showAssignSeatModal = true;
    }
  }

  filterYatrisForSeat() {
    const currentTripId = (this.selectedTrip && this.selectedTrip.id > 0) ? this.selectedTrip.id : 1;
    const assignedYatriIds = this.seats.filter(s => s.vehicleTripId === currentTripId).map(s => s.yatriId);
    let list = this.yatris.filter(y => !assignedYatriIds.includes(y.id));
    if (this.selectedPackageId && this.selectedPackageId !== 'all') {
      list = list.filter(y => y.packageId == this.selectedPackageId);
    }
    
    if (this.selectedSeatYatriSearch) {
      const q = this.selectedSeatYatriSearch.toLowerCase();
      list = list.filter(y => (y.name && y.name.toLowerCase().includes(q)) || (y.phone && y.phone.includes(q)) || (y.id && y.id.toString().includes(q)));
    }
    this.filteredYatrisForSeat = list;
  }

  selectYatriForSeat(y: any) {
    this.selectedYatriForSeat = y;
  }

  assignSeat() {
    if (!this.selectedYatriForSeat || !this.selectedSeatNumber || !this.selectedTripVehicle) return;

    const currentTripId = (this.selectedTrip && this.selectedTrip.id > 0) ? this.selectedTrip.id : 1;

    const payload = {
      yatriId: this.selectedYatriForSeat.id,
      vehicleTripId: currentTripId,
      seatNumber: this.selectedSeatNumber
    };

    this.api.create('YatriSeats', payload).subscribe({
      next: () => {
        this.showAssignSeatModal = false;
        this.loadData();
      },
      error: (err) => {
        console.error('Error assigning seat, attempting fallback trip creation', err);
        const vId = Number(this.selectedTripVehicle.id) || 1;
        const pId = Number(this.selectedPackageId) || 1;
        const tripPayload = {
          id: 0,
          packageId: pId,
          vehicleId: vId,
          route: `${this.selectedTripVehicle.name} Route`,
          currentLocation: 'Depot / Ready for Boarding',
          etaMinutes: 15,
          transitStatus: 'On Time'
        };

        this.api.create('VehicleTrips', tripPayload).subscribe({
          next: (createdTrip: any) => {
            this.selectedTrip = createdTrip;
            payload.vehicleTripId = createdTrip.id;
            this.api.create('YatriSeats', payload).subscribe({
              next: () => {
                this.showAssignSeatModal = false;
                this.loadData();
              },
              error: () => alert('Seat assignment failed.')
            });
          },
          error: () => alert('Seat assignment failed.')
        });
      }
    });
  }

  getUnassignedYatrisForTrip(): any[] {
    const currentTripId = (this.selectedTrip && this.selectedTrip.id > 0) ? this.selectedTrip.id : 1;
    const assignedYatriIds = this.seats.filter(s => s.vehicleTripId === currentTripId).map(s => s.yatriId);
    let list = this.yatris.filter(y => !assignedYatriIds.includes(y.id));
    if (this.selectedPackageId && this.selectedPackageId !== 'all') {
      list = list.filter(y => y.packageId == this.selectedPackageId);
    }
    return list;
  }

  onDragStart(event: DragEvent, yatriId: string) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', yatriId);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDropOnSeat(event: DragEvent, seatNumber: number) {
    event.preventDefault();
    if (!event.dataTransfer || !this.selectedTripVehicle) return;
    const yatriId = event.dataTransfer.getData('text/plain');
    if (!yatriId) return;

    const currentTripId = (this.selectedTrip && this.selectedTrip.id > 0) ? this.selectedTrip.id : 1;
    const seatLayout = this.getSeatsForTrip(currentTripId, this.selectedTripVehicle.capacity);
    const targetSeat = seatLayout.find(s => s.seatNumber === seatNumber);
    if (targetSeat && targetSeat.occupied) {
      alert('ही सीट आधीच आरक्षित आहे! (Seat is already occupied!)');
      return;
    }

    const payload = {
      yatriId,
      vehicleTripId: currentTripId,
      seatNumber
    };

    this.api.create('YatriSeats', payload).subscribe({
      next: () => {
        this.loadData();
      },
      error: (err) => {
        console.error('Error assigning seat via drag-and-drop', err);
        const vId = Number(this.selectedTripVehicle.id) || 1;
        const pId = Number(this.selectedPackageId) || 1;
        const tripPayload = {
          id: 0,
          packageId: pId,
          vehicleId: vId,
          route: `${this.selectedTripVehicle.name} Route`,
          currentLocation: 'Depot / Ready for Boarding',
          etaMinutes: 15,
          transitStatus: 'On Time'
        };

        this.api.create('VehicleTrips', tripPayload).subscribe({
          next: (createdTrip: any) => {
            this.selectedTrip = createdTrip;
            payload.vehicleTripId = createdTrip.id;
            this.api.create('YatriSeats', payload).subscribe({
              next: () => this.loadData(),
              error: () => alert('Seat assignment failed.')
            });
          },
          error: () => alert('Seat assignment failed.')
        });
      }
    });
  }

  confirmUnassignSeat() {
    if (!this.seatToUnassign || !this.selectedTrip) return;
    
    this.api.deleteComposite('YatriSeats', this.selectedTrip.id, this.seatToUnassign.seatNumber).subscribe({
      next: () => {
        this.showUnassignConfirm = false;
        this.seatToUnassign = null;
        this.loadData();
      },
      error: (err) => {
        console.error('Error deleting seat assignment', err);
        alert('Failed to unassign seat.');
      }
    });
  }

  // --- Live Route Tracker Map (Leaflet.js) ---
  private map: any = null;

  initMap() {
    setTimeout(() => {
      const mapContainer = document.getElementById('live-transit-map');
      if (!mapContainer) return;

      const L = (window as any).L;
      if (!L) return;

      if (this.map) {
        try { this.map.remove(); } catch (e) {}
        this.map = null;
      }

      this.map = L.map('live-transit-map').setView([30.7333, 79.0669], 10);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(this.map);

      if (!this.selectedTrip) return;

      let startCoords: [number, number] = [30.0123, 78.1234];
      let currentCoords: [number, number] = [30.3456, 78.5678];
      let destCoords: [number, number] = [30.7333, 79.0669];

      if (this.selectedTrip.latitude && this.selectedTrip.longitude &&
          !isNaN(Number(this.selectedTrip.latitude)) && !isNaN(Number(this.selectedTrip.longitude))) {
        currentCoords = [Number(this.selectedTrip.latitude), Number(this.selectedTrip.longitude)];
      } else if (this.selectedTrip.route?.toLowerCase().includes('badrinath')) {
        startCoords = [30.0869, 78.2676];
        currentCoords = [30.3888, 78.9888];
        destCoords = [30.7433, 79.4938];
      }

      L.marker(startCoords).addTo(this.map).bindPopup(`🚀 Start Point: Origin`).openPopup();
      L.marker(destCoords).addTo(this.map).bindPopup(`🛕 Destination`);

      const busIcon = L.divIcon({
        html: '<div style="font-size: 24px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🚌</div>',
        className: 'bus-map-icon',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      L.marker(currentCoords, { icon: busIcon })
        .addTo(this.map)
        .bindPopup(`<b>${this.selectedTripVehicle?.name || 'Bus'}</b><br>GPS: ${currentCoords[0].toFixed(4)}, ${currentCoords[1].toFixed(4)}<br>Status: ${this.selectedTrip.transitStatus}<br>Location: ${this.selectedTrip.currentLocation}`)
        .openPopup();

      const group = new L.featureGroup([L.marker(startCoords), L.marker(destCoords), L.marker(currentCoords)]);
      this.map.fitBounds(group.getBounds().pad(0.15));

    }, 300);
  }

  // --- Bus Passenger Manifest Printable State & Methods ---
  showManifestModal = false;

  openBusManifestModal() {
    this.showManifestModal = true;
  }

  printBusManifest() {
    window.print();
  }

  get busManifestPassengers(): any[] {
    if (!this.selectedTrip) return [];
    return (this.seats || []).filter(s => s.vehicleTripId === this.selectedTrip.id).map(s => {
      const yatri = this.yatris.find(y => y.id === s.yatriId);
      return {
        seatNumber: s.seatNumber,
        yatriId: s.yatriId,
        name: yatri ? yatri.name : (s.yatriName || 'Passenger'),
        phone: yatri ? yatri.phone : (s.yatriPhone || '—'),
        age: yatri ? yatri.age : '—',
        gender: yatri ? yatri.gender : '—',
        bookingType: yatri ? yatri.bookingType : 'Yatri',
        checkedIn: yatri ? yatri.checkedIn : false
      };
    }).sort((a, b) => a.seatNumber - b.seatNumber);
  }
}
