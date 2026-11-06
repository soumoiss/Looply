import { mountAppPage } from '../../src/page-runtime.js?build=e96bd539b17ff957';
import { mountProfilePage } from '../../src/profile-page.js?build=e96bd539b17ff957';
await mountAppPage({page:'profile', render:mountProfilePage});
