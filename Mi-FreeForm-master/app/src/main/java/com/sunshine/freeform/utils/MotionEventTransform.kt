package com.sunshine.freeform.utils

import android.graphics.Matrix
import android.view.MotionEvent

/** Caller owns the returned event and must recycle it after the Binder call. */
object MotionEventTransform {
    fun toDisplay(event: MotionEvent, scale: Float): MotionEvent {
        require(scale.isFinite() && scale > 0f)
        // Copy the complete gesture: timestamps, pointer IDs, action index,
        // pressure, tool type, flags and batched history. Never mutate the event
        // owned by the overlay's input dispatcher.
        return MotionEvent.obtain(event).apply {
            transform(Matrix().apply { setScale(1f / scale, 1f / scale) })
        }
    }
}
