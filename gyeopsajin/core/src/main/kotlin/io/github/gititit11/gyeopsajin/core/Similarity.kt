package io.github.gititit11.gyeopsajin.core

/**
 * 어디까지를 '같은 사진' 으로 볼지.
 *
 * 리사이즈한 사진을 같은 사진으로 보는 것은 세 단계 모두 마찬가지다.
 * 달라지는 것은 그 바깥 — 연달아 찍은 사진이나 같은 장면의 다른 컷까지
 * 한 무더기로 볼 것인지다.
 */
enum class Strictness(
    val label: String,
    val explain: String,
    /** 지문이 이 비트 수까지 달라도 같은 사진으로 본다 */
    val hashLimit: Int,
    /** 색이 이만큼까지 달라도 같은 사진으로 본다 */
    val colorLimit: Int,
) {
    SAME(
        "같은 사진만",
        "크기만 다른 사본, 다시 저장한 사본처럼 사실상 같은 사진만 묶어요.",
        hashLimit = 6,
        colorLimit = 12,
    ),
    SIMILAR(
        "닮은 사진까지",
        "같은 사진과, 연달아 찍어 거의 구별되지 않는 사진까지 묶어요.",
        hashLimit = 10,
        colorLimit = 22,
    ),
    LOOSE(
        "넉넉하게",
        "같은 장면을 찍은 사진까지 폭넓게 묶어요. 다른 사진이 섞일 수 있어요.",
        hashLimit = 14,
        colorLimit = 36,
    );
}

object Similarity {

    /**
     * 무늬가 없어 색으로만 판단할 때의 상한. 재어 보면 같은 로고의 크기만 다른
     * 사본끼리는 색 거리가 0~2, 서로 다른 로고끼리는 10 이상으로 벌어졌다.
     * 넉넉한 기준을 골랐더라도 이 선은 넘지 않는다.
     */
    const val PLAIN_COLOR_LIMIT = 6

    /**
     * 두 사진을 같은 사진으로 볼지 판단한다.
     *
     * 생김새(지문)가 먼저다. 지문이 멀면 색이 아무리 같아도 다른 사진이다.
     * 지문이 가까울 때만 색을 확인해, 구도만 닮은 남남을 갈라 놓는다.
     */
    fun alike(a: Photo, b: Photo, level: Strictness): Boolean =
        alike(a.hash, a.mask, a.color, b.hash, b.mask, b.color, level)

    /**
     * 무더기를 지을 때는 사진 수만큼의 제곱 번 불린다. 객체를 만들지 않도록
     * 값만 받는 쪽을 따로 둔다.
     */
    fun alike(
        hashA: Long, maskA: Long, colorA: ByteArray,
        hashB: Long, maskB: Long, colorB: ByteArray,
        level: Strictness,
    ): Boolean {
        val common = maskA and maskB
        val usable = java.lang.Long.bitCount(common)
        if (usable < PerceptualHash.MIN_USABLE) {
            // 둘 중 하나라도 무늬가 없어 지문으로 답할 수 없다. 이럴 때까지 같다고
            // 우겨 버리면 흰 종이를 찍은 사진이 죄다 한 무더기가 된다. 색만 보는
            // 만큼 훨씬 깐깐한 잣대를 쓴다.
            return ColorSignature.distance(colorA, colorB) <= minOf(level.colorLimit / 3, PLAIN_COLOR_LIMIT)
        }
        val differ = java.lang.Long.bitCount((hashA xor hashB) and common)
        if ((differ * 64 + usable / 2) / usable > level.hashLimit) return false
        return ColorSignature.distance(colorA, colorB) <= level.colorLimit
    }

    /**
     * 얼마나 닮았는지를 0~100 으로. 화면에서 "97% 닮음" 처럼 보여 주기 위한 값이며
     * 판단에는 쓰지 않는다.
     */
    fun percent(a: Photo, b: Photo): Int {
        val d = PerceptualHash.distance(a.signature, b.signature)
        if (d < 0) return 100 - ColorSignature.distance(a.color, b.color).coerceAtMost(100)
        return ((64 - d) * 100 / 64).coerceIn(0, 100)
    }
}
