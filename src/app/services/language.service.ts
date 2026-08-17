import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type SupportedLang = 'english' | 'marathi' | 'kannada' | 'hindi';

const DICT: Record<SupportedLang, Record<string, string>> = {
  english: {
    // ── Sidebar / Header ──────────────────────────────
    dashboard: 'Dashboard', pilgrims: 'Pilgrims Directory',
    packages: 'Tour Packages', ashram: 'Ashram & Lodging',
    transit: 'Transit Tracker', operations: 'Operational Control Center',
    activeTour: 'Active Tour:', admin: 'Yatra Administrator',
    allPackages: 'All Devotional Packages', loading: 'Loading packages...',

    // ── Settings panel ────────────────────────────────
    appSettings: 'App Settings',
    settingsTheme: '🌗 Theme', settingsLight: '☀️ Light', settingsDark: '🌙 Dark',
    settingsFontSize: '🔤 Font Size', settingsLanguage: '🌐 Language',
    settingsAccentColor: '🎨 Accent Color',
    settingsNavbarColor: '🏠 Navbar & Sidebar Color',
    settingsNavNone: 'None', settingsNavLight: 'Light', settingsNavFull: 'Full',
    settingsButtonTone: '🔘 Button Color Tone',
    settingsDarker: '🌑 Darker', settingsNormal: 'Normal', settingsLighter: 'Lighter 🌕',

    // ── Dashboard ─────────────────────────────────────
    dashTitle: 'Executive Dashboard',
    dashRefresh: 'Refresh Data',
    dashSyncing: 'Syncing database records...',
    dashTotalYatris: 'Total Yatris',
    dashActivePackages: 'Active Packages',
    dashAshrams: 'Ashrams & Hotels',
    dashRevenue: 'Total Revenue',
    dashPending: 'Pending Amount',
    dashRecentActivity: 'Recent Activity',
    dashTotalPayment: 'Total Payment',
    dashPaidAmount: 'Paid Amount',
    dashPendingAmount: 'Pending Amount',
    dashFullyPaid: 'Fully Paid',
    dashPartiallyPaid: 'Partially Paid',
    dashUnpaid: 'Unpaid',
    dashYatrisList: 'Yatris List',
    dashPackageDist: 'Package Distribution',

    // ── Operations Tabs & Features ──
    Announcements: 'Announcements',
    Volunteers: 'Volunteers',
    FinanceLedger: 'Finance & Expense Ledger',
    CheckinScanner: 'Check-in Point Scanner',
    PrasadamTracker: 'Prasadam Tracker',
    MedicalIncidents: 'Medical Incidents & Care',
    LostAndFound: 'Lost & Found Management',

    Title: 'Title',
    ContentText: 'Content Text',
    BroadcastPriority: 'Broadcast Priority',
    PublishAnnouncement: 'Publish Announcement',
    SaveAnnouncement: 'Save Announcement',
    ActiveFeeds: 'Active Feeds',

    VolunteerRoster: 'Volunteer Roster',
    ManageDepartments: 'Manage Departments',
    AddVolunteer: 'Add Volunteer',
    VolunteerName: 'Volunteer Name',
    AssignedDepartment: 'Assigned Department',
    DutyTime: 'Duty Time',
    Balance: 'Balance',
    Actions: 'Actions',

    TotalIncome: 'Total Income',
    TotalExpense: 'Total Expense',
    Transfers: 'Transfers',
    NetBalance: 'Net Balance',

    RecordMedicalIncident: 'Record Medical Incident',
    LogLostFoundItem: 'Log Lost / Found Item',
    GiveVolunteerAdvance: 'Give Volunteer Advance',
    AddIncomeDonation: 'Add Income / Donation',
    AddExpense: 'Add Expense',

    PatientName: 'Pilgrim / Patient Name',
    Symptoms: 'Symptoms / Problem',
    TreatmentGiven: 'Treatment Given',
    DoctorName: 'Doctor / Attendant Name',
    CurrentStatus: 'Current Status',
    UnderCare: 'Under Care',
    Recovered: 'Recovered',
    Referred: 'Referred to Hospital',

    ItemCategory: 'Item Category',
    ItemName: 'Item Name',
    ItemDescription: 'Description & Identification',
    Location: 'Location',
    ReportedDate: 'Reported Date',
    OwnerName: 'Owner / Reporter Name',
    ReturnToOwner: 'Return to Owner',
    Returned: 'Returned',
    Lost: 'Lost',
    Found: 'Found',

    MealType: 'Meal Type',
    Breakfast: 'Breakfast',
    Lunch: 'Lunch',
    Dinner: 'Dinner',
    PrasadamTaken: 'Prasadam Taken',
    PendingPrasadam: 'Pending Prasadam',
    MarkPrasadamTaken: 'Mark Prasadam Taken',

    // ── Dashboard UI strings ──────────────────────────
    BudgetTracker: 'Budget Tracker',
    Surplus: 'Surplus', Deficit: 'Deficit',
    CareNeeded: 'Care Needed',
    EmergencyContact: 'Emergency Contact',
    NoAlerts: 'No recent alerts.',
    NoAnnouncements: 'No active announcements.',
    NoPayments: 'No payments registered.',
    ScanYatriQR: 'Scan Yatri QR',
    BroadcastCenter: 'Broadcast Center',
    expenseDistTitle: 'Expense Distribution',
    medicalAlertTitle: 'Critical Medical Watchlist',
    YatriReference: 'Yatri Reference',
    AllocatedRoom: 'Allocated Room',
    AllocatedBus: 'Allocated Bus',
    Name: 'Name',
    YatriID: 'Yatri ID',

    // ── Yatri Table Headers ───────────────────────────
    SrNo: 'Sr. No',
    RegDate: 'Reg. Date',
    PassengerName: 'Passenger Name',
    Mobile: 'Mobile',
    Finances: 'Finances',
    HideFinances: 'Hide Finances',
    ShowFinances: 'Show Finances',
    ImportExcel: 'Import Excel',
    YatraPass: 'Yatra Pass & ID Cards',
    ScanAttendance: 'Scan Attendance',
    TotalCost: 'Total Cost',
    PaidAmount: 'Paid Amount',
    PendingAmount: 'Pending Amount',
    DateAndTime: 'Date & Time',
    Mode: 'Mode',
    InstallmentPaid: 'Installment Paid',
    Remarks: 'Remarks / Receipt',

    // ── Hotels Table Headers ──────────────────────────
    RoomNo: 'Room #',
    Type: 'Type',
    Capacity: 'Capacity',
    Building: 'Building',
    Floor: 'Floor',

    // ── Transit Table Headers ─────────────────────────
    SeatNo: 'Seat #',
    AgeSex: 'Age / Sex',
    ContactNo: 'Contact #',
    Signature: 'Signature',

    // ── Common ────────────────────────────────────────
    close: 'Close', save: 'Save', cancel: 'Cancel',
    print: 'Print', edit: 'Edit', delete: 'Delete',
    confirm: 'Confirm', back: 'Back',
    yes: 'Yes', no: 'No', search: 'Search...',
    status: 'Status', date: 'Date', action: 'Actions'
  },

  marathi: {
    // ── Sidebar / Header ──────────────────────────────
    dashboard: 'मुख्यपृष्ठ', pilgrims: 'यात्री यादी',
    packages: 'टूर पॅकेज', ashram: 'आश्रम व निवास',
    transit: 'प्रवास ट्रॅकर', operations: 'कार्यसंचालन केंद्र',
    activeTour: 'सक्रिय टूर:', admin: 'यात्रा प्रशासक',
    allPackages: 'सर्व पॅकेज', loading: 'लोड होत आहे...',

    // ── Settings panel ────────────────────────────────
    appSettings: 'ॲप सेटिंग्ज',
    settingsTheme: '🌗 थीम', settingsLight: '☀️ उजळ', settingsDark: '🌙 गडद',
    settingsFontSize: '🔤 अक्षर आकार', settingsLanguage: '🌐 भाषा',
    settingsAccentColor: '🎨 रंग निवड',
    settingsNavbarColor: '🏠 Navbar व Sidebar रंग',
    settingsNavNone: 'नाही', settingsNavLight: 'हलका', settingsNavFull: 'पूर्ण',
    settingsButtonTone: '🔘 बटण रंग टोन',
    settingsDarker: '🌑 गडद', settingsNormal: 'सामान्य', settingsLighter: 'हलका 🌕',

    // ── Dashboard ─────────────────────────────────────
    dashTitle: 'मुख्य डॅशबोर्ड',
    dashRefresh: 'ताजे करा',
    dashSyncing: 'डेटाबेस अपडेट होत आहे...',
    dashTotalYatris: 'एकूण यात्री',
    dashActivePackages: 'सक्रिय पॅकेज',
    dashAshrams: 'आश्रम व हॉटेल',
    dashRevenue: 'एकूण महसूल',
    dashPending: 'बाकी रक्कम',
    dashRecentActivity: 'अलीकडील क्रियाकलाप',
    dashTotalPayment: 'एकूण पेमेंट',
    dashPaidAmount: 'भरलेली रक्कम',
    dashPendingAmount: 'बाकी रक्कम',
    dashFullyPaid: 'पूर्ण भरले',
    dashPartiallyPaid: 'अंशतः भरले',
    dashUnpaid: 'न भरलेले',
    dashYatrisList: 'यात्री यादी',
    dashPackageDist: 'पॅकेज वितरण',

    // ── Operations Tabs & Features ──
    Announcements: 'घोषणा',
    Volunteers: 'स्वयंसेवक',
    FinanceLedger: 'वित्त व खर्च खाते',
    CheckinScanner: 'चेक-इन स्कॅनर',
    PrasadamTracker: 'महाप्रसाद ट्रॅकर',
    MedicalIncidents: 'वैद्यकीय तक्रारी व सेवा',
    LostAndFound: 'गहाळ व सापडलेल्या वस्तू',

    Title: 'शीर्षक',
    ContentText: 'संदेश मजकूर',
    BroadcastPriority: 'प्राधान्य',
    PublishAnnouncement: 'घोषणा प्रसिद्ध करा',
    SaveAnnouncement: 'घोषणा सेव्ह करा',
    ActiveFeeds: 'सक्रिय घोषणा',

    VolunteerRoster: 'स्वयंसेवक यादी',
    ManageDepartments: 'विभाग व्यवस्थापन',
    AddVolunteer: 'स्वयंसेवक जोडा',
    VolunteerName: 'स्वयंसेवकाचे नाव',
    AssignedDepartment: 'नियुक्त विभाग',
    DutyTime: 'शिफ्ट वेळ',
    Balance: 'शिल्लक',
    Actions: 'कृती',

    TotalIncome: 'एकूण जमा',
    TotalExpense: 'एकूण खर्च',
    Transfers: 'हस्तांतरण',
    NetBalance: 'निव्वळ शिल्लक',

    RecordMedicalIncident: 'वैद्यकीय नोंद जोडा',
    LogLostFoundItem: 'वस्तूची नोंद जोडा',
    GiveVolunteerAdvance: 'स्वयंसेवक ॲडव्हान्स',
    AddIncomeDonation: 'जमा/देणगी जोडा',
    AddExpense: 'खर्च जोडा',

    PatientName: 'रुग्णाचे नाव',
    Symptoms: 'लक्षणे / समस्या',
    TreatmentGiven: 'दिलेले औषधोपचार',
    DoctorName: 'डॉक्टर / सेवक',
    CurrentStatus: 'सध्याची स्थिती',
    UnderCare: 'उपचार सुरू',
    Recovered: 'पूर्ण बरे झाले',
    Referred: 'हॉस्पिटलमध्ये पाठवले',

    ItemCategory: 'वस्तूचा प्रकार',
    ItemName: 'वस्तूचे नाव',
    ItemDescription: 'सविस्तर वर्णन',
    Location: 'ठिकाण',
    ReportedDate: 'नोंदणी दिनांक',
    OwnerName: 'मालक / तक्रारदार',
    ReturnToOwner: 'मालकाला सुपूर्द करा',
    Returned: 'परत केले',
    Lost: 'गहाळ',
    Found: 'सापडले',

    MealType: 'जेवणाचा प्रकार',
    Breakfast: 'नाश्ता',
    Lunch: 'दुपारचे जेवण',
    Dinner: 'रात्रीचे जेवण',
    PrasadamTaken: 'प्रसाद घेतला',
    PendingPrasadam: 'प्रसाद बाकी',
    MarkPrasadamTaken: 'प्रसाद घेतला म्हणून मार्क करा',

    // ── Dashboard UI strings ──────────────────────────
    BudgetTracker: 'बजेट ट्रॅकर',
    Surplus: 'शिल्लक', Deficit: 'तुट',
    CareNeeded: 'काळजी आवश्यक',
    EmergencyContact: 'आपत्कालीन संपर्क',
    NoAlerts: 'कोणतेही नवीन अलर्ट नाहीत.',
    NoAnnouncements: 'कोणतीही घोषणा प्रसिद्ध केलेली नाही.',
    NoPayments: 'कोणतेही पेमेंट नोंदवले नाही.',
    ScanYatriQR: 'यात्री QR स्कॅन करा',
    BroadcastCenter: 'प्रसारण केंद्र',
    expenseDistTitle: 'खर्चाचे वितरण',
    medicalAlertTitle: 'अत्यावश्यक वैद्यकीय यादी',
    YatriReference: 'यात्री संदर्भ',
    AllocatedRoom: 'वाटलेली खोली',
    AllocatedBus: 'वाटलेली बस',
    Name: 'नाव',
    YatriID: 'यात्री ओळखपत्र',

    // ── Yatri Table Headers ───────────────────────────
    SrNo: 'अ. क्र.',
    RegDate: 'नोंदणी दिनांक',
    PassengerName: 'प्रवाशाचे नाव',
    Mobile: 'मोबाईल',
    Finances: 'देयक',
    HideFinances: 'देयक लपवा',
    ShowFinances: 'देयक दाखवा',
    ImportExcel: 'Excel आयात करा',
    YatraPass: 'यात्रा पास आणि ओळखपत्र',
    ScanAttendance: 'उपस्थिती स्कॅन',
    TotalCost: 'एकूण खर्च',
    PaidAmount: 'भरलेली रक्कम',
    PendingAmount: 'बाकी रक्कम',
    DateAndTime: 'दिनांक आणि वेळ',
    Mode: 'पद्धत',
    InstallmentPaid: 'हप्ता भरणा',
    Remarks: 'शेरा / पावती',

    // ── Hotels Table Headers ──────────────────────────
    RoomNo: 'खोली क्र.',
    Type: 'प्रकार',
    Capacity: 'क्षमता',
    Building: 'इमारत',
    Floor: 'मजला',

    // ── Transit Table Headers ─────────────────────────
    SeatNo: 'सीट क्र.',
    AgeSex: 'वय / लिंग',
    ContactNo: 'संपर्क क्र.',
    Signature: 'स्वाक्षरी',

    // ── Common ────────────────────────────────────────
    close: 'बंद करा', save: 'जतन करा', cancel: 'रद्द करा',
    print: 'प्रिंट करा', edit: 'संपादित करा', delete: 'हटवा',
    confirm: 'पुष्टी करा', back: 'मागे',
    yes: 'होय', no: 'नाही', search: 'शोधा...',
    status: 'स्थिती', date: 'दिनांक', action: 'कृती'
  },

  kannada: {
    // ── Sidebar / Header ──────────────────────────────
    dashboard: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್', pilgrims: 'ಯಾತ್ರಿಕರ ಪಟ್ಟಿ',
    packages: 'ಪ್ರವಾಸ ಪ್ಯಾಕೇಜ್', ashram: 'ಆಶ್ರಮ ಮತ್ತು ವಸತಿ',
    transit: 'ಪ್ರಯಾಣ ಟ್ರ್ಯಾಕರ್', operations: 'ಕಾರ್ಯಕಾರಿ ನಿಯಂತ್ರಣ ಕೇಂದ್ರ',
    activeTour: 'ಸಕ್ರಿಯ ಪ್ರವಾಸ:', admin: 'ಯಾತ್ರಾ ಆಡಳಿತಗಾರ',
    allPackages: 'ಎಲ್ಲಾ ಪ್ಯಾಕೇಜ್‌ಗಳು', loading: 'ಲೋಡ್ ಆಗುತ್ತಿದೆ...',

    // ── Settings panel ────────────────────────────────
    appSettings: 'ಆಪ್ ಸಂಯೋಜನೆಗಳು',
    settingsTheme: '🌗 ಥೀಮ್', settingsLight: '☀️ ಬೆಳಕು', settingsDark: '🌙 ಕತ್ತಲೆ',
    settingsFontSize: '🔤 ಅಕ್ಷರ ಗಾತ್ರ', settingsLanguage: '🌐 ಭಾಷೆ',
    settingsAccentColor: '🎨 ಬಣ್ಣದ ಆಯ್ಕೆ',
    settingsNavbarColor: '🏠 Navbar ಬಣ್ಣ',
    settingsNavNone: 'ಯಾವುದೂ ಇಲ್ಲ', settingsNavLight: 'ತಿಳಿ', settingsNavFull: 'ಪೂರ್ಣ',
    settingsButtonTone: '🔘 ಬಟನ್ ಶೈಲಿ',
    settingsDarker: '🌑 ಗಾಢ', settingsNormal: 'ಸಾಮಾನ್ಯ', settingsLighter: 'ತಿಳಿ 🌕',

    // ── Dashboard ─────────────────────────────────────
    dashTitle: 'ಮುಖ್ಯ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
    dashRefresh: 'ನವೀಕರಿಸಿ',
    dashSyncing: 'ಡೇಟಾಬೇಸ್ ಅಪ್‌ಡೇಟ್ ಆಗುತ್ತಿದೆ...',
    dashTotalYatris: 'ಒಟ್ಟು ಯಾತ್ರಿಕರು',
    dashActivePackages: 'ಸಕ್ರಿಯ ಪ್ಯಾಕೇಜ್‌ಗಳು',
    dashAshrams: 'ಆಶ್ರಮ ಮತ್ತು ಹೋಟೆಲ್',
    dashRevenue: 'ಒಟ್ಟು ಆದಾಯ',
    dashPending: 'ಬಾಕಿ ಮೊತ್ತ',
    dashRecentActivity: 'ಇತ್ತೀಚಿನ ಚಟುವಟಿಕೆ',
    dashTotalPayment: 'ಒಟ್ಟು ಪಾವತಿ',
    dashPaidAmount: 'ಪಾವತಿಸಿದ ಮೊತ್ತ',
    dashPendingAmount: 'ಬಾಕಿ ಮೊತ್ತ',
    dashFullyPaid: 'ಪೂರ್ಣ ಪಾವತಿಸಲಾಗಿದೆ',
    dashPartiallyPaid: 'ಭಾಗಶಃ ಪಾವತಿಸಲಾಗಿದೆ',
    dashUnpaid: 'ಪಾವತಿಸಲಾಗಿಲ್ಲ',
    dashYatrisList: 'ಯಾತ್ರಿಕರ ಪಟ್ಟಿ',
    dashPackageDist: 'ಪ್ಯಾಕೇಜ್ ವಿತರಣೆ',

    // ── Operations Tabs & Features ──
    Announcements: 'ಘೋಷಣೆಗಳು',
    Volunteers: 'ಸ್ವಯಂಸೇವಕರು',
    FinanceLedger: 'ಹಣಕಾಸು ಲೆಡ್ಜರ್',
    CheckinScanner: 'ಚೆಕ್-ಇನ್ ಸ್ಕ್ಯಾನರ್',
    PrasadamTracker: 'ಪ್ರಸಾದ ಟ್ರ್ಯಾಕರ್',
    MedicalIncidents: 'ವೈದ್ಯಕೀಯ ಆರೈಕೆ',
    LostAndFound: 'ಕಳೆದುಹೋದ ಮತ್ತು ಸಿಕ್ಕಿದ ವಸ್ತುಗಳು',

    Title: 'ಶೀರ್ಷಿಕೆ',
    ContentText: 'ಸಂದೇಶ ವಿವರ',
    BroadcastPriority: 'ಆದ್ಯತೆ',
    PublishAnnouncement: 'ಘೋಷಣೆ ಪ್ರಕಟಿಸಿ',
    SaveAnnouncement: 'ಘೋಷಣೆ ಉಳಿಸಿ',
    ActiveFeeds: 'ಸಕ್ರಿಯ ಪ್ರಕಟಣೆಗಳು',

    VolunteerRoster: 'ಸ್ವಯಂಸೇವಕರ ಪಟ್ಟಿ',
    ManageDepartments: 'ವಿಭಾಗಗಳ ನಿರ್ವಹಣೆ',
    AddVolunteer: 'ಸ್ವಯಂಸೇವಕರನ್ನು ಸೇರಿಸಿ',
    VolunteerName: 'ಸ್ವಯಂಸೇವಕರ ಹೆಸರು',
    AssignedDepartment: 'ನಿಯೋಜಿತ ವಿಭಾಗ',
    DutyTime: 'ಕರ್ತವ್ಯ ಸಮಯ',
    Balance: 'ಬಾಕಿ',
    Actions: 'ಕ್ರಿಯೆಗಳು',

    TotalIncome: 'ಒಟ್ಟು ಆದಾಯ',
    TotalExpense: 'ಒಟ್ಟು ವೆಚ್ಚ',
    Transfers: 'ವರ್ಗಾವಣೆಗಳು',
    NetBalance: 'ನಿವ್ವಳ ಬಾಕಿ',

    RecordMedicalIncident: 'ವೈದ್ಯಕೀಯ ಮಾಹಿತಿ ದಾಖಲಿಸಿ',
    LogLostFoundItem: 'ವಸ್ತುವಿನ ಮಾಹಿತಿ ದಾಖಲಿಸಿ',
    GiveVolunteerAdvance: 'ಸ್ವಯಂಸೇವಕ ಮುಂಗಡ',
    AddIncomeDonation: 'ಆದಾಯ/ದೇಣಿಗೆ ಸೇರಿಸಿ',
    AddExpense: 'ವೆಚ್ಚ ಸೇರಿಸಿ',

    PatientName: 'ರೋಗಿಯ ಹೆಸರು',
    Symptoms: 'ರೋಗಲಕ್ಷಣಗಳು / ಸಮಸ್ಯೆ',
    TreatmentGiven: 'ನೀಡಿದ ಚಿಕಿತ್ಸೆ',
    DoctorName: 'ವೈದ್ಯರು / ಆರೈಕೆದಾರ',
    CurrentStatus: 'ಪ್ರಸ್ತುತ ಸ್ಥಿತಿ',
    UnderCare: 'ಚಿಕಿತ್ಸೆಯಲ್ಲಿದ್ದಾರೆ',
    Recovered: 'ಗುಣಮುಖರಾಗಿದ್ದಾರೆ',
    Referred: 'ಆಸ್ಪತ್ರೆಗೆ ಕಳುಹಿಸಲಾಗಿದೆ',

    ItemCategory: 'ವಸ್ತುವಿನ ವರ್ಗ',
    ItemName: 'ವಸ್ತುವಿನ ಹೆಸರು',
    ItemDescription: 'ವಿವರಣೆ ಮತ್ತು ಗುರುತು',
    Location: 'ಸ್ಥಳ',
    ReportedDate: 'ವರದಿ ಮಾಡಿದ ದಿನಾಂಕ',
    OwnerName: 'ಮಾಲೀಕರು / ವರದಿಗಾರರು',
    ReturnToOwner: 'ಮಾಲೀಕರಿಗೆ ಹಿಂತಿರುಗಿಸಿ',
    Returned: 'ಹಿಂತಿರುಗಿಸಲಾಗಿದೆ',
    Lost: 'ಕಳೆದುಹೋಗಿದೆ',
    Found: 'ಸಿಕ್ಕಿದೆ',

    MealType: 'ಊಟದ ಪ್ರಕಾರ',
    Breakfast: 'ಉಪಾಹಾರ',
    Lunch: 'ಮಧ್ಯಾಹ್ನದ ಊಟ',
    Dinner: 'ರಾತ್ರಿ ಊಟ',
    PrasadamTaken: 'ಪ್ರಸಾದ ಸ್ವೀಕರಿಸಲಾಗಿದೆ',
    PendingPrasadam: 'ಪ್ರಸಾದ ಬಾಕಿ',
    MarkPrasadamTaken: 'ಪ್ರಸಾದ ಸ್ವೀಕರಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಿ',

    // ── Dashboard UI strings ──────────────────────────
    BudgetTracker: 'ಬಜೆಟ್ ಟ್ರ್ಯಾಕರ್',
    Surplus: 'ಉಳಿಕೆ', Deficit: 'ಕೊರತೆ',
    CareNeeded: 'ಆರೈಕೆ ಅಗತ್ಯ',
    EmergencyContact: 'ತುರ್ತು ಸಂಪರ್ಕ',
    NoAlerts: 'ಯಾವುದೇ ಇತ್ತೀಚಿನ ಎಚ್ಚರಿಕೆಗಳಿಲ್ಲ.',
    NoAnnouncements: 'ಯಾವುದೇ ಸಕ್ರಿಯ ಪ್ರಕಟಣೆಗಳಿಲ್ಲ.',
    NoPayments: 'ಯಾವುದೇ ಪಾವತಿಗಳನ್ನು ನೋಂದಾಯಿಸಿಲ್ಲ.',
    ScanYatriQR: 'ಯಾತ್ರಿ QR ಸ್ಕ್ಯಾನ್ ಮಾಡಿ',
    BroadcastCenter: 'ಪ್ರಸಾರ ಕೇಂದ್ರ',
    expenseDistTitle: 'ವೆಚ್ಚ ವಿತರಣೆ',
    medicalAlertTitle: 'ತುರ್ತು ವೈದ್ಯಕೀಯ ಪಟ್ಟಿ',
    YatriReference: 'ಯಾತ್ರಿ ಉಲ್ಲೇಖ',
    AllocatedRoom: 'ನಿಯೋಜಿತ ಕೊಠಡಿ',
    AllocatedBus: 'ನಿಯೋಜಿತ ಬಸ್',
    Name: 'ಹೆಸರು',
    YatriID: 'ಯಾತ್ರಿ ಗುರುತು',

    // ── Yatri Table Headers ───────────────────────────
    SrNo: 'ಕ್ರ. ಸಂ.',
    RegDate: 'ನೋಂದಣಿ ದಿನಾಂಕ',
    PassengerName: 'ಪ್ರಯಾಣಿಕರ ಹೆಸರು',
    Mobile: 'ಮೊಬೈಲ್',
    Finances: 'ಹಣಕಾಸು',
    HideFinances: 'ಹಣಕಾಸು ಮರೆಮಾಡಿ',
    ShowFinances: 'ಹಣಕಾಸು ತೋರಿಸಿ',
    ImportExcel: 'Excel ಆಮದು',
    YatraPass: 'ಯಾತ್ರಾ ಪಾಸ್ ಮತ್ತು ಐಡಿ ಕಾರ್ಡ್',
    ScanAttendance: 'ಹಾಜರಾತಿ ಸ್ಕ್ಯಾನ್',
    TotalCost: 'ಒಟ್ಟು ವೆಚ್ಚ',
    PaidAmount: 'ಪಾವತಿಸಿದ ಮೊತ್ತ',
    PendingAmount: 'ಬಾಕಿ ಮೊತ್ತ',
    DateAndTime: 'ದಿನಾಂಕ ಮತ್ತು ಸಮಯ',
    Mode: 'ವಿಧಾನ',
    InstallmentPaid: 'ಕಂತು ಪಾವತಿ',
    Remarks: 'ಟಿಪ್ಪಣಿ / ರಸೀದಿ',

    // ── Hotels Table Headers ──────────────────────────
    RoomNo: 'ಕೊಠಡಿ #',
    Type: 'ಪ್ರಕಾರ',
    Capacity: 'ಸಾಮರ್ಥ್ಯ',
    Building: 'ಕಟ್ಟಡ',
    Floor: 'ಮಹಡಿ',

    // ── Transit Table Headers ─────────────────────────
    SeatNo: 'ಸೀಟ್ #',
    AgeSex: 'ವಯಸ್ಸು / ಲಿಂಗ',
    ContactNo: 'ಸಂಪರ್ಕ #',
    Signature: 'ಸಹಿ',

    // ── Common ────────────────────────────────────────
    close: 'ಮುಚ್ಚಿ', save: 'ಉಳಿಸಿ', cancel: 'ರದ್ದುಗೊಳಿಸಿ',
    print: 'ಪ್ರಿಂಟ್ ಮಾಡಿ', edit: 'ಸಂಪಾದಿಸಿ', delete: 'ಅಳಿಸಿ',
    confirm: 'ಖಚಿತಪಡಿಸಿ', back: 'ಹಿಂತಿರುಗಿ',
    yes: 'ಹೌದು', no: 'ಇಲ್ಲ', search: 'ಹುಡುಕಿ...',
    status: 'ಸ್ಥಿತಿ', date: 'ದಿನಾಂಕ', action: 'ಕ್ರಿಯೆಗಳು'
  },

  hindi: {
    // ── Sidebar / Header ──────────────────────────────
    dashboard: 'डैशबोर्ड', pilgrims: 'यात्री निर्देशिका',
    packages: 'टूर पैकेज', ashram: 'आश्रम और आवास',
    transit: 'ट्रांजिट ट्रैकर', operations: 'परिचालन नियंत्रण केंद्र',
    activeTour: 'सक्रिय टूर:', admin: 'यात्रा प्रशासक',
    allPackages: 'सभी पैकेज', loading: 'लोड हो रहा है...',

    // ── Settings panel ────────────────────────────────
    appSettings: 'ऐप सेटिंग्स',
    settingsTheme: '🌗 थीम', settingsLight: '☀️ हल्का', settingsDark: '🌙 गहरा',
    settingsFontSize: '🔤 फ़ॉन्ट आकार', settingsLanguage: '🌐 भाषा',
    settingsAccentColor: '🎨 रंग',
    settingsNavbarColor: '🏠 नेवबार का रंग',
    settingsNavNone: 'कोई नहीं', settingsNavLight: 'हल्का', settingsNavFull: 'पूरा',
    settingsButtonTone: '🔘 बटन टोन',
    settingsDarker: '🌑 गहरा', settingsNormal: 'सामान्य', settingsLighter: 'हल्का 🌕',

    // ── Dashboard ─────────────────────────────────────
    dashTitle: 'मुख्य डैशबोर्ड',
    dashRefresh: 'रिफ्रेश करें',
    dashSyncing: 'डेटा अपडेट हो रहा है...',
    dashTotalYatris: 'कुल यात्री',
    dashActivePackages: 'सक्रिय पैकेज',
    dashAshrams: 'आश्रम और होटल',
    dashRevenue: 'कुल राजस्व',
    dashPending: 'बकाया राशि',
    dashRecentActivity: 'हाल की गतिविधि',
    dashTotalPayment: 'कुल भुगतान',
    dashPaidAmount: 'भुगतान किया गया',
    dashPendingAmount: 'बकाया राशि',
    dashFullyPaid: 'पूर्ण भुगतान',
    dashPartiallyPaid: 'आंशिक भुगतान',
    dashUnpaid: 'अदत्त',
    dashYatrisList: 'यात्री सूची',
    dashPackageDist: 'पैकेज वितरण',

    // ── Operations Tabs & Features ──
    Announcements: 'घोषणाएं',
    Volunteers: 'स्वयंसेवक',
    FinanceLedger: 'वित्त और व्यय बही',
    CheckinScanner: 'चेक-इन स्कैनर',
    PrasadamTracker: 'महाप्रसाद ट्रैकर',
    MedicalIncidents: 'चिकित्सा देखभाल',
    LostAndFound: 'खोया और पाया प्रबंधन',

    Title: 'शीर्षक',
    ContentText: 'सामग्री विवरण',
    BroadcastPriority: 'प्राथमिकता',
    PublishAnnouncement: 'घोषणा प्रकाशित करें',
    SaveAnnouncement: 'घोषणा सहेजें',
    ActiveFeeds: 'सक्रिय घोषणाएं',

    VolunteerRoster: 'स्वयंसेवक सूची',
    ManageDepartments: 'विभाग प्रबंधन',
    AddVolunteer: 'स्वयंसेवक जोड़ें',
    VolunteerName: 'स्वयंसेवक का नाम',
    AssignedDepartment: 'आवंटित विभाग',
    DutyTime: 'ड्यूटी समय',
    Balance: 'शेष',
    Actions: 'कार्रवाई',

    TotalIncome: 'कुल आय',
    TotalExpense: 'कुल व्यय',
    Transfers: 'स्थानांतरण',
    NetBalance: 'शुद्ध शेष',

    RecordMedicalIncident: 'चिकित्सा घटना दर्ज करें',
    LogLostFoundItem: 'खोई/पाई वस्तु दर्ज करें',
    GiveVolunteerAdvance: 'स्वयंसेवक अग्रिम',
    AddIncomeDonation: 'आय/दान जोड़ें',
    AddExpense: 'व्यय जोड़ें',

    PatientName: 'मरीज का नाम',
    Symptoms: 'लक्षण / समस्या',
    TreatmentGiven: 'दिया गया उपचार',
    DoctorName: 'डॉक्टर / अटेंडेंट',
    CurrentStatus: 'वर्तमान स्थिति',
    UnderCare: 'देखरेख में',
    Recovered: 'ठीक हो गए',
    Referred: 'अस्पताल में संदर्भित',

    ItemCategory: 'वस्तु की श्रेणी',
    ItemName: 'वस्तु का नाम',
    ItemDescription: 'विवरण और पहचान',
    Location: 'स्थान',
    ReportedDate: 'रिपोर्ट की गई तारीख',
    OwnerName: 'मालिक / रिपोर्टर',
    ReturnToOwner: 'मालिक को लौटाएं',
    Returned: 'लौटा दिया गया',
    Lost: 'खोया',
    Found: 'पाया',

    MealType: 'भोजन का प्रकार',
    Breakfast: 'नाश्ता',
    Lunch: 'दोपहर का भोजन',
    Dinner: 'रात का भोजन',
    PrasadamTaken: 'प्रसाद ग्रहण किया',
    PendingPrasadam: 'प्रसाद बकाया',
    MarkPrasadamTaken: 'प्रसाद ग्रहण किया मार्क करें',

    // ── Dashboard UI strings ──────────────────────────
    BudgetTracker: 'बजट ट्रैकर',
    Surplus: 'अधिशेष', Deficit: 'घाटा',
    CareNeeded: 'देखभाल आवश्यक',
    EmergencyContact: 'आपातकालीन संपर्क',
    NoAlerts: 'कोई हालिया अलर्ट नहीं।',
    NoAnnouncements: 'कोई सक्रिय घोषणा नहीं।',
    NoPayments: 'कोई भुगतान दर्ज नहीं।',
    ScanYatriQR: 'यात्री QR स्कैन करें',
    BroadcastCenter: 'प्रसारण केंद्र',
    expenseDistTitle: 'व्यय वितरण',
    medicalAlertTitle: 'अत्यावश्यक चिकित्सा सूची',
    YatriReference: 'यात्री संदर्भ',
    AllocatedRoom: 'आवंटित कमरा',
    AllocatedBus: 'आवंटित बस',
    Name: 'नाम',
    YatriID: 'यात्री आईडी',

    // ── Yatri Table Headers ───────────────────────────
    SrNo: 'क्र. सं.',
    RegDate: 'पंजीकरण दिनांक',
    PassengerName: 'यात्री का नाम',
    Mobile: 'मोबाइल',
    Finances: 'भुगतान',
    HideFinances: 'भुगतान छिपाएं',
    ShowFinances: 'भुगतान दिखाएं',
    ImportExcel: 'Excel आयात करें',
    YatraPass: 'यात्रा पास और आईडी कार्ड',
    ScanAttendance: 'उपस्थिति स्कैन',
    TotalCost: 'कुल लागत',
    PaidAmount: 'भुगतान की गई राशि',
    PendingAmount: 'बकाया राशि',
    DateAndTime: 'दिनांक और समय',
    Mode: 'माध्यम',
    InstallmentPaid: 'किस्त भुगतान',
    Remarks: 'टिप्पणी / रसीद',

    // ── Hotels Table Headers ──────────────────────────
    RoomNo: 'कमरा #',
    Type: 'प्रकार',
    Capacity: 'क्षमता',
    Building: 'भवन',
    Floor: 'मंजिल',

    // ── Transit Table Headers ─────────────────────────
    SeatNo: 'सीट #',
    AgeSex: 'आयु / लिंग',
    ContactNo: 'संपर्क #',
    Signature: 'हस्ताक्षर',

    // ── Common ────────────────────────────────────────
    close: 'बंद करें', save: 'सहेजें', cancel: 'रद्द करें',
    print: 'प्रिंट करें', edit: 'संपादित करें', delete: 'हटाएं',
    confirm: 'पुष्टि करें', back: 'वापस',
    yes: 'हाँ', no: 'नहीं', search: 'खोजें...',
    status: 'स्थिति', date: 'दिनांक', action: 'कार्रवाई'
  }
};

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private langSubject = new BehaviorSubject<SupportedLang>('english');
  lang$ = this.langSubject.asObservable();

  get current(): SupportedLang {
    return this.langSubject.value;
  }

  setLanguage(lang: SupportedLang) {
    if (!DICT[lang]) return;
    this.langSubject.next(lang);
    localStorage.setItem('app_language', lang);
    document.documentElement.setAttribute('lang',
      lang === 'marathi' ? 'mr' : lang === 'kannada' ? 'kn' : lang === 'hindi' ? 'hi' : 'en');
  }

  /**
   * Main Translation Method
   * Replaces text according to currently selected language in Settings,
   * skipping numeric/integer values.
   */
  t(keyOrText: string): string {
    if (!keyOrText) return '';
    const str = String(keyOrText).trim();

    // 1. Skip pure integers or decimal numbers (e.g. 123, 5000, 9876543210, ₹100)
    if (/^[\d.,\s₹$+-]+$/.test(str)) {
      return keyOrText;
    }

    const currentLang = this.current;

    // 2. Direct dictionary key match
    if (DICT[currentLang]?.[keyOrText]) {
      return DICT[currentLang][keyOrText];
    }

    if (currentLang === 'english') {
      return DICT.english[keyOrText] ?? keyOrText;
    }

    // 3. Match against English values or keys
    const lowerKey = keyOrText.toLowerCase();
    const matchedKey = Object.keys(DICT.english).find(k =>
      k.toLowerCase() === lowerKey || DICT.english[k].toLowerCase() === lowerKey
    );

    if (matchedKey && DICT[currentLang]?.[matchedKey]) {
      return DICT[currentLang][matchedKey];
    }

    // 4. Fallback lookup in English dictionary or return original
    return DICT.english[keyOrText] ?? keyOrText;
  }

  restore() {
    const saved = localStorage.getItem('app_language') as SupportedLang;
    if (saved && DICT[saved]) { this.setLanguage(saved); }
  }
}
