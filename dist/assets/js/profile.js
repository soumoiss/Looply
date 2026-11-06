import { mountAppPage } from '../../src/page-runtime.js?build=e913ddee23ac1c1d';
import { mountProfilePage } from '../../src/profile-page.js?build=e913ddee23ac1c1d';
await mountAppPage({page:'profile', render:mountProfilePage});
