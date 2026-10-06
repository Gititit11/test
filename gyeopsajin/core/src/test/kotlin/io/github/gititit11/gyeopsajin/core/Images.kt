package io.github.gititit11.gyeopsajin.core

import java.awt.Color
import java.awt.GradientPaint
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.Random
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam

/**
 * 검사에 쓸 그림을 만든다.
 *
 * 진짜 사진을 저장소에 넣어 두는 대신 만들어 쓴다. 검사가 어떤 사진을 넣느냐에
 * 따라 들쭉날쭉해지지 않고, 씨앗만 같으면 언제 어디서 돌려도 같은 그림이 나온다.
 */
object Images {

    /** 기기에서 하는 것과 같은 전처리를 거쳐 지문을 만든다 */
    fun fingerprint(img: BufferedImage): Fingerprint.Result {
        var src = img
        // 기기 쪽 디코더가 하는 '2의 거듭제곱 축소' 를 흉내 낸다
        var sample = 1
        while (minOf(src.width, src.height) / (sample * 2) >= 256) sample *= 2
        if (sample > 1) src = scaled(src, src.width / sample, src.height / sample)
        val argb = IntArray(src.width * src.height)
        src.getRGB(0, 0, src.width, src.height, argb, 0, src.width)
        return Fingerprint.of(argb, src.width, src.height)
    }

    fun signature(img: BufferedImage): PerceptualHash.Signature =
        fingerprint(img).let { PerceptualHash.Signature(it.hash, it.mask) }

    fun distance(a: BufferedImage, b: BufferedImage): Int =
        PerceptualHash.distance(signature(a), signature(b))

    fun photo(id: Long, img: BufferedImage, bytes: Long = 4_000_000): Photo {
        val f = fingerprint(img)
        return Photo(
            id = id, name = "IMG_$id.jpg", album = "Camera", bytes = bytes,
            width = img.width, height = img.height, takenAt = 0L, addedAt = id,
            modifiedAt = id, hash = f.hash, mask = f.mask, color = f.color,
        )
    }

