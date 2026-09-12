package io.github.gititit11.gyeopsajin.core

import java.util.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GroupingTest {

    @Test
    fun `원본과 사본들이 한 무더기로 모인다`() {
        val originals = (1..6L).map { Images.naturalPhoto(it) }
        val photos = ArrayList<Photo>()
        val whichOriginal = HashMap<Long, Int>()
        var id = 100L
        for ((k, original) in originals.withIndex()) {
            photos.add(Images.photo(id, original, 4_000_000)); whichOriginal[id] = k; id++
            for (scale in listOf(0.5, 0.25)) {
                val small = Images.resized(original, scale)
                photos.add(Images.photo(id, small, (4_000_000 * scale * scale).toLong()))
                whichOriginal[id] = k
                id++
            }
        }
        photos.shuffle(Random(7))

        val groups = Grouping.group(photos, Strictness.SAME)

        assertEquals("무더기 수", originals.size, groups.size)
        for (g in groups) {
            assertEquals("무더기마다 원본 한 장과 사본 두 장", 3, g.size)
            assertEquals(
                "한 무더기에 서로 다른 원본이 섞였다",
                1, g.photos.map { whichOriginal[it.id] }.distinct().size
            )
        }
    }

    @Test
    fun `남길 한 장으로 가장 화질 좋은 사진을 고른다`() {
        val original = Images.naturalPhoto(3)
        val group = PhotoGroup(
            listOf(
                Images.photo(1, Images.resized(original, 0.25), 300_000),
                Images.photo(2, original, 4_000_000),
                Images.photo(3, Images.resized(original, 0.5), 1_100_000),
            )
        )
        assertEquals("가장 화소가 많은 사진을 남겨야 한다", 2L, group.keeper.id)
        assertEquals("남길 한 장을 뺀 나머지", 2, group.photos.drop(1).size)
        assertEquals(
            "비울 수 있는 용량",
            300_000L + 1_100_000L, group.reclaimableBytes
        )
        assertEquals("무더기 전체 용량", 5_400_000L, group.totalBytes)
    }

    @Test
    fun `화소가 같으면 파일이 큰 쪽을 남긴다`() {
        val original = Images.naturalPhoto(5)
        val group = PhotoGroup(
            listOf(
                Images.photo(1, original, 1_200_000),
                Images.photo(2, Images.recompressed(original, 0.95f), 3_800_000),
            )
        )
        assertEquals(2L, group.keeper.id)
    }

    @Test
    fun `혼자인 사진은 무더기가 되지 않는다`() {
        val lonely = (1..5L).map { Images.photo(it, Images.naturalPhoto(it), 1_000) }
        assertTrue("닮지 않은 사진끼리 묶였다", Grouping.group(lonely, Strictness.SAME).isEmpty())
        assertTrue("한 장뿐인데 무더기가 생겼다", Grouping.group(lonely.take(1), Strictness.LOOSE).isEmpty())
        assertTrue("빈 목록에서 무더기가 생겼다", Grouping.group(emptyList(), Strictness.SAME).isEmpty())
    }

    @Test
    fun `그만두라고 하면 곧바로 멈춘다`() {
        val photos = (1..40L).map { Images.photo(it, Images.naturalPhoto(it % 5), 1_000) }
        assertTrue(Grouping.group(photos, Strictness.SAME, cancelled = { true }).isEmpty())
    }
}
