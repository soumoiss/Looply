package com.soumoiss.looply

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.net.URL
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection

/**
 * "Recusar" runs from an Android notification action without opening
 * MainActivity or WebView. The authoritative Neon RPC verifies that there is
 * still an active incoming offer for the authenticated recipient.
 */
class NativeCallDeclineReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_DECLINE) return
        val conversation = intent.getStringExtra("conversationId") ?: return
        if (!UUID.matches(conversation)) return
        val app = context.applicationContext
        val prefs = app.getSharedPreferences("looply_android_device", Context.MODE_PRIVATE)
        val age = System.currentTimeMillis() - prefs.getLong("pending_incoming_call_at", 0L)
        if (prefs.getString("pending_incoming_call", null) != conversation ||
            age !in 0..35_000L) return

        val pending = goAsync()
        worker.execute {
            try {
                val session = NativeCallSessionStore.read(app)
                if (session != null && sendDecline(session.accessToken, conversation)) {
                    // Remove pending state only if no subsequent call replaced it.
                    val latest = prefs.getString("pending_incoming_call", null)
                    val latestAge = System.currentTimeMillis() -
                        prefs.getLong("pending_incoming_call_at", 0)
                    if (latest == conversation && latestAge in 0..35_000L) {
                        prefs.edit().remove("pending_incoming_call")
                            .remove("pending_incoming_call_at").apply()
                        app.getSystemService(NotificationManager::class.java)
                            .cancel(conversation.hashCode())
                    }
                } else showFailure(app, conversation)
            } catch (_: Exception) {
                showFailure(app, conversation)
            } finally {
                pending.finish()
            }
        }
    }

    private fun sendDecline(token: String, conversation: String): Boolean {
        val started = SystemClock.elapsedRealtime()
        val offerResponse = rpc(
            "v23_fcm_pending_incoming_offer", token,
            JSONObject().put("p_conversation_id", conversation)
        ) ?: return false
        val offer = runCatching { JSONObject(offerResponse) }.getOrNull() ?: return false
        if (offer.optString("conversationId") != conversation ||
            offer.optString("mode") !in setOf("audio", "video") ||
            offer.optString("senderId").isBlank()) return false
        val callId = offer.optString("callId").take(128)
        val payload = JSONObject()
            .put("type", "decline")
            .put("conversationId", conversation)
        if (callId.isNotBlank()) payload.put("callId", callId)
        if (SystemClock.elapsedRealtime() - started > 7_000L) return false
        return rpc(
            "v3_call_signal_send", token,
            JSONObject()
                .put("p_conversation_id", conversation)
                .put("p_kind", "signal")
                .put("p_payload", payload)
        )?.toLongOrNull() != null
    }

    private fun rpc(method: String, token: String, arguments: JSONObject): String? {
        if (method !in setOf("v23_fcm_pending_incoming_offer", "v3_call_signal_send")) return null
        val connection = (URL("$NEON_DATA_API/rpc/$method").openConnection() as HttpsURLConnection)
        return try {
            connection.connectTimeout = 2_000
            connection.readTimeout = 2_000
            connection.instanceFollowRedirects = false
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Cache-Control", "no-store")
            connection.outputStream.use { it.write(arguments.toString().toByteArray(Charsets.UTF_8)) }
            if (connection.responseCode !in 200..299) return null
            connection.inputStream.bufferedReader().use { it.readText() }.take(20_000)
        } catch (_: Exception) {
            null
        } finally {
            connection.disconnect()
        }
    }

    private fun showFailure(app: Context, conversation: String) {
        val manager = app.getSystemService(NotificationManager::class.java)
        val notification = NotificationCompat.Builder(app, "looply_calls_v2")
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle("Não foi possível recusar")
            .setContentText("A chamada pode ter terminado ou a sessão está indisponível.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setTimeoutAfter(15_000L)
            .build()
        manager.notify(conversation.hashCode(), notification)
    }

    companion object {
        const val ACTION_DECLINE = "com.looply.app.native.CALL_DECLINE"
        private const val NEON_DATA_API =
            "https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1"
        private val UUID = Regex("[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}")
        private val worker = Executors.newSingleThreadExecutor()
    }
}
