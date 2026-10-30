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

    private fun hasSupportedExternalLink(value: String): Boolean {
        val allowed = setOf("instagram.com", "www.instagram.com",
            "m.instagram.com", "l.instagram.com", "tiktok.com",
            "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
            "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be")
        val urls = Regex("https://[^\\s<>\\\"']+", RegexOption.IGNORE_CASE)
        return urls.findAll(value).any { match ->
            try {
                val parsed = Uri.parse(match.value.trimEnd(')', ',', '.', ';', '!', '?'))
                parsed.scheme.equals("https", true) &&
                    parsed.host?.lowercase() in allowed
            } catch (_: Exception) { false }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (intent?.action != Intent.ACTION_SEND) { finish(); return }

        // Some versions of Instagram send a Reel URL as CharSequence while
        // declaring video/* instead of text/plain. Treat a URL as a link, never
        // as an MP4 unless Android actually grants a content:// stream.
        val sharedText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)
            ?.toString()?.take(2500).orEmpty()
        @Suppress("DEPRECATION")
        val content = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            ?: intent.clipData?.getItemAt(0)?.uri
        if (content != null && content.scheme == "content") {
            val detected = try { contentResolver.getType(content) } catch (_: Exception) { null }
            val allowed = setOf("image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm")
            // Some Android providers omit MIME or OpenableColumns.SIZE. Use only
            // an explicit allowlisted Intent MIME and a bounded descriptor length.
            val mime = detected?.takeIf { it in allowed }
                ?: intent.type?.lowercase()?.takeIf { it in allowed }
            val bytes = mediaLength(content)
                ?: try {
                    contentResolver.openAssetFileDescriptor(content, "r")?.use { descriptor ->
                        descriptor.length.takeIf { it >= 0L }
                    }
                } catch (_: Exception) { null }
            if (mime in allowed && bytes != null && bytes in 1..(100L * 1024L * 1024L)) {
                sharedUri = content
                sharedMime = mime
            }
        }
        // A valid social URL is accepted regardless of the MIME hint. This
        // prevents link-only Reels from being discarded by Android Sharesheet.
        // Arbitrary non-URL text on video/* does not grant an upload.
        if (sharedUri == null && !hasSupportedExternalLink(sharedText)) {
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

            override fun onReceivedError(
                view: WebView, request: WebResourceRequest,
                error: android.webkit.WebResourceError
            ) {
                if (request.isForMainFrame) showLocalShareError(view)
            }
            override fun onReceivedHttpError(
                view: WebView, request: WebResourceRequest,
                response: WebResourceResponse
            ) {
                if (request.isForMainFrame && response.statusCode >= 400)
                    showLocalShareError(view)
            }

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

    private fun showLocalShareError(view: WebView) {
        // Never silently redirect this isolated sharing Activity to GitHub's
        // generic 404. Keep an escape hatch when local resources are missing.
        val html = "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'>" +
            "<body style='font:16px system-ui;background:#f5f0fa;padding:24px'>" +
            "<h2>Não foi possível abrir o compartilhamento</h2>" +
            "<p>O formulário local está indisponível. Volte e tente novamente.</p>" +
            "<button onclick='LooplyShare.complete()'>Fechar</button></body>"
        view.post {
            if (!isFinishing && shareView === view)
                view.loadDataWithBaseURL("https://soumoiss.github.io/Looply/",
                    html, "text/html", "UTF-8", null)
        }
    }

    override fun onDestroy() {
        shareView?.destroy()
        shareView = null
        sharedUri = null
        super.onDestroy()
    }
}
