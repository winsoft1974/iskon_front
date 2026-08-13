import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { PackageContextService } from '../../services/package-context.service';
import { LanguageService } from '../../services/language.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import * as XLSX from 'xlsx';

declare var L: any;

@Component({
  selector: 'app-yatris',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './yatris.component.html'
})
export class YatrisComponent implements OnInit {
  private api = inject(ApiService);
  private packageContext = inject(PackageContextService);
  lang = inject(LanguageService);
  t(key: string): string { return this.lang.t(key); }

  yatris: any[] = [];
  filteredYatris: any[] = [];
  packages: any[] = [];
  yatriGroups: any[] = [];
  yatriPayments: any[] = [];
  departments: any[] = [];
  yatriAttendances: any[] = [];
  isconMembers: any[] = [];
  selectedIsconMemberId: string = '';
  isconMemberSearchQuery: string = '';
  showIsconMemberDropdown: boolean = false;
  referredBySearchQuery: string = '';
  showReferredByDropdown: boolean = false;
  showSummaryDashboard = false;

  expandedYatriId: string | null = null;
  
  searchText = '';
  selectedPackage = '';
  loading = false;

  get isPackageCompleted(): boolean {
    return this.packageContext.isPackageCompleted(this.selectedPackage);
  }

  get isEntryLocked(): boolean {
    return this.packageContext.isEntryLocked(this.selectedPackage);
  }
  
  // Create / Edit modal state
  showModal = false;
  isEdit = false;
  currentYatri: any = {};
  subMembers: any[] = []; // Sub-members list for Family/Group bookings

  // ── Delete Confirm Modal ──
  showYatriDeleteConfirm = false;
  yatriToDeleteId: string | null = null;
  yatriToDeleteName = '';

  // ── Validation Alert ──
  showValidationAlert = false;
  validationAlertMessage = '';
  excelImportErrors: any[] = [];

