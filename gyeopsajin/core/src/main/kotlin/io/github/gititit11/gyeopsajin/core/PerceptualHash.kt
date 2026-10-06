package io.github.gititit11.gyeopsajin.core

import kotlin.math.cos

/**
 * 사진의 '생김새'를 64비트 숫자 하나로 줄인다.
 *
 * 파일 이름도, 촬영 시각도, 파일 크기도 보지 않는다. 오직 픽셀이 만드는 밝기의
 * 생김새만 본다. 그래서 이름을 바꾸거나 다시 저장한 사진도 같은 숫자가 나온다.
 *
 * 방법은 이렇다. 먼저 사진을 32x32 회색 그림으로 짓뭉갠다. 이때 가로세로 비율은
 * 일부러 무시하고 정사각형으로 늘린다 — 리사이즈는 비율을 지키므로, 정사각형으로
 * 늘려 놓으면 크기가 다른 같은 사진이 똑같은 모양이 된다. 그 다음 DCT 로 이
 * 그림을 '큰 무늬'부터 '잔무늬'까지 분해하고, 가장 큰 무늬 8x8 개만 남긴다.
 * 잔무늬는 리사이즈나 재압축으로 쉽게 뭉개지는 부분이라 버리는 편이 낫다.
 * 마지막으로 각 값이 중앙값보다 큰지 작은지만 1비트로 적는다. 밝기가 전체적으로
 * 오르내려도 '어디가 상대적으로 밝은가'는 그대로이므로 결과가 흔들리지 않는다.
 */
object PerceptualHash {

    /** DCT 에 넣기 전 사진을 줄이는 한 변 크기 */
    const val SIZE = 32

    /** 남길 저주파 계수의 한 변 (8x8 = 64비트) */
    const val LOW = 8

    /** cosTable[u][x] = cos((2x+1)·u·π / 2N) — 매번 다시 계산할 이유가 없다 */
    private val cosTable: Array<DoubleArray> = Array(SIZE) { u ->
        DoubleArray(SIZE) { x ->
            cos((2 * x + 1) * u * Math.PI / (2 * SIZE))
        }
    }

    /**
     * 지문과, 그 지문에서 믿어도 되는 자리.
     *
     * [bits] 의 한 비트는 "이 무늬가 중앙값보다 센가" 라는 질문의 답이다. 그런데
     * 값이 중앙값에 딱 붙어 있으면 그 답은 사실 동전 던지기에 가깝다. 사진을 조금만
     * 줄여도 뒤집힌다. [mask] 는 그런 자리를 0으로 적어, 비교할 때 아예 세지 않게 한다.
     *
     * 이것이 중요한 이유는 스크린샷이나 그림처럼 넓은 면이 한 색인 이미지 때문이다.
     * 그런 이미지는 잔무늬가 없어 계수 대부분이 0 근처에 몰리고, 지문의 3분의 2가
     * 동전 던지기가 된다. 그런 비트를 세면 같은 사진이 서른 비트 넘게 달라 보인다.
     */
    class Signature(val bits: Long, val mask: Long)

    /**
     * 32x32 회색 픽셀(0~255)을 받아 64비트 지문을 만든다.
     * 픽셀은 행 우선(row-major)으로 담겨 있어야 한다.
     */
    fun of(gray: IntArray): Long = toBits(coefficients(gray))

    /** 지문과 믿을 수 있는 자리를 함께 구한다 */
    fun analyze(gray: IntArray): Signature {
        val coef = coefficients(gray)
        val rest = coef.copyOfRange(1, coef.size).also { it.sort() }
        val median = rest[rest.size / 2]

        // '중앙값에서 얼마나 떨어졌는가' 를 재려면 자가 필요하다. 처음에는 가장 큰
        // 값과 가장 작은 값의 폭을 자로 삼았는데, 그러면 유난히 큰 계수 한둘이 자를
        // 늘려 버려 나머지 예순 개가 전부 '중앙값에 붙어 있다' 로 잘못 읽혔다.
        // 그림 두 장이 서로 달라도 남는 자리가 없어 똑같아 보이는 지경이 됐다.
        // 그래서 자를 계수들 자신의 흩어진 정도(중앙값과의 거리, 그 중앙값)로 바꾼다.
        // 이렇게 하면 값이 크든 작든 언제나 절반쯤은 믿을 수 있는 자리로 남는다.
        val deviations = DoubleArray(rest.size) { kotlin.math.abs(rest[it] - median) }
        deviations.sort()
        var scale = deviations[deviations.size / 2]
        if (scale <= 0.0) scale = deviations.average()
        if (scale <= 0.0) return Signature(toBits(coef), 0L)   // 완전히 한 색인 그림

        // 무늬가 거의 없는 그림 — 로고, 단색 배경 위의 도형 같은 것 — 은 지문으로
        // 말할 수 있는 것이 없다. 계수가 죄다 0 근처에 몰려 있어 어느 것이 중앙값보다
        // 큰지가 사실상 우연으로 정해지고, 같은 그림을 줄이기만 해도 지문 절반이
        // 뒤집힌다. 이런 그림은 지문을 포기하고(자리를 모두 0으로 두고) 색으로만
        // 판단하게 넘긴다. 실제로 이런 그림은 색이 아주 잘 갈라 준다.
        if (scale / kotlin.math.abs(coef[0]).coerceAtLeast(1.0) < PLAIN) return Signature(toBits(coef), 0L)

        var bits = 0L
        var mask = 0L
        for (i in coef.indices) {
            if (coef[i] > median) bits = bits or (1L shl i)
            if (kotlin.math.abs(coef[i] - median) >= SHAKY * scale) mask = mask or (1L shl i)
        }
        return Signature(bits, mask)
    }

