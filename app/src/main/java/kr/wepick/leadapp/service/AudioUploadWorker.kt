package kr.wepick.leadapp.service

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kr.wepick.leadapp.BuildConfig
import kr.wepick.leadapp.LeadApp
import kr.wepick.leadapp.ui.screens.KEY_BACKEND_URL
import kr.wepick.leadapp.util.appPreferences
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * 사용자가 통화 상세에서 "녹취 업로드" 버튼을 눌렀을 때 발화. 녹음 파일을 Vercel Blob 에
 * 직접 PUT 한다 (Vercel function 의 4.5MB body limit 우회).
 *
 * 흐름:
 *   1) `POST {backendUrl}/api/audio/upload-token` (X-App-Token + HandleUploadBody) → clientToken
 *   2) `PUT https://vercel.com/api/blob/?pathname={pathname}` with audio bytes (Bearer clientToken)
 *
 * Pathname 규약 (백엔드 ALLOWED_PATH_RE 와 정확히 일치해야 함):
 *   audios/YYYY-MM/{startedAt}_{callId}.{m4a|amr|3gp|mp4|mp3|wav|flac}
 *
 * 같은 (startedAt, callId) 로 재업로드 시 덮어쓰기 (멱등) — 백엔드 onBeforeGenerateToken 이
 * `addRandomSuffix=false`, `allowOverwrite=true` 로 token 발급.
 */
