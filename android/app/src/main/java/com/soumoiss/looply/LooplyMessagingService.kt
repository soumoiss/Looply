package com.soumoiss.looply

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class LooplyMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        if (token.length in 25..4096) {
            getSharedPreferences("looply_android_device", MODE_PRIVATE).edit()
                .putString("last_fcm_token", token).apply()
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Android must display a notification immediately: never wait for
        // a WebView, polling loop, image download, or secondary HTTP request.
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) return

        val data = message.data
        val kind = data["kind"] ?: "activity"
        val uuid = Regex("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}")
        fun id(key: String): String? = data[key]?.takeIf { uuid.matches(it) }
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
            "gallery" -> "galeria.html"
            else -> "notificacoes.html"
        }
        val manager = getSystemService(NotificationManager::class.java)
        if (kind == "call" && conversationId != null) {
            showIncomingCall(data, conversationId, manager)
            return
        }
        val intent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            putExtra("looply_route", route)
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val pending = PendingIntent.getActivity(this, route.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val channelId = "looply_activity"
        if (Build.VERSION.SDK_INT >= 26)
            manager.createNotificationChannel(NotificationChannel(channelId,
                "Atividade Looply", NotificationManager.IMPORTANCE_DEFAULT))
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(data["title"]?.take(70) ?: "Looply")
            .setContentText(data["body"]?.take(180) ?: "Nova atividade")
            .setContentIntent(pending).setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT).build()
        manager.notify((message.messageId ?: (System.currentTimeMillis().toString()+route)).hashCode(),
            notification)
    }

    private fun showIncomingCall(data: Map<String,String>, conversationId: String,
                                 manager: NotificationManager) {
        val name = (data["callerName"] ?: "Contato").trim().take(64).ifBlank { "Contato" }
        val mode = if (data["callMode"] == "video") "video" else "audio"
        val title = if (mode == "video") "Chamada de vídeo" else "Chamada de voz"
        // Prevent an exported launcher intent from forging a native accept
        // or decline for a conversation that did not actually ring.
        getSharedPreferences("looply_android_device", MODE_PRIVATE).edit()
            .putString("pending_incoming_call",conversationId)
            .putLong("pending_incoming_call_at",System.currentTimeMillis()).apply()
        val notificationId = conversationId.hashCode()
        val channelId = "looply_calls_v2"
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(channelId,"Chamadas recebidas",
                NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Chamadas de voz e vídeo recebidas no Looply"
                enableVibration(true)
                setSound(android.provider.Settings.System.DEFAULT_RINGTONE_URI,
                    android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build())
            }
            manager.createNotificationChannel(channel)
        }
        fun actionIntent(action: String): PendingIntent {
            val intent = Intent(this, MainActivity::class.java).apply {
                this.action = "com.looply.app.CALL_" + action.uppercase()
                putExtra("looply_route",
                    "conversa.html?id=$conversationId&nativeCallAction=$action")
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            return PendingIntent.getActivity(this,
                (conversationId + action).hashCode(),intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val answer = actionIntent("accept")
        val decline = actionIntent("decline")
        val fullScreen = PendingIntent.getActivity(this,
            (conversationId + "full").hashCode(),
            Intent(this, IncomingCallActivity::class.java).apply {
                putExtra("conversationId",conversationId)
                putExtra("callerName",name)
                putExtra("callMode",mode)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            },PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val person = Person.Builder().setName(name).setImportant(true).build()
        val builder = NotificationCompat.Builder(this,channelId)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(name)
            .setContentText(name + " está ligando por " +
                if (mode == "video") "vídeo" else "voz")
            .setContentIntent(fullScreen)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setTimeoutAfter(35000L)
            .setFullScreenIntent(fullScreen,true)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(person,decline,answer))
        manager.notify(notificationId,builder.build())
    }
}
