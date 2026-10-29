import { mountAppPage } from '../../src/page-runtime.js';
import { mountProfilePage } from '../../src/profile-page.js';
await mountAppPage({page:'profile', render:mountProfilePage});
