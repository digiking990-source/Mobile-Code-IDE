package com.sachin.codestudio;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ProjectPreviewPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
