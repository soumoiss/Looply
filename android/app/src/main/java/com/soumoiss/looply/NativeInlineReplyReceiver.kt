package com.soumoiss.looply

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection

/**
 * Android Direct Reply: messages are inserted into Neon without opening
 * MainActivity or WebView. PostgreSQL RLS remains authoritative.
 *
 * Only a short-lived, Keystore-encrypted Neon JWT is used. No refresh token,
 * credentials, message body, or JWT goes into a PendingIntent or log.
 */
class NativeInlineReplyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_REPLY) return
        val conversation = intent.getStringExtra(EXTRA_CONVERSATION).orEmpty()
        val messageId = intent.getStringExtra(EXTRA_MESSAGE_ID).orEmpty()
        val createdAt = intent.getLongExtra(EXTRA_CREATED_AT, 0L)
        val age = System.currentTimeMillis() - createdAt
        if (!UUID_PATTERN.matches(conversation) || !UUID_PATTERN.matches(messageId) ||
            age !in 0..MAX_ACTION_AGE_MS) return

        val reply = RemoteInput.getResultsFromIntent(intent)
            ?.getCharSequence(KEY_REPLY)?.toString()?.trim().orEmpty()
        if (reply.isBlank() || reply.length > MAX_REPLY_LENGTH ||
            reply.any { it == '\u0000' }) return

        val app = context.applicationContext
        val pendingResult = goAsync()
        executor.execute {
            try {
                val session = NativeCallSessionStore.read(app)
                if (session == null) {
                    showStatus(app, conversation, false)
                } else {
                    val sent = insertMessage(
                        session.accessToken, session.account, conversation, messageId, reply
                    )
                    showStatus(app, conversation, sent)
                    if (sent) {
                        // The Worker validates the token, message owner and age again.
                        // This is best-effort; scheduled FCM dispatch remains a fallback.
                        requestImmediatePush(session.accessToken, messageId)
                    }
                }
            } catch (_: Exception) {
                showStatus(app, conversation, false)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun insertMessage(
        token: String, account: String, conversation: String,
        messageId: String, body: String
    ): Boolean {
        val payload = JSONObject()
            .put("id", messageId)
            .put("conversation_id", conversation)
            .put("sender_id", account)
            .put("body", body)
        val connection = (URL("$NEON_DATA_API/chat_messages?select=id")
            .openConnection() as HttpsURLConnection)
        return try {
            connection.connectTimeout = 2_500
            connection.readTimeout = 3_000
            connection.instanceFollowRedirects = false
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Prefer", "return=representation")
            connection.setRequestProperty("Cache-Control", "no-store")
            connection.outputStream.use {
                it.write(payload.toString().toByteArray(Charsets.UTF_8))
            }
            when (connection.responseCode) {
                in 200..299 -> {
                    val result = connection.inputStream.bufferedReader().use {
                        it.readText().take(10_000)
                    }
                    val rows = JSONArray(result)
                    rows.length() == 1 &&
                        rows.optJSONObject(0)?.optString("id") == messageId
                }
                409 -> verifyAlreadyInserted(token, account, conversation, messageId)
                else -> false
            }
        } catch (_: Exception) {
            false
        } finally {
            connection.disconnect()
        }
    }

    private fun verifyAlreadyInserted(
        token: String, account: String, conversation: String, id: String
    ): Boolean {
        // An interrupted request may have reached the server. Query the
        // same ID and authenticated sender rather than posting twice.
        val uri = Uri.parse("$NEON_DATA_API/chat_messages").buildUpon()
            .appendQueryParameter("select", "id")
            .appendQueryParameter("id", "eq.$id")
            .appendQueryParameter("sender_id", "eq.$account")
            .appendQueryParameter("conversation_id", "eq.$conversation")
            .appendQueryParameter("limit", "1")
            .build()
        val connection = (URL(uri.toString()).openConnection() as HttpsURLConnection)
        return try {
            connection.connectTimeout = 2_000
            connection.readTimeout = 2_000
            connection.instanceFollowRedirects = false
            connection.requestMethod = "GET"
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
            if (connection.responseCode != 200) return false
            val rows = JSONArray(
                connection.inputStream.bufferedReader().use { it.readText().take(2000) }
            )
            rows.length() == 1 && rows.optJSONObject(0)?.optString("id") == id
        } catch (_: Exception) { false }
        finally { connection.disconnect() }
    }

    private fun requestImmediatePush(token: String, id: String) {
        val connection = (URL("$PUSH_URL/chat-notify").openConnection()
            as HttpsURLConnection)
        try {
            connection.connectTimeout = 1_500
            connection.readTimeout = 2_000
            connection.instanceFollowRedirects = false
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            // This request has no browser Origin. Server authorization comes
            // from Neon, not a CORS origin string.
            connection.outputStream.use {
                it.write(JSONObject().put("messageId", id).toString()
                    .toByteArray(Charsets.UTF_8))
            }
            connection.responseCode // Best-effort; do not claim delivery.
        } catch (_: Exception) {
        } finally {
            connection.disconnect()
        }
    }

    private fun showStatus(context: Context, conversation: String, sent: Boolean) {
        val manager = context.getSystemService(NotificationManager::class.java)
        val open = Intent(context, MainActivity::class.java).apply {
            putExtra("looply_route", "conversa.html?id=$conversation")
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val pending = PendingIntent.getActivity(
            context, conversation.hashCode(), open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val status = NotificationCompat.Builder(context, "looply_messages_v2")
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(if (sent) "Mensagem enviada" else "Mensagem não enviada")
            .setContentText(
                if (sent) "Resposta registrada no Looply."
                else "Abra a conversa para tentar novamente."
            )
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setTimeoutAfter(14_000L)
            .build()
        manager.notify(("reply-status-" + conversation).hashCode(), status)
    }

    companion object {
        const val ACTION_REPLY = "com.looply.app.native.MESSAGE_REPLY"
        const val EXTRA_CONVERSATION = "conversationId"
        const val EXTRA_MESSAGE_ID = "clientReplyId"
        const val EXTRA_CREATED_AT = "issuedAt"
        const val KEY_REPLY = "looply_inline_reply_text"
        const val MAX_REPLY_LENGTH = 4000
        const val MAX_ACTION_AGE_MS = 45L * 60 * 1000
        private const val NEON_DATA_API =
            "https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1"
        private const val PUSH_URL = "https://looply-android-push.s0upoetamoiss.workers.dev"
        private val UUID_PATTERN = Regex(
            "[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"
        )
        private val executor = Executors.newSingleThreadExecutor()
    }
}
