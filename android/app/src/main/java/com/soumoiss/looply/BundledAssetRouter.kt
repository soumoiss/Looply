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

    fun intercept(url: Uri): WebResourceResponse? {
        if (!url.host.equals(LEGACY_VIRTUAL_HOST, ignoreCase = true)) return null
        if (!url.scheme.equals("https", ignoreCase = true)) return localNotFound()
        return loader.shouldInterceptRequest(url) ?: localNotFound()
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
