package com.soumoiss.looply

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.WindowManager
import androidx.webkit.WebViewAssetLoader

/** Small Android share-target dialog. Posting is performed only after user confirmation. */
class ShareReceiverActivity : Activity() {
    private var shareView: WebView? = null

    private val assets by lazy {
        WebViewAssetLoader.Builder()
            .setDomain("soumoiss.github.io")
            .addPathHandler("/Looply/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val sharedText = if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            intent.getStringExtra(Intent.EXTRA_TEXT)?.take(2500).orEmpty()
        } else ""
        if (sharedText.isBlank()) { finish(); return }
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
        web.loadUrl("https://soumoiss.github.io/Looply/share.html?text=" + android.net.Uri.encode(sharedText))
    }

    override fun onDestroy() {
        shareView?.destroy()
        shareView = null
        super.onDestroy()
    }
}
