package com.soumoiss.looply

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class LooplyMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        // Send this token to a secret-backed backend endpoint after the authenticated
        // Looply session is available; never persist it in the public web bundle.
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val kind = data["kind"] ?: "activity"
        // Route only validated record identifiers to pages that already accept them.
        val identifier = Regex("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}")
        fun id(name: String): String? = data[name]?.takeIf { identifier.matches(it) }
        val conversationId = id("conversationId")
        val resourceId = id("resourceId")
        val route = when (kind) {
            "call", "message", "voice", "chat" ->
                conversationId?.let { "conversa.html?id=$it" } ?: "chat.html"
            "letter", "carta" ->
                (id("letterId") ?: resourceId)?.let { "cartas.html?letterId=$it" } ?: "cartas.html"
            "music", "dedication", "dedicatoria" ->
                (id("dedicationId") ?: resourceId)?.let { "musicas.html#dedication-$it" } ?: "musicas.html"
            "story", "mention" ->
                (id("storyId") ?: resourceId)?.let { "home.html?storyId=$it#stories" } ?: "home.html#stories"
            "post", "reel", "like", "comment" ->
                resourceId?.let { "home.html#post-$it" } ?: "home.html"
            else -> "notificacoes.html"
        }
        val intent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            putExtra("looply_route", route)
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val pending = PendingIntent.getActivity(this, route.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val channelId = if (kind == "call") "looply_calls" else "looply_activity"
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(channelId, if (kind == "call") "Chamadas Looply" else "Atividade Looply", if (kind == "call") NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT))
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(data["title"] ?: "Looply")
            .setContentText(data["body"] ?: if (kind == "call") "Chamada recebida" else "Nova atividade")
            .setContentIntent(pending).setAutoCancel(true).setPriority(if (kind == "call") NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT).build()
        manager.notify((message.messageId ?: (System.currentTimeMillis().toString() + route)).hashCode(), notification)
    }
}
