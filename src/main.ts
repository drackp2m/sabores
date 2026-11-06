import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/app.config';
import { openLinksInSafari } from './app/external-links';

openLinksInSafari();
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
