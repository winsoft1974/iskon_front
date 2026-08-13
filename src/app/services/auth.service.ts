import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError } from 'rxjs/operators';
import { Observable, of } from 'rxjs';

export interface LoginResponse {
  token: string;
  role: string;
  department?: string;
  yatriId?: number;
  packageId?: number;
  username: string;
  fullName?: string;
  userId: number;
  expiresAt: string;
}


@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly BASE = 'http://103.102.144.180:8081/api';
  private readonly TOKEN_KEY = 'iscon_token';
  private readonly USER_KEY  = 'iscon_user';

  // Reactive signals for current user
  currentUser = signal<LoginResponse | null>(this.loadUser());

  private heartbeatTimer: any = null;

  constructor(private http: HttpClient, private router: Router) {
    if (this.isLoggedIn()) {
      this.loadPermissions();
      this.startHeartbeat();
    }
  }

  // ── Heartbeat Ping ──────────────────────────────────────────────────────────
  startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.sendPing();
    this.heartbeatTimer = setInterval(() => {
      if (this.isLoggedIn()) {
        this.sendPing();
      } else {
        this.stopHeartbeat();
      }
    }, 60000);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  sendPing(): void {
    this.http.post(`${this.BASE}/auth/ping`, {}).pipe(
      catchError(() => of(null))
    ).subscribe();
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  login(username: string, password: string, packageId?: number | string): Observable<LoginResponse> {
    const pkgIdNum = (packageId !== undefined && packageId !== null && packageId !== '' && packageId !== 'all')
      ? Number(packageId)
      : null;
    return this.http.post<LoginResponse>(`${this.BASE}/auth/login`, { username, password, packageId: pkgIdNum }).pipe(
      tap(res => {
        localStorage.setItem(this.TOKEN_KEY, res.token);
        localStorage.setItem(this.USER_KEY,  JSON.stringify(res));
        this.currentUser.set(res);
        this.loadPermissions();
        this.startHeartbeat();
      })
    );
  }


  // ── Logout ─────────────────────────────────────────────────────────────────
  logout(): void {
    this.stopHeartbeat();
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  // ── Token helpers ──────────────────────────────────────────────────────────
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    const token = this.getToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  getRole(): string {
    return this.currentUser()?.role ?? '';
  }

  getUsername(): string {
    return this.currentUser()?.username ?? '';
  }

  getFullName(): string {
    return this.currentUser()?.fullName ?? this.getUsername();
  }

  // Helper role checks
  isKasAuthority():    boolean { 
    const u = this.currentUser();
    if (u?.username?.toLowerCase() === 'admin') return true;
    return this.getRole() === 'KasAuthority'; 
  }
  isServiceIncharge(): boolean { return this.getRole() === 'ServiceIncharge'; }
  isVolunteer():       boolean { 
    if (this.isKasAuthority()) return false; // KasAuthority is never treated as Volunteer
    return this.getRole() === 'Volunteer'; 
  }

  // Can see Income + Transfer sections?
  canViewFinance(): boolean {
    return this.isKasAuthority() || this.isServiceIncharge();
  }

  // Can edit/delete expenses?
  canEditExpense(): boolean {
    return this.isKasAuthority() || this.isServiceIncharge();
  }

  getDepartment(): string {
    return this.currentUser()?.department ?? 'General';
  }

  getPackageId(): number | undefined {
    return this.currentUser()?.packageId;
  }

  // ── Register (KasAuthority only) ───────────────────────────────────────────
  register(username: string, password: string, role: string, department?: string, yatriId?: number, fullName?: string, packageId?: number): Observable<any> {
    return this.http.post(`${this.BASE}/auth/register`, { username, password, role, department: department || 'General', yatriId, fullName, packageId });
  }


  // ── Role & Member Permissions System ──
  permissions = signal<any[]>([]);
  userPermissions = signal<any[]>([]);

  loadPermissions(): void {
    if (this.isLoggedIn()) {
      this.http.get<any[]>(`${this.BASE}/permissions`).pipe(
        catchError(() => of([]))
      ).subscribe({
        next: (res) => this.permissions.set(res || []),
        error: () => {}
      });

      const username = this.getUsername();
      if (username) {
        this.http.get<any[]>(`${this.BASE}/userpermissions/${encodeURIComponent(username)}`).pipe(
          catchError(() => of([]))
        ).subscribe({
          next: (res) => this.userPermissions.set(res || []),
          error: () => {}
        });
      }
    }
  }

  getPermissionsList(): Observable<any[]> {
    return this.http.get<any[]>(`${this.BASE}/permissions`);
  }

  updatePermissionsList(perms: any[]): Observable<any> {
    return this.http.put(`${this.BASE}/permissions`, perms);
  }

  getUserPermissions(username: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.BASE}/userpermissions/${encodeURIComponent(username)}`);
  }

  updateUserPermissions(username: string, perms: any[]): Observable<any> {
    return this.http.put(`${this.BASE}/userpermissions/${encodeURIComponent(username)}`, perms);
  }

  hasPermission(department: string, action: 'view' | 'addExpense' | 'manage' = 'view'): boolean {
    if (this.isKasAuthority()) return true;
    const userRole = this.getRole();
    const userDept = this.getDepartment().toLowerCase();
    const targetDept = (department || 'General').toLowerCase();

    // 1. Member-specific custom checkbox permissions
    const userPermList = this.userPermissions();
    if (userPermList && userPermList.length > 0) {
      const userMatch = userPermList.find(p => (p.department || '').toLowerCase() === targetDept);
      if (userMatch) {
        if (action === 'addExpense') return userMatch.canAddExpense;
        if (action === 'manage') return userMatch.canManage;
        return userMatch.canView;
      }
    }

    // 2. Role Permissions matrix
    const permList = this.permissions();
    if (permList && permList.length > 0) {
      const match = permList.find(p => 
        (p.role || '').toLowerCase() === userRole.toLowerCase() && 
        (p.department || '').toLowerCase() === targetDept
      );
      if (match) {
        if (action === 'addExpense') return match.canAddExpense && (userDept === 'general' || userDept === targetDept);
        if (action === 'manage') return match.canManage;
        return match.canView && (userDept === 'general' || userDept === targetDept);
      }
    }

    // Default fallback check
    if (userDept === 'general') return true;
    return userDept === targetDept;
  }

  // ── User Management (KasAuthority only) ──────────────────────────────────
  getUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.BASE}/auth/users`);
  }

  updateUser(userId: number, dto: any): Observable<any> {
    return this.http.put(`${this.BASE}/auth/users/${userId}`, dto);
  }

  deleteUser(userId: number): Observable<any> {
    return this.http.delete(`${this.BASE}/auth/users/${userId}`);
  }

  // ── Role Management ──
  getRoles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.BASE}/roles`);
  }

  createRole(name: string, description?: string): Observable<any> {
    return this.http.post(`${this.BASE}/roles`, { name, description });
  }

  deleteRole(roleId: number): Observable<any> {
    return this.http.delete(`${this.BASE}/roles/${roleId}`);
  }



  private loadUser(): LoginResponse | null {
    try {
      const raw = localStorage.getItem(this.USER_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as LoginResponse;
    } catch {
      return null;
    }
  }
}
