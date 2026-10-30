package com.soumoiss.looply

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.WindowManager
import androidx.webkit.WebViewAssetLoader

/**
 * Official Android Sharesheet target. Only the granted content URI may be
 * served to the isolated Looply page, after a deliberate "Publicar" press.
 * Never resolves arbitrary paths or exposes local files to Javascript.
 */
class ShareReceiverActivity : Activity() {
    private var shareView: WebView? = null
    private var sharedUri: Uri? = null
    private var sharedMime: String? = null

    private val assets by lazy {
        WebViewAssetLoader.Builder()
            .setDomain("soumoiss.github.io")
            .addPathHandler("/Looply/__shared/", WebViewAssetLoader.PathHandler { path ->
                if (path != "media" || sharedUri == null || sharedMime == null) {
                    null
                } else try {
                    val input = contentResolver.openInputStream(sharedUri!!)
                    if (input == null) null else WebResourceResponse(sharedMime, null, input)
                } catch (_: Exception) { null }
            })
            .addPathHandler("/Looply/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    private fun mediaLength(uri: Uri): Long? = try {
        contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst() && !cursor.isNull(0)) cursor.getLong(0) else null
        }
    } catch (_: Exception) { null }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (intent?.action != Intent.ACTION_SEND) { finish(); return }

        val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)?.take(2500).orEmpty()
        @Suppress("DEPRECATION")
        val content = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
        if (content != null && content.scheme == "content") {
            val type = try { contentResolver.getType(content) } catch (_: Exception) { null }
            val allowed = setOf("image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm")
            val bytes = mediaLength(content)
            if (type in allowed && bytes != null && bytes in 1..(100L * 1024L * 1024L)) {
                sharedUri = content
                sharedMime = type
            }
        }
        if (sharedUri == null && (intent.type != "text/plain" || sharedText.isBlank())) {
            finish()
            return
        }

        window.setBackgroundDrawableResource(android.R.color.transparent)
        window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
        window.attributes = window.attributes.apply {
            width = WindowManager.LayoutParams.MATCH_PARENT
            height = WindowManager.LayoutParams.WRAP_CONTENT
            dimAmount = 0.42f
        }
        val web = WebView(this)
        shareView = web
        web.setBackgroundColor(Color.rgb(245, 240, 250))
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) =
                assets.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return request.isForMainFrame && (
                    request.url.scheme != "https" ||
                    request.url.host != "soumoiss.github.io" ||
                    request.url.path != "/Looply/share.html"
                )
            }
        }
        web.addJavascriptInterface(object {
            @JavascriptInterface fun complete() { runOnUiThread { finish() } }
        }, "LooplyShare")
        setContentView(web)
        val query = "?text=" + Uri.encode(sharedText) +
            (sharedMime?.let { "&mime=" + Uri.encode(it) } ?: "")
        web.loadUrl("https://soumoiss.github.io/Looply/share.html" + query)
    }

    override fun onDestroy() {
        shareView?.destroy()
        shareView = null
        sharedUri = null
        super.onDestroy()
    }
}
