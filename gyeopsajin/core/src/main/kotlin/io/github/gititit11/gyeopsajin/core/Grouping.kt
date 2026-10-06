package io.github.gititit11.gyeopsajin.core

/**
 * 사진들을 같은 것끼리 묶는다.
 *
 * 모든 짝을 한 번씩 견주어 본다. 사진 1만 장이면 5천만 번인데, 한 번의 비교가
 * 64비트 정수 하나를 XOR 하고 1의 개수를 세는 것뿐이라 실제로는 순식간에 끝난다.
 * 영리한 색인을 두어 후보를 줄일 수도 있지만, 그렇게 하면 임계값에 따라 놓치는
 * 짝이 생긴다. 여기서는 하나도 놓치지 않는 쪽을 택했다.
 *
 * 묶는 방식은 서로소 집합(union-find)이다. A와 B가 같고 B와 C가 같으면 셋은
 * 한 무더기가 된다. 같은 사진을 크기만 줄여 여러 번 저장한 경우 — 이 앱이 가장
 * 많이 만나게 될 경우 — 가 정확히 이 모양이다.
 */
object Grouping {

    /**
     * @param onProgress 몇 장까지 견주었는지 알린다. 화면의 진행 막대를 위한 것이다.
     * @param cancelled  true 를 돌려주면 하던 일을 멈추고 빈 결과를 낸다.
     */
    fun group(
        photos: List<Photo>,
        level: Strictness,
        onProgress: (done: Int, total: Int) -> Unit = { _, _ -> },
        cancelled: () -> Boolean = { false },
    ): List<PhotoGroup> {
        val n = photos.size
        if (n < 2) return emptyList()

        // 비교에 쓰는 값만 따로 꺼내 둔다. 배열을 훑는 쪽이 객체를 따라다니는 것보다 빠르다.
        val hashes = LongArray(n) { photos[it].hash }
        val masks = LongArray(n) { photos[it].mask }
        val colors = Array(n) { photos[it].color }
        val parent = IntArray(n) { it }
        val rank = IntArray(n)

        fun find(x: Int): Int {
            var root = x
            while (parent[root] != root) root = parent[root]
            var cur = x
            while (parent[cur] != root) {      // 지나온 길을 곧바로 뿌리에 이어 둔다
                val next = parent[cur]
                parent[cur] = root
                cur = next
            }
            return root
        }

        fun union(a: Int, b: Int) {
            val ra = find(a); val rb = find(b)
            if (ra == rb) return
            when {
                rank[ra] < rank[rb] -> parent[ra] = rb
                rank[ra] > rank[rb] -> parent[rb] = ra
                else -> { parent[rb] = ra; rank[ra]++ }
            }
        }

        for (i in 0 until n) {
            if (cancelled()) return emptyList()
            val hi = hashes[i]; val mi = masks[i]; val ci = colors[i]
            for (j in i + 1 until n) {
                // 이미 한 무더기인 짝은 다시 견주어 볼 이유가 없다
                if (find(i) == find(j)) continue
                if (Similarity.alike(hi, mi, ci, hashes[j], masks[j], colors[j], level)) union(i, j)
            }
            onProgress(i + 1, n)
        }

        val buckets = HashMap<Int, MutableList<Photo>>()
        for (i in 0 until n) {
            buckets.getOrPut(find(i)) { ArrayList(2) }.add(photos[i])
        }

        return buckets.values
            .filter { it.size > 1 }          // 혼자인 사진은 정리할 것이 없다
            .map { PhotoGroup(it) }
            .sortedByDescending { it.reclaimableBytes }
    }
}
