import { mountAppPage } from '../../src/page-runtime.js?build=23c5b03973212076';
import { mountProfilePage } from '../../src/profile-page.js?build=23c5b03973212076';
await mountAppPage({page:'profile', render:mountProfilePage});
