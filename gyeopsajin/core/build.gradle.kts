plugins {
    id("org.jetbrains.kotlin.jvm")
    `java-library`
}

/*
 * 같고 다름을 판단하는 부분은 안드로이드를 모른다.
 *
 * 이렇게 떼어 놓은 이유는 검사 때문이다. 안드로이드 모듈의 검사는 android.jar 를
 * 기준으로 컴파일되는데, 거기에는 java.awt 도 javax.imageio 도 없다. 그래서 진짜
 * 이미지를 만들어 줄이고 다시 저장해 보는 — 이 앱이 하겠다고 한 바로 그 일을 —
 * 검사할 수가 없다. 순수 자바 모듈로 두면 폰도 에뮬레이터도 없이 그 검사를 돌린다.
 */
java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}

tasks.withType<Test>().configureEach {
    // 검사가 사진을 여러 장 만들어 들고 있는다. 기본 힙으로는 모자란다.
    maxHeapSize = "2g"
}
