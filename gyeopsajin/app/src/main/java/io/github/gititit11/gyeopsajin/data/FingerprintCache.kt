package io.github.gititit11.gyeopsajin.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import io.github.gititit11.gyeopsajin.core.Fingerprint

/**
 * 한 번 읽어 본 사진의 지문을 적어 둔다.
 *
 * 사진 만 장을 처음 훑는 데에는 몇 분이 걸리지만, 두 번째부터는 새로 들어온 사진만
 * 읽으면 된다. 사진이 그대로인지는 파일 크기와 고친 시각으로 가늠한다 — 파일 이름은
 * 여기서도 믿지 않는다. 이름은 바뀌어도 사진은 그대로일 수 있고, 그 반대도 된다.
 */
class FingerprintCache(context: Context) : SQLiteOpenHelper(context, NAME, null, VERSION) {

    class Entry(val hash: Long, val mask: Long, val color: ByteArray)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE fingerprint(
                media_id INTEGER PRIMARY KEY,
                modified INTEGER NOT NULL,
                bytes    INTEGER NOT NULL,
                hash     INTEGER NOT NULL,
                mask     INTEGER NOT NULL,
                color    BLOB    NOT NULL
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {
        // 지문 만드는 방법이 바뀌면 예전 지문은 쓸모가 없다. 지우고 다시 읽는다.
        db.execSQL("DROP TABLE IF EXISTS fingerprint")
        onCreate(db)
    }

    /** 아직 그대로인 사진들의 지문만 돌려준다 */
    fun load(items: List<GalleryItem>): Map<Long, Entry> {
        val stillThere = HashMap<Long, GalleryItem>(items.size)
        for (i in items) stillThere[i.id] = i
        val out = HashMap<Long, Entry>(items.size)
        readableDatabase.query(
            "fingerprint", arrayOf("media_id", "modified", "bytes", "hash", "mask", "color"),
            null, null, null, null, null
        ).use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(0)
                val item = stillThere[id] ?: continue
                if (item.modifiedAt != c.getLong(1) || item.bytes != c.getLong(2)) continue
                val color = c.getBlob(5)
                if (color == null || color.size != io.github.gititit11.gyeopsajin.core.ColorSignature.LENGTH) continue
                out[id] = Entry(c.getLong(3), c.getLong(4), color)
            }
        }
        return out
    }

    fun put(item: GalleryItem, result: Fingerprint.Result) {
        val values = ContentValues(6).apply {
            put("media_id", item.id)
            put("modified", item.modifiedAt)
            put("bytes", item.bytes)
            put("hash", result.hash)
            put("mask", result.mask)
            put("color", result.color)
        }
        writableDatabase.insertWithOnConflict("fingerprint", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    /** 여러 장을 한 묶음으로 적는다. 한 장씩 적으면 디스크를 그만큼 여러 번 건드린다. */
    fun putAll(entries: List<Pair<GalleryItem, Fingerprint.Result>>) {
        if (entries.isEmpty()) return
        val db = writableDatabase
        db.beginTransaction()
        try {
            for ((item, result) in entries) put(item, result)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    /** 기기에서 사라진 사진의 지문을 치운다 */
    fun forgetMissing(items: List<GalleryItem>) {
        val alive = HashSet<Long>(items.size)
        for (i in items) alive.add(i.id)
        val db = writableDatabase
        val gone = ArrayList<Long>()
        db.query("fingerprint", arrayOf("media_id"), null, null, null, null, null).use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(0)
                if (id !in alive) gone.add(id)
            }
        }
        if (gone.isEmpty()) return
        db.beginTransaction()
        try {
            for (id in gone) db.delete("fingerprint", "media_id = ?", arrayOf(id.toString()))
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun clear() {
        writableDatabase.delete("fingerprint", null, null)
    }

    fun count(): Long =
        android.database.DatabaseUtils.queryNumEntries(readableDatabase, "fingerprint")

    private companion object {
        const val NAME = "fingerprints.db"

        /**
         * 지문 만드는 방식을 바꾸면 이 번호를 올린다. 그래야 예전 방식으로 적어 둔
         * 지문과 새 지문이 섞여 엉뚱한 사진이 묶이는 일이 없다.
         */
        const val VERSION = 1
    }
}
