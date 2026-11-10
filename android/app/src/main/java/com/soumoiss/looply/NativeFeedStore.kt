package com.soumoiss.looply

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * Account-scoped public-feed snapshot. This is a real Android SQLite cache,
 * not a WebView HTTP cache, and it never stores bearer tokens or signed URLs.
 * The remote database remains authoritative for deletion and visibility.
 */
internal class NativeFeedStore(private val app: Context) :
    SQLiteOpenHelper(app.applicationContext, "looply_offline_feed.db", null, 1) {

    data class Item(
        val id: String, val author: String, val text: String,
        val createdAt: String, val image: String?
    )

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE feed_posts(
              account_id TEXT NOT NULL,
              post_id TEXT NOT NULL,
              author TEXT NOT NULL,
              body TEXT NOT NULL,
              created_at TEXT NOT NULL,
              image_key TEXT,
              cached_at INTEGER NOT NULL,
              PRIMARY KEY(account_id, post_id)
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX feed_posts_account_time ON feed_posts(account_id, created_at DESC)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Additive migrations only. Never drop a user's offline data silently.
    }

    private val prefs get() = app.getSharedPreferences("looply_native_feed", Context.MODE_PRIVATE)
    private val directory get() = File(app.filesDir, "offline_feed_images").also { it.mkdirs() }

    fun activeAccount(): String? = prefs.getString("account", null)
        ?.takeIf { UUID.matches(it) }

    fun hasCachedPosts(): Boolean {
        pruneExpired()
        val account = activeAccount() ?: return false
        readableDatabase.rawQuery(
            "SELECT 1 FROM feed_posts WHERE account_id=? AND cached_at>? LIMIT 1",
            arrayOf(account, (System.currentTimeMillis() - RETENTION_MS).toString())
        ).use { return it.moveToFirst() }
    }

    /**
     * Only public posts are persisted. Access-restricted, deleted and expired
     * material must be resolved online rather than assumed safe offline.
     */
    fun replacePublicSnapshot(account: String, posts: JSONArray) {
        if (!UUID.matches(account)) return
        val now = System.currentTimeMillis()
        val db = writableDatabase
        val images = mutableListOf<Pair<String, String>>()
        db.beginTransaction()
        try {
            val ids = mutableSetOf<String>()
            for (i in 0 until minOf(posts.length(), MAX_POSTS)) {
                val post = posts.optJSONObject(i) ?: continue
                val id = post.optString("id")
                if (!UUID.matches(id) || post.optString("visibility") != "public") continue
                ids += id
                val imageUrl = post.optString("imageUrl")
                val mediaPath = post.optString("mediaPath").take(160)
                val imageKey = if (mediaPath.isNotBlank() && approvedImageUrl(imageUrl)) {
                    sha256("$account/$id/$mediaPath") + ".img"
                } else null
                db.insertWithOnConflict(
                    "feed_posts", null, ContentValues().apply {
                        put("account_id", account)
                        put("post_id", id)
                        put("author", post.optString("author").take(100))
                        put("body", post.optString("body").take(3000))
                        put("created_at", post.optString("createdAt").take(40))
                        put("image_key", imageKey)
                        put("cached_at", now)
                    }, SQLiteDatabase.CONFLICT_REPLACE
                )
                if (imageKey != null) images += imageKey to imageUrl
            }
            // Snapshot is authoritative only for the bounded recent public feed.
            db.delete("feed_posts", "account_id=? AND cached_at<?", arrayOf(account, now.toString()))
            db.delete(
                "feed_posts", "cached_at<?",
                arrayOf((now - RETENTION_MS).toString())
            )
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        prefs.edit().putString("account", account).apply()
        cleanOrphans()
        // Cache images asynchronously. No HTTP request on the UI thread.
        for ((key, url) in images.take(MAX_IMAGE_DOWNLOADS)) {
            if (!File(directory, key).isFile) {
                imagePool.execute {
                    if (activeAccount() == account) downloadImage(key, url, account)
                }
            }
        }
    }

    fun read(): List<Item> {
        pruneExpired()
        val account = activeAccount() ?: return emptyList()
        val out = mutableListOf<Item>()
        readableDatabase.rawQuery(
            """SELECT post_id,author,body,created_at,image_key FROM feed_posts
               WHERE account_id=? AND cached_at>? ORDER BY created_at DESC LIMIT ?""",
            arrayOf(account, (System.currentTimeMillis() - RETENTION_MS).toString(), MAX_POSTS.toString())
        ).use { cursor ->
            while (cursor.moveToNext()) {
                val imageKey = cursor.getString(4)
                val file = imageKey?.let { File(directory, it) }
                out += Item(cursor.getString(0), cursor.getString(1),
                    cursor.getString(2), cursor.getString(3),
                    file?.takeIf { it.isFile }?.absolutePath)
            }
        }
        return out
    }

    fun pruneExpired() {
        writableDatabase.delete(
            "feed_posts", "cached_at<?",
            arrayOf((System.currentTimeMillis() - RETENTION_MS).toString())
        )
        cleanOrphans()
    }

    fun clearAllOnLogout() {
        writableDatabase.delete("feed_posts", null, null)
        prefs.edit().remove("account").apply()
        directory.listFiles()?.forEach { it.delete() }
    }

    private fun cleanOrphans() {
        val live = mutableSetOf<String>()
        readableDatabase.rawQuery(
            "SELECT image_key FROM feed_posts WHERE image_key IS NOT NULL", null
        ).use { cursor -> while (cursor.moveToNext()) live += cursor.getString(0) }
        directory.listFiles()?.forEach {
            if (it.name !in live || it.lastModified() < System.currentTimeMillis() - RETENTION_MS) {
                it.delete()
            }
        }
    }

    private fun downloadImage(key: String, rawUrl: String, account: String) {
        if (!approvedImageUrl(rawUrl)) return
        val file = File(directory, key)
        val temp = File(directory, "$key.partial")
        try {
            val connection = (URL(rawUrl).openConnection() as HttpURLConnection).apply {
                connectTimeout = 6000
                readTimeout = 7000
                instanceFollowRedirects = false
                requestMethod = "GET"
            }
            try {
                val length = connection.contentLengthLong
                if (connection.responseCode != 200 || length > MAX_IMAGE_BYTES ||
                    !connection.contentType.orEmpty().startsWith("image/")) return
                var count = 0L
                connection.inputStream.use { input ->
                    temp.outputStream().use { output ->
                        val buffer = ByteArray(8192)
                        while (true) {
                            val n = input.read(buffer)
                            if (n < 0) break
                            count += n
                            if (count > MAX_IMAGE_BYTES) return
                            output.write(buffer, 0, n)
                        }
                    }
                }
                if (count > 0 && activeAccount() == account && !file.exists()) temp.renameTo(file)
            } finally { connection.disconnect() }
        } catch (_: Exception) {
            // Failure only omits the thumbnail; never break the feed.
        } finally { temp.delete() }
    }

    companion object {
        private const val MAX_POSTS = 40
        private const val MAX_IMAGE_DOWNLOADS = 24
        private const val MAX_IMAGE_BYTES = 2L * 1024 * 1024
        private const val RETENTION_MS = 7L * 24 * 60 * 60 * 1000
        private val UUID = Regex("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")
        private val imagePool = Executors.newFixedThreadPool(2)
        private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        private fun approvedImageUrl(rawUrl: String): Boolean = try {
            val url = URL(rawUrl)
            val host = url.host.lowercase()
            url.protocol == "https" && url.userInfo == null && (
                host.endsWith(".neon.tech") ||
                host.endsWith(".r2.dev") ||
                host.endsWith(".r2.cloudflarestorage.com")
            )
        } catch (_: Exception) { false }
    }
}
