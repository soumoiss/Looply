import { mountAppPage } from '../../src/page-runtime.js?build=f096c6dcc96f4a2c';
import { mountProfilePage } from '../../src/profile-page.js?build=f096c6dcc96f4a2c';
await mountAppPage({page:'profile', render:mountProfilePage});
