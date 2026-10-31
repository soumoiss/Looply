import { mountAppPage } from '../../src/page-runtime.js?v=one-session-entry-20261031';
import { mountProfilePage } from '../../src/profile-page.js?v=historical-publications-20261031';
await mountAppPage({page:'profile', render:mountProfilePage});