    /** 흩어진 정도의 이 배수만큼도 중앙값에서 떨어지지 않은 자리는 믿지 않는다 */
    const val SHAKY = 0.35

    /**
     * 무늬가 이보다 적으면 지문을 쓰지 않는다.
     * 실제로 재어 보면 사진과 스크린샷은 0.003 위, 로고나 아이콘은 0.002 아래로
     * 서로 겹치지 않게 갈라졌다. 그 사이에 선을 그었다.
     */
    const val PLAIN = 0.0025

    /**
     * 두 지문이 얼마나 다른지를 0~64 로. 양쪽 모두 믿을 수 있는 자리만 견주고,
     * 그 자리 수가 적으면 64비트를 다 쓴 것처럼 비율을 맞춰 돌려준다.
     *
     * 믿을 수 있는 자리가 너무 적으면(그림 두 장이 모두 밋밋하면) -1 을 돌려준다.
     * 이때는 지문으로 답할 수 없다는 뜻이며, 색으로 판단해야 한다.
     */
    fun distance(a: Signature, b: Signature): Int {
        val common = a.mask and b.mask
        val usable = java.lang.Long.bitCount(common)
        if (usable < MIN_USABLE) return -1
        val differ = java.lang.Long.bitCount((a.bits xor b.bits) and common)
        return (differ * 64 + usable / 2) / usable
    }

    /** 이보다 적은 자리로는 같고 다름을 말하지 않는다 */
    const val MIN_USABLE = 12

    /** 2차원 DCT 의 왼쪽 위 8x8 계수 */
    fun coefficients(gray: IntArray): DoubleArray {
        require(gray.size == SIZE * SIZE) {
            "회색 픽셀은 ${SIZE * SIZE}개여야 한다 (받은 것: ${gray.size})"
        }

        // 2차원 DCT 의 왼쪽 위 8x8 만 필요하다. 전부 계산하면 32x32x32x2 번을 곱해야
        // 하지만, 세로 방향을 먼저 8줄까지만 접어 두면 그 1/8 로 끝난다.
        val partial = Array(SIZE) { DoubleArray(LOW) }
        for (x in 0 until SIZE) {
            val row = x * SIZE
            for (v in 0 until LOW) {
                var sum = 0.0
                val cv = cosTable[v]
                for (y in 0 until SIZE) sum += gray[row + y] * cv[y]
                partial[x][v] = sum
            }
        }

        val coef = DoubleArray(LOW * LOW)
        for (u in 0 until LOW) {
            val cu = cosTable[u]
            for (v in 0 until LOW) {
                var sum = 0.0
                for (x in 0 until SIZE) sum += cu[x] * partial[x][v]
                coef[u * LOW + v] = sum
            }
        }
        return coef
    }

    private fun toBits(coef: DoubleArray): Long {
        // 맨 앞 계수(DC)는 사진 전체의 평균 밝기라서 언제나 압도적으로 크다.
        // 중앙값 계산에 끼우면 기준이 밀려나므로 빼고 구한다.
        val rest = coef.copyOfRange(1, coef.size)
        rest.sort()
        val median = rest[rest.size / 2]

        var bits = 0L
        for (i in coef.indices) {
            if (coef[i] > median) bits = bits or (1L shl i)
        }
        return bits
    }

    /**
     * 각 비트가 중앙값에서 얼마나 떨어져 있는지를 0~1 로. 0에 가까운 비트는
     * 사진이 조금만 달라져도 뒤집히는, 믿을 수 없는 비트다. 진단용이다.
     */
    fun margins(gray: IntArray): DoubleArray {
        val coef = coefficients(gray)
        val rest = coef.copyOfRange(1, coef.size).also { it.sort() }
        val median = rest[rest.size / 2]
        val spread = (rest.last() - rest.first()).let { if (it == 0.0) 1.0 else it }
        return DoubleArray(coef.size) { kotlin.math.abs(coef[it] - median) / spread }
    }

    /** 두 지문이 몇 비트나 다른지. 0이면 생김새가 같다고 본다. */
    fun distance(a: Long, b: Long): Int = java.lang.Long.bitCount(a xor b)
}
