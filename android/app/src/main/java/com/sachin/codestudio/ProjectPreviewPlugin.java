package com.sachin.codestudio;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "ProjectPreview")
public class ProjectPreviewPlugin extends Plugin {
    private static final int MAX_PREVIEW_CHARACTERS = 1_000_000;
    private static final int MAX_PROJECT_FILES = 500;
    private static final int MAX_PROJECT_CHARACTERS = 8_000_000;
    private volatile ServerSocket projectServer;
    private volatile ExecutorService projectServerWorkers;
    private volatile Map<String, ProjectFile> servedFiles = Collections.emptyMap();
    private volatile String serverEntryPath;
    private volatile int serverVersion;

    @PluginMethod
    public void open(PluginCall call) {
        String html = call.getString("html");
        if (html == null || html.isEmpty()) {
            call.reject("The project preview is empty.");
            return;
        }
        if (html.length() > MAX_PREVIEW_CHARACTERS) {
            call.reject("The project preview is too large to open in another app.");
            return;
        }

        try {
            File previewDirectory = new File(getContext().getCacheDir(), "preview");
            if (!previewDirectory.isDirectory() && !previewDirectory.mkdirs()) {
                call.reject("Could not prepare a temporary project preview.");
                return;
            }

            File previewFile = new File(previewDirectory, "index.html");
            try (OutputStreamWriter writer = new OutputStreamWriter(
                new FileOutputStream(previewFile), StandardCharsets.UTF_8
            )) {
                writer.write(html);
            }

            Uri previewUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                previewFile
            );
            Intent viewIntent = new Intent(Intent.ACTION_VIEW);
            viewIntent.setDataAndType(previewUri, "text/html");
            viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(viewIntent, "Open project preview"));
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("No browser app is available to open the project preview.", error);
        } catch (IOException | IllegalArgumentException error) {
            call.reject("Could not open the project preview in another app.", error);
        }
    }

    @PluginMethod
    public void startServer(PluginCall call) {
        JSArray files = call.getArray("files");
        String entryPath = call.getString("entryPath");
        if (files == null || files.length() == 0 || files.length() > MAX_PROJECT_FILES ||
            entryPath == null || !isSafePath(entryPath)) {
            call.reject("The project preview has invalid files or an entry page.");
            return;
        }

        Map<String, ProjectFile> nextFiles = new HashMap<>();
        int totalCharacters = 0;
        try {
            for (int index = 0; index < files.length(); index++) {
                JSONObject item = files.getJSONObject(index);
                String path = item.optString("path", "");
                String content = item.optString("content", null);
                if (!isSafePath(path) || content == null || content.length() > MAX_PREVIEW_CHARACTERS) {
                    call.reject("A project file has an invalid path or is too large to serve.");
                    return;
                }
                totalCharacters += content.length();
                if (totalCharacters > MAX_PROJECT_CHARACTERS || nextFiles.containsKey(path) || "__codestudio".equals(path)) {
                    call.reject("The project is too large or contains duplicate file paths.");
                    return;
                }
                nextFiles.put(path, new ProjectFile(content, contentType(path)));
            }
        } catch (JSONException error) {
            call.reject("The project file list is invalid.", error);
            return;
        }
        if (!nextFiles.containsKey(entryPath) || !entryPath.toLowerCase().endsWith(".html") &&
            !entryPath.toLowerCase().endsWith(".htm")) {
            call.reject("The selected project entry page is missing or is not HTML.");
            return;
        }

        try {
            servedFiles = Collections.unmodifiableMap(nextFiles);
            serverEntryPath = entryPath;
            serverVersion++;
            if (projectServer == null || projectServer.isClosed()) {
                projectServer = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
                projectServerWorkers = Executors.newFixedThreadPool(4);
                ServerSocket server = projectServer;
                ExecutorService workers = projectServerWorkers;
                Thread acceptThread = new Thread(() -> acceptProjectRequests(server, workers), "CodeStudioLivePreview");
                acceptThread.setDaemon(true);
                acceptThread.start();
            }
            JSObject result = new JSObject();
            result.put("url", "http://127.0.0.1:" + projectServer.getLocalPort() + "/" + encodePath(entryPath));
            call.resolve(result);
        } catch (IOException error) {
            stopProjectServer();
            call.reject("Could not start the local project server.", error);
        }
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        stopProjectServer();
        call.resolve();
    }

    @PluginMethod
    public void openServer(PluginCall call) {
        String url = call.getString("url");
        ServerSocket server = projectServer;
        if (server == null || server.isClosed() || url == null ||
            !url.startsWith("http://127.0.0.1:" + server.getLocalPort() + "/")) {
            call.reject("The local project server is not running.");
            return;
        }
        try {
            Intent viewIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            getActivity().startActivity(Intent.createChooser(viewIntent, "Open live project"));
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("No browser app is available to open the live project.", error);
        }
    }

    private void acceptProjectRequests(ServerSocket server, ExecutorService workers) {
        while (!server.isClosed()) {
            try {
                Socket socket = server.accept();
                workers.execute(() -> serveProjectRequest(socket));
            } catch (IOException error) {
                if (!server.isClosed()) stopProjectServer();
            } catch (RuntimeException error) {
                stopProjectServer();
            }
        }
    }

    private void serveProjectRequest(Socket socket) {
        try (Socket connection = socket) {
            connection.setSoTimeout(5_000);
            BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.US_ASCII));
            String requestLine = reader.readLine();
            if (requestLine == null || requestLine.length() > 8_192) {
                writeResponse(connection, 400, "text/plain; charset=utf-8", "Bad request.", false);
                return;
            }
            String[] request = requestLine.split(" ", 3);
            if (request.length != 3 || !request[2].startsWith("HTTP/1.")) {
                writeResponse(connection, 400, "text/plain; charset=utf-8", "Bad request.", false);
                return;
            }
            for (int index = 0; index < 64; index++) {
                String header = reader.readLine();
                if (header == null || header.isEmpty()) break;
            }
            boolean headOnly = "HEAD".equals(request[0]);
            if (!headOnly && !"GET".equals(request[0])) {
                writeResponse(connection, 405, "text/plain; charset=utf-8", "Only GET and HEAD are supported.", headOnly);
                return;
            }
            String encodedPath = request[1].split("\\?", 2)[0];
            String decodedPath = URLDecoder.decode(encodedPath, "UTF-8");
            String path = normalizeRequestPath(decodedPath);
            if (path == null) {
                writeResponse(connection, 400, "text/plain; charset=utf-8", "Invalid project path.", headOnly);
                return;
            }
            if (path.isEmpty()) path = serverEntryPath;
            if ("__codestudio/version".equals(path)) {
                writeResponse(connection, 200, "application/json; charset=utf-8", Integer.toString(serverVersion), headOnly);
                return;
            }
            ProjectFile file = servedFiles.get(path);
            if (file == null) {
                writeResponse(connection, 404, "text/plain; charset=utf-8", "Project file not found.", headOnly);
                return;
            }
            String content = file.content;
            if (file.contentType.startsWith("text/html")) {
                content += "\n<script>(()=>{let v;const poll=async()=>{try{const r=await fetch('/__codestudio/version',{cache:'no-store'});const n=await r.text();if(v!==undefined&&n!==v)location.reload();v=n}catch{}};poll();setInterval(poll,1000)})();</script>\n";
            }
            writeResponse(connection, 200, file.contentType, content, headOnly);
        } catch (IOException | RuntimeException ignored) {
            // A browser may close a request during navigation or refresh.
        }
    }

    private void writeResponse(Socket socket, int status, String contentType, String text, boolean headOnly) throws IOException {
        byte[] body = text.getBytes(StandardCharsets.UTF_8);
        String reason = status == 200 ? "OK" : status == 404 ? "Not Found" : status == 405 ? "Method Not Allowed" : "Bad Request";
        OutputStream output = socket.getOutputStream();
        String headers = "HTTP/1.1 " + status + " " + reason + "\r\n" +
            "Content-Type: " + contentType + "\r\n" +
            "Content-Length: " + body.length + "\r\n" +
            "Cache-Control: no-store\r\n" +
            "X-Content-Type-Options: nosniff\r\n" +
            "Connection: close\r\n\r\n";
        output.write(headers.getBytes(StandardCharsets.US_ASCII));
        if (!headOnly) output.write(body);
        output.flush();
    }

    private String normalizeRequestPath(String path) {
        if (path == null || !path.startsWith("/") || path.contains("\\") || path.contains("\u0000")) return null;
        StringBuilder normalized = new StringBuilder();
        for (String segment : path.substring(1).split("/", -1)) {
            if (segment.isEmpty() || ".".equals(segment)) continue;
            if ("..".equals(segment) || segment.indexOf(':') >= 0) return null;
            if (normalized.length() > 0) normalized.append('/');
            normalized.append(segment);
        }
        return normalized.toString();
    }

    private boolean isSafePath(String path) {
        if (path == null || path.isEmpty() || path.length() > 160 || path.startsWith("/") || path.contains("\\") ||
            path.indexOf(':') >= 0 || path.indexOf('\u0000') >= 0) return false;
        for (String segment : path.split("/", -1)) if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) return false;
        return true;
    }

    private String encodePath(String path) throws IOException {
        StringBuilder encoded = new StringBuilder();
        for (String segment : path.split("/")) {
            if (encoded.length() > 0) encoded.append('/');
            encoded.append(URLEncoder.encode(segment, "UTF-8").replace("+", "%20"));
        }
        return encoded.toString();
    }

    private String contentType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (lower.endsWith(".json") || lower.endsWith(".map")) return "application/json; charset=utf-8";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".xml")) return "application/xml; charset=utf-8";
        if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain; charset=utf-8";
        return "application/octet-stream";
    }

    private synchronized void stopProjectServer() {
        ServerSocket server = projectServer;
        projectServer = null;
        servedFiles = Collections.emptyMap();
        serverEntryPath = null;
        serverVersion++;
        if (server != null) {
            try {
                server.close();
            } catch (IOException ignored) {
                // The server is already stopping.
            }
        }
        ExecutorService workers = projectServerWorkers;
        projectServerWorkers = null;
        if (workers != null) workers.shutdownNow();
    }

    private static final class ProjectFile {
        final String content;
        final String contentType;

        ProjectFile(String content, String contentType) {
            this.content = content;
            this.contentType = contentType;
        }
    }
}
