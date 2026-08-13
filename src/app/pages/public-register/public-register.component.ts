import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-public-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './public-register.component.html'
})
export class PublicRegisterComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);

  private baseUrl = 'http://103.102.144.180:8081/api';

  loading = true;
  submitting = false;
  submittedSuccess = false;
  successYatriDetails: any = null;

  packages: any[] = [];
  selectedPackageId: any = null;
  selectedPackageDetails: any = null;

  isconMembers: any[] = [];
  isconMemberSearchQuery = '';
  showIsconMemberDropdown = false;
  selectedIsconMemberId = '';

  referredBySearchQuery = '';
  showReferredByDropdown = false;

  subMembers: any[] = [];

  form: any = {
    packageId: null,
    name: '',
    initiatedName: '',
    age: 30,
    gender: 'Male',
    phone: '',
    bookingType: 'Online Individual',
    idType: 'Aadhaar Card',
    idNumber: '',
    address: '',
    emergencyContact: { name: '', phone: '', relation: 'Family' },
    paymentStatus: 'Pending',
    amountPaid: 0,
    totalAmount: 0,
    referredByIsconMemberId: null,
    referredByName: '',
    paymentMode: 'UPI / GPay / PhonePe',
    transactionRef: ''
  };

  alertMessage = '';
  showAlert = false;

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['packageId']) {
        this.selectedPackageId = Number(params['packageId']);
        this.form.packageId = this.selectedPackageId;
      }
      this.loadInitialData();
    });
  }

  loadInitialData() {
    this.loading = true;
    this.http.get<any[]>(`${this.baseUrl}/Packages`).subscribe({
      next: (pkgs) => {
        this.packages = pkgs || [];
        if (!this.selectedPackageId && this.packages.length > 0) {
          this.selectedPackageId = this.packages[0].id;
          this.form.packageId = this.selectedPackageId;
        }
        this.updatePackageCost();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });

    // Load master members for auto-fill and reference
    this.http.get<any[]>(`${this.baseUrl}/IsconMembers`).subscribe({
      next: (m) => {
        this.isconMembers = m || [];
      },
      error: () => {}
    });
  }

  onPackageChange() {
    this.updatePackageCost();
  }

  updatePackageCost() {
    if (!this.form.packageId) return;
    const pkg = this.packages.find(p => String(p.id) === String(this.form.packageId));
    if (pkg) {
      this.selectedPackageDetails = pkg;
      this.form.totalAmount = pkg.costPerPerson || pkg.cost || 0;
    }
  }

  get filteredIsconMembers(): any[] {
    if (!this.isconMembers || this.isconMembers.length === 0) return [];
    if (!this.isconMemberSearchQuery || !this.isconMemberSearchQuery.trim()) {
      return this.isconMembers.slice(0, 30);
    }
    const q = this.isconMemberSearchQuery.toLowerCase().trim();
    return this.isconMembers.filter(m =>
      (m.name && m.name.toLowerCase().includes(q)) ||
      (m.legalName && m.legalName.toLowerCase().includes(q)) ||
      (m.initiatedName && m.initiatedName.toLowerCase().includes(q)) ||
      (m.did && String(m.did).toLowerCase().includes(q)) ||
      (m.mobiles && m.mobiles.includes(q)) ||
      (m.city && m.city.toLowerCase().includes(q))
    ).slice(0, 50);
  }

  selectIsconMember(m: any) {
    if (!m) {
      this.clearIsconMember();
      return;
    }
    this.selectedIsconMemberId = String(m.id);
    this.isconMemberSearchQuery = `${m.did ? 'DID:' + m.did + ' - ' : ''}${m.name} (${m.mobiles || ''})`;
    this.showIsconMemberDropdown = false;

    this.form.isconMemberId = m.id;
    this.form.permanentId = m.did ? `DID-${m.did}` : '';
    this.form.name = m.name || m.legalName || '';
    this.form.initiatedName = m.initiatedName || '';
    this.form.phone = m.mobiles || '';
    this.form.address = m.address || '';
    if (m.gender) {
      const g = m.gender.toLowerCase();
      this.form.gender = g.includes('female') || g.includes('f') ? 'Female' : 'Male';
    }
  }

  clearIsconMember() {
    this.selectedIsconMemberId = '';
    this.isconMemberSearchQuery = '';
    this.showIsconMemberDropdown = false;
    this.form.isconMemberId = null;
    this.form.permanentId = '';
  }

  get filteredReferredByMembers(): any[] {
    if (!this.isconMembers || this.isconMembers.length === 0) return [];
    if (!this.referredBySearchQuery || !this.referredBySearchQuery.trim()) {
      return this.isconMembers.slice(0, 30);
    }
    const q = this.referredBySearchQuery.toLowerCase().trim();
    return this.isconMembers.filter(m =>
      (m.name && m.name.toLowerCase().includes(q)) ||
      (m.did && String(m.did).toLowerCase().includes(q)) ||
      (m.mobiles && m.mobiles.includes(q))
    ).slice(0, 50);
  }

  selectReferredBy(m: any) {
    if (!m) {
      this.clearReferredBy();
      return;
    }
    this.form.referredByIsconMemberId = m.id;
    this.form.referredByName = `${m.did ? 'DID:' + m.did + ' - ' : ''}${m.name}${m.mobiles ? ' (📞 ' + m.mobiles + ')' : ''}`;
    this.referredBySearchQuery = this.form.referredByName;
    this.showReferredByDropdown = false;
  }

  clearReferredBy() {
    this.form.referredByIsconMemberId = null;
    this.form.referredByName = '';
    this.referredBySearchQuery = '';
    this.showReferredByDropdown = false;
  }

  addSubMember() {
    this.form.bookingType = 'Online Family';
    this.subMembers.push({
      name: '',
      initiatedName: '',
      age: 25,
      gender: 'Male',
      amountPaid: 0,
      relationship: 'Relative'
    });
  }

  removeSubMember(idx: number) {
    this.subMembers.splice(idx, 1);
    if (this.subMembers.length === 0) {
      this.form.bookingType = 'Online Individual';
    }
  }

  submitRegistration() {
    if (!this.form.packageId) {
      this.showError('⚠️ कृपया यात्रा पॅकेज (Devotional Package) निवडा.');
      return;
    }
    if (!this.form.name || !this.form.name.trim()) {
      this.showError('⚠️ कृपया तुमचे संपूर्ण नाव प्रविष्ट करा.');
      return;
    }
    if (!this.form.phone || !this.form.phone.trim() || this.form.phone.length < 10) {
      this.showError('⚠️ कृपया १० अंकी मोबाईल नंबर प्रविष्ट करा.');
      return;
    }

    this.submitting = true;
    const payload = JSON.parse(JSON.stringify(this.form));
    
    // Set payment status
    if (payload.amountPaid >= payload.totalAmount && payload.totalAmount > 0) {
      payload.paymentStatus = 'Paid';
    } else if (payload.amountPaid > 0) {
      payload.paymentStatus = 'Partial';
    } else {
      payload.paymentStatus = 'Pending';
    }

    this.http.post<any>(`${this.baseUrl}/Yatris`, payload).subscribe({
      next: (res) => {
        // Register submembers if any
        if (this.subMembers.length > 0 && res && res.id) {
          this.registerSubMembers(res.id, payload);
        } else {
          this.submitting = false;
          this.successYatriDetails = res;
          this.submittedSuccess = true;
        }
      },
      error: (err) => {
        this.submitting = false;
        this.showError('❌ नोंदणी करताना त्रुटी आली. कृपया पुन्हा प्रयत्न करा.');
      }
    });
  }

  registerSubMembers(mainYatriId: number, mainPayload: any) {
    let completedCount = 0;
    this.subMembers.forEach(sub => {
      const subPayload = {
        id: 0,
        packageId: mainPayload.packageId,
        name: sub.name || 'Family Member',
        age: Number(sub.age) || 30,
        gender: sub.gender || 'Male',
        phone: mainPayload.phone,
        bookingType: 'Family',
        idType: 'Aadhaar Card',
        idNumber: 'Pending',
        address: mainPayload.address,
        emergencyContact: mainPayload.emergencyContact,
        paymentStatus: Number(sub.amountPaid || 0) >= Number(mainPayload.totalAmount) ? 'Paid' : (Number(sub.amountPaid || 0) > 0 ? 'Partial' : 'Pending'),
        amountPaid: Number(sub.amountPaid || 0),
        totalAmount: Number(mainPayload.totalAmount),
        relationship: sub.relationship || 'Relative',
        initiatedName: sub.initiatedName || '',
        referredByIsconMemberId: mainPayload.referredByIsconMemberId,
        referredByName: mainPayload.referredByName
      };
      this.http.post(`${this.baseUrl}/Yatris`, subPayload).subscribe({
        next: () => {
          completedCount++;
          if (completedCount === this.subMembers.length) {
            this.submitting = false;
            this.submittedSuccess = true;
          }
        },
        error: () => {
          completedCount++;
          if (completedCount === this.subMembers.length) {
            this.submitting = false;
            this.submittedSuccess = true;
          }
        }
      });
    });
  }

  showError(msg: string) {
    this.alertMessage = msg;
    this.showAlert = true;
    setTimeout(() => {
      this.showAlert = false;
    }, 4000);
  }

  resetForm() {
    this.submittedSuccess = false;
    this.successYatriDetails = null;
    this.subMembers = [];
    this.form = {
      packageId: this.selectedPackageId,
      name: '',
      initiatedName: '',
      age: 30,
      gender: 'Male',
      phone: '',
      bookingType: 'Individual',
      idType: 'Aadhaar Card',
      idNumber: '',
      address: '',
      emergencyContact: { name: '', phone: '', relation: 'Family' },
      paymentStatus: 'Pending',
      amountPaid: 0,
      totalAmount: this.selectedPackageDetails?.costPerPerson || 0,
      referredByIsconMemberId: null,
      referredByName: '',
      paymentMode: 'UPI / GPay / PhonePe',
      transactionRef: ''
    };
  }

  openWhatsAppSupport() {
    const text = encodeURIComponent(`Hare Krishna! I have registered for Yatra (Reference: REG-${this.successYatriDetails?.id || '2026'}). Name: ${this.form.name}, Phone: ${this.form.phone}. Please verify.`);
    window.open(`https://api.whatsapp.com/send?phone=919325519485&text=${text}`, '_blank');
  }
}
