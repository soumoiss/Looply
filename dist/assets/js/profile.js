import { mountAppPage } from '../../src/page-runtime.js?build=c8dfb31c1e9d8b3a';
import { mountProfilePage } from '../../src/profile-page.js?build=c8dfb31c1e9d8b3a';
await mountAppPage({page:'profile', render:mountProfilePage});
