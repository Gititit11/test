package io.github.gititit11.gyeopsajin.core

/**
 * 사진 한 장에 대해 우리가 아는 것.
 *
 * [name] 은 화면에 보여 주기만 할 뿐 같고 다름을 판단하는 데 쓰지 않는다.
 * 같은 사진이 이름만 다르게 저장되는 일은 흔하고, 다른 사진이 같은 이름을
 * 가지는 일도 흔하기 때문이다.
 */
class Photo(
    val id: Long,
    val name: String,
    val album: String,
    /** 파일 크기(바이트) */
    val bytes: Long,
    val width: Int,
    val height: Int,
    /** 찍은 시각. 모르면 0 */
    val takenAt: Long,
    /** 기기에 들어온 시각(초) */
    val addedAt: Long,
    val modifiedAt: Long,
    val hash: Long,
    /** 지문에서 믿어도 되는 자리 (PerceptualHash.Signature 참고) */
    val mask: Long,
    val color: ByteArray,
) {
    val signature: PerceptualHash.Signature get() = PerceptualHash.Signature(hash, mask)

    val pixels: Long get() = width.toLong() * height.toLong()

    /** 찍은 시각을 모르면 기기에 들어온 시각으로 대신한다 */
    val whenTaken: Long get() = if (takenAt > 0) takenAt else addedAt * 1000L
}

/**
 * 같은 사진으로 묶인 한 무더기.
 *
 * [keeper] 는 '이걸 남기면 되겠다' 는 앱의 제안일 뿐이다. 화소가 가장 많고,
 * 같다면 파일이 큰 쪽 — 즉 가장 원본에 가까워 보이는 한 장을 고른다.
 * 고르는 것도 지우는 것도 결국 사람이 한다.
 */
class PhotoGroup(photos: List<Photo>) {

    /** 남길 후보를 맨 앞에 두고, 나머지는 화질이 좋은 순으로 줄 세운다 */
    val photos: List<Photo> = photos.sortedWith(
        compareByDescending<Photo> { it.pixels }
            .thenByDescending { it.bytes }
            .thenBy { it.whenTaken }
    )

    val keeper: Photo get() = photos.first()

    val size: Int get() = photos.size

    /** 무더기 전체가 차지하는 용량 */
    val totalBytes: Long = photos.sumOf { it.bytes }

    /** 한 장만 남긴다면 비는 용량 */
    val reclaimableBytes: Long = totalBytes - keeper.bytes

    /** 화소 수까지 똑같다면 크기만 줄인 사본이 아니라 아예 같은 파일일 수 있다 */
    fun looksIdentical(a: Photo, b: Photo): Boolean =
        a.pixels == b.pixels && a.bytes == b.bytes && a.hash == b.hash
}
