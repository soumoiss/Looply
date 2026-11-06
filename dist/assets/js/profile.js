import { mountAppPage } from '../../src/page-runtime.js?build=a11088ce9a105311';
import { mountProfilePage } from '../../src/profile-page.js?build=a11088ce9a105311';
await mountAppPage({page:'profile', render:mountProfilePage});
