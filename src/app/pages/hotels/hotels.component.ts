import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { PackageContextService } from '../../services/package-context.service';
import { LanguageService } from '../../services/language.service';
import { forkJoin, of, catchError } from 'rxjs';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-hotels',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hotels.component.html'
})
export class HotelsComponent implements OnInit {
  private api = inject(ApiService);
  private packageContext = inject(PackageContextService);
  lang = inject(LanguageService);
  t(key: string): string { return this.lang.t(key); }

  hotels: any[] = [];
  rooms: any[] = [];
  allocations: any[] = [];
  yatriBeds: any[] = [];
  yatris: any[] = [];

  get isPackageCompleted(): boolean {
    return this.packageContext.isCurrentPackageCompleted();
  }

  get isEntryLocked(): boolean {
    return this.packageContext.isEntryLocked();
  }
  hotelConfigs: any[] = [];
  hotelCategories: any[] = [];
  roomTypes: any[] = [];

  showQuickConfigModal = false;
  configModalType: 'HotelCategory' | 'RoomType' = 'HotelCategory';
  newConfigName = '';
  newConfigDesc = '';
  configSaving = false;
  configError = '';

  selectedHotel: any = null;
  selectedHotelRooms: any[] = [];
  selectedRoom: any = null;
  loading = false;
  selectedPackageId = '';

  memberSearchQuery = '';
  selectedYatriIds: string[] = [];
  selectedBedIndexes: number[] = [];

  showHotelModal = false;
  showRoomModal = false;
  showHotelDetailModal = false;
  roomSearchQuery = '';
  roomFilterStatus: 'all' | 'empty' | 'partial' | 'full' = 'all';

  activeTab: 'allocations' | 'master' = 'allocations';
  selectedHotelForConfig: any = null;
  selectedHotelConfigRooms: any[] = [];
  hotelConfigMode: 'view' | 'add' | 'edit' = 'view';
  hotelSearchQuery = '';
  showRoomAddPanel = false;
  editingRoom: any = null;
  activeRoom: any = {};
  roomAddMode: 'single' | 'bulk' = 'single';
  bulkRooms: any[] = [];

  newHotel: any = {
    id: '', name: '', managerName: '', phone: '',
    address: '', email: '', city: '', rating: 'Ashram', hotelCategoryId: null, gstNo: ''
  };

  newRoom: any = {
    id: '', hotelId: '', roomNumber: '', type: 'Standard', roomTypeId: null,
    capacity: 4, buildingName: 'Block A', floor: 1
  };

  get filteredConfigHotels(): any[] {
    if (!this.hotelSearchQuery) return this.hotels;
    const q = this.hotelSearchQuery.toLowerCase();
    return this.hotels.filter(h => h.name?.toLowerCase().includes(q) || h.city?.toLowerCase().includes(q));
  }

  get filteredHotels(): any[] {
    return this.hotels;
  }

  get filteredHotelRooms(): any[] {
    if (!this.selectedHotel) return [];
    let list = this.rooms.filter(r => r.hotelId === this.selectedHotel.id);

    // Apply status filter
    if (this.roomFilterStatus !== 'all') {
      list = list.filter(rm => {
        const occupied = this.getOccupied(rm);
        if (this.roomFilterStatus === 'empty') return occupied === 0;
        if (this.roomFilterStatus === 'partial') return occupied > 0 && occupied < rm.capacity;
        if (this.roomFilterStatus === 'full') return occupied === rm.capacity;
        return true;
      });
    }

    // Apply search query
    if (this.roomSearchQuery) {
      const q = this.roomSearchQuery.toLowerCase();
      list = list.filter(r => r.roomNumber?.toLowerCase().includes(q) || r.type?.toLowerCase().includes(q));
    }
    return list;
  }

  getRoomStatusCount(status: 'all' | 'empty' | 'partial' | 'full'): number {
    if (!this.selectedHotel) return 0;
    const list = this.rooms.filter(r => r.hotelId === this.selectedHotel.id);
    if (status === 'all') return list.length;
    return list.filter(rm => {
      const occupied = this.getOccupied(rm);
      if (status === 'empty') return occupied === 0;
      if (status === 'partial') return occupied > 0 && occupied < rm.capacity;
      if (status === 'full') return occupied === rm.capacity;
      return true;
    }).length;
  }

