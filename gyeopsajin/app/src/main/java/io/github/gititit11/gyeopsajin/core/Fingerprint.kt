package io.github.gititit11.gyeopsajin.core

/**
 * 사진의 픽셀을 지문과 색 쪽지로 바꾸는 유일한 통로.
 *
 * 여기가 흔들리면 그 뒤의 모든 판단이 흔들린다. 특히 중요한 것은 사진을 32x32 로
 * 줄이는 방식이다. 흔히 쓰는 이중선형(bilinear) 축소는 줄어든 픽셀 하나마다
 * 원본의 이웃 네 점만 본다. 3000픽셀짜리 사진을 32픽셀로 줄이면 원본의 거의 모든
 * 픽셀을 건너뛰게 되고, 어느 점이 하필 걸리느냐에 따라 결과가 달라진다. 사진처럼
 * 부드러운 그림은 그래도 버티지만, 스크린샷이나 그림처럼 경계가 또렷한 이미지는
 * 크기를 조금만 바꿔도 전혀 다른 지문이 나왔다.
 *
 * 그래서 여기서는 줄어든 픽셀 하나가 원본에서 맡은 영역 전체의 평균을 갖게 한다.
 * 한 점도 버리지 않으므로, 같은 사진이라면 원본이든 사본이든 같은 곳에 닿는다.
 */
object Fingerprint {

    /** 지문을 만들기 전 사진을 줄이는 한 변 */
    const val SIZE = PerceptualHash.SIZE

    class Result(val hash: Long, val mask: Long, val color: ByteArray)

    /**
     * ARGB 픽셀 배열에서 지문과 색 쪽지를 만든다.
     *
     * [argb] 는 행 우선이며 [w] x [h] 여야 한다. 원본 그대로여도 되고, 메모리를
     * 아끼려고 미리 몇 배 줄여 놓은 것이어도 된다 — 어느 쪽이든 같은 결과에 모인다.
     */
    fun of(argb: IntArray, w: Int, h: Int): Result {
        val square = toSquare(argb, w, h)
        val sig = PerceptualHash.analyze(luma(square))
        return Result(sig.bits, sig.mask, ColorSignature.of(square, SIZE))
    }

    /**
     * 어떤 크기의 그림이든 가로세로 비율을 버리고 정사각형 [size] x [size] 로 줄인다.
     * 비율을 버리는 것은 일부러다. 리사이즈는 비율을 지키므로, 정사각형으로 펴 두면
     * 크기가 다른 같은 사진이 같은 모양이 된다.
     *
     * 투명한 부분은 흰 종이 위에 올려놓은 것으로 친다. 투명도를 그대로 두면 안 보이는
     * 부분이 검게 잡혀, 배경이 비치는 PNG 가 크기에 따라 다른 지문을 갖게 된다.
     */
    fun toSquare(argb: IntArray, w: Int, h: Int, size: Int = SIZE): IntArray {
        require(w > 0 && h > 0 && argb.size >= w * h) { "픽셀 배열이 ${w}x${h} 와 맞지 않는다" }
        val out = IntArray(size * size)
        for (oy in 0 until size) {
            val y0 = (oy.toLong() * h / size).toInt()
            val y1 = (((oy + 1).toLong() * h / size).toInt()).coerceAtLeast(y0 + 1).coerceAtMost(h)
            for (ox in 0 until size) {
                val x0 = (ox.toLong() * w / size).toInt()
                val x1 = (((ox + 1).toLong() * w / size).toInt()).coerceAtLeast(x0 + 1).coerceAtMost(w)
                var r = 0L; var g = 0L; var b = 0L; var n = 0L
                for (y in y0 until y1) {
                    val row = y * w
                    for (x in x0 until x1) {
                        val p = argb[row + x]
                        val a = (p ushr 24) and 0xFF
                        var pr = (p shr 16) and 0xFF
                        var pg = (p shr 8) and 0xFF
                        var pb = p and 0xFF
                        if (a != 255) {           // 흰 종이 위에 올린다
                            pr = (pr * a + 255 * (255 - a)) / 255
                            pg = (pg * a + 255 * (255 - a)) / 255
                            pb = (pb * a + 255 * (255 - a)) / 255
                        }
                        r += pr; g += pg; b += pb; n++
                    }
                }
                out[oy * size + ox] =
                    (0xFF shl 24) or (((r / n).toInt()) shl 16) or (((g / n).toInt()) shl 8) or ((b / n).toInt())
            }
        }
        return out
    }

    /** 색을 밝기 하나로 접는다. 사람 눈이 초록에 가장 민감한 것을 반영한 흔한 비율이다. */
    fun luma(argb: IntArray): IntArray = IntArray(argb.size) { i ->
        val p = argb[i]
        (77 * ((p shr 16) and 0xFF) + 150 * ((p shr 8) and 0xFF) + 29 * (p and 0xFF)) shr 8
    }
}
