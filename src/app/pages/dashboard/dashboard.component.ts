import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { PackageContextService } from '../../services/package-context.service';
import { LanguageService } from '../../services/language.service';
import { forkJoin, of, catchError } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  private packageContext = inject(PackageContextService);
  lang = inject(LanguageService);
  t(key: string): string { return this.lang.t(key); }

  // Statistics
  stats = {
    totalYatris: 0,
    totalPackages: 0,
    totalHotels: 0,
    totalVehicles: 0,
    totalIncome: 0,
    totalExpenses: 0,
    totalExpense: 0,
    netProfit: 0,
    activeAnnouncements: 0,
    activeIncidents: 0,
    totalPaidAmount: 0,
    totalOccupiedBeds: 0
  };

  recentAnnouncements: any[] = [];
  recentIncidents: any[] = [];
  recentPayments: any[] = [];
  loading = true;

  selectedPackageId = '';
  allData: any = null;

  expenseChartData: any[] = [];
  totalExpenseAmount = 0;

  ngOnInit() {
    this.packageContext.selectedPackageId$.subscribe(id => {
      this.selectedPackageId = id;
      if (this.allData) {
        this.updateStats();
      }
    });
    this.loadDashboardData();
  }

  loadDashboardData() {
    this.loading = true;
    forkJoin({
      yatris: this.api.getAll<any>('Yatris').pipe(catchError(() => of([]))),
      packages: this.api.getAll<any>('Packages').pipe(catchError(() => of([]))),
      hotels: this.api.getAll<any>('Hotels').pipe(catchError(() => of([]))),
      vehicles: this.api.getAll<any>('Vehicles').pipe(catchError(() => of([]))),
      incomes: this.api.getAll<any>('Incomes').pipe(catchError(() => of([]))),
      expenses: this.api.getAll<any>('Expenses').pipe(catchError(() => of([]))),
      announcements: this.api.getAll<any>('Announcements').pipe(catchError(() => of([]))),
      incidents: this.api.getAll<any>('MedicalIncidents').pipe(catchError(() => of([]))),
      payments: this.api.getAll<any>('YatriPayments').pipe(catchError(() => of([]))),
      yatriBeds: this.api.getAll<any>('YatriBeds').pipe(catchError(() => of([]))),
      allocations: this.api.getAll<any>('RoomAllocations').pipe(catchError(() => of([]))),
      rooms: this.api.getAll<any>('Rooms').pipe(catchError(() => of([]))),
      seats: this.api.getAll<any>('YatriSeats').pipe(catchError(() => of([]))),
      trips: this.api.getAll<any>('VehicleTrips').pipe(catchError(() => of([])))
    }).subscribe({
      next: (res) => {
        this.allData = res;
        this.updateStats();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading dashboard data', err);
        this.loading = false;
      }
    });
  }

  updateStats() {
    if (!this.allData) return;

    const res = this.allData;
    const yatris = res.yatris || [];
    const packages = res.packages || [];
    const hotels = res.hotels || [];
    const vehicles = res.vehicles || [];
    const incomes = res.incomes || [];
    const expenses = res.expenses || [];
    const announcements = res.announcements || [];
    const incidents = res.incidents || [];
    const payments = res.payments || [];
    const yatriBeds = res.yatriBeds || [];
    const allocations = res.allocations || [];
    const rooms = res.rooms || [];
    const seats = res.seats || [];
    const trips = res.trips || [];

    const selectedPackageId = this.selectedPackageId;

    if (!selectedPackageId) {
      // Counts
      this.stats.totalYatris = yatris.length;
      this.stats.totalPackages = packages.length;
      this.stats.totalHotels = hotels.length;
      this.stats.totalVehicles = vehicles.length;

      // Financials
      this.stats.totalIncome = incomes.reduce((acc: number, curr: any) => acc + (curr.amount || 0), 0);
      this.stats.totalExpense = expenses.reduce((acc: number, curr: any) => acc + (curr.amount || 0), 0);
      this.stats.totalExpenses = this.stats.totalExpense;
      this.stats.netProfit = this.stats.totalIncome - this.stats.totalExpense;

      // Recent items
      this.recentAnnouncements = announcements.slice(0, 3);
      this.recentIncidents = incidents.slice(0, 3);
      this.recentPayments = payments.slice(0, 3);
    } else {
      // Filter data by selectedPackageId
      const packageYatris = yatris.filter((y: any) => String(y.packageId) === String(selectedPackageId));
      const yatriIds = packageYatris.map((y: any) => y.id);
      const yatriNames = packageYatris.map((y: any) => (y.name || '').toLowerCase());

      this.stats.totalYatris = packageYatris.length;
      this.stats.totalPackages = packages.length;

      // Calculate hotels for this package's yatris
      const roomAllocIds = yatriBeds.filter((yb: any) => yatriIds.includes(yb.yatriId)).map((yb: any) => yb.roomAllocationId);
      const roomIds = allocations.filter((a: any) => roomAllocIds.includes(a.id)).map((a: any) => a.roomId);
      const hotelIds = rooms.filter((r: any) => roomIds.includes(r.id)).map((r: any) => r.hotelId);
      this.stats.totalHotels = hotels.filter((h: any) => hotelIds.includes(h.id)).length;

      // Calculate vehicles for this package's yatris
      const tripIds = seats.filter((s: any) => yatriIds.includes(s.yatriId)).map((s: any) => s.vehicleTripId);
      const vehicleIds = trips.filter((t: any) => tripIds.includes(t.id)).map((t: any) => t.vehicleId);
      this.stats.totalVehicles = vehicles.filter((v: any) => vehicleIds.includes(v.id)).length;

      // Financials
      this.stats.totalIncome = incomes.filter((i: any) => yatriIds.includes(i.yatriId)).reduce((acc: number, curr: any) => acc + (curr.amount || 0), 0);
      this.stats.totalExpense = expenses.filter((e: any) => String(e.packageId) === String(selectedPackageId)).reduce((acc: number, curr: any) => acc + (curr.amount || 0), 0);
      this.stats.totalExpenses = this.stats.totalExpense;
      this.stats.netProfit = this.stats.totalIncome - this.stats.totalExpense;

      // Recent items
      this.recentAnnouncements = announcements.filter((ann: any) => String(ann.packageId) === String(selectedPackageId)).slice(0, 3);
      this.recentIncidents = incidents.filter((med: any) => yatriIds.includes(med.yatriId) || yatriNames.includes((med.yatriName || '').toLowerCase())).slice(0, 3);
      this.recentPayments = payments.filter((p: any) => yatriIds.includes(p.yatriId)).slice(0, 3);
    }

    this.calculateExpenseCharts(selectedPackageId);
  }

  private calculateExpenseCharts(selectedPackageId: string) {
    if (!this.allData) return;
    const res = this.allData;

    const pkgExpenses = selectedPackageId 
      ? res.expenses.filter((e: any) => String(e.packageId) === String(selectedPackageId))
      : res.expenses;

    const grouped: { [key: string]: number } = {};
    let totalExp = 0;
    pkgExpenses.forEach((e: any) => {
      const amt = Number(e.amount) || 0;
      const cat = e.department || e.category || 'General';
      grouped[cat] = (grouped[cat] || 0) + amt;
      totalExp += amt;
    });

    this.totalExpenseAmount = totalExp;

    const colors: { [key: string]: string } = {
      'Food': '#f97316',        // Orange
      'Transport': '#06b6d4',   // Cyan
      'Accommodation': '#3b82f6',// Blue
      'Medical': '#ef4444',     // Red
      'Volunteer': '#8b5cf6',   // Purple
      'General': '#6b7280',     // Gray
      'Religious': '#eab308'    // Yellow
    };

    let cumulativePercent = 0;
    this.expenseChartData = Object.keys(grouped).map(cat => {
      const amt = grouped[cat];
      const pct = totalExp > 0 ? (amt / totalExp) * 100 : 0;
      const color = colors[cat] || colors['General'];
      const strokeDasharray = `${(pct * 251.2 / 100).toFixed(1)} 251.2`;
      const strokeDashoffset = `${(-cumulativePercent * 251.2 / 100).toFixed(1)}`;
      cumulativePercent += pct;
      return {
        category: cat,
        amount: amt,
        percentage: pct,
        color,
        strokeDasharray,
        strokeDashoffset
      };
    });
  }

  get highRiskYatris(): any[] {
    if (!this.allData) return [];
    return this.allData.yatris.filter((y: any) => {
      const matchesPackage = !this.selectedPackageId || y.packageId === this.selectedPackageId;
      if (!matchesPackage) return false;
      
      const riskHigh = y.riskLevel === 'High' || y.riskLevel === 'Medium';
      const hasMed = y.medicalConditions && y.medicalConditions.length > 0 && JSON.stringify(y.medicalConditions) !== '[]' && JSON.stringify(y.medicalConditions) !== '{}';
      return riskHigh || hasMed;
    }).slice(0, 5); // Limit to top 5 for dashboard
  }

  getEmergencyContactName(y: any): string {
    if (!y.emergencyContact) return '-';
    if (typeof y.emergencyContact === 'string') {
      try {
        const parsed = JSON.parse(y.emergencyContact);
        return parsed.name || parsed.Name || y.emergencyContact;
      } catch {
        return y.emergencyContact;
      }
    }
    return y.emergencyContact.name || y.emergencyContact.Name || '-';
  }

  getEmergencyContactPhone(y: any): string {
    if (!y.emergencyContact) return '-';
    if (typeof y.emergencyContact === 'string') {
      try {
        const parsed = JSON.parse(y.emergencyContact);
        return parsed.phone || parsed.Phone || '-';
      } catch {
        return '-';
      }
    }
    return y.emergencyContact.phone || y.emergencyContact.Phone || '-';
  }

  getMedicalConditionsList(y: any): string[] {
    if (!y.medicalConditions) return [];
    if (Array.isArray(y.medicalConditions)) return y.medicalConditions;
    if (typeof y.medicalConditions === 'string') {
      try {
        const parsed = JSON.parse(y.medicalConditions);
        if (Array.isArray(parsed)) return parsed;
        return [y.medicalConditions];
      } catch {
        if (y.medicalConditions.startsWith('{') && y.medicalConditions.endsWith('}')) {
          return y.medicalConditions.substring(1, y.medicalConditions.length - 1).split(',').filter(Boolean);
        }
        return [y.medicalConditions];
      }
    }
    return [];
  }

  dialNumber(phone: string) {
    if (!phone || phone === '-') return;
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    window.open(`tel:${cleanPhone}`, '_self');
  }

  sendEmergencyWhatsApp(yatri: any) {
    const phone = this.getEmergencyContactPhone(yatri);
    if (!phone || phone === '-') {
      alert('Emergency contact phone not available.');
      return;
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    const text = `*ISCON YATRA EMERGENCY ALERT* 🚨\n` +
                 `---------------------------------\n` +
                 `Dear Guardian, this is an update regarding pilgrim *${yatri.name}* (Yatri ID: ${yatri.id}).\n` +
                 `Please contact the Yatra coordinator immediately at ${localStorage.getItem('yatra_helpline1') || '+91 90040 10808'}.\n\n` +
                 `Hare Krishna.`;
    window.open(`https://api.whatsapp.com/send?phone=${phoneWithCountry}&text=${encodeURIComponent(text)}`, '_blank');
  }

  // --- QR Scanner State ---
  showScanner = false;
  scannerError = '';
  scannerSuccessMessage = '';
  scannedYatri: any = null;
  private videoStream: MediaStream | null = null;
  private animationFrameId: number | null = null;

  // --- Broadcast Center State ---
  showBroadcast = false;
  broadcastTemplate = 'Hare Krishna {name}! Welcome to ISCON Shravan Yatra. Your Room is: {room} and Transit Vehicle: {bus}. Helpline: {helpline}.';
  broadcastTarget: 'all' | 'highrisk' = 'all';

  // --- Helpers to resolve Yatri Room and Bus ---
  getYatriRoomInfo(yatriId: string): string {
    if (!this.allData) return 'Not Assigned';
    const beds = this.allData.yatriBeds || [];
    const bed = beds.find((b: any) => b.yatriId === yatriId);
    if (!bed) return 'Not Assigned';
    const allocs = this.allData.allocations || [];
    const alloc = allocs.find((a: any) => a.id === bed.roomAllocationId);
    if (!alloc) return 'Not Assigned';
    const rooms = this.allData.rooms || [];
    const room = rooms.find((r: any) => r.id === alloc.roomId);
    if (!room) return 'Not Assigned';
    const hotels = this.allData.hotels || [];
    const hotel = hotels.find((h: any) => h.id === room.hotelId);
    const hotelPrefix = hotel ? hotel.name + ' · ' : '';
    return `${hotelPrefix}Room ${room.roomNumber}`;
  }

  getYatriBusInfo(yatriId: string): string {
    if (!this.allData) return 'Not Assigned';
    const seats = this.allData.seats || [];
    const seat = seats.find((s: any) => s.yatriId === yatriId);
    if (!seat) return 'Not Assigned';
    const trips = this.allData.trips || [];
    const trip = trips.find((t: any) => t.id === seat.vehicleTripId);
    if (!trip) return 'Not Assigned';
    const vehicles = this.allData.vehicles || [];
    const vehicle = vehicles.find((v: any) => v.id === trip.vehicleId);
    return vehicle ? `${vehicle.name} (${vehicle.numberPlate})` : `Trip ${trip.route}`;
  }

  // --- Camera QR Scanner Implementation ---
  startQRScanner() {
    this.showScanner = true;
    this.scannerError = '';
    this.scannerSuccessMessage = '';
    this.scannedYatri = null;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.scannerError = 'कॅमेरा ॲक्सेस उपलब्ध नाही. कृपया HTTPS किंवा Localhost वापरा. (Camera access not available. Use HTTPS or localhost.)';
      return;
    }

    setTimeout(() => {
      const video = document.getElementById('scanner-video') as HTMLVideoElement;
      if (!video) return;

      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
          this.videoStream = stream;
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          video.play();
          this.animationFrameId = requestAnimationFrame(() => this.scanTick());
        })
        .catch(err => {
          console.error('Camera access error', err);
          this.scannerError = 'कॅमेरा ॲक्सेस करता आला नाही! (Cannot access camera!)';
        });
    }, 300);
  }

  stopQRScanner() {
    this.showScanner = false;
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private scanTick() {
    const video = document.getElementById('scanner-video') as HTMLVideoElement;
    if (!video || video.readyState !== video.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
      this.animationFrameId = requestAnimationFrame(() => this.scanTick());
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const jsQR = (window as any).jsQR;
      if (jsQR) {
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          this.handleScannedData(code.data);
          return; // Stop scanning after match
        }
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.scanTick());
  }

  private handleScannedData(data: string) {
    // Play success beep using native Web Audio API
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}

    // Find pilgrim in local cached list
    const yatri = this.allData?.yatris.find((y: any) => y.id === data);
    if (!yatri) {
      this.scannerError = `यात्री सापडला नाही! ID: ${data} (Pilgrim not found!)`;
      // Resume scanning after 2 seconds
      setTimeout(() => {
        this.scannerError = '';
        if (this.showScanner) {
          this.animationFrameId = requestAnimationFrame(() => this.scanTick());
        }
      }, 2000);
      return;
    }

    this.scannedYatri = yatri;
    this.scannerSuccessMessage = `यशस्वी स्कॅन: ${yatri.name}`;

    // Post check-in record to the database
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const timeStr = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const attendanceRecord = {
      yatriId: yatri.id,
      checkpointId: 'Main Gateway',
      status: 'Checked-In',
      time: timeStr,
      date: dateStr
    };

    this.api.create('YatriAttendances', attendanceRecord).subscribe({
      next: () => {
        console.log('Attendance logged successfully');
      },
      error: (err) => console.error('Error logging attendance record', err)
    });

    // Close scanner after 3 seconds showing success
    setTimeout(() => {
      this.stopQRScanner();
    }, 3000);
  }

  // --- Broadcast Center Methods ---
  getBroadcastList(): any[] {
    if (!this.allData) return [];
    if (this.broadcastTarget === 'highrisk') {
      return this.allData.yatris.filter((y: any) => y.riskLevel === 'High' || y.riskLevel === 'Medium');
    }
    return this.allData.yatris;
  }

  generateBroadcastMessage(yatri: any): string {
    const room = this.getYatriRoomInfo(yatri.id);
    const bus = this.getYatriBusInfo(yatri.id);
    const helpline = localStorage.getItem('yatra_helpline1') || '+91 90040 10808';

    return this.broadcastTemplate
      .replace(/{name}/g, yatri.name)
      .replace(/{room}/g, room)
      .replace(/{bus}/g, bus)
      .replace(/{helpline}/g, helpline);
  }

  sendWhatsAppBroadcast(yatri: any) {
    if (!yatri.phone) return;
    const msg = this.generateBroadcastMessage(yatri);
    const cleanPhone = yatri.phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    const url = `https://api.whatsapp.com/send?phone=${phoneWithCountry}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  speakAnnouncementText(text: string) {
    if (!text) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {}

    if (!('speechSynthesis' in window)) {
      alert('तुमच्या ब्राऊझरमध्ये व्हॉईस रीडआउट उपलब्ध नाही.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const currentLang = this.lang?.current || 'english';
    if (currentLang === 'marathi') {
      utterance.lang = 'mr-IN';
    } else if (currentLang === 'hindi') {
      utterance.lang = 'hi-IN';
    } else if (currentLang === 'kannada') {
      utterance.lang = 'kn-IN';
    } else {
      utterance.lang = 'en-US';
    }
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  }
}
