package io.github.gititit11.gyeopsajin.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FingerprintTest {

    @Test
    fun `줄이는 단계를 몇 번 거치든 같은 자리에 닿는다`() {
        // 큰 사진을 한 번에 32x32 로 줄이나, 중간 크기를 거쳐 줄이나 결과가 같아야
        // 기기에서 메모리를 아끼려고 미리 줄여 받아도 안심할 수 있다.
        val img = Images.naturalPhoto(9, 2048, 1536)   // 미리 줄여 받는 경로를 타도록 크게 만든다
        val direct = IntArray(img.width * img.height)
            .also { img.getRGB(0, 0, img.width, img.height, it, 0, img.width) }
            .let { Fingerprint.of(it, img.width, img.height) }
        val staged = Images.fingerprint(img)
        assertTrue(
            "한 번에 줄인 것과 나눠 줄인 것이 ${PerceptualHash.distance(
                PerceptualHash.Signature(direct.hash, direct.mask),
                PerceptualHash.Signature(staged.hash, staged.mask)
            )} 비트 다르다",
            Similarity.alike(
                Photo(1, "a", "", 1, 1, 1, 0, 0, 0, direct.hash, direct.mask, direct.color),
                Photo(2, "b", "", 1, 1, 1, 0, 0, 0, staged.hash, staged.mask, staged.color),
                Strictness.SAME,
            )
        )
    }

    @Test
    fun `가로세로 비율을 버리고 정사각형으로 편다`() {
        val wide = IntArray(100 * 10) { 0xFF000000.toInt() }
        val square = Fingerprint.toSquare(wide, 100, 10)
        assertEquals(Fingerprint.SIZE * Fingerprint.SIZE, square.size)
    }

    @Test
    fun `투명한 부분은 흰 종이 위에 올린 것으로 친다`() {
        val transparent = IntArray(4 * 4) { 0x00000000 }     // 완전히 투명한 검정
        val square = Fingerprint.toSquare(transparent, 4, 4, 4)
        for (p in square) {
            assertEquals("투명한 곳은 흰색이어야 한다", 0xFFFFFFFF.toInt(), p)
        }
    }

    @Test
    fun `같은 그림이면 지문도 같다`() {
        val img = Images.naturalPhoto(11)
        assertEquals(Images.fingerprint(img).hash, Images.fingerprint(img).hash)
        assertEquals(Images.fingerprint(img).mask, Images.fingerprint(img).mask)
    }

    @Test
    fun `믿을 수 있는 자리가 없으면 지문으로 답하지 않는다`() {
        val flat = PerceptualHash.Signature(0L, 0L)
        assertEquals(-1, PerceptualHash.distance(flat, flat))
    }

    @Test
    fun `한 색으로만 된 그림도 넘어지지 않는다`() {
        val gray = IntArray(Fingerprint.SIZE * Fingerprint.SIZE) { 128 }
        val sig = PerceptualHash.analyze(gray)
        assertEquals("무늬가 없으니 믿을 수 있는 자리도 없다", 0L, sig.mask)
    }
}
