package com.soumoiss.looply

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

/**
 * True Android offline message reader: SQLite + Android views, no network,
 * WebView, JavaScript, call signaling or fake sending state.
 */
class NativeChatActivity : Activity() {
    private val ink = Color.rgb(39, 29, 53)
    private val violet = Color.rgb(115, 75, 193)
    private val page = Color.rgb(248, 246, 251)
    private val muted = Color.rgb(115, 107, 126)
    private lateinit var root: LinearLayout
    private lateinit var headerTitle: TextView
    private var currentConversation: NativeChatStore.Conversation? = null
    private lateinit var saved: List<NativeChatStore.Conversation>

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun shape(color: Int, radius: Int) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radius).toFloat()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = page
        window.navigationBarColor = page
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        saved = NativeChatStore(this).read()
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(page)
        }
        setContentView(root)
        showInbox()
    }

    private fun toolbar(title: String) {
        root.removeAllViews()
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(8), dp(16), dp(10))
            setBackgroundColor(Color.WHITE)
        }
        val back = TextView(this).apply {
            text = "‹"
            textSize = 34f
            gravity = Gravity.CENTER
            setTextColor(violet)
            contentDescription = "Voltar"
            setOnClickListener {
                if (currentConversation == null) finish() else showInbox()
            }
        }
        bar.addView(back, LinearLayout.LayoutParams(dp(46), dp(52)))
        val labels = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        headerTitle = TextView(this).apply {
            text = title
            textSize = 20f
            setTypeface(null, Typeface.BOLD)
            setTextColor(ink)
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        labels.addView(headerTitle)
        labels.addView(TextView(this).apply {
            text = "Salvo no aparelho · somente leitura"
            textSize = 11f
            setTextColor(violet)
        })
        bar.addView(labels, LinearLayout.LayoutParams(0, -2, 1f))
        root.addView(bar)
    }

    private fun label(
        text: String, size: Float, color: Int,
        bold: Boolean = false
    ) = TextView(this).apply {
        this.text = text
        textSize = size
        setTextColor(color)
        if (bold) setTypeface(null, Typeface.BOLD)
    }

    private fun emptyState(title: String, caption: String) {
        val center = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(24), dp(28), dp(24))
        }
        center.addView(label(title, 19f, ink, true).apply { gravity = Gravity.CENTER })
        center.addView(label(caption, 14f, muted).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, 0)
        })
        root.addView(center, LinearLayout.LayoutParams(-1, 0, 1f))
    }

    private fun showInbox() {
        currentConversation = null
        toolbar("Mensagens")
        if (saved.isEmpty()) {
            emptyState("Nenhuma conversa salva",
                "Abra uma conversa conectado à internet para consultar suas mensagens recentes offline.")
            return
        }
        root.addView(label("${saved.size} conversas armazenadas", 12f, muted)
            .apply { setPadding(dp(20), dp(12), dp(12), dp(6)) })
        val list = RecyclerView(this).apply {
            layoutManager = LinearLayoutManager(this@NativeChatActivity)
            adapter = InboxAdapter(saved) { showThread(it) }
            setPadding(dp(12), dp(4), dp(12), dp(14))
            clipToPadding = false
        }
        root.addView(list, LinearLayout.LayoutParams(-1, 0, 1f))
    }

    private inner class InboxAdapter(
        private val conversations: List<NativeChatStore.Conversation>,
        private val open: (NativeChatStore.Conversation) -> Unit
    ) : RecyclerView.Adapter<InboxAdapter.Holder>() {
        inner class Holder(
            view: View, val title: TextView, val subtitle: TextView
        ) : RecyclerView.ViewHolder(view)
        override fun getItemCount() = conversations.size
        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
            val wrap = FrameLayout(this@NativeChatActivity).apply {
                setPadding(dp(6), dp(4), dp(6), dp(4))
            }
            val row = LinearLayout(this@NativeChatActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(18), dp(16), dp(18), dp(16))
                background = shape(Color.WHITE, 18)
            }
            wrap.addView(row, FrameLayout.LayoutParams(-1, -2))
            val name = label("", 16f, ink, true)
            row.addView(name)
            val preview = label("", 13f, muted).apply {
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
                setPadding(0, dp(5), 0, 0)
            }
            row.addView(preview)
            return Holder(wrap, name, preview)
        }
        override fun onBindViewHolder(holder: Holder, position: Int) {
            val conversation = conversations[position]
            holder.title.text = conversation.title
            holder.subtitle.text = conversation.messages.lastOrNull()?.body.orEmpty()
            holder.itemView.setOnClickListener { open(conversation) }
            holder.itemView.contentDescription =
                "Abrir ${conversation.title} offline"
        }
    }

    private fun showThread(conversation: NativeChatStore.Conversation) {
        currentConversation = conversation
        toolbar(conversation.title)
        val list = RecyclerView(this).apply {
            layoutManager = LinearLayoutManager(this@NativeChatActivity).apply {
                stackFromEnd = true
            }
            adapter = MessageAdapter(conversation.messages)
            setPadding(dp(12), dp(14), dp(12), dp(20))
            clipToPadding = false
        }
        root.addView(list, LinearLayout.LayoutParams(-1, 0, 1f))
    }

    private inner class MessageAdapter(
        private val messages: List<NativeChatStore.Item>
    ) : RecyclerView.Adapter<MessageAdapter.Holder>() {
        inner class Holder(
            view: View, val text: TextView, val author: TextView,
            val timestamp: TextView, val card: LinearLayout
        ) : RecyclerView.ViewHolder(view)

        override fun getItemCount() = messages.size

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
            val wrap = FrameLayout(this@NativeChatActivity).apply {
                setPadding(dp(5), dp(4), dp(5), dp(4))
            }
            val card = LinearLayout(this@NativeChatActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(14), dp(10), dp(14), dp(9))
            }
            wrap.addView(card, FrameLayout.LayoutParams(
                (resources.displayMetrics.widthPixels * .86f).toInt(), -2))
            val author = label("", 11f, violet, true)
            val body = label("", 15f, ink).apply {
                setPadding(0, dp(4), 0, dp(4))
                setTextIsSelectable(true)
            }
            val time = label("", 10f, muted).apply { gravity = Gravity.END }
            card.addView(author)
            card.addView(body)
            card.addView(time)
            return Holder(wrap, body, author, time, card)
        }

        override fun onBindViewHolder(holder: Holder, position: Int) {
            val message = messages[position]
            holder.author.text = if (message.mine) "Você" else
                message.author.ifBlank { "Contato" }
            holder.text.text = message.body
            holder.timestamp.text = message.createdAt.take(16).replace("T", " ")
            holder.card.background = shape(
                if (message.mine) Color.rgb(230, 221, 250) else Color.WHITE, 16
            )
            (holder.card.layoutParams as? FrameLayout.LayoutParams)?.gravity =
                if (message.mine) Gravity.END else Gravity.START
            holder.card.requestLayout()
        }
    }

    @Deprecated("Use the platform predictive back callback when enabled.")
    override fun onBackPressed() {
        if (currentConversation != null) showInbox() else super.onBackPressed()
    }
}
