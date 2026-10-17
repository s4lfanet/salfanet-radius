package com.salfanet.admin_app

import com.salfanet.admin_app.qris.QrisChannel
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var qris: QrisChannel? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        qris = QrisChannel(this).also {
            MethodChannel(flutterEngine.dartExecutor.binaryMessenger, QrisChannel.NAME).setMethodCallHandler(it)
        }
    }

    override fun onDestroy() {
        qris?.dispose()
        super.onDestroy()
    }
}
