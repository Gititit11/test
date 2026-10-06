package io.github.gititit11.gyeopsajin

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import io.github.gititit11.gyeopsajin.core.Grouping
import io.github.gititit11.gyeopsajin.core.Photo
import io.github.gititit11.gyeopsajin.core.PhotoGroup
import io.github.gititit11.gyeopsajin.core.Strictness
import io.github.gititit11.gyeopsajin.data.FingerprintCache
import io.github.gititit11.gyeopsajin.data.Gallery
import io.github.gititit11.gyeopsajin.data.GalleryItem
import io.github.gititit11.gyeopsajin.data.Reader
import io.github.gititit11.gyeopsajin.data.Settings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicInteger

/** 무더기를 어떤 순서로 보여 줄지 */
enum class SortBy(val label: String) {
    RECLAIM("비울 수 있는 용량"),
    COUNT("장수"),
    RECENT("최근 사진"),
}

sealed interface Phase {
    /** 아직 훑기 전 */
    data object Ready : Phase

    /** 사진을 한 장씩 열어 보는 중 */
    data class Reading(val done: Int, val total: Int) : Phase

    /** 다 읽고 서로 견주는 중 */
    data class Comparing(val done: Int, val total: Int) : Phase

    data class Done(val groups: List<PhotoGroup>, val scanned: Int) : Phase

    data class Failed(val message: String) : Phase
}

data class UiState(
    val phase: Phase = Phase.Ready,
    val selected: Set<Long> = emptySet(),
    val strictness: Strictness = Strictness.SAME,
    val deleteForever: Boolean = false,
    val sortBy: SortBy = SortBy.RECLAIM,
) {
    val groups: List<PhotoGroup>
        get() = (phase as? Phase.Done)?.groups ?: emptyList()

    /** 보여 줄 순서대로 정렬한 무더기 */
    val sortedGroups: List<PhotoGroup>
        get() = when (sortBy) {
            SortBy.RECLAIM -> groups.sortedByDescending { it.reclaimableBytes }
            SortBy.COUNT -> groups.sortedWith(
                compareByDescending<PhotoGroup> { it.size }.thenByDescending { it.reclaimableBytes }
            )
            SortBy.RECENT -> groups.sortedByDescending { g -> g.photos.maxOf { it.whenTaken } }
        }

    val duplicateCount: Int get() = groups.sumOf { it.size }

    /** 무더기마다 한 장씩만 남긴다면 비는 용량 */
    val reclaimableBytes: Long get() = groups.sumOf { it.reclaimableBytes }

    val selectedBytes: Long
        get() {
            if (selected.isEmpty()) return 0
            var sum = 0L
            for (g in groups) for (p in g.photos) if (p.id in selected) sum += p.bytes
            return sum
        }
}

class ScanViewModel(app: Application) : AndroidViewModel(app) {

    private val settings = Settings(app)
    private val cache = FingerprintCache(app)

    private val _state = MutableStateFlow(
        UiState(strictness = settings.strictness, deleteForever = settings.deleteForever)
    )
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var work: Job? = null

    /** 이미 읽어 둔 사진들. 기준을 바꿔 다시 묶을 때 다시 읽지 않기 위해 들고 있는다. */
    private var scanned: List<Photo> = emptyList()

    fun scan() {
        if (work?.isActive == true) return
        work = viewModelScope.launch {
            try {
                val photos = readAll()
                scanned = photos
                regroup(photos)
            } catch (e: kotlinx.coroutines.CancellationException) {
                _state.value = _state.value.copy(phase = Phase.Ready)
            } catch (e: Throwable) {
                _state.value = _state.value.copy(
                    phase = Phase.Failed(e.message ?: "사진을 읽는 중에 문제가 생겼어요")
                )
            }
        }
    }

    fun cancel() {
        work?.cancel()
        work = null
        _state.value = _state.value.copy(phase = Phase.Ready)
    }

    /** 이미 읽어 둔 사진을 새 기준으로 다시 묶는다 */
    fun setStrictness(level: Strictness) {
        settings.strictness = level
        _state.value = _state.value.copy(strictness = level, selected = emptySet())
        if (scanned.isEmpty()) return
        work?.cancel()
        work = viewModelScope.launch { regroup(scanned) }
    }

    fun setDeleteForever(forever: Boolean) {
        settings.deleteForever = forever
        _state.value = _state.value.copy(deleteForever = forever)
    }

    fun setSortBy(sort: SortBy) {
        _state.value = _state.value.copy(sortBy = sort)
    }

