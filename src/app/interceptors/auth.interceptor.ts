import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // Skip adding token for login endpoint
  if (req.url.includes('/auth/login')) {
    return next(req);
  }

  // Get freshest token
  const token = auth.getToken();

  // Attach JWT token to every request
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      // If 401 Unauthorized occurs on any protected API call, clear invalid/expired token and redirect to login
      if (err.status === 401 && !window.location.pathname.includes('/login') && !req.url.includes('/auth/login')) {
        console.warn('401 Unauthorized token encountered. Clearing invalid token and redirecting to login.');
        auth.logout();
      }
      return throwError(() => err);
    })
  );
};
