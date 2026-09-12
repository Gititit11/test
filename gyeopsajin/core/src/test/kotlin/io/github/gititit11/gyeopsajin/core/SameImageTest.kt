package io.github.gititit11.gyeopsajin.core

import java.awt.Color
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 이 앱이 내건 약속 네 가지를 그대로 검사한다.
 *
 *  - 크기만 다른 사진은 같은 사진이다
 *  - 파일 이름은 판단에 끼어들지 않는다
 *  - 다른 사진은 갈라져 있어야 한다
 *  - 한 무더기에 서로 다른 사진이 섞이면 안 된다
 */
class SameImageTest {

    private val photos = (1..8L).map { Images.naturalPhoto(it) }
    private val shots = (1..6L).map { Images.screenshot(it) }

    @Test
    fun `검사에 쓰는 사진이 실제로 사진다운가`() {
        // 만들어 낸 그림이 우연히 거의 단색이 되면, 이 파일의 다른 검사들이
        // 사진이 아니라 색종이를 검사하게 된다. 먼저 그것부터 확인한다.
        for ((i, img) in photos.withIndex()) {
            assertTrue("만들어 낸 사진 $i 에 무늬가 없다", Images.fingerprint(img).mask != 0L)
        }
        for ((i, shot) in shots.withIndex()) {
            assertTrue("만들어 낸 스크린샷 $i 에 무늬가 없다", Images.fingerprint(shot).mask != 0L)
        }
        assertTrue(
            "이름 검사에 쓰는 사진에 무늬가 없다",
            Images.fingerprint(Images.naturalPhoto(42)).mask != 0L
        )
    }

    @Test
    fun `크기를 줄인 사진은 같은 사진이다`() {
        for ((i, original) in photos.withIndex()) {
            for (scale in listOf(0.75, 0.5, 0.35, 0.25, 0.12, 0.06)) {
                val d = Images.distance(original, Images.resized(original, scale))
                assertTrue(
                    "사진 $i 를 ${(scale * 100).toInt()}% 로 줄였더니 지문이 $d 비트 달라졌다",
                    d in 0..Strictness.SAME.hashLimit
                )
            }
        }
    }

    @Test
    fun `줄여서 다시 저장한 사진도 같은 사진이다`() {
        for ((i, original) in photos.withIndex()) {
            for (quality in listOf(0.9f, 0.6f, 0.35f, 0.2f)) {
                val copy = Images.recompressed(Images.resized(original, 0.5), quality)
                val d = Images.distance(original, copy)
                assertTrue(
                    "사진 $i 를 절반으로 줄여 화질 $quality 로 다시 저장했더니 $d 비트 달라졌다",
                    d in 0..Strictness.SAME.hashLimit
                )
            }
        }
    }

    @Test
    fun `스크린샷처럼 밋밋한 화면도 크기를 줄이면 같은 사진이다`() {
        for ((i, shot) in shots.withIndex()) {
            for (target in listOf(1600, 1080, 720, 480, 240)) {
                val scale = target.toDouble() / maxOf(shot.width, shot.height)
                if (scale >= 1.0) continue
                val small = Images.resized(shot, scale)
                assertTrue(
                    "스크린샷 $i 를 ${target}px 로 줄였더니 같은 사진으로 보지 않는다",
                    Similarity.alike(Images.photo(1, shot), Images.photo(2, small), Strictness.SAME)
                )
            }
        }
    }

    @Test
    fun `파일 이름은 판단에 끼어들지 않는다`() {
        val original = Images.naturalPhoto(42)
        val small = Images.resized(original, 0.4)
        val a = Images.photo(1, original).let {
            Photo(it.id, "휴가 첫날.jpg", "Camera", it.bytes, it.width, it.height,
                it.takenAt, it.addedAt, it.modifiedAt, it.hash, it.mask, it.color)
        }
        val b = Images.photo(2, small).let {
            Photo(it.id, "20190101_123456(1).png", "Download", it.bytes, it.width, it.height,
                it.takenAt, it.addedAt, it.modifiedAt, it.hash, it.mask, it.color)
        }
        assertTrue("이름이 달라도 같은 사진으로 묶여야 한다", Similarity.alike(a, b, Strictness.SAME))
    }

    @Test
    fun `서로 다른 사진은 갈라져 있다`() {
        for (i in photos.indices) {
            for (j in i + 1 until photos.size) {
                assertTrue(
                    "사진 $i 와 $j 는 서로 다른데 가장 넉넉한 기준에서 같다고 보았다",
                    !Similarity.alike(Images.photo(1, photos[i]), Images.photo(2, photos[j]), Strictness.LOOSE)
                )
            }
        }
    }

    @Test
    fun `구도가 같아도 색이 다르면 갈라진다`() {
        val original = Images.naturalPhoto(42)
        val sunset = Images.tinted(original, Color(255, 90, 0, 130))
        assertTrue(
            "색이 전혀 다른데 같은 사진으로 보았다",
            !Similarity.alike(Images.photo(1, original), Images.photo(2, sunset), Strictness.SAME)
        )
    }

    @Test
    fun `무늬가 없는 그림은 색으로 가른다`() {
        val logos = (1..4L).map { Images.plainLogo(it) }
        for (logo in logos) {
            assertTrue(
                "같은 로고의 작은 사본을 갈라놓았다",
                Similarity.alike(Images.photo(1, logo), Images.photo(2, Images.resized(logo, 0.25)), Strictness.SAME)
            )
        }
        for (i in logos.indices) {
            for (j in i + 1 until logos.size) {
                assertTrue(
                    "서로 다른 로고 $i, $j 를 같다고 보았다",
                    !Similarity.alike(Images.photo(1, logos[i]), Images.photo(2, logos[j]), Strictness.SAME)
                )
            }
        }
    }
}
