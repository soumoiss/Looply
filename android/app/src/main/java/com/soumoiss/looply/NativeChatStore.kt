package com.soumoiss.looply

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Encrypted, read-only offline message snapshots. Database rows only expose
 * opaque conversation IDs; names, sender names and bodies are AES-256-GCM
 * encrypted with an AndroidKeyStore key bound to account + conversation AAD.
 *
 * No attachments, OAuth tokens or media URLs are cached here.
 * The backend remains authoritative after reconnecting.
 */
internal class NativeChatStore(context: Context) :
    SQLiteOpenHelper(context.applicationContext, "looply_offline_chats.db", null, 1) {
    private val app = context.applicationContext
    private val prefs = app.getSharedPreferences("looply_offline_chats", Context.MODE_PRIVATE)

    data class Item(
        val id: String, val author: String, val body: String,
        val createdAt: String, val mine: Boolean
    )
    data class Conversation(
        val id: String, val title: String,
        val messages: List<Item>, val cachedAt: Long
    )

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE offline_chats(
                account_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                snapshot BLOB NOT NULL,
                cached_at INTEGER NOT NULL,
                PRIMARY KEY(account_id, conversation_id)
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX offline_chats_age ON offline_chats(cached_at)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Future schema changes must be additive and preserve users' local data.
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            .apply {
                init(KeyGenParameterSpec.Builder(
                    KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256).setRandomizedEncryptionRequired(true).build())
            }.generateKey()
    }

    private fun aad(account: String, conversation: String) =
        "$account:$conversation".toByteArray(Charsets.UTF_8)

    private fun encrypt(account: String, conversation: String, value: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(aad(account, conversation))
        return cipher.iv + cipher.doFinal(value)
    }

    private fun decrypt(account: String, conversation: String, blob: ByteArray): ByteArray {
        require(blob.size > 28 && blob.size < MAX_SNAPSHOT_BYTES + 1024)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, blob.copyOfRange(0, 12)))
        cipher.updateAAD(aad(account, conversation))
        return cipher.doFinal(blob.copyOfRange(12, blob.size))
    }

    @Synchronized
    fun save(account: String, conversation: String, title: String, messages: JSONArray): Boolean {
        if (!UUID.matches(account) || !UUID.matches(conversation) || messages.length() > MAX_MESSAGES) return false
        val now = System.currentTimeMillis()
        val cleaned = JSONArray()
        for (i in 0 until messages.length()) {
            val raw = messages.optJSONObject(i) ?: continue
            val id = raw.optString("id")
            if (!UUID.matches(id)) continue
            val body = raw.optString("body").take(2000)
            if (body.isBlank() || body.indexOf('\u0000') >= 0) continue
            cleaned.put(JSONObject()
                .put("id", id)
                .put("author", raw.optString("author").take(80))
                .put("body", body)
                .put("createdAt", raw.optString("createdAt").take(42))
                .put("mine", raw.optBoolean("mine")))
        }
        if (cleaned.length() == 0) return false
        return runCatching {
            val payload = JSONObject().put("title", title.take(100))
                .put("messages", cleaned).toString().toByteArray(Charsets.UTF_8)
            if (payload.size > MAX_SNAPSHOT_BYTES) return false
            val ciphertext = encrypt(account, conversation, payload)
            val db = writableDatabase
            db.beginTransaction()
            try {
                val current = prefs.getString("account", null)
                if (current != null && current != account) {
                    db.delete("offline_chats", null, null)
                }
                db.insertWithOnConflict("offline_chats", null, ContentValues().apply {
                    put("account_id", account)
                    put("conversation_id", conversation)
                    put("snapshot", ciphertext)
                    put("cached_at", now)
                }, SQLiteDatabase.CONFLICT_REPLACE)
                db.delete("offline_chats", "cached_at<?",
                    arrayOf((now - RETENTION_MS).toString()))
                db.execSQL("""
                    DELETE FROM offline_chats WHERE account_id=?
                    AND conversation_id NOT IN (
                      SELECT conversation_id FROM offline_chats
                      WHERE account_id=? ORDER BY cached_at DESC LIMIT $MAX_CONVERSATIONS
                    )
                """.trimIndent(), arrayOf(account, account))
                db.setTransactionSuccessful()
            } finally { db.endTransaction() }
            prefs.edit().putString("account", account).commit()
        }.getOrDefault(false)
    }

    @Synchronized
    fun read(): List<Conversation> {
        val account = prefs.getString("account", null)
            ?.takeIf { UUID.matches(it) } ?: return emptyList()
        val now = System.currentTimeMillis()
        writableDatabase.delete("offline_chats", "cached_at<?",
            arrayOf((now - RETENTION_MS).toString()))
        val result = mutableListOf<Conversation>()
        readableDatabase.rawQuery(
            """SELECT conversation_id,snapshot,cached_at FROM offline_chats
                WHERE account_id=? ORDER BY cached_at DESC LIMIT ?""",
            arrayOf(account, MAX_CONVERSATIONS.toString())
        ).use { cursor ->
            while (cursor.moveToNext()) {
                val conversation = cursor.getString(0)
                val snapshot = runCatching {
                    JSONObject(String(decrypt(account, conversation, cursor.getBlob(1)), Charsets.UTF_8))
                }.getOrNull() ?: continue
                val messages = snapshot.optJSONArray("messages") ?: continue
                val items = mutableListOf<Item>()
                for (i in 0 until messages.length()) {
                    val row = messages.optJSONObject(i) ?: continue
                    items.add(Item(row.optString("id"), row.optString("author"),
                        row.optString("body"), row.optString("createdAt"), row.optBoolean("mine")))
                }
                if (items.isNotEmpty()) {
                    result.add(Conversation(conversation,
                        snapshot.optString("title").ifBlank { "Conversa" },
                        items, cursor.getLong(2)))
                }
            }
        }
        return result
    }

    @Synchronized
    fun hasCachedMessages() = read().isNotEmpty()

    @Synchronized
    fun clearAll() {
        writableDatabase.delete("offline_chats", null, null)
        prefs.edit().remove("account").commit()
    }

    companion object {
        private val UUID = Regex("[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}")
        private const val KEY_ALIAS = "looply_offline_chat_aes_v1"
        private const val MAX_MESSAGES = 60
        private const val MAX_CONVERSATIONS = 20
        private const val MAX_SNAPSHOT_BYTES = 96 * 1024
        private const val RETENTION_MS = 30L * 24 * 60 * 60 * 1000
    }
}
