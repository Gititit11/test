package io.github.gititit11.gyeopsajin

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.github.gititit11.gyeopsajin.core.PhotoGroup
import io.github.gititit11.gyeopsajin.data.Gallery
import io.github.gititit11.gyeopsajin.data.Trash
import io.github.gititit11.gyeopsajin.ui.GroupScreen
import io.github.gititit11.gyeopsajin.ui.GyeopsajinTheme
import io.github.gititit11.gyeopsajin.ui.HomeScreen
import io.github.gititit11.gyeopsajin.ui.SettingsScreen
import io.github.gititit11.gyeopsajin.ui.formatBytes

/** 어느 화면을 보고 있는가 */
private sealed interface Route {
    data object Home : Route
    /** 무더기는 다시 묶일 때마다 새로 만들어지므로, 남길 사진의 번호로 붙잡는다 */
    data class Group(val keeperId: Long) : Route
    data object Settings : Route
}

class MainActivity : ComponentActivity() {

    private val vm: ScanViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            GyeopsajinTheme {
                Surface(Modifier) { App(vm) }
            }
        }
    }
}

/** 이 기기에서 사진을 읽으려면 어떤 권한이 필요한가 */
private fun neededPermissions(): Array<String> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            arrayOf(
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
            )
        } else {
            arrayOf(Manifest.permission.READ_MEDIA_IMAGES)
        }
    } else {
        arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }

@Composable
private fun App(vm: ScanViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    var route by rememberSaveable(
        stateSaver = Saver(
            save = { r: Route ->
                when (r) {
                    is Route.Home -> "home"
                    is Route.Settings -> "settings"
                    is Route.Group -> "group:${r.keeperId}"
                }
            },
            restore = { s: String ->
                when {
                    s == "settings" -> Route.Settings
                    s.startsWith("group:") -> Route.Group(s.removePrefix("group:").toLong())
                    else -> Route.Home
                }
            },
        )
    ) { mutableStateOf<Route>(Route.Home) }

    // 권한은 설정 화면에서 사용자가 바꿀 수도 있으므로, 화면이 돌아올 때마다 다시 본다
    var granted by remember { mutableStateOf(false) }
    var partial by remember { mutableStateOf(false) }
    fun refreshPermission() {
        val full = ContextCompat.checkSelfPermission(
            context,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
                Manifest.permission.READ_MEDIA_IMAGES
            else
                Manifest.permission.READ_EXTERNAL_STORAGE,
        ) == PackageManager.PERMISSION_GRANTED
        val some = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED
            ) == PackageManager.PERMISSION_GRANTED
        granted = full || some
        partial = some && !full
    }

    LaunchedEffect(Unit) { refreshPermission() }

    val askPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { refreshPermission() }

    // 지우기를 기다리는 사진들. 안드로이드가 확인창을 띄우고, 그 답을 여기서 받는다.
    var pending by remember { mutableStateOf<Set<Long>>(emptySet()) }
    val deleteLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult()
    ) { result ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            vm.forget(pending)
        }
        // 취소했다면 아무것도 지워지지 않았으므로 고른 것을 그대로 둔다
        pending = emptySet()
    }

    var confirming by remember { mutableStateOf<Set<Long>>(emptySet()) }

    fun startDelete(ids: Set<Long>) {
        if (ids.isEmpty()) return
        val uris = ids.map { Gallery.uriOf(it) }
        val sender = runCatching {
            if (state.deleteForever) Trash.requestDelete(context.contentResolver, uris)
            else Trash.requestTrash(context.contentResolver, uris)
        }.getOrNull() ?: return
        pending = ids
        deleteLauncher.launch(IntentSenderRequest.Builder(sender).build())
    }

    if (confirming.isNotEmpty()) {
        val ids = confirming
        var bytes = 0L
        for (g in state.groups) for (p in g.photos) if (p.id in ids) bytes += p.bytes
        AlertDialog(
            onDismissRequest = { confirming = emptySet() },
            title = { Text(if (state.deleteForever) "${ids.size}장을 완전히 지울까요?" else "${ids.size}장을 휴지통으로 보낼까요?") },
            text = {
                Text(
                    if (state.deleteForever)
                        "${formatBytes(bytes)}가 비어요. 되돌릴 수 없어요.\n" +
                            "안드로이드가 한 번 더 물어봐요."
                    else
                        "${formatBytes(bytes)}가 비어요. 갤러리 휴지통에서 되돌릴 수 있어요.\n" +
                            "안드로이드가 한 번 더 물어봐요."
                )
            },
            confirmButton = {
                TextButton(onClick = { startDelete(ids); confirming = emptySet() }) {
                    Text(if (state.deleteForever) "지우기" else "휴지통으로")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirming = emptySet() }) { Text("그만두기") }
            },
        )
    }

    // 시스템 뒤로가기로도 목록으로 돌아올 수 있어야 한다
    BackHandler(enabled = route != Route.Home) { route = Route.Home }

    when (val here = route) {
        is Route.Home -> HomeScreen(
            state = state,
            hasPermission = granted,
            partialPermission = partial,
            onAskPermission = { askPermission.launch(neededPermissions()) },
            onScan = { vm.scan() },
            onCancel = { vm.cancel() },
            onOpenGroup = { route = Route.Group(it.keeper.id) },
            onOpenSettings = { route = Route.Settings },
            onSortBy = { vm.setSortBy(it) },
            onSelectAllExtras = { vm.selectAllExtras() },
            onClearSelection = { vm.clearSelection() },
            onDelete = { confirming = state.selected },
        )

        is Route.Group -> {
            val group: PhotoGroup? = state.groups.firstOrNull { it.keeper.id == here.keeperId }
            if (group == null) {
                // 지우고 나서 무더기가 사라졌다면 목록으로 돌아간다
                LaunchedEffect(here.keeperId) { route = Route.Home }
            } else {
                GroupScreen(
                    group = group,
                    selected = state.selected,
                    deleteForever = state.deleteForever,
                    onBack = { route = Route.Home },
                    onToggle = { vm.toggle(it) },
                    onSelectExtras = { vm.selectExtras(group) },
                    onUnselect = { vm.unselectGroup(group) },
                    onDelete = {
                        confirming = group.photos.map { it.id }.filter { it in state.selected }.toSet()
                    },
                )
            }
        }

        is Route.Settings -> SettingsScreen(
            strictness = state.strictness,
            deleteForever = state.deleteForever,
            onBack = { refreshPermission(); route = Route.Home },
            onStrictness = { vm.setStrictness(it) },
            onDeleteForever = { vm.setDeleteForever(it) },
            onClearCache = { vm.clearCache(); route = Route.Home },
        )
    }
}
