import { Routes } from '@angular/router';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { YatrisComponent } from './pages/yatris/yatris.component';
import { PackagesComponent } from './pages/packages/packages.component';
import { HotelsComponent } from './pages/hotels/hotels.component';
import { TransitComponent } from './pages/transit/transit.component';
import { OperationsComponent } from './pages/operations/operations.component';
import { UsersComponent } from './pages/users/users.component';
import { LoginComponent } from './pages/login/login.component';
import { PublicRegisterComponent } from './pages/public-register/public-register.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'public-register', component: PublicRegisterComponent },
  { path: 'register', component: PublicRegisterComponent },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard',  component: DashboardComponent,  canActivate: [authGuard] },
  { path: 'yatris',     component: YatrisComponent,     canActivate: [authGuard] },
  { path: 'packages',   component: PackagesComponent,   canActivate: [authGuard] },
  { path: 'hotels',     component: HotelsComponent,     canActivate: [authGuard] },
  { path: 'transit',    component: TransitComponent,    canActivate: [authGuard] },
  { path: 'operations', component: OperationsComponent, canActivate: [authGuard] },
  { path: 'users',      component: UsersComponent,      canActivate: [authGuard] },
  { path: '**', redirectTo: 'dashboard' }
];