class AudioUploadWorker(
    ctx: Context,
    params: WorkerParameters,
) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val callId = inputData.getLong(KEY_CALL_ID, -1L)
        if (callId < 0) {
            Log.w(TAG, "callId 미지정 — 스킵")
            return Result.success()
        }
        val repo = LeadApp.instance.leadRepo
        val call = repo.getCall(callId) ?: run {
            Log.w(TAG, "callId=$callId 조회 실패 — 스킵")
            return Result.success()
        }
        if (call.callType != "RECORDED") {
            // 비-RECORDED 는 녹음 파일이 없으므로 업로드 대상 아님.
            repo.markAudioUploadFailed(callId, "녹음 파일이 없는 통화 (${call.callType})")
            return Result.success()
        }
        // UI 가 즉시 "업로드 중" 표시할 수 있도록 worker 진입 시점에 마킹.
        repo.markAudioUploading(callId)

        val prefs = applicationContext.appPreferences.data.first()
        val backendUrl = kr.wepick.leadapp.util.effectiveBackendUrl(prefs[KEY_BACKEND_URL])

        val http = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            // 오디오 ~수십 MB 가능 — 업로드 타임아웃 넉넉하게.
            .writeTimeout(10, TimeUnit.MINUTES)
            .callTimeout(15, TimeUnit.MINUTES)
            .build()

        return try {
            withContext(Dispatchers.IO) {
                val fileUri = Uri.parse(call.fileUri)
                val bytes = applicationContext.contentResolver
                    .openInputStream(fileUri)?.use { it.readBytes() }
                    ?: throw IOException("파일 읽기 실패: ${call.fileUri}")

                val ext = extractExtension(call.fileUri)
                val ym = SimpleDateFormat("yyyy-MM", Locale.US).format(Date(call.startedAt))
                val pathname = "audios/$ym/${call.startedAt}_${call.id}.$ext"
                val contentType = contentTypeFor(ext)

                val clientToken = requestClientToken(http, backendUrl, pathname)
                putToBlob(http, clientToken, pathname, bytes, contentType)
            }
            repo.markAudioUploadOk(callId)
            Log.i(TAG, "callId=$callId 오디오 업로드 성공")
            Result.success()
        } catch (e: Exception) {
            val msg = e.message?.take(500) ?: "unknown"
            repo.markAudioUploadFailed(callId, msg)
            Log.w(TAG, "callId=$callId 오디오 업로드 실패: $msg")
            Result.success()
        }
    }

    /**
     * `/api/audio/upload-token` 에 @vercel/blob 클라이언트 SDK 와 동일한 body 로 POST.
     * 응답에서 clientToken 추출.
     */
    private fun requestClientToken(
        http: OkHttpClient,
        backendUrl: String,
        pathname: String,
    ): String {
        val body = JSONObject()
            .put("type", "blob.generate-client-token")
            .put(
                "payload", JSONObject()
                    .put("pathname", pathname)
                    .put("callbackUrl", "$backendUrl/api/audio/upload-token")
                    .put("clientPayload", JSONObject.NULL)
                    .put("multipart", false)
            )
            .toString()
        val req = Request.Builder()
            .url("$backendUrl/api/audio/upload-token")
            .header("X-App-Token", BuildConfig.APP_TOKEN)
            .header("content-type", "application/json")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) {
                throw IOException("토큰 발급 실패 (${res.code}): ${text.take(200)}")
            }
            val json = JSONObject(text)
            return json.optString("clientToken").ifBlank {
                throw IOException("토큰 응답 비정상: ${text.take(200)}")
            }
        }
    }

    /**
     * Vercel Blob API 직접 PUT. @vercel/blob 클라이언트 SDK 와 동일한 헤더 구조.
     * Bearer 클라이언트 토큰에 `addRandomSuffix=false`, `allowOverwrite=true` 가 박혀있음.
     */
    private fun putToBlob(
        http: OkHttpClient,
        clientToken: String,
        pathname: String,
        bytes: ByteArray,
        contentType: String,
    ) {
        val pathParam = URLEncoder.encode(pathname, "UTF-8")
        val requestId = "${UUID.randomUUID()}:${System.currentTimeMillis()}"
        val req = Request.Builder()
            .url("$BLOB_API_URL/?pathname=$pathParam")
            .header("Authorization", "Bearer $clientToken")
            .header("x-api-version", BLOB_API_VERSION)
            .header("x-api-blob-request-id", requestId)
            .header("x-api-blob-request-attempt", "0")
            .header("x-vercel-blob-access", "public")
            .header("x-content-type", contentType)
            .put(bytes.toRequestBody(contentType.toMediaType()))
            .build()
        http.newCall(req).execute().use { res ->
            if (!res.isSuccessful) {
                throw IOException("Blob PUT 실패 (${res.code}): ${res.body?.string()?.take(200)}")
            }
        }
    }

    private fun extractExtension(uri: String): String {
        val seg = Uri.parse(uri).lastPathSegment.orEmpty()
        val raw = seg.substringAfterLast('.', missingDelimiterValue = "").lowercase()
        return when (raw) {
            "m4a", "amr", "3gp", "mp4", "mp3", "wav", "flac" -> raw
            else -> "m4a" // 삼성 통화 녹음 기본 — 잘못된/없는 확장자 안전 fallback
        }
    }

    private fun contentTypeFor(ext: String): String = when (ext) {
        "m4a" -> "audio/m4a"
        "amr" -> "audio/amr"
        "3gp" -> "audio/3gpp"
        "mp3" -> "audio/mpeg"
        "wav" -> "audio/wav"
        "flac" -> "audio/flac"
        "mp4" -> "video/mp4"
        else -> "application/octet-stream"
    }

    companion object {
        private const val TAG = "AudioUploadWorker"
        private const val KEY_CALL_ID = "callId"

        // @vercel/blob 클라이언트 SDK 와 동일 — `https://vercel.com/api/blob` + `?pathname=...`.
        // 이 값은 SDK 내부 상수에서 추출 (chunk-WLMB4XQD.js: defaultVercelBlobApiUrl).
        private const val BLOB_API_URL = "https://vercel.com/api/blob"
        private const val BLOB_API_VERSION = "12"

        fun enqueueFor(ctx: Context, callId: Long) {
            val req = OneTimeWorkRequestBuilder<AudioUploadWorker>()
                .setInputData(workDataOf(KEY_CALL_ID to callId))
                .build()
            WorkManager.getInstance(ctx).enqueue(req)
        }
    }
}