    /**
     * 자연 사진 비슷하게.
     *
     * 사진의 무늬는 대부분 '큰 덩어리' 에 있다. 작은 점을 아무리 많이 뿌려도 32x32
     * 로 줄이는 순간 평균으로 뭉개져 단색이 되어 버린다. 그래서 8x8 짜리 색 격자를
     * 흐릿하게 늘려 큰 덩어리를 먼저 만들고, 그 위에 물체 몇 개와 잡티를 얹는다.
     */
    fun naturalPhoto(seed: Long, w: Int = 1200, h: Int = 1600): BufferedImage {
        val r = Random(seed)
        val coarse = BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB)
        for (y in 0 until 8) {
            for (x in 0 until 8) {
                coarse.setRGB(x, y, Color(r.nextInt(256), r.nextInt(256), r.nextInt(256)).rgb)
            }
        }
        val img = BufferedImage(w, h, BufferedImage.TYPE_INT_RGB)
        val g = img.createGraphics()
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g.drawImage(coarse, 0, 0, w, h, null)
        repeat(6) {
            g.color = Color(r.nextInt(256), r.nextInt(256), r.nextInt(256), 170 + r.nextInt(60))
            val ow = w / 5 + r.nextInt(w / 3)
            val oh = h / 5 + r.nextInt(h / 3)
            if (r.nextBoolean()) g.fillOval(r.nextInt(w), r.nextInt(h), ow, oh)
            else g.fillRect(r.nextInt(w), r.nextInt(h), ow, oh)
        }
        g.dispose()
        return withNoise(img, r)
    }

    /** 스크린샷 비슷하게: 평탄한 면이 넓고 경계가 또렷하다 */
    fun screenshot(seed: Long, w: Int = 1080, h: Int = 2340): BufferedImage {
        val r = Random(seed)
        val img = BufferedImage(w, h, BufferedImage.TYPE_INT_RGB)
        val g = img.createGraphics()
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g.color = if (r.nextBoolean()) Color.WHITE else Color(18, 20, 25)
        g.fillRect(0, 0, w, h)
        val dark = g.color == Color(18, 20, 25)
        val accent = Color(r.nextInt(200), r.nextInt(200), r.nextInt(200))
        var y = h / 12
        while (y < h - 200) {
            val cardH = 120 + r.nextInt(320)
            // 바탕이 밝으면 카드를 어둡게, 어두우면 밝게. 대비가 없으면 화면 전체가
            // 한 색이 되어 스크린샷이 아니라 색종이가 된다.
            g.color = when {
                r.nextInt(4) == 0 -> accent
                dark -> Color(150 + r.nextInt(80), 150 + r.nextInt(80), 155 + r.nextInt(80))
                else -> Color(60 + r.nextInt(80), 60 + r.nextInt(80), 70 + r.nextInt(80))
            }
            g.fillRoundRect(60, y, w - 120, cardH, 40, 40)
            g.color = if (dark) Color(40, 42, 48) else Color(225, 227, 233)
            var ty = y + 40
            while (ty < y + cardH - 40) {
                g.fillRoundRect(100, ty, (w - 260) * (40 + r.nextInt(60)) / 100, 26, 12, 12)
                ty += 56
            }
            y += cardH + 50
        }
        g.dispose()
        return img
    }

    /** 로고처럼 무늬가 거의 없는 그림 */
    fun plainLogo(seed: Long, size: Int = 512): BufferedImage {
        val r = Random(seed)
        val img = BufferedImage(size, size, BufferedImage.TYPE_INT_RGB)
        val g = img.createGraphics()
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g.color = Color(230 + r.nextInt(26), 230 + r.nextInt(26), 230 + r.nextInt(26))
        g.fillRect(0, 0, size, size)
        g.color = Color(r.nextInt(200), r.nextInt(200), r.nextInt(200))
        g.fillOval(size / 4, size / 4, size / 2, size / 2)
        g.dispose()
        return img
    }

    fun resized(src: BufferedImage, scale: Double): BufferedImage =
        scaled(src, (src.width * scale).toInt().coerceAtLeast(1), (src.height * scale).toInt().coerceAtLeast(1))

    fun scaled(src: BufferedImage, w: Int, h: Int): BufferedImage {
        val out = BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB)
        val g = out.createGraphics()
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
        g.drawImage(src, 0, 0, w, h, null)
        g.dispose()
        return out
    }

    /** 다시 저장하면서 그림이 조금 상하는 것까지 흉내 낸다 */
    fun recompressed(src: BufferedImage, quality: Float): BufferedImage {
        val flat = BufferedImage(src.width, src.height, BufferedImage.TYPE_INT_RGB)
        flat.createGraphics().apply {
            color = Color.WHITE
            fillRect(0, 0, src.width, src.height)
            drawImage(src, 0, 0, null)
            dispose()
        }
        val out = ByteArrayOutputStream()
        val writer = ImageIO.getImageWritersByFormatName("jpg").next()
        val param = writer.defaultWriteParam.apply {
            compressionMode = ImageWriteParam.MODE_EXPLICIT
            compressionQuality = quality
        }
        writer.output = ImageIO.createImageOutputStream(out)
        writer.write(null, IIOImage(flat, null, null), param)
        writer.dispose()
        return ImageIO.read(ByteArrayInputStream(out.toByteArray()))
    }

    fun tinted(src: BufferedImage, color: Color): BufferedImage {
        val out = BufferedImage(src.width, src.height, BufferedImage.TYPE_INT_RGB)
        val g = out.createGraphics()
        g.drawImage(src, 0, 0, null)
        g.color = color
        g.fillRect(0, 0, src.width, src.height)
        g.dispose()
        return out
    }

    private fun withNoise(img: BufferedImage, r: Random): BufferedImage {
        val px = IntArray(img.width * img.height)
        img.getRGB(0, 0, img.width, img.height, px, 0, img.width)
        for (i in px.indices) {
            val d = r.nextInt(13) - 6
            val cr = (((px[i] shr 16) and 0xFF) + d).coerceIn(0, 255)
            val cg = (((px[i] shr 8) and 0xFF) + d).coerceIn(0, 255)
            val cb = ((px[i] and 0xFF) + d).coerceIn(0, 255)
            px[i] = (cr shl 16) or (cg shl 8) or cb
        }
        img.setRGB(0, 0, img.width, img.height, px, 0, img.width)
        return img
    }
}
