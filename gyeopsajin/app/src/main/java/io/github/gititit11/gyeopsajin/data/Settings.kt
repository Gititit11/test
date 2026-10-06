package io.github.gititit11.gyeopsajin.data

import android.content.Context
import io.github.gititit11.gyeopsajin.core.Strictness

/** 사용자가 고른 것들. 몇 개 되지 않으므로 파일 하나에 담는다. */
class Settings(context: Context) {

    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    var strictness: Strictness
        get() = runCatching { Strictness.valueOf(prefs.getString(KEY_STRICT, null) ?: "") }
            .getOrDefault(Strictness.SAME)
        set(value) = prefs.edit().putString(KEY_STRICT, value.name).apply()

    /** 되돌릴 수 없이 지울지. 기본은 휴지통이며, 일부러 켜야 바뀐다. */
    var deleteForever: Boolean
        get() = prefs.getBoolean(KEY_FOREVER, false)
        set(value) = prefs.edit().putBoolean(KEY_FOREVER, value).apply()

    private companion object {
        const val KEY_STRICT = "strictness"
        const val KEY_FOREVER = "delete_forever"
    }
}
