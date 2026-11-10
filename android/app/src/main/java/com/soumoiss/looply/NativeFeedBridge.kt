package com.soumoiss.looply

import android.content.Context
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Receives only authenticated, in-page public post snapshots. The bridge is
 * never exposed to third-party frames, and messages are size/shape limited.
 */
internal object NativeFeedBridge {
    private const val ORIGIN = "https://soumoiss.github.io"
    private val uuid = Regex("[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}")
    private val io = Executors.newSingleThreadExecutor()

    fun register(context: Context, webView: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        val app = context.applicationContext
        WebViewCompat.addWebMessageListener(
            webView, "LooplyNativeFeed", setOf(ORIGIN)
        ) { _, message, sourceOrigin, isMainFrame, _ ->
            if (!isMainFrame || sourceOrigin.toString() != ORIGIN) return@addWebMessageListener
            val raw = message.data ?: return@addWebMessageListener
            if (raw.length > 150_000) return@addWebMessageListener
            val payload = try { JSONObject(raw) } catch (_: Exception) {
                return@addWebMessageListener
            }
            when (payload.optString("type")) {
                "snapshot" -> {
                    val account = payload.optString("account")
                    val posts = payload.optJSONArray("posts") ?: return@addWebMessageListener
                    if (!uuid.matches(account) || posts.length() > 40) return@addWebMessageListener
                    io.execute {
                        runCatching { NativeFeedStore(app).replacePublicSnapshot(account, posts) }
                    }
                }
                "logout" -> io.execute {
                    runCatching { NativeFeedStore(app).clearAllOnLogout() }
                }
                "open" -> {
                    // Intent is handled by the native URL route, not by a
                    // JavaScript bridge callback that could launch arbitrary UIs.
                }
            }
        }
    }
}
