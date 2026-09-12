package io.github.gititit11.gyeopsajin.ui

import org.junit.Assert.assertEquals
import org.junit.Test

/** 용량은 이 앱이 사용자에게 건네는 가장 중요한 숫자다. 틀리게 적으면 안 된다. */
class FormatTest {

    @Test
    fun `용량을 사람이 읽는 말로 적는다`() {
        assertEquals("0B", formatBytes(0))
        assertEquals("820B", formatBytes(820))
        assertEquals("4KB", formatBytes(4_096))
        assertEquals("2.4MB", formatBytes(2_400_000))
        assertEquals("340MB", formatBytes(340_000_000))
        assertEquals("1.2GB", formatBytes(1_234_000_000))
    }

    @Test
    fun `화소 수를 사람이 읽는 말로 적는다`() {
        assertEquals("1.2천만 화소", formatPixels(3024, 4032))
        assertEquals("192만 화소", formatPixels(1200, 1600))
        assertEquals("252만 화소", formatPixels(1080, 2340))
        assertEquals("6만 화소", formatPixels(250, 250))
    }
}
