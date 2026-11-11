package com.soumoiss.looply

import android.content.Context
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Temporary compatibility bridge until Neon Auth has a native login.
 * The message source must be the trusted app's MAIN FRAME; foreign iframes
 * and third-party sites cannot write or read the native session.
 */
internal object NativeCallAuthBridge {
    private const val ORIGIN = "https://soumoiss.github.io"
    private val io = Executors.newSingleThreadExecutor()
    private val accountPattern = Regex("[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}")

    fun register(context: Context, webView: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        val app = context.applicationContext
        WebViewCompat.addWebMessageListener(webView, "LooplyNativeCallAuth", setOf(ORIGIN)) {
            _, message, sourceOrigin, isMainFrame, _ ->
            if (!isMainFrame || sourceOrigin.toString() != ORIGIN) return@addWebMessageListener
            val raw = message.data ?: return@addWebMessageListener
            if (raw.length !in 10..12_000) return@addWebMessageListener
            val payload = runCatching { JSONObject(raw) }.getOrNull()
                ?: return@addWebMessageListener
            when (payload.optString("type")) {
                "clear" -> io.execute {
                    NativeCallSessionStore.clear(app)
                    NativeFcmRecoveryJob.clearOnLogout(app)
                    app.getSharedPreferences("looply_android_device", Context.MODE_PRIVATE)
                        .edit().remove("pending_incoming_call")
                        .remove("pending_incoming_call_at").apply()
                }
                "session" -> {
                    val account = payload.optString("account")
                    val token = payload.optString("accessToken")
                    val expiresAt = payload.optLong("expiresAtMs", 0L)
                    if (!accountPattern.matches(account) ||
                        token.length !in 25..8192 || expiresAt <= 0) return@addWebMessageListener
                    io.execute {
                        if (NativeCallSessionStore.save(app, account, token, expiresAt)) {
                            // A background token refresh may have preceded login.
                            NativeFcmRecoveryJob.enqueue(app)
                        }
                    }
                }
            }
        }
    }
}
