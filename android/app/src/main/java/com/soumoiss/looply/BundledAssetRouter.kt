package com.soumoiss.looply

import android.content.Context
import android.net.Uri
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream

/**
 * Strict local document router for the temporary compatibility WebView.
 *
 * Keeping the existing HTTPS origin is necessary until Neon Auth and the
 * Workers CORS allowlists have been migrated and tested. It does NOT mean
 * any document or static resource may be fetched from GitHub Pages.
 *
 * WebViewAssetLoader can return null for paths it does not handle, which
 * normally allows WebView to fetch the same URL from the network. Return
 * a local HTTP 404 for ANY request to the legacy GitHub Pages host instead.
 * This also covers /Looply/ paths absent from the packaged APK.
 */
internal class BundledAssetRouter(context: Context) {
    private val loader = WebViewAssetLoader.Builder()
        .setDomain(LEGACY_VIRTUAL_HOST)
        .addPathHandler("/Looply/", WebViewAssetLoader.AssetsPathHandler(context))
        .build()

    // A separate, debug-only origin avoids preexisting Service Workers from
    // the Looply login shell taking control of the camera test document.
    private val isolatedTestLoader by lazy {
        WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/Looply/", WebViewAssetLoader.AssetsPathHandler(context))
            .build()
    }

    fun intercept(url: Uri): WebResourceResponse? {
        if (url.host.equals("appassets.androidplatform.net", ignoreCase = true) &&
            BuildConfig.DEBUG) {
            // Only one fixed local fixture is accepted; never serve or execute
            // user-controlled resources through this privileged test origin.
            if (url.scheme != "https" ||
                url.path != "/Looply/assets/test/android-media-acceptance.html"
            ) return localNotFound()
            val fixture = isolatedTestLoader.shouldInterceptRequest(url)
            return fixture?.takeIf { it.data != null } ?: localNotFound()
        }
        if (!url.host.equals(LEGACY_VIRTUAL_HOST, ignoreCase = true)) return null
        if (!url.scheme.equals("https", ignoreCase = true)) return localNotFound()
        // AssetsPathHandler may return WebResourceResponse(null, null, null)
        // for missing files (statusCode 0 in Android's Java API). Translate
        // that sentinel to a real, explicit HTTP 404 for deterministic tests
        // and to guarantee no network fallback.
        val bundled = loader.shouldInterceptRequest(url)
        return bundled?.takeIf { it.data != null } ?: localNotFound()
    }

    companion object {
        const val LEGACY_VIRTUAL_HOST = "soumoiss.github.io"

        fun localNotFound() = WebResourceResponse(
            "text/plain",
            "UTF-8",
            404,
            "Not Found",
            mapOf(
                "Cache-Control" to "no-store",
                "X-Content-Type-Options" to "nosniff"
            ),
            ByteArrayInputStream(ByteArray(0))
        )
    }
}
