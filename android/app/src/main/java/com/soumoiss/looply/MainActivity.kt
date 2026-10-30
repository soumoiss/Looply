package com.soumoiss.looply

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Message
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebChromeClient.FileChooserParams
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import android.webkit.URLUtil
import androidx.webkit.WebViewAssetLoader
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.util.UUID

class MainActivity : Activity() {
    private data class PendingDownload(
        val url: String,
        val userAgent: String?,
        val disposition: String?,
        val mimeType: String?
    )

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var errorPanel: LinearLayout
    private lateinit var errorTitle: TextView
    private lateinit var errorMessage: TextView

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingDownload: PendingDownload? = null
    private var pendingWebPermission: PermissionRequest? = null
    private var pendingWebResources: Array<String> = emptyArray()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var navigationSequence = 0
    private var reloadLocked = false
    private var networkCallbackRegistered = false
    private var wasOffline = false
    private var backInvokedCallback: OnBackInvokedCallback? = null

    private val connectivityManager by lazy {
        getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    }

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .setDomain(GITHUB_PAGES_HOST)
            .addPathHandler("/Looply/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            runOnUiThread {
                if (wasOffline) {
                    wasOffline = false
                    loadLooply()
                }
            }
        }

        override fun onLost(network: Network) {
            runOnUiThread {
                if (!hasInternet()) {
                    wasOffline = true
                    showError(
                        "Sem conexão com a internet",
                        "Conecte-se à internet para sincronizar o Looply com suas conversas, publicações e mídias."
                    )
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(22, 15, 32)
        window.navigationBarColor = Color.rgb(22, 15, 32)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }

        createLayout()
        configureWebView()
        requestNotificationPermissionIfNeeded()
        if (Build.VERSION.SDK_INT >= 33) {
            backInvokedCallback = OnBackInvokedCallback { handleBack() }
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                backInvokedCallback!!
            )
        }

        val restored = savedInstanceState?.let { webView.restoreState(it) != null } ?: false
        if (!restored) {
            if (hasInternet()) loadLooply() else {
                wasOffline = true
                showError(
                    "Sem conexão com a internet",
                    "O Looply precisa de internet para conectar sua conta e sincronizar suas mídias."
                )
            }
        }
        handleNotificationRoute(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        if (intent != null) { setIntent(intent); handleNotificationRoute(intent) }
    }

    private fun handleNotificationRoute(intent: Intent) {
        val route = intent.getStringExtra("looply_route") ?: return
        val id = "[a-fA-F0-9-]{36}"
        val allowed = Regex("""(?:conversa\.html\?id=$id|chat\.html|cartas\.html(?:\?letterId=$id)?|musicas\.html(?:#dedication-$id)?|home\.html(?:\?storyId=$id#stories|#stories|#post-$id)?|notificacoes\.html)""")
        if (!route.matches(allowed)) return
        webView.post { webView.loadUrl("$REMOTE_START_URL$route") }
    }

    override fun onStart() {
        super.onStart()
        if (!networkCallbackRegistered && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                connectivityManager.registerDefaultNetworkCallback(networkCallback)
                networkCallbackRegistered = true
            } catch (_: SecurityException) {
                // INTERNET permission is declared; keep the current page usable if Android blocks observation.
            }
        }
    }

    override fun onStop() {
        unregisterNetworkCallback()
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) {
            webView.onResume()
            syncFirebaseTokenToWeb(webView.url)
            if (wasOffline && hasInternet()) {
                wasOffline = false
                loadLooply()
            }
        }
    }

    override fun onPause() {
        if (::webView.isInitialized) webView.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::webView.isInitialized) webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("Use the predictive back dispatcher on Android 13 and newer.")
    override fun onBackPressed() {
        if (Build.VERSION.SDK_INT < 33) handleBack()
    }

    private fun handleBack() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            finish()
        }
    }

    private fun createLayout() {
        root = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(22, 15, 32))
            fitsSystemWindows = false
        }

        webView = WebView(this).apply {
            setBackgroundColor(Color.rgb(22, 15, 32))
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        root.addView(webView)

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progressTintList = ColorStateList.valueOf(Color.rgb(151, 82, 255))
            progressBackgroundTintList = ColorStateList.valueOf(Color.TRANSPARENT)
            visibility = View.GONE
        }
        root.addView(
            progressBar,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(3),
                Gravity.TOP
            )
        )

        errorPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(28), dp(28), dp(28))
            background = GradientDrawable().apply {
                setColor(Color.rgb(35, 25, 48))
                cornerRadius = dp(22).toFloat()
            }
            visibility = View.GONE
        }

        errorTitle = TextView(this).apply {
            text = "Looply indisponível"
            textSize = 20f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }
        errorMessage = TextView(this).apply {
            textSize = 15f
            setTextColor(Color.rgb(218, 208, 229))
            gravity = Gravity.CENTER
            setPadding(0, dp(12), 0, dp(20))
        }
        val retryButton = Button(this).apply {
            text = "Recarregar"
            isAllCaps = false
            setOnClickListener { reloadCurrentPage() }
        }
        val homeButton = Button(this).apply {
            text = "Voltar ao início"
            isAllCaps = false
            setOnClickListener { if (hasInternet()) loadLooply() else
                showError("Sem conexão com a internet", "Conecte-se à internet e tente novamente.") }
        }
        errorPanel.addView(errorTitle)
        errorPanel.addView(errorMessage)
        errorPanel.addView(
            retryButton,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        )
        errorPanel.addView(homeButton, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(
            errorPanel,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
            ).apply {
                leftMargin = dp(24)
                rightMargin = dp(24)
            }
        )

        // Native recovery control remains responsive even when page JavaScript hangs.
        val reloadControl = TextView(this).apply {
            text = "↻"
            contentDescription = "Recarregar Looply"
            textSize = 26f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(93, 28, 165))
            background = GradientDrawable().apply {
                setColor(Color.argb(235, 255, 255, 255))
                cornerRadius = dp(22).toFloat()
            }
            setOnClickListener { reloadCurrentPage() }
        }
        root.addView(reloadControl, FrameLayout.LayoutParams(dp(44), dp(44), Gravity.TOP or Gravity.END).apply {
            rightMargin = dp(10)
            topMargin = dp(8)
        })

        root.setOnApplyWindowInsetsListener { view, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bars = insets.getInsets(
                    WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()
                )
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            } else {
                @Suppress("DEPRECATION")
                view.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom
                )
            }
            insets
        }

        setContentView(root)
    }

    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = false
            allowFileAccess = false
            // HTML file inputs return content:// URIs from Android's system picker.
            // WebView must be allowed to read those user-selected content URIs for uploads.
            // File URLs and cross-origin file access remain disabled below.
            allowContentAccess = true
            allowFileAccessFromFileURLs = false
            allowUniversalAccessFromFileURLs = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(true)
            loadsImagesAutomatically = true
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                safeBrowsingEnabled = true
            }
        }
        CookieManager.getInstance().setAcceptCookie(true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ) = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                if (!request.isForMainFrame) return false
                return routeTopLevelUrl(request.url)
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                val sequence = ++navigationSequence
                progressBar.progress = 0
                progressBar.visibility = View.VISIBLE
                errorPanel.visibility = View.GONE
                // A completed HTML response does not mean the SPA initialized:
                // index.html may stay on the splash indefinitely after a JS/auth failure.
                mainHandler.postDelayed({
                    if (isFinishing || isDestroyed || sequence != navigationSequence) return@postDelayed
                    val current = webView.url.orEmpty().substringBefore("?").substringBefore("#")
                    if (progressBar.visibility == View.VISIBLE || current.endsWith("/index.html")) {
                        webView.stopLoading()
                        showError("O Looply demorou para abrir",
                            "A inicialização não foi concluída. Recarregue ou volte ao início.")
                    }
                }, 20000L)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                progressBar.progress = 100
                progressBar.visibility = View.GONE
                syncFirebaseTokenToWeb(url)
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: android.webkit.WebResourceError
            ) {
                if (request.isForMainFrame) {
                    progressBar.visibility = View.GONE
                    showError(
                        if (hasInternet()) "Não foi possível abrir o Looply" else "Sem conexão com a internet",
                        if (hasInternet()) "O conteúdo local não carregou corretamente. Tente novamente."
                        else "Conecte-se à internet para sincronizar sua conta e mídias."
                    )
                }
            }

            override fun onReceivedHttpError(
                view: WebView,
                request: WebResourceRequest,
                response: android.webkit.WebResourceResponse
            ) {
                if (request.isForMainFrame && response.statusCode >= 400) {
                    progressBar.visibility = View.GONE
                    showError(
                        "Looply indisponível",
                        "Não foi possível carregar esta página. Tente novamente."
                    )
                }
            }

            override fun onRenderProcessGone(
                view: WebView, detail: RenderProcessGoneDetail
            ): Boolean {
                // A crashed renderer cannot be reused. Replace the WebView in place.
                ++navigationSequence
                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()
                webView = WebView(this@MainActivity).apply {
                    setBackgroundColor(Color.rgb(22, 15, 32))
                    layoutParams = FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                }
                root.addView(webView, 0)
                configureWebView()
                showError("O Looply precisou reiniciar",
                    "O componente de navegação foi encerrado pelo Android. Toque em Recarregar.")
                return true
            }

            override fun onReceivedSslError(
                view: WebView,
                handler: android.webkit.SslErrorHandler,
                error: android.net.http.SslError
            ) {
                handler.cancel()
                progressBar.visibility = View.GONE
                showError(
                    "Conexão segura indisponível",
                    "O certificado do servidor não pôde ser validado. Tente novamente mais tarde."
                )
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progressBar.progress = newProgress
                if (newProgress >= 100) progressBar.visibility = View.GONE
            }

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                // Resolve the previous WebView callback before accepting a new chooser request.
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = callback

                val intents = mutableListOf<Intent>()
                try {
                    // Android's documented WebView flow: launch createIntent() directly,
                    // rather than wrapping it in a second chooser intent.
                    intents += params.createIntent()
                } catch (_: Exception) {
                    // Older/custom WebView implementations may not provide a usable intent.
                }

                // Fallbacks support Android Photo Picker / DocumentsUI on vendor builds
                // where the WebView-generated intent cannot be resolved.
                val mimeTypes = params.acceptTypes
                    .flatMap { it.split(",") }
                    .map { it.trim().substringBefore(";") }
                    .filter { it.isNotBlank() && (it == "*/*" || it.contains("/")) }
                    .distinct()
                    .toTypedArray()
                val fallback = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = mimeTypes.firstOrNull() ?: "*/*"
                    if (mimeTypes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes)
                    if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    }
                }
                intents += fallback

                val documentIntent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = mimeTypes.firstOrNull() ?: "*/*"
                    if (mimeTypes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes)
                    if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    }
                }
                intents += documentIntent

                for (pickerIntent in intents.distinctBy { it.action to it.type }) {
                    try {
                        startActivityForResult(pickerIntent, REQUEST_FILE_CHOOSER)
                        return true
                    } catch (_: android.content.ActivityNotFoundException) {
                        // Try the next compatible system picker.
                    } catch (_: SecurityException) {
                        // Continue to the system picker fallback.
                    } catch (_: Exception) {
                        // OEM picker incompatibility; try the next intent.
                    }
                }

                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = null
                Toast.makeText(
                    this@MainActivity,
                    "Nenhum seletor de arquivos compatível foi encontrado no dispositivo.",
                    Toast.LENGTH_LONG
                ).show()
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                authorizeWebMedia(request)
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                if (pendingWebPermission === request) {
                    pendingWebPermission = null
                    pendingWebResources = emptyArray()
                }
            }

            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message
            ): Boolean {
                if (!isUserGesture) return false
                val transport = resultMsg.obj as? WebView.WebViewTransport ?: return false
                val popup = WebView(this@MainActivity)
                popup.settings.javaScriptEnabled = true
                popup.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        view: WebView,
                        request: WebResourceRequest
                    ): Boolean {
                        routePopup(view, request.url.toString())
                        return true
                    }

                    override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                        if (!url.isNullOrBlank() && url != "about:blank") {
                            routePopup(view, url)
                        }
                    }
                }
                transport.webView = popup
                resultMsg.sendToTarget()
                return true
            }
        }

        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            startDownload(url, userAgent, contentDisposition, mimeType)
        }
    }

    private fun routePopup(popup: WebView, rawUrl: String) {
        if (popup.tag == true) return
        popup.tag = true
        val uri = Uri.parse(rawUrl)
        if (isTrustedWebOrigin(uri)) {
            webView.loadUrl(rawUrl)
        } else {
            launchExternal(uri)
        }
        popup.post {
            (popup.parent as? ViewGroup)?.removeView(popup)
            popup.stopLoading()
            popup.destroy()
        }
    }

    private fun routeTopLevelUrl(uri: Uri): Boolean {
        if (isTrustedWebOrigin(uri)) return false
        if (uri.scheme.equals("https", ignoreCase = true) ||
            uri.scheme.equals("mailto", ignoreCase = true) ||
            uri.scheme.equals("tel", ignoreCase = true)
        ) {
            launchExternal(uri)
        }
        return true
    }

    private fun isTrustedWebOrigin(uri: Uri): Boolean {
        if (!uri.scheme.equals("https", ignoreCase = true)) return false
        val host = uri.host?.lowercase() ?: return false
        return host == APP_ASSET_HOST || host == GITHUB_PAGES_HOST
    }

    private fun launchExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: Exception) {
            Toast.makeText(this, "Não há um aplicativo disponível para abrir este link.", Toast.LENGTH_LONG).show()
        }
    }

    private fun authorizeWebMedia(request: PermissionRequest) {
        if (!request.origin.scheme.equals("https", ignoreCase = true) ||
            request.origin.host?.lowercase() != GITHUB_PAGES_HOST ||
            request.origin.port !in listOf(-1, 443) ||
            !webView.url.orEmpty().startsWith(REMOTE_START_URL)
        ) {
            request.deny()
            return
        }

        val resources = request.resources.filter {
            it == PermissionRequest.RESOURCE_VIDEO_CAPTURE ||
                it == PermissionRequest.RESOURCE_AUDIO_CAPTURE
        }
        if (resources.size != request.resources.size || resources.isEmpty()) {
            request.deny()
            return
        }

        val runtimePermissions = buildList {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE in resources) add(Manifest.permission.CAMERA)
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE in resources) add(Manifest.permission.RECORD_AUDIO)
        }.distinct()

        if (runtimePermissions.all {
                checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
            }
        ) {
            request.grant(resources.toTypedArray())
            return
        }

        pendingWebPermission?.deny()
        pendingWebPermission = request
        pendingWebResources = resources.toTypedArray()
        requestPermissions(runtimePermissions.toTypedArray(), REQUEST_WEB_MEDIA)
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                REQUEST_POST_NOTIFICATIONS
            )
        }
    }

    @Deprecated("Deprecated in Android, but retained for API 24 and 25.")
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            REQUEST_WEB_MEDIA -> {
                val request = pendingWebPermission
                pendingWebPermission = null
                if (request == null) return
                if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED } &&
                    webView.url.orEmpty().startsWith(REMOTE_START_URL) &&
                    pendingWebResources.isNotEmpty()
                ) {
                    request.grant(pendingWebResources)
                } else {
                    request.deny()
                }
                pendingWebResources = emptyArray()
            }
            REQUEST_DOWNLOAD_STORAGE -> {
                val download = pendingDownload
                pendingDownload = null
                if (download != null && grantResults.any { it == PackageManager.PERMISSION_GRANTED }) {
                    enqueueDownload(download)
                } else {
                    Toast.makeText(this, "Permita o acesso para salvar o download.", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun startDownload(url: String, userAgent: String?, disposition: String?, mimeType: String?) {
        if (!Uri.parse(url).scheme.equals("https", ignoreCase = true)) {
            Toast.makeText(this, "Por segurança, só é possível baixar arquivos por HTTPS.", Toast.LENGTH_LONG).show()
            return
        }
        val download = PendingDownload(url, userAgent, disposition, mimeType)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
        ) {
            pendingDownload = download
            requestPermissions(
                arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE),
                REQUEST_DOWNLOAD_STORAGE
            )
            return
        }
        enqueueDownload(download)
    }

    private fun enqueueDownload(download: PendingDownload) {
        val uri = Uri.parse(download.url)
        try {
            val request = DownloadManager.Request(uri).apply {
                val fileName = URLUtil.guessFileName(download.url, download.disposition, download.mimeType)
                setTitle(fileName)
                setDescription("Baixando arquivo do Looply")
                setMimeType(download.mimeType)
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    fileName
                )
                allowScanningByMediaScanner()
                download.userAgent?.let { addRequestHeader("User-Agent", it) }
                CookieManager.getInstance().getCookie(download.url)?.let { addRequestHeader("Cookie", it) }
            }
            getSystemService(DownloadManager::class.java).enqueue(request)
            Toast.makeText(this, "Download iniciado.", Toast.LENGTH_SHORT).show()
        } catch (_: Exception) {
            Toast.makeText(this, "Não foi possível iniciar o download.", Toast.LENGTH_LONG).show()
        }
    }

    // Never send the Firebase service-account credentials to the client.
    // Only the per-device public push destination is passed to our own trusted page;
    // Neon verifies the authenticated user's identity before accepting registration.
    private fun syncFirebaseTokenToWeb(url: String?) {
        if (!url.orEmpty().startsWith(REMOTE_START_URL)) return
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (isFinishing || isDestroyed || !::webView.isInitialized) return@addOnCompleteListener
            if (!webView.url.orEmpty().startsWith(REMOTE_START_URL)) return@addOnCompleteListener
            val preferences = getSharedPreferences("looply_android_device", Context.MODE_PRIVATE)
            val token = (if (task.isSuccessful) task.result else null)
                ?.takeIf { it.length in 25..4096 }
                ?: preferences.getString("last_fcm_token", null)?.takeIf { it.length in 25..4096 }
                ?: return@addOnCompleteListener
            preferences.edit().putString("last_fcm_token", token).apply()
            val deviceId = preferences.getString("device_id", null)
                ?: UUID.randomUUID().toString().also {
                    preferences.edit().putString("device_id", it).apply()
                }
            val payload = JSONObject().put("deviceId", deviceId).put("token", token)
            webView.evaluateJavascript(
                "window.__looplyNativeFcmToken=" + payload.toString() +
                    ";window.dispatchEvent(new CustomEvent('looply:android-fcm-token',{detail:window.__looplyNativeFcmToken}));", null
            )
        }
    }

    private fun reloadCurrentPage() {
        if (reloadLocked) return
        reloadLocked = true
        mainHandler.postDelayed({ reloadLocked = false }, 1500L)
        if (!hasInternet()) {
            showError("Sem conexão com a internet", "Conecte-se à internet e tente novamente.")
            return
        }
        errorPanel.visibility = View.GONE
        progressBar.visibility = View.VISIBLE
        webView.stopLoading()
        if (webView.url.isNullOrBlank()) loadLooply() else webView.reload()
    }

    private fun loadLooply() {
        errorPanel.visibility = View.GONE
        progressBar.visibility = View.VISIBLE
        webView.loadUrl(REMOTE_START_URL + "index.html")
    }

    private fun showError(title: String, message: String) {
        errorTitle.text = title
        errorMessage.text = message
        errorPanel.visibility = View.VISIBLE
        progressBar.visibility = View.GONE
    }

    private fun hasInternet(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun unregisterNetworkCallback() {
        if (!networkCallbackRegistered) return
        try {
            connectivityManager.unregisterNetworkCallback(networkCallback)
        } catch (_: Exception) {
        } finally {
            networkCallbackRegistered = false
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_FILE_CHOOSER) return
        val callback = fileChooserCallback ?: return
        // Clear the callback before delivery so this chooser can never complete twice.
        fileChooserCallback = null

        val selectedUris = if (resultCode == RESULT_OK && data != null) {
            // Prefer WebView's documented parser, then merge the common provider result
            // forms as a compatibility fallback for OEM file pickers and Photo Picker.
            val uris = linkedSetOf<Uri>()
            try {
                FileChooserParams.parseResult(resultCode, data)?.forEach { uri -> uris.add(uri) }
            } catch (_: Exception) {
                // Some vendor pickers return a URI form that the WebView parser does not handle.
            }
            data.data?.let { uris.add(it) }
            data.clipData?.let { clip ->
                for (index in 0 until clip.itemCount) {
                    clip.getItemAt(index).uri?.let { uris.add(it) }
                }
            }
            uris.toTypedArray().takeIf { it.isNotEmpty() }
        } else {
            null
        }

        if (resultCode == RESULT_OK && selectedUris.isNullOrEmpty()) {
            Toast.makeText(
                this,
                "O seletor não retornou o arquivo. Abra Arquivos e tente selecionar novamente.",
                Toast.LENGTH_LONG
            ).show()
        }
        callback.onReceiveValue(selectedUris)
    }

    override fun onDestroy() {
        ++navigationSequence
        mainHandler.removeCallbacksAndMessages(null)
        unregisterNetworkCallback()
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        pendingDownload = null
        pendingWebPermission?.deny()
        pendingWebPermission = null
        if (Build.VERSION.SDK_INT >= 33) {
            backInvokedCallback?.let(onBackInvokedDispatcher::unregisterOnBackInvokedCallback)
            backInvokedCallback = null
        }
        if (::webView.isInitialized) {
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val APP_ASSET_HOST = "appassets.androidplatform.net"
        private const val GITHUB_PAGES_HOST = "soumoiss.github.io"
        private const val REMOTE_START_URL = "https://soumoiss.github.io/Looply/"
        private const val REQUEST_FILE_CHOOSER = 701
        private const val REQUEST_WEB_MEDIA = 702
        private const val REQUEST_DOWNLOAD_STORAGE = 703
        private const val REQUEST_POST_NOTIFICATIONS = 704
    }
}
