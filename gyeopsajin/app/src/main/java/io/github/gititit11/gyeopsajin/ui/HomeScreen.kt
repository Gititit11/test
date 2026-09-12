@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package io.github.gititit11.gyeopsajin.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.gititit11.gyeopsajin.Phase
import io.github.gititit11.gyeopsajin.SortBy
import io.github.gititit11.gyeopsajin.UiState
import io.github.gititit11.gyeopsajin.core.PhotoGroup

@Composable
fun HomeScreen(
    state: UiState,
    hasPermission: Boolean,
    partialPermission: Boolean,
    onAskPermission: () -> Unit,
    onScan: () -> Unit,
    onCancel: () -> Unit,
    onOpenGroup: (PhotoGroup) -> Unit,
    onOpenSettings: () -> Unit,
    onSortBy: (SortBy) -> Unit,
    onSelectAllExtras: () -> Unit,
    onClearSelection: () -> Unit,
    onDelete: () -> Unit,
) {
    var sortMenu by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("겹사진") },
                actions = {
                    if (state.phase is Phase.Done && state.groups.isNotEmpty()) {
                        Box {
                            IconButton(onClick = { sortMenu = true }) {
                                Icon(Icons.Default.MoreVert, contentDescription = "정렬")
                            }
                            DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                                Text(
                                    "정렬",
                                    style = MaterialTheme.typography.labelMedium,
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                                )
                                for (sort in SortBy.entries) {
                                    DropdownMenuItem(
                                        text = { Text(sort.label) },
                                        onClick = { onSortBy(sort); sortMenu = false },
                                        trailingIcon = {
                                            if (state.sortBy == sort) Icon(Icons.Default.Check, null)
                                        },
                                    )
                                }
                            }
                        }
                    }
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "설정")
                    }
                },
            )
        },
        bottomBar = {
            if (state.selected.isNotEmpty()) {
                SelectionBar(
                    count = state.selected.size,
                    bytes = state.selectedBytes,
                    forever = state.deleteForever,
                    onClear = onClearSelection,
                    onDelete = onDelete,
                )
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            when {
                !hasPermission -> PermissionWall(onAskPermission)
                state.phase is Phase.Ready -> StartWall(partialPermission, onScan)
                state.phase is Phase.Reading -> Progress(
                    "사진을 한 장씩 열어 보고 있어요",
                    (state.phase as Phase.Reading).done,
                    (state.phase as Phase.Reading).total,
                    "처음 한 번만 오래 걸려요. 다음부터는 새로 들어온 사진만 봐요.",
                    onCancel,
                )
                state.phase is Phase.Comparing -> Progress(
                    "서로 견주어 보고 있어요",
                    (state.phase as Phase.Comparing).done,
                    (state.phase as Phase.Comparing).total,
                    null,
                    onCancel,
                )
                state.phase is Phase.Failed -> CenterMessage {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(32.dp),
                    ) {
                        Text((state.phase as Phase.Failed).message, textAlign = TextAlign.Center)
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = onScan) { Text("다시 해 보기") }
                    }
                }
                else -> GroupList(state, onOpenGroup, onScan, onSelectAllExtras)
            }
        }
    }
}

@Composable
private fun PermissionWall(onAsk: () -> Unit) {
    CenterMessage {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp),
        ) {
            Text("사진을 볼 수 있어야 해요", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Text(
                "겹사진은 갤러리를 읽기만 해요. 사진을 옮기거나 고치지 않고, " +
                    "지우는 것도 안드로이드가 한 번 더 물어본 뒤에만 일어나요.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(20.dp))
            Button(onClick = onAsk) { Text("사진 접근 허용하기") }
        }
    }
}

@Composable
private fun StartWall(partial: Boolean, onScan: () -> Unit) {
    CenterMessage {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp),
        ) {
            Text("같은 사진을 찾아 드려요", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(12.dp))
            Text(
                "크기만 다르게 저장된 사본도, 이름이 전혀 다른 사본도 같은 사진으로 봐요. " +
                    "파일 이름은 보지 않고 사진의 생김새만 봐요.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (partial) {
                Spacer(Modifier.height(16.dp))
                Surface(
                    color = MaterialTheme.colorScheme.tertiaryContainer,
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text(
                        "지금은 고른 사진 몇 장만 볼 수 있어요. 갤러리 전체를 정리하려면 " +
                            "설정에서 사진 접근을 '모두 허용' 으로 바꿔 주세요.",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(12.dp),
                        color = MaterialTheme.colorScheme.onTertiaryContainer,
                    )
                }
            }
            Spacer(Modifier.height(24.dp))
            Button(onClick = onScan) { Text("사진 훑어보기") }
        }
    }
}

