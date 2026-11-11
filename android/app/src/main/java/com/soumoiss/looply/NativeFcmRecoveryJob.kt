package com.soumoiss.looply

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.util.Base64
import org.json.JSONObject
import java.net.URL
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.Future
import javax.net.ssl.HttpsURLConnection

/**
 * Re-registers an FCM token after Firebase rotates it while the WebView is
 * closed. JobScheduler invokes this with a network connection, without
 * starting MainActivity or depending on JavaScript or GitHub Pages.
 *
 * Authorization is always a short-lived Neon JWT retrieved from the Android
 * Keystore. This service never stores refresh tokens, passwords, or service
 * credentials. The Neon RPC verifies the authenticated account and owns the
 * upsert. Delivery timing is still controlled by FCM and Android.
 */
class NativeFcmRecoveryJob : JobService() {
    private val executor = Executors.newSingleThreadExecutor()
    @Volatile private var active: Future<*>? = null

    override fun onStartJob(params: JobParameters): Boolean {
        active = executor.submit {
            val shouldRetry = try {
                registerFreshToken() == RegistrationResult.RETRY
            } catch (_: Exception) {
                true
            }
            jobFinished(params, shouldRetry)
        }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        active?.cancel(true)
        // A network interruption must not permanently discard a rotated token.
        return true
    }

    override fun onDestroy() {
        active?.cancel(true)
        executor.shutdownNow()
        super.onDestroy()
    }

    private enum class RegistrationResult { DONE, RETRY }

    private fun registerFreshToken(): RegistrationResult {
        val session = NativeCallSessionStore.read(applicationContext)
            ?: return RegistrationResult.DONE
        val preferences = getSharedPreferences(DEVICE_PREFS, Context.MODE_PRIVATE)
        val token = preferences.getString("last_fcm_token", null)
            ?.takeIf { it.length in 25..4096 }
            ?: return RegistrationResult.DONE
        val deviceId = preferences.getString("device_id", null)
            ?.takeIf { UUID_PATTERN.matches(it) }
            ?: UUID.randomUUID().toString().also {
                preferences.edit().putString("device_id", it).commit()
            }

        // Only a digest is saved as proof of the last successful registration.
        val digest = MessageDigest.getInstance("SHA-256")
            .digest((session.account + ":" + deviceId + ":" + token)
                .toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        if (preferences.getString(REGISTRATION_DIGEST, null) == digest) {
            return RegistrationResult.DONE
        }

        val connection = (URL(
            "https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1" +
                "/rpc/v16_register_android_fcm_token"
        ).openConnection() as HttpsURLConnection)
        return try {
            connection.connectTimeout = 3500
            connection.readTimeout = 4000
            connection.instanceFollowRedirects = false
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("Authorization", "Bearer " + session.accessToken)
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Cache-Control", "no-store")
            val body = JSONObject()
                .put("p_device_id", deviceId)
                .put("p_fcm_token", token)
                .toString().toByteArray(Charsets.UTF_8)
            connection.outputStream.use { it.write(body) }

            when (connection.responseCode) {
                200, 201 -> {
                    val response = connection.inputStream.bufferedReader().use {
                        it.readText().take(100)
                    }
                    if (response.trim() != "true") return RegistrationResult.RETRY

                    // Do not mark an old token/account as registered if Firebase
                    // rotated its token or the user signed out during the POST.
                    val latest = NativeCallSessionStore.read(applicationContext)
                    val currentToken = preferences.getString("last_fcm_token", null)
                    if (latest?.account != session.account ||
                        currentToken != token) {
                        return RegistrationResult.DONE
                    }
                    preferences.edit().putString(REGISTRATION_DIGEST, digest).commit()
                    RegistrationResult.DONE
                }
                401, 403, 400 -> RegistrationResult.DONE
                else -> RegistrationResult.RETRY
            }
        } catch (_: Exception) {
            RegistrationResult.RETRY
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        const val JOB_ID = 31601
        private const val DEVICE_PREFS = "looply_android_device"
        private const val REGISTRATION_DIGEST = "native_fcm_registered_digest"
        private val UUID_PATTERN = Regex(
            "[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"
        )

        fun enqueue(context: Context) {
            // There is nothing to register until a token exists. A later
            // Firebase callback or trusted login bridge re-enqueues the job.
            val preferences = context.getSharedPreferences(
                DEVICE_PREFS, Context.MODE_PRIVATE
            )
            if (preferences.getString("last_fcm_token", null).isNullOrEmpty()) return
            val scheduler = context.getSystemService(JobScheduler::class.java)
            val job = JobInfo.Builder(
                JOB_ID,
                ComponentName(context, NativeFcmRecoveryJob::class.java)
            )
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setBackoffCriteria(30_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                .build()
            runCatching { scheduler.schedule(job) }
        }

        fun clearOnLogout(context: Context) {
            context.getSystemService(JobScheduler::class.java).cancel(JOB_ID)
            context.getSharedPreferences(DEVICE_PREFS, Context.MODE_PRIVATE)
                .edit().remove(REGISTRATION_DIGEST).apply()
        }
    }
}
