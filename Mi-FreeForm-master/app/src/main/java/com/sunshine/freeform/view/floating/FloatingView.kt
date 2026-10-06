package com.sunshine.freeform.view.floating

import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.graphics.Point
import android.net.Uri
import android.provider.Settings
import android.view.Gravity
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.sunshine.freeform.R
import com.sunshine.freeform.ThemeSettings
import com.sunshine.freeform.callback.ClickListener
import com.sunshine.freeform.callback.OrientationChangedListener
import com.sunshine.freeform.room.FreeFormAppsEntity
import com.sunshine.freeform.utils.PackageUtils
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlin.math.min
import kotlin.math.roundToInt

/** One overlay owns both panels, so opening all apps never replaces the shortcut rail. */
@DelicateCoroutinesApi
class FloatingView(
    private val baseContext: Context,
    private val showLocation: Int
) {
    private var context = ThemeSettings.wrap(baseContext)
    private val windowManager = baseContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val viewModel = FloatingViewViewModel(baseContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var root: View? = null
    private var panelScope: CoroutineScope? = null
    private var apps = emptyList<FreeFormAppsEntity>()
    private var expanded = true

    private val orientationListener = object : OrientationChangedListener {
        override fun onChanged(orientation: Int) {
            if (root != null) {
                removeWindow()
                showPanels()
            }
        }
    }

    companion object {
        const val TAG = "FloatingView"
        var orientationChangedListener: OrientationChangedListener? = null
        private var activeView: FloatingView? = null
    }

    init {
        activeView?.dismiss()
        activeView = this
        scope.launch {
            apps = withContext(Dispatchers.IO) {
                val saved = viewModel.getAllFreeFormApps().first().orEmpty()
                val missing = saved.filterNot {
                    PackageUtils.hasInstallThisPackage(it.packageName, baseContext.packageManager)
                }
                if (missing.isNotEmpty()) viewModel.deleteNotInstall(ArrayList(missing))
                saved.filterNot { it in missing }.sortedBy { it.sortNum }
            }
            orientationChangedListener = orientationListener
            showPanels()
        }
    }

    private fun dp(value: Int) = (value * context.resources.displayMetrics.density).roundToInt()

    private fun showPanels() {
        if (!Settings.canDrawOverlays(baseContext)) {
            Toast.makeText(baseContext, R.string.request_overlay_permission, Toast.LENGTH_LONG).show()
            try {
                baseContext.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${baseContext.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Exception) {
                Toast.makeText(baseContext, R.string.request_overlay_permission_fail, Toast.LENGTH_LONG).show()
            }
            dismiss()
            return
        }
        // Service contexts do not receive AppCompat's local night mode override.
        context = ThemeSettings.wrap(baseContext)
        val view = LayoutInflater.from(context).inflate(R.layout.view_floating, null, false)
        val row = view.findViewById<LinearLayout>(R.id.floating_panels)
        val rail = view.findViewById<FrameLayout>(R.id.sidebar_container)
        val grid = view.findViewById<FrameLayout>(R.id.all_apps_container)
        val screen = Point()
        windowManager.defaultDisplay.getSize(screen)
        val availableWidth = (screen.x - dp(32)).coerceAtLeast(1)
        val railWidth = min(dp(70), availableWidth)
        val gap = dp(8)
        val gridWidth = min(dp(240), (availableWidth - railWidth - gap).coerceAtLeast(1))
        val panelHeight = min(dp(500), (screen.y - dp(32)).coerceAtLeast(1))
        val onLeft = showLocation == -1
        row.layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, panelHeight,
            Gravity.CENTER_VERTICAL or if (onLeft) Gravity.LEFT else Gravity.RIGHT
        ).apply { setMargins(dp(16), 0, dp(16), 0) }
        // Physical side follows the user's side-bar setting, including RTL locales.
        row.layoutDirection = View.LAYOUT_DIRECTION_LTR
        row.removeAllViews()
        rail.layoutParams = LinearLayout.LayoutParams(railWidth, panelHeight)
        grid.layoutParams = LinearLayout.LayoutParams(gridWidth, panelHeight).apply {
            if (onLeft) leftMargin = gap else rightMargin = gap
        }
        if (onLeft) { row.addView(rail); row.addView(grid) }
        else { row.addView(grid); row.addView(rail) }
        grid.visibility = if (expanded) View.VISIBLE else View.GONE

        val shortcuts = LayoutInflater.from(context)
            .inflate(R.layout.view_floting_view_recycler_app, rail, false)
        rail.addView(shortcuts)
        shortcuts.findViewById<RecyclerView>(R.id.recycler_view).apply {
            layoutManager = LinearLayoutManager(context)
            adapter = FloatingViewAdapter(context, apps, object : ClickListener {
                override fun onClick() = dismiss()
            }, object : ClickListener {
                override fun onClick() {
                    expanded = !expanded
                    grid.visibility = if (expanded) View.VISIBLE else View.GONE
                }
            })
        }

        val allApps = LayoutInflater.from(context).inflate(R.layout.view_all_apps, grid, false)
        grid.addView(allApps)
        val progress = allApps.findViewById<View>(R.id.shwo_progress)
        val loadingScope = CoroutineScope(scope.coroutineContext + SupervisorJob(scope.coroutineContext[Job]))
        panelScope = loadingScope
        val allAdapter = AllAppsAdapter(context, object : ClickListener {
            override fun onClick() = dismiss()
        }, loadingScope)
        allAdapter.setLoadFinish(object : AllAppsAdapter.OnLoadFinish {
            override fun loadFinish() { progress.visibility = View.GONE }
        })
        allApps.findViewById<RecyclerView>(R.id.recyclerView).apply {
            layoutManager = GridLayoutManager(context, 3)
            adapter = allAdapter
        }
        view.setOnClickListener { dismiss() }
        view.isFocusableInTouchMode = true
        view.setOnKeyListener { _, key, event ->
            if (key == KeyEvent.KEYCODE_BACK) {
                if (event.action == KeyEvent.ACTION_UP) dismiss()
                true
            } else false
        }
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.RGBA_8888
        ).apply { gravity = Gravity.CENTER }
        try {
            windowManager.addView(view, params)
            root = view
            view.requestFocus()
        } catch (_: WindowManager.BadTokenException) {
            dismiss()
        } catch (_: SecurityException) {
            dismiss()
        }
    }

    private fun removeWindow() {
        panelScope?.cancel()
        panelScope = null
        root?.let { if (it.isAttachedToWindow) windowManager.removeViewImmediate(it) }
        root = null
    }

    private fun dismiss() {
        removeWindow()
        scope.cancel()
        if (orientationChangedListener === orientationListener) orientationChangedListener = null
        if (activeView === this) activeView = null
    }
}
