import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { forkJoin, of, catchError } from 'rxjs';

interface UserRow {
  id: number | null;
  volunteerId: number | null;
  rawVolunteer: any;
  username: string;
  fullName: string;
  phone: string;
  role: string;
  department: string;
  packageId: number | null;
  isActive: boolean;
  hasUserAccount: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  lastLoginAt?: string | null;
  lastActiveAt?: string | null;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.component.html',
  styleUrl: './users.component.css'
})
export class UsersComponent implements OnInit {
  auth = inject(AuthService);
  api = inject(ApiService);

  users: UserRow[] = [];
  packages: any[] = [];
  loading = false;
  search = '';
  toast = '';
  toastType: 'success' | 'error' | 'info' = 'success';

  showCreateModal = false;
  createForm: any = {
    username: '', password: '', confirmPassword: '',
    fullName: '', role: 'Volunteer', department: 'General',
    volunteerId: null, packageId: null, showPass: false, saving: false, error: ''
  };

  editForm: any = null;
  editNewPassword = '';
  editShowPass = false;

  deleteTarget: UserRow | null = null;

  private _volunteers: any[] = [];
  allMembers: any[] = [];
  memberSearch = '';
  showMemberDropdown = false;

  departments = ['General', 'Food', 'Transport', 'Accommodation', 'Medical', 'Religious'];

  // Manage Roles Modal State
  showRoleModal = false;
  newRoleName = '';
  newRoleDesc = '';
  roleSaving = false;
  roleError = '';

  roles: { value: string; label: string; description?: string; id?: number }[] = [
    { value: 'KasAuthority', label: 'Kas Authority (Admin)', description: 'Full access to all modules and features.' },
    { value: 'ServiceIncharge', label: 'Service Incharge', description: 'Can manage services and team members.' },
    { value: 'Volunteer', label: 'Volunteer', description: 'General access to operational tasks.' }
  ];

  loadRoles() {
    this.auth.getRoles().pipe(catchError(() => of([]))).subscribe(res => {
      if (res && res.length > 0) {
        this.roles = res.map((r: any) => ({
          value: r.name,
          label: this.formatRoleLabel(r.name),
          description: r.description,
          id: r.id
        }));
      }
    });
  }

  formatRoleLabel(name: string): string {
    if (name === 'KasAuthority') return 'Kas Authority (Admin)';
    if (name === 'ServiceIncharge') return 'Service Incharge';
    if (name === 'Volunteer') return 'Volunteer';
    return name;
  }

  openRoleModal() {
    this.showRoleModal = true;
    this.newRoleName = '';
    this.newRoleDesc = '';
    this.roleError = '';
    this.loadRoles();
  }

  closeRoleModal() {
    this.showRoleModal = true;
  }

  submitCreateRole() {
    if (!this.newRoleName.trim()) {
      this.roleError = 'Role name is required.';
      return;
    }
    this.roleSaving = true;
    this.roleError = '';
    this.auth.createRole(this.newRoleName.trim(), this.newRoleDesc).subscribe({
      next: () => {
        this.roleSaving = false;
        this.newRoleName = '';
        this.newRoleDesc = '';
        this.showToast('✅ New Role created successfully!', 'success');
        this.loadRoles();
      },
      error: (err: any) => {
        this.roleSaving = false;
        this.roleError = err?.error?.message || 'Failed to create role.';
      }
    });
  }

  submitDeleteRole(role: any) {
    if (!role.id) return;
    this.auth.deleteRole(role.id).subscribe({
      next: () => {
        this.showToast(`🗑️ Role "${role.value}" deleted successfully.`, 'info');
        this.loadRoles();
      },
      error: (err: any) => {
        this.showToast(err?.error?.message || 'Failed to delete role.', 'error');
      }
    });
  }

  get countKasAuthority(): number {
    return this.users.filter(u => u.role === 'KasAuthority').length;
  }

  get countServiceIncharge(): number {
    return this.users.filter(u => u.role === 'ServiceIncharge').length;
  }

  get countVolunteers(): number {
    return this.users.filter(u => u.role === 'Volunteer').length;
  }

  get countVolunteer(): number {
    return this.countVolunteers;
  }

  get noAccountCount(): number {
    return this.users.filter(u => !u.hasUserAccount).length;
  }

