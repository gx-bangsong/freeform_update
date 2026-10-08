package com.sunshine.freeform.utils

import android.os.RemoteException
import android.os.SystemClock
import android.util.Log
import android.view.MotionEvent
import com.sunshine.freeform.MiFreeForm

object RemoteServiceUtils {
    private const val TAG = "FreeFormInput"
    private var lastWarning = -5000L

    fun remotePressBack(displayId: Int) {
        MiFreeForm.baseViewModel.getControlService()?.pressBack(displayId)
    }

    fun remoteInjectMotionEvent(event: MotionEvent?, displayId: Int, scale: Float) {
        if (event == null) return
        // Never accidentally inject a small-window gesture into the main display.
        if (displayId <= 0 || !scale.isFinite() || scale <= 0f) {
            warn("Ignoring touch: invalid display or scale")
            return
        }
        val service = MiFreeForm.baseViewModel.getControlService()
        if (service == null) {
            warn("Control service unavailable; reconnect Shizuku/Sui")
            return
        }
        val copy = MotionEventTransform.toDisplay(event, scale)
        val start = SystemClock.uptimeMillis()
        try {
            service.touchEvent(copy, displayId)
        } catch (e: RemoteException) {
            warn("Touch Binder call failed; restart the app and its user service after upgrade", e)
        } catch (e: RuntimeException) {
            warn("Touch forwarding failed", e)
        } finally {
            copy.recycle()
            val elapsed = SystemClock.uptimeMillis() - start
            if (elapsed > 250) warn("Slow touch Binder call: display=$displayId duration=${elapsed}ms")
        }
    }

    private fun warn(message: String, error: Throwable? = null) {
        val now = SystemClock.uptimeMillis()
        if (now - lastWarning >= 5000) {
            lastWarning = now
            Log.w(TAG, message, error)
        }
    }
}
