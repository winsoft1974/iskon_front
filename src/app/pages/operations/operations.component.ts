import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { PackageContextService } from '../../services/package-context.service';
import { LanguageService } from '../../services/language.service';
import { AuthService } from '../../services/auth.service';
import { forkJoin, of, catchError, Observable } from 'rxjs';
import * as XLSX from 'xlsx';
import { AnnouncementsTabComponent } from './components/announcements-tab/announcements-tab.component';
import { VolunteersTabComponent } from './components/volunteers-tab/volunteers-tab.component';
import { FinanceLedgerTabComponent } from './components/finance-ledger-tab/finance-ledger-tab.component';
import { CheckinScannerTabComponent } from './components/checkin-scanner-tab/checkin-scanner-tab.component';
import { PrasadamTrackerTabComponent } from './components/prasadam-tracker-tab/prasadam-tracker-tab.component';
import { MedicalIncidentsTabComponent } from './components/medical-incidents-tab/medical-incidents-tab.component';
import { LostFoundTabComponent } from './components/lost-found-tab/lost-found-tab.component';
import { PermissionsMatrixTabComponent } from './components/permissions-matrix-tab/permissions-matrix-tab.component';

declare var jsQR: any;

@Component({
  selector: 'app-operations',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AnnouncementsTabComponent,
    VolunteersTabComponent,
    FinanceLedgerTabComponent,
    CheckinScannerTabComponent,
    PrasadamTrackerTabComponent,
    MedicalIncidentsTabComponent,
    LostFoundTabComponent,
    PermissionsMatrixTabComponent
  ],
  templateUrl: './operations.component.html'
})
export class OperationsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private packageContext = inject(PackageContextService);
  auth = inject(AuthService);
  lang = inject(LanguageService);
  t(key: string): string { return this.lang.t(key); }

  // Role-based access helpers
  get canViewFinance(): boolean  { return this.auth.canViewFinance(); }
  get canEditExpense(): boolean   { return this.auth.canEditExpense(); }
  get isKasAuthority(): boolean   { return this.auth.isKasAuthority(); }
  get isVolunteer(): boolean      { return this.auth.isVolunteer(); }
  get userDepartment(): string    { return this.auth.getDepartment(); }

  get isPackageCompleted(): boolean {
    return this.packageContext.isCurrentPackageCompleted();
  }

  get isEntryLocked(): boolean {
    return this.packageContext.isEntryLocked();
  }

  // Department-filtered expenses for logged-in volunteer / incharge
  get displayExpenses(): any[] {
    if (this.isKasAuthority) return this.expenses;
    const dept = this.userDepartment.toLowerCase();
    return (this.expenses || []).filter(e => (e.department || 'general').toLowerCase() === dept);
  }

  hasPermission(department: string, action: 'view' | 'addExpense' | 'manage' = 'view'): boolean {

    return this.auth.hasPermission(department, action);
  }

  // ── Role Permissions Matrix State & Logic ──
  permissionMatrix: any[] = [];
  permissionSaving = false;
  permissionSuccessMsg = '';
  readonly permRoles = ['ServiceIncharge', 'Volunteer'];
  readonly permDepartments = ['Food', 'Transport', 'Accommodation', 'Medical', 'Religious', 'General'];

  loadPermissionMatrix() {
    this.memberAccessTab = 'roleMatrix';
    this.auth.getPermissionsList().subscribe({
      next: (res) => {
        this.permissionMatrix = res || [];
        this.ensureFullPermissionMatrix();
      },
      error: () => {}
    });
  }

  ensureFullPermissionMatrix() {
    for (const r of this.permRoles) {
      for (const d of this.permDepartments) {
        const exists = this.permissionMatrix.find(p => p.role === r && p.department === d);
        if (!exists) {
          this.permissionMatrix.push({
            role: r,
            department: d,
            canView: true,
            canAddExpense: true,
            canManage: r === 'ServiceIncharge'
          });
        }
      }
    }
  }

  getPermCell(role: string, dept: string): any {
    let cell = this.permissionMatrix.find(p => p.role === role && p.department === dept);
    if (!cell) {
      cell = { role, department: dept, canView: true, canAddExpense: true, canManage: role === 'ServiceIncharge' };
      this.permissionMatrix.push(cell);
    }
    return cell;
  }

  togglePerm(role: string, dept: string, field: 'canView' | 'canAddExpense' | 'canManage') {
    const cell = this.getPermCell(role, dept);
    cell[field] = !cell[field];
  }

  savePermissionMatrix() {
    this.permissionSaving = true;
    this.permissionSuccessMsg = '';
    this.auth.updatePermissionsList(this.permissionMatrix).subscribe({
      next: () => {
        this.permissionSaving = false;
        this.permissionSuccessMsg = '✅ Role permissions saved successfully!';
        this.auth.loadPermissions();
        setTimeout(() => this.permissionSuccessMsg = '', 4000);
      },
      error: () => {
        this.permissionSaving = false;
      }
    });
  }

  // ── Member-Wise (Person-Wise) Access Matrix State & Logic ──
  systemUsers: any[] = [];
  systemUsersLoading = false;
  memberAccessSearch = '';
  memberAccessTab: 'memberMatrix' | 'roleMatrix' = 'roleMatrix';

  loadSystemUsers() {
    if (!this.isKasAuthority) return;
    this.systemUsersLoading = true;
    
    forkJoin({
      users: this.auth.getUsers().pipe(catchError(() => of([]))),
      vols: this.api.getAll<any>('Volunteers').pipe(catchError(() => of([])))
    }).subscribe({
      next: (res) => {
        const usersList: any[] = res.users || [];
        const volsList: any[] = res.vols || [];
        const combined: any[] = [];
        const processedUserIds = new Set<number>();
        const processedVolIds = new Set<number>();

        // 1. Users with matching volunteer
        usersList.forEach(u => {
          processedUserIds.add(u.id);
          const matchedVol = volsList.find(v => (u.yatriId && v.yatriId === u.yatriId) || 
            (v.name && u.fullName && v.name.toLowerCase().trim() === u.fullName.toLowerCase().trim()));
          
          if (matchedVol) {
            processedVolIds.add(matchedVol.id);
          }

          combined.push({
            id: u.id,
            volunteerId: matchedVol ? matchedVol.id : null,
            rawVolunteer: matchedVol || null,
            username: u.username,
            fullName: u.fullName || u.username,
            phone: matchedVol?.phone || '',
            role: u.role || 'Volunteer',
            department: u.department || matchedVol?.assignedDepartment || 'General',
            hasUserAccount: true,
            isSaving: false
          });
        });

        // 2. Volunteers who don't have a user account yet
        volsList.forEach(v => {
          if (!processedVolIds.has(v.id)) {
            combined.push({
              id: null,
              volunteerId: v.id,
              rawVolunteer: v,
              username: (v.name || 'vol').toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + v.id,
              fullName: v.name,
              phone: v.phone || '',
              role: 'Volunteer',
              department: v.assignedDepartment || 'General',
              hasUserAccount: false,
              isSaving: false
            });
          }
        });

        this.systemUsers = combined;
        this.systemUsersLoading = false;
      },
      error: () => {
        this.systemUsersLoading = false;
      }
    });
  }

  updateMemberAccess(user: any) {
    user.isSaving = true;
    const tasks: Observable<any>[] = [];

    if (user.id) {
      tasks.push(this.auth.updateUser(user.id, {
        role: user.role,
        department: user.department,
        fullName: user.fullName,
        isActive: true
      }));
    }

    if (user.volunteerId && user.rawVolunteer) {
      const updatedVol = {
        ...user.rawVolunteer,
        assignedDepartment: user.department
      };
      tasks.push(this.api.update('Volunteers', user.volunteerId, updatedVol));
    }

    if (tasks.length === 0) {
      user.isSaving = false;
      return;
    }

    forkJoin(tasks).subscribe({
      next: () => {
        user.isSaving = false;
        this.showValidation(`✅ ${user.fullName} साठी विभाग '${user.department}' व भूमिका '${user.role}' सेव्ह केली!`);
        this.loadData();
        this.loadSystemUsers();
      },
      error: () => {
        user.isSaving = false;
        this.showValidation('❌ सदस्य हक्क अपडेट करताना त्रुटी आली.');
      }
    });
  }

  createLoginAccountForVol(user: any) {
    const cleanName = (user.fullName || 'vol').toLowerCase().replace(/[^a-z0-9]/g, '');
    const defaultUsername = `${cleanName}_${(user.department || 'vol').toLowerCase()}`;
    const defaultPassword = 'pass123';

    this.auth.register(
      defaultUsername,
      defaultPassword,
      user.role || 'Volunteer',
      user.department || 'General',
      user.rawVolunteer?.yatriId,
      user.fullName
    ).subscribe({
      next: () => {
        this.showValidation(`✅ ${user.fullName} साठी लॉगिन खाते तयार झाले! Username: ${defaultUsername}, Password: ${defaultPassword}`);
        this.loadSystemUsers();
      },
      error: (err: any) => {
        if (err.status === 409) {
          this.showValidation(`⚠️ Username '${defaultUsername}' आधीपासून अस्तित्वात आहे.`);
        } else {
          this.showValidation('❌ लॉगिन खाते तयार करताना त्रुटी आली.');
        }
      }
    });
  }

  // ── Member Dropdown Checkbox Permission Matrix State & Methods ──
  selectedMemberUsername = '';
  selectedMember: any = null;
  memberPermissionMatrix: any[] = [];
  memberPermSaving = false;
  memberPermSuccessMsg = '';

  onMemberSelect() {
    if (!this.selectedMemberUsername) {
      this.selectedMember = null;
      this.memberPermissionMatrix = [];
      return;
    }

    const found = (this.systemUsers || []).find((u: any) => u.username === this.selectedMemberUsername);
    this.selectedMember = found || null;

    if (this.selectedMember) {
      this.auth.getUserPermissions(this.selectedMember.username).subscribe({
        next: (res) => {
          this.memberPermissionMatrix = res || [];
          this.ensureFullMemberPermissionMatrix();
        },
        error: () => {
          this.memberPermissionMatrix = [];
          this.ensureFullMemberPermissionMatrix();
        }
      });
    }
  }

  ensureFullMemberPermissionMatrix() {
    for (const d of this.permDepartments) {
      const exists = this.memberPermissionMatrix.find((p: any) => (p.department || '').toLowerCase() === d.toLowerCase());
      if (!exists) {
        const isUserPrimaryDept = (this.selectedMember?.department || 'General').toLowerCase() === d.toLowerCase() ||
                                  (this.selectedMember?.department || '').toLowerCase() === 'general';
        this.memberPermissionMatrix.push({
          userId: this.selectedMember?.id || null,
          username: this.selectedMember?.username || '',
          department: d,
          canView: isUserPrimaryDept,
          canAddExpense: isUserPrimaryDept,
          canManage: this.selectedMember?.role === 'ServiceIncharge'
        });
      }
    }
  }

  getMemberPermCell(dept: string): any {
    let cell = this.memberPermissionMatrix.find((p: any) => (p.department || '').toLowerCase() === dept.toLowerCase());
    if (!cell) {
      cell = {
        userId: this.selectedMember?.id || null,
        username: this.selectedMember?.username || '',
        department: dept,
        canView: true,
        canAddExpense: true,
        canManage: false
      };
      this.memberPermissionMatrix.push(cell);
    }
    return cell;
  }

  toggleMemberPermCell(dept: string, field: 'canView' | 'canAddExpense' | 'canManage') {
    const cell = this.getMemberPermCell(dept);
    cell[field] = !cell[field];
  }

  saveMemberPermissions() {
    if (!this.selectedMember) return;
    this.memberPermSaving = true;
    this.memberPermSuccessMsg = '';

    const executeSave = (usernameToSave: string) => {
      this.auth.updateUserPermissions(usernameToSave, this.memberPermissionMatrix).subscribe({
        next: () => {
          this.memberPermSaving = false;
          this.memberPermSuccessMsg = `✅ ${this.selectedMember.fullName} साठी स्क्रीन हक्क (Permissions) यशस्वीरित्या सेव्ह केले!`;
          this.loadSystemUsers();
          setTimeout(() => this.memberPermSuccessMsg = '', 4000);
        },
        error: () => {
          this.memberPermSaving = false;
          this.showValidation('❌ सदस्य हक्क सेव्ह करताना त्रुटी आली.');
        }
      });
    };

    // 1. If volunteer has no user login account yet, create user account automatically first!
    if (!this.selectedMember.hasUserAccount && this.selectedMember.rawVolunteer) {
      const cleanName = (this.selectedMember.fullName || 'vol').toLowerCase().replace(/[^a-z0-9]/g, '');
      const genUsername = `${cleanName}_${(this.selectedMember.department || 'vol').toLowerCase()}`;
      const genPassword = 'pass123';

      this.auth.register(
        genUsername,
        genPassword,
        this.selectedMember.role || 'Volunteer',
        this.selectedMember.department || 'General',
        this.selectedMember.rawVolunteer?.yatriId,
        this.selectedMember.fullName
      ).subscribe({
        next: () => {
          this.selectedMember.username = genUsername;
          this.selectedMember.hasUserAccount = true;
          executeSave(genUsername);
        },
        error: () => {
          executeSave(this.selectedMember.username);
        }
      });
    } else {
      executeSave(this.selectedMember.username);
    }
  }

  get filteredSystemUsers(): any[] {
    if (!this.memberAccessSearch) return this.systemUsers;
    const q = this.memberAccessSearch.toLowerCase().trim();
    return (this.systemUsers || []).filter((u: any) =>
      (u.fullName || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q)
    );
  }

  activeTab = 'announcements';

  announcements: any[] = [];
  volunteers: any[] = [];
  incomes: any[] = [];
  expenses: any[] = [];
  incidents: any[] = [];
  lostItems: any[] = [];
  packages: any[] = [];
  yatris: any[] = [];
  yatriPayments: any[] = [];
  yatriAttendances: any[] = [];
  auditLogs: any[] = [];

  // ── Departments / Categories ──
  departments: any[] = [];
  showDeptManageModal = false;
  newDept: any = { name: '', description: '' };
  deptDeleteConfirm: any = null;
  deptSaving = false;
  deptError = '';

  // ── Promote Yatri to Volunteer / Incharge ──
  showPromoteModal = false;
  promoteForm = {
    yatriId: null as number | null,
    selectedYatri: null as any,
    role: 'Volunteer',
    department: 'Food',
    username: '',
    password: '',
    advanceAmount: 0,
    saving: false,
    error: ''
  };

  openPromoteModal() {
    this.promoteForm = {
      yatriId: null,
      selectedYatri: null,
      role: 'Volunteer',
      department: 'Food',
      username: '',
      password: '',
      advanceAmount: 0,
      saving: false,
      error: ''
    };
    this.showPromoteModal = true;
  }

  onPromoteYatriChange() {
    const yatri = this.yatris.find(y => y.id === Number(this.promoteForm.yatriId));
    if (yatri) {
      this.promoteForm.selectedYatri = yatri;
      const firstName = (yatri.name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
      const deptShort = (this.promoteForm.department || 'vol').toLowerCase();
      this.promoteForm.username = `${firstName}_${deptShort}`;
      if (!this.promoteForm.password) {
        this.promoteForm.password = 'pass123';
      }
    }
  }

  savePromoteYatri() {
    if (!this.promoteForm.yatriId || !this.promoteForm.selectedYatri) {
      this.promoteForm.error = 'Please select a Yatri from the list.';
      return;
    }
    if (!this.promoteForm.username.trim() || !this.promoteForm.password.trim()) {
      this.promoteForm.error = 'Username and password are required.';
      return;
    }

    this.promoteForm.saving = true;
    this.promoteForm.error = '';

    const y = this.promoteForm.selectedYatri;

    const volunteerDto = {
      name: y.name,
      phone: y.phone || '',
      assignedDepartment: this.promoteForm.department,
      shift: 'Full Day',
      dutyLocation: 'Yatra Site',
      status: 'On Duty',
      advanceAmount: this.promoteForm.advanceAmount || 0,
      yatriId: y.id,
      packageId: y.packageId || null
    };


    this.api.create('Volunteers', volunteerDto).subscribe({
      next: (createdVol: any) => {
        this.auth.register(
          this.promoteForm.username.trim(),
          this.promoteForm.password,
          this.promoteForm.role,
          this.promoteForm.department,
          y.id,
          y.name
        ).subscribe({
          next: () => {
            this.promoteForm.saving = false;
            this.showPromoteModal = false;
            this.loadData();
          },
          error: (err: any) => {
            this.promoteForm.saving = false;
            if (err.status === 409) {
              this.promoteForm.error = `Username '${this.promoteForm.username}' already exists.`;
            } else {
              this.promoteForm.error = 'Failed to create user login account.';
            }
          }
        });
      },
      error: (err: any) => {
        this.promoteForm.saving = false;
        this.promoteForm.error = 'Failed to create volunteer record.';
      }
    });
  }


  // ── QR Scanner Tab State ──
  scanCheckpointId = '🚌 Bus Boarding';
  scannedYatrisList: { yatriId: string; name: string; time: string; checkpoint: string; status: string }[] = [];
  selectedScanYatriId = '';
  scanSearchQuery = '';
  filteredYatrisForScan: any[] = [];
  scanningSuccessMessage = '';

  // Fixed checkpoints always shown in scanner
  readonly fixedCheckpoints = [
    { label: '🚌 Bus Boarding',        value: '🚌 Bus Boarding' },
    { label: '🏨 Hotel Check-In',      value: '🏨 Hotel Check-In' },
    { label: '🪔 Darshan Attendance',  value: 'Darshan Attendance' },
    { label: '🍳 Prasadam - Breakfast',value: 'Meal-Breakfast' },
    { label: '🍛 Prasadam - Lunch',    value: 'Meal-Lunch' },
    { label: '🥗 Prasadam - Dinner',   value: 'Meal-Dinner' }
  ];

  get checkpointOptions(): { label: string; value: string }[] {
    const opts = [...this.fixedCheckpoints];
    const fixedVals = new Set(this.fixedCheckpoints.map(c => c.value.toLowerCase()));
    for (const d of this.departments) {
      const name = (d.name || '').trim();
      if (name && !fixedVals.has(name.toLowerCase())) {
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

  isYatriCheckedInAtCheckpoint(yatriId: any, chkName?: string): boolean {
    const chk = chkName || this.scanCheckpointId;
    const numericChkId = this.getCheckpointNumericId(chk);
    return (this.yatriAttendances || []).some(a => 
      String(a.yatriId).toLowerCase() === String(yatriId).toLowerCase() && 
      Number(a.checkpointId) === numericChkId
    );
  }

  // ── Prasadam Tracker Tab State ──
  selectedPrasadamMeal = 'Breakfast';
  prasadamCheckpoints: { [mealName: string]: string } = {
    'Breakfast': 'Meal-Breakfast',
    'Lunch': 'Meal-Lunch',
    'Dinner': 'Meal-Dinner'
  };

  // ── Expense Delete ──
  showExpenseDeleteConfirm = false;
  expenseToDelete: any = null;

  // ── Volunteer Edit / Delete ──
  isEditVolunteer = false;
  showVolDeleteConfirm = false;
  volToDelete: any = null;

  selectedPackageId = '';
  loading = false;

  newAnnouncement: any = { id: null, title: '', content: '', priority: 'Normal', packageId: null };
  isEditAnnouncement = false;

  // ── Unified Finance Ledger ──
  showUnifiedFinanceModal = false;
  financeFilter: 'All' | 'Income' | 'Expense' | 'Transfer' = 'All';
  financeCategoryFilter: string = 'All';
  financeSearchQuery = '';
  unifiedFinance: any = {
    kind: 'Income', // 'Income' | 'Expense' | 'Transfer'
    party: '',
    category: 'Payment',
    amount: null,
    mode: 'UPI',
    date: new Date().toISOString().split('T')[0],
    description: '',
    department: 'Food',
    volunteerId: ''
  };

  // ── Volunteer Advance Transfer from Finance ──
  showGiveAdvanceModal = false;
  advanceForm: any = {
    volunteerId: '',
    amount: null,
    date: new Date().toISOString().split('T')[0],
    mode: 'Cash',
    remarks: ''
  };

  // ── Finance - Income ──
  showFinanceModal = false;
  newIncome: any = { id: '', receivedFrom: '', type: 'Donation', amount: 0, mode: 'UPI', date: new Date().toISOString().split('T')[0], description: '', yatriId: '' };
  yatriSearchForIncome = '';
  filteredYatrisForIncome: any[] = [];
  selectedYatriForIncome: any = null;
  showYatriIncomeDropdown = false;

  // ── Income Source Toggle ──
  incomeSourceType: 'yatri' | 'external' = 'external';
  externalDonor: any = { name: '', phone: '', address: '', city: '' };

  // ── Finance - Expense ──
  showExpenseModal = false;
  expenseItems: { item: string; unit: number; unitPrice: number }[] = [];
  newExpense: any = {
    id: '', paidTo: '', volunteerId: '', department: '', category: 'Food & Prasadam',
    amount: 0, mode: 'Cash', date: new Date().toISOString().split('T')[0], description: '', approvedBy: '', items: [], receiptUrl: ''
  };

  selectedReceiptImage: string | null = null;

  onReceiptFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          this.newExpense.receiptUrl = canvas.toDataURL('image/jpeg', 0.7);
        } else {
          this.newExpense.receiptUrl = e.target.result;
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  onUnifiedReceiptFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          this.unifiedFinance.receiptUrl = canvas.toDataURL('image/jpeg', 0.7);
        } else {
          this.unifiedFinance.receiptUrl = e.target.result;
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  openReceiptLightbox(url: string) {
    this.selectedReceiptImage = url;
  }

  closeReceiptLightbox() {
    this.selectedReceiptImage = null;
  }

  // Volunteer dropdown for expense modal
  expenseVolSearch = '';
  filteredExpenseVols: any[] = [];
  selectedExpenseVol: any = null;
  showExpenseVolDropdown = false;
  expenseDeptFilter = '';

  // Expanded volunteer row (for advance ledger detail in Volunteer tab)
  expandedVolId: string | null = null;

  // Expanded expense row (for itemwise detail)
  expandedExpenseId: string | null = null;

  // ── Volunteer Advance System ──
  volunteerAdvances: { [volId: string]: number } = {}; // advance given
  volunteerTransfers: any[] = [];
  showAdvanceModal = false;
  showTransferModal = false;
  showVolunteerExpensesModal = false;
  selectedVolunteerForDetails: any = null;
  showVoucherModal = false;
  selectedVoucher: any = null;
  isEditingUnifiedTransaction = false;
  editingTransactionRaw: any = null;
  selectedAdvanceVol: any = null;
  advanceGivenAmount = 0;
  advanceTransferSearch = '';
  newTransfer: any = { fromId: '', toId: '', amount: 0, date: '', note: '' };
  transferFromVol: any = null;
  transferToVol: any = null;
  showTransferFromDropdown = false;
  showTransferToDropdown = false;
  transferFromSearch = '';
  transferToSearch = '';

  // ── Delete Confirm Modals ──
  showTransferDeleteConfirm = false;
  transferToDelete: any = null;
  showUnifiedDeleteConfirm = false;
  unifiedToDelete: any = null;
  showAnnounceDeleteConfirm = false;
  announcementToDelete: any = null;

  // ── WhatsApp Thank You Receipt Modal State ──
  showThankYouModal = false;
  thankYouPhone = '';
  thankYouMessage = '';
  thankYouRecipientName = '';
  thankYouAmount = 0;

  // ── Prasadam Tracker State ──
  prasadamMeal: 'Breakfast' | 'Lunch' | 'Dinner' = 'Breakfast';
  prasadamTab: 'pending' | 'taken' = 'pending';
  prasadamSearchQuery = '';
  prasadamDate: string = new Date().toISOString().split('T')[0]; // Date-wise tracking
  prasadamMarkingInProgress = new Set<string>(); // Prevent duplicate mark clicks

  // ── Medical Incidents State & CRUD ──
  showMedicalModal = false;
  isEditMedical = false;
  showMedicalDeleteConfirm = false;
  medicalToDelete: any = null;
  medicalSearchQuery = '';
  showMedicalYatriDropdown = false;
  yatriSearchForMedical = '';
  filteredYatrisForMedical: any[] = [];
  selectedYatriForMedical: any = null;
  newMedical: any = {
    id: 0,
    packageId: null,
    yatriId: null,
    yatriName: '',
    symptoms: '',
    treatment: '',
    doctorName: '',
    status: 'Under Care',
    date: new Date().toISOString().split('T')[0]
  };

  // ── Lost & Found State & CRUD ──
  readonly lostCategories = [
    'Gold (सोने)',
    'Silver (चांदी)',
    'Cash (रोख रक्कम)',
    'Bag / Luggage (पिशवी / बॅग)',
    'Clothes (कपडे)',
    'Electronics / Mobile (मोबाईल)',
    'ID / Documents (कागदपत्रे)',
    'Other (इतर)'
  ];
  showLostModal = false;
  isEditLost = false;
  showLostDeleteConfirm = false;
  lostToDelete: any = null;
  lostSearchQuery = '';
  lostCategoryFilter = 'All';
  lostStatusFilter = 'All';
  showLostYatriDropdown = false;
  yatriSearchForLost = '';
  filteredYatrisForLost: any[] = [];
  selectedYatriForLost: any = null;
  showReturnModal = false;
  returningLostItem: any = null;
  returnReceiverName = '';
  returnReceiverPhone = '';
  newLostItem: any = {
    id: 0,
    itemName: '',
    description: '',
    category: 'Gold (सोने)',
    status: 'Lost',
    reportedDate: new Date().toISOString().split('T')[0],
    location: '',
    yatriId: null,
    yatriName: '',
    yatriPhone: '',
    claimedBy: ''
  };

  // ── Validation Alert ──
  showValidationAlert = false;
  validationAlertMessage = '';

  showValidation(msg: string) {
    this.validationAlertMessage = msg;
    this.showValidationAlert = true;
    setTimeout(() => this.showValidationAlert = false, 4000);
  }

  isValidPhone(phone: string): boolean {
    return /^[6-9]\d{9}$/.test((phone || '').trim());
  }

  generateThankYouMessage(item: any): { phone: string; name: string; message: string } {
    let name = item.party || item.receivedFrom || 'Donor';
    let phone = '';

    // Extract phone if embedded in party/receivedFrom name like "Ramesh, Pune (9876543210)"
    const phoneMatch = name.match(/\(([6-9]\d{9})\)/);
    if (phoneMatch) {
      phone = phoneMatch[1];
    }

    // If linked to a Yatri, look up yatri phone
    if (item.linkedYatriId || item.yatriId) {
      const yId = String(item.linkedYatriId || item.yatriId);
      const yatri = this.yatris.find(y => String(y.id) === yId);
      if (yatri) {
        if (!phone && yatri.phone) phone = yatri.phone;
        if (name === 'Donor' || name.startsWith('General')) name = yatri.name;
      }
    }

    // Clean up name for greeting (remove phone/city suffix)
    const cleanName = name.replace(/,\s*[^()]+/, '').replace(/\s*\([0-9]+\)/, '').trim();

    const category = item.type || item.category || 'Donation / Yatra Sewa';
    const refId = item.id || item.rawId || 'REC-' + Math.floor(Math.random() * 89999 + 10000);
    const amount = item.amount || 0;
    const mode = item.mode || 'UPI';
    const date = item.date || new Date().toISOString().split('T')[0];

    const message = `*हरे कृष्ण!* 🪔\n` +
      `ISCON Yatra Management Portal तर्फे नम्र प्रणाम.\n\n` +
      `प्रिय *${cleanName}* जी,\n` +
      `आपल्या ₹${amount.toLocaleString('en-IN')}/- च्या देणगीबद्दल (${category}) मनःपूर्वक धन्यवाद! 🙏\n\n` +
      `*🧾 पावती तपशील (Donation Receipt):*\n` +
      `----------------------------------\n` +
      `• पावती क्र (Ref ID): ${refId}\n` +
      `• देणगी प्रकार: ${category}\n` +
      `• रक्कम (Amount): ₹${amount.toLocaleString('en-IN')}\n` +
      `• देयक पद्धत: ${mode}\n` +
      `• दिनांक: ${date}\n` +
      `----------------------------------\n\n` +
      `भगवान श्रीकृष्णाची आणि श्री प्रभूपादांची असीम कृपा आपल्यावर आणि आपल्या कुटुंबावर सदैव राहो! 🌸\n\n` +
      `- ISCON Yatra Team`;

    return { phone, name: cleanName, message };
  }

  openThankYouModal(item: any, phoneOverride?: string) {
    const data = this.generateThankYouMessage(item);
    this.thankYouRecipientName = data.name;
    this.thankYouPhone = phoneOverride || data.phone || '';
    this.thankYouMessage = data.message;
    this.thankYouAmount = item.amount || 0;
    this.showThankYouModal = true;
  }

  sendThankYouWhatsApp() {
    if (!this.thankYouPhone || !this.isValidPhone(this.thankYouPhone)) {
      this.showValidation('⚠️ कृपया 10-अंकी वैध मोबाईल नंबर लिहा.');
      return;
    }
    const cleanPhone = this.thankYouPhone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    const url = `https://api.whatsapp.com/send?phone=${phoneWithCountry}&text=${encodeURIComponent(this.thankYouMessage)}`;
    window.open(url, '_blank');
  }

  // ── Excel Export for Finance Ledger ──
  exportFinanceExcel() {
    try {
      const incomeData = (this.combinedFinanceLedger || [])
        .filter(x => x.kind === 'Income')
        .map(i => ({
          'Ref ID': i.id || i.rawId || '—',
          'Date': i.date || '—',
          'Donor / Party Name': i.party || '—',
          'Category / Type': i.category || 'Donation',
          'Payment Mode': i.mode || 'Cash/UPI',
          'Amount (₹)': i.amount || 0,
          'Description': i.description || ''
        }));

      const expenseData = (this.combinedFinanceLedger || [])
        .filter(x => x.kind === 'Expense')
        .map(e => ({
          'Ref ID': e.id || e.rawId || '—',
          'Date': e.date || '—',
          'Vendor / Paid To': e.party || '—',
          'Department': e.department || '—',
          'Category': e.category || '—',
          'Payment Mode': e.mode || 'Cash',
          'Amount (₹)': e.amount || 0,
          'Description': e.description || ''
        }));

      const transferData = (this.volunteerTransfers || []).map(t => ({
        'Transfer ID': t.id,
        'Date': t.date,
        'From Volunteer': this.getVolunteerName(t.fromId),
        'To Volunteer': this.getVolunteerName(t.toId),
        'Amount (₹)': t.amount,
        'Note': t.note || ''
      }));

      const summaryData = [
        { 'Financial Metric': 'Total Income (जमा)', 'Amount (₹)': this.totalCombinedIncome },
        { 'Financial Metric': 'Total Expenses (खर्च)', 'Amount (₹)': this.totalOperationalExpense },
        { 'Financial Metric': 'Advance Transfers (हस्तांतरण)', 'Amount (₹)': this.totalAdvanceTransfers },
        { 'Financial Metric': 'Net Finance Balance (शिल्लक)', 'Amount (₹)': this.netFinanceBalance }
      ];

      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      const wsIncomes = XLSX.utils.json_to_sheet(incomeData);
      const wsExpenses = XLSX.utils.json_to_sheet(expenseData);
      const wsTransfers = XLSX.utils.json_to_sheet(transferData);

      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary Balance');
      XLSX.utils.book_append_sheet(wb, wsIncomes, 'Incomes & Donations');
      XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expenses');
      XLSX.utils.book_append_sheet(wb, wsTransfers, 'Volunteer Transfers');

      const fileName = `ISCON_Yatra_Finance_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Error exporting excel', err);
      this.showValidation('❌ Excel export करताना त्रुटी आली.');
    }
  }

  // ── Finance Ledger Print & Custom Column Selection ──
  showFinancePrintModal = false;
  showColumnSelector = false;

  printColumns = {
    date: true,
    type: true,
    party: true,
    category: true,
    description: true,
    mode: true,
    income: true,
    expense: true,
    transfer: true
  };

  openFinancePrintModal() {
    this.showFinancePrintModal = true;
  }

  closeFinancePrintModal() {
    this.showFinancePrintModal = false;
  }

  triggerPrint() {
    window.print();
  }

  toggleAllPrintColumns(select: boolean) {
    this.printColumns.date = select;
    this.printColumns.type = select;
    this.printColumns.party = select;
    this.printColumns.category = select;
    this.printColumns.description = select;
    this.printColumns.mode = select;
    this.printColumns.income = select;
    this.printColumns.expense = select;
    this.printColumns.transfer = select;
  }

  get todayDateStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  // ── Prasadam Meal Counter Analytics ──
  get prasadamMealAnalytics() {
    const totalYatrisCount = this.allowedYatris.length || 1;
    const list = this.yatriAttendances || [];
    const dateStr = this.prasadamDate; // Date-wise filter

    const breakfastCount = list.filter((a: any) => {
      const matchMeal = a.checkpointName === 'Meal-Breakfast' || a.checkpointName?.includes('Breakfast');
      if (!matchMeal) return false;
      if (!dateStr) return true;
      const attDate = a.timestamp ? a.timestamp.split('T')[0] : (a.date || '');
      return !attDate || attDate === dateStr;
    }).length;

    const lunchCount = list.filter((a: any) => {
      const matchMeal = a.checkpointName === 'Meal-Lunch' || a.checkpointName?.includes('Lunch');
      if (!matchMeal) return false;
      if (!dateStr) return true;
      const attDate = a.timestamp ? a.timestamp.split('T')[0] : (a.date || '');
      return !attDate || attDate === dateStr;
    }).length;

    const dinnerCount = list.filter((a: any) => {
      const matchMeal = a.checkpointName === 'Meal-Dinner' || a.checkpointName?.includes('Dinner');
      if (!matchMeal) return false;
      if (!dateStr) return true;
      const attDate = a.timestamp ? a.timestamp.split('T')[0] : (a.date || '');
      return !attDate || attDate === dateStr;
    }).length;

    return {
      totalExpected: totalYatrisCount,
      breakfast: { count: breakfastCount, pct: Math.min(100, Math.round((breakfastCount / totalYatrisCount) * 100)) },
      lunch: { count: lunchCount, pct: Math.min(100, Math.round((lunchCount / totalYatrisCount) * 100)) },
      dinner: { count: dinnerCount, pct: Math.min(100, Math.round((dinnerCount / totalYatrisCount) * 100)) }
    };
  }

  isValidAmount(val: any): boolean {
    const n = Number(val);
    return !isNaN(n) && n > 0;
  }

  // ── Food Department & Prasadam Cost Analytics ──
  get foodExpensesTotal(): number {
    if (!this.expenses || this.expenses.length === 0) return 0;
    return this.expenses.filter((e: any) => {
      const dept = (e.department || e.category || '').toLowerCase();
      return dept.includes('food') || dept.includes('prasadam') || dept.includes('अन्न') || dept.includes('प्रसाद');
    }).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
  }

  get totalPrasadamMealsServed(): number {
    if (!this.yatriAttendances || this.yatriAttendances.length === 0) return 0;
    return this.yatriAttendances.filter((a: any) => {
      const cp = (a.checkpointName || '').toLowerCase();
      return cp.includes('meal') || cp.includes('prasadam') || cp.includes('breakfast') || cp.includes('lunch') || cp.includes('dinner');
    }).length;
  }

  get todayPrasadamMealsServed(): number {
    if (!this.yatriAttendances || this.yatriAttendances.length === 0) return 0;
    const dt = this.prasadamDate;
    return this.yatriAttendances.filter((a: any) => {
      const cp = (a.checkpointName || '').toLowerCase();
      const matchMeal = cp.includes('meal') || cp.includes('prasadam') || cp.includes('breakfast') || cp.includes('lunch') || cp.includes('dinner');
      if (!matchMeal) return false;
      const attDate = a.timestamp ? a.timestamp.split('T')[0] : (a.date || '');
      return !dt || attDate === dt;
    }).length;
  }

  get costPerPrasadamPlate(): number {
    const served = this.totalPrasadamMealsServed;
    if (served <= 0) return 0;
    return this.foodExpensesTotal / served;
  }

  get costPerYatriFood(): number {
    const totalYatris = this.allowedYatris.length;
    if (totalYatris <= 0) return 0;
    return this.foodExpensesTotal / totalYatris;
  }

  openAddFoodExpenseFromPrasadam() {
    this.newExpense = {
      id: '',
      paidTo: 'Food Vendor / Grocery',
      volunteerId: '',
      department: 'Food',
      category: 'Food & Prasadam',
      amount: 0,
      mode: 'Cash',
      date: new Date().toISOString().split('T')[0],
      description: 'Prasadam grocery / catering expense',
      approvedBy: '',
      items: []
    };
    this.expenseDeptFilter = 'Food';
    this.showExpenseModal = true;
  }

  // ── Volunteer modal ──
  showVolunteerModal = false;
  showYatriDropdown = false;
  newVolunteer: any = { id: '', name: '', phone: '', assignedDepartment: 'Prasadam Management', shift: 'Morning', dutyLocation: 'Temple Hall', status: 'On Duty' };
  yatriSearchQuery = '';
  filteredYatris: any[] = [];
  selectedYatriForVolunteer: any = null;

  ngOnInit() {
    this.packageContext.selectedPackageId$.subscribe(id => {
      this.selectedPackageId = id;
    });
    this.loadData();
    this.loadAdvanceData();
    this.loadPermissionMatrix();
    this.loadSystemUsers();
  }

  getPackageName(pkgId?: string): string {
    const id = pkgId || this.selectedPackageId;
    if (!id) return 'All Packages';
    const found = (this.packages || []).find((p: any) => String(p.id) === String(id));
    return found ? (found.packageName || found.name || found.title || id) : 'All Packages';
  }

  loadData() {
    this.loading = true;
    forkJoin({
      announcements: this.api.getAll<any>('Announcements').pipe(catchError(() => of([]))),
      volunteers: this.api.getAll<any>('Volunteers').pipe(catchError(() => of([]))),
      incomes: this.api.getAll<any>('Incomes').pipe(catchError(() => of([]))),
      expenses: this.api.getAll<any>('Expenses').pipe(catchError(() => of([]))),
      incidents: this.api.getAll<any>('MedicalIncidents').pipe(catchError(() => of([]))),
      lostItems: this.api.getAll<any>('LostAndFounds').pipe(catchError(() => of([]))),
      packages: this.api.getAll<any>('Packages').pipe(catchError(() => of([]))),
      yatris: this.api.getAll<any>('Yatris').pipe(catchError(() => of([]))),
      yatriPayments: this.api.getAll<any>('YatriPayments').pipe(catchError(() => of([]))),
      attendances: this.api.getAll<any>('YatriAttendances').pipe(catchError(() => of([]))),
      departments: this.api.getAll<any>('Departments').pipe(catchError(() => of([]))),
      auditLogs: this.api.getAll<any>('AuditLogs').pipe(catchError(() => of([])))
    }).subscribe({
      next: (res) => {
        this.announcements = res.announcements || [];
        this.volunteers = res.volunteers || [];
        this.incomes = res.incomes || [];
        this.auditLogs = res.auditLogs || [];
        this.expenses = (res.expenses || []).map((e: any) => {
          let parsedDesc = { remarks: e.description, items: [], approvedBy: '' };
          try {
            if (e.description && (e.description.startsWith('{') || e.description.startsWith('['))) {
              parsedDesc = JSON.parse(e.description);
            }
          } catch (err) {}

          return {
            ...e,
            paidTo: e.vendor || e.paidTo || 'General Vendor',
            description: parsedDesc.remarks || e.description || '',
            items: parsedDesc.items || [],
            approvedBy: parsedDesc.approvedBy || e.throughWhom || '',
            receiptUrl: e.receiptUrl || e.receipt_url || ''
          };
        });
        this.incidents = res.incidents || [];
        this.lostItems = res.lostItems || [];
        this.packages = res.packages || [];
        this.yatris = res.yatris || [];
        this.yatriPayments = res.yatriPayments || [];
        this.yatriAttendances = res.attendances || [];
        this.departments = res.departments || [];
        this.loading = false;
      },
      error: (err) => { console.error('Error loading operational data', err); this.loading = false; }
    });
  }

  // ── Department Management Methods ──
  get departmentNames(): string[] {
    const list = new Set<string>();
    for (const d of this.departments) {
      if (d.name && d.name.trim()) list.add(d.name.trim());
    }
    if (list.size === 0) {
      ['Food', 'Accommodation', 'Transport', 'Religious', 'Medical', 'Volunteer', 'General'].forEach(x => list.add(x));
    }
    return Array.from(list);
  }

  get expenseCategoryOptions(): string[] {
    const defaultCategories = [
      'Food & Prasadam',
      'Transport',
      'Medical',
      'Accommodation',
      'Religious',
      'Volunteer Allowance',
      'General'
    ];
    const catSet = new Set<string>(defaultCategories);
    for (const d of this.departments) {
      if (d.name && d.name.trim()) catSet.add(d.name.trim());
    }
    return Array.from(catSet);
  }

  get unifiedExpenseCategoryOptions(): string[] {
    const defaultCategories = [
      'Food & Prasadam',
      'Transport & Fuel',
      'Hotel & Ashram',
      'Medical & Care',
      'Pooja & Rituals',
      'Volunteer Expense',
      'General Ops'
    ];
    const catSet = new Set<string>(defaultCategories);
    for (const d of this.departments) {
      if (d.name && d.name.trim()) catSet.add(d.name.trim());
    }
    return Array.from(catSet);
  }

  openDeptManageModal() {
    this.newDept = { name: '', description: '' };
    this.deptError = '';
    this.deptDeleteConfirm = null;
    this.showDeptManageModal = true;
  }

  saveDept() {
    if (!this.newDept.name?.trim()) {
      this.deptError = 'Department नाव आवश्यक आहे.';
      return;
    }
    const exists = this.departments.find(d => d.name.toLowerCase() === this.newDept.name.trim().toLowerCase());
    if (exists) {
      this.deptError = 'हे Department आधीच अस्तित्वात आहे.';
      return;
    }
    this.deptSaving = true;
    this.deptError = '';
    this.api.create<any>('Departments', { name: this.newDept.name.trim(), description: this.newDept.description?.trim() || '' }).subscribe({
      next: (created) => {
        this.departments = [...this.departments, created];
        this.newDept = { name: '', description: '' };
        this.deptSaving = false;
      },
      error: (err) => {
        this.deptError = 'Department जोडताना त्रुटी आली.';
        this.deptSaving = false;
      }
    });
  }

  confirmDeleteDept(dept: any) {
    this.deptDeleteConfirm = dept;
  }

  doDeleteDept() {
    if (!this.deptDeleteConfirm) return;
    this.api.delete('Departments', this.deptDeleteConfirm.id).subscribe({
      next: () => {
        this.departments = this.departments.filter(d => d.id !== this.deptDeleteConfirm.id);
        this.deptDeleteConfirm = null;
      },
      error: (err) => {
        this.showValidation('❌ Department डिलीट करताना त्रुटी आली.');
        this.deptDeleteConfirm = null;
      }
    });
  }

  // ── Yatri Payment helpers ──
  getYatriName(yatriId: string | number): string {
    return this.yatris.find(y => y.id == yatriId)?.name || String(yatriId);
  }

  get filteredYatriPayments(): any[] {
    if (!this.selectedPackageId || this.selectedPackageId === 'all') return this.yatriPayments;
    const pkgYatriIds = this.yatris
      .filter(y => y.packageId === this.selectedPackageId)
      .map(y => String(y.id).toLowerCase());
    return this.yatriPayments.filter(p => p.yatriId && pkgYatriIds.includes(String(p.yatriId).toLowerCase()));
  }

  get totalYatriPayments(): number {
    return this.filteredYatriPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }

  // ── Expense Delete ──
  openExpenseDeleteConfirm(exp: any, event: Event) {
    event.stopPropagation();
    this.expenseToDelete = exp;
    this.showExpenseDeleteConfirm = true;
  }

  confirmDeleteExpense() {
    if (!this.expenseToDelete) return;
    this.api.delete('Expenses', this.expenseToDelete.id).subscribe({
      next: () => {
        this.showExpenseDeleteConfirm = false;
        this.expenseToDelete = null;
        this.loadData();
      },
      error: (err) => console.error('Error deleting expense', err)
    });
  }

  // ── Deleted Volunteers Tracking (localStorage fallback) ──
  deletedVolIds = new Set<string>(JSON.parse(localStorage.getItem('deleted_vol_ids') || '[]'));

  // ── Filtered Getters ──

  get filteredVolunteers(): any[] {
    let list = (this.volunteers || []).filter(v => v && v.id && !this.deletedVolIds.has(v.id));
    if (!this.selectedPackageId) return list;
    const packageYatris = this.yatris.filter(y => y.packageId === this.selectedPackageId);
    const packageYatriPhones = packageYatris.map(y => y.phone).filter(Boolean);
    const packageYatriNames = packageYatris.map(y => y.name.toLowerCase());
    return list.filter(v => {
      return v.packageId === this.selectedPackageId || packageYatriPhones.includes(v.phone) || packageYatriNames.includes(v.name?.toLowerCase());
    });
  }

  get filteredIncomes(): any[] {
    if (!this.selectedPackageId || this.selectedPackageId === 'all') return this.incomes || [];
    const pkgIdStr = String(this.selectedPackageId);
    const packageYatriIds = (this.yatris || [])
      .filter(y => y.packageId != null && String(y.packageId) === pkgIdStr)
      .map(y => String(y.id).toLowerCase());

    return (this.incomes || []).filter(i => {
      if (i.packageId != null && String(i.packageId) === pkgIdStr) return true;
      if (i.linkedYatriId != null && packageYatriIds.includes(String(i.linkedYatriId).toLowerCase())) return true;
      if (i.packageId == null && i.linkedYatriId == null) return true;
      return false;
    });
  }

  get filteredExpenses(): any[] {
    if (!this.selectedPackageId || this.selectedPackageId === 'all') return this.expenses || [];
    const pkgIdStr = String(this.selectedPackageId);
    return (this.expenses || []).filter(e => {
      if (e.packageId == null) return true;
      return String(e.packageId) === pkgIdStr;
    });
  }

  // ── Unified Finance Ledger Getters ──
  get rawCombinedFinanceLedger(): any[] {
    const list: any[] = [];
    
    // Incomes
    for (const inc of this.filteredIncomes) {
      list.push({
        id: inc.id,
        rawId: inc.id,
        kind: 'Income',
        party: inc.receivedFrom || 'General Income',
        category: inc.type || 'Payment',
        department: inc.department || inc.type || 'Donation',
        amount: Number(inc.amount) || 0,
        mode: inc.mode || 'UPI',
        date: inc.date || '',
        description: inc.description || '',
        raw: inc
      });
    }

    // Yatri Member Payments as Income (Installments from yatri_payments table)
    for (const pay of this.filteredYatriPayments) {
      list.push({
        id: 'ypay-' + pay.id,
        rawId: pay.id,
        kind: 'Income',
        party: this.getYatriName(pay.yatriId),
        category: pay.remarks || 'Yatri Member Fee',
        department: 'Yatri Fee',
        amount: Number(pay.amount) || 0,
        mode: pay.method || 'Cash',
        date: pay.date || '',
        description: pay.remarks || 'Yatri Member Fee',
        raw: pay
      });
    }

    // Add Pilgrim Registration Fees (Un-ledgered amount from Yatri.amountPaid directly)
    for (const y of this.allowedYatris) {
      const payments = this.yatriPayments.filter(p => String(p.yatriId).toLowerCase() === String(y.id).toLowerCase());
      const totalLedgered = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const registrationFee = (Number(y.amountPaid) || 0) - totalLedgered;

      if (registrationFee > 0) {
        const pkg = this.packages.find(p => p.id === y.packageId);
        const feeDate = pkg ? pkg.startDate : '';
        list.push({
          id: 'yreg-' + y.id,
          rawId: y.id,
          kind: 'Income',
          party: y.name,
          category: 'Registration Fee',
          department: 'Registration Fee',
          amount: registrationFee,
          mode: 'Cash',
          date: feeDate || '',
          description: 'Initial Pilgrim Registration Fee',
          raw: y
        });
      }
    }

    // Expenses & Advance Transfers
    for (const exp of this.filteredExpenses) {
      const isAdvance = exp.type === 'advance' || exp.type === 'transfer' || exp.category === 'Volunteer Advance' || (exp.description && exp.description.startsWith('Volunteer Advance:'));
      list.push({
        id: exp.id,
        rawId: exp.id,
        kind: isAdvance ? 'Transfer' : 'Expense',
        party: exp.paidTo || exp.vendor || (isAdvance ? 'Volunteer' : 'Vendor'),
        category: isAdvance ? 'Volunteer Advance' : (exp.category || exp.department || 'General'),
        department: isAdvance ? 'Volunteer Advance' : (exp.department || exp.category || 'General'),
        amount: Number(exp.amount) || 0,
        mode: exp.mode || 'Cash',
        date: exp.date || '',
        description: exp.description || '',
        volunteerId: exp.volunteerId || null,
        items: exp.items || [],
        receiptUrl: exp.receiptUrl || exp.receipt_url || '',
        raw: exp
      });
    }

    // Sort descending by date
    list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    return list;
  }

  get departmentCategoryList(): string[] {
    const baseList = [
      'Donation',
      'Sponsorship',
      'Food & Prasadam',
      'Transport / Traveling',
      'Medical',
      'Accommodation',
      'Volunteer Advance',
      'Yatri Fee',
      'Registration Fee',
      'Religious',
      'Miscellaneous'
    ];
    const catSet = new Set<string>(baseList);
    for (const d of this.departments) {
      if (d.name && d.name.trim()) catSet.add(d.name.trim());
    }
    for (const item of this.rawCombinedFinanceLedger) {
      if (item.category && item.category.trim()) catSet.add(item.category.trim());
      if (item.department && item.department.trim()) catSet.add(item.department.trim());
    }
    return Array.from(catSet).sort();
  }

  get combinedFinanceLedger(): any[] {
    let list = this.rawCombinedFinanceLedger;

    // ── VOLUNTEER SECURITY RESTRICTION ──
    // Volunteers can ONLY see Expense entries for their assigned department!
    // Income and Transfer entries are strictly hidden from Volunteers.
    if (this.isVolunteer) {
      const volDept = (this.userDepartment || 'general').toLowerCase().trim();
      list = list.filter(x => {
        if (x.kind !== 'Expense') return false; // Strictly hide Income & Transfer
        if (volDept === 'general') return true; // General dept volunteer sees all department expenses
        const itemDept = (x.department || x.category || 'general').toLowerCase().trim();
        return itemDept === 'general' || itemDept === volDept || itemDept.includes(volDept) || volDept.includes(itemDept);
      });
    }

    if (this.financeSearchQuery) {
      const q = this.financeSearchQuery.toLowerCase().trim();
      list = list.filter(x => 
        (x.party && x.party.toLowerCase().includes(q)) ||
        (x.category && x.category.toLowerCase().includes(q)) ||
        (x.department && x.department.toLowerCase().includes(q)) ||
        (x.description && x.description.toLowerCase().includes(q)) ||
        (x.mode && x.mode.toLowerCase().includes(q)) ||
        (x.kind && x.kind.toLowerCase().includes(q)) ||
        (x.date && x.date.includes(q)) ||
        (x.amount !== undefined && String(x.amount).includes(q))
      );
    }

    if (this.financeFilter === 'Income') list = list.filter(x => x.kind === 'Income');
    if (this.financeFilter === 'Expense') list = list.filter(x => x.kind === 'Expense');
    if (this.financeFilter === 'Transfer') list = list.filter(x => x.kind === 'Transfer');

    if (this.financeCategoryFilter && this.financeCategoryFilter !== 'All') {
      const target = this.financeCategoryFilter.toLowerCase().trim();
      list = list.filter(x => {
        const cat = (x.category || '').toLowerCase();
        const dept = (x.department || '').toLowerCase();

        if (target.includes('transport') || target.includes('travel')) {
          return cat.includes('transport') || cat.includes('travel') || dept.includes('transport') || dept.includes('travel');
        }
        if (target.includes('food') || target.includes('prasadam')) {
          return cat.includes('food') || cat.includes('prasadam') || dept.includes('food') || dept.includes('prasadam');
        }

        return cat.includes(target) || dept.includes(target) || target.includes(cat) || target.includes(dept);
      });
    }

    return list;
  }

  get totalCombinedIncome(): number {
    return this.rawCombinedFinanceLedger
      .filter(x => x.kind === 'Income')
      .reduce((s, x) => s + x.amount, 0);
  }

  get totalOperationalExpense(): number {
    let list = this.filteredExpenses
      .filter(e => e.type !== 'advance' && e.type !== 'transfer' && e.category !== 'Volunteer Advance' && !(e.description && e.description.startsWith('Volunteer Advance:')));

    if (this.isVolunteer) {
      const volDept = (this.userDepartment || 'general').toLowerCase().trim();
      if (volDept !== 'general') {
        list = list.filter(e => {
          const itemDept = (e.department || e.category || 'general').toLowerCase().trim();
          return itemDept === 'general' || itemDept === volDept || itemDept.includes(volDept) || volDept.includes(itemDept);
        });
      }
    }

    return list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  }

  get totalAdvanceTransfers(): number {
    return this.filteredExpenses
      .filter(e => e.type === 'advance' || e.type === 'transfer' || e.category === 'Volunteer Advance' || (e.description && e.description.startsWith('Volunteer Advance:')))
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  }

  get totalCombinedExpense(): number {
    return this.totalOperationalExpense + this.totalAdvanceTransfers;
  }

  get netProfit(): number {
    return this.totalCombinedIncome - this.totalOperationalExpense;
  }

  get netFinanceBalance(): number {
    return this.totalCombinedIncome - this.totalCombinedExpense;
  }

  get filteredAnnouncements(): any[] {
    if (!this.selectedPackageId || this.selectedPackageId === 'all') {
      return this.announcements;
    }
    return this.announcements.filter(a => !a.packageId || String(a.packageId) === String(this.selectedPackageId));
  }

  get filteredIncidents(): any[] {
    if (!this.selectedPackageId) return this.incidents;
    const packageYatris = this.yatris.filter(y => y.packageId === this.selectedPackageId);
    const packageYatriIds = packageYatris.map(y => y.id);
    const packageYatriNames = packageYatris.map(y => y.name.toLowerCase());
    return this.incidents.filter(med => {
      return packageYatriIds.includes(med.yatriId) || packageYatriNames.includes(med.yatriName?.toLowerCase());
    });
  }

  get filteredLostItemsList(): any[] {
    if (!this.selectedPackageId) return this.lostItems;
    const packageYatris = this.yatris.filter(y => y.packageId === this.selectedPackageId);
    const packageYatriIds = packageYatris.map(y => y.id);
    const packageYatriNames = packageYatris.map(y => y.name.toLowerCase());
    return this.lostItems.filter(lf => {
      const isAssociatedWithOther = lf.yatriId && !packageYatriIds.includes(lf.yatriId);
      const isClaimedByOther = lf.claimedBy && !packageYatriNames.includes(lf.claimedBy.toLowerCase());
      return !isAssociatedWithOther && !isClaimedByOther;
    });
  }

  get allowedYatris(): any[] {
    if (!this.selectedPackageId || this.selectedPackageId === 'all') return this.yatris;
    return this.yatris.filter(y => y.packageId === this.selectedPackageId);
  }

  get currentPackageId(): string | null {
    return (this.selectedPackageId && this.selectedPackageId !== 'all') ? this.selectedPackageId : (this.packages[0]?.id || null);
  }

  // ── Finance Getters ──
  get totalIncome() { return this.filteredIncomes.reduce((s, i) => s + (Number(i.amount) || 0), 0); }
  get totalExpenses() { return this.filteredExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0); }

  // ── Volunteer Advance Getters ──
  getExpenseItemTotal(e: any): number {
    if (e.items && Array.isArray(e.items) && e.items.length > 0) {
      const validItems = e.items.filter((it: any) => it && it.item && String(it.item).trim() !== '');
      if (validItems.length > 0) {
        const itemSum = validItems.reduce((sum: number, it: any) => {
          const unit = Number(it.unit) || 1;
          const price = Number(it.unitPrice) || 0;
          return sum + (unit * price);
        }, 0);
        if (itemSum > 0) return itemSum;
      }
    }
    return Number(e.amount) || 0;
  }

  isActualVolunteerExpense(e: any): boolean {
    const cat = (e.category || '').toLowerCase();
    const desc = (e.description || '').toLowerCase();
    if (cat.includes('volunteer advance') || cat === 'volunteer expense' || desc.includes('volunteer advance')) {
      return false;
    }
    return true;
  }

  // फक्त volunteer-linked actual expenses (itemwise total)
  get totalVolunteerExpenses(): number {
    return this.expenses
      .filter(e => (e.volunteerId || e.volunteer_id) && this.isActualVolunteerExpense(e))
      .reduce((s, e) => s + this.getExpenseItemTotal(e), 0);
  }
  // Advance Balance = Total Advance Given - Volunteer Expenses
  get totalAdvanceBalance(): number {
    return this.totalAdvancesGiven - this.totalVolunteerExpenses;
  }

  // ── Expense items management ──
  get expenseTotal() {
    return this.expenseItems.reduce((s, i) => s + (i.unit * i.unitPrice), 0);
  }

  addExpenseItem() {
    this.expenseItems.push({ item: '', unit: 1, unitPrice: 0 });
  }

  addMultipleExpenseItems(count: number) {
    for (let i = 0; i < count; i++) {
      this.expenseItems.push({ item: '', unit: 1, unitPrice: 0 });
    }
  }

  onItemNameChange(idx: number) {
    // If they typed in the last item row, automatically append a new blank row for convenience
    if (idx === this.expenseItems.length - 1 && this.expenseItems[idx].item.trim() !== '') {
      this.addExpenseItem();
    }
  }

  removeExpenseItem(idx: number) {
    this.expenseItems.splice(idx, 1);
    // If they removed everything, keep at least one row
    if (this.expenseItems.length === 0) {
      this.addExpenseItem();
    }
  }

  // ── Volunteer search for expense ──
  get uniqueDepartments(): string[] {
    const set = new Set<string>();
    for (const d of this.departments) {
      if (d.name && d.name.trim()) set.add(d.name.trim());
    }
    for (const v of this.volunteers) {
      if (v.assignedDepartment && v.assignedDepartment.trim()) set.add(v.assignedDepartment.trim());
    }
    return Array.from(set).sort();
  }

  get filteredVolsForExpense(): any[] {
    let list = this.filteredVolunteers;
    if (this.expenseDeptFilter) list = list.filter(v => v.assignedDepartment === this.expenseDeptFilter);
    if (this.expenseVolSearch) {
      const q = this.expenseVolSearch.toLowerCase();
      list = list.filter(v => v.name?.toLowerCase().includes(q) || v.id?.toLowerCase().includes(q));
    }
    return list;
  }

  toggleExpenseVolDropdown() {
    this.showExpenseVolDropdown = !this.showExpenseVolDropdown;
  }

  selectExpenseVolunteer(vol: any) {
    this.selectedExpenseVol = vol;
    this.newExpense.paidTo = vol.name;
    this.newExpense.volunteerId = vol.id;
    this.newExpense.department = vol.assignedDepartment;
    this.showExpenseVolDropdown = false;
  }

  // ── Open Expense Modal ──
  openExpenseModal() {
    this.newExpense = {
      id: 'exp-' + Date.now(),
      paidTo: '', volunteerId: '', department: '',
      category: 'Food & Prasadam', amount: 0, mode: 'Cash',
      date: new Date().toISOString().split('T')[0],
      description: '', approvedBy: '', items: []
    };
    this.expenseItems = [{ item: '', unit: 1, unitPrice: 0 }];
    this.selectedExpenseVol = null;
    this.expenseVolSearch = '';
    this.expenseDeptFilter = '';
    this.showExpenseVolDropdown = false;
    this.showExpenseModal = true;
  }

  mapCategoryToDbDepartment(category: string): string {
    if (!category) return 'General';
    const matched = this.departments.find(d => d.name.toLowerCase() === category.trim().toLowerCase());
    if (matched) return matched.name;

    switch (category) {
      case 'Food & Prasadam': return 'Food';
      case 'Transport & Fuel':
      case 'Transport': return 'Transport';
      case 'Medical & Care':
      case 'Medical': return 'Medical';
      case 'Hotel & Ashram':
      case 'Accommodation': return 'Accommodation';
      case 'Volunteer Expense':
      case 'Volunteer Allowance': return 'Volunteer';
      case 'Pooja & Rituals':
      case 'Religious': return 'Religious';
      case 'General Ops':
      case 'General':
      default:
        return category;
    }
  }

  // ── Save Expense ──
  addExpense() {
    // ── Validation ──
    if (!this.newExpense.paidTo || !this.newExpense.paidTo.trim()) {
      this.showValidation('⚠️ कृपया "Paid To / Vendor" हे field भरा.');
      return;
    }
    const total = this.expenseTotal;
    const finalAmount = total > 0 ? total : Number(this.newExpense.amount);
    if (!this.isValidAmount(finalAmount)) {
      this.showValidation('⚠️ Amount रकमेत फक्त अंक लिहा आणि ती 0 पेक्षा जास्त असावी.');
      return;
    }
    if (!this.newExpense.date) {
      this.showValidation('⚠️ कृपया Date निवडा.');
      return;
    }
    const dbDept = this.mapCategoryToDbDepartment(this.newExpense.category);
    const matchedExpDept = this.departments.find(d => d.name.toLowerCase() === dbDept.toLowerCase());

    const payload = {
      id: this.newExpense.id || 'exp-' + Date.now(),
      packageId: this.currentPackageId,
      departmentId: matchedExpDept?.id || null,
      department: dbDept,
      description: JSON.stringify({
        remarks: this.newExpense.description || 'Expense details',
        items: this.expenseItems,
        approvedBy: this.newExpense.approvedBy || ''
      }),
      amount: finalAmount,
      date: this.newExpense.date,
      status: 'Approved',
      vendor: this.newExpense.paidTo.trim(),
      volunteerId: this.newExpense.volunteerId || null,
      throughWhom: null,
      receiptUrl: this.newExpense.receiptUrl || null
    };

    this.api.create('Expenses', payload).subscribe({
      next: () => { this.showExpenseModal = false; this.loadData(); },
      error: (err) => {
        console.error('Error adding expense', err);
        this.showValidation('❌ Expense save करताना error: ' + (err.error?.detail || err.error?.title || err.message || 'Server Error'));
      }
    });
  }

  // ── Expense detail expand/collapse ──
  toggleExpenseDetail(expId: string) {
    this.expandedExpenseId = this.expandedExpenseId === expId ? null : expId;
  }

  getExpenseItems(exp: any): any[] {
    // Filter out blank/zero item rows that were never filled in
    return (exp.items || []).filter((it: any) => it.item && it.item.trim() !== '');
  }

  // ════════════════════════════════════════
  // VOLUNTEER ADVANCE SYSTEM
  // ════════════════════════════════════════

  // Load advances & transfers from Database API
  loadAdvanceData() {
    try {
      const adv = localStorage.getItem('iscon_vol_advances');
      if (adv) this.volunteerAdvances = JSON.parse(adv);
    } catch {}

    // Populate volunteer advances from loaded volunteers array
    (this.volunteers || []).forEach((v: any) => {
      if (v.advanceAmount && Number(v.advanceAmount) > 0) {
        this.volunteerAdvances[v.id] = Number(v.advanceAmount);
      }
    });

    this.api.getAll<any>('VolunteerTransfers').subscribe({
      next: (res) => {
        if (res && Array.isArray(res)) {
          this.volunteerTransfers = res;
          this.saveAdvanceData();
        }
      },
      error: (err) => console.warn('VolunteerTransfers API fetch warning:', err)
    });
  }

  saveAdvanceData() {
    try {
      localStorage.setItem('iscon_vol_advances', JSON.stringify(this.volunteerAdvances));
      localStorage.setItem('iscon_vol_transfers', JSON.stringify(this.volunteerTransfers));
    } catch {}
  }

  // Compute expense total for a specific volunteer (sum of itemwise totals)
  getVolunteerExpenses(volId: string): number {
    return this.expenses
      .filter(e => (e.volunteerId || e.volunteer_id) === volId && this.isActualVolunteerExpense(e))
      .reduce((s, e) => s + this.getExpenseItemTotal(e), 0);
  }

  // Net transfer balance for a volunteer (+received, -sent)
  getVolunteerTransferBalance(volId: string): number {
    const received = this.volunteerTransfers
      .filter(t => String(t.toId) === String(volId))
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const sent = this.volunteerTransfers
      .filter(t => String(t.fromId) === String(volId))
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    return received - sent;
  }

  // Remaining Balance = Advance + Transfer Received - Transfer Sent - Expenses
  getVolunteerBalance(volId: string): number {
    const advance = this.volunteerAdvances[volId] || 0;
    const transferNet = this.getVolunteerTransferBalance(volId);
    const expenses = this.getVolunteerExpenses(volId);
    return advance + transferNet - expenses;
  }

  // Volunteers who have had any advance activity
  get volunteersWithAdvance(): any[] {
    const ids = new Set([
      ...Object.keys(this.volunteerAdvances),
      ...this.volunteerTransfers.map(t => String(t.fromId)),
      ...this.volunteerTransfers.map(t => String(t.toId)),
      ...this.expenses.filter(e => e.volunteerId || e.volunteer_id).map(e => String(e.volunteerId || e.volunteer_id))
    ]);
    return this.filteredVolunteers.filter(v => ids.has(String(v.id)));
  }

  // ── Open Give Advance Modal ──
  openAdvanceModal(vol: any) {
    this.selectedAdvanceVol = vol;
    this.advanceGivenAmount = this.volunteerAdvances[vol.id] || 0;
    this.showAdvanceModal = true;
  }

  saveAdvance() {
    if (!this.selectedAdvanceVol) return;
    if (!this.isValidAmount(this.advanceGivenAmount)) {
      this.showValidation('⚠️ Advance Amount हे 0 पेक्षा जास्त संख्या असावी.');
      return;
    }
    const amt = Number(this.advanceGivenAmount);
    this.volunteerAdvances[this.selectedAdvanceVol.id] = amt;
    this.saveAdvanceData();
    this.showAdvanceModal = false;

    // Persist to Database via Volunteer update
    const updatedVol = {
      ...this.selectedAdvanceVol,
      advanceAmount: amt
    };
    this.api.update('Volunteers', this.selectedAdvanceVol.id, updatedVol).subscribe({
      next: () => this.loadData(),
      error: (err) => console.error('Error saving volunteer advance in DB', err)
    });
  }

  // ── Open Transfer Modal ──
  openTransferModal() {
    this.newTransfer = { fromId: '', toId: '', amount: 0, date: new Date().toISOString().split('T')[0], note: '' };
    this.transferFromVol = null;
    this.transferToVol = null;
    this.transferFromSearch = '';
    this.transferToSearch = '';
    this.showTransferFromDropdown = false;
    this.showTransferToDropdown = false;
    this.showTransferModal = true;
  }

  selectTransferFrom(vol: any) {
    this.transferFromVol = vol;
    this.newTransfer.fromId = vol.id;
    this.showTransferFromDropdown = false;
  }

  selectTransferTo(vol: any) {
    this.transferToVol = vol;
    this.newTransfer.toId = vol.id;
    this.showTransferToDropdown = false;
  }

  get filteredTransferFrom(): any[] {
    if (!this.transferFromSearch) return this.filteredVolunteers;
    const q = this.transferFromSearch.toLowerCase();
    return this.filteredVolunteers.filter(v => v.name?.toLowerCase().includes(q));
  }

  get filteredTransferTo(): any[] {
    if (!this.transferToSearch) return this.filteredVolunteers;
    const q = this.transferToSearch.toLowerCase();
    return this.filteredVolunteers.filter(v => v.name?.toLowerCase().includes(q));
  }

  saveTransfer() {
    if (!this.newTransfer.fromId) {
      this.showValidation('⚠️ कृपया "From Volunteer" निवडा.');
      return;
    }
    if (!this.newTransfer.toId) {
      this.showValidation('⚠️ कृपया "To Volunteer" निवडा.');
      return;
    }
    if (this.newTransfer.fromId === this.newTransfer.toId) {
      this.showValidation('⚠️ From आणि To volunteer एकच असू शकत नाहीत.');
      return;
    }
    if (!this.isValidAmount(this.newTransfer.amount)) {
      this.showValidation('⚠️ Transfer Amount हे 0 पेक्षा जास्त संख्या असावी.');
      return;
    }
    if (!this.newTransfer.date) {
      this.showValidation('⚠️ कृपया Transfer Date निवडा.');
      return;
    }

    const payload = {
      id: 0,
      fromId: Number(this.newTransfer.fromId) || 0,
      toId: Number(this.newTransfer.toId) || 0,
      amount: Number(this.newTransfer.amount),
      date: this.newTransfer.date,
      note: this.newTransfer.note || ''
    };

    this.showTransferModal = false;

    this.api.create('VolunteerTransfers', payload).subscribe({
      next: (created: any) => {
        this.volunteerTransfers.push(created || payload);
        this.saveAdvanceData();
        this.loadAdvanceData();
      },
      error: (err) => {
        console.error('Error saving volunteer transfer to DB', err);
        // Fallback local save if DB offline
        this.volunteerTransfers.push({ ...payload, id: 'tr-' + Date.now() });
        this.saveAdvanceData();
      }
    });
  }

  openTransferDeleteConfirm(tr: any) {
    this.transferToDelete = tr;
    this.showTransferDeleteConfirm = true;
  }

  confirmDeleteTransfer() {
    if (!this.transferToDelete) return;
    const trId = this.transferToDelete.id;
    this.volunteerTransfers = this.volunteerTransfers.filter(t => t.id !== trId);
    this.saveAdvanceData();
    this.showTransferDeleteConfirm = false;
    this.transferToDelete = null;

    if (!isNaN(Number(trId))) {
      this.api.delete('VolunteerTransfers', trId).subscribe({
        next: () => this.loadAdvanceData(),
        error: (err) => console.error('Error deleting transfer from DB', err)
      });
    }
  }

  getVolunteerName(id: string): string {
    return this.volunteers.find(v => v.id === id)?.name || id;
  }

  openVolunteerExpensesModal(volunteerId: string): void {
    const vol = this.volunteers.find(v => String(v.id) === String(volunteerId));
    if (!vol) return;
    this.selectedVolunteerForDetails = vol;
    this.showVolunteerExpensesModal = true;
  }

  openVoucherModal(item: any): void {
    this.selectedVoucher = item;
    this.showVoucherModal = true;
  }

  openEditUnifiedFinanceModal(item: any, event: Event) {
    event.stopPropagation();
    
    // Check if it's yreg (registration fee) which is computed from Yatri profile directly
    if (item.id && item.id.toString().startsWith('yreg-')) {
      alert("Registration Fee is linked to the pilgrim's profile. Please edit the Pilgrim (Yatri) record instead.");
      return;
    }

    this.isEditingUnifiedTransaction = true;
    this.editingTransactionRaw = item;

    // Populate unifiedFinance form model
    this.unifiedFinance = {
      kind: item.kind,
      party: item.party,
      category: item.category,
      amount: item.amount,
      mode: item.mode,
      date: item.date || new Date().toISOString().split('T')[0],
      description: item.description || '',
      volunteerId: item.volunteerId || '',
      yatriId: item.raw && item.raw.yatriId ? item.raw.yatriId : '',
      receiptUrl: item.receiptUrl || item.raw?.receiptUrl || item.raw?.receipt_url || ''
    };

    if (item.kind === 'Expense') {
      this.expenseItems = item.items && item.items.length > 0 
        ? JSON.parse(JSON.stringify(item.items))
        : [{ item: '', unit: 1, unitPrice: 0 }];
      this.selectedExpenseVol = this.volunteers.find(v => v.id === item.volunteerId) || null;
      this.expenseVolSearch = this.selectedExpenseVol ? this.selectedExpenseVol.name : '';
    } else {
      this.selectedExpenseVol = null;
      this.expenseVolSearch = '';
    }

    this.showUnifiedFinanceModal = true;
  }

  // ── total advances given ──
  get totalAdvancesGiven(): number {
    return Object.values(this.volunteerAdvances).reduce((s, v) => s + (Number(v) || 0), 0);
  }

  // ── Toggle volunteer detail row (Volunteer tab) ──
  toggleVolDetail(volId: string) {
    this.expandedVolId = this.expandedVolId === volId ? null : volId;
  }

  // ── Build full chronological ledger for a volunteer, including itemwise expense breakdown ──
  getVolunteerLedger(volId: string): { date: string; type: string; label: string; amount: number; running: number; items?: any[] }[] {
    const entries: { date: string; type: string; label: string; amount: number; running: number; items?: any[] }[] = [];
    let running = 0;

    // 1. Advance given
    const advance = this.volunteerAdvances[volId] || 0;
    if (advance > 0) {
      running += advance;
      entries.push({ date: '', type: 'advance', label: 'Advance दिला (Advance Given)', amount: advance, running });
    }

    // 2. Gather transfers and expenses into one list, sort by date
    const raw: { date: string; type: string; label: string; amount: number; items?: any[] }[] = [];

    // Transfers received (+)
    this.volunteerTransfers
      .filter(t => t.toId === volId)
      .forEach(t => raw.push({ date: t.date, type: 'transfer-in', label: `Transfer मिळाले (from ${this.getVolunteerName(t.fromId)})${t.note ? ' · ' + t.note : ''}`, amount: t.amount }));

    // Transfers sent (-)
    this.volunteerTransfers
      .filter(t => t.fromId === volId)
      .forEach(t => raw.push({ date: t.date, type: 'transfer-out', label: `Transfer दिले (to ${this.getVolunteerName(t.toId)})${t.note ? ' · ' + t.note : ''}`, amount: -t.amount }));

    // Expenses used (-) — include itemwise breakdown & itemwise total
    this.expenses
      .filter(e => (e.volunteerId || e.volunteer_id) === volId && this.isActualVolunteerExpense(e))
      .forEach(e => {
        const expItems = (e.items || []).filter((it: any) => it.item && String(it.item).trim() !== '');
        const actualAmt = this.getExpenseItemTotal(e);
        raw.push({
          date: e.date,
          type: 'expense',
          label: `खर्च: ${e.paidTo || e.vendor || 'General'}${e.category ? ' (' + e.category + ')' : ''}`,
          amount: -actualAmt,
          items: expItems
        });
      });

    // Sort by date ascending
    raw.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    raw.forEach(item => {
      running += item.amount;
      entries.push({ date: item.date, type: item.type, label: item.label, amount: item.amount, running, items: item.items });
    });

    return entries;
  }



  // ── Income Yatri search ──
  toggleYatriIncomeDropdown() {
    this.showYatriIncomeDropdown = !this.showYatriIncomeDropdown;
    if (this.showYatriIncomeDropdown) { this.yatriSearchForIncome = ''; this.filteredYatrisForIncome = []; }
  }

  filterYatrisForIncome() {
    if (!this.yatriSearchForIncome) { this.filteredYatrisForIncome = []; return; }
    const q = this.yatriSearchForIncome.toLowerCase();
    this.filteredYatrisForIncome = this.yatris.filter(y => {
      const matchesSearch = y.name.toLowerCase().includes(q) || y.id.toLowerCase().includes(q);
      const matchesPackage = !this.selectedPackageId || y.packageId === this.selectedPackageId;
      return matchesSearch && matchesPackage;
    });
  }

  selectYatriForIncome(y: any) {
    this.selectedYatriForIncome = y;
    this.newIncome.receivedFrom = y.name;
    this.newIncome.yatriId = y.id;
    this.unifiedFinance.party = y.name;
    this.unifiedFinance.yatriId = y.id;
    this.showYatriIncomeDropdown = false;
  }

  openFinanceModal() {
    this.newIncome = { id: 'inc-' + Date.now(), receivedFrom: '', type: 'Donation', amount: 0, mode: 'UPI', date: new Date().toISOString().split('T')[0], description: '', yatriId: '' };
    this.selectedYatriForIncome = null;
    this.showYatriIncomeDropdown = false;
    this.yatriSearchForIncome = '';
    this.incomeSourceType = 'external';
    this.externalDonor = { name: '', phone: '', address: '', city: '' };
    this.showFinanceModal = true;
  }

  addIncome() {
    // ── Validation by source type ──
    if (this.incomeSourceType === 'yatri') {
      if (!this.selectedYatriForIncome) {
        this.showValidation('⚠️ कृपया Yatri Member निवडा.');
        return;
      }
      this.newIncome.receivedFrom = this.selectedYatriForIncome.name;
      this.newIncome.yatriId = this.selectedYatriForIncome.id;
    } else {
      // External Donor
      if (!this.externalDonor.name || !this.externalDonor.name.trim()) {
        this.showValidation('⚠️ कृपया Donor चे नाव लिहा.');
        return;
      }
      if (this.externalDonor.phone && !this.isValidPhone(this.externalDonor.phone)) {
        this.showValidation('⚠️ Phone Number चुकीचे आहे. 10-अंकी भारतीय नंबर लिहा.');
        return;
      }
      // Build a descriptive name: "Name, City (Phone)"
      let donorLabel = this.externalDonor.name.trim();
      if (this.externalDonor.city) donorLabel += ', ' + this.externalDonor.city.trim();
      if (this.externalDonor.phone) donorLabel += ' (' + this.externalDonor.phone.trim() + ')';
      this.newIncome.receivedFrom = donorLabel;
      this.newIncome.yatriId = null;
    }

    if (!this.isValidAmount(this.newIncome.amount)) {
      this.showValidation('⚠️ Amount रकमेत फक्त अंक लिहा आणि ती 0 पेक्षा जास्त असावी.');
      return;
    }
    if (!this.newIncome.date) {
      this.showValidation('⚠️ कृपया Date निवडा.');
      return;
    }

    // Build description with donor details for External
    let finalDescription = this.newIncome.description || '';
    if (this.incomeSourceType === 'external') {
      const parts: string[] = [];
      if (this.externalDonor.address) parts.push('Address: ' + this.externalDonor.address.trim());
      if (this.externalDonor.city) parts.push('City: ' + this.externalDonor.city.trim());
      if (parts.length > 0) {
        finalDescription = (finalDescription ? finalDescription + ' | ' : '') + parts.join(', ');
      }
    }

    const donorPhone = this.incomeSourceType === 'external' ? (this.externalDonor.phone || '') : (this.selectedYatriForIncome?.phone || '');

    const payload = {
      id: 'inc-' + Date.now(),
      packageId: this.currentPackageId,
      type: this.newIncome.type || 'Donation',
      receivedFrom: this.newIncome.receivedFrom.trim(),
      amount: Number(this.newIncome.amount),
      date: this.newIncome.date,
      mode: this.newIncome.mode || 'UPI',
      description: finalDescription,
      linkedYatriId: this.incomeSourceType === 'yatri' ? (this.newIncome.yatriId || null) : null
    };
    this.api.create('Incomes', payload).subscribe({
      next: () => {
        this.showFinanceModal = false;
        this.loadData();
        this.openThankYouModal(payload, donorPhone);
      },
      error: (err) => {
        console.error('Error adding income', err);
        this.showValidation('❌ Income save करताना error: ' + (err.error?.detail || err.error?.title || err.message || 'Server Error'));
      }
    });
  }

  setTab(tab: string) {
    this.activeTab = tab;
    if (tab !== 'scanner') {
      this.stopCamera();
    }
  }

  openEditAnnouncement(ann: any, event?: Event) {
    if (event) event.stopPropagation();
    this.isEditAnnouncement = true;
    this.newAnnouncement = {
      id: ann.id,
      title: ann.title || '',
      content: ann.content || '',
      priority: ann.priority || 'Normal',
      packageId: ann.packageId || null
    };
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {}
  }

  cancelEditAnnouncement() {
    this.isEditAnnouncement = false;
    this.newAnnouncement = { id: null, title: '', content: '', priority: 'Normal', packageId: null };
  }

  addAnnouncement() {
    if (!this.newAnnouncement.title || !this.newAnnouncement.content) {
      this.showValidation('⚠️ कृपया शीर्षक आणि मजकूर (Title and Content) दोन्ही लिहा.');
      return;
    }

    const targetPkg = (this.selectedPackageId && this.selectedPackageId !== 'all')
      ? this.selectedPackageId
      : (this.newAnnouncement.packageId || this.packages[0]?.id || null);

    const numericPkgId = targetPkg && !isNaN(Number(targetPkg)) ? Number(targetPkg) : null;

    const payload = {
      id: (this.isEditAnnouncement && this.newAnnouncement.id && !isNaN(Number(this.newAnnouncement.id))) ? Number(this.newAnnouncement.id) : 0,
      packageId: numericPkgId,
      title: this.newAnnouncement.title.toString().trim(),
      content: this.newAnnouncement.content.toString().trim(),
      time: new Date().toISOString(),
      priority: this.newAnnouncement.priority || 'Normal'
    };

    if (this.isEditAnnouncement && this.newAnnouncement.id) {
      const annId = this.newAnnouncement.id;
      if (!isNaN(Number(annId))) {
        this.api.update('Announcements', Number(annId), payload).subscribe({
          next: () => {
            this.cancelEditAnnouncement();
            this.loadData();
          },
          error: (err) => {
            console.error('Error updating announcement', err);
            const idx = this.announcements.findIndex(a => String(a.id) === String(annId));
            if (idx >= 0) {
              this.announcements[idx] = { ...this.announcements[idx], ...payload };
            }
            this.cancelEditAnnouncement();
          }
        });
      } else {
        const idx = this.announcements.findIndex(a => String(a.id) === String(annId));
        if (idx >= 0) {
          this.announcements[idx] = { ...this.announcements[idx], ...payload };
        }
        this.cancelEditAnnouncement();
      }
    } else {
      this.api.create('Announcements', payload).subscribe({
        next: (created: any) => {
          this.cancelEditAnnouncement();
          this.loadData();
        },
        error: (err) => {
          console.error('Error adding announcement', err);
          const localObj = { ...payload, id: 'ann-' + Date.now() };
          this.announcements.unshift(localObj);
          this.cancelEditAnnouncement();
        }
      });
    }
  }

  openAnnounceDeleteConfirm(ann: any, event?: Event) {
    if (event) event.stopPropagation();
    this.announcementToDelete = ann;
    this.showAnnounceDeleteConfirm = true;
  }

  confirmDeleteAnnouncement() {
    if (!this.announcementToDelete) return;
    const annId = this.announcementToDelete.id;
    this.showAnnounceDeleteConfirm = false;
    this.announcementToDelete = null;

    // 1. Remove from in-memory array
    this.announcements = this.announcements.filter(a => String(a.id) !== String(annId));

    // 2. Remove from localStorage cache
    try {
      const cached = localStorage.getItem('api_cache_Announcements');
      if (cached) {
        const list = JSON.parse(cached);
        const updated = list.filter((a: any) => String(a.id) !== String(annId));
        localStorage.setItem('api_cache_Announcements', JSON.stringify(updated));
      }
    } catch (e) {}

    // 3. Delete from Backend API
    if (annId !== null && annId !== undefined) {
      const targetId = !isNaN(Number(annId)) ? Number(annId) : annId;
      this.api.delete('Announcements', targetId).subscribe({
        next: () => console.log('Announcement deleted from DB successfully'),
        error: (err) => console.error('Error deleting announcement from backend', err)
      });
    }
  }

  deleteAnnouncementDirect(ann: any, event?: Event) {
    if (event) event.stopPropagation();
    if (confirm(`तुम्ही नक्की "${ann.title}" हे Announcement डिलीट करू इच्छिता का?`)) {
      const annId = ann.id;

      // 1. Remove from in-memory array
      this.announcements = this.announcements.filter(a => String(a.id) !== String(annId));

      // 2. Remove from localStorage cache
      try {
        const cached = localStorage.getItem('api_cache_Announcements');
        if (cached) {
          const list = JSON.parse(cached);
          const updated = list.filter((a: any) => String(a.id) !== String(annId));
          localStorage.setItem('api_cache_Announcements', JSON.stringify(updated));
        }
      } catch (e) {}

      // 3. Delete from Backend API
      if (annId !== null && annId !== undefined) {
        const targetId = !isNaN(Number(annId)) ? Number(annId) : annId;
        this.api.delete('Announcements', targetId).subscribe({
          next: () => console.log('Announcement deleted from DB successfully'),
          error: (err) => console.error('Error deleting announcement from backend', err)
        });
      }
    }
  }

  getSelectedPackageName(): string {
    if (!this.selectedPackageId) return 'All Active Tour Packages';
    const pkg = (this.packages || []).find((p: any) => String(p.id) === String(this.selectedPackageId));
    return pkg ? (pkg.name || pkg.packageName || 'Active Package') : 'Active Package';
  }

  // ── Prasadam Tracker Methods ──

  // Helper: get attendance key unique per yatri+meal+date (for duplicate detection)
  getPrasadamKey(yatriId: any, mealCp: string, dateStr: string): string {
    return `${String(yatriId).toLowerCase()}|${mealCp.toLowerCase()}|${dateStr}`;
  }

  // Helper: Get taken yatri IDs for a specific meal and date
  private getTakenYatriIds(mealCp: string, dateStr: string): Set<string> {
    return new Set(
      (this.yatriAttendances || [])
        .filter(a => {
          const matchMeal = a.checkpointName === mealCp ||
            (a.checkpointName && a.checkpointName.toLowerCase().includes(this.prasadamMeal.toLowerCase()));
          if (!matchMeal) return false;
          if (!dateStr) return true;
          const attDate = a.timestamp ? a.timestamp.split('T')[0] : (a.date || '');
          return !attDate || attDate === dateStr;
        })
        .map(a => String(a.yatriId).toLowerCase())
    );
  }

  get prasadamTakenYatris(): any[] {
    const mealCp = this.prasadamCheckpoints[this.prasadamMeal] || 'Meal-' + this.prasadamMeal;
    const takenYatriIds = this.getTakenYatriIds(mealCp, this.prasadamDate);
    let list = this.allowedYatris.filter(y => takenYatriIds.has(String(y.id).toLowerCase()));

    if (this.prasadamSearchQuery) {
      const q = this.prasadamSearchQuery.toLowerCase().trim();
      list = list.filter(y => y.name?.toLowerCase().includes(q) || String(y.id).toLowerCase().includes(q) || y.phone?.includes(q));
    }
    return list;
  }

  get prasadamPendingYatris(): any[] {
    const mealCp = this.prasadamCheckpoints[this.prasadamMeal] || 'Meal-' + this.prasadamMeal;
    const takenYatriIds = this.getTakenYatriIds(mealCp, this.prasadamDate);
    let list = this.allowedYatris.filter(y => !takenYatriIds.has(String(y.id).toLowerCase()));

    if (this.prasadamSearchQuery) {
      const q = this.prasadamSearchQuery.toLowerCase().trim();
      list = list.filter(y => y.name?.toLowerCase().includes(q) || String(y.id).toLowerCase().includes(q) || y.phone?.includes(q));
    }
    return list;
  }

  markPrasadamServed(yatri: any, mealName?: string) {
    const meal = mealName || this.prasadamMeal;
    const mealCp = this.prasadamCheckpoints[meal] || 'Meal-' + meal;
    const dateStr = this.prasadamDate;

    // ✅ DUPLICATE PREVENTION: Check if already marked for this meal & date
    const alreadyTaken = (this.yatriAttendances || []).some(a => {
      const matchMeal = a.checkpointName === mealCp ||
        (a.checkpointName && a.checkpointName.toLowerCase().includes(meal.toLowerCase()));
      if (!matchMeal) return false;
      if (String(a.yatriId).toLowerCase() !== String(yatri.id).toLowerCase()) return false;
      if (!dateStr) return true;
      const attDate = a.timestamp ? a.timestamp.split('T')[0] : (a.date || '');
      return !attDate || attDate === dateStr;
    });

    if (alreadyTaken) {
      console.warn('Prasadam already marked for this member today:', yatri.name);
      return; // Block duplicate entry
    }

    // ✅ BUTTON LOCK: Prevent double-click with in-progress guard
    const lockKey = this.getPrasadamKey(yatri.id, mealCp, dateStr);
    if (this.prasadamMarkingInProgress.has(lockKey)) return;
    this.prasadamMarkingInProgress.add(lockKey);

    const numericChkId = this.getCheckpointNumericId(mealCp);
    const timestamp = dateStr
      ? new Date(dateStr + 'T' + new Date().toTimeString().slice(0, 8)).toISOString()
      : new Date().toISOString();

    const payload = {
      id: 0,
      yatriId: isNaN(Number(yatri.id)) ? yatri.id : Number(yatri.id),
      checkpointId: numericChkId,
      checkpointName: mealCp,
      timestamp,
      status: 'Checked-In'
    };

    // Optimistic local add (with temp id)
    const tempId = 'att-' + Date.now();
    const localAttendance = { ...payload, id: tempId, yatriId: yatri.id };
    this.yatriAttendances = [...this.yatriAttendances, localAttendance];

    this.api.create('YatriAttendances', payload).subscribe({
      next: (saved: any) => {
        // Replace temp record with real DB record
        this.yatriAttendances = this.yatriAttendances.map(a =>
          String(a.id) === tempId ? { ...a, id: saved?.id || a.id } : a
        );
        console.log('Prasadam marked in DB for date:', dateStr);
        this.prasadamMarkingInProgress.delete(lockKey);
      },
      error: (err) => {
        console.error('Error marking prasadam in DB', err);
        // Rollback optimistic update on error
        this.yatriAttendances = this.yatriAttendances.filter(a => String(a.id) !== tempId);
        this.prasadamMarkingInProgress.delete(lockKey);
      }
    });
  }

  cancelPrasadamServed(yatri: any, mealName?: string) {
    const meal = mealName || this.prasadamMeal;
    const mealCp = this.prasadamCheckpoints[meal] || 'Meal-' + meal;
    const dateStr = this.prasadamDate;

    // Find the matching attendance record (date-aware)
    const match = (this.yatriAttendances || []).find(a => {
      const matchMeal = a.checkpointName === mealCp ||
        (a.checkpointName && a.checkpointName.toLowerCase().includes(meal.toLowerCase()));
      if (!matchMeal) return false;
      if (String(a.yatriId).toLowerCase() !== String(yatri.id).toLowerCase()) return false;
      if (!dateStr) return true;
      const attDate = a.timestamp ? a.timestamp.split('T')[0] : (a.date || '');
      return !attDate || attDate === dateStr;
    });

    if (match) {
      const attId = match.id;
      this.yatriAttendances = this.yatriAttendances.filter(a => String(a.id) !== String(attId));

      if (attId && !String(attId).startsWith('att-') && !isNaN(Number(attId))) {
        this.api.delete('YatriAttendances', Number(attId)).subscribe({
          next: () => console.log('Prasadam attendance canceled in DB'),
          error: (err) => console.error('Error canceling prasadam attendance', err)
        });
      }
    }
  }

  // ── Medical Incidents CRUD Methods ──
  get searchFilteredIncidents(): any[] {
    let list = this.filteredIncidents || [];
    if (this.medicalSearchQuery) {
      const q = this.medicalSearchQuery.toLowerCase().trim();
      list = list.filter(m => 
        (m.yatriName && m.yatriName.toLowerCase().includes(q)) ||
        (m.symptoms && m.symptoms.toLowerCase().includes(q)) ||
        (m.treatment && m.treatment.toLowerCase().includes(q)) ||
        (m.doctorName && m.doctorName.toLowerCase().includes(q)) ||
        (m.status && m.status.toLowerCase().includes(q))
      );
    }
    return list;
  }

  openAddMedicalModal() {
    this.isEditMedical = false;
    this.selectedYatriForMedical = null;
    this.newMedical = {
      id: 0,
      packageId: this.currentPackageId ? (isNaN(Number(this.currentPackageId)) ? null : Number(this.currentPackageId)) : null,
      yatriId: null,
      yatriName: '',
      symptoms: '',
      treatment: '',
      doctorName: '',
      status: 'Under Care',
      date: new Date().toISOString().split('T')[0]
    };
    this.yatriSearchForMedical = '';
    this.filteredYatrisForMedical = [];
    this.showMedicalYatriDropdown = false;
    this.showMedicalModal = true;
  }

  openEditMedicalModal(med: any, event?: Event) {
    if (event) event.stopPropagation();
    this.isEditMedical = true;
    this.selectedYatriForMedical = this.yatris.find(y => String(y.id) === String(med.yatriId)) || null;
    this.newMedical = {
      id: med.id,
      packageId: med.packageId || (this.currentPackageId ? Number(this.currentPackageId) : null),
      yatriId: med.yatriId || null,
      yatriName: med.yatriName || '',
      symptoms: med.symptoms || '',
      treatment: med.treatment || '',
      doctorName: med.doctorName || '',
      status: med.status || 'Under Care',
      date: med.date || new Date().toISOString().split('T')[0]
    };
    this.yatriSearchForMedical = med.yatriName || '';
    this.filteredYatrisForMedical = [];
    this.showMedicalYatriDropdown = false;
    this.showMedicalModal = true;
  }

  toggleMedicalYatriDropdown() {
    this.showMedicalYatriDropdown = !this.showMedicalYatriDropdown;
    if (this.showMedicalYatriDropdown) { this.yatriSearchForMedical = ''; this.filteredYatrisForMedical = []; }
  }

  filterYatrisForMedical() {
    if (!this.yatriSearchForMedical) { this.filteredYatrisForMedical = []; return; }
    const q = this.yatriSearchForMedical.toLowerCase();
    this.filteredYatrisForMedical = this.allowedYatris.filter(y => y.name?.toLowerCase().includes(q) || String(y.id).toLowerCase().includes(q));
  }

  selectYatriForMedical(y: any) {
    this.selectedYatriForMedical = y;
    this.newMedical.yatriId = isNaN(Number(y.id)) ? y.id : Number(y.id);
    this.newMedical.yatriName = y.name;
    this.showMedicalYatriDropdown = false;
  }

  saveMedicalIncident() {
    if (!this.newMedical.yatriName || !this.newMedical.yatriName.trim()) {
      this.showValidation('⚠️ कृपया Yatri Member चे नाव निवडा किंवा लिहा.');
      return;
    }
    if (!this.newMedical.symptoms || !this.newMedical.symptoms.trim()) {
      this.showValidation('⚠️ कृपया वैद्यकीय अडचण / समस्या (Symptoms / Problem) लिहा.');
      return;
    }

    const payload = {
      id: (this.isEditMedical && this.newMedical.id && !isNaN(Number(this.newMedical.id))) ? Number(this.newMedical.id) : 0,
      packageId: this.newMedical.packageId ? (isNaN(Number(this.newMedical.packageId)) ? null : Number(this.newMedical.packageId)) : null,
      yatriId: this.newMedical.yatriId ? (isNaN(Number(this.newMedical.yatriId)) ? null : Number(this.newMedical.yatriId)) : null,
      yatriName: this.newMedical.yatriName.trim(),
      symptoms: this.newMedical.symptoms.trim(),
      treatment: this.newMedical.treatment ? this.newMedical.treatment.trim() : 'First Aid Given',
      doctorName: this.newMedical.doctorName ? this.newMedical.doctorName.trim() : 'Yatra Medical Team',
      status: this.newMedical.status || 'Under Care',
      date: this.newMedical.date || new Date().toISOString().split('T')[0]
    };

    if (this.isEditMedical && this.newMedical.id) {
      const medId = this.newMedical.id;
      const idx = this.incidents.findIndex(m => String(m.id) === String(medId));
      if (idx >= 0) this.incidents[idx] = { ...this.incidents[idx], ...payload };

      if (!isNaN(Number(medId))) {
        this.api.update('MedicalIncidents', Number(medId), payload).subscribe({
          next: () => console.log('Medical incident updated in DB'),
          error: (err) => console.error('Error updating medical incident in DB', err)
        });
      }
    } else {
      const localObj = { ...payload, id: 'med-' + Date.now() };
      this.incidents.unshift(localObj);

      this.api.create('MedicalIncidents', payload).subscribe({
        next: (created: any) => console.log('Medical incident created in DB'),
        error: (err) => console.error('Error creating medical incident in DB', err)
      });
    }

    this.showMedicalModal = false;
  }

  deleteMedicalDirect(med: any, event?: Event) {
    if (event) event.stopPropagation();
    if (confirm(`तुम्ही नक्की "${med.yatriName}" यांची वैद्यकीय तक्रार डिलीट करू इच्छिता का?`)) {
      const medId = med.id;
      this.incidents = this.incidents.filter(m => String(m.id) !== String(medId));

      if (medId !== null && medId !== undefined && !isNaN(Number(medId))) {
        this.api.delete('MedicalIncidents', Number(medId)).subscribe({
          next: () => console.log('Medical incident deleted from DB'),
          error: (err) => console.error('Error deleting medical incident', err)
        });
      }
    }
  }

  sendMedicalWhatsApp(med: any) {
    const yatri = this.yatris.find(y => String(y.id) === String(med.yatriId));
    const phone = yatri?.phone || '';
    if (!phone || !this.isValidPhone(phone)) {
      this.showValidation('⚠️ Yatri मोबाईल नंबर उपलब्ध नाही किंवा अवैध आहे.');
      return;
    }

    const message = `*🏥 ISCON Yatra Medical Care Update*\n\n` +
      `प्रिय *${med.yatriName}* जी / नातेवाईक,\n` +
      `आपल्या वैद्यकीय सेवेचा तपशील खालीलप्रमाणे आहे:\n\n` +
      `• *आरोग्य अडचण (Symptoms):* ${med.symptoms}\n` +
      `• *दिलेले उपचार (Treatment):* ${med.treatment}\n` +
      `• *उपचार करणारे डॉक्टर:* ${med.doctorName}\n` +
      `• *सध्याची स्थिती:* ${med.status}\n` +
      `• *तारीख:* ${med.date}\n\n` +
      `भगवंताच्या कृपेने आपण लवकर पूर्णपणे बरे व्हावे हीच प्रार्थना! 🌸\n- ISCON Yatra Medical Team`;

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    const url = `https://api.whatsapp.com/send?phone=${phoneWithCountry}&text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  // ── Lost & Found CRUD Methods ──
  get searchFilteredLostItems(): any[] {
    let list = this.lostItems || [];

    if (this.lostCategoryFilter && this.lostCategoryFilter !== 'All') {
      const targetCat = this.lostCategoryFilter.toLowerCase().trim();
      list = list.filter(item => (item.category || '').toLowerCase().includes(targetCat) || targetCat.includes((item.category || '').toLowerCase()));
    }

    if (this.lostStatusFilter && this.lostStatusFilter !== 'All') {
      list = list.filter(item => item.status === this.lostStatusFilter);
    }

    if (this.lostSearchQuery) {
      const q = this.lostSearchQuery.toLowerCase().trim();
      list = list.filter(item => 
        (item.itemName && item.itemName.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.location && item.location.toLowerCase().includes(q)) ||
        (item.yatriName && item.yatriName.toLowerCase().includes(q)) ||
        (item.claimedBy && item.claimedBy.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q))
      );
    }
    return list;
  }

  openAddLostModal() {
    this.isEditLost = false;
    this.selectedYatriForLost = null;
    this.newLostItem = {
      id: 0,
      itemName: '',
      description: '',
      category: 'Gold (सोने)',
      status: 'Lost',
      reportedDate: new Date().toISOString().split('T')[0],
      location: '',
      yatriId: null,
      yatriName: '',
      yatriPhone: '',
      claimedBy: ''
    };
    this.yatriSearchForLost = '';
    this.filteredYatrisForLost = [];
    this.showLostYatriDropdown = false;
    this.showLostModal = true;
  }

  openEditLostModal(item: any, event?: Event) {
    if (event) event.stopPropagation();
    this.isEditLost = true;
    this.selectedYatriForLost = this.yatris.find(y => String(y.id) === String(item.yatriId)) || null;
    this.newLostItem = {
      id: item.id,
      itemName: item.itemName || '',
      description: item.description || '',
      category: item.category || 'Gold (सोने)',
      status: item.status || 'Lost',
      reportedDate: item.reportedDate || new Date().toISOString().split('T')[0],
      location: item.location || '',
      yatriId: item.yatriId || null,
      yatriName: item.yatriName || '',
      yatriPhone: item.yatriPhone || '',
      claimedBy: item.claimedBy || ''
    };
    this.yatriSearchForLost = item.yatriName || '';
    this.filteredYatrisForLost = [];
    this.showLostYatriDropdown = false;
    this.showLostModal = true;
  }

  toggleLostYatriDropdown() {
    this.showLostYatriDropdown = !this.showLostYatriDropdown;
    if (this.showLostYatriDropdown) { this.yatriSearchForLost = ''; this.filteredYatrisForLost = []; }
  }

  filterYatrisForLost() {
    if (!this.yatriSearchForLost) { this.filteredYatrisForLost = []; return; }
    const q = this.yatriSearchForLost.toLowerCase();
    this.filteredYatrisForLost = this.allowedYatris.filter(y => y.name?.toLowerCase().includes(q) || String(y.id).toLowerCase().includes(q));
  }

  selectYatriForLost(y: any) {
    this.selectedYatriForLost = y;
    this.newLostItem.yatriId = isNaN(Number(y.id)) ? y.id : Number(y.id);
    this.newLostItem.yatriName = y.name;
    this.newLostItem.yatriPhone = y.phone || '';
    this.showLostYatriDropdown = false;
  }

  saveLostItem() {
    if (!this.newLostItem.itemName || !this.newLostItem.itemName.trim()) {
      this.showValidation('⚠️ कृपया वस्तूचे नाव (Item Name) लिहा.');
      return;
    }

    const payload = {
      id: (this.isEditLost && this.newLostItem.id && !isNaN(Number(this.newLostItem.id))) ? Number(this.newLostItem.id) : 0,
      itemName: this.newLostItem.itemName.trim(),
      description: this.newLostItem.description ? this.newLostItem.description.trim() : '',
      category: this.newLostItem.category || 'Other (इतर)',
      yatriId: this.newLostItem.yatriId ? (isNaN(Number(this.newLostItem.yatriId)) ? null : Number(this.newLostItem.yatriId)) : null,
      yatriName: this.newLostItem.yatriName ? this.newLostItem.yatriName.trim() : 'Unknown Owner',
      yatriPhone: this.newLostItem.yatriPhone ? this.newLostItem.yatriPhone.trim() : '',
      status: this.newLostItem.status || 'Lost',
      reportedDate: this.newLostItem.reportedDate || new Date().toISOString().split('T')[0],
      location: this.newLostItem.location ? this.newLostItem.location.trim() : 'Yatra Spot',
      claimedBy: this.newLostItem.claimedBy ? this.newLostItem.claimedBy.trim() : ''
    };

    if (this.isEditLost && this.newLostItem.id) {
      const lostId = this.newLostItem.id;
      const idx = this.lostItems.findIndex(l => String(l.id) === String(lostId));
      if (idx >= 0) this.lostItems[idx] = { ...this.lostItems[idx], ...payload };

      if (!isNaN(Number(lostId))) {
        this.api.update('LostAndFounds', Number(lostId), payload).subscribe({
          next: () => console.log('Lost item updated in DB'),
          error: (err) => console.error('Error updating lost item in DB', err)
        });
      }
    } else {
      const localObj = { ...payload, id: 'lf-' + Date.now() };
      this.lostItems.unshift(localObj);

      this.api.create('LostAndFounds', payload).subscribe({
        next: (created: any) => console.log('Lost item created in DB'),
        error: (err) => console.error('Error creating lost item in DB', err)
      });
    }

    this.showLostModal = false;
  }

  openReturnModal(item: any, event?: Event) {
    if (event) event.stopPropagation();
    this.returningLostItem = item;
    this.returnReceiverName = item.yatriName || item.claimedBy || '';
    this.returnReceiverPhone = item.yatriPhone || '';
    this.showReturnModal = true;
  }

  saveReturnItem() {
    if (!this.returnReceiverName || !this.returnReceiverName.trim()) {
      this.showValidation('⚠️ कृपया वस्तू स्वीकारणाऱ्याचे नाव लिहा.');
      return;
    }
    if (!this.returningLostItem) return;

    const lostId = this.returningLostItem.id;
    const claimedByStr = this.returnReceiverPhone 
      ? `${this.returnReceiverName.trim()} (${this.returnReceiverPhone.trim()})`
      : this.returnReceiverName.trim();

    const updatedItem = {
      ...this.returningLostItem,
      status: 'Returned',
      claimedBy: claimedByStr
    };

    const idx = this.lostItems.findIndex(l => String(l.id) === String(lostId));
    if (idx >= 0) this.lostItems[idx] = updatedItem;

    if (lostId && !isNaN(Number(lostId))) {
      const payload = {
        ...updatedItem,
        id: Number(lostId)
      };
      this.api.update('LostAndFounds', Number(lostId), payload).subscribe({
        next: () => console.log('Lost item status marked Returned in DB'),
        error: (err) => console.error('Error updating return status in DB', err)
      });
    }

    this.showReturnModal = false;
    this.returningLostItem = null;
  }

  deleteLostDirect(item: any, event?: Event) {
    if (event) event.stopPropagation();
    if (confirm(`तुम्ही नक्की "${item.itemName}" या वस्तूची नोंद डिलीट करू इच्छिता का?`)) {
      const lostId = item.id;
      this.lostItems = this.lostItems.filter(l => String(l.id) !== String(lostId));

      if (lostId !== null && lostId !== undefined && !isNaN(Number(lostId))) {
        this.api.delete('LostAndFounds', Number(lostId)).subscribe({
          next: () => console.log('Lost item deleted from DB'),
          error: (err) => console.error('Error deleting lost item', err)
        });
      }
    }
  }

  addLostItem() {
    if (!this.newLostItem.itemName) return;
    const payload = {
      id: 'lf-' + Date.now(),
      itemName: this.newLostItem.itemName,
      description: this.newLostItem.description || '',
      category: this.newLostItem.category || 'Valuables',
      status: this.newLostItem.status || 'Lost',
      reportedDate: this.newLostItem.reportedDate || new Date().toISOString().split('T')[0],
      location: this.newLostItem.location || '',
      yatriId: null,
      yatriName: 'Unknown',
      yatriPhone: '',
      claimedBy: ''
    };
    this.api.create('LostAndFounds', payload).subscribe({
      next: () => { this.newLostItem = { itemName: '', description: '', category: 'Valuables', status: 'Lost', reportedDate: '', location: '' }; this.loadData(); },
      error: (err) => {
        console.error('Error adding lost item', err);
        alert('Lost Item नोंदवताना त्रुटी आली: ' + (err.error?.detail || err.error?.title || err.message || 'Server Error'));
      }
    });
  }

  openVolunteerModal() {
    this.isEditVolunteer = false;
    this.newVolunteer = {
      id: 'vol-' + Date.now(),
      packageId: this.currentPackageId,
      name: '',
      phone: '',
      advanceAmount: 0,
      assignedDepartment: 'Food',
      shift: 'Morning (6 AM - 2 PM)',
      dutyLocation: '',
      status: 'On Duty',
      yatriId: null
    };
    this.yatriSearchQuery = '';
    this.filteredYatris = [];
    this.selectedYatriForVolunteer = null;
    this.showYatriDropdown = false;
    this.showVolunteerModal = true;
  }

  openEditVolunteerModal(vol: any, event: Event) {
    event.stopPropagation();
    this.isEditVolunteer = true;
    this.selectedYatriForVolunteer = this.yatris.find(y => y.id === vol.yatriId || y.phone === vol.phone) || null;
    this.newVolunteer = {
      id: vol.id,
      packageId: vol.packageId || this.currentPackageId,
      name: vol.name,
      phone: vol.phone,
      advanceAmount: this.volunteerAdvances[vol.id] || vol.advanceAmount || 0,
      assignedDepartment: vol.assignedDepartment || 'Food',
      shift: vol.shift || 'Morning (6 AM - 2 PM)',
      dutyLocation: vol.dutyLocation || '',
      status: vol.status || 'On Duty',
      yatriId: vol.yatriId || null
    };
    this.yatriSearchQuery = '';
    this.filteredYatris = [];
    this.showYatriDropdown = false;
    this.showVolunteerModal = true;
  }

  filterYatrisForVolunteer() {
    if (!this.yatriSearchQuery) { this.filteredYatris = []; return; }
    const q = this.yatriSearchQuery.toLowerCase();
    this.filteredYatris = this.yatris.filter(y => {
      const matchesSearch = y.name?.toLowerCase().includes(q) || String(y.id).toLowerCase().includes(q);
      const matchesPackage = !this.selectedPackageId || y.packageId === this.selectedPackageId;
      return matchesSearch && matchesPackage;
    });
  }

  toggleYatriDropdown() {
    this.showYatriDropdown = !this.showYatriDropdown;
    if (this.showYatriDropdown) { this.yatriSearchQuery = ''; this.filteredYatris = []; }
  }

  selectYatriFromDropdown(yatri: any) {
    this.selectedYatriForVolunteer = yatri;
    this.newVolunteer.name = yatri.name;
    this.newVolunteer.phone = yatri.phone || '';
    this.newVolunteer.yatriId = yatri.id;
    this.showYatriDropdown = false;
  }

  selectYatriForVolunteer(yatri: any) {
    this.selectedYatriForVolunteer = yatri;
    this.newVolunteer.name = yatri.name;
    this.newVolunteer.phone = yatri.phone || '';
    this.newVolunteer.yatriId = yatri.id;
    this.yatriSearchQuery = yatri.name + ' (' + yatri.id + ')';
    this.filteredYatris = [];
  }

  mapVolunteerDeptToDb(dept: string): string {
    switch (dept) {
      case 'Prasadam Management':
      case 'Food / Prasad':
      case 'Food':
        return 'Food';
      case 'Transport Guide':
      case 'Transport':
        return 'Transport';
      case 'Medical Assistance':
      case 'Medical':
        return 'Medical';
      case 'Ashram Security':
      case 'General':
        return 'General';
      case 'Darshan Coordination':
      case 'Religious':
        return 'Religious';
      case 'Accommodation':
        return 'Accommodation';
      default:
        return dept || 'General';
    }
  }

  addVolunteer() {
    // ── Validation ──
    if (!this.newVolunteer.name || !this.newVolunteer.name.trim()) {
      this.showValidation('⚠️ कृपया Volunteer चे नाव लिहा.');
      return;
    }
    if (this.newVolunteer.phone && !this.isValidPhone(this.newVolunteer.phone)) {
      this.showValidation('⚠️ Phone Number चुकीचे आहे. 10-अंकी भारतीय नंबर लिहा (6-9 ने सुरू होणारा).');
      return;
    }
    if (!this.newVolunteer.assignedDepartment) {
      this.showValidation('⚠️ कृपया Department निवडा.');
      return;
    }
    if (this.newVolunteer.advanceAmount && !this.isValidAmount(this.newVolunteer.advanceAmount) && Number(this.newVolunteer.advanceAmount) !== 0) {
      this.showValidation('⚠️ Advance Amount हे valid संख्या असावी.');
      return;
    }
    const advance = Number(this.newVolunteer.advanceAmount) || 0;
    const deptName = this.newVolunteer.assignedDepartment;
    const matchedDept = this.departments.find(d => (d.name || '').toLowerCase() === (deptName || '').toLowerCase());
    
    const volIdNum = (this.isEditVolunteer && this.newVolunteer.id && !isNaN(Number(this.newVolunteer.id)))
      ? Number(this.newVolunteer.id) : 0;
    const pkgIdNum = (this.selectedPackageId && !isNaN(Number(this.selectedPackageId)))
      ? Number(this.selectedPackageId) : null;
    const deptIdNum = (matchedDept?.id && !isNaN(Number(matchedDept.id)))
      ? Number(matchedDept.id) : null;
    const yatriIdNum = (this.newVolunteer.yatriId && !isNaN(Number(this.newVolunteer.yatriId)))
      ? Number(this.newVolunteer.yatriId) : null;

    const payload = {
      id: volIdNum,
      packageId: pkgIdNum,
      name: this.newVolunteer.name ? this.newVolunteer.name.toString().trim() : '',
      phone: this.newVolunteer.phone ? this.newVolunteer.phone.toString().trim() : '',
      assignedDepartment: this.mapVolunteerDeptToDb(deptName),
      departmentId: deptIdNum,
      shift: this.newVolunteer.shift || 'Morning (6 AM - 2 PM)',
      dutyLocation: this.newVolunteer.dutyLocation || 'Main Temple',
      status: this.newVolunteer.status || 'On Duty',
      yatriId: yatriIdNum,
      advanceAmount: advance
    };

    if (this.isEditVolunteer) {
      this.api.update('Volunteers', payload.id, payload).subscribe({
        next: () => {
          if (advance > 0) {
            this.volunteerAdvances[payload.id] = advance;
          } else {
            delete this.volunteerAdvances[payload.id];
          }
          this.saveAdvanceData();
          this.showVolunteerModal = false;
          this.loadData();
        },
        error: (err) => {
          console.error('Error updating volunteer', err);
          alert('Volunteer बदलताना त्रुटी आली: ' + (err.error?.detail || err.error?.title || err.message || 'Server Error'));
        }
      });
    } else {
      this.api.create('Volunteers', payload).subscribe({
        next: (res: any) => {
          const volId = res?.id || payload.id;
          if (advance > 0 && volId) {
            this.volunteerAdvances[volId] = advance;
            this.saveAdvanceData();
          }
          this.showVolunteerModal = false;
          this.loadData();
        },
        error: (err) => {
          console.error('Error adding volunteer', err);
          alert('Volunteer जोडताना त्रुटी आली: ' + (err.error?.detail || err.error?.title || err.message || 'Server Error'));
        }
      });
    }
  }

  // ── Volunteer Delete Handlers ──
  openVolDeleteConfirm(vol: any, event: Event) {
    event.stopPropagation();
    this.volToDelete = vol;
    this.showVolDeleteConfirm = true;
  }

  confirmDeleteVolunteer() {
    if (!this.volToDelete) return;
    const volId = this.volToDelete.id;

    // 1. Instantly remove from local UI volunteers array and store deleted ID
    this.volunteers = (this.volunteers || []).filter(v => v.id !== volId);
    this.deletedVolIds.add(volId);
    try {
      localStorage.setItem('deleted_vol_ids', JSON.stringify(Array.from(this.deletedVolIds)));
    } catch (e) {}

    delete this.volunteerAdvances[volId];
    this.saveAdvanceData();
    this.showVolDeleteConfirm = false;
    this.volToDelete = null;

    // 2. Execute deletion API call to backend
    this.api.delete('Volunteers', volId).subscribe({
      next: () => {
        // Backend successfully deleted
      },
      error: (err) => {
        console.warn('Volunteer delete API completed/handled:', err);
      }
    });
  }

  // ── Unified Finance Handlers ──
  openUnifiedFinanceModal(type: 'Income' | 'Expense' | 'Transfer' = 'Income') {
    if (this.isEntryLocked) {
      alert('🔒 Selected tour package is locked or completed. Financial entries cannot be added.');
      return;
    }
    if (!this.canViewFinance) {
      type = 'Expense'; // Force Expense for Volunteers
    }
    this.isEditingUnifiedTransaction = false;
    this.editingTransactionRaw = null;
    this.unifiedFinance = {
      kind: type,
      party: '',
      category: type === 'Income' ? 'Payment' : (type === 'Transfer' ? 'Volunteer Advance' : 'Food & Prasadam'),
      amount: null,
      mode: 'UPI',
      date: new Date().toISOString().split('T')[0],
      description: '',
      department: type === 'Transfer' ? 'Volunteer' : 'Food',
      volunteerId: '',
      yatriId: '',
      receiptUrl: ''
    };
    this.selectedYatriForIncome = null;
    this.showYatriIncomeDropdown = false;
    this.yatriSearchForIncome = '';

    if (type === 'Expense') {
      this.expenseItems = [{ item: '', unit: 1, unitPrice: 0 }];
      this.selectedExpenseVol = null;
      this.expenseVolSearch = '';
      this.expenseDeptFilter = '';
      this.showExpenseVolDropdown = false;
    }

    this.showUnifiedFinanceModal = true;
  }

  onUnifiedVolunteerSelect(volId: string) {
    this.unifiedFinance.volunteerId = volId;
    const vol = this.volunteers.find(v => v.id === volId);
    if (vol) {
      this.unifiedFinance.party = vol.name;
    }
  }

  saveUnifiedTransaction() {
    if (this.isEntryLocked) {
      alert('🔒 Selected tour package is locked or completed. Financial entries cannot be saved.');
      return;
    }
    if (!this.canViewFinance && this.unifiedFinance.kind !== 'Expense') {
      this.showValidation('⚠️ Volunteers are only permitted to add Expenses.');
      return;
    }

    if (this.unifiedFinance.kind === 'Transfer' && this.unifiedFinance.volunteerId) {
      const vol = this.volunteers.find((v: any) => v.id === this.unifiedFinance.volunteerId);
      if (vol && !this.unifiedFinance.party) {
        this.unifiedFinance.party = vol.name;
      }
    }

    const amount = this.unifiedFinance.kind === 'Expense' && this.expenseTotal > 0 
      ? this.expenseTotal 
      : Number(this.unifiedFinance.amount);

    if (!this.unifiedFinance.party || !this.unifiedFinance.party.trim()) {
      this.showValidation('⚠️ कृपया Party Name / Volunteer / Vendor हे field भरा.');
      return;
    }
    if (!this.isValidAmount(amount)) {
      this.showValidation('⚠️ Amount रकमेत फक्त अंक लिहा आणि ती 0 पेक्षा जास्त असावी.');
      return;
    }
    if (!this.unifiedFinance.date) {
      this.showValidation('⚠️ कृपया Date निवडा.');
      return;
    }

    if (this.isEditingUnifiedTransaction && this.editingTransactionRaw) {
      const item = this.editingTransactionRaw;
      
      if (item.id && item.id.toString().startsWith('ypay-')) {
        // Yatri Payment Edit
        const payload = {
          id: item.rawId,
          yatriId: this.unifiedFinance.yatriId || item.raw.yatriId,
          amount: amount,
          date: this.unifiedFinance.date,
          time: item.raw.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          method: this.unifiedFinance.mode,
          remarks: this.unifiedFinance.description
        };

        this.api.update('YatriPayments', item.rawId, payload).subscribe({
          next: () => {
            this.isEditingUnifiedTransaction = false;
            this.editingTransactionRaw = null;
            this.showUnifiedFinanceModal = false;
            this.loadData();
          },
          error: (err) => {
            console.error('Error updating Yatri payment', err);
            this.loadData();
          }
        });
      } else if (item.kind === 'Income') {
        // Income Edit
        const payload = {
          id: item.rawId,
          packageId: item.raw.packageId || this.currentPackageId,
          type: this.unifiedFinance.category || 'Payment',
          receivedFrom: this.unifiedFinance.party,
          amount: amount,
          date: this.unifiedFinance.date,
          mode: this.unifiedFinance.mode,
          description: this.unifiedFinance.description,
          linkedYatriId: this.unifiedFinance.yatriId || item.raw.linkedYatriId || null
        };

        this.api.update('Incomes', item.rawId, payload).subscribe({
          next: () => {
            this.isEditingUnifiedTransaction = false;
            this.editingTransactionRaw = null;
            this.showUnifiedFinanceModal = false;
            this.loadData();
          },
          error: (err) => {
            console.error('Error updating income', err);
            this.loadData();
          }
        });
      } else if (item.kind === 'Transfer') {
        // Volunteer Advance Transfer Edit
        const vol = this.volunteers.find(v => v.id === this.unifiedFinance.volunteerId);
        const volName = vol ? vol.name : this.unifiedFinance.party;

        const payload = {
          id: item.rawId,
          packageId: item.raw.packageId || this.currentPackageId,
          vendor: volName,
          paidTo: volName,
          department: 'Volunteer',
          category: 'Volunteer Advance',
          type: 'advance',
          status: 'Approved',
          amount: amount,
          mode: this.unifiedFinance.mode || 'Cash',
          date: this.unifiedFinance.date,
          description: 'Volunteer Advance: ' + (this.unifiedFinance.description || ''),
          volunteerId: this.unifiedFinance.volunteerId || null
        };

        this.api.update('Expenses', item.rawId, payload).subscribe({
          next: () => {
            this.isEditingUnifiedTransaction = false;
            this.editingTransactionRaw = null;
            this.showUnifiedFinanceModal = false;
            this.loadData();
          },
          error: (err) => {
            console.error('Error updating advance transfer', err);
            this.loadData();
          }
        });
      } else {
        // Expense Edit
        const dbDept = this.mapCategoryToDbDepartment(this.unifiedFinance.category);
        const payload = {
          id: item.rawId,
          packageId: item.raw.packageId || this.currentPackageId,
          vendor: this.unifiedFinance.party,
          paidTo: this.unifiedFinance.party,
          department: dbDept,
          category: this.unifiedFinance.category || 'General',
          type: 'expense',
          status: 'Approved',
          amount: amount,
          mode: this.unifiedFinance.mode || 'Cash',
          date: this.unifiedFinance.date,
          description: JSON.stringify({
            remarks: this.unifiedFinance.description || 'Expense details',
            items: this.expenseItems.filter((it: any) => it.item && it.item.trim() !== ''),
            approvedBy: ''
          }),
          volunteerId: this.unifiedFinance.volunteerId || null,
          receiptUrl: this.unifiedFinance.receiptUrl || null
        };

        this.api.update('Expenses', item.rawId, payload).subscribe({
          next: () => {
            this.isEditingUnifiedTransaction = false;
            this.editingTransactionRaw = null;
            this.showUnifiedFinanceModal = false;
            this.loadData();
          },
          error: (err) => {
            console.error('Error updating expense', err);
            this.loadData();
          }
        });
      }
      return;
    }

    if (this.unifiedFinance.kind === 'Income') {
      const pkgId = (this.selectedPackageId && this.selectedPackageId !== 'all') 
        ? Number(this.selectedPackageId) 
        : (this.currentPackageId ? Number(this.currentPackageId) : null);
      const linkedYatriIdNum = this.unifiedFinance.yatriId ? Number(this.unifiedFinance.yatriId) : null;

      const payload = {
        id: 0,
        packageId: pkgId,
        type: this.unifiedFinance.category || 'Payment',
        receivedFrom: this.unifiedFinance.party ? this.unifiedFinance.party.trim() : 'General Income',
        amount: amount,
        date: this.unifiedFinance.date || new Date().toISOString().split('T')[0],
        mode: this.unifiedFinance.mode || 'UPI',
        description: this.unifiedFinance.description || '',
        linkedYatriId: linkedYatriIdNum
      };

      // Optimistically insert locally
      this.incomes.unshift(payload);
      this.showUnifiedFinanceModal = false;
      this.openThankYouModal(payload);

      // If linked to a Yatri, create YatriPayment record and update Yatri balance
      if (this.unifiedFinance.yatriId) {
        const yatriId = Number(this.unifiedFinance.yatriId);
        const paymentPayload = {
          yatriId: yatriId,
          amount: amount,
          date: this.unifiedFinance.date || new Date().toISOString().split('T')[0],
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          method: this.unifiedFinance.mode || 'UPI',
          remarks: this.unifiedFinance.description || 'Income Installment'
        };
        this.api.create('YatriPayments', paymentPayload).subscribe();

        const targetYatri = this.yatris.find(y => String(y.id) === String(yatriId));
        if (targetYatri) {
          const newAmountPaid = Number(targetYatri.amountPaid || 0) + amount;
          const totalAmt = Number(targetYatri.totalAmount || 0);
          const status = newAmountPaid >= totalAmt ? 'Paid' : (newAmountPaid > 0 ? 'Partial' : 'Pending');
          targetYatri.amountPaid = newAmountPaid;
          targetYatri.paymentStatus = status;
          this.api.update('Yatris', targetYatri.id, { ...targetYatri, amountPaid: newAmountPaid, paymentStatus: status }).subscribe();
        }
      }

      this.api.create('Incomes', payload).subscribe({
        next: () => { this.loadData(); },
        error: (err) => {
          console.error('Error adding income', err);
          this.loadData();
        }
      });
    } else if (this.unifiedFinance.kind === 'Transfer') {
      const vol = this.volunteers.find(v => String(v.id) === String(this.unifiedFinance.volunteerId));
      const volName = vol ? vol.name : this.unifiedFinance.party;
      const pkgId = (this.selectedPackageId && this.selectedPackageId !== 'all') 
        ? Number(this.selectedPackageId) 
        : (this.currentPackageId ? Number(this.currentPackageId) : null);
      const volIdNum = this.unifiedFinance.volunteerId ? Number(this.unifiedFinance.volunteerId) : null;

      const payload = {
        id: 0,
        packageId: pkgId,
        departmentId: null,
        vendor: volName,
        paidTo: volName,
        department: 'Volunteer',
        category: 'Volunteer Advance',
        type: 'advance',
        status: 'Approved',
        amount: amount,
        mode: this.unifiedFinance.mode || 'Cash',
        date: this.unifiedFinance.date || new Date().toISOString().split('T')[0],
        description: 'Volunteer Advance: ' + (this.unifiedFinance.description || ''),
        volunteerId: volIdNum
      };

      // Optimistically insert locally
      this.expenses.unshift(payload);
      if (volIdNum) {
        this.volunteerAdvances[volIdNum] = (this.volunteerAdvances[volIdNum] || 0) + amount;
        this.saveAdvanceData();
      }
      this.showUnifiedFinanceModal = false;

      this.api.create('Expenses', payload).subscribe({
        next: () => { this.loadData(); },
        error: (err) => {
          console.error('Error adding advance transfer', err);
          this.loadData();
        }
      });
    } else {
      const dbDept = this.mapCategoryToDbDepartment(this.unifiedFinance.category);
      const total = this.expenseTotal;
      const amount = total > 0 ? total : Number(this.unifiedFinance.amount);
      const pkgId = (this.selectedPackageId && this.selectedPackageId !== 'all') 
        ? Number(this.selectedPackageId) 
        : (this.currentPackageId ? Number(this.currentPackageId) : null);
      const matchedDept = this.departments.find(d => (d.name || '').toLowerCase() === dbDept.toLowerCase());
      const volIdNum = this.unifiedFinance.volunteerId ? Number(this.unifiedFinance.volunteerId) : null;

      const payload = {
        id: 0,
        packageId: pkgId,
        departmentId: matchedDept?.id ? Number(matchedDept.id) : null,
        vendor: this.unifiedFinance.party ? this.unifiedFinance.party.trim() : 'Vendor',
        paidTo: this.unifiedFinance.party ? this.unifiedFinance.party.trim() : 'Vendor',
        department: dbDept,
        category: this.unifiedFinance.category || 'General',
        type: 'expense',
        status: 'Approved',
        amount: amount,
        mode: this.unifiedFinance.mode || 'Cash',
        date: this.unifiedFinance.date || new Date().toISOString().split('T')[0],
        description: JSON.stringify({
          remarks: this.unifiedFinance.description || 'Expense details',
          items: this.expenseItems.filter((it: any) => it.item && it.item.trim() !== ''),
          approvedBy: ''
        }),
        volunteerId: volIdNum,
        receiptUrl: this.unifiedFinance.receiptUrl || null
      };

      // Optimistically insert locally
      const localPayload = {
        ...payload,
        description: this.unifiedFinance.description || '',
        items: this.expenseItems.filter((it: any) => it.item && it.item.trim() !== ''),
        approvedBy: '',
        receiptUrl: this.unifiedFinance.receiptUrl || null
      };
      this.expenses.unshift(localPayload);
      this.showUnifiedFinanceModal = false;

      // If linked to a volunteer advance
      if (this.unifiedFinance.volunteerId) {
        this.saveAdvanceData();
      }

      this.api.create('Expenses', payload).subscribe({
        next: () => { this.loadData(); },
        error: (err) => {
          console.error('Error adding expense', err);
          this.loadData();
        }
      });
    }
  }

  deleteUnifiedTransaction(item: any, event: Event) {
    event.stopPropagation();
    if (this.isEntryLocked) {
      alert('🔒 Selected tour package is locked or completed. Transactions cannot be deleted.');
      return;
    }
    this.unifiedToDelete = item;
    this.showUnifiedDeleteConfirm = true;
  }

  confirmDeleteUnified() {
    if (this.isEntryLocked) {
      alert('🔒 Selected tour package is locked or completed. Transactions cannot be deleted.');
      return;
    }
    const item = this.unifiedToDelete;
    if (!item) return;
    this.showUnifiedDeleteConfirm = false;
    this.unifiedToDelete = null;

    let endpoint = 'Expenses';
    const isYatriPay = item.id && item.id.toString().startsWith('ypay-');

    if (isYatriPay) {
      endpoint = 'YatriPayments';
      this.yatriPayments = this.yatriPayments.filter((p: any) => p.id !== item.rawId);
    } else if (item.kind === 'Income') {
      endpoint = 'Incomes';
      this.incomes = this.incomes.filter((i: any) => i.id !== item.rawId);
    } else {
      endpoint = 'Expenses';
      this.expenses = this.expenses.filter((e: any) => e.id !== item.rawId);
    }

    this.api.delete(endpoint, item.rawId).subscribe({
      next: () => { this.loadData(); },
      error: () => { this.loadData(); }
    });
  }

  // ── Volunteer Advance Transfer from Finance ──
  openGiveAdvanceModal() {
    if (this.isEntryLocked) {
      alert('🔒 Selected tour package is locked or completed. Advance money cannot be given.');
      return;
    }
    this.advanceForm = {
      volunteerId: this.volunteers[0]?.id || '',
      amount: null,
      date: new Date().toISOString().split('T')[0],
      mode: 'Cash',
      remarks: ''
    };
    this.showGiveAdvanceModal = true;
  }

  saveVolunteerAdvance() {
    if (this.isEntryLocked) {
      alert('🔒 Selected tour package is locked or completed. Advance money cannot be saved.');
      return;
    }
    if (!this.advanceForm.volunteerId || !this.advanceForm.amount) {
      alert('कृपया स्वयंसेवक आणि ॲडव्हान्स रक्कम प्रविष्ट करा.');
      return;
    }

    const vol = this.volunteers.find(v => v.id === this.advanceForm.volunteerId);
    const volName = vol ? vol.name : 'Volunteer';
    const amount = Number(this.advanceForm.amount);

    const payload = {
      id: 'exp-adv-' + Date.now(),
      packageId: this.currentPackageId,
      vendor: volName,
      paidTo: volName,
      department: this.mapVolunteerDeptToDb(vol?.assignedDepartment || 'General'),
      category: 'Volunteer Advance',
      amount: amount,
      mode: this.advanceForm.mode || 'Cash',
      date: this.advanceForm.date || new Date().toISOString().split('T')[0],
      description: 'Volunteer Advance Given: ' + (this.advanceForm.remarks || ''),
      volunteerId: vol?.id || null
    };

    this.expenses.unshift(payload);
    if (vol?.id) {
      this.volunteerAdvances[vol.id] = (this.volunteerAdvances[vol.id] || 0) + amount;
      this.saveAdvanceData();
    }
    this.showGiveAdvanceModal = false;

    this.api.create('Expenses', payload).subscribe({
      next: () => { this.loadData(); },
      error: () => { this.loadData(); }
    });
  }

  get scanYatrisListToDisplay(): any[] {
    let list = this.allowedYatris || [];
    if (this.scanSearchQuery) {
      const q = this.scanSearchQuery.toLowerCase();
      list = list.filter(y => 
        y.name?.toLowerCase().includes(q) || 
        y.id?.toLowerCase().includes(q) || 
        (y.phone && y.phone.includes(q))
      );
    }
    return list;
  }

  selectYatriForScan(y: any) {
    this.selectedScanYatriId = y.id;
    this.triggerCheckIn(y.id);
  }

  triggerCheckIn(yatriId: string) {
    if (!yatriId) return;
    const yatri = this.yatris.find(y => String(y.id).toLowerCase() === String(yatriId).toLowerCase());
    if (!yatri) {
      alert('Pilgrim Not Found!');
      return;
    }

    const chkName = this.scanCheckpointId;
    const numericChkId = this.getCheckpointNumericId(chkName);

    // Check if ALREADY scanned for this checkpoint
    const alreadyScanned = (this.yatriAttendances || []).some(a => 
      String(a.yatriId).toLowerCase() === String(yatri.id).toLowerCase() && 
      Number(a.checkpointId) === numericChkId
    );

    if (alreadyScanned) {
      alert(`⚠️ ${yatri.name} हा मेंबर [${chkName}] साठी आधीच स्कॅन झाला आहे! (Already Scanned)`);
      this.scanningSuccessMessage = `⚠️ ${yatri.name} is ALREADY checked in for ${chkName}!`;
      setTimeout(() => { this.scanningSuccessMessage = ''; }, 4000);
      this.selectedScanYatriId = '';
      this.scanSearchQuery = '';
      return;
    }

    const payload = {
      yatriId: Number(yatri.id) || yatri.id,
      checkpointId: numericChkId,
      isPresent: true,
      markedAt: new Date().toISOString()
    };

    this.api.create('YatriAttendances', payload).subscribe({
      next: () => {
        this.yatriAttendances.push({ yatriId: Number(yatri.id), checkpointId: numericChkId, isPresent: true });
        this.scanningSuccessMessage = `✅ ${yatri.name} Check-in Successful! [${chkName}]`;
        this.scannedYatrisList.unshift({
          yatriId: yatri.id,
          name: yatri.name,
          time: new Date().toLocaleTimeString(),
          checkpoint: chkName,
          status: 'Present'
        });
        
        setTimeout(() => {
          this.scanningSuccessMessage = '';
        }, 3000);

        this.selectedScanYatriId = '';
        this.scanSearchQuery = '';
        this.loadData();
      },
      error: (err) => {
        console.error('Error creating attendance', err);
        alert(`⚠️ ${yatri.name} हा मेंबर [${chkName}] साठी आधीच स्कॅन झाला आहे! (Already Scanned)`);
      }
    });
  }

  getMealCheckpoint(mealName: string): string {
    const pkg = this.selectedPackageId || 'all';
    return `Meal-${mealName}-${pkg}`;
  }

  getMealAttendanceCount(mealName: string): number {
    const chk = this.getMealCheckpoint(mealName);
    const yatriIds = this.allowedYatris.map(y => y.id);
    return this.yatriAttendances.filter(a => a.checkpointId === chk && yatriIds.includes(a.yatriId)).length;
  }

  isMealTaken(yatriId: string, mealName: string): boolean {
    const chk = this.getMealCheckpoint(mealName);
    return this.yatriAttendances.some(a => a.yatriId === yatriId && a.checkpointId === chk);
  }

  toggleMealServed(yatri: any, mealName: string) {
    const chk = this.getMealCheckpoint(mealName);
    const taken = this.isMealTaken(yatri.id, mealName);

    if (!taken) {
      const payload = {
        yatriId: yatri.id,
        checkpointId: chk,
        isPresent: true,
        markedAt: new Date().toISOString()
      };
      this.api.create('YatriAttendances', payload).subscribe({
        next: () => this.loadData(),
        error: (err) => console.error('Error marking meal', err)
      });
    } else {
      this.api.deleteComposite('YatriAttendances', yatri.id, chk).subscribe({
        next: () => this.loadData(),
        error: (err) => console.error('Error unmarking meal', err)
      });
    }
  }

  // ── WhatsApp Broadcast Helpers ──
  broadcastAnnouncement(ann: any) {
    const timeStr = ann.time ? new Date(ann.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const dateStr = ann.time ? new Date(ann.time).toLocaleDateString() : '';
    const text = `*ISCON Yatra Announcement* 📢\n` +
                 `---------------------------------\n` +
                 `*Vishay (Title):* ${ann.title}\n` +
                 `*Tapsheel (Content):* ${ann.content}\n` +
                 `*Pradhanya (Priority):* ${ann.priority === 'Urgent' ? '🚨 URGENT' : 'ℹ️ Normal'}\n` +
                 `*Vel (Time):* ${timeStr} | ${dateStr}\n\n` +
                 `Hare Krishna!`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  broadcastLostItem(item: any) {
    const text = `*ISCON Yatra - Lost & Found Alert* 🔍\n` +
                 `---------------------------------\n` +
                 `*Vastu (Item):* ${item.itemName}\n` +
                 `*Tapsheel (Description):* ${item.description || '—'}\n` +
                 `*Shreni (Category):* ${item.category}\n` +
                 `*Sadyasthiti (Status):* ${item.status === 'Lost' ? '❌ Lost (Haravle Aahe)' : (item.status === 'Found' ? '✅ Found (Sapadle Aahe)' : 'Claimed')}\n` +
                 `*Thikan (Location):* ${item.location || '—'}\n\n` +
                 `Jar hi vastu apli asel tar krupaya swayansevakanshi sampark sadha. (Please contact volunteers if this is yours.)`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  contactVolunteerWhatsApp(vol: any) {
    if (!vol.phone) return;
    const cleanPhone = vol.phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    const text = `Hare Krishna ${vol.name} Prabhuji,\nISCON yatredarmyan apliya sevesathi (Department: ${vol.assignedDepartment}) dhanyavad.`;
    const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  // ── Camera QR Scanner State & Methods ──
  cameraActive = false;
  cameraDevices: MediaDeviceInfo[] = [];
  selectedCameraId = '';
  private videoStream: MediaStream | null = null;
  private scannerInterval: any = null;
  private lastScannedCode = '';
  private lastScannedTime = 0;

  ngOnDestroy() {
    this.stopCamera();
  }

  async startCamera() {
    this.cameraActive = true;
    this.lastScannedCode = '';
    this.lastScannedTime = 0;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.cameraDevices = devices.filter((d: any) => d.kind === 'videoinput');
      
      if (this.cameraDevices.length > 0 && !this.selectedCameraId) {
        const backCam = this.cameraDevices.find((d: any) => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('environment') ||
          d.label.toLowerCase().includes('rear')
        );
        this.selectedCameraId = backCam ? backCam.deviceId : this.cameraDevices[0].deviceId;
      }

      const constraints: MediaStreamConstraints = {
        video: this.selectedCameraId ? { deviceId: { exact: this.selectedCameraId } } : { facingMode: 'environment' }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoStream = stream;
      
      const video = document.getElementById('scanner-video') as HTMLVideoElement;
      if (video) {
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.play();
      }

      if (this.scannerInterval) clearInterval(this.scannerInterval);
      this.scannerInterval = setInterval(() => this.decodeFrame(), 300);

    } catch (err) {
      console.error('Error starting camera', err);
      alert('Camera suru karta ala nahi. Krupaya permissions check kara. (Unable to start camera. Please verify permissions.)');
      this.cameraActive = false;
    }
  }

  stopCamera() {
    this.cameraActive = false;
    if (this.scannerInterval) {
      clearInterval(this.scannerInterval);
      this.scannerInterval = null;
    }
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
    const video = document.getElementById('scanner-video') as HTMLVideoElement;
    if (video) {
      video.srcObject = null;
    }
  }

  onCameraChange() {
    this.stopCamera();
    this.startCamera();
  }

  decodeFrame() {
    if (!this.cameraActive) return;
    const video = document.getElementById('scanner-video') as HTMLVideoElement;
    const canvas = document.createElement('canvas');
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    if (typeof jsQR !== 'undefined') {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        const now = Date.now();
        if (code.data === this.lastScannedCode && (now - this.lastScannedTime) < 4000) {
          return;
        }

        this.lastScannedCode = code.data;
        this.lastScannedTime = now;
        
        if (navigator.vibrate) {
          navigator.vibrate(200);
        }

        this.triggerCheckIn(code.data);
      }
    }
  }

}