  get filteredMembers(): any[] {
    if (!this.memberSearch.trim()) return this.allMembers.slice(0, 8);
    const q = this.memberSearch.toLowerCase().trim();
    return this.allMembers.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.phone.includes(q) ||
      m.department.toLowerCase().includes(q)
    ).slice(0, 8);
  }

  selectMember(m: any) {
    this.memberSearch = `${m.name} (${m.phone || m.type})`;
    this.showMemberDropdown = false;
    this.createForm.fullName = m.name;
    this.createForm.department = m.department || 'General';
    this.createForm.volunteerId = m.volunteerId || null;
    this.createForm.yatriId = m.yatriId || null;
    if (m.packageId) {
      this.createForm.packageId = m.packageId;
    }

    if (!this.createForm.username) {
      const cleanName = m.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const deptCode = (m.department || 'gen').toLowerCase().slice(0, 3);
      this.createForm.username = `${cleanName}_${deptCode}`;
    }
  }

  ngOnInit() {
    this.loadRoles();
    this.loadUsers();
  }

  get filteredUsers(): UserRow[] {
    if (!this.search) return this.users;
    const q = this.search.toLowerCase().trim();
    return this.users.filter(u =>
      (u.fullName || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q)
    );
  }

  get unmappedVolunteers(): any[] {
    const mapped = new Set(this.users.filter(u => u.volunteerId).map(u => u.volunteerId));
    return (this._volunteers || []).filter((v: any) => !mapped.has(v.id));
  }

  loadUsers() {
    this.loading = true;
    forkJoin({
      users:    this.auth.getUsers().pipe(catchError(() => of([]))),
      vols:     this.api.getAll<any>('Volunteers').pipe(catchError(() => of([]))),
      yatris:   this.api.getAll<any>('Yatris').pipe(catchError(() => of([]))),
      packages: this.api.getAll<any>('Packages').pipe(catchError(() => of([])))
    }).subscribe({
      next: (res) => {
        this._volunteers = res.vols || [];
        this.packages    = res.packages || [];
        const usersList: any[]  = res.users || [];
        const volsList: any[]   = res.vols  || [];
        const yatrisList: any[] = res.yatris || [];

        const membersMap = new Map<string, any>();
        volsList.forEach(v => {
          const key = (v.name || '').toLowerCase().trim();
          if (key) {
            membersMap.set(key, {
              name: v.name,
              phone: v.phone || '',
              department: v.assignedDepartment || 'General',
              volunteerId: v.id,
              yatriId: v.yatriId || null,
              packageId: v.packageId || null,
              type: 'Volunteer'
            });
          }
        });

        yatrisList.forEach(y => {
          const fullName = `${y.firstName || ''} ${y.lastName || ''}`.trim() || y.name || '';
          const key = fullName.toLowerCase().trim();
          if (key && !membersMap.has(key)) {
            membersMap.set(key, {
              name: fullName,
              phone: y.phone || y.mobile || '',
              department: y.department || 'General',
              volunteerId: null,
              yatriId: y.id,
              packageId: y.packageId || null,
              type: 'Yatri'
            });
          }
        });

        this.allMembers = Array.from(membersMap.values());

        const combined: UserRow[] = [];
        const processedVolIds = new Set<number>();

        usersList.forEach(u => {
          const vol = volsList.find(v =>
            (u.yatriId && v.yatriId === u.yatriId) ||
            (v.name && u.fullName && v.name.toLowerCase().trim() === u.fullName.toLowerCase().trim())
          );
          if (vol) processedVolIds.add(vol.id);
          combined.push({
            id: u.id, volunteerId: vol?.id ?? null, rawVolunteer: vol ?? null,
            username: u.username, fullName: u.fullName || u.username,
            phone: vol?.phone || u.phone || '',
            role: u.role || 'Volunteer',
            department: u.department || vol?.assignedDepartment || 'General',
            packageId: u.packageId || vol?.packageId || null,
            isActive: u.isActive !== false,
            hasUserAccount: true, isSaving: false, isDeleting: false,
            lastLoginAt: u.lastLoginAt || null,
            lastActiveAt: u.lastActiveAt || null
          });
        });

        volsList.forEach(v => {
          if (!processedVolIds.has(v.id)) {
            combined.push({
              id: null, volunteerId: v.id, rawVolunteer: v,
              username: '', fullName: v.name || '', phone: v.phone || '',
              role: 'Volunteer', department: v.assignedDepartment || 'General',
              packageId: v.packageId || null,
              isActive: false, hasUserAccount: false, isSaving: false, isDeleting: false,
              lastLoginAt: null, lastActiveAt: null
            });
          }
        });

        this.users = combined;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  isOnline(user: UserRow): boolean {
    if (!user.hasUserAccount || !user.isActive || !user.lastActiveAt) return false;
    const diffMs = Date.now() - new Date(user.lastActiveAt).getTime();
    return diffMs <= 3 * 60 * 1000;
  }

  get countOnlineUsers(): number {
    return this.users.filter(u => this.isOnline(u)).length;
  }

  formatTimeAgo(dateStr?: string | null): string {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Never';
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  openCreateModal(vol?: any) {
    this.memberSearch = vol ? `${vol.name} (${vol.phone || 'Volunteer'})` : '';
    this.showMemberDropdown = false;
    this.createForm = {
      username: vol ? (vol.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + (vol.assignedDepartment || 'vol').toLowerCase() : '',
      password: '', confirmPassword: '',
      fullName: vol?.name || '', role: 'Volunteer',
      department: vol?.assignedDepartment || 'General',
      volunteerId: vol?.id ?? null,
      yatriId: vol?.yatriId ?? null,
      showPass: false, saving: false, error: ''
    };
    this.showCreateModal = true;
  }

  closeCreateModal() { this.showCreateModal = false; }

  validatePassword(password: string): string | null {
    if (!password) return 'Password is required.';
    if (password.length < 6) return 'Password must be at least 6 characters.';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least 1 uppercase letter (A-Z).';
    if (!/[a-z]/.test(password)) return 'Password must contain at least 1 lowercase letter (a-z).';
    if (!/[0-9]/.test(password)) return 'Password must contain at least 1 number (0-9).';
    return null;
  }

  hasMinLength(p: string): boolean { return !!p && p.length >= 6; }
  hasUpper(p: string): boolean     { return !!p && /[A-Z]/.test(p); }
  hasLower(p: string): boolean     { return !!p && /[a-z]/.test(p); }
  hasNumber(p: string): boolean    { return !!p && /[0-9]/.test(p); }

  submitCreate() {
    const f = this.createForm;
    if (!f.username.trim()) { f.error = 'Username is required.'; return; }

    const passErr = this.validatePassword(f.password);
    if (passErr) { f.error = passErr; return; }

    if (f.password !== f.confirmPassword) { f.error = 'Password and Confirm Password do not match.'; return; }
    f.error = ''; f.saving = true;

    this.auth.register(f.username.trim(), f.password, f.role, f.department, f.volunteerId ?? undefined, f.fullName, f.packageId ? Number(f.packageId) : undefined)
      .subscribe({
        next: () => {
          f.saving = false; this.showCreateModal = false;
          this.showToast('✅ User account "' + f.username + '" created successfully!', 'success');
          this.loadUsers();
        },
        error: (err: any) => {
          f.saving = false;
          f.error = err?.error?.message || 'Failed to create user account.';
        }
      });
  }

  openEditModal(user: UserRow) {
    this.editForm = {
      id: user.id, username: user.username, fullName: user.fullName,
      role: user.role, department: user.department, packageId: user.packageId ?? null, isActive: user.isActive,
      saving: false, error: ''
    };
    this.editNewPassword = ''; this.editShowPass = false;
  }

  closeEditModal() { this.editForm = null; }

  submitEdit() {
    const f = this.editForm;
    if (!f) return;

    if (this.editNewPassword) {
      const passErr = this.validatePassword(this.editNewPassword);
      if (passErr) { f.error = passErr; return; }
    }

    f.saving = true; f.error = '';
    const dto: any = { role: f.role, department: f.department, fullName: f.fullName, packageId: f.packageId ? Number(f.packageId) : null, isActive: f.isActive };
    if (this.editNewPassword) dto.newPassword = this.editNewPassword;

    this.auth.updateUser(f.id, dto).subscribe({
      next: () => {
        f.saving = false; this.editForm = null;
        this.showToast('✅ User "' + f.username + '" updated successfully!', 'success');
        this.loadUsers();
      },
      error: (err: any) => {
        f.saving = false;
        f.error = err?.error?.message || 'Failed to update user.';
      }
    });
  }

  confirmDelete(user: UserRow) { this.deleteTarget = user; }
  cancelDelete() { this.deleteTarget = null; }

  doDelete() {
    if (!this.deleteTarget?.id) return;
    const target = this.deleteTarget;
    const userId = target.id!;
    target.isDeleting = true; this.deleteTarget = null;
    this.auth.deleteUser(userId).subscribe({
      next: () => {
        this.showToast('🗑️ User "' + target.username + '" deleted successfully.', 'info');
        this.loadUsers();
      },
      error: () => { target.isDeleting = false; this.showToast('❌ Failed to delete user.', 'error'); }
    });
  }

  showToast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
    this.toast = msg; this.toastType = type;
    setTimeout(() => this.toast = '', 3500);
  }

  roleBadge(role: string): string {
    switch(role) {
      case 'KasAuthority':    return '👑 Kas Authority';
      case 'ServiceIncharge': return '🧑‍💼 Incharge';
      default:                return '🙋 Volunteer';
    }
  }

  roleColor(role: string): string {
    switch(role) {
      case 'KasAuthority':    return '#f59e0b';
      case 'ServiceIncharge': return '#6366f1';
      default:                return '#10b981';
    }
  }

  getRoleBg(role: string): string {
    switch(role) {
      case 'KasAuthority':    return 'rgba(245,158,11,0.15)';
      case 'ServiceIncharge': return 'rgba(99,102,241,0.15)';
      default:                return 'rgba(16,185,129,0.15)';
    }
  }

  getRoleBorder(role: string): string {
    switch(role) {
      case 'KasAuthority':    return '1px solid rgba(245,158,11,0.35)';
      case 'ServiceIncharge': return '1px solid rgba(99,102,241,0.35)';
      default:                return '1px solid rgba(16,185,129,0.35)';
    }
  }

  getInitial(name: string): string {
    if (!name) return 'U';
    return name.trim().charAt(0).toUpperCase();
  }
}
