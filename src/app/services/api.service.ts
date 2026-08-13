import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:5206/api';

  // Network Status subjects
  isOffline$ = new BehaviorSubject<boolean>(!navigator.onLine);
  isSyncing$ = new BehaviorSubject<boolean>(false);
  dataSynced$ = new BehaviorSubject<boolean>(false); // Emits true when a sync finishes

  constructor() {
    window.addEventListener('online', () => {
      this.isOffline$.next(false);
      this.syncOfflineMutations();
    });
    window.addEventListener('offline', () => {
      this.isOffline$.next(true);
    });

    // Run initial sync check in case we loaded while online and have queued items
    if (navigator.onLine) {
      setTimeout(() => this.syncOfflineMutations(), 2000);
    }
  }

  get isOffline(): boolean {
    return this.isOffline$.value;
  }

  getOfflineQueueLength(): number {
    try {
      const queue = JSON.parse(localStorage.getItem('offline_mutations_queue') || '[]');
      return queue.length;
    } catch {
      return 0;
    }
  }

  getAll<T>(endpoint: string): Observable<T[]> {
    return this.http.get<T[]>(`${this.baseUrl}/${endpoint}`).pipe(
      tap(data => {
        try {
          localStorage.setItem(`api_cache_${endpoint}`, JSON.stringify(data));
        } catch (e) {
          console.warn('Failed to write api cache', e);
        }
      }),
      catchError(err => {
        console.warn(`GET ${endpoint} failed, checking cache.`, err);
        const cached = localStorage.getItem(`api_cache_${endpoint}`);
        if (cached) {
          try {
            return of(JSON.parse(cached) as T[]);
          } catch (e) {
            console.error('Failed to parse api cache', e);
          }
        }
        return throwError(() => err);
      })
    );
  }

  getById<T>(endpoint: string, id: string | number): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}/${endpoint}/${encodeURIComponent(id)}`).pipe(
      catchError(err => {
        console.warn(`GET ${endpoint}/${id} failed, checking cache.`, err);
        const cachedList = localStorage.getItem(`api_cache_${endpoint}`);
        if (cachedList) {
          try {
            const list = JSON.parse(cachedList) as any[];
            const item = list.find(x => x.id === id);
            if (item) return of(item as T);
          } catch (e) {}
        }
        return throwError(() => err);
      })
    );
  }

  create<T>(endpoint: string, item: T): Observable<T> {
    if (this.isOffline) {
      this.enqueueMutation({ type: 'create', endpoint, item });
      return of(item);
    }
    return this.http.post<T>(`${this.baseUrl}/${endpoint}`, item).pipe(
      catchError(err => {
        if (this.isNetworkError(err)) {
          this.enqueueMutation({ type: 'create', endpoint, item });
          return of(item);
        }
        return throwError(() => err);
      })
    );
  }

  update<T>(endpoint: string, id: string | number, item: T): Observable<any> {
    if (this.isOffline) {
      this.enqueueMutation({ type: 'update', endpoint, id, item });
      return of(item);
    }
    return this.http.put(`${this.baseUrl}/${endpoint}/${encodeURIComponent(id)}`, item).pipe(
      catchError(err => {
        if (this.isNetworkError(err)) {
          this.enqueueMutation({ type: 'update', endpoint, id, item });
          return of(item);
        }
        return throwError(() => err);
      })
    );
  }

  delete(endpoint: string, id: string | number): Observable<any> {
    if (this.isOffline) {
      this.enqueueMutation({ type: 'delete', endpoint, id });
      return of({ success: true });
    }
    return this.http.delete(`${this.baseUrl}/${endpoint}/${encodeURIComponent(id)}`).pipe(
      catchError(err => {
        if (this.isNetworkError(err)) {
          this.enqueueMutation({ type: 'delete', endpoint, id });
          return of({ success: true });
        }
        return throwError(() => err);
      })
    );
  }

  // Helper for composite keys
  getComposite<T>(endpoint: string, key1: string | number, key2: string | number): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}/${endpoint}/${key1}/${key2}`);
  }

  updateComposite<T>(endpoint: string, key1: string | number, key2: string | number, item: T): Observable<any> {
    if (this.isOffline) {
      this.enqueueMutation({ type: 'updateComposite', endpoint, key1, key2, item });
      return of(item);
    }
    return this.http.put(`${this.baseUrl}/${endpoint}/${key1}/${key2}`, item).pipe(
      catchError(err => {
        if (this.isNetworkError(err)) {
          this.enqueueMutation({ type: 'updateComposite', endpoint, key1, key2, item });
          return of(item);
        }
        return throwError(() => err);
      })
    );
  }

  deleteComposite(endpoint: string, key1: string | number, key2: string | number): Observable<any> {
    if (this.isOffline) {
      this.enqueueMutation({ type: 'deleteComposite', endpoint, key1, key2 });
      return of({ success: true });
    }
    return this.http.delete(`${this.baseUrl}/${endpoint}/${key1}/${key2}`).pipe(
      catchError(err => {
        if (this.isNetworkError(err)) {
          this.enqueueMutation({ type: 'deleteComposite', endpoint, key1, key2 });
          return of({ success: true });
        }
        return throwError(() => err);
      })
    );
  }

  private isNetworkError(err: any): boolean {
    return err instanceof HttpErrorResponse && (err.status === 0 || err.status >= 500);
  }

  private enqueueMutation(mutation: any) {
    try {
      const queue = JSON.parse(localStorage.getItem('offline_mutations_queue') || '[]');
      queue.push(mutation);
      localStorage.setItem('offline_mutations_queue', JSON.stringify(queue));
      this.isOffline$.next(true); 
    } catch (e) {
      console.error('Failed to write offline mutation queue', e);
    }
  }

  syncOfflineMutations() {
    if (this.isSyncing$.value) return;
    let queue: any[] = [];
    try {
      queue = JSON.parse(localStorage.getItem('offline_mutations_queue') || '[]');
    } catch {
      return;
    }
    if (queue.length === 0) return;

    this.isSyncing$.next(true);

    const processQueue = async () => {
      let currentIndex = 0;
      while (currentIndex < queue.length) {
        const mutation = queue[currentIndex];
        let obs$: Observable<any>;

        if (mutation.type === 'create') {
          obs$ = this.http.post(`${this.baseUrl}/${mutation.endpoint}`, mutation.item);
        } else if (mutation.type === 'update') {
          obs$ = this.http.put(`${this.baseUrl}/${mutation.endpoint}/${encodeURIComponent(mutation.id)}`, mutation.item);
        } else if (mutation.type === 'delete') {
          obs$ = this.http.delete(`${this.baseUrl}/${mutation.endpoint}/${encodeURIComponent(mutation.id)}`);
        } else if (mutation.type === 'updateComposite') {
          obs$ = this.http.put(`${this.baseUrl}/${mutation.endpoint}/${mutation.key1}/${mutation.key2}`, mutation.item);
        } else if (mutation.type === 'deleteComposite') {
          obs$ = this.http.delete(`${this.baseUrl}/${mutation.endpoint}/${mutation.key1}/${mutation.key2}`);
        } else {
          obs$ = of(true);
        }

        try {
          await obs$.toPromise();
          queue.splice(currentIndex, 1);
          localStorage.setItem('offline_mutations_queue', JSON.stringify(queue));
        } catch (err: any) {
          if (err instanceof HttpErrorResponse && err.status === 0) {
            console.warn('Sync aborted: server is still unreachable.');
            break;
          } else {
            console.error('Discarding conflicting offline mutation', mutation, err);
            queue.splice(currentIndex, 1);
            localStorage.setItem('offline_mutations_queue', JSON.stringify(queue));
          }
        }
      }

      this.isSyncing$.next(false);
      this.dataSynced$.next(true);
      setTimeout(() => this.dataSynced$.next(false), 1000);
    };

    processQueue();
  }
}
