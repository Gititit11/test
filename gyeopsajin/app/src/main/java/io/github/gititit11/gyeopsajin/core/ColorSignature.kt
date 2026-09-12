package io.github.gititit11.gyeopsajin.core

import kotlin.math.abs

/**
 * 사진을 4x4 칸으로 나눈 뒤 각 칸의 평균 색을 적어 둔 48바이트짜리 쪽지.
 *
 * 지문(PerceptualHash)만으로도 대개 충분하지만, 지문은 밝기만 보기 때문에
 * 구도가 닮은 전혀 다른 사진 — 이를테면 같은 자리에서 찍은 낮 사진과 노을 사진 —
 * 이 우연히 가까운 값을 가질 때가 있다. 색까지 같이 보면 그런 경우를 걸러낸다.
 * 리사이즈는 색을 거의 바꾸지 않으므로, 같은 사진을 갈라놓지는 않는다.
 */
object ColorSignature {

    /** 한 변을 몇 칸으로 나눌지 */
    const val CELLS = 4

    /** 쪽지 길이: 4x4 칸 x RGB 3색 */
    const val LENGTH = CELLS * CELLS * 3

    /**
     * 32x32 로 줄여 둔 ARGB 픽셀에서 쪽지를 만든다.
     * 저장 공간을 아끼려고 0~255 를 그대로 한 바이트에 담는다(부호는 무시).
     */
    fun of(argb: IntArray, size: Int = PerceptualHash.SIZE): ByteArray {
        require(argb.size == size * size) { "픽셀 수가 ${size}x${size} 와 맞지 않는다" }
        val step = size / CELLS
        val out = ByteArray(LENGTH)
        var at = 0
        for (cy in 0 until CELLS) {
            for (cx in 0 until CELLS) {
                var r = 0L; var g = 0L; var b = 0L
                for (y in cy * step until (cy + 1) * step) {
                    val row = y * size
                    for (x in cx * step until (cx + 1) * step) {
                        val p = argb[row + x]
                        r += (p shr 16) and 0xFF
                        g += (p shr 8) and 0xFF
                        b += p and 0xFF
                    }
                }
                val n = (step * step).toLong()
                out[at++] = (r / n).toInt().toByte()
                out[at++] = (g / n).toInt().toByte()
                out[at++] = (b / n).toInt().toByte()
            }
        }
        return out
    }

    /**
     * 두 쪽지가 얼마나 다른지를 0~255 로 돌려준다. 칸마다의 색 차이를 평균한 값이다.
     * 길이가 다르거나 비어 있으면 비교를 포기하고 0(다르지 않음)으로 답한다 —
     * 색은 어디까지나 보조 기준이므로, 없다고 해서 같은 사진을 갈라놓으면 안 된다.
     */
    fun distance(a: ByteArray, b: ByteArray): Int {
        if (a.size != b.size || a.isEmpty()) return 0
        var sum = 0
        for (i in a.indices) {
            sum += abs((a[i].toInt() and 0xFF) - (b[i].toInt() and 0xFF))
        }
        return sum / a.size
    }
}
