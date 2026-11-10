package com.soumoiss.looply

import android.app.Activity
import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.util.concurrent.Executors

/**
 * A genuine native, network-independent Android feed reader. No WebView,
 * JavaScript, GitHub Pages document, or browser HTTP cache is used here.
 * The feed is deliberately read-only until native authorization, editing
 * and synchronization are available.
 */
class NativeFeedActivity : Activity() {
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private val violet = Color.rgb(95, 62, 167)
    private val pageBackground = Color.rgb(247, 244, 250)
    private val ink = Color.rgb(34, 28, 45)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = pageBackground
        window.navigationBarColor = pageBackground
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(pageBackground)
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(12), dp(16), dp(12))
            setBackgroundColor(Color.WHITE)
        }
        val back = TextView(this).apply {
            text = "‹"
            textSize = 34f
            gravity = Gravity.CENTER
            setTextColor(violet)
            setOnClickListener { finish() }
            contentDescription = "Voltar ao Looply"
        }
        header.addView(back, LinearLayout.LayoutParams(dp(42), dp(52)))

        val titleBlock = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        titleBlock.addView(TextView(this).apply {
            text = "Looply"
            textSize = 26f
            setTypeface(null, Typeface.BOLD)
            setTextColor(ink)
        })
        titleBlock.addView(TextView(this).apply {
            text = "Feed offline"
            textSize = 12f
            setTextColor(violet)
        })
        header.addView(titleBlock, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        root.addView(header)

        val rows = NativeFeedStore(this).read()
        if (rows.isEmpty()) {
            val empty = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(dp(26), dp(30), dp(26), dp(30))
            }
            empty.addView(TextView(this).apply {
                text = "Nenhuma publicação salva"
                setTypeface(null, Typeface.BOLD)
                textSize = 20f
                gravity = Gravity.CENTER
                setTextColor(ink)
            })
            empty.addView(TextView(this).apply {
                text = "Abra o Feed conectado à internet para preparar as publicações públicas para consulta offline."
                textSize = 14f
                gravity = Gravity.CENTER
                setTextColor(Color.DKGRAY)
                setPadding(0, dp(10), 0, dp(18))
            })
            empty.addView(Button(this).apply {
                text = "Voltar"
                isAllCaps = false
                setOnClickListener { finish() }
            })
            root.addView(empty, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        } else {
            val info = TextView(this).apply {
                text = "${rows.size} publicações salvas · Atualização exige internet"
                textSize = 12f
                setTextColor(Color.DKGRAY)
                setPadding(dp(20), dp(14), dp(16), dp(6))
            }
            root.addView(info)
            val list = RecyclerView(this).apply {
                layoutManager = LinearLayoutManager(this@NativeFeedActivity)
                setHasFixedSize(false)
                adapter = FeedAdapter(this@NativeFeedActivity, rows)
                clipToPadding = false
                setPadding(dp(12), dp(4), dp(12), dp(12))
            }
            root.addView(list, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        }
        setContentView(root)
    }

    private class FeedAdapter(
        private val ctx: Context,
        private val rows: List<NativeFeedStore.Item>
    ) : RecyclerView.Adapter<FeedAdapter.Holder>() {
        private val ui = Handler(Looper.getMainLooper())
        private val imagePool = Executors.newFixedThreadPool(2)
        private fun dp(v: Int) = (v * ctx.resources.displayMetrics.density).toInt()

        class Holder(
            root: View, val author: TextView, val date: TextView,
            val body: TextView, val image: ImageView
        ) : RecyclerView.ViewHolder(root)

        override fun getItemCount() = rows.size

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
            val outer = FrameLayout(ctx).apply {
                setPadding(dp(5), dp(6), dp(5), dp(6))
            }
            val card = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(15), dp(15), dp(15), dp(14))
                background = GradientDrawable().apply {
                    setColor(Color.WHITE)
                    cornerRadius = dp(20).toFloat()
                }
                elevation = dp(2).toFloat()
            }
            outer.addView(card, FrameLayout.LayoutParams(-1, -2))
            val author = TextView(ctx).apply {
                textSize = 15f
                setTextColor(Color.rgb(46, 37, 60))
                setTypeface(null, Typeface.BOLD)
            }
            card.addView(author)
            val date = TextView(ctx).apply {
                textSize = 11f
                setTextColor(Color.GRAY)
                setPadding(0, dp(3), 0, dp(8))
            }
            card.addView(date)
            val body = TextView(ctx).apply {
                textSize = 15f
                setTextColor(Color.rgb(55, 48, 67))
                setLineSpacing(dp(3).toFloat(), 1f)
            }
            card.addView(body)
            val image = ImageView(ctx).apply {
                adjustViewBounds = true
                scaleType = ImageView.ScaleType.FIT_CENTER
                visibility = View.GONE
                contentDescription = "Imagem da publicação armazenada offline"
                setPadding(0, dp(12), 0, 0)
            }
            card.addView(image, LinearLayout.LayoutParams(-1, -2))
            return Holder(outer, author, date, body, image)
        }

        override fun onBindViewHolder(holder: Holder, position: Int) {
            val item = rows[position]
            holder.author.text = item.author.ifBlank { "Looply" }
            holder.date.text = item.createdAt.take(16).replace("T", " ")
            holder.body.text = item.text
            holder.body.visibility = if (item.text.isBlank()) View.GONE else View.VISIBLE
            val path = item.image
            holder.image.setImageDrawable(null)
            holder.image.tag = path
            holder.image.visibility = View.GONE
            if (path == null) return
            imagePool.execute {
                val options = BitmapFactory.Options().apply {
                    inJustDecodeBounds = true
                    BitmapFactory.decodeFile(path, this)
                    inSampleSize = maxOf(1, maxOf(outWidth, outHeight) / 1000)
                    inJustDecodeBounds = false
                }
                val bitmap = runCatching { BitmapFactory.decodeFile(path, options) }.getOrNull()
                ui.post {
                    if (holder.image.tag == path && bitmap != null) {
                        holder.image.setImageBitmap(bitmap)
                        holder.image.visibility = View.VISIBLE
                    } else bitmap?.recycle()
                }
            }
        }
    }
}