@Composable
private fun Progress(title: String, done: Int, total: Int, note: String?, onCancel: () -> Unit) {
    CenterMessage {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(16.dp))
            if (total > 0) {
                LinearProgressIndicator(
                    progress = { done.toFloat() / total },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Text("$done / $total", style = MaterialTheme.typography.bodySmall)
            } else {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
            if (note != null) {
                Spacer(Modifier.height(12.dp))
                Text(
                    note,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(20.dp))
            TextButton(onClick = onCancel) { Text("그만두기") }
        }
    }
}

@Composable
private fun GroupList(
    state: UiState,
    onOpen: (PhotoGroup) -> Unit,
    onScan: () -> Unit,
    onSelectAllExtras: () -> Unit,
) {
    val groups = state.sortedGroups
    if (groups.isEmpty()) {
        CenterMessage {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(32.dp),
            ) {
                Text("겹치는 사진이 없어요", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                Text(
                    "사진 ${(state.phase as? Phase.Done)?.scanned ?: 0}장을 봤어요. " +
                        "더 넉넉한 기준으로 보려면 설정에서 바꿔 보세요.",
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(20.dp))
                TextButton(onClick = onScan) { Text("다시 훑어보기") }
            }
        }
        return
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Summary(state, onSelectAllExtras) }
        items(groups, key = { it.keeper.id }) { group ->
            GroupCard(group, state.selected, onClick = { onOpen(group) })
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun Summary(state: UiState, onSelectAllExtras: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.primaryContainer,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                formatBytes(state.reclaimableBytes),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Text(
                "무더기마다 가장 좋은 한 장만 남기면 이만큼 비어요",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "겹치는 사진 ${state.duplicateCount}장이 ${state.groups.size}무더기에 있어요",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f),
            )
            Spacer(Modifier.height(12.dp))
            FilledTonalButton(onClick = onSelectAllExtras, modifier = Modifier.fillMaxWidth()) {
                Text("모든 무더기에서 가장 좋은 한 장만 빼고 고르기")
            }
            Text(
                "고르기만 해요. 지우기는 그다음에 직접 눌러야 하고, 안드로이드가 한 번 더 물어봐요.",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 6.dp),
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.75f),
            )
        }
    }
}

@Composable
private fun GroupCard(group: PhotoGroup, selected: Set<Long>, onClick: () -> Unit) {
    val chosen = group.photos.count { it.id in selected }
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (photo in group.photos.take(4)) {
                    Box(
                        Modifier
                            .weight(1f)
                            .aspectRatio(1f)
                            .clip(RoundedCornerShape(10.dp))
                    ) {
                        PhotoThumb(photo, Modifier.fillMaxSize())
                        OverlayTag(
                            formatBytes(photo.bytes),
                            Modifier.align(Alignment.BottomStart).padding(4.dp),
                        )
                        if (photo.id in selected) {
                            Box(
                                Modifier
                                    .fillMaxSize()
                                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.35f))
                            )
                        }
                    }
                }
                // 넉 장이 안 되면 자리만 채워 카드 모양을 지킨다
                repeat(4 - minOf(group.size, 4)) { Spacer(Modifier.weight(1f)) }
            }
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "${group.size}장 · 모두 ${formatBytes(group.totalBytes)}",
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        "한 장만 남기면 ${formatBytes(group.reclaimableBytes)} 비어요",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                if (chosen > 0) {
                    AssistChip(onClick = onClick, label = { Text("$chosen 장 고름") })
                }
            }
        }
    }
}

@Composable
fun SelectionBar(
    count: Int,
    bytes: Long,
    forever: Boolean,
    onClear: () -> Unit,
    onDelete: () -> Unit,
) {
    Surface(tonalElevation = 3.dp) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("$count 장 고름", style = MaterialTheme.typography.titleSmall)
                Text(
                    "지우면 ${formatBytes(bytes)} 비어요",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            TextButton(onClick = onClear) { Text("고른 것 풀기") }
            Spacer(Modifier.width(8.dp))
            Button(onClick = onDelete) {
                Text(if (forever) "완전히 지우기" else "휴지통으로")
            }
        }
    }
}
