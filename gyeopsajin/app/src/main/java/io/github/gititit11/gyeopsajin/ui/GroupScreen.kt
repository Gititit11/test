@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package io.github.gititit11.gyeopsajin.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import io.github.gititit11.gyeopsajin.core.Photo
import io.github.gititit11.gyeopsajin.core.PhotoGroup
import io.github.gititit11.gyeopsajin.core.Similarity

@Composable
fun GroupScreen(
    group: PhotoGroup,
    selected: Set<Long>,
    deleteForever: Boolean,
    onBack: () -> Unit,
    onToggle: (Long) -> Unit,
    onSelectExtras: () -> Unit,
    onUnselect: () -> Unit,
    onDelete: () -> Unit,
) {
    val chosen = group.photos.filter { it.id in selected }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("${group.size}장이 같아 보여요")
                        Text(
                            "모두 ${formatBytes(group.totalBytes)}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "뒤로")
                    }
                },
            )
        },
        bottomBar = {
            if (chosen.isNotEmpty()) {
                SelectionBar(
                    count = chosen.size,
                    bytes = chosen.sumOf { it.bytes },
                    forever = deleteForever,
                    onClear = onUnselect,
                    onDelete = onDelete,
                )
            }
        },
    ) { padding ->
        LazyVerticalGrid(
            columns = GridCells.Adaptive(150.dp),
            contentPadding = PaddingValues(12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.padding(padding),
        ) {
            item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                Column {
                    FilledTonalButton(
                        onClick = onSelectExtras,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("가장 좋은 한 장만 빼고 고르기 · ${formatBytes(group.reclaimableBytes)}")
                    }
                    Text(
                        "가장 화소가 많고 파일이 큰 한 장을 남겨요. 마음에 안 들면 아래에서 직접 바꾸면 돼요.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 6.dp, bottom = 4.dp),
                    )
                }
            }
            items(group.photos, key = { it.id }) { photo ->
                PhotoCell(
                    photo = photo,
                    keeper = photo.id == group.keeper.id,
                    likeness = if (photo.id == group.keeper.id) 100
                        else Similarity.percent(group.keeper, photo),
                    checked = photo.id in selected,
                    onClick = { onToggle(photo.id) },
                )
            }
        }
    }
}

@Composable
private fun PhotoCell(
    photo: Photo,
    keeper: Boolean,
    likeness: Int,
    checked: Boolean,
    onClick: () -> Unit,
) {
    Column(
        Modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
        ) {
            PhotoThumb(photo, Modifier.fillMaxSize())
            if (checked) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.35f))
                )
            }
            Icon(
                imageVector = if (checked) Icons.Default.CheckCircle else Icons.Outlined.Circle,
                contentDescription = if (checked) "고름" else "고르지 않음",
                tint = if (checked) MaterialTheme.colorScheme.primary else Color.White,
                modifier = Modifier.align(Alignment.TopEnd).padding(6.dp),
            )
            OverlayTag(
                text = formatBytes(photo.bytes),
                strong = true,
                modifier = Modifier.align(Alignment.BottomStart).padding(6.dp),
            )
            if (keeper) {
                OverlayTag(
                    text = "가장 좋음",
                    modifier = Modifier.align(Alignment.TopStart).padding(6.dp),
                )
            }
        }
        Column(Modifier.padding(horizontal = 4.dp, vertical = 6.dp)) {
            Text(
                "${photo.width} x ${photo.height}",
                style = MaterialTheme.typography.labelMedium,
            )
            Text(
                "${formatPixels(photo.width, photo.height)} · ${formatDate(photo.whenTaken)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                if (keeper) photo.name else "${photo.name} · ${likeness}% 닮음",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
        }
    }
}
