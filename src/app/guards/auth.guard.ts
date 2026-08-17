import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    router.navigate(['/login']);
    return false;
  }

  // Volunteer Security Guard: Volunteers can ONLY access /operations
  if (auth.isVolunteer() && !state.url.includes('/operations')) {
    router.navigate(['/operations']);
    return false;
  }

  return true;
};