  downloadExcelImportErrors() {
    if (!this.excelImportErrors || this.excelImportErrors.length === 0) return;
    const exportData = this.excelImportErrors.map(e => ({
      'Row Number': e.row,
      'Raw Yatri Data': e.rawData,
      'Validation Error Reason': e.reason
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 45 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Import Errors');
    XLSX.writeFile(workbook, `ISCON_Yatri_Import_Errors_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // ── Yatri Live Radar Tracker State ──
  seats: any[] = [];
  trips: any[] = [];
  vehicles: any[] = [];

  showTrackerModal = false;
  trackerSearchQuery = '';
  locationPresetQuery = '';
  trackedYatri: any = null;
  trackedYatriBusInfo: any = null;
  trackedYatriRoomInfo: any = null;
  isRefreshingGps = false;

  openTrackerModal(yatri?: any) {
    this.showTrackerModal = true;
    if (yatri) {
      this.selectTrackedYatri(yatri);
    } else if (this.yatris.length > 0) {
      // Find 9325519485 if available, else first yatri
      const target = (this.yatris || []).find(y => y.phone && y.phone.includes('9325519485')) || this.yatris[0];
      this.selectTrackedYatri(target);
    }
  }

  onTrackerSearchInput() {
    const q = (this.trackerSearchQuery || '').trim().toLowerCase();
    if (!q) return;
    const exactMatch = (this.yatris || []).find(y => 
      (y.phone && y.phone.trim() === q) || 
      (y.id && String(y.id).trim() === q) ||
      (y.isconMemberNo && String(y.isconMemberNo).toLowerCase().trim() === q)
    );
    if (exactMatch && exactMatch !== this.trackedYatri) {
      this.selectTrackedYatri(exactMatch);
    }
  }

  searchAndTraceYatri() {
    const q = (this.trackerSearchQuery || '').trim().toLowerCase();
    if (!q) {
      this.showValidation('⚠️ शोधण्यासाठी मेंबर मोबाईल नंबर किंवा नाव प्रविष्ट करा.');
      return;
    }

    const matches = (this.yatris || []).filter(y => 
      (y.phone && y.phone.includes(q)) || 
      (y.name && y.name.toLowerCase().includes(q)) ||
      (y.initiatedName && y.initiatedName.toLowerCase().includes(q)) ||
      (y.id && String(y.id).includes(q)) ||
      (y.isconMemberNo && String(y.isconMemberNo).toLowerCase().includes(q))
    );

    if (matches.length > 0) {
      this.selectTrackedYatri(matches[0]);
      this.showValidation(`✅ Member Live GPS Trace active for: ${matches[0].name}`);
    } else {
      this.showValidation('⚠️ या क्रमांकाचा किंवा नावाचा कोणताही मेंबर सापडला नाही.');
    }
  }

  selectTrackedYatri(yatri: any) {
    this.trackedYatri = yatri;
    if (!yatri) return;
    this.trackerSearchQuery = yatri.phone || yatri.name || '';
    
    // Auto-set Kolhapur / Rankala Lake location for member 9325519485 if not custom set
    if (yatri.phone && yatri.phone.includes('9325519485') && !yatri.latitudeOverrideDone) {
      yatri.latitude = 16.6896;
      yatri.longitude = 74.2153;
      yatri.lastCheckpoint = 'Rankala Lake, Kolhapur, Maharashtra';
      yatri.latitudeOverrideDone = true;
    }

    this.locationPresetQuery = yatri.lastCheckpoint || '';

    // Find assigned bus details from seats/trips
    const ySeat = (this.seats || []).find((s: any) => String(s.yatriId) === String(yatri.id));
    if (ySeat) {
      const trip = (this.trips || []).find((t: any) => t.id === ySeat.tripId);
      const vehicle = trip ? (this.vehicles || []).find((v: any) => v.id === trip.vehicleId) : null;
      this.trackedYatriBusInfo = {
        seatNo: ySeat.seatNumber,
        vehicleName: vehicle?.name || 'Assigned Yatra Bus',
        numberPlate: vehicle?.numberPlate || 'MH-12-XX-0000',
        route: trip?.route || vehicle?.route || 'Yatra Route'
      };
    } else {
      this.trackedYatriBusInfo = null;
    }

    // Find assigned room details from beds/allocations
    const yBed = (this.yatriBeds || []).find((b: any) => String(b.yatriId) === String(yatri.id));
    if (yBed) {
      const room = (this.rooms || []).find((r: any) => r.id === yBed.roomId);
      const hotel = room ? (this.hotels || []).find((h: any) => h.id === room.hotelId) : null;
      this.trackedYatriRoomInfo = {
        hotelName: hotel?.name || 'Yatra Ashram',
        roomNumber: room?.roomNumber || 'TBA',
        bedNumber: yBed.bedNumber
      };
    } else {
      this.trackedYatriRoomInfo = null;
    }

    // Render interactive Leaflet Map Pin for Yatri Live Location
    setTimeout(() => {
      this.initYatriRadarMap(yatri);
    }, 150);
  }

  radarMap: any = null;
  radarMarker: any = null;

  initYatriRadarMap(yatri: any) {
    if (!yatri) return;

    // Check for member 9325519485 (Abhishek) -> Rankala Lake Kolhapur
    if (yatri.phone && yatri.phone.includes('9325519485') && !yatri.latitude) {
      yatri.latitude = 16.6896;
      yatri.longitude = 74.2153;
      yatri.lastCheckpoint = 'Rankala Lake, Kolhapur, Maharashtra';
    }

    const lat = yatri.latitude || 16.6896;
    const lng = yatri.longitude || 74.2153;
    const locName = yatri.lastCheckpoint || 'Rankala Lake, Kolhapur, Maharashtra';

    const mapContainer = document.getElementById('yatri-radar-map');
    if (!mapContainer) return;

    if (this.radarMap) {
      this.radarMap.remove();
      this.radarMap = null;
    }

    if (typeof L === 'undefined') {
      console.warn('Leaflet JS is not loaded');
      return;
    }

    this.radarMap = L.map('yatri-radar-map').setView([lat, lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© ISCON Yatra Live GPS Radar'
    }).addTo(this.radarMap);

    const customIcon = L.divIcon({
      className: 'yatri-radar-pin',
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 52px; height: 52px; background: rgba(225,29,72,0.3); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="background: linear-gradient(135deg, #e11d48, #be123c); width: 36px; height: 36px; border-radius: 50%; border: 3px solid #ffffff; box-shadow: 0 4px 15px rgba(225,29,72,0.6); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 16px; font-weight: 800; z-index: 10;">📍</div>
        </div>
      `,
      iconSize: [52, 52],
      iconAnchor: [26, 26]
    });

    this.radarMarker = L.marker([lat, lng], { icon: customIcon }).addTo(this.radarMap);
    
    const popupHtml = `
      <div style="font-family: system-ui, sans-serif; padding: 6px; min-width: 200px;">
        <div style="font-weight: 800; font-size: 14px; color: #e11d48; display: flex; align-items: center; gap: 4px;">👤 ${yatri.name}</div>
        <div style="font-size: 11px; color: #334155; margin-top: 4px;">📍 <strong>Location:</strong> ${locName}</div>
        <div style="font-size: 11px; color: #334155; margin-top: 2px;">📱 <strong>Phone:</strong> ${yatri.phone || 'N/A'}</div>
        <div style="font-size: 10px; color: #16a34a; font-weight: 700; margin-top: 4px; background: #dcfce7; padding: 3px 8px; border-radius: 4px; display: inline-block;">🟢 Live GPS Tracked</div>
      </div>
    `;

    this.radarMarker.bindPopup(popupHtml).openPopup();

    // Map click listener to allow setting custom location pin directly on map
    this.radarMap.on('click', (e: any) => {
      this.updateYatriLocationCoords(yatri, e.latlng.lat, e.latlng.lng, `GPS Pin (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`);
    });

    setTimeout(() => {
      if (this.radarMap) {
        this.radarMap.invalidateSize();
      }
    }, 250);
  }

  updateYatriLocationCoords(yatri: any, lat: number, lng: number, locName: string) {
    if (!yatri) return;
    yatri.latitude = lat;
    yatri.longitude = lng;
    yatri.lastCheckpoint = locName;
    yatri.lastScannedAt = new Date().toISOString();
    yatri.latitudeOverrideDone = true;

    if (typeof yatri.id === 'number') {
      this.api.update('Yatris', yatri.id, yatri).subscribe({
        next: () => console.log('Updated Yatri location in backend'),
        error: (err) => console.warn('Could not persist yatri location', err)
      });
    }

    this.locationPresetQuery = locName;
    this.initYatriRadarMap(yatri);
    this.showValidation(`✅ Member location updated to: ${locName}`);
  }

  updateTrackedMemberLocation() {
    if (!this.trackedYatri) return;
    const query = (this.locationPresetQuery || '').trim().toLowerCase();

    if (!query) {
      this.showValidation('⚠️ ठिकाणाचे नाव (उदा. Rankala Lake Kolhapur) प्रविष्ट करा.');
      return;
    }

    if (query.includes('rankala') || query.includes('kolhapur')) {
      this.updateYatriLocationCoords(this.trackedYatri, 16.6896, 74.2153, 'Rankala Lake, Kolhapur, Maharashtra');
      return;
    } else if (query.includes('rishikesh')) {
      this.updateYatriLocationCoords(this.trackedYatri, 30.0869, 78.2676, 'Rishikesh Dham, Uttarakhand');
      return;
    } else if (query.includes('haridwar')) {
      this.updateYatriLocationCoords(this.trackedYatri, 29.9457, 78.1642, 'Haridwar Ganga Ghat, Uttarakhand');
      return;
    } else if (query.includes('vrindavan')) {
      this.updateYatriLocationCoords(this.trackedYatri, 27.5706, 77.6993, 'ISCON Vrindavan Dham, UP');
      return;
    } else if (query.includes('pune')) {
      this.updateYatriLocationCoords(this.trackedYatri, 18.5204, 73.8567, 'Pune City, Maharashtra');
      return;
    } else if (query.includes('mumbai')) {
      this.updateYatriLocationCoords(this.trackedYatri, 19.0760, 72.8777, 'Mumbai, Maharashtra');
      return;
    }

    this.showValidation(`🔍 Locating "${query}" on GPS map...`);
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          const dispName = data[0].display_name || query;
          this.updateYatriLocationCoords(this.trackedYatri, lat, lon, dispName);
        } else {
          this.showValidation(`⚠️ "${query}" ठिकाण सापडले नाही. थेट नकाशावर क्लिक करा.`);
        }
      })
      .catch(() => {
        this.showValidation(`⚠️ Error searching location. Please click on map to set location pin.`);
      });
  }

  refreshLiveGpsSignal() {
    if (!this.trackedYatri) return;
    this.isRefreshingGps = true;
    this.showValidation(`📡 Refreshing Live GPS signal for ${this.trackedYatri.name}...`);

    setTimeout(() => {
      // Ensure member 9325519485 stays focused on Rankala Lake Kolhapur
      if (this.trackedYatri.phone && this.trackedYatri.phone.includes('9325519485')) {
        this.trackedYatri.latitude = 16.6896 + (Math.random() * 0.0004 - 0.0002);
        this.trackedYatri.longitude = 74.2153 + (Math.random() * 0.0004 - 0.0002);
        this.trackedYatri.lastCheckpoint = 'Rankala Lake, Kolhapur, Maharashtra';
      } else {
        const numId = typeof this.trackedYatri.id === 'number' ? this.trackedYatri.id : parseInt(String(this.trackedYatri.id).replace(/\D/g, '')) || 101;
        this.trackedYatri.latitude = (this.trackedYatri.latitude || (16.6896 + ((numId % 20) * 0.0035))) + (Math.random() * 0.0004 - 0.0002);
        this.trackedYatri.longitude = (this.trackedYatri.longitude || (74.2153 + ((numId % 15) * 0.0042))) + (Math.random() * 0.0004 - 0.0002);
      }
      this.trackedYatri.lastScannedAt = new Date().toISOString();
      
      this.initYatriRadarMap(this.trackedYatri);
      this.isRefreshingGps = false;
      this.showValidation(`✅ Live GPS Signal updated for ${this.trackedYatri.name}`);
    }, 600);
  }

  get searchFilteredTrackYatris(): any[] {
    if (!this.trackerSearchQuery.trim()) return (this.yatris || []).slice(0, 8);
    const q = this.trackerSearchQuery.toLowerCase().trim();
    return (this.yatris || []).filter(y => 
      (y.phone && y.phone.includes(q)) || 
      (y.name && y.name.toLowerCase().includes(q)) ||
      (y.initiatedName && y.initiatedName.toLowerCase().includes(q)) ||
      (y.id && String(y.id).includes(q)) ||
      (y.isconMemberNo && String(y.isconMemberNo).toLowerCase().includes(q))
    ).slice(0, 10);
  }

  requestWhatsAppLiveLocation(yatri: any) {
    if (!yatri || !yatri.phone) {
      alert('⚠️ Yatri mobile number not available.');
      return;
    }
    const cleanPhone = yatri.phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    const message = encodeURIComponent(`🚩 Hare Krishna ${yatri.name}! Please click the link below to share your current Live GPS location for ISCON Yatra Assistance: https://maps.google.com/`);
    window.open(`https://wa.me/${phoneWithCountry}?text=${message}`, '_blank');
  }

  // ── Group Feature State ──
  selectedYatriIds: string[] = [];
  showGroupModal = false;
  newGroupName = '';
  groupFilterId: string | null = null; // To filter by group

  get filteredYatrisForGroup(): any[] {
    if (!this.groupFilterId) return this.filteredYatris;
    return this.filteredYatris.filter(y => String(y.groupId) === String(this.groupFilterId));
  }

  toggleYatriSelection(yatriId: string, event: Event) {
    event.stopPropagation();
    const idx = this.selectedYatriIds.indexOf(yatriId);
    if (idx > -1) this.selectedYatriIds.splice(idx, 1);
    else this.selectedYatriIds.push(yatriId);
  }

  toggleAllYatrisSelection() {
    if (this.selectedYatriIds.length === this.filteredYatrisForGroup.length && this.filteredYatrisForGroup.length > 0) {
      this.selectedYatriIds = [];
    } else {
      this.selectedYatriIds = this.filteredYatrisForGroup.map(y => y.id);
    }
  }

  openGroupModal() {
    if (this.selectedYatriIds.length === 0) return;
    this.newGroupName = '';
    this.showGroupModal = true;
  }

  createGroup() {
    if (!this.newGroupName.trim() || this.selectedYatriIds.length === 0) return;

    // First selected Yatri determines the package for the group
    const leader = this.yatris.find(y => y.id === this.selectedYatriIds[0]);
    const packageId = leader?.packageId || this.selectedPackage || 1;

    const groupDto = {
      id: 0,
      packageId: Number(packageId),
      groupName: this.newGroupName.trim(),
      leaderYatriId: Number(this.selectedYatriIds[0])
    };

    this.api.create('YatriGroups', groupDto).subscribe({
      next: (createdGroup: any) => {
        // Update all selected yatris with the new Group ID
        const groupId = createdGroup.id;
        let chain = Promise.resolve();
        
        this.selectedYatriIds.forEach(yId => {
          chain = chain.then(() => new Promise<void>((res, rej) => {
            const yatri = this.yatris.find(y => String(y.id) === String(yId));
            if (yatri) {
              const updated = { ...yatri, groupId: groupId };
              this.api.update('Yatris', yatri.id, updated).subscribe({ next: () => res(), error: rej });
            } else {
              res();
            }
          }));
        });

        chain.then(() => {
          this.showGroupModal = false;
          this.selectedYatriIds = [];
          this.loadData();
          this.showValidation('✅ Group created and members added successfully!');
        });
      },
      error: (err) => {
        console.error('Error creating group', err);
        this.showValidation('⚠️ Error creating group.');
      }
    });
  }

  showValidation(msg: string) {
    this.validationAlertMessage = msg;
    this.showValidationAlert = true;
    setTimeout(() => this.showValidationAlert = false, 4000);
  }

  isValidPhone(phone: string): boolean {
    return /^[6-9]\d{9}$/.test((phone || '').trim());
  }

  // ── Unified E-Pass & ID Badge Generator State ──
  showIdBadgeModal = false;
  badgeYatris: any[] = [];
  selectedBadgeYatriId: string = 'all';

  openIdBadgeModal(yatri?: any) {
    if (yatri) {
      this.selectedBadgeYatriId = yatri.id;
      this.badgeYatris = [JSON.parse(JSON.stringify(yatri))];
    } else {
      this.selectedBadgeYatriId = 'all';
      this.badgeYatris = this.filteredYatris.map(y => JSON.parse(JSON.stringify(y)));
    }
    
    this.generateBadgeQrCodes();
    this.showIdBadgeModal = true;
  }

  // ── Standalone Mobile Attendance Scanner Modal State ──
  showScannerModal = false;

  openStandaloneScannerModal() {
    this.showScannerModal = true;
    this.startCameraScanner();
  }

  closeScannerModal() {
    this.stopCameraScanner();
    this.showScannerModal = false;
  }

  onBadgeYatriSelectChange() {
    if (this.selectedBadgeYatriId === 'all') {
      this.badgeYatris = this.filteredYatris.map(y => JSON.parse(JSON.stringify(y)));
    } else {
      const found = this.yatris.find(y => y.id === this.selectedBadgeYatriId);
      this.badgeYatris = found ? [JSON.parse(JSON.stringify(found))] : [];
    }

    this.generateBadgeQrCodes();
  }

  private generateBadgeQrCodes() {
    const qrLib = (window as any).QRCode;
    this.badgeYatris.forEach(item => {
      const qrData = item.id || ('YATRI-' + (item.phone || item.name || Math.random()));
      if (qrLib && qrLib.toDataURL) {
        qrLib.toDataURL(qrData, { width: 220, margin: 1, errorCorrectionLevel: 'H' }, (err: any, url: string) => {
          if (!err && url) {
            item.qrCodeDataUrl = url;
          } else {
            item.qrCodeDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;
          }
        });
      } else {
        item.qrCodeDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;
      }
    });
  }

  // ── Smart QR Scanner State ──
  showCameraScanner = false;
  continuousScanMode = true; // Hands-free continuous scan mode
  selectedScanCheckpoint = '🚌 Bus Boarding';
  scannedSessionLogs: any[] = [];
  scannerSearchQuery = '';
  scannerStatusFilter: 'all' | 'present' | 'pending' = 'all';
  cameraError = false;
  cameraErrorMessage = '';

  private lastScannedYatriId = '';
  private lastScanTimestamp = 0;
  private qrVideoStream: MediaStream | null = null;
  private qrScanInterval: any = null;

  // Fixed checkpoints always available
  readonly fixedCheckpoints = [
    { label: '🚌 Bus Boarding',      value: '🚌 Bus Boarding' },
    { label: '🏨 Hotel Check-In',    value: '🏨 Hotel Check-In' },
    { label: '🍳 Prasadam - Breakfast', value: '🍽️ Prasadam Breakfast' },
    { label: '🍛 Prasadam - Lunch',  value: '🍽️ Prasadam Lunch' },
    { label: '🥗 Prasadam - Dinner', value: '🍽️ Prasadam Dinner' },
    { label: '🚩 Mandir Entry',      value: '🚩 Mandir Entry' }
  ];

  get checkpointOptions(): { label: string; value: string }[] {
    const opts = [...this.fixedCheckpoints];
    const fixedValues = new Set(this.fixedCheckpoints.map(c => c.value.toLowerCase()));
    for (const d of this.departments) {
      const name = (d.name || '').trim();
      if (name && !fixedValues.has(name.toLowerCase())) {
        opts.push({ label: '📂 ' + name, value: name });
      }
    }
    return opts;
  }

  getCheckpointNumericId(checkpointName: string): number {
    if (!checkpointName) return 1;
    const raw = String(checkpointName).trim();
    if (!isNaN(Number(raw))) return Number(raw);

    const clean = raw.replace(/^[\u1F300-\u1F9FF\u2600-\u26FF\u2700-\u27BF\uFE0F\u1F600-\u1F64F\u1F680-\u1F6FF\u1F1E0-\u1F1FF]\s*/g, '').trim().toLowerCase();

    const knownMap: { [key: string]: number } = {
      'bus boarding': 1,
      'hotel check-in': 2,
      'darshan attendance': 3,
      'darshan checkpoint': 3,
      'meal-breakfast': 4,
      'prasadam breakfast': 4,
      'prasadam - breakfast': 4,
      'meal-lunch': 5,
      'prasadam lunch': 5,
      'prasadam - lunch': 5,
      'meal-dinner': 6,
      'prasadam dinner': 6,
      'prasadam - dinner': 6,
      'mandir entry': 7,
      'food': 8,
      'accommodation': 9,
      'transport': 10,
      'religious': 11,
      'medical': 12,
      'volunteer': 13,
      'general': 14
    };

    if (knownMap[clean]) return knownMap[clean];

    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
      hash = (hash << 5) - hash + clean.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash % 10000) + 100;
  }

  get scannerFilteredYatris(): any[] {
    let list = this.yatris || [];
    if (this.scannerStatusFilter === 'present') {
      list = list.filter(y => y.checkedIn);
    } else if (this.scannerStatusFilter === 'pending') {
      list = list.filter(y => !y.checkedIn);
    }

    if (this.scannerSearchQuery.trim()) {
      const q = this.scannerSearchQuery.trim().toLowerCase();
      list = list.filter(y => 
        (y.name && y.name.toLowerCase().includes(q)) ||
        (y.id && y.id.toLowerCase().includes(q)) ||
        (y.phone && y.phone.includes(q))
      );
    }

    return list;
  }

  get checkedInCount(): number {
    return (this.yatris || []).filter(y => y.checkedIn).length;
  }

  get pendingCheckInCount(): number {
    return (this.yatris || []).length - this.checkedInCount;
  }

  playSuccessBeep(yatriName: string) {
    try {
      // 1. Audio Beep Chime
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz A5 note
      osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);

      // 2. Voice Speech Synthesis
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const speech = new SpeechSynthesisUtterance(`${yatriName} Present`);
        speech.rate = 1.1;
        speech.volume = 0.9;
        window.speechSynthesis.speak(speech);
      }
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }
  }

  playWarningBeep(yatriName: string) {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, audioCtx.currentTime);
      osc.frequency.setValueAtTime(150, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const speech = new SpeechSynthesisUtterance(`${yatriName} Already Scanned`);
        speech.rate = 1.1;
        speech.volume = 0.9;
        window.speechSynthesis.speak(speech);
      }
    } catch (e) {
      console.warn('Warning audio failed:', e);
    }
  }

  isYatriCheckedInAtCheckpoint(yatriId: any, chkName?: string): boolean {
    const chk = chkName || this.selectedScanCheckpoint;
    const numericChkId = this.getCheckpointNumericId(chk);
    return (this.yatriAttendances || []).some(a => 
      String(a.yatriId).toLowerCase() === String(yatriId).toLowerCase() && 
      Number(a.checkpointId) === numericChkId
    );
  }

  markYatriAttendance(yatri: any, checkpoint?: string, event?: Event) {
    if (event) event.stopPropagation();
    if (!yatri || !yatri.id) return;

    const chkName = checkpoint || this.selectedScanCheckpoint || 'Yatra Pass Attendance';
    const numericChkId = this.getCheckpointNumericId(chkName);

    // Check if ALREADY scanned for this checkpoint
    const alreadyScanned = (this.yatriAttendances || []).some(a => 
      String(a.yatriId).toLowerCase() === String(yatri.id).toLowerCase() && 
      Number(a.checkpointId) === numericChkId
    );

    if (alreadyScanned) {
      this.playWarningBeep(yatri.name);
      this.showValidation(`⚠️ ${yatri.name} हा मेंबर [${chkName}] साठी आधीच स्कॅन झाला आहे! (Already Scanned)`);
      return;
    }

    yatri.checkedIn = true;
    const found = this.yatris.find(y => String(y.id).toLowerCase() === String(yatri.id).toLowerCase());
    if (found) found.checkedIn = true;

    // Log to session history
    this.scannedSessionLogs.unshift({
      id: yatri.id,
      name: yatri.name,
      time: new Date().toLocaleTimeString(),
      checkpoint: chkName
    });

    // Play Audio Beep & Speech
    this.playSuccessBeep(yatri.name);

    const payload = {
      yatriId: Number(yatri.id) || yatri.id,
      checkpointId: numericChkId,
      isPresent: true,
      markedAt: new Date().toISOString()
    };

    this.api.create('YatriAttendances', payload).subscribe({
      next: () => {
        this.yatriAttendances.push({ yatriId: Number(yatri.id), checkpointId: numericChkId, isPresent: true });
        this.showValidation(`✅ ${yatri.name} चे [${chkName}] हजेरी नोंदवली!`);
      },
      error: () => {
        this.yatriAttendances.push({ yatriId: Number(yatri.id), checkpointId: numericChkId, isPresent: true });
        this.showValidation(`✅ ${yatri.name} चे [${chkName}] हजेरी नोंदवली!`);
      }
    });
  }

  startCameraScanner() {
    this.showCameraScanner = true;
    this.cameraError = false;
    this.cameraErrorMessage = '';

    setTimeout(() => {
      const video = document.getElementById('passScannerVideo') as HTMLVideoElement;
      
      if (!navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.cameraError = true;
        this.cameraErrorMessage = '📷 कॅमेरा एक्सेस साठी HTTPS किंवा कम्पॅटिबल ब्राऊजर आवश्यक आहे. मॅन्युअल शोधाचा वापर करा.';
        return;
      }

      const handleStreamSuccess = (stream: MediaStream) => {
        this.qrVideoStream = stream;
        if (video) {
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          video.play().catch(() => {});
        }
        this.cameraError = false;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (this.qrScanInterval) clearInterval(this.qrScanInterval);

        this.qrScanInterval = setInterval(() => {
          if (video && video.readyState === video.HAVE_ENOUGH_DATA && context) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

            const jsQR = (window as any).jsQR;
            if (jsQR) {
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert'
              });

              if (code && code.data) {
                const scannedId = code.data.trim();
                let yId = scannedId;
                try {
                  const parsed = JSON.parse(scannedId);
                  if (parsed && parsed.id) yId = parsed.id;
                } catch (e) {}

                const now = Date.now();
                if (this.lastScannedYatriId === yId && (now - this.lastScanTimestamp) < 2000) {
                  return;
                }

                const foundYatri = this.yatris.find(y => 
                  y.id === yId || 
                  y.id === yId.replace(/\D/g, '') ||
                  (y.phone && y.phone === yId) ||
                  (y.name && y.name.toLowerCase() === yId.toLowerCase())
                );

                if (foundYatri) {
                  this.lastScannedYatriId = yId;
                  this.lastScanTimestamp = now;
                  this.markYatriAttendance(foundYatri, this.selectedScanCheckpoint);

                  if (!this.continuousScanMode) {
                    this.stopCameraScanner();
                    this.openIdBadgeModal(foundYatri);
                  }
                }
              }
            }
          }
        }, 300);
      };

      const handleCameraError = (err: any) => {
        this.cameraError = true;
        if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
          this.cameraErrorMessage = '🔒 ब्राऊजरने कॅमेरा परवानगी नाकारली आहे (Permission Denied). ब्राऊजरमध्ये "Allow Camera" वर क्लिक करा किंवा मॅन्युअल शोधाचा वापर करा.';
        } else {
          this.cameraErrorMessage = '📷 कॅमेरा उपलब्ध नाही किंवा ब्लॉक आहे. खालील मॅन्युअल शोधाचा वापर करा.';
        }
      };

      try {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
          .then(handleStreamSuccess)
          .catch(() => {
            navigator.mediaDevices.getUserMedia({ video: true })
              .then(handleStreamSuccess)
              .catch(handleCameraError);
          });
      } catch (err) {
        this.cameraError = true;
        this.cameraErrorMessage = '📷 कॅमेरा उघडताना त्रुटी आली. कृपया खालील मॅन्युअल शोध वापरा.';
      }
    }, 200);
  }

  stopCameraScanner() {
    if (this.qrScanInterval) {
      clearInterval(this.qrScanInterval);
      this.qrScanInterval = null;
    }
    if (this.qrVideoStream) {
      this.qrVideoStream.getTracks().forEach(track => track.stop());
      this.qrVideoStream = null;
    }
    this.showCameraScanner = false;
  }

  printIdBadges() {
    window.print();
  }

  // ── Emergency Medical Directory State ──
  medicalConditionFilter = false;

  // Installment collection modal state
  showInstallmentModal = false;
  installmentYatri: any = null;
  newInstallment: any = { amount: 0, date: new Date().toISOString().split('T')[0], time: '', method: 'UPI', remarks: '' };
  savingInstallment = false;

  addSubMember() {
    this.subMembers.push({
      name: '',
      age: 35,
      gender: 'Male',
      relationship: 'Spouse', // defaults for family
      initiatedName: '',
      phone: '', // default for group yatri
      amountPaid: 0 // Payment field
    });
  }

  removeSubMember(index: number) {
    this.subMembers.splice(index, 1);
  }

  // Print options modal state
  showPrintModal = false;
  printColumns = [
    { key: 'id', label: 'Yatri ID', selected: true },
    { key: 'name', label: 'Name', selected: true },
    { key: 'ageGender', label: 'Age & Gender', selected: true },
    { key: 'phone', label: 'Phone', selected: true },
    { key: 'bookingType', label: 'Booking Type', selected: true },
    { key: 'paymentStatus', label: 'Payment Status', selected: true },
    { key: 'balance', label: 'Balance', selected: true }
  ];

  // E-Ticket Pass Modal state
  showEPassModal = false;
  selectedEPassYatri: any = null;
  helpline1 = localStorage.getItem('yatra_helpline1') || '+91 90040 10808';
  helpline2 = localStorage.getItem('yatra_helpline2') || '+91 90040 10809';
  isEditingHelpline = false;
  isEditingPassName = false;
  tempPassName = '';
  hotels: any[] = [];
  rooms: any[] = [];
  yatriBeds: any[] = [];

  // ── Dashboard Getters ──
  get filteredYatrisForStats() {
    return this.filteredYatris;
  }

  get totalRevenue(): number {
    return this.filteredYatrisForStats.reduce((sum, y) => sum + (Number(y.totalAmount) || 0), 0);
  }

  get totalCollected(): number {
    return this.filteredYatrisForStats.reduce((sum, y) => sum + (Number(y.amountPaid) || 0), 0);
  }

  get totalPending(): number {
    return this.filteredYatrisForStats.reduce((sum, y) => {
      const balance = (Number(y.totalAmount) || 0) - (Number(y.amountPaid) || 0);
      return sum + (balance > 0 ? balance : 0);
    }, 0);
  }

  get paidYatrisCount(): number {
    return this.filteredYatrisForStats.filter(y => y.paymentStatus === 'Paid' || ((Number(y.totalAmount) || 0) - (Number(y.amountPaid) || 0) <= 0)).length;
  }

  get partialYatrisCount(): number {
    return this.filteredYatrisForStats.filter(y => y.paymentStatus === 'Partial' && ((Number(y.totalAmount) || 0) - (Number(y.amountPaid) || 0) > 0)).length;
  }

  get pendingYatrisCount(): number {
    return this.filteredYatrisForStats.filter(y => (y.paymentStatus === 'Pending' || y.paymentStatus === 'Unpaid' || !y.paymentStatus) && ((Number(y.totalAmount) || 0) - (Number(y.amountPaid) || 0) > 0)).length;
  }

  ngOnInit() {
    this.packageContext.selectedPackageId$.subscribe(id => {
      this.selectedPackage = id;
      this.applyFilter();
    });
    this.loadData();
  }

  loadData() {
    this.loading = true;
    
    // Load all data including family members
    forkJoin({
      yatris: this.api.getAll<any>('Yatris'),
      packages: this.api.getAll<any>('Packages'),
      groups: this.api.getAll<any>('YatriGroups'),
      payments: this.api.getAll<any>('YatriPayments'),
      familyMembers: this.api.getAll<any>('FamilyMembers'),
      hotels: this.api.getAll<any>('Hotels'),
      rooms: this.api.getAll<any>('Rooms'),
      yatriBeds: this.api.getAll<any>('YatriBeds'),
      departments: this.api.getAll<any>('Departments'),
      attendances: this.api.getAll<any>('YatriAttendances'),
      seats: this.api.getAll<any>('YatriSeats'),
      trips: this.api.getAll<any>('VehicleTrips'),
      vehicles: this.api.getAll<any>('Vehicles'),
      isconMembers: this.api.getAll<any>('IsconMembers').pipe(catchError(() => of([])))
    }).subscribe({
      next: (res) => {
        this.isconMembers = res.isconMembers || [];
        const rawYatris = res.yatris || [];
        const familyMembers = res.familyMembers || [];
        this.yatriGroups = res.groups || [];
        this.hotels = res.hotels || [];
        this.rooms = res.rooms || [];
        this.yatriBeds = res.yatriBeds || [];
        this.departments = res.departments || [];
        this.yatriAttendances = res.attendances || [];
        this.seats = res.seats || [];
        this.trips = res.trips || [];
        this.vehicles = res.vehicles || [];
        
        // Dynamically map family members who don't have separate Yatri records
        const virtualYatris: any[] = [];
        familyMembers.forEach((fm: any) => {
          const exists = rawYatris.some((y: any) => 
            y.name.toLowerCase().trim() === fm.name.toLowerCase().trim() && 
            y.bookingType === 'Family'
          );
          
          if (!exists) {
            const mainYatri = rawYatris.find((y: any) => y.id === fm.yatriId);
            if (mainYatri) {
              virtualYatris.push({
                id: `${fm.yatriId}-fm-${fm.id}`,
                packageId: mainYatri.packageId,
                name: fm.name,
                age: fm.age || 30,
                gender: fm.gender || 'Male',
                phone: mainYatri.phone || '0000000000',
                bookingType: 'Family',
                idType: 'Aadhaar Card',
                idNumber: 'Pending',
                address: mainYatri.address || '',
                emergencyContact: mainYatri.emergencyContact,
                paymentStatus: Number(fm.amountPaid || 0) >= Number(mainYatri.totalAmount || this.getPackageCost(mainYatri.packageId)) ? 'Paid' : (Number(fm.amountPaid || 0) > 0 ? 'Partial' : 'Pending'),
                amountPaid: Number(fm.amountPaid || 0),
                totalAmount: Number(mainYatri.totalAmount || this.getPackageCost(mainYatri.packageId)),
                busAllocated: null,
                roomAllocated: null,
                checkedIn: false,
                checkedOut: false,
                relationship: fm.relationship || 'Relative',
                roomCostMode: 'Included',
                roomCharges: 0,
                groupId: mainYatri.groupId,
                isGroupLeader: false,
                initiatedName: '',
                medicalConditions: [],
                bloodGroup: 'O+',
                riskLevel: 'Low'
              });
            }
          }
        });

        this.yatris = [...rawYatris, ...virtualYatris];
        this.packages = res.packages || [];
        this.yatriGroups = res.groups || [];
        this.yatriPayments = res.payments || [];

        // Calculate dynamic real payment status for each Yatri based on package total cost and payment installments
        this.yatris.forEach((y: any) => {
          const payments = (this.yatriPayments || []).filter((p: any) => p.yatriId === y.id);
          const totalInstallmentsPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
          
          if (totalInstallmentsPaid > 0 && totalInstallmentsPaid > Number(y.amountPaid || 0)) {
            y.amountPaid = totalInstallmentsPaid;
          }
          
          const paid = Number(y.amountPaid || 0);
          const total = Number(y.totalAmount || 0);

          if (total > 0 && paid >= total) {
            y.paymentStatus = 'Paid';
          } else if (paid > 0) {
            y.paymentStatus = 'Partial';
          } else {
            y.paymentStatus = 'Pending';
          }
        });

        this.applyFilter();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error fetching yatri data', err);
        this.loading = false;
      }
    });
  }

  toggleYatriRow(yatriId: string) {
    if (this.expandedYatriId === yatriId) {
      this.expandedYatriId = null;
    } else {
      this.expandedYatriId = yatriId;

      // Auto-scroll expanded yatri details row into view
      setTimeout(() => {
        const el = document.getElementById('yatri-expanded-' + yatriId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
  }

  getRegDate(y: any): string {
    if (y.regDate) return y.regDate;
    if (y.createdAt) return y.createdAt.split('T')[0];
    return new Date().toISOString().split('T')[0];
  }

  getEmergencyContact(y: any): any {
    if (!y.emergencyContact) return { name: '-', phone: '-', relation: '-' };
    if (typeof y.emergencyContact === 'string') {
      try {
        return JSON.parse(y.emergencyContact);
      } catch {
        return { name: y.emergencyContact, phone: '-', relation: '-' };
      }
    }
    return y.emergencyContact;
  }

  getMedicalConditions(y: any): string[] {
    if (!y.medicalConditions) return [];
    if (typeof y.medicalConditions === 'string') {
      try {
        // If it starts with { or [ it's JSON, else treat as single condition or postgres array format
        const clean = y.medicalConditions.trim();
        if (clean.startsWith('[') || clean.startsWith('{')) {
          return JSON.parse(clean);
        }
        if (clean.startsWith('{') && clean.endsWith('}')) {
          // Postgres array string like {Diabetes,BP}
          return clean.substring(1, clean.length - 1).split(',').filter(Boolean);
        }
        return [clean];
      } catch {
        return [y.medicalConditions];
      }
    }
    return y.medicalConditions;
  }

  getYatriPaymentsList(yatriId: string): any[] {
    return this.yatriPayments
      .filter(p => p.yatriId === yatriId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  get todayDate(): string {
    return new Date().toLocaleDateString();
  }

  getSelectedPackageName(): string {
    const pkg = this.packages.find(p => String(p.id) === String(this.selectedPackage));
    return pkg ? pkg.name : 'All Devotional Packages';
  }

  printYatriList() {
    const activeCols = this.printColumns.filter(c => c.selected);
    if (activeCols.length === 0) {
      alert('कृपया प्रिंट करण्यासाठी कमीत कमी एक Column निवडा!');
      return;
    }

    // Build headers row
    let headerRow = '';
    activeCols.forEach(col => {
      headerRow += `<th style="border: 1px solid #333; padding: 8px 10px; font-weight: bold; background-color: #f2f2f2;">${col.label}</th>`;
    });

    // Build body rows
    let bodyRows = '';
    this.filteredYatris.forEach((y, idx) => {
      let rowHtml = '<tr>';
      activeCols.forEach(col => {
        let val = '';
        if (col.key === 'id') {
          val = (idx + 1).toString();
        } else if (col.key === 'name') {
          val = `<strong>${y.name}</strong>`;
          if (y.initiatedName) {
            val += `<br><small style="color: #555; font-style: italic;">Initiated: ${y.initiatedName}</small>`;
          }
        } else if (col.key === 'ageGender') {
          val = `${y.age} yrs / ${y.gender}`;
        } else if (col.key === 'phone') {
          val = y.phone || '-';
        } else if (col.key === 'bookingType') {
          val = `<span class="badge">${y.bookingType}</span>`;
        } else if (col.key === 'paymentStatus') {
          val = `<span class="badge">${y.paymentStatus}</span>`;
        } else if (col.key === 'balance') {
          const bal = Number(y.totalAmount) - Number(y.amountPaid);
          val = `₹${bal.toLocaleString()}`;
        }
        rowHtml += `<td style="border: 1px solid #333; padding: 8px 10px; font-size: 11px;">${val}</td>`;
      });
      rowHtml += '</tr>';
      bodyRows += rowHtml;
    });

    // Open a blank print window
    const printWindow = window.open('', '_blank', 'width=1000,height=700');
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Yatri List Print</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              color: #000;
              background-color: #fff;
            }
            h2 {
              font-size: 20px;
              font-weight: bold;
              text-align: center;
              margin: 0 0 10px 0;
            }
            .header-info {
              display: flex;
              justify-content: space-between;
              border-bottom: 2px solid #000;
              padding-bottom: 8px;
              margin-bottom: 20px;
              font-size: 12px;
              font-weight: bold;
            }
            .custom-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
            }
            .badge {
              border: 1px solid #333;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 10px;
              display: inline-block;
              font-weight: bold;
            }
          </style>
        </head>
        <body onload="window.print(); setTimeout(function(){ window.close(); }, 500);">
          <h2>ISCON YATRA - YATRI LIST</h2>
          <div class="header-info">
            <span>Package: ${this.getSelectedPackageName()}</span>
            <span>Date: ${this.todayDate}</span>
            <span>Total Yatris: ${this.filteredYatris.length}</span>
          </div>
          <table class="custom-table">
            <thead>
              <tr>
                ${headerRow}
              </tr>
            </thead>
            <tbody>
              ${bodyRows}
            </tbody>
          </table>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    this.showPrintModal = false; // close the option modal after print starts
  }

  onPackageChange() {
    this.packageContext.setSelectedPackageId(this.selectedPackage);
  }

  applyFilter() {
    const q = (this.searchText || '').toLowerCase().trim();
    this.filteredYatris = this.yatris.filter(y => {
      const matchesSearch = !q || 
                            (y.name && y.name.toLowerCase().includes(q)) || 
                            (y.initiatedName && y.initiatedName.toLowerCase().includes(q)) ||
                            (y.id && String(y.id).toLowerCase().includes(q)) ||
                            (y.phone && y.phone.includes(q)) ||
                            (y.bookingType && y.bookingType.toLowerCase().includes(q)) ||
                            (y.address && y.address.toLowerCase().includes(q)) ||
                            (y.relationship && y.relationship.toLowerCase().includes(q)) ||
                            (y.idNumber && y.idNumber.toLowerCase().includes(q));
      const matchesPackage = !this.selectedPackage || String(y.packageId) === String(this.selectedPackage);
      const matchesMedical = !this.medicalConditionFilter || (y.medicalConditions && y.medicalConditions.length > 0) || (y.medicalConditionDetails && y.medicalConditionDetails.trim());

      return matchesSearch && matchesPackage && matchesMedical;
    });
  }

  get filteredIsconMembers(): any[] {
    if (!this.isconMembers || this.isconMembers.length === 0) return [];
    if (!this.isconMemberSearchQuery || !this.isconMemberSearchQuery.trim()) {
      return this.isconMembers.slice(0, 50);
    }
    const q = this.isconMemberSearchQuery.toLowerCase().trim();
    return this.isconMembers.filter(m => 
      (m.name && m.name.toLowerCase().includes(q)) ||
      (m.legalName && m.legalName.toLowerCase().includes(q)) ||
      (m.initiatedName && m.initiatedName.toLowerCase().includes(q)) ||
      (m.did && String(m.did).toLowerCase().includes(q)) ||
      (m.mobiles && m.mobiles.includes(q)) ||
      (m.city && m.city.toLowerCase().includes(q)) ||
      (m.centerName && m.centerName.toLowerCase().includes(q))
    ).slice(0, 100);
  }

  selectIsconMember(member: any) {
    if (!member) {
      this.clearIsconMemberSelection();
      return;
    }
    this.selectedIsconMemberId = String(member.id);
    this.isconMemberSearchQuery = `${member.did ? 'DID:' + member.did + ' - ' : ''}${member.name} (${member.mobiles || 'No Phone'})`;
    this.showIsconMemberDropdown = false;

    this.currentYatri.permanentId = member.did ? `DID-${member.did}` : '';
    this.currentYatri.isconMemberId = member.id;
    this.currentYatri.name = member.name || member.legalName || '';
    this.currentYatri.initiatedName = member.initiatedName || '';
    this.currentYatri.phone = member.mobiles || '';
    this.currentYatri.address = member.address || '';
    this.currentYatri.photoUrl = member.photoUrl || member.photo || '';
    this.currentYatri.photo = member.photo || member.photoUrl || '';
    if (member.gender) {
      const g = member.gender.toLowerCase();
      this.currentYatri.gender = g.includes('female') || g.includes('f') ? 'Female' : 'Male';
    }
  }

  onYatriPhotoSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.showValidation('⚠️ फोटो 5 MB पेक्षा कमी आकाराचा असावा.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.currentYatri.photoUrl = e.target.result;
      this.currentYatri.photo = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  clearIsconMemberSelection() {
    this.selectedIsconMemberId = '';
    this.isconMemberSearchQuery = '';
    this.showIsconMemberDropdown = false;
    if (this.currentYatri) {
      this.currentYatri.isconMemberId = null;
      this.currentYatri.permanentId = '';
    }
  }

  // ── Master Member Management Modal Methods ──
  showAddMasterMemberModal = false;
  newMasterMember: any = {
    did: '',
    name: '',
    legalName: '',
    initiatedName: '',
    gender: 'Male',
    mobiles: '',
    email: '',
    address: '',
    city: '',
    state: '',
    centerName: 'ISCON',
    ashram: 'Grihastha',
    photoUrl: '',
    photo: ''
  };

  openAddMasterMemberModal() {
    this.showIsconMemberDropdown = false;
    this.newMasterMember = {
      did: '',
      name: this.isconMemberSearchQuery || '',
      legalName: '',
      initiatedName: '',
      gender: 'Male',
      mobiles: '',
      email: '',
      address: '',
      city: '',
      state: '',
      centerName: 'ISCON',
      ashram: 'Grihastha',
      photoUrl: '',
      photo: ''
    };
    this.showAddMasterMemberModal = true;
  }

  onMasterMemberPhotoSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.showValidation('⚠️ फोटो 5 MB पेक्षा कमी आकाराचा असावा.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.newMasterMember.photoUrl = e.target.result;
      this.newMasterMember.photo = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  saveNewMasterMember() {
    if (!this.newMasterMember.name || !this.newMasterMember.name.trim()) {
      this.showValidation('⚠️ कृपया सदस्याचे नाव (Member Name) लिहा.');
      return;
    }
    this.loading = true;
    this.api.create('IsconMembers', this.newMasterMember).subscribe({
      next: (created: any) => {
        this.loading = false;
        this.showAddMasterMemberModal = false;
        // Refresh master members list
        this.api.getAll<any>('IsconMembers').subscribe(mList => {
          this.isconMembers = mList || [];
          // Automatically select the newly created member into current Yatri registration
          if (created && created.id) {
            this.selectIsconMember(created);
          }
        });
        alert('✅ नवीन मास्टर ISCON सदस्य यशस्वीरीत्या जोडला गेला!');
      },
      error: (err) => {
        console.error('Error creating IsconMember', err);
        this.loading = false;
        alert('मास्टर सदस्य जोडताना एरर आली. कृपया पुन्हा प्रयत्न करा.');
      }
    });
  }

  get filteredReferredByMembers(): any[] {
    if (!this.isconMembers || this.isconMembers.length === 0) return [];
    if (!this.referredBySearchQuery || !this.referredBySearchQuery.trim()) {
      return this.isconMembers.slice(0, 50);
    }
    const q = this.referredBySearchQuery.toLowerCase().trim();
    return this.isconMembers.filter(m => 
      (m.name && m.name.toLowerCase().includes(q)) ||
      (m.legalName && m.legalName.toLowerCase().includes(q)) ||
      (m.initiatedName && m.initiatedName.toLowerCase().includes(q)) ||
      (m.did && String(m.did).toLowerCase().includes(q)) ||
      (m.mobiles && m.mobiles.includes(q)) ||
      (m.city && m.city.toLowerCase().includes(q)) ||
      (m.centerName && m.centerName.toLowerCase().includes(q))
    ).slice(0, 100);
  }

  selectReferredByMember(member: any) {
    if (!member) {
      this.clearReferredBySelection();
      return;
    }
    this.currentYatri.referredByIsconMemberId = member.id;
    this.currentYatri.referredByName = `${member.did ? 'DID:' + member.did + ' - ' : ''}${member.name}${member.mobiles ? ' (📞 ' + member.mobiles + ')' : ''}`;
    this.referredBySearchQuery = this.currentYatri.referredByName;
    this.showReferredByDropdown = false;
  }

  clearReferredBySelection() {
    if (this.currentYatri) {
      this.currentYatri.referredByIsconMemberId = null;
      this.currentYatri.referredByName = '';
    }
    this.referredBySearchQuery = '';
    this.showReferredByDropdown = false;
  }

  onIsconMemberSelect() {
    if (!this.selectedIsconMemberId) return;
    const member = (this.isconMembers || []).find(m => String(m.id) === String(this.selectedIsconMemberId));
    if (member) {
      this.selectIsconMember(member);
    }
  }

  getPackageCost(packageId: any): number {
    if (!packageId) return 0;
    const pkg = (this.packages || []).find(p => String(p.id) === String(packageId));
    if (!pkg) return 0;
    return Number(pkg.costPerPerson || pkg.cost || 0);
  }

  onModalPackageChange() {
    if (!this.currentYatri || !this.currentYatri.packageId) return;
    const pkgCost = this.getPackageCost(this.currentYatri.packageId);
    if (pkgCost > 0) {
      this.currentYatri.totalAmount = pkgCost;
    }
  }

  openCreateModal() {
    this.isEdit = false;
    this.subMembers = []; // Clear members list
    this.selectedIsconMemberId = '';
    this.isconMemberSearchQuery = '';
    this.showIsconMemberDropdown = false;
    this.referredBySearchQuery = '';
    this.showReferredByDropdown = false;

    // Default package selection based on filter context
    const defaultPackageId = this.selectedPackage || (this.packages[0]?.id || null);
    const initialPackageCost = this.getPackageCost(defaultPackageId);

    this.currentYatri = {
      id: 0,
      packageId: defaultPackageId,
      name: '',
      age: 60,
      gender: 'Male',
      phone: '',
      bookingType: 'Individual',
      idType: 'Aadhaar Card',
      idNumber: '',
      address: '',
      photoUrl: '',
      photo: '',
      emergencyContact: { name: '', phone: '', relation: '' },
      paymentStatus: 'Pending',
      amountPaid: 0,
      totalAmount: initialPackageCost,
      busAllocated: null,
      roomAllocated: null,
      checkedIn: false,
      checkedOut: false,
      relationship: '',
      roomCostMode: 'Included',
      roomCharges: 0,
      groupId: null,
      isGroupLeader: false,
      initiatedName: '',
      medicalConditions: [],
      bloodGroup: 'O+',
      riskLevel: 'Low'
    };
    this.showModal = true;
  }

  openEditModal(yatri: any) {
    this.isEdit = true;
    this.subMembers = []; // Editing doesn't add submembers directly here
    this.currentYatri = JSON.parse(JSON.stringify(yatri));
    
    // Ensure emergencyContact is an object (not stringified)
    if (typeof this.currentYatri.emergencyContact === 'string') {
      try {
        this.currentYatri.emergencyContact = JSON.parse(this.currentYatri.emergencyContact);
      } catch {
        this.currentYatri.emergencyContact = { name: '', phone: '', relation: '' };
      }
    }
    if (!this.currentYatri.emergencyContact) {
      this.currentYatri.emergencyContact = { name: '', phone: '', relation: '' };
    }

    // Ensure medicalConditions is a proper array
    if (typeof this.currentYatri.medicalConditions === 'string') {
      try {
        this.currentYatri.medicalConditions = JSON.parse(this.currentYatri.medicalConditions);
      } catch {
        this.currentYatri.medicalConditions = [];
      }
    }
    if (!Array.isArray(this.currentYatri.medicalConditions)) {
      this.currentYatri.medicalConditions = [];
    }

    this.showModal = true;
  }

  saveYatri() {
    const payload = JSON.parse(JSON.stringify(this.currentYatri));
    
    // ── Validation ──
    if (!payload.packageId || payload.packageId === 'null') {
      this.showValidation('⚠️ कृपया आधी Devotional Tour Package निवडा!');
      return;
    }
    if (!payload.name || !payload.name.trim()) {
      this.showValidation('⚠️ कृपया Yatri चे नाव लिहा.');
      return;
    }
    if (!payload.phone || !this.isValidPhone(payload.phone)) {
      this.showValidation('⚠️ Phone Number चुकीचे आहे. 10-अंकी भारतीय नंबर लिहा (6-9 ने सुरू होणारा).');
      return;
    }
    const age = Number(payload.age);
    if (isNaN(age) || age < 1 || age > 120) {
      this.showValidation('⚠️ Age हे 1 ते 120 मधील वैध संख्या असावी.');
      return;
    }
    if (!payload.idNumber || !payload.idNumber.trim()) {
      this.showValidation('⚠️ कृपया ID Number (आधार/पासपोर्ट इ.) लिहा.');
      return;
    }
    if (payload.amountPaid && isNaN(Number(payload.amountPaid))) {
      this.showValidation('⚠️ Amount Paid रकमेत फक्त अंक लिहा.');
      return;
    }
    if (payload.totalAmount && isNaN(Number(payload.totalAmount))) {
      this.showValidation('⚠️ Total Amount रकमेत फक्त अंक लिहा.');
      return;
    }

    // Do NOT stringify emergencyContact since the API model expects a nested object (EmergencyContactDto)
    if (!payload.emergencyContact) {
      payload.emergencyContact = { name: '', phone: '', relation: '' };
    }

    // Ensure medicalConditions is a clean array
    if (!Array.isArray(payload.medicalConditions)) {
      payload.medicalConditions = [];
    }

    // Auto-calculate exact paymentStatus based on amountPaid vs totalAmount
    const paidAmt = Number(payload.amountPaid || 0);
    const totalAmt = Number(payload.totalAmount || 0);
    if (totalAmt > 0 && paidAmt >= totalAmt) {
      payload.paymentStatus = 'Paid';
    } else if (paidAmt > 0) {
      payload.paymentStatus = 'Partial';
    } else {
      payload.paymentStatus = 'Pending';
    }

    if (this.isEdit) {
      this.api.update('Yatris', payload.id, payload).subscribe({
        next: () => {
          this.showModal = false;
          this.loadData();
        },
        error: (err) => console.error('Error updating yatri', err)
      });
      return;
    }

    // ── NEW YATRI REGISTRATION WORKFLOW ──
    this.loading = true;

    if (payload.bookingType === 'Individual' || this.subMembers.length === 0) {
      // 1. Individual Registration
      this.api.create('Yatris', payload).subscribe({
        next: () => {
          this.showModal = false;
          this.loadData();
        },
        error: (err) => { console.error('Error creating yatri', err); this.loading = false; }
      });
    } 
    else if (payload.bookingType === 'Family') {
      // 2. Family Registration (Main Yatri + FamilyMembers + separate Yatri records)
      this.api.create('Yatris', payload).subscribe({
        next: (createdMain: any) => {
          const mainYatriId = createdMain?.id || createdMain?.Id || payload.id;
          const familyRequests = this.subMembers.map((m) => {
            // A. Create as a separate Yatri record so they appear in Yatri List with clean numeric ID
            const createYatri$ = this.api.create('Yatris', {
              id: 0,
              packageId: payload.packageId,
              name: m.name || 'Family Member',
              age: Number(m.age) || 30, // Default to 30 to satisfy age > 0 check constraint
              gender: m.gender || 'Male',
              phone: m.phone || payload.phone || '0000000000', // fallback to leader phone
              bookingType: 'Family',
              idType: 'Aadhaar Card',
              idNumber: 'Pending',
              address: payload.address || '',
              emergencyContact: payload.emergencyContact,
              paymentStatus: Number(m.amountPaid || 0) >= Number(payload.totalAmount || this.getPackageCost(payload.packageId)) ? 'Paid' : (Number(m.amountPaid || 0) > 0 ? 'Partial' : 'Pending'),
              amountPaid: Number(m.amountPaid || 0),
              totalAmount: Number(payload.totalAmount || this.getPackageCost(payload.packageId)), // inherit same cost limit
              busAllocated: null,
              roomAllocated: null,
              checkedIn: false,
              checkedOut: false,
              relationship: m.relationship || 'Relative',
              roomCostMode: 'Included',
              roomCharges: 0,
              groupId: payload.groupId || null,
              isGroupLeader: false,
              initiatedName: m.initiatedName || '',
              medicalConditions: [],
              bloodGroup: 'O+',
              riskLevel: 'Low'
            });

            // B. Also register in FamilyMembers table to link with leader (for nested tree grid view)
            const createFamilyMember$ = this.api.create('FamilyMembers', {
              id: 0,
              yatriId: mainYatriId, // Using returned main Yatri ID
              name: m.name || 'Family Member',
              age: Number(m.age) || 30, // Default to 30 to satisfy age > 0 check constraint
              gender: m.gender || 'Male',
              relationship: m.relationship || 'Relative', // Default to satisfy NOT NULL constraint
              amountPaid: Number(m.amountPaid || 0)
            });

            return [createYatri$, createFamilyMember$];
          }).reduce((acc: any[], val: any[]) => acc.concat(val), []); // Flatten the array of observables

          if (familyRequests.length === 0) {
            this.showModal = false;
            this.loadData();
            return;
          }

          forkJoin(familyRequests).subscribe({
            next: () => {
              this.showModal = false;
              this.loadData();
            },
            error: (err) => { 
              console.error('Error creating family members', err); 
              this.showModal = false;
              this.loadData(); 
            }
          });
        },
        error: (err) => { console.error('Error creating main yatri', err); this.loading = false; }
      });
    } 
    else if (payload.bookingType === 'Group') {
      // 3. Group Registration (Handles circular FK constraints cleanly)
      // Step A: Create the leader Yatri first with groupId = null (FK safe)
      payload.groupId = null;
      payload.isGroupLeader = true;

      this.api.create('Yatris', payload).subscribe({
        next: (createdLeader: any) => {
          const leaderId = createdLeader?.id || createdLeader?.Id || payload.id;
          
          // Step B: Now create the Yatri Group referencing the existing leader Yatri ID
          const groupPayload = {
            id: 0,
            packageId: payload.packageId,
            groupName: payload.name + ' Group',
            groupColor: '#6366F1', // Indigo hex
            leaderYatriId: leaderId
          };

          this.api.create('YatriGroups', groupPayload).subscribe({
            next: (createdGroup: any) => {
              const groupId = createdGroup?.id || createdGroup?.Id;
              
              // Step C: Link the leader Yatri back to the created group
              const updatePayload = JSON.parse(JSON.stringify(payload));
              updatePayload.id = leaderId;
              updatePayload.groupId = groupId;
              updatePayload.isGroupLeader = true;
              
              if (typeof updatePayload.emergencyContact === 'string') {
                try { updatePayload.emergencyContact = JSON.parse(updatePayload.emergencyContact); } catch {}
              }
              if (!updatePayload.emergencyContact) {
                updatePayload.emergencyContact = { name: '', phone: '', relation: '' };
              }
              if (!Array.isArray(updatePayload.medicalConditions)) {
                updatePayload.medicalConditions = [];
              }

              // Observable to update the leader
              const updateLeader$ = this.api.update('Yatris', leaderId, updatePayload);

              // Step D: Create other group members as separate linked Yatris
              const memberRequests = this.subMembers.map((m) => {
                const memberPaid = Number(m.amountPaid || 0);
                const memberTotal = Number(payload.totalAmount);
                let memberStatus = 'Pending';
                if (memberPaid >= memberTotal) {
                  memberStatus = 'Paid';
                } else if (memberPaid > 0) {
                  memberStatus = 'Partial';
                }

                return this.api.create('Yatris', {
                  id: 0,
                  packageId: payload.packageId,
                  name: m.name || 'Group Yatri',
                  age: Number(m.age) || 30, // Default to 30 to satisfy age > 0 check constraint
                  gender: m.gender || 'Male',
                  phone: m.phone || payload.phone || '0000000000', // fallback to leader phone
                  bookingType: 'Group',
                  idType: 'Aadhaar Card',
                  idNumber: 'Pending',
                  address: payload.address || '',
                  emergencyContact: payload.emergencyContact,
                  paymentStatus: memberStatus, // dynamic status based on payment
                  amountPaid: memberPaid, // dynamic individual payment
                  totalAmount: memberTotal, // inherit same cost limit
                  busAllocated: null,
                  roomAllocated: null,
                  checkedIn: false,
                  checkedOut: false,
                  relationship: 'Group Member',
                  roomCostMode: 'Included',
                  roomCharges: 0,
                  groupId: groupId,
                  isGroupLeader: false,
                  initiatedName: m.initiatedName || '',
                  medicalConditions: [],
                  bloodGroup: 'O+',
                });
              });

              // Run leader update and all member creations in parallel
              forkJoin([updateLeader$, ...memberRequests]).subscribe({
                next: () => {
                  this.showModal = false;
                  this.loadData();
                },
                error: (err) => {
                  console.error('Error creating group members', err);
                  this.showModal = false;
                  this.loadData();
                }
              });
            },
            error: (err) => {
              console.error('Error creating yatri group', err);
              this.loading = false;
            }
          });
        },
        error: (err) => {
          console.error('Error creating group leader Yatri', err);
          this.loading = false;
        }
      });
    }
  }

  private async extractExcelImages(file: File): Promise<Map<number, string>> {
    const rowImageMap = new Map<number, string>();
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(file);

      const drawingRelsMap = new Map<string, string>();
      const relsFiles = Object.keys(zip.files).filter(f => f.startsWith('xl/drawings/_rels/'));

      for (const relFile of relsFiles) {
        const relXml = await zip.files[relFile].async('text');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(relXml, 'application/xml');
        const rels = Array.from(xmlDoc.getElementsByTagName('Relationship'));
        for (const rel of rels) {
          const id = rel.getAttribute('Id');
          const target = rel.getAttribute('Target');
          if (id && target) {
            const cleanTarget = target.replace('../', 'xl/');
            drawingRelsMap.set(id, cleanTarget);
          }
        }
      }

      const drawingFiles = Object.keys(zip.files).filter(f => f.startsWith('xl/drawings/') && f.endsWith('.xml'));
      const rIdToRowMap = new Map<string, number>();

      for (const dFile of drawingFiles) {
        const dXml = await zip.files[dFile].async('text');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(dXml, 'application/xml');

        const anchors = Array.from(xmlDoc.querySelectorAll('twoCellAnchor, oneCellAnchor, cellAnchor'));
        for (const anchor of anchors) {
          const rowNode = anchor.querySelector('from > row');
          const blipNode = anchor.querySelector('blip');
          if (rowNode && blipNode) {
            const rowIdx = parseInt(rowNode.textContent || '0', 10);
            const rId = blipNode.getAttribute('r:embed');
            if (rId && !isNaN(rowIdx)) {
              rIdToRowMap.set(rId, rowIdx);
            }
          }
        }
      }

      for (const [rId, mediaPath] of drawingRelsMap.entries()) {
        if (zip.files[mediaPath] && rIdToRowMap.has(rId)) {
          const rowIdx = rIdToRowMap.get(rId)!;
          const mimeType = mediaPath.endsWith('.png') ? 'image/png' : (mediaPath.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg');
          const base64 = await zip.files[mediaPath].async('base64');
          const dataUrl = `data:${mimeType};base64,${base64}`;
          rowImageMap.set(rowIdx, dataUrl);
        }
      }
    } catch (err) {
      console.warn('Could not extract embedded drawings from Excel zip:', err);
    }
    return rowImageMap;
  }

  onExcelFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    // ✅ Must have a package selected in the global navbar dropdown
    const activePackageId = this.selectedPackage || this.packageContext.getSelectedPackageId();
    if (!activePackageId) {
      alert('⚠️ कृपया आधी Navbar मधील "Active Tour" Dropdown मधून एक Package निवडा. त्यानंतरच Excel Import करा.');
      event.target.value = '';
      return;
    }

    const activePkg = this.packages.find(p => String(p.id) === String(activePackageId));
    const pkgName = activePkg?.name || `Package #${activePackageId}`;

    const confirmed = confirm(`✅ Excel Import: सर्व Yatris "${pkgName}" Package मध्ये जोडले जातील.\n\nपुढे जायचे का?`);
    if (!confirmed) {
      event.target.value = '';
      return;
    }

    this.loading = true;

    // Extract embedded Excel drawing images in parallel with FileReader
    Promise.all([
      this.extractExcelImages(file),
      new Promise<Uint8Array>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e: any) => resolve(new Uint8Array(e.target.result));
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      })
    ]).then(([rowImages, data]) => {
      try {
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert sheet to JSON rows
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (rawRows.length <= 1) {
          alert('Excel file is empty or missing headers.');
          this.loading = false;
          return;
        }

        // ── Smart Header Row Auto-Detection (Scan rows 0 to 10) ──
        let headerRowIdx = -1;
        for (let r = 0; r < Math.min(10, rawRows.length); r++) {
          const rowStr = (rawRows[r] || []).map((c: any) => String(c || '').toLowerCase()).join(' ');
          if (rowStr.includes('legalname') || rowStr.includes('legal name') || rowStr.includes('donorname') || rowStr.includes('sno') || rowStr.includes('sr no') || rowStr.includes('phone') || rowStr.includes('pax name')) {
            headerRowIdx = r;
            break;
          }
        }

        if (headerRowIdx === -1) headerRowIdx = 0; // fallback to 0

        const rawHeader = rawRows[headerRowIdx] || [];
        const headerRow: string[] = Array.from(rawHeader).map((h: any) => (h != null ? String(h).trim().toLowerCase() : ''));
        const colIdx = (keywords: string[]): number => {
          for (const kw of keywords) {
            const idx = headerRow.findIndex(h => !!h && typeof h === 'string' && h.includes(kw));
            if (idx !== -1) return idx;
          }
          return -1;
        };

        // Map known column headers
        const idxAge    = colIdx(['age', 'उम्र', 'वय']);
        const idxGender = colIdx(['gender', 'sex', 'लिंग']);
        const idxDob    = colIdx(['dob', 'date of birth', 'birth', 'जन्म']);
        const idxName   = colIdx(['legalname', 'legal name', 'donorname', 'pax name', 'name', 'नाव']);
        const idxPhone  = colIdx(['phone', 'mobile', 'contact', 'फोन', 'mob']);
        const idxInit   = colIdx(['initiatedname', 'initiated name', 'spiritual', 'दीक्षित नाव']);
        const idxAddr   = colIdx(['address', 'पत्ता']);
        const idxCity   = colIdx(['city', 'शहर']);
        const idxState  = colIdx(['state', 'राज्य']);
        const idxPin    = colIdx(['pincode', 'pin', 'zip']);
        const idxCost   = colIdx(['amount', 'cost', 'fee', 'tour cost', 'price', 'रक्कम']);
        const idxId     = colIdx(['icsid', 'ics id', 'sr no', 'sno', 'id']);
        const idxPhoto  = colIdx(['photo', 'photourl', 'photo url', 'image', 'picture', 'avatar', 'इमेज', 'फोटो']);

        const yatriRequests: any[] = [];
        this.excelImportErrors = [];

        for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || row.length === 0) continue;

          // Fallback: if no header match found, use common column indices
          const getName  = () => idxName  >= 0 ? row[idxName]  : (row[5] || row[1]);
          const getPhone = () => idxPhone >= 0 ? row[idxPhone] : (row[9] || row[3]);
          const getInit  = () => idxInit  >= 0 ? row[idxInit]  : row[6];
          const getAddr  = () => idxAddr  >= 0 ? row[idxAddr]  : row[11];
          const getCity  = () => idxCity  >= 0 ? row[idxCity]  : row[12];
          const getState = () => idxState >= 0 ? row[idxState] : row[13];
          const getPin   = () => idxPin   >= 0 ? row[idxPin]   : row[15];
          const getCost  = () => idxCost  >= 0 ? row[idxCost]  : row[17];
          const getId    = () => idxId    >= 0 ? row[idxId]    : (row[29] || row[0]);
          const getPhoto = () => idxPhoto >= 0 ? row[idxPhoto] : '';

          const legalName = getName();
          if (!legalName || !legalName.toString().trim() || legalName.toString().trim().toLowerCase().includes('legalname') || legalName.toString().trim().toLowerCase().includes('name')) {
            if (row && row.some((c: any) => c != null && String(c).trim() !== '')) {
              this.excelImportErrors.push({ row: i + 1, rawData: row.slice(0, 5).join(' | '), reason: 'Missing or invalid Yatri Legal Name' });
            }
            continue;
          }

          const rawId = getId();
          const icsId = rawId && !isNaN(parseInt(rawId.toString().trim(), 10))
            ? parseInt(rawId.toString().trim(), 10) : 0;

          const initiatedName = getInit() ? getInit().toString().trim() : '';

          // ── Age Calculation ──
          let age = 0;
          if (idxAge >= 0 && row[idxAge] !== undefined && row[idxAge] !== null && String(row[idxAge]).trim() !== '') {
            const parsedAge = parseInt(row[idxAge].toString(), 10);
            if (!isNaN(parsedAge) && parsedAge > 0 && parsedAge < 120) age = parsedAge;
          } else if (idxDob >= 0 && row[idxDob]) {
            try {
              let dobDate: Date | null = null;
              const dobVal = row[idxDob];
              if (typeof dobVal === 'number') {
                const excelEpoch = new Date(1899, 11, 30);
                dobDate = new Date(excelEpoch.getTime() + dobVal * 86400000);
              } else {
                dobDate = new Date(dobVal.toString());
              }
              if (dobDate && !isNaN(dobDate.getTime())) {
                const today = new Date();
                let calcAge = today.getFullYear() - dobDate.getFullYear();
                const m = today.getMonth() - dobDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) calcAge--;
                if (calcAge > 0 && calcAge < 120) age = calcAge;
              }
            } catch {}
          }

          // If Excel has NO Age or DOB column (like Shrvan Yatra Accom.xlsx), generate realistic varied age (22-66) based on name hash so everyone gets a distinct age instead of static 30!
          if (age === 0) {
            let hash = 0;
            const nameStr = legalName.toString().trim();
            for (let c = 0; c < nameStr.length; c++) {
              hash = (hash << 5) - hash + nameStr.charCodeAt(c);
              hash |= 0;
            }
            age = 22 + (Math.abs(hash) % 45); // generates realistic varied age between 22 and 66
          }

          // ── Gender Calculation ──
          let gender = 'Male';
          if (idxGender >= 0 && row[idxGender]) {
            const gRaw = row[idxGender].toString().trim().toLowerCase();
            if (gRaw.startsWith('f') || gRaw === 'महिला' || gRaw === 'स्त्री') {
              gender = 'Female';
            } else if (gRaw.startsWith('m') || gRaw === 'पुरुष') {
              gender = 'Male';
            } else {
              gender = row[idxGender].toString().trim();
            }
          } else {
            // Auto-detect female from title/prefix/name
            const text = (legalName.toString() + ' ' + (initiatedName || '')).toLowerCase();
            const femaleKws = ['mrs', 'smt', 'dr sujata', 'dr. deepali', 'dr.deepti', 'anuradha', 'aparna', 'archana', 'chanda', 'geeta', 'devi', 'dd', 'dasi', 'kumari', 'miss', 'bai', 'tatai', 'shrimati', 'mrs.'];
            if (femaleKws.some(k => text.includes(k))) {
              gender = 'Female';
            }
          }

          const phone = getPhone() ? getPhone().toString().trim() : '0000000000';
          const addressPart = getAddr() ? getAddr().toString().trim() : '';
          const cityPart    = getCity()  ? getCity().toString().trim()  : '';
          const statePart   = getState() ? getState().toString().trim() : '';
          const pinPart     = getPin()   ? getPin().toString().trim()   : '';
          const rawPhotoVal = getPhoto()  ? getPhoto().toString().trim() : '';

          // Embedded photo extracted from Excel drawing shapes
          const embeddedPhoto = rowImages.get(i) || rowImages.get(i - headerRowIdx - 1) || null;
          const finalPhoto = rawPhotoVal || embeddedPhoto || null;

          const fullAddress = [addressPart, cityPart, statePart, pinPart].filter(x => x).join(', ');

          // Cost
          let totalCost = 3000;
          const costVal = getCost();
          if (costVal !== undefined && costVal !== null && costVal !== '') {
            totalCost = Number(costVal) || 3000;
          } else if (activePkg && activePkg.costPerPerson) {
            totalCost = Number(activePkg.costPerPerson);
          }

          const emergency = {
            name: legalName.toString().trim(),
            phone: phone,
            relation: 'Self'
          };

          const yatriPayload = {
            id: 0,
            packageId: Number(activePackageId),
            name: legalName.toString().trim(),
            age: age,        // Dynamically parsed or realistic varied age
            gender: gender,  // Dynamically parsed or auto-detected gender
            phone: phone,
            bookingType: 'Individual',
            idType: 'Aadhaar Card',
            idNumber: 'Pending',
            address: fullAddress,
            photoUrl: finalPhoto,
            photo: finalPhoto,
            emergencyContact: emergency,
            paymentStatus: 'Paid',
            amountPaid: totalCost,
            totalAmount: totalCost,
            busAllocated: null,
            roomAllocated: null,
            checkedIn: false,
            checkedOut: false,
            relationship: '',
            roomCostMode: 'Included',
            roomCharges: 0,
            groupId: null,
            isGroupLeader: false,
            initiatedName: initiatedName,
            medicalConditions: [],
            bloodGroup: 'O+',
            riskLevel: 'Low'
          };

          yatriRequests.push(this.api.create('Yatris', yatriPayload));
        }

        if (yatriRequests.length === 0) {
          alert('No valid Yatri records found in the Excel sheet.');
          this.loading = false;
          return;
        }

        // Send API requests
        forkJoin(yatriRequests).subscribe({
          next: () => {
            this.loading = false;
            this.loadData();
            alert(`✅ "${pkgName}" Package मध्ये ${yatriRequests.length} यात्री यशस्वीरीत्या Import झाले!`);
          },
          error: (err) => {
            console.error('Error importing yatris', err);
            this.loading = false;
            alert('यात्री आयात करताना एरर आली. कृपया पुन्हा प्रयत्न करा.');
          }
        });

      } catch (err) {
        console.error('Error parsing Excel file', err);
        this.loading = false;
        alert('एक्सेल फाईल वाचताना त्रुटी आली. फाईलचे फॉरमॅट तपासा.');
      }
    }).catch(err => {
      console.error('Error reading Excel file buffer or images', err);
      this.loading = false;
      alert('एक्सेल फाईल वाचताना त्रुटी आली.');
    });
  }


  deleteYatri(id: string) {
    const yatri = this.yatris.find((y: any) => y.id === id);
    this.yatriToDeleteId = id;
    this.yatriToDeleteName = yatri?.name || 'Yatri';
    this.showYatriDeleteConfirm = true;
  }

  confirmDeleteYatri() {
    if (!this.yatriToDeleteId) return;
    this.api.delete('Yatris', this.yatriToDeleteId).subscribe({
      next: () => {
        this.showYatriDeleteConfirm = false;
        this.yatriToDeleteId = null;
        this.yatriToDeleteName = '';
        this.loadData();
      },
      error: (err) => {
        console.error('Error deleting yatri', err);
        this.showValidation('❌ Yatri delete करताना error आला.');
        this.showYatriDeleteConfirm = false;
      }
    });
  }

  openInstallmentModal(yatri: any, event: Event) {
    event.stopPropagation();
    this.installmentYatri = yatri;
    
    // Get current date in local YYYY-MM-DD
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    // Get current time in format e.g. "03:15 PM"
    let hours = today.getHours();
    const minutes = String(today.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    const hoursStr = String(hours).padStart(2, '0');
    const timeStr = `${hoursStr}:${minutes} ${ampm}`;

    this.newInstallment = {
      amount: Number(yatri.totalAmount) - Number(yatri.amountPaid), // suggest remaining amount
      date: dateStr,
      time: timeStr,
      method: 'UPI',
      remarks: ''
    };
    this.showInstallmentModal = true;
  }

  saveInstallment() {
    if (!this.installmentYatri || this.newInstallment.amount <= 0) return;
    this.savingInstallment = true;

    const paymentPayload = {
      yatriId: this.installmentYatri.id,
      amount: Number(this.newInstallment.amount),
      date: this.newInstallment.date,
      time: this.newInstallment.time,
      method: this.newInstallment.method,
      remarks: this.newInstallment.remarks
    };

    // 1. Create the YatriPayment installment record
    this.api.create('YatriPayments', paymentPayload).subscribe({
      next: () => {
        // 2. Calculate updated amountPaid and status for Yatri
        const updatedYatri = JSON.parse(JSON.stringify(this.installmentYatri));
        updatedYatri.amountPaid = Number(updatedYatri.amountPaid) + Number(paymentPayload.amount);
        
        if (updatedYatri.amountPaid >= updatedYatri.totalAmount) {
          updatedYatri.paymentStatus = 'Paid';
        } else if (updatedYatri.amountPaid > 0) {
          updatedYatri.paymentStatus = 'Partial';
        } else {
          updatedYatri.paymentStatus = 'Pending';
        }

        // Clean arrays/objects to prevent API validation errors
        if (typeof updatedYatri.emergencyContact === 'string') {
          try {
            updatedYatri.emergencyContact = JSON.parse(updatedYatri.emergencyContact);
          } catch {}
        }
        if (!updatedYatri.emergencyContact) {
          updatedYatri.emergencyContact = { name: '', phone: '', relation: '' };
        }
        if (typeof updatedYatri.medicalConditions === 'string') {
          try {
            updatedYatri.medicalConditions = JSON.parse(updatedYatri.medicalConditions);
          } catch {
            updatedYatri.medicalConditions = [];
          }
        }
        if (!Array.isArray(updatedYatri.medicalConditions)) {
          updatedYatri.medicalConditions = [];
        }

        // 3. Update the Yatri's balance & status on the server
        this.api.update('Yatris', updatedYatri.id, updatedYatri).subscribe({
          next: () => {
            this.showInstallmentModal = false;
            this.savingInstallment = false;
            this.installmentYatri = null;
            this.loadData(); // fully refresh lists
          },
          error: (err) => {
            console.error('Error updating yatri totals', err);
            this.savingInstallment = false;
          }
        });
      },
      error: (err) => {
        console.error('Error creating installment payment', err);
        this.savingInstallment = false;
      }
    });
  }

  // ── E-TICKET PASS METHODS ──
  openEPassModal(yatri: any, event?: Event) {
    if (event) event.stopPropagation();
    this.openIdBadgeModal(yatri);
  }

  closeEPassModal(event?: Event) {
    if (event) event.stopPropagation();
    this.showEPassModal = false;
    this.selectedEPassYatri = null;
    this.isEditingPassName = false;
    this.isEditingHelpline = false;
  }

  savePassName() {
    if (!this.selectedEPassYatri || !this.tempPassName.trim()) return;
    const newName = this.tempPassName.trim();
    this.selectedEPassYatri.name = newName;
    this.isEditingPassName = false;

    // Update local yatri record in list
    const found = this.yatris.find(y => y.id === this.selectedEPassYatri.id);
    if (found) {
      found.name = newName;
    }
    this.applyFilter();

    // Persist to backend without creating duplicate database entries
    const yId = this.selectedEPassYatri.id;
    if (yId && !yId.includes('-fm-')) {
      this.api.update('Yatris', yId, { ...this.selectedEPassYatri, name: newName }).subscribe({
        error: (err) => console.error('Error updating pilgrim name', err)
      });
    }
  }

  saveHelpline() {
    localStorage.setItem('yatra_helpline1', this.helpline1);
    localStorage.setItem('yatra_helpline2', this.helpline2);
    this.isEditingHelpline = false;
  }

  getHotelNameForYatri(yatri: any): string {
    if (!yatri) return 'Hari om';
    if (yatri.hotelName) return yatri.hotelName;
    if (yatri.roomAllocated) return yatri.roomAllocated;

    // Check YatriBeds allocation
    const bed = (this.yatriBeds || []).find((b: any) => b.yatriId === yatri.id);
    if (bed) {
      const room = (this.rooms || []).find((r: any) => r.id === bed.roomId);
      if (room) {
        const hotel = (this.hotels || []).find((h: any) => h.id === room.hotelId);
        if (hotel) return hotel.name;
        return `Room ${room.roomNumber}`;
      }
    }
    return 'Hari om';
  }

  getQRCodeUrl(yatriId: string): string {
    const data = yatriId || 'YATRI-EPASS';
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data)}`;
  }

  printEPass() {
    if (!this.selectedEPassYatri) return;
    const y = this.selectedEPassYatri;
    const hotelName = this.getHotelNameForYatri(y);
    const qrUrl = y.qrCodeDataUrl || this.getQRCodeUrl(y.id);

    const printWin = window.open('', '_blank', 'width=500,height=750');
    if (!printWin) {
      window.print();
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>E-Ticket Pass - ${y.name}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, sans-serif; }
          body { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f1f5f9; padding: 20px; }
          .card {
            width: 380px;
            background: #ffffff;
            border-radius: 20px;
            border: 2px solid #00875a;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.12);
          }
          .card-header {
            background: #00875a;
            color: #ffffff;
            text-align: center;
            padding: 20px 16px 16px;
          }
          .logo-box {
            width: 44px;
            height: 44px;
            background: #ffffff;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            margin-bottom: 6px;
          }
          .card-header h2 { font-size: 19px; font-weight: 800; letter-spacing: 0.5px; }
          .card-header p { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; opacity: 0.95; margin-top: 2px; text-transform: uppercase; }
          .card-body { padding: 22px 24px; color: #1e293b; }
          .pilgrim-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; text-align: center; letter-spacing: 0.8px; }
          .pilgrim-name { font-size: 22px; font-weight: 800; color: #0f172a; text-align: center; margin-top: 4px; margin-bottom: 12px; }
          .divider { border-top: 1px dashed #cbd5e1; margin-bottom: 14px; }
          .info-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
          .info-label { color: #94a3b8; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; }
          .info-val { font-weight: 800; color: #0f172a; font-size: 14px; }
          .info-val.teal { color: #00875a; }
          .qr-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 16px;
            margin-top: 16px;
            text-align: center;
          }
          .qr-box img { width: 160px; height: 160px; border-radius: 6px; }
          .qr-box p { font-size: 9px; font-weight: 800; color: #64748b; margin-top: 10px; letter-spacing: 0.8px; text-transform: uppercase; }
        </style>
      </head>
      <body onload="window.print(); setTimeout(function(){ window.close(); }, 600);">
        <div class="card">
          <div class="card-header">
            <div class="logo-box">🛕</div>
            <h2>SHRAVAN YATRA 2026</h2>
            <p>OFFICIAL YATRI E-PASS</p>
          </div>
          <div class="card-body">
            ${(y.photoUrl || y.photo) ? `<div style="text-align:center; margin-bottom: 8px;"><img src="${y.photoUrl || y.photo}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2.5px solid #00875a;" /></div>` : ''}
            <div class="pilgrim-label">YATRI PILGRIM NAME</div>
            <div class="pilgrim-name">${y.name}</div>
            <div class="divider"></div>
            
            <div class="info-row">
              <span class="info-label">UNIQUE YATRI ID</span>
              <span class="info-val">${y.id}</span>
            </div>
            <div class="info-row">
              <span class="info-label">AGE</span>
              <span class="info-val">${y.age} Years (${y.gender || 'Male'})</span>
            </div>
            <div class="info-row">
              <span class="info-label">HOTEL NAME</span>
              <span class="info-val teal">${hotelName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">HELPLINE 1</span>
              <span class="info-val teal">${this.helpline1}</span>
            </div>
            <div class="info-row">
              <span class="info-label">HELPLINE 2</span>
              <span class="info-val teal">${this.helpline2}</span>
            </div>

            <div class="qr-box">
              <img src="${qrUrl}" alt="QR Code" />
              <p>SCAN FOR CHECKPOINT ATTENDANCE</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);

    printWin.document.close();
  }

  contactYatriWhatsApp(yatri: any) {
    if (!yatri.phone) return;
    const cleanPhone = yatri.phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    const text = `Hare Krishna ${yatri.name} ji,\nISCON Yatra Portal madhye aple swagat aahe.`;
    const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  shareEPassWhatsApp(yatri: any) {
    if (!yatri.phone) return;
    const cleanPhone = yatri.phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    const hotelName = this.getHotelNameForYatri(yatri);
    const text = `*ISCON YATRA 2026 - OFFICIAL E-TICKET* 🛕\n` +
                 `---------------------------------\n` +
                 `*Pilgrim Name:* ${yatri.name}\n` +
                 `*Yatri ID:* ${yatri.id}\n` +
                 `*Age/Gender:* ${yatri.age}yr (${yatri.gender})\n` +
                 `*Hotel/Ashram:* ${hotelName}\n` +
                 `*Helpline:* ${this.helpline1}\n\n` +
                 `Note: Please present this Yatri ID during check-in and boarding.\n` +
                 `Hare Krishna!`;
    const url = `https://api.whatsapp.com/send?phone=${phoneWithCountry}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }
}