    private suspend fun readAll(): List<Photo> = withContext(Dispatchers.IO) {
        val resolver = getApplication<Application>().contentResolver
        val items = Gallery.list(resolver)
        _state.update { it.copy(phase = Phase.Reading(0, items.size)) }
        if (items.isEmpty()) return@withContext emptyList()

        cache.forgetMissing(items)
        val known = cache.load(items)

        val out = arrayOfNulls<Photo>(items.size)
        val cursor = AtomicInteger(0)
        val done = AtomicInteger(0)
        val fresh = java.util.Collections.synchronizedList(ArrayList<Pair<GalleryItem, io.github.gititit11.gyeopsajin.core.Fingerprint.Result>>())

        // 사진을 읽는 일은 기다리는 시간이 대부분이라 여러 갈래로 나누면 훨씬 빠르다.
        val lanes = Runtime.getRuntime().availableProcessors().coerceIn(2, 6)
        coroutineScope {
            (1..lanes).map {
                async(Dispatchers.IO) {
                    while (isActive) {
                        val i = cursor.getAndIncrement()
                        if (i >= items.size) break
                        val item = items[i]
                        val entry = known[item.id]
                        val result = if (entry != null) {
                            io.github.gititit11.gyeopsajin.core.Fingerprint.Result(entry.hash, entry.mask, entry.color)
                        } else {
                            Reader.fingerprint(resolver, item.uri)?.also { fresh.add(item to it) }
                        }
                        if (result != null) {
                            out[i] = Photo(
                                id = item.id,
                                name = item.name,
                                album = item.album,
                                bytes = item.bytes,
                                width = item.width,
                                height = item.height,
                                takenAt = item.takenAt,
                                addedAt = item.addedAt,
                                modifiedAt = item.modifiedAt,
                                hash = result.hash,
                                mask = result.mask,
                                color = result.color,
                            )
                        }
                        val n = done.incrementAndGet()
                        if (n % 16 == 0 || n == items.size) {
                            _state.update { it.copy(phase = Phase.Reading(n, items.size)) }
                        }
                    }
                }
            }.awaitAll()
        }

        // 새로 읽은 지문은 한 묶음으로 적어 둔다. 다음 번에는 이 일을 건너뛴다.
        cache.putAll(fresh.toList())

        out.filterNotNull()
    }

    private suspend fun regroup(photos: List<Photo>) {
        val level = _state.value.strictness
        _state.update { it.copy(phase = Phase.Comparing(0, photos.size)) }
        val groups = withContext(Dispatchers.Default) {
            val here = this
            Grouping.group(
                photos = photos,
                level = level,
                onProgress = { d, t ->
                    if (d % 64 == 0 || d == t) {
                        _state.update { it.copy(phase = Phase.Comparing(d, t)) }
                    }
                },
                // 이 일을 맡은 코루틴이 취소되면 곧바로 손을 뗀다
                cancelled = { !here.isActive },
            )
        }
        _state.value = _state.value.copy(phase = Phase.Done(groups, photos.size), selected = emptySet())
    }

    fun toggle(id: Long) {
        val now = _state.value.selected
        _state.value = _state.value.copy(
            selected = if (id in now) now - id else now + id
        )
    }

    /**
     * 한 무더기에서 가장 화질 좋은 한 장만 남기고 나머지를 고른다.
     * 고르기만 할 뿐 지우지는 않는다. 지우는 것은 사용자가 버튼을 누르고,
     * 안드로이드가 한 번 더 물어본 뒤에야 일어난다.
     */
    fun selectExtras(group: PhotoGroup) {
        val extras = group.photos.drop(1).map { it.id }
        _state.value = _state.value.copy(selected = _state.value.selected + extras)
    }

    fun unselectGroup(group: PhotoGroup) {
        val ids = group.photos.map { it.id }.toSet()
        _state.value = _state.value.copy(selected = _state.value.selected - ids)
    }

    /** 모든 무더기에 같은 규칙을 한 번에 적용한다 */
    fun selectAllExtras() {
        val extras = HashSet<Long>()
        for (g in _state.value.groups) for (p in g.photos.drop(1)) extras.add(p.id)
        _state.value = _state.value.copy(selected = extras)
    }

    fun clearSelection() {
        _state.value = _state.value.copy(selected = emptySet())
    }

    /** 안드로이드가 실제로 지운 뒤, 화면을 다시 훑지 않고 그 자리에서 반영한다 */
    fun forget(ids: Set<Long>) {
        if (ids.isEmpty()) return
        scanned = scanned.filter { it.id !in ids }
        val phase = _state.value.phase
        if (phase !is Phase.Done) return
        val left = phase.groups
            .map { g -> g.photos.filter { it.id !in ids } }
            .filter { it.size > 1 }
            .map { PhotoGroup(it) }
        _state.value = _state.value.copy(
            phase = Phase.Done(left, phase.scanned - ids.size),
            selected = _state.value.selected - ids,
        )
    }

    fun clearCache() {
        cache.clear()
        scanned = emptyList()
        _state.value = _state.value.copy(phase = Phase.Ready, selected = emptySet())
    }

    override fun onCleared() {
        cache.close()
        super.onCleared()
    }
}
