package com.soumoiss.looply

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Short-lived Neon access token for native call actions only.
 * Refresh tokens, passwords and service-account credentials are NEVER stored here.
 * The server still authenticates every RPC and validates conversation membership.
 */
internal object NativeCallSessionStore {
    private const val ALIAS = "looply_native_call_access_v1"
    private const val PREFS = "looply_native_call_private"
    private const val KEY = "encrypted_session"
    private const val MAX_SESSION_MS = 70L * 60 * 1000
    private val accountPattern = Regex("[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}")
    private val tokenPattern = Regex("[A-Za-z0-9._~+/-]{25,8192}")

    data class Session(val account: String, val accessToken: String)

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = store.getKey(ALIAS, null) as? SecretKey
        if (existing != null) return existing
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(
                ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build())
        }.generateKey()
    }

    @Synchronized
    fun save(context: Context, account: String, token: String, expiresAtMs: Long): Boolean {
        val now = System.currentTimeMillis()
        if (!accountPattern.matches(account) || !tokenPattern.matches(token) ||
            expiresAtMs <= now + 5_000 || expiresAtMs > now + MAX_SESSION_MS) return false
        return runCatching {
            val payload = JSONObject()
                .put("account", account)
                .put("token", token)
                .put("expiresAt", expiresAtMs).toString()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(Cipher.ENCRYPT_MODE, key())
            }
            val data = cipher.iv + cipher.doFinal(payload.toByteArray(Charsets.UTF_8))
            prefs(context).edit().putString(
                KEY, Base64.encodeToString(data, Base64.NO_WRAP)
            ).commit()
        }.getOrDefault(false)
    }

    @Synchronized
    fun read(context: Context): Session? {
        val encrypted = prefs(context).getString(KEY, null) ?: return null
        return try {
            val bytes = Base64.decode(encrypted, Base64.DEFAULT)
            if (bytes.size <= 12 + 16) { clear(context); return null }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            }
            val json = JSONObject(String(
                cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8
            ))
            val account = json.optString("account")
            val token = json.optString("token")
            val expiry = json.optLong("expiresAt", 0)
            if (!accountPattern.matches(account) || !tokenPattern.matches(token) ||
                expiry <= System.currentTimeMillis() + 5_000 ||
                expiry > System.currentTimeMillis() + MAX_SESSION_MS) {
                clear(context)
                null
            } else Session(account, token)
        } catch (_: Exception) {
            clear(context)
            null
        }
    }

    @Synchronized
    fun clear(context: Context) {
        prefs(context).edit().remove(KEY).commit()
    }
}
