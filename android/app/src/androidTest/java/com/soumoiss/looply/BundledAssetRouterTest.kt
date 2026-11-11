package com.soumoiss.looply

import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

/** Tests the actual Android WebViewAssetLoader without remote HTTP. */
@RunWith(AndroidJUnit4::class)
class BundledAssetRouterTest {
    private val router = BundledAssetRouter(
        ApplicationProvider.getApplicationContext()
    )

    @Test
    fun packagedIndexLoadsFromApk() {
        val response = router.intercept(
            Uri.parse("https://soumoiss.github.io/Looply/index.html")
        )
        assertNotNull(response)
        // WebResourceResponse created with the legacy constructor can report
        // statusCode=0 even for successfully served assets. Test the bytes.
        assertNotNull(response!!.data)
        val content = response.data.bufferedReader().use { it.readText() }
        org.junit.Assert.assertTrue(content.contains("<html", ignoreCase = true) ||
            content.contains("<!doctype", ignoreCase = true))
    }

    @Test
    fun missingAssetNeverFallsBackToGitHubPages() {
        val response = router.intercept(
            Uri.parse("https://soumoiss.github.io/Looply/__missing_offline_file__.html")
        )
        assertNotNull(response)
        assertEquals(404, response!!.statusCode)
    }

    @Test
    fun entireLegacyHostIsBlockedOutsidePackagedDirectory() {
        val response = router.intercept(
            Uri.parse("https://soumoiss.github.io/__external_page__.html")
        )
        assertNotNull(response)
        assertEquals(404, response!!.statusCode)
    }

    @Test
    fun unrelatedApiHostsAreNotIntercepted() {
        assertNull(router.intercept(
            Uri.parse("https://example.neon.tech/neondb/rest/v1/profiles")
        ))
    }

    @Test
    fun insecureLegacyHostDoesNotServeApkAssets() {
        val response = router.intercept(
            Uri.parse("http://soumoiss.github.io/Looply/index.html")
        )
        assertNotNull(response)
        assertEquals(404, response!!.statusCode)
    }
}
