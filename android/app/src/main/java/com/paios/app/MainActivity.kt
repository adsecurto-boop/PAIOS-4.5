package com.paios.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    companion object {
        private const val TAG = "PAIOS_MainActivity"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.i(TAG, "PAIOS MainActivity launching...")
        super.onCreate(savedInstanceState)

        try {
            bridge?.webView?.overScrollMode = View.OVER_SCROLL_NEVER
            bridge?.webView?.isVerticalScrollBarEnabled = false
            bridge?.webView?.settings?.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                setSupportMultipleWindows(false)
                javaScriptCanOpenWindowsAutomatically = true
            }
        } catch (e: Throwable) {
            Log.w(TAG, "WebView settings configuration notice: ${e.message}")
        }

        handleAuthIntent(intent)
        Log.i(TAG, "PAIOS BridgeActivity initialized successfully.")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleAuthIntent(intent)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        val webView = bridge?.webView
        if (webView == null) {
            super.onBackPressed()
            return
        }

        webView.evaluateJavascript(
            "Boolean(window.__PAIOS_HANDLE_BACK__ && window.__PAIOS_HANDLE_BACK__())"
        ) { handled ->
            if (handled != "true") {
                runOnUiThread { super.onBackPressed() }
            }
        }
    }

    private fun handleAuthIntent(intent: Intent?) {
        val data: Uri? = intent?.data
        if (data != null) {
            Log.i(TAG, "Received deep link data: $data")
        }
    }
}

