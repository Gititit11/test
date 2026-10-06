package io.github.gititit11.gyeopsajin.data

import android.content.ContentResolver
import android.content.IntentSender
import android.net.Uri
import android.provider.MediaStore

/**
 * 사진을 지우는 유일한 길.
 *
 * 이 앱은 사진을 스스로 지우지 않는다 — 지울 수도 없다. 여기서 만드는 것은
 * 안드로이드에게 보내는 '이 사진들을 지워도 될지 사용자에게 물어봐 달라' 는 부탁이고,
 * 확인창을 띄우는 것도 실제로 지우는 것도 안드로이드가 한다. 사용자가 취소하면
 * 아무 일도 일어나지 않는다.
 */
object Trash {

    /**
     * 휴지통으로 보낸다. 기기에 따라 다르지만 보통 30일 동안 갤러리 앱의 휴지통에
     * 남아 있어 되돌릴 수 있다. 이 앱이 기본으로 권하는 방식이다.
     */
    fun requestTrash(resolver: ContentResolver, uris: Collection<Uri>): IntentSender =
        MediaStore.createTrashRequest(resolver, uris.toList(), true).intentSender

    /** 되돌릴 수 없이 지운다. 설정에서 일부러 골라야만 쓰인다. */
    fun requestDelete(resolver: ContentResolver, uris: Collection<Uri>): IntentSender =
        MediaStore.createDeleteRequest(resolver, uris.toList()).intentSender
}
