package io.github.gititit11.gyeopsajin.ui

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 용량을 사람이 읽는 말로. 1.2GB, 340MB, 820KB 처럼.
 * 1000 으로 나눈다 — 안드로이드 설정의 저장공간 화면이 쓰는 방식과 맞춘다.
 */
fun formatBytes(bytes: Long): String = when {
    bytes >= 1_000_000_000L -> String.format(Locale.US, "%.1fGB", bytes / 1_000_000_000.0)
    bytes >= 100_000_000L -> "${bytes / 1_000_000}MB"
    bytes >= 1_000_000L -> String.format(Locale.US, "%.1fMB", bytes / 1_000_000.0)
    bytes >= 1_000L -> "${bytes / 1_000}KB"
    else -> "${bytes}B"
}

/** 3024x4032 를 1220만 화소로 */
fun formatPixels(width: Int, height: Int): String {
    val mp = width.toLong() * height / 10_000L   // 만 화소
    return if (mp >= 100) "${mp / 100}.${(mp % 100) / 10}천만 화소" else "${mp}만 화소"
}

fun formatDate(millis: Long): String =
    if (millis <= 0) "날짜 모름"
    else SimpleDateFormat("yyyy.MM.dd", Locale.KOREA).format(Date(millis))
