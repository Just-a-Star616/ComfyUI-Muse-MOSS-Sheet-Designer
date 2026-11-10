import {app} from '../../scripts/app.js';
import {api} from '../../scripts/api.js';
import {createExtension} from './integration.js';
const stylesheet=document.createElement('link');
stylesheet.rel='stylesheet';
stylesheet.href=new URL('./style.css',import.meta.url).href;
document.head.append(stylesheet);
app.registerExtension(createExtension(app,api));
