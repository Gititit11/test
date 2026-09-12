package io.github.gititit11.gyeopsajin.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val LightColors = lightColorScheme(
    primary = Color(0xFF2F6BD8),
    secondary = Color(0xFF4C6382),
    tertiary = Color(0xFF6A5B9A),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF9EC2FF),
    secondary = Color(0xFFB6C8E8),
    tertiary = Color(0xFFCFC0FF),
)

@Composable
fun GyeopsajinTheme(
    dark: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val colors = when {
        // 안드로이드 12부터는 기기 배경 화면에서 뽑은 색을 쓸 수 있다
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> DarkColors
        else -> LightColors
    }
    MaterialTheme(colorScheme = colors, content = content)
}
