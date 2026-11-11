package com.soumoiss.looply

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented tests: real Android SQLite and private app files, no mock DB.
 * All data are disposable emulator fixture UUIDs; no production user data.
 */
@RunWith(AndroidJUnit4::class)
class NativeFeedStoreTest {
    private val app: Context = ApplicationProvider.getApplicationContext()
    private val store = NativeFeedStore(app)
    private val alice = "11111111-1111-4111-8111-111111111111"
    private val bob = "22222222-2222-4222-8222-222222222222"
    private val publicPost = "33333333-3333-4333-8333-333333333333"
    private val privatePost = "44444444-4444-4444-8444-444444444444"

    @Before fun reset() = store.clearAllOnLogout()
    @After fun cleanup() = store.clearAllOnLogout()

    private fun post(id: String, visibility: String) = JSONObject()
        .put("id", id)
        .put("visibility", visibility)
        .put("author", "Teste")
        .put("body", if (visibility == "public") "Disponível offline" else "Segredo")
        .put("createdAt", "2026-11-10T18:00:00Z")

    @Test fun publicPostsAreReadableWithoutNetwork() {
        store.replacePublicSnapshot(alice, JSONArray().put(post(publicPost, "public")))
        assertTrue(store.hasCachedPosts())
        assertEquals(alice, store.activeAccount())
        assertEquals(1, store.read().size)
        assertEquals("Disponível offline", store.read().first().text)
    }

    @Test fun accessRestrictedPostsAreNeverCached() {
        store.replacePublicSnapshot(alice, JSONArray()
            .put(post(privatePost, "selected"))
            .put(post(publicPost, "public")))
        val data = store.read()
        assertEquals(1, data.size)
        assertEquals(publicPost, data.single().id)
        assertFalse(data.any { it.text == "Segredo" })
    }

    @Test fun accountsAreIsolatedAndLogoutPurgesOfflineData() {
        store.replacePublicSnapshot(alice, JSONArray().put(post(publicPost, "public")))
        store.replacePublicSnapshot(bob, JSONArray())
        assertEquals(bob, store.activeAccount())
        assertTrue(store.read().isEmpty())
        store.clearAllOnLogout()
        assertEquals(null, store.activeAccount())
        assertFalse(store.hasCachedPosts())
    }
}
