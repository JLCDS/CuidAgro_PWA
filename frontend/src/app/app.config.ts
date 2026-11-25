import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { Auth } from './core/auth';
import { authInterceptor } from './core/auth.interceptor';
import { Pwa } from './core/pwa';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Recupera la sesión desde la cookie antes de evaluar las rutas protegidas (sin red, usa el usuario guardado).
    // Después arranca lo del modo PWA: service worker (solo en producción), instalación y sincronización.
    provideAppInitializer(() => {
      const auth = inject(Auth);
      const pwa = inject(Pwa);
      return auth.restaurar().then(() => pwa.iniciar());
    }),
  ],
};
