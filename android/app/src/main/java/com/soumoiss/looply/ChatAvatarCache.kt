package com.soumoiss.looply

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.net.Uri
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/** Cached actual contact portraits from authenticated WebView sessions.
 * The bridge is main-frame/origin restricted; files never leave private app storage.
 * A missing image never holds up delivery of an FCM notification. */
object ChatAvatarCache {
    private val uuid = Regex("[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}")
    private val jobs = Executors.newSingleThreadExecutor()
    private fun imageFile(context: Context, userId: String) =
        File(File(context.filesDir, "notification_avatars"), "$userId.jpg")

    fun load(context: Context, userId: String?): Bitmap? {
        if (userId == null || !uuid.matches(userId)) return null
        val file = imageFile(context, userId)
        if (!file.isFile || file.length() !in 1..131072L) return null
        return try { BitmapFactory.decodeFile(file.absolutePath) } catch (_: Exception) { null }
    }

    fun register(context: Context, webView: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(webView,"LooplyAvatarCache",
            setOf("https://soumoiss.github.io")) { _, message, origin, isMainFrame, _ ->
            if (!isMainFrame || origin.toString() != "https://soumoiss.github.io") return@addWebMessageListener
            val data = try { JSONObject(message.data ?: return@addWebMessageListener) }
                catch (_: Exception) { return@addWebMessageListener }
            val userId = data.optString("userId")
            val value = data.optString("url")
            if (!uuid.matches(userId) || value.length !in 15..4096) return@addWebMessageListener
            val uri = try { Uri.parse(value) } catch (_: Exception) { return@addWebMessageListener }
            val host = uri.host?.lowercase() ?: return@addWebMessageListener
            // A signed image URL is read only from Looply's trusted storage hosts.
            if (uri.scheme != "https" || uri.userInfo != null ||
                !(host.endsWith(".neon.tech") || host.endsWith(".r2.dev") ||
                  host.endsWith(".r2.cloudflarestorage.com"))) return@addWebMessageListener
            jobs.execute {
                val file = imageFile(context, userId)
                if (file.isFile && System.currentTimeMillis() - file.lastModified() < 86400000L) return@execute
                val conn = try { URL(value).openConnection() as HttpURLConnection }
                    catch (_: Exception) { return@execute }
                try {
                    conn.connectTimeout=1800
                    conn.readTimeout=2500
                    conn.instanceFollowRedirects=false
                    if (conn.responseCode != 200 ||
                        conn.contentLengthLong > 1048576L) return@execute
                    val output=ByteArrayOutputStream()
                    conn.inputStream.use { stream ->
                        val buffer=ByteArray(8192)
                        while(true){
                            val count=stream.read(buffer)
                            if(count<0)break
                            if(count==0)continue
                            if(output.size()+count>1048576)return@execute
                            output.write(buffer,0,count)
                        }
                    }
                    val bytes=output.toByteArray()
                    if (bytes.isEmpty()) return@execute
                    val options=BitmapFactory.Options().apply { inJustDecodeBounds=true }
                    BitmapFactory.decodeByteArray(bytes,0,bytes.size,options)
                    if (options.outWidth !in 1..8192 || options.outHeight !in 1..8192) return@execute
                    val bounds=BitmapFactory.Options().apply {
                        inSampleSize = maxOf(1, maxOf(options.outWidth, options.outHeight) / 160)
                    }
                    val bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds) ?: return@execute
                    val target=Bitmap.createBitmap(128,128,Bitmap.Config.ARGB_8888)
                    val canvas=Canvas(target)
                    val scale=maxOf(128f/bitmap.width,128f/bitmap.height)
                    val w=bitmap.width*scale
                    val h=bitmap.height*scale
                    canvas.drawBitmap(bitmap,null,android.graphics.RectF((128-w)/2,(128-h)/2,(128+w)/2,(128+h)/2),Paint(Paint.FILTER_BITMAP_FLAG))
                    bitmap.recycle()
                    file.parentFile?.mkdirs()
                    val temp=File(file.parentFile,"${userId}.tmp")
                    temp.outputStream().use { target.compress(Bitmap.CompressFormat.JPEG,88,it) }
                    temp.renameTo(file)
                    target.recycle()
                } catch (_: Exception) { /* Avatar is optional. */ }
                finally { conn.disconnect() }
            }
        }
    }
}
