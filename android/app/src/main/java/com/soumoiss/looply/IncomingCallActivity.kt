package com.soumoiss.looply

import android.app.Activity
import android.app.NotificationManager
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * A native incoming-call surface displayed by Android only when the OS
 * permits a full-screen intent. Otherwise CallStyle is shown as a heads-up.
 * The user always chooses whether to answer or decline; microphone/camera
 * access is only requested after foreground WebRTC call handoff.
 */
class IncomingCallActivity : Activity() {
    private val uuid=Regex("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        val conversation=intent.getStringExtra("conversationId").orEmpty()
        if(!uuid.matches(conversation)){finish();return}
        val name=intent.getStringExtra("callerName")?.trim()?.take(64)
            ?.ifBlank { "Contato" } ?: "Contato"
        val isVideo=intent.getStringExtra("callMode")=="video"
        val container=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL
            gravity=Gravity.CENTER
            setPadding(36,60,36,60)
            setBackgroundColor(Color.rgb(24,16,38))
        }
        fun label(text:String,size:Float)=TextView(this).apply {
            this.text=text
            textSize=size
            setTextColor(Color.WHITE)
            gravity=Gravity.CENTER
            setPadding(0,15,0,15)
        }
        container.addView(label("Looply · Chamada recebida",18f))
        container.addView(label(name,30f))
        container.addView(label(if(isVideo)"Chamada de vídeo" else "Chamada de voz",19f))
        fun button(title:String, action:String)=Button(this).apply {
            text=title
            isAllCaps=false
            textSize=18f
            setOnClickListener { handoff(conversation,action) }
        }
        container.addView(button("Atender", "accept"))
        container.addView(button("Recusar", "decline"))
        setContentView(container)
    }
    private fun handoff(conversation:String,action:String){
        getSystemService(NotificationManager::class.java).cancel(conversation.hashCode())
        startActivity(Intent(this,MainActivity::class.java).apply {
            this.action="com.looply.app.CALL_"+action.uppercase()
            putExtra("looply_route","conversa.html?id=$conversation&nativeCallAction=$action")
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        })
        finish()
    }
}
