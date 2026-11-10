package com.soumoiss.looply

import android.content.Context
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * One-way, explicitly origin-scoped compatibility bridge. Only the trusted
 * first-party main frame can submit Neon-authorized message snapshots.
 * The private payload is encrypted before SQLite insertion.
 */
internal object NativeChatBridge {
    private const val ORIGIN = "https://soumoiss.github.io"
    private val UUID = Regex("[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}")
    private val io = Executors.newSingleThreadExecutor()

    fun register(context: Context, webView: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        val app = context.applicationContext
        WebViewCompat.addWebMessageListener(
            webView, "LooplyNativeChat", setOf(ORIGIN)
        ) { _, message, sourceOrigin, isMainFrame, _ ->
            if (!isMainFrame || sourceOrigin.toString() != ORIGIN) return@addWebMessageListener
            val text = message.data ?: return@addWebMessageListener
            if (text.length !in 6..150_000) return@addWebMessageListener
            val data = runCatching { JSONObject(text) }.getOrNull()
                ?: return@addWebMessageListener
            when (data.optString("type")) {
                "snapshot" -> {
                    val account = data.optString("account")
                    val conversation = data.optString("conversation")
                    val messages = data.optJSONArray("messages") ?: return@addWebMessageListener
                    if (!UUID.matches(account) || !UUID.matches(conversation) ||
                        messages.length() !in 1..60) return@addWebMessageListener
                    val title = data.optString("title")
                    io.execute {
                        NativeChatStore(app).save(account, conversation, title, messages)
                    }
                }
                "logout" -> io.execute { NativeChatStore(app).clearAll() }
            }
        }
    }
}
