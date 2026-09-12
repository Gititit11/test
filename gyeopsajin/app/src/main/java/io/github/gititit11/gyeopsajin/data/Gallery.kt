package io.github.gititit11.gyeopsajin.data

import android.content.ContentResolver
import android.content.ContentUris
import android.net.Uri
import android.provider.MediaStore

/** 갤러리에서 읽어 온, 아직 생김새는 모르는 사진 한 장 */
class GalleryItem(
    val id: Long,
    val name: String,
    val album: String,
    val bytes: Long,
    val width: Int,
    val height: Int,
    val takenAt: Long,
    val addedAt: Long,
    val modifiedAt: Long,
) {
    val uri: Uri get() = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
}

/**
 * 기기의 사진 목록을 읽는다.
 *
 * 읽기만 한다. 이 앱에는 사진을 고치거나 옮기는 길이 아예 없고, 지우는 것도
 * 안드로이드가 띄우는 확인창을 거쳐야만 일어난다.
 */
object Gallery {

    private val COLUMNS = arrayOf(
        MediaStore.Images.Media._ID,
        MediaStore.Images.Media.DISPLAY_NAME,
        MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
        MediaStore.Images.Media.SIZE,
        MediaStore.Images.Media.WIDTH,
        MediaStore.Images.Media.HEIGHT,
        MediaStore.Images.Media.DATE_TAKEN,
        MediaStore.Images.Media.DATE_ADDED,
        MediaStore.Images.Media.DATE_MODIFIED,
    )

    /** 사진 번호로 갤러리 주소를 만든다 */
    fun uriOf(id: Long): Uri =
        ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)

    fun list(resolver: ContentResolver): List<GalleryItem> {
        val out = ArrayList<GalleryItem>(512)
        resolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            COLUMNS,
            // 휴지통에 넣은 사진은 이미 사용자가 정리한 것이므로 보지 않는다
            "${MediaStore.Images.Media.SIZE} > 0",
            null,
            "${MediaStore.Images.Media.DATE_ADDED} DESC",
        )?.use { c ->
            val id = c.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val name = c.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
            val album = c.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)
            val size = c.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE)
            val w = c.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH)
            val h = c.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT)
            val taken = c.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_TAKEN)
            val added = c.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
            val modified = c.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_MODIFIED)
            while (c.moveToNext()) {
                out.add(
                    GalleryItem(
                        id = c.getLong(id),
                        name = c.getString(name) ?: "",
                        album = c.getString(album) ?: "",
                        bytes = c.getLong(size),
                        width = c.getInt(w),
                        height = c.getInt(h),
                        takenAt = if (c.isNull(taken)) 0L else c.getLong(taken),
                        addedAt = c.getLong(added),
                        modifiedAt = c.getLong(modified),
                    )
                )
            }
        }
        return out
    }
}
