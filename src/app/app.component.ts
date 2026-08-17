import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PackageContextService } from './services/package-context.service';
import { LanguageService, SupportedLang } from './services/language.service';
import { ApiService } from './services/api.service';
import { AuthService } from './services/auth.service';
import { forkJoin, of, catchError } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'frontend';
  packageContext = inject(PackageContextService);
  lang = inject(LanguageService);
  apiService = inject(ApiService);
  router = inject(Router);
  auth = inject(AuthService);

  packages: any[] = [];
  selectedPackageId = '';

  isMobileMenuOpen = false;

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu() {
    this.isMobileMenuOpen = false;
  }

  logout() {
    this.auth.logout();
  }

  get currentRole(): string { return this.auth.getRole(); }
  get currentFullName(): string { return this.auth.getFullName(); }
  get roleBadge(): string {
    const dept = this.auth.getDepartment();
    const deptTag = (dept && dept !== 'General') ? ` (${dept})` : '';
    switch(this.auth.getRole()) {
      case 'KasAuthority':    return '👑 Kas Authority (Super Admin)';
      case 'ServiceIncharge': return `🧑‍💼 Service Incharge${deptTag}`;
      case 'Volunteer':       return `🙋 Volunteer${deptTag}`;
      default: return this.auth.getRole();
    }
  }

  get isLoggedIn(): boolean { return this.auth.isLoggedIn(); }
  get isVolunteer(): boolean { return this.auth.isVolunteer(); }
  get isKasAuthority(): boolean { return this.auth.isKasAuthority(); }
  get isLoginPage(): boolean { return this.router.url.includes('/login') || !this.isLoggedIn; }

  // ── Role & Member Permissions Matrix Modal State & Logic ──
  showPermissionModal = false;
  permissionMatrix: any[] = [];
  permissionSaving = false;
  permissionSuccessMsg = '';
  readonly permRoles = ['ServiceIncharge', 'Volunteer'];
  readonly permDepartments = ['Food', 'Transport', 'Accommodation', 'Medical', 'Religious', 'General'];

  // Member Dropdown State
  systemUsers: any[] = [];
  selectedMemberUsername = '';
  selectedMember: any = null;
  memberPermissionMatrix: any[] = [];
  memberPermSaving = false;
  memberPermSuccessMsg = '';

  openPermissionModal() {
    this.showPermissionModal = true;
    this.loadPermissionMatrix();
    this.loadSystemUsers();
  }

  loadSystemUsers() {
    if (!this.isKasAuthority) return;
    forkJoin({
      users: this.auth.getUsers().pipe(catchError(() => of([]))),
      vols: this.apiService.getAll<any>('Volunteers').pipe(catchError(() => of([])))
    }).subscribe({
      next: (res) => {
        const usersList: any[] = res.users || [];
        const volsList: any[] = res.vols || [];
        const combined: any[] = [];
        const processedUserIds = new Set<number>();
        const processedVolIds = new Set<number>();

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
            hasUserAccount: true
          });
        });

        volsList.forEach(v => {
          if (!processedVolIds.has(v.id)) {
            combined.push({
              id: null,
              volunteerId: v.id,
              rawVolunteer: v,
              username: '',
              fullName: v.name,
              phone: v.phone || '',
              role: 'Volunteer',
              department: v.assignedDepartment || 'General',
              hasUserAccount: false
            });
          }
        });

        this.systemUsers = combined;
      }
    });
  }

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
          this.memberPermSuccessMsg = `✅ ${this.selectedMember.fullName} साठी हक्क सेव्ह झाले!`;
          this.loadSystemUsers();
          setTimeout(() => this.memberPermSuccessMsg = '', 4000);
        },
        error: () => {
          this.memberPermSaving = false;
        }
      });
    };

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

  closePermissionModal() {
    this.showPermissionModal = false;
    this.permissionSuccessMsg = '';
  }

  loadPermissionMatrix() {
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




  showSettings = false;
  theme: 'light' | 'dark' = 'light';
  fontSize: 'small' | 'medium' | 'large' | 'xlarge' = 'medium';
  language: SupportedLang = 'english';

  accentColors = [
    { name: 'Indigo', value: '#4f46e5', hover: '#3730a3' },
    { name: 'Violet', value: '#7c3aed', hover: '#5b21b6' },
    { name: 'Rose',   value: '#e11d48', hover: '#be123c' },
    { name: 'Teal',   value: '#0d9488', hover: '#0f766e' },
    { name: 'Amber',  value: '#d97706', hover: '#b45309' },
    { name: 'Sky',    value: '#0284c7', hover: '#0369a1' },
  ];
  selectedAccent = '#4f46e5';
  navbarTintIntensity = 20;
  buttonBrightness = 50;

  // Delegate to shared LanguageService
  t(key: string): string { return this.lang.t(key); }

  ngOnInit() {
    this.packageContext.packages$.subscribe(pkgs => { this.packages = pkgs; });
    this.packageContext.selectedPackageId$.subscribe(id => { this.selectedPackageId = id; });

    // Restore settings from localStorage
    const savedTheme   = localStorage.getItem('app_theme') as 'light' | 'dark';
    const savedFont    = localStorage.getItem('app_font_size') as any;
    const savedAccent  = localStorage.getItem('app_accent_color');
    const savedNavTint = localStorage.getItem('app_navbar_tint');
    const savedBtnBri  = localStorage.getItem('app_button_brightness');

    if (savedTheme)   { this.theme = savedTheme; this.applyTheme(); }
    if (savedFont)    { this.fontSize = savedFont; this.applyFontSize(); }
    if (savedNavTint) { this.navbarTintIntensity = parseInt(savedNavTint, 10); }
    if (savedBtnBri)  { this.buttonBrightness = parseInt(savedBtnBri, 10); }

    // Restore language via service
    this.lang.restore();
    this.language = this.lang.current;

    if (savedAccent)  { this.selectedAccent = savedAccent; this.applyColors(); }
  }

  ngOnDestroy() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
      this.recognition = null;
    }
  }

  toggleSettingsPanel(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    this.showSettings = !this.showSettings;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    if (this.showSettings && target && !target.closest('#settings-panel') && !target.closest('#settings-btn')) {
      this.showSettings = false;
    }
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeyDown(event: KeyboardEvent) {
    // 1. Sidebar Navigation Shortcuts (Alt + 1 to 6)
    if (event.altKey && event.key >= '1' && event.key <= '6') {
      const routes = [
        '/dashboard',
        '/yatris',
        '/packages',
        '/hotels',
        '/transit',
        '/operations'
      ];
      const targetRoute = routes[Number(event.key) - 1];
      if (targetRoute) {
        event.preventDefault();
        this.router.navigate([targetRoute]);
        return;
      }
    }

    // 2. Main Block Auto-Scroll Navigation (Ctrl + ArrowUp / ArrowDown)
    if (event.ctrlKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const panels = Array.from(document.querySelectorAll('.glass-panel, table, form')) as HTMLElement[];
      const visiblePanels = panels.filter(p => {
        const style = window.getComputedStyle(p);
        return style.display !== 'none' && style.visibility !== 'hidden' && p.offsetHeight > 40 && p.offsetWidth > 40;
      });

      if (visiblePanels.length > 0) {
        event.preventDefault();
        
        let currentIdx = -1;
        let minDiff = Infinity;
        
        visiblePanels.forEach((p, idx) => {
          const rect = p.getBoundingClientRect();
          const diff = Math.abs(rect.top - 75); // Offset for header
          if (diff < minDiff) {
            minDiff = diff;
            currentIdx = idx;
          }
        });

        let targetIdx = currentIdx;
        if (event.key === 'ArrowDown') {
          targetIdx = currentIdx + 1;
        } else {
          targetIdx = currentIdx - 1;
        }

        if (targetIdx >= 0 && targetIdx < visiblePanels.length) {
          const targetEl = visiblePanels[targetIdx];
          const rect = targetEl.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const targetY = rect.top + scrollTop - 80; // Offset for header
          
          window.scrollTo({
            top: targetY,
            behavior: 'smooth'
          });
        }
        return;
      }
    }

    const target = event.target as HTMLElement;
    if (!target) return;

    // Check if the focused element is a form control
    const isInput = target.tagName === 'INPUT' || target.tagName === 'SELECT';
    const isTextarea = target.tagName === 'TEXTAREA';

    // Go to next on Enter for inputs/selects, or Ctrl+Enter for textareas
    const shouldGoNext = (event.key === 'Enter' && isInput) || (event.key === 'Enter' && event.ctrlKey && isTextarea);

    if (shouldGoNext) {
      // Find the closest container (form, modal, panel, or body) to constraint search
      const container = target.closest('form') || target.closest('.glass-panel') || target.closest('body') || document;
      if (!container) return;

      // Select focusable form inputs, selects, textareas, or submit buttons
      const query = 'input:not([disabled]):not([readonly]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]):not([readonly]), button.btn-primary:not([disabled]), button[type="submit"]:not([disabled])';
      const focusables = Array.from(container.querySelectorAll(query)) as HTMLElement[];

      // Filter visible elements
      const visibleFocusables = focusables.filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
      });

      const currentIndex = visibleFocusables.indexOf(target);
      if (currentIndex !== -1 && currentIndex < visibleFocusables.length - 1) {
        event.preventDefault();
        const nextEl = visibleFocusables[currentIndex + 1];
        nextEl.focus();
        
        // Smoothly scroll the focused element to the center of viewport
        nextEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    this.applyTheme();
    localStorage.setItem('app_theme', this.theme);
  }

  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.theme);
  }

  setFontSize(size: 'small' | 'medium' | 'large' | 'xlarge') {
    this.fontSize = size;
    this.applyFontSize();
    localStorage.setItem('app_font_size', size);
  }

  applyFontSize() {
    const zoomMap: Record<string, string> = {
      small: '88%', medium: '100%', large: '112%', xlarge: '125%'
    };
    (document.body.style as any)['zoom'] = zoomMap[this.fontSize] || '100%';
  }

  setLanguage(lang: SupportedLang) {
    this.language = lang;
    this.lang.setLanguage(lang);
  }

  setAccentColor(color: { value: string; hover: string }) {
    this.selectedAccent = color.value;
    localStorage.setItem('app_accent_color', color.value);
    localStorage.setItem('app_accent_hover', color.hover);
    this.applyColors(color);
  }

  onNavbarTintChange() {
    localStorage.setItem('app_navbar_tint', this.navbarTintIntensity.toString());
    this.applyColors();
  }

  onButtonBrightnessChange() {
    localStorage.setItem('app_button_brightness', this.buttonBrightness.toString());
    this.applyColors();
  }

  applyColors(color?: { value: string; hover: string }) {
    const baseHex  = color?.value || this.selectedAccent;
    const hoverHex = color?.hover || localStorage.getItem('app_accent_hover') || '#3730a3';
    const rgb = this.hexToRgb(baseHex);
    if (!rgb) return;

    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    const bFactor = (this.buttonBrightness - 50) / 50;
    const btnR = clamp(Math.round(bFactor > 0 ? rgb.r + (255 - rgb.r) * bFactor * 0.6 : rgb.r + rgb.r * bFactor * 0.5));
    const btnG = clamp(Math.round(bFactor > 0 ? rgb.g + (255 - rgb.g) * bFactor * 0.6 : rgb.g + rgb.g * bFactor * 0.5));
    const btnB = clamp(Math.round(bFactor > 0 ? rgb.b + (255 - rgb.b) * bFactor * 0.6 : rgb.b + rgb.b * bFactor * 0.5));
    const primaryHex = this.rgbToHex(btnR, btnG, btnB);
    const tintOpacity = (this.navbarTintIntensity / 100) * 0.40;

    const root = document.documentElement;
    root.style.setProperty('--primary', primaryHex);
    root.style.setProperty('--primary-hover', hoverHex);
    root.style.setProperty('--sidebar-accent-bg',  `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${tintOpacity.toFixed(3)})`);
    root.style.setProperty('--sidebar-active-bg',  `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(0.40, tintOpacity * 1.8).toFixed(3)})`);
    root.style.setProperty('--header-accent-bg',   `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(tintOpacity * 0.6).toFixed(3)})`);
    root.style.setProperty('--border-glow',        `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`);
  }

  hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return res ? { r: parseInt(res[1], 16), g: parseInt(res[2], 16), b: parseInt(res[3], 16) } : null;
  }

  rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  onPackageChange(id: string) {
    this.packageContext.setSelectedPackageId(id);
  }

  getLanguageLabel(): string {
    if (this.language === 'marathi') return 'मराठी';
    if (this.language === 'kannada') return 'ಕನ್ನಡ';
    return 'English';
  }

  get isOffline(): boolean {
    return this.apiService.isOffline;
  }

  get isSyncing(): boolean {
    return this.apiService.isSyncing$.value;
  }

  getOfflineQueueLength(): number {
    return this.apiService.getOfflineQueueLength();
  }

  forceSync() {
    this.apiService.syncOfflineMutations();
  }

  // --- Voice Chatbot State ---
  showChatbot = false;
  chatbotInput = '';
  chatbotMessages: Array<{ sender: 'user' | 'bot'; text: string }> = [
    { sender: 'bot', text: 'Hare Krishna! I am your Yatra Helper. You can ask me: "Where is my room?", "Which bus is allocated to me?", "Who is the helpline coordinator?", or greet me with "Hare Krishna"!' }
  ];
  isListening = false;
  private recognition: any = null;

  toggleChatbot() {
    this.showChatbot = !this.showChatbot;
    if (this.showChatbot) {
      this.initSpeechRecognition();
    }
  }

  private initSpeechRecognition() {
    if (this.recognition) return;
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (Speech) {
      this.recognition = new Speech();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = this.language === 'marathi' ? 'mr-IN' : (this.language === 'kannada' ? 'kn-IN' : 'en-US');

      this.recognition.onstart = () => {
        this.isListening = true;
      };

      this.recognition.onend = () => {
        this.isListening = false;
      };

      this.recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        this.chatbotInput = transcript;
        this.submitChatbotQuery();
      };

      this.recognition.onerror = (err: any) => {
        console.error('Speech recognition error', err);
        this.isListening = false;
      };
    }
  }

  toggleSpeechListening() {
    if (!this.recognition) {
      this.initSpeechRecognition();
    }
    if (!this.recognition) {
      alert('तुमच्या ब्राउझरमध्ये व्हॉइस रिकग्निशन उपलब्ध नाही. (Voice recognition is not supported in your browser.)');
      return;
    }
    if (this.isListening) {
      this.recognition.stop();
    } else {
      this.chatbotInput = '';
      this.recognition.start();
    }
  }

  submitChatbotQuery() {
    if (!this.chatbotInput.trim()) return;
    const userText = this.chatbotInput.trim();
    this.chatbotMessages.push({ sender: 'user', text: userText });
    this.chatbotInput = '';

    const botReply = this.resolveChatbotReply(userText);
    this.chatbotMessages.push({ sender: 'bot', text: botReply });

    // Auto-scroll chat body
    setTimeout(() => {
      const chatBody = document.getElementById('chatbot-body');
      if (chatBody) {
        chatBody.scrollTop = chatBody.scrollHeight;
      }
    }, 100);

    // Speak out the reply
    this.speakOut(botReply);
  }

  private resolveChatbotReply(input: string): string {
    const q = input.toLowerCase();

    // 1. GREETINGS
    if (q.includes('hare krishna') || q.includes('haribol') || q.includes('hello') || q.includes('hi ') || q.trim() === 'hi') {
      return 'Hare Krishna! दंडवत प्रणाम (Dandavat Pranams). How can I assist you with your yatra today?';
    }

    // 2. HELPLINES
    if (q.includes('helpline') || q.includes('coordinator') || q.includes('contact') || q.includes('number') || q.includes('फोन') || q.includes('नंबर')) {
      const h1 = localStorage.getItem('yatra_helpline1') || '+91 90040 10808';
      const h2 = localStorage.getItem('yatra_helpline2') || '+91 90040 10809';
      return `Yatra Coordinator हेल्पलाइन नंबर आहेत: ${h1} आणि ${h2}. कृपया गरज भासल्यास त्वरित संपर्क साधा.`;
    }

    // 3. ROOM INQUIRY
    if (q.includes('room') || q.includes('hotel') || q.includes('stay') || q.includes('रूम') || q.includes('हॉटेल') || q.includes('राहण्याची')) {
      // Find matches in cached yatris list
      const yatrisStr = localStorage.getItem('api_cache_Yatris');
      if (yatrisStr) {
        try {
          const yatris = JSON.parse(yatrisStr) as any[];
          // Try to extract name or partial keyword matching
          const matched = yatris.find(y => q.includes(y.name.toLowerCase()) || q.includes(y.id.toLowerCase()));
          if (matched) {
            // Find room allocation
            const yBedsStr = localStorage.getItem('api_cache_YatriBeds');
            const roomsStr = localStorage.getItem('api_cache_Rooms');
            const hotelsStr = localStorage.getItem('api_cache_Hotels');
            const allocsStr = localStorage.getItem('api_cache_RoomAllocations');

            if (yBedsStr && roomsStr) {
              const beds = JSON.parse(yBedsStr) as any[];
              const rooms = JSON.parse(roomsStr) as any[];
              const bed = beds.find(b => b.yatriId === matched.id);
              if (bed) {
                const allocs = allocsStr ? JSON.parse(allocsStr) : [];
                const alloc = allocs.find((a: any) => a.id === bed.roomAllocationId);
                const roomId = alloc ? alloc.roomId : bed.roomId;
                const room = rooms.find(r => r.id === roomId);
                if (room) {
                  const hotels = hotelsStr ? JSON.parse(hotelsStr) : [];
                  const hotel = hotels.find((h: any) => h.id === room.hotelId);
                  const hotelText = hotel ? `${hotel.name} (${hotel.city})` : 'Yatra Ashram';
                  return `${matched.name} (ID: ${matched.id}) साठी वाटप केलेली रूम आहे: ${hotelText} मधील रूम नंबर ${room.roomNumber}.`;
                }
              }
            }
            return `${matched.name} (ID: ${matched.id}) नोंदणीकृत आहेत, परंतु सध्या त्यांना रूम वाटप केलेली नाही.`;
          }
        } catch (e) {}
      }
      return 'तुमची रूम जाणून घेण्यासाठी कृपया तुमचे पूर्ण नाव किंवा यात्री आयडी टाइप करा (उदा. "Name साठी कोणती रूम आहे?").';
    }

    // 4. BUS / TRANSIT INQUIRY
    if (q.includes('bus') || q.includes('seat') || q.includes('vehicle') || q.includes('बस') || q.includes('गाडी') || q.includes('सीट')) {
      const yatrisStr = localStorage.getItem('api_cache_Yatris');
      if (yatrisStr) {
        try {
          const yatris = JSON.parse(yatrisStr) as any[];
          const matched = yatris.find(y => q.includes(y.name.toLowerCase()) || q.includes(y.id.toLowerCase()));
          if (matched) {
            const seatsStr = localStorage.getItem('api_cache_YatriSeats');
            const tripsStr = localStorage.getItem('api_cache_VehicleTrips');
            const vehiclesStr = localStorage.getItem('api_cache_Vehicles');

            if (seatsStr && tripsStr) {
              const seats = JSON.parse(seatsStr) as any[];
              const trips = JSON.parse(tripsStr) as any[];
              const seat = seats.find(s => s.yatriId === matched.id);
              if (seat) {
                const trip = trips.find(t => t.id === seat.vehicleTripId);
                if (trip) {
                  const vehicles = vehiclesStr ? JSON.parse(vehiclesStr) : [];
                  const vehicle = vehicles.find((v: any) => v.id === trip.vehicleId);
                  const vehicleText = vehicle ? `${vehicle.name} (प्लेट: ${vehicle.numberPlate})` : `Vehicle ${trip.vehicleId}`;
                  return `${matched.name} साठी वाटप केलेली बस आहे: ${vehicleText}, सीट नंबर S${seat.seatNumber}. मार्ग: ${trip.route || 'Yatra Route'}.`;
                }
              }
            }
            return `${matched.name} नोंदणीकृत आहेत, परंतु सध्या त्यांना बस सीट वाटप केलेली नाही.`;
          }
        } catch (e) {}
      }
      return 'तुमची बस माहिती मिळवण्यासाठी कृपया तुमचे पूर्ण नाव किंवा यात्री आयडी टाइप करा (उदा. "Name साठी कोणती बस आहे?").';
    }

    // 5. ITINERARY / SCHEDULE
    if (q.includes('schedule') || q.includes('itinerary') || q.includes('time') || q.includes('वेळापत्रक') || q.includes('कार्यक्रम') || q.includes('वेळ')) {
      const pkgsStr = localStorage.getItem('api_cache_Packages');
      let details = 'Shravan Yatra २०२६ वेळापत्रक: सकाळी ५ वाजता मंगल आरती, ६ वाजता प्रस्थान, दुपारी १ वाजता महाप्रसाद आणि संध्याकाळी ७ वाजता संध्या आरती व विश्राम.';
      if (pkgsStr) {
        try {
          const pkgs = JSON.parse(pkgsStr) as any[];
          if (pkgs.length > 0) {
            details += ` चालू पॅकेजेस: ${pkgs.map(p => p.name).join(', ')}.`;
          }
        } catch (e) {}
      }
      return details;
    }

    return 'क्षमस्व, मला समजले नाही. आपण मला रूम वाटप, बस सीट वाटप, वेळापत्रक किंवा हेल्पलाइन नंबर बद्दल विचारू शकता. हरे कृष्ण!';
  }

  private speakOut(text: string) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (text.includes('वाटप') || text.includes('आहे') || text.includes('क्षमस्व')) {
      utterance.lang = 'mr-IN';
    } else {
      utterance.lang = 'en-US';
    }
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}
