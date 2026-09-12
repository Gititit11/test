package io.github.gititit11.gyeopsajin.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import io.github.gititit11.gyeopsajin.core.Photo
import io.github.gititit11.gyeopsajin.data.Gallery

/** 사진 한 장의 그림. 갤러리에서 바로 읽어 온다. */
@Composable
fun PhotoThumb(photo: Photo, modifier: Modifier = Modifier) {
    AsyncImage(
        model = Gallery.uriOf(photo.id),
        contentDescription = null,
        modifier = modifier.background(MaterialTheme.colorScheme.surfaceVariant),
        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
    )
}

/** 사진 위에 얹는 작은 글씨표 — 용량처럼 한눈에 봐야 하는 것 */
@Composable
fun OverlayTag(
    text: String,
    modifier: Modifier = Modifier,
    strong: Boolean = false,
) {
    Surface(
        modifier = modifier,
        color = if (strong) MaterialTheme.colorScheme.primary else Color.Black.copy(alpha = 0.62f),
        contentColor = if (strong) MaterialTheme.colorScheme.onPrimary else Color.White,
        shape = RoundedCornerShape(6.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = if (strong) FontWeight.Bold else FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
        )
    }
}

@Composable
fun CenterMessage(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}
