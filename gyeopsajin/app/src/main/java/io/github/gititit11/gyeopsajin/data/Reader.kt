package io.github.gititit11.gyeopsajin.data

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import io.github.gititit11.gyeopsajin.core.Fingerprint

/**
 * 사진 한 장을 열어 지문과 색 쪽지를 뽑는다.
 *
 * 사진을 통째로 메모리에 올리면 한 장에 수십 MB 가 든다. 다행히 지문을 만드는 데
 * 필요한 것은 32x32 로 줄인 그림뿐이므로, 디코더에게 미리 몇 분의 일로 줄여 달라고
 * 부탁한다. 다만 너무 작게 받아 오면 줄이는 과정에서 그림이 뭉개져 지문이 흔들리므로,
 * 짧은 변이 256픽셀 아래로 내려가지 않는 선에서 멈춘다.
 */
object Reader {

    private const val ENOUGH = 256

    fun fingerprint(resolver: ContentResolver, uri: Uri): Fingerprint.Result? {
        var bitmap: Bitmap? = null
        return try {
            val source = ImageDecoder.createSource(resolver, uri)
            bitmap = ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                val shortest = minOf(info.size.width, info.size.height)
                var sample = 1
                while (shortest / (sample * 2) >= ENOUGH) sample *= 2
                decoder.setTargetSampleSize(sample)
                // 하드웨어 비트맵은 픽셀을 읽을 수 없다. 우리는 픽셀을 봐야 한다.
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                decoder.isMutableRequired = false
                decoder.setOnPartialImageListener { true }   // 일부가 깨진 사진도 읽을 수 있는 데까지
            }
            val w = bitmap.width
            val h = bitmap.height
            if (w <= 0 || h <= 0) return null
            val pixels = IntArray(w * h)
            bitmap.getPixels(pixels, 0, w, 0, 0, w, h)
            Fingerprint.of(pixels, w, h)
        } catch (e: Throwable) {
            // 못 읽는 사진 한 장 때문에 정리가 통째로 멈추면 안 된다
            null
        } finally {
            bitmap?.recycle()
        }
    }
}
