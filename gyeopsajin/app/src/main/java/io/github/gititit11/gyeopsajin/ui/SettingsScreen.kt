@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package io.github.gititit11.gyeopsajin.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.github.gititit11.gyeopsajin.core.Strictness

@Composable
fun SettingsScreen(
    strictness: Strictness,
    deleteForever: Boolean,
    onBack: () -> Unit,
    onStrictness: (Strictness) -> Unit,
    onDeleteForever: (Boolean) -> Unit,
    onClearCache: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("설정") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "뒤로")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            Text(
                "어디까지 같은 사진으로 볼까요",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(vertical = 12.dp),
            )
            for (level in Strictness.entries) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .selectable(
                            selected = strictness == level,
                            onClick = { onStrictness(level) },
                        )
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    RadioButton(selected = strictness == level, onClick = { onStrictness(level) })
                    Column(Modifier.padding(start = 8.dp, top = 10.dp)) {
                        Text(level.label, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            level.explain,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            HorizontalDivider(Modifier.padding(vertical = 12.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("되돌릴 수 없이 지우기", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        if (deleteForever)
                            "지우면 끝이에요. 휴지통에도 남지 않아요."
                        else
                            "휴지통으로 보내요. 갤러리 휴지통에서 되돌릴 수 있어요.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = deleteForever, onCheckedChange = onDeleteForever)
            }

            HorizontalDivider(Modifier.padding(vertical = 12.dp))

            Text("적어 둔 지문 지우기", style = MaterialTheme.typography.bodyLarge)
            Text(
                "한 번 본 사진은 다시 열어 보지 않도록 생김새를 적어 둬요. " +
                    "이걸 지우면 다음 훑기가 처음처럼 오래 걸려요.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(onClick = onClearCache, modifier = Modifier.padding(top = 4.dp)) {
                Text("지우고 처음부터 다시 보기")
            }

            HorizontalDivider(Modifier.padding(vertical = 12.dp))

            Text("겹사진이 하지 않는 일", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(6.dp))
            Text(
                "· 사진을 스스로 지우지 않아요. 고르는 것도 지우기를 누르는 것도 사람이 해요.\n" +
                    "· 지울 때는 안드로이드가 한 번 더 물어봐요. 거기서 취소하면 아무 일도 없어요.\n" +
                    "· 사진을 어디로도 보내지 않아요. 인터넷을 쓸 줄 모르는 앱이에요.\n" +
                    "· 파일 이름으로 판단하지 않아요. 사진의 생김새만 봐요.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(32.dp))
        }
    }
}