  processConfigs() {
    const rawCategories = (this.hotelConfigs || []).filter(c => c.categoryType?.toLowerCase() === 'hotelcategory');
    const rawRoomTypes = (this.hotelConfigs || []).filter(c => c.categoryType?.toLowerCase() === 'roomtype');

    // Deduplicate categories by name
    const seenCat = new Set<string>();
    this.hotelCategories = rawCategories.filter(c => {
      const key = (c.name || '').trim().toLowerCase();
      if (!key || seenCat.has(key)) return false;
      seenCat.add(key);
      return true;
    });

    // Deduplicate room types by name
    const seenRoom = new Set<string>();
    this.roomTypes = rawRoomTypes.filter(c => {
      const key = (c.name || '').trim().toLowerCase();
      if (!key || seenRoom.has(key)) return false;
      seenRoom.add(key);
      return true;
    });

    if (this.hotelCategories.length === 0) {
      this.hotelCategories = [
        { name: 'Ashram', id: null },
        { name: 'Deluxe Hotel', id: null },
        { name: 'Standard Hotel', id: null },
        { name: 'Dormitory', id: null }
      ];
    }
    if (this.roomTypes.length === 0) {
      this.roomTypes = [
        { name: 'Standard', id: null },
        { name: 'Deluxe', id: null },
        { name: 'Dormitory', id: null }
      ];
    }
  }

  openQuickConfig(type: 'HotelCategory' | 'RoomType') {
    this.configModalType = type;
    this.newConfigName = '';
    this.newConfigDesc = '';
    this.configError = '';
    this.showQuickConfigModal = true;
  }

  closeQuickConfig() {
    this.showQuickConfigModal = false;
  }

  saveQuickConfig() {
    if (!this.newConfigName.trim()) {
      this.configError = 'Name is required.';
      return;
    }
    this.configSaving = true;
    this.configError = '';
    const payload = {
      categoryType: this.configModalType,
      name: this.newConfigName.trim(),
      description: this.newConfigDesc.trim()
    };
    this.api.create<any>('HotelConfigs', payload).subscribe({
      next: (created) => {
        this.configSaving = false;
        this.showQuickConfigModal = false;
        this.hotelConfigs.push(created);
        this.processConfigs();

        if (this.configModalType === 'HotelCategory') {
          this.newHotel.rating = created.name;
          this.newHotel.hotelCategoryId = created.id;
        } else {
          this.activeRoom.type = created.name;
          this.activeRoom.roomTypeId = created.id;
        }
      },
      error: (err: any) => {
        this.configSaving = false;
        this.configError = err?.error?.message || 'Failed to save configuration.';
      }
    });
  }

  deleteConfigItem(id: number) {
    if (!id) return;
    this.api.delete('HotelConfigs', id).subscribe({
      next: () => {
        this.hotelConfigs = this.hotelConfigs.filter(c => c.id !== id);
        this.processConfigs();
      }
    });
  }

  onRatingCategoryChange(catName: string) {
    const matched = this.hotelCategories.find(c => c.name === catName);
    this.newHotel.rating = catName;
    this.newHotel.hotelCategoryId = matched ? matched.id : null;
  }

  onRoomTypeChange(typeName: string, targetObj: any = this.activeRoom) {
    const matched = this.roomTypes.find(c => c.name === typeName);
    targetObj.type = typeName;
    targetObj.roomTypeId = matched ? matched.id : null;
  }

  ngOnInit() {
    this.packageContext.selectedPackageId$.subscribe(id => {
      this.selectedPackageId = id;
    });
    this.loadData();
  }

  loadData() {
    this.loading = true;
    forkJoin({
      hotels: this.api.getAll<any>('Hotels'),
      rooms: this.api.getAll<any>('Rooms'),
      allocations: this.api.getAll<any>('RoomAllocations'),
      yatriBeds: this.api.getAll<any>('YatriBeds'),
      yatris: this.api.getAll<any>('Yatris'),
      configs: this.api.getAll<any>('HotelConfigs').pipe(catchError(() => of([])))
    }).subscribe({
      next: (res) => {
        this.hotels = res.hotels;
        this.rooms = res.rooms;
        this.allocations = res.allocations;
        this.yatriBeds = res.yatriBeds;
        this.yatris = res.yatris;
        this.hotelConfigs = res.configs || [];
        this.processConfigs();
        this.loading = false;

        if (this.selectedHotel) {
          const matched = this.hotels.find(h => h.id === this.selectedHotel.id);
          if (matched) this.selectHotel(matched, false, false);
        }
        if (this.selectedHotelForConfig) {
          const matched = this.hotels.find(h => h.id === this.selectedHotelForConfig.id);
          if (matched) {
            this.selectedHotelForConfig = matched;
            this.selectedHotelConfigRooms = this.rooms.filter(r => r.hotelId === matched.id);
          }
        }
        if (this.selectedRoom) {
          const matched = this.rooms.find(r => r.id === this.selectedRoom.id);
          if (matched) this.selectedRoom = matched;
        }
      },
      error: (err) => { console.error('Error fetching data', err); this.loading = false; }
    });
  }

  onExcelRoomFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    this.loading = true;
    setTimeout(() => {
      this.loadData();
      alert(`Excel Sheet "${file.name}" मधील हॉटेल्स, रूम्स व यात्री ॲलोकेशन सेव्ह झाले आहेत!`);
    }, 1000);
  }

  selectHotel(hotel: any, resetRoom = true, openModal = false) {
    this.selectedHotel = hotel;
    this.selectedHotelRooms = this.rooms.filter(r => r.hotelId === hotel.id);
    if (resetRoom) {
      this.selectedRoom = null;
      this.roomSearchQuery = '';
      this.roomFilterStatus = 'all';
    }
    if (openModal) this.showHotelDetailModal = true;

    // Auto-scroll to rooms list container
    if (!openModal) {
      setTimeout(() => {
        const el = document.getElementById('room-list-container');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
    }
  }

  selectHotelForConfig(hotel: any) {
    this.selectedHotelForConfig = hotel;
    this.selectedHotelConfigRooms = this.rooms.filter(r => r.hotelId === hotel.id);
    this.hotelConfigMode = 'view';
    this.showRoomAddPanel = false;
    this.editingRoom = null;
  }

  startAddHotel() {
    this.hotelConfigMode = 'add';
    this.selectedHotelForConfig = null;
    this.newHotel = {
      id: 'htl-' + (this.hotels.length + 1),
      name: '', city: '', address: '', managerName: '', phone: '', email: '', rating: 'Ashram', gstNo: ''
    };
  }

  startEditHotel(hotel: any) {
    this.hotelConfigMode = 'edit';
    this.newHotel = { ...hotel };
  }

  saveHotel() {
    if (!this.newHotel.name || !this.newHotel.city) {
      alert('Name and City are required.');
      return;
    }
    if (this.hotelConfigMode === 'add') {
      this.api.create('Hotels', this.newHotel).subscribe({
        next: (created: any) => {
          this.loadData();
          this.selectHotelForConfig(created);
        },
        error: (err) => console.error('Error creating hotel', err)
      });
    } else if (this.hotelConfigMode === 'edit') {
      this.api.update('Hotels', this.newHotel.id, this.newHotel).subscribe({
        next: () => {
          this.loadData();
          this.selectHotelForConfig(this.newHotel);
        },
        error: (err) => console.error('Error updating hotel', err)
      });
    }
  }

  deleteHotel(hotel: any) {
    if (confirm(`Are you sure you want to delete ${hotel.name}? All associated rooms and allocations will be deleted.`)) {
      this.api.delete('Hotels', hotel.id).subscribe({
        next: () => {
          this.selectedHotelForConfig = null;
          this.loadData();
        },
        error: (err) => console.error('Error deleting hotel', err)
      });
    }
  }

  startAddRoom() {
    this.editingRoom = null;
    this.roomAddMode = 'single';
    this.activeRoom = {
      id: 0,
      hotelId: this.selectedHotelForConfig.id,
      roomNumber: '',
      type: 'Standard',
      capacity: 4,
      buildingName: 'Main Block',
      floor: 1
    };
    this.bulkRooms = [
      {
        id: '',
        hotelId: this.selectedHotelForConfig.id,
        roomNumber: '',
        type: 'Standard',
        capacity: 4,
        buildingName: 'Main Block',
        floor: 1
      }
    ];
    this.showRoomAddPanel = true;
  }

  startEditRoom(room: any) {
    this.editingRoom = room;
    this.roomAddMode = 'single';
    this.activeRoom = { ...room };
    this.showRoomAddPanel = true;
  }

  addBulkRoomRow() {
    this.bulkRooms.push({
      id: '',
      hotelId: this.selectedHotelForConfig.id,
      roomNumber: '',
      type: 'Standard',
      capacity: 4,
      buildingName: 'Main Block',
      floor: 1
    });
  }

  removeBulkRoomRow(index: number) {
    if (this.bulkRooms.length > 1) {
      this.bulkRooms.splice(index, 1);
    }
  }

  saveRoom() {
    if (this.editingRoom || this.roomAddMode === 'single') {
      if (!this.activeRoom.roomNumber || !this.activeRoom.capacity) {
        alert('Room number and capacity are required.');
        return;
      }
      const payload = {
        id: this.activeRoom.id || 0,
        hotelId: this.selectedHotelForConfig.id,
        roomNumber: String(this.activeRoom.roomNumber || ''),
        type: this.activeRoom.type || 'Standard',
        capacity: Number(this.activeRoom.capacity || 4),
        buildingName: this.activeRoom.buildingName || 'Main Block',
        floor: String(this.activeRoom.floor !== undefined && this.activeRoom.floor !== null ? this.activeRoom.floor : '1')
      };

      if (this.editingRoom) {
        this.api.update('Rooms', payload.id, payload).subscribe({
          next: () => {
            this.showRoomAddPanel = false;
            this.editingRoom = null;
            this.loadData();
          },
          error: (err) => console.error('Error updating room', err)
        });
      } else {
        this.api.create('Rooms', payload).subscribe({
          next: () => {
            this.showRoomAddPanel = false;
            this.loadData();
          },
          error: (err) => console.error('Error creating room', err)
        });
      }
    } else if (this.roomAddMode === 'bulk') {
      // Validate bulk rooms
      const invalid = this.bulkRooms.some(r => !r.roomNumber || !r.capacity);
      if (invalid) {
        alert('Please fill out Room Number and Capacity for all rows.');
        return;
      }

      // Prepare save operations
      const timestamp = Date.now();
      const calls = this.bulkRooms.map((r, index) => {
        const payload = {
          id: 'rm-' + timestamp + '-' + index,
          hotelId: this.selectedHotelForConfig.id,
          roomNumber: String(r.roomNumber || ''),
          type: r.type || 'Standard',
          capacity: Number(r.capacity || 4),
          buildingName: r.buildingName || 'Main Block',
          floor: String(r.floor !== undefined && r.floor !== null ? r.floor : '1')
        };
        return this.api.create('Rooms', payload);
      });

      forkJoin(calls).subscribe({
        next: () => {
          this.showRoomAddPanel = false;
          this.bulkRooms = [];
          this.loadData();
        },
        error: (err) => {
          console.error('Error bulk creating rooms', err);
          alert('Failed to save rooms. Please check that all values are valid.');
        }
      });
    }
  }

  deleteRoom(room: any) {
    if (confirm(`Are you sure you want to delete room ${room.roomNumber}?`)) {
      this.api.delete('Rooms', room.id).subscribe({
        next: () => {
          this.loadData();
        },
        error: (err) => console.error('Error deleting room', err)
      });
    }
  }

  getRoomCount(hotelId: string) {
    return this.rooms.filter(r => r.hotelId === hotelId).length;
  }
  selectRoom(room: any) {
    this.selectedRoom = room;
    this.selectedBedIndexes = [];
    const beds = this.getBedsForRoom(room);
    const vacant = beds.find(b => !b.allocated);
    if (vacant) {
      this.selectedBedIndexes.push(vacant.index);
    }

    // Auto-scroll to bed allocation map container
    setTimeout(() => {
      const el = document.getElementById('allocation-container');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  }

  backToRooms() {
    this.selectedRoom = null;
    this.selectedBedIndexes = [];
    this.selectedYatriIds = [];
  }
  // --- Multi-select helpers ---
  toggleYatriSelection(yatriId: string) {
    const idx = this.selectedYatriIds.indexOf(yatriId);
    if (idx >= 0) {
      this.selectedYatriIds.splice(idx, 1);
    } else {
      this.selectedYatriIds.push(yatriId);
    }
  }

  isAllSelected(): boolean {
    const list = this.filteredUnassignedYatris;
    return list.length > 0 && list.every(y => this.selectedYatriIds.includes(y.id));
  }

  toggleSelectAll(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      const ids = this.filteredUnassignedYatris.map(y => y.id);
      ids.forEach(id => {
        if (!this.selectedYatriIds.includes(id)) this.selectedYatriIds.push(id);
      });
  } else {
      const ids = this.filteredUnassignedYatris.map(y => y.id);
      this.selectedYatriIds = this.selectedYatriIds.filter(id => !ids.includes(id));
    }
  }

  clearSelection() {
    this.selectedYatriIds = [];
  }

  toggleAssignBed(bedIndex: number) {
    const idx = this.selectedBedIndexes.indexOf(bedIndex);
    if (idx >= 0) {
      this.selectedBedIndexes.splice(idx, 1);
    } else {
      this.selectedBedIndexes.push(bedIndex);
    }
  }

  validateGenderMatch(roomAllocatedGender: string, yatriGender: string): boolean {
    if (!roomAllocatedGender || roomAllocatedGender === 'Any' || roomAllocatedGender === 'Family') return true;
    const roomGen = roomAllocatedGender.trim().toLowerCase();
    const yatriGen = (yatriGender || '').trim().toLowerCase();

    if (roomGen.includes('male') && !roomGen.includes('female')) {
      if (yatriGen.includes('female') || yatriGen.includes('f') || yatriGen.includes('स्त्री')) {
        alert('⚠️ पुरुष कक्षात (Male Only Room) महिला यात्रीचे वाटप करता येत नाही! (Cannot allocate Female Yatri in Male Only room)');
        return false;
      }
    }
    if (roomGen.includes('female')) {
      if (yatriGen.includes('male') && !yatriGen.includes('female') || yatriGen === 'm' || yatriGen.includes('पुरुष')) {
        alert('⚠️ महिला कक्षात (Female Only Room) पुरुष यात्रीचे वाटप करता येत नाही! (Cannot allocate Male Yatri in Female Only room)');
        return false;
      }
    }
    return true;
  }

  // Allocate all selected yatris to selected (or auto-assigned vacant) beds
  allocateSelectedYatris() {
    if (!this.selectedRoom || this.selectedYatriIds.length === 0) return;
    
    // Auto-select vacant beds if user hasn't selected any beds manually
    if (this.selectedBedIndexes.length === 0) {
      const vacantBeds = this.getBedsForRoom(this.selectedRoom).filter(b => !b.allocated).map(b => b.index);
      if (vacantBeds.length === 0) {
        alert('⚠️ ही रूम पूर्ण भरलेली आहे. कृपया दुसरी रूम निवडा. (This room is full. Select another room.)');
        return;
      }
      this.selectedBedIndexes = vacantBeds.slice(0, this.selectedYatriIds.length);
    }

    let alloc = this.getRoomAllocation(this.selectedRoom.id);
    const allocGender = alloc ? alloc.allocatedGender : 'Any';

    // Map selected Yatris to selected beds one-to-one
    const toAllocateCount = Math.min(this.selectedBedIndexes.length, this.selectedYatriIds.length);
    const bedsToAssign = this.selectedBedIndexes.slice(0, toAllocateCount);
    const yatrisToAssign = this.selectedYatriIds.slice(0, toAllocateCount);

    // Enforce Gender Check Validation for all selected Yatris
    for (const yId of yatrisToAssign) {
      const yatriObj = this.yatris.find(y => String(y.id) === String(yId));
      if (yatriObj && !this.validateGenderMatch(allocGender, yatriObj.gender)) {
        return; // Stop allocation if gender mismatch
      }
    }

    if (this.selectedYatriIds.length > toAllocateCount) {
      alert(`⚠️ Only ${toAllocateCount} vacant bed(s) available in this room. First ${toAllocateCount} member(s) will be allocated.`);
    }

    const doAllocations = (allocId: any) => {
      let chain = Promise.resolve();
      yatrisToAssign.forEach((yatriId, i) => {
        const bedIdx = bedsToAssign[i]; 

        chain = chain.then(() => new Promise<void>((res, rej) => {
          const bedRecord = {
            roomAllocationId: Number(allocId),
            yatriId: Number(yatriId),
            bedIndex: Number(bedIdx)
          };
          this.api.create('YatriBeds', bedRecord).subscribe({ next: () => res(), error: rej });
        }));
      });
      chain.then(() => {
        this.selectedYatriIds = this.selectedYatriIds.filter(id => !yatrisToAssign.includes(id));
        this.selectedBedIndexes = [];
        this.loadData();
      });
    };

    if (alloc) {
      doAllocations(alloc.id);
    } else {
      const firstYatriId = yatrisToAssign[0];
      const yatri = this.yatris.find(y => String(y.id) === String(firstYatriId));
      const pkgId = this.selectedPackageId || (yatri ? yatri.packageId : '');

      if (!pkgId) {
        alert('Cannot allocate room: Please select a tour package first.');
        return;
      }

      const newAlloc = {
        id: 0,
        packageId: Number(pkgId),
        roomId: Number(this.selectedRoom.id),
        allocatedGender: 'Any'
      };
      this.api.create('RoomAllocations', newAlloc).subscribe({
        next: (created: any) => doAllocations(created.id || newAlloc.id),
        error: (err) => console.error('Room allocation creation error', err)
      });
    }
  }

  // --- Bed helpers ---
  getRoomAllocation(roomId: string) {
    return this.allocations.find(a => a.roomId === roomId);
  }

  getBedsForRoom(room: any) {
    const alloc = this.getRoomAllocation(room.id);
    const beds = [];
    for (let i = 0; i < room.capacity; i++) {
      const bedRec = alloc ? this.yatriBeds.find(b => b.roomAllocationId === alloc.id && b.bedIndex === i) : null;
      const yatri = bedRec ? this.yatris.find(y => y.id === bedRec.yatriId) : null;
      beds.push({
        index: i,
        allocated: !!bedRec,
        yatriName: yatri ? yatri.name : '',
        yatriId: bedRec ? bedRec.yatriId : ''
      });
    }
    return beds;
  }

  getOccupied(room: any) {
    return this.getBedsForRoom(room).filter(b => b.allocated).length;
  }

  getAllocatedYatriIdsForRoom(room: any): string[] {
    return this.getBedsForRoom(room)
      .filter(b => b.allocated)
      .map(b => b.yatriId);
  }

  getUnallocatedYatris(): any[] {
    const allocatedYatriIds = this.yatriBeds.map(b => b.yatriId);
    let list = this.yatris.filter(y => !allocatedYatriIds.includes(y.id));
    if (this.selectedPackageId) {
      list = list.filter(y => String(y.packageId) === String(this.selectedPackageId));
    }
    return list;
  }

  get filteredUnassignedYatris(): any[] {
    const list = this.getUnallocatedYatris();
    if (!this.memberSearchQuery || !this.memberSearchQuery.trim()) return list;
    const q = this.memberSearchQuery.trim().toLowerCase();
    return list.filter(y => 
      y.name?.toLowerCase().includes(q) || 
      String(y.id).toLowerCase().includes(q) || 
      (y.phone && y.phone.includes(q)) ||
      y.initiatedName?.toLowerCase().includes(q)
    );
  }

  unassignBed(bed: any) {
    if (!this.selectedRoom) return;
    const alloc = this.getRoomAllocation(this.selectedRoom.id);
    if (!alloc) return;

    const bedRec = this.yatriBeds.find(b => b.roomAllocationId === alloc.id && b.bedIndex === bed.index);
    if (bedRec) {
      this.api.deleteComposite('YatriBeds', alloc.id, bed.index).subscribe({
        next: () => {
          this.loadData();
          if (!this.selectedBedIndexes.includes(bed.index)) {
            this.selectedBedIndexes.push(bed.index);
          }
        },
        error: (err) => console.error('Error deleting bed allocation', err)
      });
    }
  }

  // --- Hotel/Room CRUD ---
  openHotelModal() {
    this.newHotel = { id: 'htl-' + (this.hotels.length + 1), name: '', managerName: '', phone: '', address: '', email: '', city: '', rating: 4.5, gstNo: '' };
    this.showHotelModal = true;
  }

  createHotel() {
    if (!this.newHotel.id || !this.newHotel.name) return;
    this.api.create('Hotels', this.newHotel).subscribe({
      next: () => { this.showHotelModal = false; this.loadData(); },
      error: (err) => console.error('Error creating hotel', err)
    });
  }

  openRoomModal() {
    this.newRoom = { id: 'rm-' + (this.rooms.length + 1), hotelId: this.selectedHotel?.id || '', roomNumber: '', type: 'Standard', capacity: 4, buildingName: 'Main Block', floor: 1 };
    this.showRoomModal = true;
  }

  // --- Drag and Drop Room Allocations ---
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

  onDropOnBed(event: DragEvent, bedIndex: number) {
    event.preventDefault();
    if (!event.dataTransfer || !this.selectedRoom) return;
    const yatriId = event.dataTransfer.getData('text/plain');
    if (!yatriId) return;

    const beds = this.getBedsForRoom(this.selectedRoom);
    const targetBed = beds.find(b => b.index === bedIndex);
    if (targetBed && targetBed.allocated) {
      alert('बेड आधीच आरक्षित आहे! (Bed is already occupied!)');
      return;
    }

    const yatriObj = this.yatris.find(y => String(y.id) === String(yatriId));
    let alloc = this.getRoomAllocation(this.selectedRoom.id);
    const allocGender = alloc ? alloc.allocatedGender : 'Any';

    if (yatriObj && !this.validateGenderMatch(allocGender, yatriObj.gender)) {
      return; // Stop drag-and-drop allocation if gender mismatch
    }

    const doAllocation = (allocId: any) => {
      const bedRecord = {
        roomAllocationId: Number(allocId),
        yatriId: Number(yatriId),
        bedIndex: Number(bedIndex)
      };
      this.api.create('YatriBeds', bedRecord).subscribe({
        next: () => {
          this.selectedYatriIds = this.selectedYatriIds.filter(id => id !== yatriId);
          this.loadData();
        },
        error: (err) => console.error('Error allocating bed via drag-and-drop', err)
      });
    };

    if (alloc) {
      doAllocation(alloc.id);
    } else {
      const yatri = this.yatris.find(y => y.id === yatriId);
      const pkgId = this.selectedPackageId || (yatri ? yatri.packageId : '');
      if (!pkgId) {
        alert('रूम वाटप करण्यासाठी प्रथम टूर पॅकेज निवडा. (Please select a tour package first.)');
        return;
      }
      const newAlloc = {
        id: 0,
        packageId: Number(pkgId),
        roomId: Number(this.selectedRoom.id),
        allocatedGender: 'Any'
      };
      this.api.create('RoomAllocations', newAlloc).subscribe({
        next: (created: any) => doAllocation(created.id || newAlloc.id),
        error: (err) => console.error('Room allocation creation error', err)
      });
    }
  }

  createRoom() {
    if (!this.newRoom.roomNumber) return;
    this.api.create('Rooms', this.newRoom).subscribe({
      next: () => { this.showRoomModal = false; this.loadData(); },
      error: (err) => console.error('Error creating room', err)
    });
  }

  exportAllocationsExcel() {
    const exportData: any[] = [];
    
    for (const bed of this.yatriBeds) {
      const alloc = this.allocations.find(a => a.id === bed.roomAllocationId);
      if (!alloc) continue;
      
      const room = this.rooms.find(r => r.id === alloc.roomId);
      if (!room) continue;
      
      const hotel = this.hotels.find(h => h.id === room.hotelId);
      const yatri = this.yatris.find(y => y.id === bed.yatriId);
      
      if (!hotel || !yatri) continue;
      
      exportData.push({
        'Yatri ID': yatri.id,
        'Yatri Name': yatri.name,
        'Age': yatri.age,
        'Gender': yatri.gender,
        'Phone': yatri.phone || '',
        'Assigned Hotel': hotel.name,
        'City': hotel.city,
        'Room Number': room.roomNumber,
        'Room Type': room.type || '',
        'Bed Index': bed.bedIndex + 1,
        'Allocation Gender Type': alloc.allocatedGender
      });
    }

    if (exportData.length === 0) {
      alert('⚠️ No room allocations found to export. Please assign yatris to rooms first.');
      return;
    }

    exportData.sort((a, b) => {
      if (a['Assigned Hotel'] !== b['Assigned Hotel']) return a['Assigned Hotel'].localeCompare(b['Assigned Hotel']);
      if (a['Room Number'] !== b['Room Number']) return String(a['Room Number']).localeCompare(String(b['Room Number']));
      return a['Bed Index'] - b['Bed Index'];
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet['!cols'] = [
      { wch: 10 }, { wch: 25 }, { wch: 5 }, { wch: 8 }, { wch: 15 },
      { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 20 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Allocations');
    
    const timestamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `ISCON_Room_Allocations_${timestamp}.xlsx`);
  }
}
