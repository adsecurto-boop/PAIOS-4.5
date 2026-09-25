package com.paios.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlin.concurrent.thread

@CapacitorPlugin(name = "PaiosAppUpdater")
class PaiosAppUpdaterPlugin : Plugin() {
    @PluginMethod
    fun downloadApk(call: PluginCall) {
        val sourceUrl = call.getString("url")
        val version = call.getString("version") ?: "latest"
        val expectedHash = call.getString("sha256")?.lowercase()
        val trustedLocal = sourceUrl?.startsWith("http://localhost") == true ||
            sourceUrl?.startsWith("http://127.0.0.1") == true ||
            sourceUrl?.startsWith("http://10.0.2.2") == true
        if (sourceUrl.isNullOrBlank() || (!sourceUrl.startsWith("https://") && !trustedLocal)) {
            call.reject("A secure HTTPS update URL is required")
            return
        }

        thread(name = "paios-update-download") {
            try {
                val updateDir = File(context.cacheDir, "updates").apply { mkdirs() }
                val target = File(updateDir, "PAIOS-$version.apk")
                var connection = URL(sourceUrl).openConnection() as HttpURLConnection
                connection.instanceFollowRedirects = true
                connection.connectTimeout = 15_000
                connection.readTimeout = 30_000
                connection.setRequestProperty("User-Agent", "PAIOS-Android-Updater")
                connection.connect()
                if (connection.responseCode !in 200..299) throw IllegalStateException("Update server returned ${connection.responseCode}")

                val total = connection.contentLengthLong.coerceAtLeast(0)
                var transferred = 0L
                val digest = MessageDigest.getInstance("SHA-256")
                connection.inputStream.use { input ->
                    target.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            output.write(buffer, 0, count)
                            digest.update(buffer, 0, count)
                            transferred += count
                            val progress = JSObject().apply {
                                put("percent", if (total > 0) ((transferred * 100) / total).toInt() else 50)
                                put("transferredBytes", transferred)
                                put("totalBytes", if (total > 0) total else transferred)
                                put("status", "downloading")
                            }
                            notifyListeners("downloadProgress", progress)
                        }
                    }
                }

                val actualHash = digest.digest().joinToString("") { "%02x".format(it) }
                if (!expectedHash.isNullOrBlank() && expectedHash.matches(Regex("[a-f0-9]{64}")) && actualHash != expectedHash) {
                    target.delete()
                    throw SecurityException("Downloaded APK checksum does not match the release manifest")
                }
                call.resolve(JSObject().apply {
                    put("filePath", target.absolutePath)
                    put("sizeBytes", target.length())
                })
            } catch (error: Throwable) {
                call.reject(error.message ?: "Android update download failed", Exception(error))
            }
        }
    }

    @PluginMethod
    fun installDownloadedApk(call: PluginCall) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
                val permissionIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(permissionIntent)
                call.reject("Allow PAIOS to install updates, then return and tap Install & restart again")
                return
            }
            val path = call.getString("filePath") ?: throw IllegalArgumentException("Downloaded APK path is missing")
            val apk = File(path)
            if (!apk.exists() || !apk.canonicalPath.startsWith(File(context.cacheDir, "updates").canonicalPath)) {
                throw SecurityException("Invalid update package path")
            }
            val uri: Uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", apk)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            call.resolve()
        } catch (error: Throwable) {
            call.reject(error.message ?: "Unable to open Android package installer", Exception(error))
        }
    }
}
