package io.github.gititit11.digitama;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/**
 * APK 에 넣은 웹앱을 띄운다.
 *
 * 파일을 file:// 로 열면 localStorage 와 카메라가 막히는 경우가 있어서,
 * WebViewAssetLoader 로 https://appassets.androidplatform.net/assets/ 주소에 얹어 연다.
 */
public class MainActivity extends Activity {
    private static final String START = "https://appassets.androidplatform.net/assets/index.html";
    private static final int CAMERA_REQUEST = 1;

    private WebView web;
    private PermissionRequest pendingCamera;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0F1115);
        setContentView(web);

        final WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);           // 키우는 디지몬은 localStorage 에 저장된다
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        // 웹앱이 '앱 안에서 도는 중' 을 알 수 있게 한다 (서비스 워커를 끈다)
        s.setUserAgentString(s.getUserAgentString() + " DigitamaApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return assets.shouldInterceptRequest(req.getUrl());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest req) {
                if (Build.VERSION.SDK_INT < 23 ||
                        checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    req.grant(req.getResources());
                } else {
                    pendingCamera = req;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
                }
            }
        });

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(START);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code != CAMERA_REQUEST || pendingCamera == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            pendingCamera.grant(pendingCamera.getResources());
        } else {
            pendingCamera.deny();
        }
        pendingCamera = null;
    }

    // 뒤로 가기는 웹앱의 화면(도감·배틀 등)을 먼저 닫는다
    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }
}
