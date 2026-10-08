package com.sunshine.freeform.utils

import android.os.Parcel
import android.view.InputDevice
import android.view.MotionEvent
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MotionEventTransformTest {
    private fun event(action: Int, time: Long): MotionEvent {
        val properties = arrayOf(7, 2).map { id ->
            MotionEvent.PointerProperties().apply {
                this.id = id
                toolType = MotionEvent.TOOL_TYPE_FINGER
            }
        }.toTypedArray()
        val coords = arrayOf(20f, 60f).map { value ->
            MotionEvent.PointerCoords().apply {
                x = value
                y = value + 10f
                pressure = 0.7f
                size = 0.2f
            }
        }.toTypedArray()
        return MotionEvent.obtain(100L, time, action, 2, properties, coords,
            0, 0, 1f, 1f, -1, 0, InputDevice.SOURCE_TOUCHSCREEN, 0)
    }

    @Test
    fun preservesPointerIdentityAndActionAcrossParcel() {
        val action = MotionEvent.ACTION_POINTER_UP or (1 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT)
        val original = event(action, 150L)
        val transformed = MotionEventTransform.toDisplay(original, 0.5f)
        val parcel = Parcel.obtain()
        try {
            transformed.writeToParcel(parcel, 0)
            parcel.setDataPosition(0)
            val received = MotionEvent.CREATOR.createFromParcel(parcel)
            try {
                assertEquals(100L, received.downTime)
                assertEquals(150L, received.eventTime)
                assertEquals(action, received.action)
                assertEquals(1, received.actionIndex)
                assertEquals(7, received.getPointerId(0))
                assertEquals(2, received.getPointerId(1))
                assertEquals(40f, received.getX(0), 0.001f)
                assertEquals(120f, received.getX(1), 0.001f)
                assertEquals(0.7f, received.getPressure(0), 0.001f)
                assertEquals(20f, original.getX(0), 0.001f)
            } finally { received.recycle() }
        } finally {
            parcel.recycle()
            transformed.recycle()
            original.recycle()
        }
    }

    @Test
    fun keepsGestureDownTimeForMoveUpAndCancel() {
        for (action in intArrayOf(MotionEvent.ACTION_MOVE, MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL)) {
            val original = event(action, 200L)
            val transformed = MotionEventTransform.toDisplay(original, 1f)
            try {
                assertEquals(100L, transformed.downTime)
                assertEquals(200L, transformed.eventTime)
                assertEquals(action, transformed.action)
            } finally { transformed.recycle(); original.recycle() }
        }
    }
}
