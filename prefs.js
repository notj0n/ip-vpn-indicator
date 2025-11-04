import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class IPVPNPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    // Create a preferences page
    const page = new Adw.PreferencesPage({
      title: "General",
      icon_name: "dialog-information-symbolic",
    });
    window.add(page);

    // Create a preferences group
    const group = new Adw.PreferencesGroup({
      title: "Network Detection",
      description: "Configure how the extension detects your network",
    });
    page.add(group);

    // Create the test IP row
    const row = new Adw.EntryRow({
      title: "Test IP Address",
    });
    group.add(row);

    // Bind the setting
    settings.bind("test-ip", row, "text", Gio.SettingsBindFlags.DEFAULT);

    // Add some helper text
    const helperRow = new Adw.ActionRow({
      title: "Common Options",
      subtitle: "1.1.1.1 (Cloudflare)\n8.8.8.8 (Google DNS)\n9.9.9.9 (Quad9)",
    });
    group.add(helperRow);
  }
}
