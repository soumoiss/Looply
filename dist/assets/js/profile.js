import { mountAppPage } from '../../src/page-runtime.js?build=caa8d5b0bdd8905d';
import { mountProfilePage } from '../../src/profile-page.js?build=caa8d5b0bdd8905d';
await mountAppPage({page:'profile', render:mountProfilePage});
