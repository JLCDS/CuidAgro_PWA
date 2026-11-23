import { createApp } from './app.js';
import { env } from './config/env.js';

createApp().listen(env.PORT, () => {
  console.log(`API de CuidAgro en http://localhost:${env.PORT}`);
});
