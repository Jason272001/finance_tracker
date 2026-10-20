package com.keeperbma.mobile;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** User-selected CSV export via Android's document picker; no storage permission. */
@CapacitorPlugin(name = "ReportExport")
public class ReportExportPlugin extends Plugin {
    @PluginMethod
    public void saveCsv(PluginCall call) {
        String csv = call.getString("csv");
        String name = call.getString("filename", "keeperbma-report.csv");
        if (csv == null || csv.length() > 10000000) {
            call.reject("Report is missing or too large to export.");
            return;
        }
        name = name.replaceAll("[^a-zA-Z0-9._-]", "_");
        if (!name.endsWith(".csv")) name += ".csv";
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("text/csv");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(call, intent, "reportSelected");
        } catch (Exception error) {
            call.reject("Could not open the document picker.", error);
        }
    }

    @ActivityCallback
    private void reportSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (uri == null) {
            call.reject("No export location was selected.");
            return;
        }
        getBridge().execute(() -> {
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (stream == null) throw new java.io.IOException("Unable to open export location.");
                stream.write(call.getString("csv", "").getBytes(StandardCharsets.UTF_8));
                stream.flush();
                call.resolve();
            } catch (Exception error) {
                call.reject("Could not save the report.", error);
            }
        });
    }
}
