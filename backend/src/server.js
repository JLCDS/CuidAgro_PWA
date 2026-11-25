import { createApp } from './app.js';
import { env } from './config/env.js';
import { programarRevisionVencimientos } from './lib/push.js';

createApp().listen(env.PORT, () => {
  console.log(`API de CuidAgro en http://localhost:${env.PORT}`);
  programarRevisionVencimientos();
});
